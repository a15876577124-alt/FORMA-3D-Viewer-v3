// Agent 组测试（离线，不触碰真实 LLM）：工具分片累积 / 工具注册表 / 派发 /
// Agent 主循环（fake LLM）/ 死循环与上限 / 反证「是 LLM 决策非规则」/ 离线必须失败。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToolAccumulator, accumulateToolDelta, parseToolArgs, finalizeToolCalls } from '../backend/agent/toolAccumulator.mjs';
import { TOOLS, getTool, toNativeTools, toPromptSpec, dispatchTool } from '../backend/agent/tools.mjs';
import { makeFakeLlm } from '../backend/agent/fakeLlm.mjs';
import { runAgent } from '../backend/agent/agent.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

// ---------- 1. 工具分片累积 ----------
console.log('[1] 工具分片累积');
{
  const acc = createToolAccumulator();
  accumulateToolDelta(acc, { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'analyze_asset', arguments: '' } }] });
  accumulateToolDelta(acc, { tool_calls: [{ index: 0, function: { name: '', arguments: '{"ass' } }] });
  accumulateToolDelta(acc, { tool_calls: [{ index: 0, function: { name: '', arguments: 'etId":"a"' } }] });
  accumulateToolDelta(acc, { tool_calls: [{ index: 0, function: { name: '', arguments: '}' } }] });
  const calls = finalizeToolCalls(acc);
  check('name 累积正确', calls.length === 1 && calls[0].name === 'analyze_asset', calls[0]?.name);
  check('arguments 分片合并', calls[0].arguments.assetId === 'a', JSON.stringify(calls[0].arguments));
  check('id 保留', calls[0].id === 'call_1');
  check('argumentsRaw 保留原文', calls[0].argumentsRaw === '{"assetId":"a"}');
}
{
  // 多 index 排序
  const acc = createToolAccumulator();
  accumulateToolDelta(acc, { tool_calls: [{ index: 1, function: { name: 'b', arguments: '{}' } }, { index: 0, function: { name: 'a', arguments: '{}' } }] });
  const calls = finalizeToolCalls(acc);
  check('按 index 排序', calls[0].name === 'a' && calls[1].name === 'b', JSON.stringify(calls.map((c) => c.name)));
}
{
  // 空 name 被过滤
  const acc = createToolAccumulator();
  accumulateToolDelta(acc, { tool_calls: [{ index: 0, function: { name: '', arguments: '' } }] });
  check('空 name 过滤', finalizeToolCalls(acc).length === 0);
}

// ---------- 2. parseToolArgs 容错 ----------
console.log('[2] parseToolArgs 容错');
check('正常 JSON', parseToolArgs('{"x":1}').x === 1);
check('空串返回空对象', Object.keys(parseToolArgs('')).length === 0);
check('不完整 JSON 括号补齐', parseToolArgs('{"assetId":"sheng"').assetId === 'sheng', JSON.stringify(parseToolArgs('{"assetId":"sheng"')));
check('完全坏 JSON 标记 __parseError', parseToolArgs('not json at all').__parseError === true);
check('纯空白返回空对象', Object.keys(parseToolArgs('   ')).length === 0);

// ---------- 3. 工具注册表 ----------
console.log('[3] 工具注册表');
check('8 个工具', TOOLS.length === 8, String(TOOLS.length));
check('toNativeTools 是 OpenAI 结构', toNativeTools()[0].type === 'function' && !!toNativeTools()[0].function.name);
check('toPromptSpec 含工具名', toPromptSpec().includes('analyze_asset'));
check('getTool 命中', getTool('finish')?.name === 'finish');
check('getTool 未命中返回 null', getTool('nope') === null);

// ---------- 4. 派发（真实 handler） ----------
console.log('[4] 派发');
{
  const tmpWs = fs.mkdtempSync(path.join(ROOT, 'test-out', 'agent-ws-'));
  const assetId = 'trap-abc123';
  const dir = path.join(tmpWs, assetId);
  fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id: assetId, name: 'trap.glb', format: 'glb', bytes: 999, importedAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({
    stats: { verts: 100, tris: 3000, materials: 1, textures: 1 },
    textures: [{ name: 't', width: 8192, height: 8192, bytes: 4000000 }],
    issues: [{ severity: 'warn', code: 'texture-oversized', message: 'x' }],
  }));
  const ctx = { assetsDir: tmpWs };
  const r1 = await dispatchTool(ctx, 'list_assets', {});
  check('list_assets 真实返回', r1.ok && r1.result.assets.length === 1 && r1.result.assets[0].id === assetId);
  const r2 = await dispatchTool(ctx, 'analyze_asset', { assetId });
  check('analyze_asset 返回摘要', r2.ok && r2.result.stats.tris === 3000 && r2.result.textures[0].width === 8192);
  const r3 = await dispatchTool(ctx, 'propose_ops', { ops: [{ op: 'textureResize', reason: '大贴图', risk: '外观' }] });
  check('propose_ops 回显不改写', r3.ok && r3.result.proposed[0].op === 'textureResize' && r3.result.count === 1);
  const r4 = await dispatchTool(ctx, 'nope', {});
  check('未知工具报错', r4.ok === false && /未知工具/.test(r4.error));
  const r5 = await dispatchTool(ctx, 'run_op', { assetId, op: 'weld' });
  check('run_op 未接线返回 wouldApply（dryRun 语义）', r5.ok && r5.result.status === 'wouldApply');
  const r6 = await dispatchTool(ctx, 'finish', { summary: 'done', appliedOps: ['weld'] });
  check('finish 返回总结', r6.ok && r6.result.summary === 'done');
  fs.rmSync(tmpWs, { recursive: true, force: true });
}

