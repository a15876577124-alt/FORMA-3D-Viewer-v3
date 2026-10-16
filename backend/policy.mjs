// 琼剧红线硬规则：这些规则由工程硬编码，不交给 LLM 判断（LLM 可能被诱导绕过）。
// 命中红线的算子必须走确认门（gate.mjs），未确认一律不执行。
import { OPS } from './ops/index.mjs';

// 5 个琼剧手办（assets/raw 的 ground truth 名称）
const QIONG_NAMES = ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white'];

// 会改变外观/贴图的算子（始终需要确认）
const APPEARANCE_OPS = new Set(['genNormals', 'fixMaterials', 'quantize', 'textureResize', 'textureCompress', 'simplify', 'convert']);

// 对琼剧手办，即使 appearance=false 的算子也需确认的额外红线（避免误删脸谱贴图/材质）
const QIONG_EXTRA_OPS = new Set(['pruneUnused', 'dedupMaterials', 'textureDedup', 'dedup', 'prune', 'join']);

// 判断一组算子是否需要确认，返回 { required, riskyOps, reasons }。
export function assessPolicy(assetName, assetId, ops) {
  const riskyOps = [];
  const reasons = [];
  const isQiong = QIONG_NAMES.some((n) => (assetName || '').toLowerCase().includes(n) || (assetId || '').includes(n));
  for (const { op } of ops) {
    const def = OPS[op];
    if (!def) continue;
    if (def.appearance === true || APPEARANCE_OPS.has(op)) {
      if (!riskyOps.includes(op)) riskyOps.push(op);
      reasons.push(`算子 ${op} 会改变外观/贴图，需人工确认`);
    }
    if (isQiong && QIONG_EXTRA_OPS.has(op)) {
      if (!riskyOps.includes(op)) riskyOps.push(op);
      reasons.push(`资产属于琼剧手办，算子 ${op} 可能影响脸谱/头饰/纹样，强制确认`);
    }
  }
  return { required: riskyOps.length > 0, riskyOps, reasons: [...new Set(reasons)], isQiong };
}

export { QIONG_NAMES };
