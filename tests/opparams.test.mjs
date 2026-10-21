// opparams 组：验证「算子参数真实影响结果」，杜绝假控件。
// 策略：对每个有参数的算子，用两组不同参数跑同一输入，断言产物真实不同
//      （字节/尺寸/材质/属性级别），再做后验；并断言非法参数被拒绝。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { runOps, OPS } from '../backend/ops/index.mjs';
import { OP_SCHEMA, getOpParams, withDefaults, validateSchema } from '../backend/ops/schema.mjs';
import { PIPELINE_PRESETS, validatePresets } from '../backend/ops/presets.mjs';
import { verifyPair } from '../backend/verify.mjs';
import { analyzeBuffer } from '../backend/analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'assets', 'raw', 'sheng.glb');
const rawSha = crypto.createHash('sha256').update(fs.readFileSync(RAW)).digest('hex');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

const tmpOut = path.join(ROOT, 'test-out', 'opparams-' + Date.now());
fs.mkdirSync(tmpOut, { recursive: true });

// 构造含「近似重复顶点」的测试 GLB：两个三角形共享一条边，
// 但共享边的两个顶点各自重复一份，偏移量 delta。
async function makeDuplicateGlb(file, delta) {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const doc = new Document();
  const buf = doc.createBuffer();
  // A(0,0,0) B(1,0,0) C(1,1,0) / A'(0,delta,0) C'(1+delta,1,0)
  const pos = doc.createAccessor('POSITION')
    .setType('VEC3')
    .setArray(new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0 + delta, 0 + delta, 0,
      1 + delta, 1, 0,
    ]))
    .setBuffer(buf);
  const idx = doc.createAccessor('indices')
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 3, 1, 4]))
    .setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx);
  const mesh = doc.createMesh('quad').addPrimitive(prim);
  const node = doc.createNode('quad').setMesh(mesh);
  doc.createScene('s').addChild(node);
  const io = new NodeIO();
  await io.write(file, doc);
  return file;
}

// 读取输出 GLB 的某个 accessor 数组
async function readAttr(file, sem) {
  const { loadGLB } = await import('../backend/ops/glbWrite.mjs');
  const { readAccessor } = await import('../tools/glbkit.mjs');
  const { json } = loadGLB(fs.readFileSync(file));
  const prim = json.meshes?.[0]?.primitives?.[0];
  const ai = prim?.attributes?.[sem];
  if (ai === undefined) return null;
  return Array.from(readAccessor(json, ai).data);
}

// 跑一组 ops，返回 { outPath, results, bytes }
async function run(ops, tag) {
  const dir = path.join(tmpOut, tag);
  fs.mkdirSync(dir, { recursive: true });
  return runOps({ inPath: RAW, outDir: dir, ops });
}

console.log('[1] schema 与算子注册表一致性');
const opNames = Object.keys(OPS);
const schemaNames = Object.keys(OP_SCHEMA);
check('每个算子都有参数声明', opNames.every((n) => schemaNames.includes(n)), `缺: ${opNames.filter((n) => !schemaNames.includes(n))}`);
check('声明未引用不存在的算子', schemaNames.every((n) => opNames.includes(n)), `多: ${schemaNames.filter((n) => !opNames.includes(n))}`);
check('声明总数匹配', opNames.length === schemaNames.length, `${opNames.length} vs ${schemaNames.length}`);
for (const [name, meta] of Object.entries(OP_SCHEMA)) {
  const okType = ['geometry', 'material', 'texture', 'container'].includes(meta.group);
  if (!okType) check(`算子 ${name} 的 group 合法`, false, meta.group);
}
check('全部 group 合法', Object.values(OP_SCHEMA).every((m) => ['geometry', 'material', 'texture', 'container'].includes(m.group)));

console.log('[2] 无参数算子不应出现控件');
const noParamOps = schemaNames.filter((n) => Object.keys(getOpParams(n)).length === 0);
check('无参数算子集合符合预期',
  noParamOps.sort().join(',') === ['dedup', 'fixNormalsOrientation', 'prune', 'setSampler', 'textureReport'].sort().join(','),
  noParamOps.join(','));

