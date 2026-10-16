// 算子注册表 + 链式执行。铁律：非破坏式（读原文件 → 写 pipeline-out 独立目录）、参数校验、能力门控。
import fs from 'node:fs';
import path from 'node:path';
import { transformOps } from './transformOps.mjs';
import { geometryOps } from './geometry.mjs';
import { containerOps } from './container.mjs';
import { convertOps } from './convert.mjs';
import { textureOps } from './textureOps.mjs';
import { detectCapabilities } from './capabilities.mjs';

export class OpError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'OpError'; this.status = status; }
}

export const OPS = {
  ...transformOps,
  ...geometryOps,
  ...containerOps,
  ...convertOps,
  ...textureOps,
};

// 依赖某能力的算子 → 不可用时明确报错（禁止假执行）
const CAPABILITY_REQUIRED = {
  simplify: 'simplify',
  textureResize: 'textureResize',
  textureCompress: 'textureCompress',
};

export function listOps() {
  return Object.entries(OPS).map(([name, o]) => ({ name, appearance: o.appearance, params: o.params ?? {} }));
}

// 校验算子参数（类型与范围）——真实校验，非法参数直接拒绝。
function validateParams(name, params) {
  const p = params || {};
  if (typeof p !== 'object' || Array.isArray(p)) throw new OpError(`算子 ${name} 参数必须是对象`);
  switch (name) {
    case 'weld':
      if (p.epsilon !== undefined && (typeof p.epsilon !== 'number' || p.epsilon < 0)) throw new OpError('weld.epsilon 必须为非负数');
      break;
    case 'simplify':
      if (p.ratio !== undefined && (typeof p.ratio !== 'number' || p.ratio <= 0 || p.ratio > 1)) throw new OpError('simplify.ratio 必须在 (0,1]');
      break;
    case 'textureResize':
      if (p.maxSize !== undefined && (!Number.isInteger(p.maxSize) || p.maxSize < 16)) throw new OpError('textureResize.maxSize 必须为 >=16 的整数');
      break;
    case 'genNormals':
      if (p.hardAngle !== undefined && (typeof p.hardAngle !== 'number' || p.hardAngle <= 0 || p.hardAngle > 180)) throw new OpError('genNormals.hardAngle 必须在 (0,180]');
      break;
    case 'convert':
      if (!['glb', 'gltf', 'obj', 'fbx'].includes(p.to)) throw new OpError('convert.to 必须是 glb/gltf/obj/fbx');
      break;
    case 'fixMaterials':
      if (p.metallicFactor !== undefined && (typeof p.metallicFactor !== 'number' || p.metallicFactor < 0 || p.metallicFactor > 1)) throw new OpError('fixMaterials.metallicFactor 必须在 [0,1]');
      break;
    default:
      break;
  }
  return p;
}

// 链式执行一组算子。inPath 是原始文件；outDir 是版本目录；返回 { outPath, results }。
export async function runOps({ inPath, outDir, ops, onStep = () => {} }) {
  if (!Array.isArray(ops) || ops.length === 0) throw new OpError('ops 不能为空');
  fs.mkdirSync(outDir, { recursive: true });

  const cap = await detectCapabilities();
  const results = [];
  let currentIn = inPath;
  let finalExt = path.extname(inPath).toLowerCase();

  for (let i = 0; i < ops.length; i++) {
    const { op, params: rawParams } = ops[i];
    const params = rawParams || {};
    const def = OPS[op];
    if (!def) throw new OpError(`未知算子: ${op}`);
    validateParams(op, params);
    const needCap = CAPABILITY_REQUIRED[op];
    if (needCap && !cap[needCap]) {
      throw new OpError(`算子 ${op} 不可用：缺少依赖 ${needCap}（${cap.reasons.join('; ') || 'unknown'}）`, 503);
    }
    const isLast = i === ops.length - 1;
    // 中间产物用临时名；最终产物用 model.<ext>
    const ext = op === 'convert' && isLast ? (params.to === 'gltf' ? '.gltf' : params.to === 'obj' ? '.obj' : '.glb') : '.glb';
    finalExt = ext;
    const outPath = path.join(outDir, isLast ? `model${ext}` : `.tmp-${i}-${op}${ext}`);
    const t0 = Date.now();
    const result = await def.run({ inPath: currentIn, outPath, params, outDir });
    result.op = op;
    result.params = params;
    result.inPath = currentIn;
    result.outPath = outPath;
    result.ms = Date.now() - t0;
    results.push(result);
    onStep({ op, ok: true, ms: result.ms, changes: result.changes });
    currentIn = outPath;
    if (!fs.existsSync(outPath)) throw new OpError(`算子 ${op} 未产出文件（禁止假执行）`);
  }

  return { outPath: currentIn, results };
}
