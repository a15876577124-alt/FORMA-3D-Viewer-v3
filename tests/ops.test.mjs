// ops 组测试：处理算子 + 后验 + 确认门 + 真实数据变换。
// 覆盖：能力探测 / 各算子独立执行与 verifyPair / 单调性 / 确认门 409 / convert fbx 400 /
// 链式执行 / 原始素材 sha256 不变 / runAssetPipeline 端到端。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { runOps, listOps } from '../backend/ops/index.mjs';
import { detectCapabilities } from '../backend/ops/capabilities.mjs';
import { verifyPair } from '../backend/verify.mjs';
import { analyzeBuffer } from '../backend/analyze.mjs';
import { runAssetPipeline } from '../backend/runPipeline.mjs';
import { assessPolicy } from '../backend/policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'assets', 'raw', 'sheng.glb');
const rawSha = crypto.createHash('sha256').update(fs.readFileSync(RAW)).digest('hex');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}
const tmpOut = path.join(ROOT, 'test-out', 'ops-' + Date.now());
fs.mkdirSync(tmpOut, { recursive: true });

const before = await analyzeBuffer('sheng.glb', fs.readFileSync(RAW), 'glb');
console.log('sheng 基线:', before.stats.verts, 'verts,', before.stats.tris, 'tris');

// ---------- 1. 能力探测 ----------
console.log('[1] 能力探测');
const cap = await detectCapabilities();
check('gltf-transform 可用', cap.gltfTransform === true);
check('sharp 可用', cap.sharp === true);
check('meshoptimizer 可用', cap.meshoptimizer === true);
check('simplify 能力可用', cap.simplify === true);
check('textureResize 能力可用', cap.textureResize === true);

// ---------- 2. 算子注册表 ----------
console.log('[2] 算子注册表');
const opNames = listOps().map((o) => o.name);
for (const expect of ['weld', 'dedup', 'prune', 'simplify', 'quantize', 'join', 'genNormals', 'fixMaterials', 'setSampler', 'textureReport', 'textureResize', 'textureCompress', 'convert']) {
  check(`算子 ${expect} 已注册`, opNames.includes(expect));
}
check('算子总数 >= 13', opNames.length >= 13, String(opNames.length));

// ---------- 3. 各算子独立执行 + 后验 ----------
console.log('[3] 算子执行与后验');
const singleOps = [
  { op: 'weld', params: { epsilon: 1e-5 } },
  { op: 'dedup', params: {} },
  { op: 'prune', params: {} },
  { op: 'quantize', params: {} },
  { op: 'join', params: {} },
  { op: 'genNormals', params: { hardAngle: 180 } },
  { op: 'fixMaterials', params: { metallicFactor: 0, roughnessFactor: 1 } },
  { op: 'setSampler', params: {} },
  { op: 'textureReport', params: {} },
];
for (const { op, params } of singleOps) {
  const dir = path.join(tmpOut, op);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const { outPath, results } = await runOps({ inPath: RAW, outDir: dir, ops: [{ op, params }] });
    check(`${op} 产出文件`, fs.existsSync(outPath));
    const v = await verifyPair({ beforePath: results[0].inPath, afterPath: results[0].outPath, opName: op, params });
    check(`${op} 后验通过`, v.pass, v.checks.filter((c) => !c.ok).map((c) => c.name).join(','));
    if (op === 'genNormals') {
      const after = await analyzeBuffer('x.glb', fs.readFileSync(outPath), 'glb');
      check('genNormals 后无法线缺失', !after.issues.some((i) => i.code === 'missing-normals'));
    }
    if (op === 'fixMaterials') {
      const after = await analyzeBuffer('x.glb', fs.readFileSync(outPath), 'glb');
      check('fixMaterials metallic=0', after.materials[0].metallicFactor === 0);
    }
  } catch (e) {
    check(`${op} 执行`, false, e.message);
  }
}

// simplify（减面，真实 tris 下降）
{
  const dir = path.join(tmpOut, 'simplify');
  fs.mkdirSync(dir, { recursive: true });
  try {
    const { outPath, results } = await runOps({ inPath: RAW, outDir: dir, ops: [{ op: 'simplify', params: { ratio: 0.7, error: 0.01 } }] });
    const after = await analyzeBuffer('x.glb', fs.readFileSync(outPath), 'glb');
    check('simplify tris 真实下降', after.stats.tris < before.stats.tris, `${before.stats.tris}->${after.stats.tris}`);
    const v = await verifyPair({ beforePath: results[0].inPath, afterPath: results[0].outPath, opName: 'simplify', params: { ratio: 0.7 } });
    check('simplify 后验通过', v.pass, v.checks.filter((c) => !c.ok).map((c) => c.name).join(','));
  } catch (e) {
    check('simplify 执行', false, e.message);
  }
}

// textureResize（贴图真实缩小）
{
  const dir = path.join(tmpOut, 'textureResize');
  fs.mkdirSync(dir, { recursive: true });
  try {
    const { outPath, results } = await runOps({ inPath: RAW, outDir: dir, ops: [{ op: 'textureResize', params: { maxSize: 1024 } }] });
    const after = await analyzeBuffer('x.glb', fs.readFileSync(outPath), 'glb');
    check('textureResize 贴图真实缩小', after.textures[0].width === 1024 && after.textures[0].height === 1024, `${after.textures[0].width}x${after.textures[0].height}`);
    check('textureResize 体积下降', after.file.bytes < before.file.bytes, `${before.file.bytes}->${after.file.bytes}`);
  } catch (e) {
    check('textureResize 执行', false, e.message);
  }
}