console.log('[3] weld.epsilon 真实影响结果');
const dupFile = path.join(tmpOut, 'dup.glb');
await makeDuplicateGlb(dupFile, 0.004);
const weldTight = await runOps({ inPath: dupFile, outDir: path.join(tmpOut, 'w0'), ops: [{ op: 'weld', params: { epsilon: 0 } }] });
const weldLoose = await runOps({ inPath: dupFile, outDir: path.join(tmpOut, 'w1'), ops: [{ op: 'weld', params: { epsilon: 0.02 } }] });
const vTight = weldTight.results[0].metrics.after.verts;
const vLoose = weldLoose.results[0].metrics.after.verts;
check('epsilon=0 不合并近似顶点（保留 5）', vTight === 5, `got ${vTight}`);
// 5 顶点中：A'≈A、C'≈C 落在同一量化格 → 合并为 3 个唯一点（A/B/C）
check('epsilon=0.02 真实合并近似顶点（5→3）', vLoose === 3, `got ${vLoose}`);
check('容差越大合并越多', vLoose < vTight);
const wv = await verifyPair({ beforePath: dupFile, afterPath: weldLoose.outPath, opName: 'weld', params: { epsilon: 0.02 } });
check('weld 后验通过', wv.pass === true, JSON.stringify(wv.checks?.filter((c) => !c.ok)));

console.log('[4] simplify 参数真实影响面数');
const s1 = await run([{ op: 'simplify', params: { ratio: 1.0, error: 0.0001 } }], 's1');
const s2 = await run([{ op: 'simplify', params: { ratio: 0.25, error: 0.001 } }], 's2');
const t1 = s1.results[0].metrics.after.tris;
const t2 = s2.results[0].metrics.after.tris;
check('ratio=1.0 面数基本保持', t1 >= 47512 * 0.98, `got ${t1}`);
check('ratio=0.25 面数显著下降', t2 < t1 * 0.6, `${t1} -> ${t2}`);

console.log('[4b] error 参数真实影响减面强度');
const e1 = await run([{ op: 'simplify', params: { ratio: 0.5, error: 0.00001 } }], 'e1');
const e2 = await run([{ op: 'simplify', params: { ratio: 0.5, error: 0.05 } }], 'e2');
const te1 = e1.results[0].metrics.after.tris;
const te2 = e2.results[0].metrics.after.tris;
check('error 越大保留面越少', te2 <= te1, `error=1e-5 → ${te1} tris, error=0.05 → ${te2} tris`);

console.log('[5] genNormals.hardAngle 真实影响法线');
const n1 = await run([{ op: 'genNormals', params: { hardAngle: 180 } }], 'n180');
const n2 = await run([{ op: 'genNormals', params: { hardAngle: 1 } }], 'n1');
const a1 = await readAttr(n1.outPath, 'NORMAL');
const a2 = await readAttr(n2.outPath, 'NORMAL');
check('两者都生成了 NORMAL', !!a1 && !!a2);
check('法线长度一致', a1.length === a2.length, `${a1.length} vs ${a2.length}`);
let maxDiff = 0;
for (let i = 0; i < a1.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a1[i] - a2[i]));
check('硬边角度确实改变法线结果', maxDiff > 1e-6, `maxDiff=${maxDiff}`);

console.log('[6] textureResize.maxSize 真实影响贴图');
const r1 = await run([{ op: 'textureResize', params: { maxSize: 2048 } }], 'r2048');
const r2 = await run([{ op: 'textureResize', params: { maxSize: 256 } }], 'r256');
const rep1 = await analyzeBuffer('a.glb', fs.readFileSync(r1.outPath), 'glb');
const rep2 = await analyzeBuffer('b.glb', fs.readFileSync(r2.outPath), 'glb');
const w1 = Math.max(...rep1.textures.map((t) => t.width || 0));
const w2 = Math.max(...rep2.textures.map((t) => t.width || 0));
check('maxSize=2048 不改变 2048 贴图', w1 === 2048, `got ${w1}`);
check('maxSize=256 真实缩到 256', w2 === 256, `got ${w2}`);
const b1 = fs.statSync(r1.outPath).size, b2 = fs.statSync(r2.outPath).size;
check('缩放后文件体积显著减小', b2 < b1 * 0.7, `${b1} -> ${b2}`);

console.log('[7] textureCompress 格式与质量真实生效');
const c1 = await run([{ op: 'textureCompress', params: { format: 'webp', quality: 30 } }], 'cw30');
const c2 = await run([{ op: 'textureCompress', params: { format: 'jpeg', quality: 95 } }], 'cj95');
const m1 = await analyzeBuffer('c1.glb', fs.readFileSync(c1.outPath), 'glb');
const m2 = await analyzeBuffer('c2.glb', fs.readFileSync(c2.outPath), 'glb');
check('webp 产物 mimeType=image/webp', (m1.textures[0]?.mimeType || '').includes('webp'), JSON.stringify(m1.textures[0]));
check('jpeg 产物 mimeType=image/jpeg', (m2.textures[0]?.mimeType || '').includes('jpeg'), JSON.stringify(m2.textures[0]));
check('低质量体积更小', fs.statSync(c1.outPath).size < fs.statSync(c2.outPath).size,
  `webp30=${fs.statSync(c1.outPath).size} jpeg95=${fs.statSync(c2.outPath).size}`);

