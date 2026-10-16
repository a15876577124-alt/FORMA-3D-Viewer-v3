// 前端 API 客户端：同源 /api（由 serve.mjs 反代到后端），惰性调用。
// 启动时不发任何请求（避免污染 extended.test.mjs 的零请求断言）。
const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.name = 'ApiError'; this.status = status; this.data = data; }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, json);
  }
  return json;
}

export const pipelineApi = {
  health: () => request('/health'),
  models: () => request('/models'),
  assets: () => request('/assets'),
  importAsset: (name, dataBase64) => request('/assets/import', { method: 'POST', body: { name, dataBase64 } }),
  analyze: (id) => request(`/assets/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
  report: (id) => request(`/assets/${encodeURIComponent(id)}/report`),
  run: (id, ops, confirmToken, dryRun) => request(`/assets/${encodeURIComponent(id)}/run`, { method: 'POST', body: { ops, confirmToken, dryRun } }),
  ops: () => request('/ops'),
  capabilities: () => request('/ops/capabilities'),
  agentTools: () => request('/agent/tools'),
  agentRun: (payload) => request('/agent/run', { method: 'POST', body: payload }),
  agentRuns: () => request('/agent/runs'),
  agentRunLog: (runId) => request(`/agent/runs/${encodeURIComponent(runId)}`),
  batch: (assetIds, ops, confirmToken) => request('/batch/run', { method: 'POST', body: { assetIds, ops, confirmToken } }),
  library: () => request('/library'),
  libraryPublished: () => request('/library/published'),
  publish: (id, version) => request(`/assets/${encodeURIComponent(id)}/publish`, { method: 'POST', body: { version } }),
};

export default pipelineApi;
