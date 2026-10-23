// 后验：处理产物的结构校验 + 切片哈希 + 重解析 + 单调性断言。
// 铁律：后验基于真实解析，禁止虚构通过。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseGLB } from '../tools/glbkit.mjs';
import { analyzeFile } from './analyze.mjs';
import { validateGltf } from './validateGltf.mjs';
import { validateFile } from './validate.mjs';

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// 提取 GLB 中各 primitive 的 POSITION/indices/TEXCOORD_0 语义数据哈希。
function semanticHashes(buf) {
  const { json, bin } = parseGLB(buf);
  json.__bin = bin;
  const out = { POSITION: [], indices: [], TEXCOORD_0: [] };
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      for (const key of ['POSITION', 'indices', 'TEXCOORD_0']) {
        const accIdx = key === 'indices' ? prim.indices : prim.attributes?.[key];
        if (accIdx === undefined) continue;
        const acc = json.accessors[accIdx];
        if (!acc || acc.sparse) { out[key].push(`unreadable:${accIdx}`); continue; }
        const bv = json.bufferViews[acc.bufferView];
        const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] || 1;
        const cSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType] || 1;
        const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const len = acc.count * nComp * cSize;
        out[key].push(sha(bin.subarray(start, start + len)));
      }
    }
  }
  return out;
}

// 贴图字节哈希（bufferView 切片）
function imageHashes(buf) {
  const { json, bin } = parseGLB(buf);
  const out = [];
  for (const img of json.images || []) {
    if (img.bufferView === undefined) { out.push('uri'); continue; }
    const bv = json.bufferViews[img.bufferView];
    const start = bv.byteOffset || 0;
    out.push(sha(bin.subarray(start, start + bv.byteLength)));
  }
  return out;
}

// 字节级保持 POSITION/indices 的算子（append-only / 纯 JSON / 只改贴图）——切片哈希必须一致
const BYTE_PRESERVING = new Set(['fixMaterials', 'setSampler', 'textureReport', 'genNormals', 'textureResize', 'textureCompress']);
// 几何语义保持（顶点/三角形拓扑不变，但存储可能重排）——bounds 尺寸不得漂移
const SEMANTIC_PRESERVING = new Set([...BYTE_PRESERVING, 'dedup', 'prune', 'join', 'weld']);
// 不改变贴图字节的算子
const TEXTURE_PRESERVING = new Set(['weld', 'join', 'genNormals', 'fixMaterials', 'setSampler', 'quantize', 'textureReport']);

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// 不同算子对顶点位置引入的合理漂移上限。
// weld 会按容差移动顶点；quantize 会按位数量化位置 —— 二者都会让包围盒
// 出现亚百分比级变化，这属于正常结果，不算「几何漂移」。
function boundsSlack(opName, params, size) {
  const base = 1e-4;
  if (opName === 'weld') return base + (params.epsilon ?? 0);
  if (opName === 'quantize') {
    const bits = params.quantizePosition ?? 14;
    return base + (Math.max(...size) / 2 ** bits) * 2;
  }
  return base;
}

