// FORMA AI Pipeline 本地后端服务。
// 安全约束（硬性）：
//   1. 仅监听 127.0.0.1 —— 本服务处理用户上传的资产文件，绝不暴露到局域网。
//   2. 上传文件经魔数 + 扩展名 + 大小三重校验（validate.mjs）。
//   3. 所有路径经 safeJoin 限制在 workspace 内（防目录穿越）。
//   4. CORS 仅允许本机前端源；密钥只进 backend/.env（已 gitignore）。
//   5. 原始素材永不删除/覆盖：导入即写入 workspace/assets/<id>/original.<ext>。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { safeJoin, assertSafeId, PathError } from './paths.mjs';
import { validateFile, sanitizeName, ValidationError, MAX_FILE_BYTES } from './validate.mjs';
import { analyzeBuffer } from './analyze.mjs';
import { listModels, pickAgentModel } from './llm.mjs';
import { runAgent } from './agent/agent.mjs';
import { TOOLS } from './agent/tools.mjs';
import { describeAssetSource } from './assetSource.mjs';
import { runAssetPipeline, makeAgentCtx } from './runPipeline.mjs';
import { listOps } from './ops/index.mjs';
import { detectCapabilities } from './ops/capabilities.mjs';
import { PIPELINE_PRESETS, validatePresets } from './ops/presets.mjs';
import { runBatch } from './batch.mjs';
import { listLibrary, publishAsset, deleteLibraryFile, listPublished } from './library.mjs';
import { detectFbxTextures, extractEmbeddedTextures } from './fbxTextures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.join(ROOT, 'backend', 'workspace');
const ASSETS_DIR = path.join(WORKSPACE, 'assets');
const PORT = Number(process.env.FORMA_BACKEND_PORT || 8787);
const HOST = '127.0.0.1'; // 硬性约束：仅本机

const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);

// ---------- 基础设施 ----------

function send(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(res, err) {
  const status = err.status || 500;
  const payload = { error: { message: err.message || String(err), code: err.name || 'internal_error' } };
  // 确认门（409）必须把 needConfirm/token 带到响应体顶层——前端靠它二次提交。
  // 之前只塞进 error 对象，前端读 data.needConfirm 恒为 undefined，
  // 导致「再次点击确认」永远拿不到 token，确认流程死循环。
  if (err.needConfirm) payload.needConfirm = err.needConfirm;
  if (err.token) payload.token = err.token;
  if (err.riskyOps) payload.riskyOps = err.riskyOps;
  if (err.reasons) payload.reasons = err.reasons;
  if (process.env.FORMA_BACKEND_DEBUG === '1' && err.stack) payload.error.stack = err.stack.split('\n').slice(0, 6);
  send(res, status, payload);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

async function readBody(req, limitBytes = MAX_FILE_BYTES + 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new ValidationError('请求体超过大小上限'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (e) => reject(e));
  });
}

async function readJson(req, limit = 8 * 1024 * 1024) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new ValidationError('请求体不是合法 JSON'); }
}

// ---------- 资产存储 ----------

function assetDir(id) {
  assertSafeId(id);
  return path.join(ASSETS_DIR, id);
}