console.log('[8] fixMaterials 参数真实生效');
const f1 = await run([{ op: 'fixMaterials', params: { metallicFactor: 0, roughnessFactor: 1 } }], 'f0');
const f2 = await run([{ op: 'fixMaterials', params: { metallicFactor: 0.85, roughnessFactor: 0.3 } }], 'f85');
const mf1 = await analyzeBuffer('m1.glb', fs.readFileSync(f1.outPath), 'glb');
const mf2 = await analyzeBuffer('m2.glb', fs.readFileSync(f2.outPath), 'glb');
check('metallicFactor=0 生效', mf1.materials[0].metallicFactor === 0, JSON.stringify(mf1.materials[0]));
check('metallicFactor=0.85 生效', Math.abs(mf2.materials[0].metallicFactor - 0.85) < 1e-6, JSON.stringify(mf2.materials[0]));

console.log('[9] quantize 精度参数真实影响体积');
const q1 = await run([{ op: 'quantize', params: { quantizePosition: 8, quantizeNormal: 8, quantizeTexcoord: 8, quantizationVolume: 'mesh' } }], 'q8');
const q2 = await run([{ op: 'quantize', params: { quantizePosition: 16, quantizeNormal: 16, quantizeTexcoord: 16, quantizationVolume: 'mesh' } }], 'q16');
check('8bit 量化体积小于 16bit', fs.statSync(q1.outPath).size < fs.statSync(q2.outPath).size,
  `8bit=${fs.statSync(q1.outPath).size} 16bit=${fs.statSync(q2.outPath).size} raw=${fs.statSync(RAW).size}`);

console.log('[10] convert 目标格式真实生效');
const v1 = await run([{ op: 'convert', params: { to: 'obj' } }], 'vobj');
const v2 = await run([{ op: 'convert', params: { to: 'gltf' } }], 'vgltf');
check('to=obj 产出 .obj', v1.outPath.endsWith('.obj'), v1.outPath);
check('to=gltf 产出 .gltf', v2.outPath.endsWith('.gltf'), v2.outPath);

console.log('[11] 非法参数必须被拒绝（不静默忽略）');
function rejects(name, params) {
  try { validateSchema(name, params); return false; }
  catch (e) { return e.status === 400; }
}
check('simplify.ratio=5 被拒', rejects('simplify', { ratio: 5, error: 0.001 }));
check('simplify.ratio=0 被拒（须 >0）', rejects('simplify', { ratio: 0 }));
check('textureResize.maxSize=1 被拒', rejects('textureResize', { maxSize: 1 }));
check('textureResize.maxSize=1024.5 被拒（非整数）', rejects('textureResize', { maxSize: 1024.5 }));
check('convert.to=fbx 被拒（不可导出）', rejects('convert', { to: 'fbx' }));
check('genNormals.hardAngle=200 被拒', rejects('genNormals', { hardAngle: 200 }));
check('未知参数被拒', rejects('weld', { epsilon: 1e-5, nope: 1 }));
check('合法参数不被误拒', (() => {
  try { validateSchema('weld', { epsilon: 0.01 }); return true; } catch { return false; }
})());
check('缺失参数补全默认值', withDefaults('simplify', {}).ratio === 0.5 && withDefaults('simplify', {}).error === 0.001);

console.log('[12] 预设自检：全部算子与参数必须合法');
const presetErrors = validatePresets();
check('预设自检通过', presetErrors.length === 0, presetErrors.join('; '));
for (const p of PIPELINE_PRESETS) {
  const ids = p.ops.map((o) => o.op);
  check(`预设 ${p.id} 只引用已知算子`, ids.every((n) => opNames.includes(n)), ids.join(','));
}
check('预设均可被 schema 接受', PIPELINE_PRESETS.every((p) => p.ops.every(({ op, params }) => {
  try { validateSchema(op, params); return true; } catch { return false; }
})));

console.log('[13] 端到端：真实执行 weld+genNormals+fixMaterials 并后验');
const e2e = await run([
  { op: 'weld', params: { epsilon: 1e-5 } },
  { op: 'genNormals', params: { hardAngle: 180 } },
  { op: 'fixMaterials', params: { metallicFactor: 0, roughnessFactor: 1 } },
], 'e2e');
check('链长 3', e2e.results.length === 3);
check('每步都产生了变化说明', e2e.results.every((r) => Array.isArray(r.changes)));
check('产物存在', fs.existsSync(e2e.outPath));
check('原始素材未被修改', crypto.createHash('sha256').update(fs.readFileSync(RAW)).digest('hex') === rawSha);

console.log(`\nopparams: ${pass} passed, ${fail} failed`);
if (fail) { console.log('失败项:', failures.join(', ')); process.exit(1); }