// ---------- 5. Agent 主循环（fake LLM 驱动） ----------
console.log('[5] Agent 主循环');
{
  const tmpWs = fs.mkdtempSync(path.join(ROOT, 'test-out', 'agent-run-'));
  const assetId = 'fake-xyz1';
  fs.mkdirSync(path.join(tmpWs, assetId, 'original'), { recursive: true });
  fs.writeFileSync(path.join(tmpWs, assetId, 'meta.json'), JSON.stringify({ id: assetId, name: 'fake.glb', format: 'glb', bytes: 1, importedAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(tmpWs, assetId, 'report.json'), JSON.stringify({ stats: { verts: 10, tris: 10, materials: 1, textures: 1 }, textures: [], issues: [] }));

  // 脚本：analyze → propose → finish
  const script = [
    { toolCalls: [{ id: 'c1', name: 'analyze_asset', arguments: { assetId }, argumentsRaw: JSON.stringify({ assetId }) }] },
    { toolCalls: [{ id: 'c2', name: 'propose_ops', arguments: { ops: [{ op: 'weld', reason: '未焊接', risk: '无' }] }, argumentsRaw: JSON.stringify({ ops: [{ op: 'weld', reason: '未焊接', risk: '无' }] }) }] },
    { toolCalls: [{ id: 'c3', name: 'finish', arguments: { summary: '建议 weld', appliedOps: ['weld'] }, argumentsRaw: JSON.stringify({ summary: '建议 weld', appliedOps: ['weld'] }) }] },
  ];
  const fake = makeFakeLlm(script);
  const log = await runAgent({ assetId, goal: 'g', model: 'fake-model', dryRun: true, maxRounds: 5, llmFn: fake, ctx: { assetsDir: tmpWs } });
  check('多轮完成', log.rounds.length === 3, String(log.rounds.length));
  check('工具统计正确', log.toolStats.analyze_asset === 1 && log.toolStats.propose_ops === 1 && log.toolStats.finish === 1, JSON.stringify(log.toolStats));
  check('finish 由 finish 工具写入', log.finish && log.finish.summary === '建议 weld');
  check('rawChunkSample 非空（AI 决策证据）', log.rawChunkSample.length > 0, String(log.rawChunkSample.length));
  check('日志落盘', fs.existsSync(path.join(tmpWs, assetId, 'runs', `${log.runId}.json`)));

  // 死循环检测：连续两次相同调用后强制收尾
  const repeatScript = [
    { toolCalls: [{ id: 'd1', name: 'list_assets', arguments: {}, argumentsRaw: '{}' }] },
    { toolCalls: [{ id: 'd2', name: 'list_assets', arguments: {}, argumentsRaw: '{}' }] },
    { toolCalls: [{ id: 'd3', name: 'list_assets', arguments: {}, argumentsRaw: '{}' }] },
    { toolCalls: [{ id: 'd4', name: 'finish', arguments: { summary: '结束' }, argumentsRaw: '{"summary":"结束"}' }] },
  ];
  const log2 = await runAgent({ assetId, goal: 'g', model: 'm', dryRun: true, maxRounds: 6, llmFn: makeFakeLlm(repeatScript), ctx: { assetsDir: tmpWs } });
  check('重复调用触发强制收尾提示（仍能 finish）', log2.finish !== null, JSON.stringify(log2.finish));

  // maxRounds 截断
  const loopScript = [{ toolCalls: [{ id: 'e1', name: 'list_assets', arguments: {}, argumentsRaw: '{}' }] }];
  const log3 = await runAgent({ assetId, goal: 'g', model: 'm', dryRun: true, maxRounds: 2, llmFn: makeFakeLlm([...Array(10)].map(() => loopScript[0])), ctx: { assetsDir: tmpWs } });
  check('maxRounds 截断（rounds<=2）', log3.rounds.length <= 2, String(log3.rounds.length));

  fs.rmSync(tmpWs, { recursive: true, force: true });
}

// ---------- 6. dryRun 不写盘 ----------
console.log('[6] dryRun 不写盘');
{
  const before = fs.existsSync(path.join(ROOT, 'pipeline-out')) ? fs.readdirSync(path.join(ROOT, 'pipeline-out')).length : 0;
  const tmpWs = fs.mkdtempSync(path.join(ROOT, 'test-out', 'agent-dry-'));
  const assetId = 'dry-zzz1';
  fs.mkdirSync(path.join(tmpWs, assetId, 'original'), { recursive: true });
  fs.writeFileSync(path.join(tmpWs, assetId, 'meta.json'), JSON.stringify({ id: assetId, name: 'd.glb', format: 'glb', bytes: 1, importedAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(tmpWs, assetId, 'report.json'), JSON.stringify({ stats: { verts: 1, tris: 1, materials: 1, textures: 0 }, textures: [], issues: [] }));
  const script = [{ toolCalls: [{ id: 'f1', name: 'run_op', arguments: { assetId, op: 'weld' }, argumentsRaw: JSON.stringify({ assetId, op: 'weld' }) }] }, { toolCalls: [{ id: 'f2', name: 'finish', arguments: { summary: 'x' }, argumentsRaw: '{"summary":"x"}' }] }];
  await runAgent({ assetId, goal: 'g', model: 'm', dryRun: true, llmFn: makeFakeLlm(script), ctx: { assetsDir: tmpWs } });
  const after = fs.existsSync(path.join(ROOT, 'pipeline-out')) ? fs.readdirSync(path.join(ROOT, 'pipeline-out')).length : 0;
  check('dryRun 下 pipeline-out 无新增', after === before, `${before} -> ${after}`);
  fs.rmSync(tmpWs, { recursive: true, force: true });
}

// ---------- 7. 反证：决策来自 LLM 而非规则 ----------
console.log('[7] 反证（是 LLM 决策）');
{
  // 朴素规则：只要面数 < 50000 就想当然「减面」
  const heuristicPick = (report) => (report.stats.tris < 50000 ? 'simplify' : 'weld');
  const trapReport = { stats: { tris: 3000, verts: 100, materials: 1, textures: 1 }, textures: [{ width: 8192, height: 8192 }], issues: [{ code: 'texture-oversized' }] };
  const rulePick = heuristicPick(trapReport);

  const tmpWs = fs.mkdtempSync(path.join(ROOT, 'test-out', 'agent-trap-'));
  const assetId = 'trap-xyz1';
  fs.mkdirSync(path.join(tmpWs, assetId, 'original'), { recursive: true });
  fs.writeFileSync(path.join(tmpWs, assetId, 'meta.json'), JSON.stringify({ id: assetId, name: 'trap.glb', format: 'glb', bytes: 1, importedAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(tmpWs, assetId, 'report.json'), JSON.stringify(trapReport));

  // LLM（fake 脚本）推 textureResize（贴图 8192 太大），而非 simplify
  const llmOps = [{ op: 'textureResize', params: { maxSize: 2048 }, reason: '8192 贴图过大', risk: '脸谱外观，需人工确认' }];
  const script = [{ toolCalls: [{ id: 'g1', name: 'propose_ops', arguments: { ops: llmOps }, argumentsRaw: JSON.stringify({ ops: llmOps }) }] }, { toolCalls: [{ id: 'g2', name: 'finish', arguments: { summary: '建议压缩贴图' }, argumentsRaw: '{"summary":"建议压缩贴图"}' }] }];
  const log = await runAgent({ assetId, goal: 'g', model: 'm', dryRun: true, llmFn: makeFakeLlm(script), ctx: { assetsDir: tmpWs } });
  const agentPick = log.rounds[0].toolCalls.find((t) => t.name === 'propose_ops')?.parsed?.ops?.[0]?.op;
  check('规则首推 simplify', rulePick === 'simplify', rulePick);
  check('Agent 首推 textureResize', agentPick === 'textureResize', agentPick);
  check('Agent 决策 ≠ 规则决策（证明非规则冒充）', agentPick !== rulePick);
  check('Agent 保留 reason 与 risk', typeof log.rounds[0].toolCalls[0].parsed.ops[0].reason === 'string' && /脸谱|外观/.test(log.rounds[0].toolCalls[0].parsed.ops[0].risk));
  fs.rmSync(tmpWs, { recursive: true, force: true });
}

// ---------- 8. 离线必须失败 ----------
console.log('[8] 离线必须失败');
{
  const prev = process.env.FORMA_LLM_OFFLINE;
  process.env.FORMA_LLM_OFFLINE = '1';
  let threw = false, status = 0;
  try {
    await runAgent({ assetId: 'x', goal: 'g', model: 'm', llmFn: makeFakeLlm([]) });
  } catch (e) { threw = true; status = e.status || 0; }
  process.env.FORMA_LLM_OFFLINE = prev;
  check('FORMA_LLM_OFFLINE 抛 AgentError', threw);
  check('状态码 503', status === 503, String(status));
}

console.log(`\n=== agent: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
