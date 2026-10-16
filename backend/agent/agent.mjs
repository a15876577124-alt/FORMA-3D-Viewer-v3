// Agent 主循环：真实 LLM 决策 + 工具调用 + 多轮回灌 + 执行日志 + 后验。
// 铁律：服务端不提供任何默认/兜底的算子填充路径——每个工具调用必须来自 LLM 产出的 tool_calls。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { streamLLM } from './llmStream.mjs';
import { toNativeTools, toPromptSpec, dispatchTool } from './tools.mjs';
import { DEFAULT_AGENT_MODEL } from '../llm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class AgentError extends Error {
  constructor(message, status = 500) { super(message); this.name = 'AgentError'; this.status = status; }
}

const SYSTEM_PROMPT = `你是 FORMA 3D 资产管线的 AI 分析代理。你可以调用工具来读取资产报告、提出处理方案、执行算子、做后验与对比。
规则：
1. 所有数据必须来自工具返回的真实报告，禁止编造顶点/三角形/贴图等数字。
2. 琼剧手办的贴图、脸谱、头饰、纹样具有高艺术价值——任何可能改变外观的算子（法线、材质、贴图缩放/压缩、减面）都必须说明理由与风险，并谨慎对待。
3. 先 analyze_asset 读取报告，再 propose_ops 提出方案，需要执行时用 run_op，最后用 finish 总结。
4. 只调用工具清单里存在的工具，不要发明工具名。`;

// 读取 spike 结果决定协议（auto 模式）。
function resolveProtocol(model) {
  const spikePath = path.join(ROOT, 'test-out', 'llm-tools-spike.json');
  if (!fs.existsSync(spikePath)) return 'native'; // 已实测 native 可用
  try {
    const arr = JSON.parse(fs.readFileSync(spikePath, 'utf8'));
    const native = arr.find((r) => r.model === model && r.mode === 'native');
    if (native?.ok) return 'native';
    const prompt = arr.find((r) => r.model === model && r.mode === 'prompt');
    if (prompt?.ok) return 'prompt';
    return 'native';
  } catch { return 'native'; }
}

function nowIso() { return new Date().toISOString(); }

// 判定死循环：连续两次派发完全相同的 (name, args)
function isRepeat(lastTwo, name, argsRaw) {
  if (lastTwo.length < 2) return false;
  const sig = `${name}|${argsRaw}`;
  return lastTwo[0] === sig && lastTwo[1] === sig;
}