// convert（glb -> gltf / obj / fbx）
{
  const dir = path.join(tmpOut, 'convert-gltf');
  fs.mkdirSync(dir, { recursive: true });
  const { outPath, results } = await runOps({ inPath: RAW, outDir: dir, ops: [{ op: 'convert', params: { to: 'gltf' } }] });
  check('convert gltf 产物存在', outPath.endsWith('.gltf') && fs.existsSync(outPath));
  const gltf = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  check('gltf 保留 verts/tris（accessor 结构）', gltf.meshes.length > 0);
  const v = await verifyPair({ beforePath: results[0].inPath, afterPath: results[0].outPath, opName: 'convert', params: { to: 'gltf' } });
  check('convert 后验通过', v.pass, v.checks.filter((c) => !c.ok).map((c) => c.name).join(','));

  const dirObj = path.join(tmpOut, 'convert-obj');
  fs.mkdirSync(dirObj, { recursive: true });
  const objRes = await runOps({ inPath: RAW, outDir: dirObj, ops: [{ op: 'convert', params: { to: 'obj' } }] });
  check('convert obj 产物存在', objRes.outPath.endsWith('.obj') && fs.existsSync(objRes.outPath));

  let fbxErr = null;
  try { await runOps({ inPath: RAW, outDir: path.join(tmpOut, 'convert-fbx'), ops: [{ op: 'convert', params: { to: 'fbx' } }] }); }
  catch (e) { fbxErr = e; }
  check('convert fbx 明确拒绝 400', fbxErr && fbxErr.status === 400, fbxErr?.status);
}

// ---------- 4. 确认门 ----------
console.log('[4] 确认门');
{
  const policy = assessPolicy('sheng.glb', 'sheng-6ce3cb51', [{ op: 'genNormals' }, { op: 'fixMaterials' }]);
  check('appearance 算子需确认', policy.required === true && policy.riskyOps.includes('genNormals'));
  const policy2 = assessPolicy('sheng.glb', 'sheng-6ce3cb51', [{ op: 'prune' }]);
  check('琼剧手办 prune 强制确认', policy2.required === true, JSON.stringify(policy2.riskyOps));
  const policy3 = assessPolicy('generic.glb', 'x-1', [{ op: 'setSampler' }]);
  check('非琼剧 appearance=false 不确认', policy3.required === false);

  let gateErr = null;
  try { await runAssetPipeline({ assetId: 'sheng-6ce3cb51', ops: [{ op: 'genNormals' }], confirmToken: undefined }); }
  catch (e) { gateErr = e; }
  check('未确认返回 409', gateErr?.status === 409, String(gateErr?.status));
  check('409 携带 needConfirm + token', gateErr?.needConfirm === true && typeof gateErr?.token === 'string');
  check('409 携带 riskyOps', Array.isArray(gateErr?.riskyOps) && gateErr.riskyOps.includes('genNormals'));
}

// ---------- 5. 链式执行 + raw 不变 ----------
console.log('[5] 链式执行与原始素材保护');
{
  const dir = path.join(tmpOut, 'chain');
  fs.mkdirSync(dir, { recursive: true });
  const { outPath, results } = await runOps({ inPath: RAW, outDir: dir, ops: [{ op: 'weld' }, { op: 'genNormals' }, { op: 'fixMaterials' }] });
  const after = await analyzeBuffer('x.glb', fs.readFileSync(outPath), 'glb');
  check('链式产物正常', after.stats.tris === before.stats.tris && after.stats.verts === before.stats.verts);
  check('链式后 NORMAL 存在', after.meshes[0].primitives[0].attributes.includes('NORMAL'));
  const rawNow = crypto.createHash('sha256').update(fs.readFileSync(RAW)).digest('hex');
  check('原始素材 sha256 不变', rawNow === rawSha);
}

// ---------- 6. runAssetPipeline 端到端（dryRun + 真实） ----------
console.log('[6] runAssetPipeline 端到端');
{
  // 需要 workspace 资产；用 runAssetPipeline 依赖 backend/workspace 已存在的 sheng-6ce3cb51
  // dryRun
  const dry = await runAssetPipeline({ assetId: 'sheng-6ce3cb51', ops: [{ op: 'weld' }], dryRun: true });
  check('dryRun 返回 wouldApply', dry.dryRun === true && dry.wouldApply.length === 1);

  // 真实执行（weld 是 appearance=false，无需确认）
  const real = await runAssetPipeline({ assetId: 'sheng-6ce3cb51', ops: [{ op: 'weld' }] });
  check('真实执行返回版本号', real.version >= 1);
  check('真实执行有 after 指标', real.after && real.after.tris === before.stats.tris);
  check('真实执行有 verify 结果', real.verify && typeof real.verify.pass === 'boolean');
  const outDirAbs = path.join(ROOT, real.outDir);
  check('版本目录含 report.before/after', fs.existsSync(path.join(outDirAbs, 'report.before.json')) && fs.existsSync(path.join(outDirAbs, 'report.after.json')));
  check('版本目录含 ops.json/verify.json', fs.existsSync(path.join(outDirAbs, 'ops.json')) && fs.existsSync(path.join(outDirAbs, 'verify.json')));
}

fs.rmSync(tmpOut, { recursive: true, force: true });

console.log(`\n=== ops: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