function readMeta(id) {
  const p = path.join(assetDir(id), 'meta.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listAssets() {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  const out = [];
  for (const id of fs.readdirSync(ASSETS_DIR)) {
    const meta = readMeta(id);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
}

function importAsset(name, dataBuf) {
  const safeName = sanitizeName(name);
  const { format, note } = validateFile(safeName, dataBuf);
  const id = safeName.replace(/\.[^.]+$/, '') + '-' + crypto.createHash('sha256').update(dataBuf).digest('hex').slice(0, 8);
  const dir = assetDir(id);
  const ext = path.extname(safeName).toLowerCase();
  fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
  const originalPath = path.join(dir, 'original', 'file' + ext);
  // 幂等：同内容同 id，不覆盖已有原始文件（永不破坏原始素材）
  if (!fs.existsSync(originalPath)) {
    fs.writeFileSync(originalPath, dataBuf);
  }
  const meta = {
    id, name: safeName, format, note,
    bytes: dataBuf.length,
    sha256: crypto.createHash('sha256').update(dataBuf).digest('hex'),
    originalRelPath: path.relative(WORKSPACE, originalPath),
    importedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

async function analyzeAsset(id) {
  const meta = readMeta(id);
  if (!meta) throw new PathError(`资产不存在: ${id}`);
  const original = path.join(WORKSPACE, meta.originalRelPath);
  const buf = fs.readFileSync(original);
  // baseDir 传原文件所在目录：FBX 外部贴图引用要相对它解析，才能真实判定「缺失」
  const report = await analyzeBuffer(meta.name, buf, meta.format, { baseDir: path.dirname(original) });
  fs.writeFileSync(path.join(assetDir(id), 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

// ---------- 路由 ----------

const routes = [];
function route(method, pattern, handler) {
  // pattern: '/api/assets/:id/analyze'
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, handler });
}

route('GET', '/api/health', async () => ({
  ok: true,
  service: 'forma-pipeline-backend',
  host: HOST,
  workspace: path.relative(ROOT, WORKSPACE),
  assets: listAssets().length,
  node: process.version,
}));

route('GET', '/api/models', async () => {
  const models = await listModels();
  return {
    models: models.map((m) => ({
      id: m.id, name: m.name ?? m.id,
      supportsToolCall: m.supportsToolCall === true,
      supportsImages: m.supportsImages === true,
      supportsReasoning: m.supportsReasoning === true,
      disabled: m.disabled === true,
    })),
    suggested: pickAgentModel(models)?.id ?? null,
  };
});

route('POST', '/api/assets/import', async (req) => {
  const body = await readJson(req, Math.ceil(MAX_FILE_BYTES / 3) * 4 + 1024 * 1024);
  const name = body?.name;
  const data = body?.dataBase64;
  if (typeof name !== 'string' || typeof data !== 'string') {
    throw new ValidationError('需要 { name, dataBase64 }');
  }
  let buf;
  try { buf = Buffer.from(data, 'base64'); }
  catch { throw new ValidationError('dataBase64 解码失败'); }
  if (buf.length && !Buffer.compare(buf.subarray(0, Math.min(8, buf.length)), Buffer.from(data, 'base64').subarray(0, Math.min(8, buf.length)))) {
    // base64 宽松性检查由 validateFile 的魔数校验兜底
  }
  const meta = importAsset(name, buf);
  const report = await analyzeAsset(meta.id);
  return { asset: meta, report };
});

route('GET', '/api/assets/:id/versions/:version', async (req, params) => describeAssetSource(params.id, Number(params.version)));

route('GET', '/api/assets', async () => ({ assets: listAssets() }));

route('POST', '/api/assets/:id/analyze', async (req, params) => {
  const report = await analyzeAsset(params.id);
  return { asset: readMeta(params.id), report };
});

route('GET', '/api/assets/:id/report', async (req, params) => {
  const p = path.join(assetDir(params.id), 'report.json');
  if (!fs.existsSync(p)) throw new PathError(`报告不存在: ${params.id}`);
  return { asset: readMeta(params.id), report: JSON.parse(fs.readFileSync(p, 'utf8')) };
});

// ---------- FBX 纹理：检测结果 + 内嵌贴图提取 ----------

route('GET', '/api/assets/:id/textures', async (req, params) => {
  const meta = readMeta(assertSafeId(params.id));
  if (!meta) throw new PathError(`资产不存在: ${params.id}`);
  const original = path.join(WORKSPACE, meta.originalRelPath);
  const buf = fs.readFileSync(original);
  const list = detectFbxTextures(buf, { baseDir: path.dirname(original) });
  return { assetId: meta.id, format: meta.format, textures: list };
});

// 把 FBX 内嵌的贴图导出成文件（产物写在资产目录下，原始素材只读不动）
route('POST', '/api/assets/:id/extract-textures', async (req, params) => {
  const id = assertSafeId(params.id);
  const meta = readMeta(id);
  if (!meta) throw new PathError(`资产不存在: ${id}`);
  if (meta.format !== 'fbx-binary' && meta.format !== 'fbx-ascii') {
    throw new ValidationError(`仅 FBX 支持贴图提取（当前 ${meta.format}）`);
  }
  const original = path.join(WORKSPACE, meta.originalRelPath);
  const outDir = path.join(assetDir(id), 'textures');
  const written = extractEmbeddedTextures(fs.readFileSync(original), outDir);
  return {
    assetId: id,
    count: written.length,
    files: written.map((f) => ({
      name: f.name, source: f.source, uri: f.uri,
      bytes: f.bytes, sha256: f.sha256, mime: f.mime, width: f.width, height: f.height,
      // 相对项目根，可直接交给 /api/file 服务（前端可预览/下载）
      relPath: path.relative(ROOT, f.path).split(path.sep).join('/'),
      url: `/api/file/${path.relative(ROOT, f.path).split(path.sep).join('/')}`,
    })),
  };
});

// ---------- AI Agent ----------

route('GET', '/api/agent/tools', async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters, mutating: t.mutating, confirm: t.confirm })),
}));