export async function runAgent({
  assetId, goal, model = DEFAULT_AGENT_MODEL, protocol = 'native',
  maxRounds = 8, maxToolCalls = 24, wallClockMs = 180000, dryRun = true,
  onEvent = () => {}, llmFn, ctx = {},
}) {
  if (process.env.FORMA_LLM_OFFLINE === '1') {
    throw new AgentError('LLM 离线（FORMA_LLM_OFFLINE=1），无法生成 AI 决策', 503);
  }
  const modelId = model;
  const proto = protocol === 'auto' ? resolveProtocol(modelId) : protocol;
  const llm = llmFn || ((p) => streamLLM(p));

  const assetsDir = ctx.assetsDir || path.join(ROOT, 'backend', 'workspace', 'assets');
  const toolCtx = {
    assetsDir,
    runOp: ctx.runOp, verify: ctx.verify, compare: ctx.compare, exportAsset: ctx.exportAsset,
  };

  const runId = `run_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const log = {
    runId, assetId, model: modelId, protocol: proto, dryRun,
    startedAt: nowIso(), endedAt: null, totalMs: 0,
    goal, rounds: [], toolStats: {}, finish: null, rawChunkSample: [],
    errors: [],
  };
  const startedAtMs = Date.now();

  const nativeTools = toNativeTools();
  const promptSpec = toPromptSpec();
  const messages = proto === 'prompt'
    ? [{ role: 'system', content: `${SYSTEM_PROMPT}\n\n可用工具：\n${promptSpec}\n\n每次调用工具时，只输出一行 JSON：{"tool":"<名>","args":{...}}，不要输出解释文字。` },
       { role: 'user', content: goal }]
    : [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: goal }];

  const lastTwoCalls = []; // 死循环检测
  let totalToolCalls = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const roundRec = { i: round, llmMs: 0, usage: null, rawText: '', reasoning: '', toolCalls: [], errors: [] };
    const t0 = Date.now();
    let res;
    try {
      res = await llm({
        model: modelId,
        messages,
        tools: proto === 'prompt' ? undefined : nativeTools,
        toolChoice: proto === 'prompt' ? undefined : 'auto',
        temperature: 0.2,
      });
    } catch (e) {
      roundRec.errors.push(`LLM 调用失败: ${e.message}`);
      log.rounds.push(roundRec);
      log.errors.push(`round ${round}: ${e.message}`);
      break;
    }
    roundRec.llmMs = Date.now() - t0;
    roundRec.usage = res.usage || null;
    roundRec.rawText = res.content || '';
    roundRec.reasoning = res.reasoning || '';
    if (res.rawChunkSample?.length) log.rawChunkSample.push(...res.rawChunkSample.slice(0, 5));

    // 收集工具调用（native 来自 toolCalls；prompt 从文本解析）
    let calls = res.toolCalls || [];
    if (proto === 'prompt' && calls.length === 0 && res.content) {
      calls = parsePromptToolCall(res.content);
    }

    if (calls.length === 0) {
      // 无工具调用：视为最终答案
      log.finish = { summary: (res.content || '').trim(), appliedOps: [] };
      break;
    }

    // 回灌 assistant 消息
    if (proto === 'prompt') {
      messages.push({ role: 'assistant', content: res.content || '' });
    } else {
      messages.push({
        role: 'assistant', content: res.content || '',
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argumentsRaw || JSON.stringify(c.arguments) } })),
      });
    }

    for (const call of calls) {
      totalToolCalls++;
      const t1 = Date.now();
      const disp = dispatchTool(toolCtx, call.name, call.arguments);
      const rec = {
        id: call.id, name: call.name,
        argsText: call.argumentsRaw || JSON.stringify(call.arguments),
        parsed: call.arguments,
        ok: disp.ok, ms: Date.now() - t1,
        resultBytes: disp.ok ? JSON.stringify(disp.result).length : 0,
        error: disp.ok ? null : disp.error,
      };
      roundRec.toolCalls.push(rec);
      log.toolStats[call.name] = (log.toolStats[call.name] || 0) + 1;

      if (disp.ok && call.name === 'finish') {
        log.finish = disp.result;
      }

      // 回灌 tool 结果
      if (proto === 'prompt') {
        messages.push({ role: 'user', content: `工具 ${call.name} 返回：${JSON.stringify(disp.result).slice(0, 2000)}` });
      } else {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(disp.result).slice(0, 4000) });
      }

      onEvent({ type: 'tool', runId, round, tool: call.name, ok: disp.ok, ms: rec.ms });

      if (isRepeat(lastTwoCalls, call.name, rec.argsText)) {
        // 死循环：强制收尾
        messages.push({ role: 'user', content: '检测到重复调用，请立即用 finish 总结当前结论，不要再次调用相同工具。' });
      }
      lastTwoCalls.push(`${call.name}|${rec.argsText}`);
      if (lastTwoCalls.length > 2) lastTwoCalls.shift();
    }

    log.rounds.push(roundRec);
    if (log.finish) break;
    if (totalToolCalls >= maxToolCalls) {
      log.errors.push(`达到工具调用上限 ${maxToolCalls}`);
      break;
    }
    if (Date.now() - startedAtMs > wallClockMs) {
      log.errors.push(`超过墙钟上限 ${wallClockMs}ms`);
      break;
    }
  }

  log.endedAt = nowIso();
  log.totalMs = Date.now() - startedAtMs;

  // 写执行日志（dryRun 也写，用于审计）
  const runDir = path.join(assetsDir, assetId, 'runs');
  fs.mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, `${runId}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  log.logPath = logPath;

  return log;
}

// prompt 协议：从文本解析首个 {"tool":..,"args":..}
function parsePromptToolCall(text) {
  const m = /(\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\})/.exec(text);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[1]);
    const args = obj.args ?? obj.arguments ?? {};
    return [{ id: `call_prompt_${Date.now()}`, name: String(obj.tool), arguments: args, argumentsRaw: JSON.stringify(args) }];
  } catch { return []; }
}