export async function verifyPair({ beforePath, afterPath, opName, params = {} }) {
  const beforeBuf = fs.readFileSync(beforePath);
  const afterBuf = fs.readFileSync(afterPath);
  const checks = [];

  // 1. 容器/魔数校验（after 必须是合法 GLB / GLTF / OBJ）
  try {
    const v = validateFile(path.basename(afterPath), afterBuf);
    checks.push({ name: 'container.magic', ok: ['glb', 'gltf', 'obj'].includes(v.format), detail: v.format });
  } catch (e) {
    checks.push({ name: 'container.magic', ok: false, detail: e.message });
  }

  // Conversion must also satisfy the official format validator; rendering is tested separately.
  if (opName === 'convert' && /\.(glb|gltf)$/i.test(afterPath)) {
    try { const report = await validateGltf(afterPath); checks.push({name:'gltf.validator',ok:report.issues.numErrors===0,detail:report.issues}); }
    catch(e){checks.push({name:'gltf.validator',ok:false,detail:String(e)});}
  }

  // 2. 重解析 + 无 error 级 issue
  let beforeReport = null, afterReport = null;
  try {
    beforeReport = await analyzeFile(beforePath);
    afterReport = await analyzeFile(afterPath);
    const errs = (afterReport.issues || []).filter((i) => i.severity === 'error');
    checks.push({ name: 'analyze.reparse', ok: true });
    checks.push({ name: 'analyze.no-error', ok: errs.length === 0, detail: errs.map((e) => e.code).join(',') });
  } catch (e) {
    checks.push({ name: 'analyze.reparse', ok: false, detail: e.message });
  }

  // 3. 几何数据切片哈希（仅对字节级保持的算子）
  if (BYTE_PRESERVING.has(opName)) {
    try {
      const hb = semanticHashes(beforeBuf);
      const ha = semanticHashes(afterBuf);
      const same = JSON.stringify(hb) === JSON.stringify(ha);
      checks.push({ name: 'sliceHash.geometry', ok: same, detail: same ? 'POSITION/indices/TEXCOORD_0 语义数据一致' : '几何语义数据被改变' });
    } catch (e) {
      checks.push({ name: 'sliceHash.geometry', ok: false, detail: e.message });
    }
  }

  // 4. 贴图字节（仅对「保持贴图」的算子）
  if (TEXTURE_PRESERVING.has(opName)) {
    const hb = imageHashes(beforeBuf);
    const ha = imageHashes(afterBuf);
    const same = JSON.stringify(hb) === JSON.stringify(ha);
    checks.push({ name: 'image.bytes', ok: same, detail: same ? '贴图字节一致' : '贴图字节被改变' });
  }

  // 5. 单调性断言（按算子）
  if (beforeReport && afterReport) {
    const b = beforeReport.stats, a = afterReport.stats;
    switch (opName) {
      case 'weld':
        checks.push({ name: 'mono.weld.verts<=', ok: a.verts <= b.verts, detail: `${b.verts}->${a.verts}` });
        checks.push({ name: 'mono.weld.tris=', ok: a.tris === b.tris, detail: `${b.tris}->${a.tris}` });
        break;
      case 'simplify':
        checks.push({ name: 'mono.simplify.tris<', ok: a.tris < b.tris, detail: `${b.tris}->${a.tris}` });
        break;
      case 'dedup':
      case 'prune':
      case 'join':
      case 'quantize':
        checks.push({ name: `mono.${opName}.tris=`, ok: a.tris === b.tris, detail: `${b.tris}->${a.tris}` });
        break;
      case 'genNormals':
        checks.push({ name: 'mono.genNormals.verts=', ok: a.verts === b.verts && a.tris === b.tris, detail: `${b.verts}/${b.tris}->${a.verts}/${a.tris}` });
        break;
      case 'fixMaterials': {
        const matBefore = beforeReport.materials?.[0]?.metallicFactor;
        const matAfter = afterReport.materials?.[0]?.metallicFactor;
        checks.push({ name: 'mono.fixMaterials.metallic', ok: matAfter === (params.metallicFactor ?? 0), detail: `${matBefore}->${matAfter}` });
        break;
      }
      case 'textureResize': {
        const wb = beforeReport.textures?.[0]?.width;
        const wa = afterReport.textures?.[0]?.width;
        checks.push({ name: 'mono.textureResize.width<=', ok: wa !== null && wa <= wb, detail: `${wb}->${wa}` });
        break;
      }
      case 'convert':
        checks.push({ name: 'mono.convert.geometry=', ok: a.verts === b.verts && a.tris === b.tris, detail: `${b.verts}/${b.tris}->${a.verts}/${a.tris}` });
        break;
      default:
        break;
    }
  }

  // 6. 边界盒（几何语义保持算子：尺寸不漂移）
  if (SEMANTIC_PRESERVING.has(opName) && beforeReport?.bounds && afterReport?.bounds) {
    const bb = beforeReport.bounds.size, ba = afterReport.bounds.size;
    const slack = boundsSlack(opName, params, bb);
    const same = bb.every((v, i) => near(v, ba[i], slack));
    checks.push({ name: 'bounds.size', ok: same, detail: `${bb.map((v) => v.toFixed(4)).join('x')} vs ${ba.map((v) => v.toFixed(4)).join('x')}` });
  }

  const pass = checks.every((c) => c.ok);
  return { pass, checks, opName, params };
}
