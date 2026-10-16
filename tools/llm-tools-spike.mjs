// M2 阻断门 Spike：验证主力模型 deepseek-v4-pro 能否通过「原生 tools」或「prompt 协议」产出工具调用。
// 产出：
//   test-out/llm-tools-spike.json      —— 每模型每路的 ok/latency/finishReason/toolName
//   test-assets/llm-chunks/<model>-<mode>.jsonl —— 原始 chunk 样本（离线回放 fixture）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCloudClient } from '../backend/llm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-out', 'llm-tools-spike.json');
const CHUNK_DIR = path.join(ROOT, 'test-assets', 'llm-chunks');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.mkdirSync(CHUNK_DIR, { recursive: true });

// 一个与 FORMA 相关的工具（原生 tools 用）
const NATIVE_TOOL = {
  type: 'function',
  function: {
    name: 'analyze_asset',
    description: '读取一个 3D 资产的几何/材质/贴图分析报告（只读）。',
    parameters: {
      type: 'object',
      properties: { assetId: { type: 'string', description: '资产 ID' } },
      required: ['assetId'],
    },
  },
};

const PROMPT_TOOL_SPEC = `可用工具（你只能用这些工具，每次调用输出一行 JSON）：
- analyze_asset(assetId)：读取资产分析报告（只读）
示例输出：{"tool":"analyze_asset","args":{"assetId":"sheng-6ce3cb51"}}
严格只输出一行 JSON，不要任何解释文字。`;

const cloud = getCloudClient();

// A 路：原生 tools 参数
async function nativePath(model) {
  const t0 = Date.now();
  let toolCalls = [];
  let finishReason = null;
  const samples = [];
  let captured = 0;
  for await (const chunk of cloud.llm.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: '你是 3D 资产分析助手。用户给出资产 ID 后，先调用 analyze_asset 工具读取报告。' },
      { role: 'user', content: '请分析资产 sheng-6ce3cb51。' },
    ],
    stream: true,
    tools: [NATIVE_TOOL],
    tool_choice: 'required',
  })) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.tool_calls?.length) {
      if (captured < 20) { samples.push(chunk); captured++; }
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        let e = toolCalls.find((x) => x.index === i);
        if (!e) { e = { index: i, id: '', name: '', args: '' }; toolCalls.push(e); }
        if (tc.id && !e.id) e.id = tc.id;
        if (tc.function?.name) e.name += tc.function.name;
        if (tc.function?.arguments) e.args += tc.function.arguments;
      }
    }
    if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
  }
  const first = toolCalls.sort((a, b) => a.index - b.index)[0];
  const ok = finishReason === 'tool_calls' && !!first?.name;
  const rec = {
    model, mode: 'native', ok,
    latencyMs: Date.now() - t0,
    finishReason,
    toolName: first?.name || null,
    argsText: first?.args || null,
    toolCallCount: toolCalls.length,
  };
  if (samples.length) {
    fs.writeFileSync(path.join(CHUNK_DIR, `${model}-native.jsonl`), samples.map((s) => JSON.stringify(s)).join('\n'));
  }
  return rec;
}

// B 路：prompt 协议（system 注入工具清单，解析文本 JSON）
async function promptPath(model) {
  const t0 = Date.now();
  let text = '';
  let finishReason = null;
  for await (const chunk of cloud.llm.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: PROMPT_TOOL_SPEC },
      { role: 'user', content: '请分析资产 sheng-6ce3cb51。' },
    ],
    stream: true,
    temperature: 0,
  })) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) text += delta.content;
    if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
  }
  // 解析首个 JSON 对象
  let toolName = null, args = null;
  const m = /[\s\S]*?(\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\})/.exec(text);
  if (m) {
    try {
      const obj = JSON.parse(m[1]);
      toolName = obj.tool; args = JSON.stringify(obj.args ?? obj.arguments ?? null);
    } catch { /* 忽略解析失败 */ }
  }
  const ok = !!toolName;
  const rec = { model, mode: 'prompt', ok, latencyMs: Date.now() - t0, finishReason, toolName, argsText: args, rawText: text.slice(0, 300) };
  fs.writeFileSync(path.join(CHUNK_DIR, `${model}-prompt.txt`), text);
  return rec;
}

const argv = process.argv.slice(2);
const argModels = argv.find((a) => a.startsWith('--models='))?.slice(9)?.split(',');
// 主力模型 deepseek-v4-pro 打头；其余仅作对照
const MODELS = argModels || ['deepseek-v4-pro', 'glm-5.3-flash', 'kimi-k2.7'];

const results = [];
for (const model of MODELS) {
  console.log(`\n=== ${model} ===`);
  for (const fn of [nativePath, promptPath]) {
    try {
      const r = await fn(model);
      results.push(r);
      console.log(`  [${r.mode}] ok=${r.ok} finish=${r.finishReason} tool=${r.toolName} ${r.latencyMs}ms`);
    } catch (e) {
      results.push({ model, mode: fn === nativePath ? 'native' : 'prompt', ok: false, error: e.message });
      console.log(`  [${fn === nativePath ? 'native' : 'prompt'}] ERROR ${e.message}`);
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const anyOk = results.some((r) => r.ok);
console.log(`\n=== 结果写入 ${OUT}（任一路 ok=${anyOk}）===`);
console.log(results.map((r) => `${r.model}/${r.mode}=${r.ok ? 'OK' : (r.error || r.finishReason || 'no-tool')}`).join('  '));
process.exit(anyOk ? 0 : 1);
