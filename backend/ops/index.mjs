// 算子注册表 + 链式执行。铁律：非破坏式（读原文件 → 写 pipeline-out 独立目录）、参数校验、能力门控。
import fs from 'node:fs';
import path from 'node:path';
import {readDocument,writeDocument} from '../gltfIO.mjs';
import { transformOps } from './transformOps.mjs';
import { geometryOps } from './geometry.mjs';
import { containerOps } from './container.mjs';
import { convertOps } from './convert.mjs';
import { materialOps } from './material.mjs';
import { textureOps } from './textureOps.mjs';
import { detectCapabilities } from './capabilities.mjs';
import { OP_SCHEMA, validateSchema, withDefaults } from './schema.mjs';

export class OpError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'OpError'; this.status = status; }
}

export const OPS = {
  ...transformOps,
  ...geometryOps,
  ...containerOps,
  ...convertOps,
  ...textureOps,
  ...materialOps,
};

// 依赖某能力的算子 → 不可用时明确报错（禁止假执行）
const CAPABILITY_REQUIRED = {
  simplify: 'simplify',
  textureResize: 'textureResize',
  textureCompress: 'textureCompress',
};

export function listOps() {
  return Object.entries(OPS).map(([name, o]) => {
    const meta = OP_SCHEMA[name] || {};
    return {
      name,
      label: meta.label || name,
      group: meta.group || 'geometry',
      desc: meta.desc || '',
      appearance: o.appearance === true,
      params: meta.params ?? {},
    };
  });
}

export { OP_SCHEMA, getOpParams, withDefaults, validateSchema } from './schema.mjs';

// 校验算子参数：声明驱动（类型/范围/枚举）+ 补全默认值 + 拒绝未知键。
// 与 schema.mjs 单一真源保持一致，绝不静默忽略非法参数。
function validateParams(name, params) {
  return withDefaults(name, validateSchema(name, params ?? {}));
}

// 链式执行一组算子。inPath 是原始文件；outDir 是版本目录；返回 { outPath, results }。
export async function runOps({ inPath, outDir, ops, onStep = () => {}, signal }) {
  if (!Array.isArray(ops) || ops.length === 0) throw new OpError('ops 不能为空');
  fs.mkdirSync(outDir, { recursive: true });

  const cap = await detectCapabilities();
  const results = [];
  let currentIn = inPath;
  if (path.extname(inPath).toLowerCase() === '.gltf' && ops[0]?.op !== 'convert') {
    currentIn = path.join(outDir, '.source.glb');
    await writeDocument(await readDocument(inPath), currentIn);
  }
  let finalExt = path.extname(inPath).toLowerCase();

  for (let i = 0; i < ops.length; i++) {
    signal?.throwIfAborted();
    const { op, params: rawParams } = ops[i];
    const params = validateParams(op, rawParams || {});
    const def = OPS[op];
    if (!def) throw new OpError(`未知算子: ${op}`);
    validateParams(op, params);
    const needCap = CAPABILITY_REQUIRED[op];
    if (needCap && !cap[needCap]) {
      throw new OpError(`算子 ${op} 不可用：缺少依赖 ${needCap}（${cap.reasons.join('; ') || 'unknown'}）`, 503);
    }
    const isLast = i === ops.length - 1;
    // 中间产物用临时名；最终产物用 model.<ext>
    const ext = op === 'convert' ? (params.to === 'gltf' ? '.gltf' : params.to === 'obj' ? '.obj' : '.glb') : '.glb';
    finalExt = ext;
    const outPath = path.join(outDir, isLast ? `model${ext}` : `.tmp-${i}-${op}${ext}`);
    const t0 = Date.now();
    const result = await def.run({ inPath: currentIn, outPath, params, outDir });
    signal?.throwIfAborted();
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
