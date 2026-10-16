// 离线回放 fake LLM：供无网自动化测试驱动 Agent 循环（不触碰真实模型）。
// 铁律：fake 只用于测试；真实路径绝不经由 fake（FORMA_AGENT_FAKE_LLM 由测试显式注入 llmFn）。
import fs from 'node:fs';
import path from 'node:path';

// 构造一个脚本化 fake LLM。script 为 streamLLM 返回结构的数组，按序返回；耗尽后返回 finish 结束。
export function makeFakeLlm(script) {
  let i = 0;
  return async () => {
    if (i >= script.length) {
      return { content: '任务完成', finishReason: 'stop', toolCalls: [], usage: { total_tokens: 0 }, rawChunkSample: [] };
    }
    const step = script[i++];
    return {
      content: step.content || '',
      reasoning: step.reasoning || '',
      finishReason: step.finishReason || (step.toolCalls?.length ? 'tool_calls' : 'stop'),
      usage: step.usage || null,
      toolCalls: step.toolCalls || [],
      rawChunkSample: step.toolCalls?.length ? [{ delta: { tool_calls: step.toolCalls.map((c) => ({ id: c.id, function: { name: c.name, arguments: '' }, index: 0 })) } }] : [],
    };
  };
}

// 从 chunk 样本 jsonl 构造 fake：把每行解析出的 delta.tool_calls 累积成完整调用。
// 仅用于验证「分片累积」逻辑本身，不模拟多轮对话。
export function makeFakeLlmFromChunkSample(model, mode = 'native') {
  const p = path.resolve(process.cwd(), 'test-assets', 'llm-chunks', `${model}-${mode}.jsonl`);
  if (!fs.existsSync(p)) throw new Error(`chunk 样本不存在: ${p}`);
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const byIndex = new Map();
  for (const line of lines) {
    const chunk = JSON.parse(line);
    const delta = chunk.choices?.[0]?.delta;
    for (const tc of delta?.tool_calls || []) {
      const i = tc.index ?? 0;
      let e = byIndex.get(i);
      if (!e) { e = { id: tc.id || '', name: '', args: '' }; byIndex.set(i, e); }
      if (tc.id && !e.id) e.id = tc.id;
      if (tc.function?.name) e.name += tc.function.name;
      if (tc.function?.arguments) e.args += tc.function.arguments;
    }
  }
  const toolCalls = [...byIndex.values()].map((e) => ({ id: e.id || `call_${e.index}`, name: e.name.trim(), arguments: safeJson(e.args), argumentsRaw: e.args }));
  return makeFakeLlm([{ toolCalls }]);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return { __parseError: true, raw: s }; }
}
