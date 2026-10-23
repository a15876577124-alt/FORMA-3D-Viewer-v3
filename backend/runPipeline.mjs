// 管道编排：读原始 → 策略评估 → 确认门 → 算子链 → 后验 → 版本化输出。
// 铁律：原始素材只读；产物只写 pipeline-out/<id>-v<N>/（永不覆盖已有版本）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeId, PIPELINE_OUT_ROOT } from './paths.mjs';
import { runOps, validateSchema, listOps } from './ops/index.mjs';
import { assessPolicy } from './policy.mjs';
import { generateConfirmToken, verifyConfirmToken } from './gate.mjs';
import { verifyPair } from './verify.mjs';
import { describeAssetSource, resolveAssetSource } from './assetSource.mjs';
import { analyzeBuffer } from './analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'backend', 'workspace', 'assets');

export class PipelineError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.name = 'PipelineError'; this.status = status; Object.assign(this, extra); }
}

function readMeta(assetId) {
  const p = path.join(ASSETS_DIR, assetId, 'meta.json');
  if (!fs.existsSync(p)) throw new PipelineError(`资产不存在: ${assetId}`, 404);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function originalPath(meta) {
  return path.join(ASSETS_DIR, meta.id, 'original', `file${path.extname(meta.name).toLowerCase()}`);
}

// 下一个版本目录（不覆盖已有）
export function nextVersionDir(assetId) {
  fs.mkdirSync(PIPELINE_OUT_ROOT, { recursive: true });
  for (let n = 1; ; n++) {
    const dir = path.join(PIPELINE_OUT_ROOT, `${assetId}-v${n}`);
    try {
      // Reserve before the first await; mkdir is exclusive across processes too.
      fs.mkdirSync(dir);
      return { version: n, dir };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

export async function runAssetPipeline({ assetId, ops, confirmToken, dryRun = false, baseVersion = 0, signal }) {
  signal?.throwIfAborted();
  const id = assertSafeId(assetId);
  const meta = readMeta(id);
  const source = resolveAssetSource(id, baseVersion);
  const inPath = source.file;
  if (!fs.existsSync(inPath)) throw new PipelineError('原始文件缺失', 500);

  // 参数前置校验：dryRun 预览阶段同样校验，让用户立刻看到非法参数，
  // 而不是等到真实执行（可能已写盘）才报错。
  for (const o of ops || []) {
    if (!o || typeof o.op !== 'string') throw new PipelineError('算子项必须包含 op 字段', 400);
    try {
      validateSchema(o.op, o.params || {});
    } catch (e) {
      throw new PipelineError(e.message, 400);
    }
  }

  const policy = assessPolicy(meta.name, id, ops);

  const gateId = baseVersion ? id + '@v' + baseVersion : id;
  // 确认门
  if (policy.required && !verifyConfirmToken(confirmToken, gateId, ops)) {
    throw new PipelineError('该操作会改变外观/贴图，需人工确认', 409, {
      needConfirm: true,
      token: generateConfirmToken(gateId, ops),
      riskyOps: policy.riskyOps,
      reasons: policy.reasons,
    });
  }

  // dryRun：只返回 wouldApply，不写盘（供 Agent 决策阶段）
  if (dryRun) {
    return {
      dryRun: true,
      assetId: id,
      wouldApply: ops.map((o) => ({ op: o.op, params: o.params || {}, appearance: policy.riskyOps.includes(o.op) })),
      reasons: policy.reasons,
    };
  }

  // 真实执行
  const { version, dir } = nextVersionDir(id);
  const kind = ops.some(o => ['simplify','quantize','textureResize','textureCompress'].includes(o.op)) ? 'Optimized' : ops.every(o => o.op === 'convert') ? 'Converted' : ops.some(o => o.op === 'setMaterial') ? 'Edited' : 'Repaired';
  const versionMeta = {assetId:id,version,baseVersion,kind,status:'running',createdAt:new Date().toISOString(),sourcePath:source.path};
  const versionFile = path.join(dir,'version.json');
  fs.writeFileSync(versionFile,JSON.stringify(versionMeta,null,2));
  try {
  const beforeReport = await analyzeBuffer(path.basename(inPath), fs.readFileSync(inPath), source.format, { baseDir: path.dirname(inPath) });
  const { outPath, results } = await runOps({ inPath, outDir: dir, ops, signal });

  // 后验：逐算子对比其「输入 vs 输出」（而非原始 vs 最终）
  let verify = null;
  const afterReport = await analyzeBuffer(path.basename(outPath), fs.readFileSync(outPath), path.extname(outPath).slice(1), { baseDir: path.dirname(outPath) });
  try {
    const checks = [];
    for (const r of results) {
      const v = await verifyPair({ beforePath: r.inPath, afterPath: r.outPath, opName: r.op, params: r.params });
      checks.push({ op: r.op, ...v });
    }
    verify = { pass: checks.every((c) => c.pass), checks };
  } catch (e) {
    verify = { pass: false, error: e.message, checks: [] };
  }

  // 写元数据
  fs.writeFileSync(path.join(dir, 'report.before.json'), JSON.stringify(beforeReport, null, 2));
  fs.writeFileSync(path.join(dir, 'report.after.json'), JSON.stringify(afterReport, null, 2));
  fs.writeFileSync(path.join(dir, 'ops.json'), JSON.stringify({ assetId: id, version, baseVersion, ops, results, policy, createdAt: new Date().toISOString() }, null, 2));
  fs.writeFileSync(path.join(dir, 'verify.json'), JSON.stringify(verify, null, 2));
  fs.writeFileSync(path.join(dir, 'CHANGE.txt'), results.map((r) => `[${r.op}] ${(r.changes || []).join('; ') || '(无变更)'}`).join('\n'));

  fs.writeFileSync(versionFile,JSON.stringify({...versionMeta,status:verify.pass?'complete':'failed',modelFile:path.basename(outPath),verifyPass:verify.pass},null,2));

  // Before/After 3D 对比需要拿到两端的真实文件路径（相对项目根，供 /api/file 安全服务）
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
  return {
    assetId: id,
    version,
    baseVersion,
    outPath: path.relative(ROOT, outPath),
    outDir: path.relative(ROOT, dir),
    beforePath: rel(inPath),
    afterPath: rel(outPath),
    before: { verts: beforeReport.stats.verts, tris: beforeReport.stats.tris, bytes: beforeReport.file.bytes, sha256: beforeReport.file.sha256 },
    after: { verts: afterReport.stats.verts, tris: afterReport.stats.tris, bytes: afterReport.file.bytes, sha256: afterReport.file.sha256 },
    results,
    verify,
    policy,
  };
  } catch(e) {
    fs.writeFileSync(versionFile,JSON.stringify({...versionMeta,status:'failed',error:e.message},null,2));
    throw e;
  }
}

// Agent ctx 注入的三个函数（runOp / verify / compare / exportAsset）
export function makeAgentCtx({ baseVersion = 0 } = {}) {
  let currentVersion = baseVersion;
  async function process({ assetId, op, params, version }, context = {}) {
    const result = await runAssetPipeline({ assetId, baseVersion: version ?? currentVersion,
      ops: [{op, params:params || {}}], confirmToken:context.confirmToken, signal:context.signal });
    if (!result.verify?.pass) throw new PipelineError('后验失败，Agent 已停止；失败版本保留供检查', 422, {result});
    currentVersion = result.version;
    return result;
  }
  return {
    assetsDir: ASSETS_DIR,
    operationSpec: listOps(),
    getVersion: () => currentVersion,
    setVersion: version => { currentVersion = version; },
    analyze: async ({assetId}) => describeAssetSource(assetId, currentVersion),
    runOp: process,
    async verify({ assetId, version = currentVersion }) {
      const file = path.join(PIPELINE_OUT_ROOT, assetId+'-v'+version, 'verify.json');
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {status:'not-available', version};
    },
    async compare({ assetId, version = currentVersion }) {
      const dir = path.join(PIPELINE_OUT_ROOT, assetId+'-v'+version);
      const before = JSON.parse(fs.readFileSync(path.join(dir,'report.before.json'),'utf8'));
      const after = JSON.parse(fs.readFileSync(path.join(dir,'report.after.json'),'utf8'));
      return {version, before:before.stats, after:after.stats, bytes:{before:before.file.bytes,after:after.file.bytes}};
    },
    exportAsset: (args, context) => process({...args,op:'convert',params:{to:args.to}}, context),
  };
}
