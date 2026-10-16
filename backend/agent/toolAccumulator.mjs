// 工具调用分片累积器：把流式 delta.tool_calls 逐片合并为完整调用。
// 实测（deepseek-v4-pro）：首个分片带 id + 完整 name + 空 arguments，后续分片逐字符追加 arguments。
// 为稳健起见，id/name/arguments 均按累积处理。
export function createToolAccumulator() {
  return { byIndex: new Map(), order: [] };
}

export function accumulateToolDelta(acc, delta) {
  for (const tc of delta?.tool_calls || []) {
    const i = tc.index ?? 0;
    let e = acc.byIndex.get(i);
    if (!e) {
      e = { index: i, id: '', name: '', args: '' };
      acc.byIndex.set(i, e);
      acc.order.push(e);
    }
    if (tc.id && !e.id) e.id = tc.id; // 部分网关每片重发 id，只取首个非空
    if (tc.function?.name) e.name += tc.function.name; // name 理论上整片，累积以防分片
    if (tc.function?.arguments) e.args += tc.function.arguments;
  }
  return acc;
}

// 容错解析 arguments JSON：先直解；失败则做括号配平补齐后重试；再失败返回 __parseError 标记。
export function parseToolArgs(raw) {
  const s = (raw || '').trim();
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    // 尝试补齐未闭合的括号/引号
    const attempts = [s + '}', s + '"]}', s + '}]', s + '}}', s + '"}'];
    for (const cand of attempts) {
      try { return JSON.parse(cand); } catch { /* continue */ }
    }
    return { __parseError: true, raw: s };
  }
}

// 把累积器结果整理为有序调用数组（按 index 升序，跳过空 name）。
export function finalizeToolCalls(acc) {
  return acc.order
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((e) => ({
      id: e.id || `call_${e.index}`,
      name: e.name.trim(),
      arguments: parseToolArgs(e.args),
      argumentsRaw: e.args,
    }))
    .filter((e) => e.name);
}
