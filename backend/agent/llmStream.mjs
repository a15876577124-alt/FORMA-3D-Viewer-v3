// 流式 LLM 封装（供 Agent）：透传原生 tools/tool_choice，累积 tool_calls，采样原始 chunk 作为「AI 决策」证据。
import { getCloudClient } from '../llm.mjs';
import { createToolAccumulator, accumulateToolDelta, finalizeToolCalls } from './toolAccumulator.mjs';

// 单轮流式调用。messages 须以 system 开头。返回累积结果 + 原始 chunk 采样。
export async function streamLLM({ model, messages, tools, toolChoice, temperature = 0.3, maxTokens, signal, sampleLimit = 20 }) {
  const cloud = getCloudClient();
  const params = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature,
  };
  if (tools?.length) params.tools = tools;
  if (toolChoice) params.tool_choice = toolChoice;
  if (maxTokens) params.max_tokens = maxTokens;
  if (signal) params.signal = signal;

  let content = '';
  let reasoning = '';
  let finishReason = null;
  let usage = null;
  const acc = createToolAccumulator();
  const rawChunkSample = [];

  for await (const chunk of cloud.llm.chat.completions.create(params)) {
    signal?.throwIfAborted();
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) content += delta.content;
    if (delta?.reasoning_content) reasoning += delta.reasoning_content;
    if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage;
    if (delta?.tool_calls?.length) {
      accumulateToolDelta(acc, delta);
      if (rawChunkSample.length < sampleLimit) {
        rawChunkSample.push({ delta: { tool_calls: delta.tool_calls, content: delta.content ?? null } });
      }
    }
  }

  return {
    content,
    reasoning,
    finishReason,
    usage,
    toolCalls: finalizeToolCalls(acc),
    rawChunkSample,
  };
}