route('POST', '/api/agent/run', async (req) => {
  const body = await readJson(req);
  const assetId = assertSafeId(String(body?.assetId || ''));
  if (!readMeta(assetId)) throw new PathError(`资产不存在: ${assetId}`);
  const goal = typeof body.goal === 'string' && body.goal.trim() ? body.goal.trim() : '请分析该资产并给出处理建议';
  const model = typeof body.model === 'string' ? body.model : undefined;
  const maxRounds = Number.isInteger(body.maxRounds) ? body.maxRounds : undefined;
  const dryRun = body.dryRun !== false; // 默认 dryRun，不写盘
  const log = await runAgent({
    assetId, goal, model, maxRounds, dryRun,
    ctx: makeAgentCtx(),
  });
  return { runId: log.runId, log };
});

route('GET', '/api/agent/runs/:runId', async (req, params) => {
  const runId = assertSafeId(params.runId);
  const runDir = path.join(ASSETS_DIR);
  // runId 形如 run_<ts>_<hex>；在所有资产目录下查找
  let found = null;
  if (fs.existsSync(runDir)) {
    for (const id of fs.readdirSync(runDir)) {
      const p = path.join(runDir, id, 'runs', `${runId}.json`);
      if (fs.existsSync(p)) { found = JSON.parse(fs.readFileSync(p, 'utf8')); break; }
    }
  }
  if (!found) throw new PathError(`运行记录不存在: ${runId}`);
  return { log: found };
});

route('GET', '/api/agent/runs', async () => {
  const out = [];
  if (fs.existsSync(ASSETS_DIR)) {
    for (const id of fs.readdirSync(ASSETS_DIR)) {
      const runsDir = path.join(ASSETS_DIR, id, 'runs');
      if (!fs.existsSync(runsDir)) continue;
      for (const f of fs.readdirSync(runsDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const log = JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8'));
          out.push({ runId: log.runId, assetId: log.assetId, model: log.model, protocol: log.protocol, dryRun: log.dryRun, startedAt: log.startedAt, totalMs: log.totalMs, finish: log.finish ? log.finish.summary.slice(0, 80) : null });
        } catch { /* 忽略损坏日志 */ }
      }
    }
  }
  return { runs: out.slice(-20).reverse() };
});

// ---------- 处理算子（M3） ----------

route('GET', '/api/ops', async () => ({ ops: listOps() }));

route('GET', '/api/ops/capabilities', async () => ({ capabilities: await detectCapabilities() }));

// 可复用处理预设（UI 与 CLI 共用 backend/ops/presets.mjs）
route('GET', '/api/presets', async () => {
  const errors = validatePresets();
  return { presets: PIPELINE_PRESETS, selfCheck: { ok: errors.length === 0, errors } };
});

route('POST', '/api/assets/:id/run', async (req, params) => {
  const body = await readJson(req);
  const assetId = assertSafeId(params.id);
  if (!readMeta(assetId)) throw new PathError(`资产不存在: ${assetId}`);
  const ops = Array.isArray(body?.ops) ? body.ops : [];
  const confirmToken = typeof body?.confirmToken === 'string' ? body.confirmToken : undefined;
  const dryRun = body?.dryRun === true;
  return runAssetPipeline({ assetId, ops, confirmToken, dryRun, baseVersion: body.baseVersion ?? 0 });
});

