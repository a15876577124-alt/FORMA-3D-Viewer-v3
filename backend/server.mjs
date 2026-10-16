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
  if (process.env.FORMA_BACKEND_DEBUG === '1' && err.stack) payload.error.stack = err.stack.split('\n').slice(0, 6);
  send(res, status, payload);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

async function readJson(req) {
  const raw = await readBody(req, 8 * 1024 * 1024);
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
  const report = await analyzeBuffer(meta.name, buf, meta.format);
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
  const body = await readJson(req);
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
    ctx: { assetsDir: ASSETS_DIR },
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

// ---------- 服务器 ----------

const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

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
