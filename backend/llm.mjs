// LLM 客户端封装：基于 WorkBuddy 云服务 SDK（keyless）。
// 供 AI Agent（M2）使用；M1 先提供模型列举。凭据只来自 publicConfig.json + backend/.env。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env 兜底（可选）：WORKBUDDY_CLOUD_ENDPOINT / WORKBUDDY_CLOUD_PUBLISHABLE_KEY
// 密钥类配置只进这里，且本文件已被 .gitignore 忽略。
function loadDotEnv() {
  const envPath = path.join(ROOT, 'backend', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

let cachedClient = null;
let cachedModels = null;
let modelsFetchedAt = 0;
const MODELS_TTL_MS = 10 * 60 * 1000;

export function getCloudClient() {
  if (cachedClient) return cachedClient;
  loadDotEnv();
  // publicConfig 优先；.env 可覆盖（本地开发兜底）
  const cfgPath = path.join(ROOT, 'backend', 'publicConfig.json');
  let cfg = {};
  if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const endpoint = process.env.WORKBUDDY_CLOUD_ENDPOINT || cfg.endpoint;
  const publishableKey = process.env.WORKBUDDY_CLOUD_PUBLISHABLE_KEY || cfg.publishableKey;
  if (!endpoint || !publishableKey) {
    throw new Error('云服务配置缺失：backend/publicConfig.json 或 backend/.env 未提供 endpoint/publishableKey');
  }
  const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');
  cachedClient = createWorkBuddyCloud({ endpoint, publishableKey });
  return cachedClient;
}

// 模型列表（带 10 分钟缓存）。空数组是合法结果。
export async function listModels({ refresh = false } = {}) {
  const cloud = getCloudClient();
  if (!refresh && cachedModels && Date.now() - modelsFetchedAt < MODELS_TTL_MS) {
    return cachedModels;
  }
  const models = await cloud.llm.models.list();
  cachedModels = models;
  modelsFetchedAt = Date.now();
  return models;
}

// 主力 Agent 模型（用户指定，2026-10-17）：DeepSeek-V4-Pro。禁止仅凭 flash|turbo 关键词自动降级。
export const DEFAULT_AGENT_MODEL = 'deepseek-v4-pro';

// 选择一个适合 Agent 的模型：优先显式 preferredId，其次 DEFAULT_AGENT_MODEL。
// 降级只在两者都不可用时发生，且必须显式传入 preferredId 覆盖；本函数不会因 "flash" 字样自动降级。
export function pickAgentModel(models, preferredId) {
  const usable = (models || []).filter((m) => m.disabled !== true);
  for (const id of [preferredId, DEFAULT_AGENT_MODEL]) {
    if (!id) continue;
    const hit = usable.find((m) => m.id === id);
    if (hit) return hit;
  }
  const anyTool = usable.find((m) => m.supportsToolCall === true);
  return anyTool || usable[0] || null;
}

// 单轮流式对话，收集完整文本。供 Agent 与一次性任务使用。
export async function chat({ model, messages, temperature = 0.3, maxTokens, signal }) {
  const cloud = getCloudClient();
  let content = '';
  let finishReason = null;
  let usage = null;
  const params = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature,
  };
  if (maxTokens) params.max_tokens = maxTokens;
  if (signal) params.signal = signal;
  for await (const chunk of cloud.llm.chat.completions.create(params)) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) content += delta.content;
    if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  return { content, finishReason, usage, model };
}