// ---------- 批量 + 资产库（M4） ----------

route('POST', '/api/batch/run', async (req) => {
  const body = await readJson(req);
  const assetIds = Array.isArray(body?.assetIds) ? body.assetIds.map((s) => assertSafeId(String(s))) : [];
  const ops = Array.isArray(body?.ops) ? body.ops : [];
  const confirmToken = typeof body?.confirmToken === 'string' ? body.confirmToken : undefined;
  const concurrency = Number.isInteger(body?.concurrency) ? body.concurrency : 2;
  return runBatch({ assetIds, ops, confirmToken, concurrency });
});

route('GET', '/api/library', async () => listLibrary());

route('GET', '/api/library/published', async () => listPublished());

route('POST', '/api/assets/:id/publish', async (req, params) => {
  const body = await readJson(req);
  const version = Number.isInteger(body?.version) ? body.version : 1;
  return publishAsset({ assetId: assertSafeId(params.id), version });
});

route('DELETE', '/api/library/:file', async (req, params) => {
  return deleteLibraryFile(params.file);
});

// ---------- 产物/原始文件安全服务（Before/After 3D 对比用） ----------
// 只允许读取项目内两个目录：backend/workspace（导入资产原文）与 pipeline-out（产物）。
// 路径穿越防护：resolve + realpath 后必须仍在白名单根内；扩展名白名单；禁读目录。

const FILE_SERVE_ROOTS = [
  path.join(ROOT, 'backend', 'workspace'),
  path.join(ROOT, 'pipeline-out'),
  path.join(ROOT, 'assets'),
];

const FILE_SERVE_EXT = new Set(['.glb', '.gltf', '.bin', '.obj', '.mtl', '.fbx', '.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.bmp']);

const MIME = {
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.obj': 'text/plain', '.mtl': 'text/plain', '.fbx': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ktx2': 'image/ktx2', '.bmp': 'image/bmp',
};

function resolveServableFile(relPath) {
  const abs = path.resolve(ROOT, relPath);
  const real = fs.existsSync(abs) ? fs.realpathSync(abs) : abs;
  const ok = FILE_SERVE_ROOTS.some((base) => real === base || real.startsWith(base + path.sep));
  if (!ok) throw new PathError('路径不在可服务范围内');
  const ext = path.extname(real).toLowerCase();
  if (!FILE_SERVE_EXT.has(ext)) throw new PathError('该文件类型不可服务');
  if (!fs.existsSync(real) || !fs.statSync(real).isFile()) throw new PathError('文件不存在');
  return { real, ext };
}

function serveFile(res, relPath) {
  const { real, ext } = resolveServableFile(relPath);
  const buf = fs.readFileSync(real);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

// ---------- 服务器 ----------

const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname); }
  catch { send(res, 400, { error: { message: '非法 URL', code: 'bad_url' } }); return; }

  // /api/file/<相对路径> —— 走路径段而非 query，使 .gltf 的相对引用（.bin/贴图）
  // 能被 three.js 按 URL 规则正确解析到同一目录下。
  if (req.method === 'GET' && pathname.startsWith('/api/file/')) {
    try {
      serveFile(res, pathname.slice('/api/file/'.length));
    } catch (err) {
      sendError(res, err);
    }
    return;
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.rx.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    try {
      const result = await r.handler(req, params);
      send(res, 200, result);
    } catch (err) {
      sendError(res, err);
    }
    return;
  }
  send(res, 404, { error: { message: `Not found: ${req.method} ${pathname}`, code: 'not_found' } });
});

server.listen(PORT, HOST, () => {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const actualPort = server.address().port;
  console.log(`[FORMA pipeline] http://${HOST}:${actualPort} (仅本机监听)`);
});

server.on('error', (err) => {
  console.error('[FORMA pipeline] 服务器错误:', err.message);
  process.exit(1);
});

// 优雅退出
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log(`\n[FORMA pipeline] ${sig} -> 关闭`); server.close(() => process.exit(0)); });
}
