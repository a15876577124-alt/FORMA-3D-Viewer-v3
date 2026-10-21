// Pipeline 工作模式面板：惰性连接后端（启动零请求），集成资产/AI 分析/算子/对比/发布。
import { pipelineApi } from '../net/api.js';
import { CompareRig } from '../core/compare.js';
import { el, $, toast, setProgress } from '../utils/dom.js';
import { buildOpParamEditor, defaultParams } from './opParams.js';

export function buildPipelinePanel({ viewer, appState, onPublish, onSyncLibrary }) {
  const state = {
    connected: false, assets: [], ops: [], tools: [], models: [], presets: [],
    selectedAsset: null, lastRun: null, rig: null, confirmToken: null,
    paramValues: {},
  };

  const node = el('details', { class: 'sect', id: 'pipelineSect' });
  node.innerHTML = `<summary>AI 管线 <span class="sect-tag" id="pipelineStatus">未连接</span></summary>`;
  const body = el('div', { class: 'sect-body', id: 'pipelineBody' });

  // ---------- 工作流步骤指引（全部由面板真实状态驱动，不虚构进度） ----------
  const STEPS = ['连接后端', '选择资产', '配置算子', '执行处理', '对比导出'];
  const stepEls = STEPS.map((s) => el('span', { class: 'p-step' }, s));
  const stepsBox = el('div', { class: 'p-steps' }, ...stepEls);
  const stepHint = el('p', { class: 'p-step-hint' }, '');

  function updateSteps() {
    const checkedCount = opsBox.querySelectorAll('input:checked').length;
    const executed = !!(state.lastRun && state.lastRun.dryRun !== true);
    const done = [state.connected, !!state.selectedAsset, checkedCount > 0, executed, executed];
    let active = done.findIndex((d) => !d);
    if (active === -1) active = STEPS.length - 1;
    stepEls.forEach((sEl, i) => {
      sEl.className = 'p-step' + (i < active ? ' done' : i === active ? ' active' : '');
    });
    const hints = [
      '点击下方「连接后端」以启用资产处理功能。',
      '在「资产」下拉中选择要处理的模型。',
      '勾选需要的处理算子（带 ⚠ 的会改变外观，执行前需确认）。',
      executed ? '处理已完成，可在下方查看结果并导出。' : '点击「执行处理」开始（建议先勾选「仅预览」看效果）。',
      '使用下方滑条对比前后效果，满意后「加入展厅」或导出。',
    ];
    stepHint.textContent = hints[active];
  }

  // 连接区
  const connectBtn = el('button', { class: 'ghost-btn', type: 'button' }, '连接后端');
  const connectRow = el('div', { class: 'field' },
    el('label', {}, '后端'),
    el('span', { id: 'pipelineConn' }, '未连接'),
  );

  // 资产区
  const assetSel = el('select', { id: 'pipelineAssetSel', class: 'p-select' });
  const assetRow = el('div', { class: 'field' }, el('label', {}, '资产'), assetSel);

  // 算子区（动态生成 checkbox + 真实参数控件）
  const opsBox = el('div', { id: 'pipelineOps', class: 'p-ops' });

  // 处理预设（来自后端，与 CLI 共用同一份声明）
  const presetSel = el('select', { id: 'pipelinePresetSel', class: 'p-select' });
  presetSel.append(el('option', { value: '' }, '自定义（手动配置）'));
  const presetRow = el('div', { class: 'field' }, el('label', {}, '预设'), presetSel);

  // AI 区
  const aiBtn = el('button', { class: 'ghost-btn', type: 'button' }, '运行 AI 分析');
  const aiLog = el('div', { id: 'pipelineAiLog', class: 'p-log' });

  // 执行区
  const runBtn = el('button', { class: 'chip-solid', type: 'button' }, '执行处理');
  const dryCheck = el('label', { class: 'check' }, el('input', { type: 'checkbox', id: 'pipelineDry' }), el('span', {}, '仅预览（dryRun）'));

  // 对比区
  const compareBox = el('div', { id: 'pipelineCompare', class: 'p-compare', hidden: true });
  const splitInput = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.5', id: 'pipelineSplit' });
  const compareLabel = el('div', { class: 'p-compare-label' }, el('span', {}, 'Before'), el('span', {}, 'After'));
  compareBox.append(compareLabel, splitInput);

  // 发布区
  const publishBtn = el('button', { class: 'ghost-btn', type: 'button' }, '加入展厅');

  body.append(
    stepsBox, stepHint,
    connectRow, connectBtn,
    el('hr', {}),
    assetRow, presetRow, opsBox, runBtn, dryCheck,
    el('hr', {}),
    aiBtn, aiLog,
    el('hr', {}),
    compareBox, publishBtn,
  );
  node.append(body);

  // 状态变化点刷新步骤指引
  opsBox.addEventListener('change', updateSteps);
  assetSel.addEventListener('change', updateSteps);

  const status = (text, tone) => {
    const s = $('pipelineStatus');
    if (s) { s.textContent = text; s.className = 'sect-tag ' + (tone || ''); }
  };

  // ---------- 连接（唯一的首次请求入口） ----------
  async function connect() {
    setProgress(2, '连接后端…');
    try {
      const [health, opsRes, toolsRes, modelsRes, assetsRes, presetsRes] = await Promise.all([
        pipelineApi.health(),
        pipelineApi.ops(),
        pipelineApi.agentTools(),
        pipelineApi.models(),
        pipelineApi.assets(),
        // 预设属于增强能力：缺失不应阻断整个面板连接
        pipelineApi.presets().catch(() => ({ presets: [] })),
      ]);
      state.connected = true;
      updateSteps();
      connectBtn.textContent = '重新连接 / 刷新资产';
      state.ops = opsRes.ops || [];
      state.tools = toolsRes.tools || [];
      state.models = modelsRes.models || [];
      state.assets = assetsRes.assets || [];
      state.presets = presetsRes.presets || [];
      // 重建选项（重复连接时避免累积重复项）
      presetSel.innerHTML = '';
      presetSel.append(el('option', { value: '' }, '自定义（手动配置）'));
      for (const p of state.presets) {
        presetSel.append(el('option', { value: p.id }, p.label));
      }
      presetSel.onchange = () => {
        if (presetSel.value) applyPreset(presetSel.value);
      };
      $('pipelineConn').textContent = `已连接 · ${state.assets.length} 资产`;
      status('已连接', 'ok');
      renderOps();
      renderAssets();

      // 连接后同步「已发布到资产库」的处理产物，使其在左栏资产库组可见。
      // 启动路径不请求后端（保持零请求），这里由用户显式点击「连接」触发。
      try {
        const pub = await pipelineApi.libraryPublished();
        const added = onSyncLibrary ? (onSyncLibrary(pub.files || [], state.assets) || 0) : 0;
        if (added > 0) toast(`已同步 ${added} 个处理产物到资产库组`, 'ok', 5000);
      } catch { /* 资产库不可读不影响主流程 */ }
      setProgress(null);
    } catch (e) {
      state.connected = false;
      $('pipelineConn').textContent = '连接失败';
      status('未连接', 'err');
      setProgress(null);
      toast('后端未连接：请先运行 npm run pipeline:serve', 'err', 8000);
    }
  }

  // ---------- 资产列表 ----------
  function renderAssets() {
    assetSel.innerHTML = '';
    assetSel.append(el('option', { value: '' }, '选择资产…'));
    for (const a of state.assets) {
      assetSel.append(el('option', { value: a.id }, `${a.name} (${a.format})`));
    }
    if (state.assets.length === 0) toast('工作区暂无资产，请先通过导入或批量处理生成', 'warn');
  }
  assetSel.addEventListener('change', () => { state.selectedAsset = assetSel.value || null; updateSteps(); });

  // ---------- 算子列表 ----------
  let paramEditor = null;

  function renderOps() {
    opsBox.innerHTML = '';
    paramEditor = buildOpParamEditor({
      ops: state.ops,
      values: state.paramValues,
      onChange: (v) => { state.paramValues = v; },
    });

    for (const op of state.ops) {
      const risky = op.appearance === true;
      const cb = el('input', { type: 'checkbox', value: op.name });
      const label = el('label', { class: 'check' },
        cb,
        el('span', {}, op.label || op.name),
        risky ? el('em', { class: 'p-risk', title: '会改变外观，需人工确认' }, ' ⚠') : null,
      );
      cb.addEventListener('change', () => { paramEditor?.setVisible(op.name, cb.checked); updateSteps(); });

      const row = el('div', { class: 'p-op-row' }, label);
      const group = paramEditor.node.querySelector(`[data-op="${op.name}"]`);
      if (group) row.append(group);
      opsBox.append(row);
    }
  }

  function selectedOps() {
    const values = paramEditor ? paramEditor.getValues() : {};
    return [...opsBox.querySelectorAll('input:checked')]
      .map((c) => ({ op: c.value, params: values[c.value] || {} }));
  }

  // 应用预设：勾选算子 + 写入参数（预设来自后端声明，界面不自行捏造）
  function applyPreset(id) {
    const preset = (state.presets || []).find((p) => p.id === id);
    if (!preset) return;
    const next = {};
    for (const { op, params } of preset.ops) next[op] = { ...(params || {}) };
    paramEditor?.setValues(next);
    for (const cb of opsBox.querySelectorAll('input[type="checkbox"]')) {
      const want = preset.ops.some((o) => o.op === cb.value);
      cb.checked = want;
      paramEditor?.setVisible(cb.value, want);
    }
    updateSteps();
    toast(`已应用预设：${preset.label}`, 'ok', 3000);
  }

  // ---------- 执行处理 ----------
  async function runPipeline() {
    if (!state.connected) return toast('请先连接后端', 'warn');
    if (!state.selectedAsset) return toast('请先选择资产', 'warn');
    const ops = selectedOps();
    if (!ops.length) return toast('请至少勾选一个算子', 'warn');
    const dryRun = $('pipelineDry')?.checked === true;
    setProgress(2, '处理中…');
    try {
      const res = await pipelineApi.run(state.selectedAsset, ops, state.confirmToken, dryRun);
      state.confirmToken = null;
      if (res.dryRun) {
        toast('预览：' + res.wouldApply.map((w) => w.op).join(', '), 'ok', 5000);
      } else {
        toast(`完成 v${res.version} · 后验 ${res.verify?.pass ? '通过' : '失败'}`, res.verify?.pass ? 'ok' : 'err', 6000);
        state.lastRun = res;
        updateSteps();
        if (res.verify?.pass) showCompare();
      }
      setProgress(null);
    } catch (e) {
      setProgress(null);
      if (e.status === 409 && e.data?.needConfirm) {
        state.confirmToken = e.data.token;
        toast('该操作会改变外观，请再次点击「执行处理」确认', 'warn', 6000);
      } else {
        toast('处理失败：' + e.message, 'err', 8000);
      }
    }
  }

  // ---------- AI 分析 ----------
  async function runAgent() {
    if (!state.connected) return toast('请先连接后端', 'warn');
    if (!state.selectedAsset) return toast('请先选择资产', 'warn');
    aiLog.textContent = 'AI 分析中…';
    try {
      const res = await pipelineApi.agentRun({ assetId: state.selectedAsset, goal: '请分析该资产，给出处理建议（不要实际执行算子）', dryRun: true });
      appState.addRecentRun(res.runId);
      renderAgentLog(res.log);
    } catch (e) {
      aiLog.textContent = 'AI 分析失败：' + e.message;
    }
  }

  function renderAgentLog(log) {
    aiLog.innerHTML = '';
    const summary = log.finish?.summary || (log.errors?.length ? log.errors.join('; ') : '(无总结)');
    aiLog.append(el('div', { class: 'p-log-head' }, `模型 ${log.model} · ${log.rounds.length} 轮 · ${log.totalMs}ms`));
    for (const r of log.rounds || []) {
      const tools = r.toolCalls.map((t) => t.name).join(', ');
      aiLog.append(el('div', { class: 'p-log-line' }, `轮 ${r.i}: ${tools || '(文本)'} ${r.llmMs}ms`));
    }
    aiLog.append(el('div', { class: 'p-log-summary' }, summary));
  }

  // ---------- Before/After 对比 ----------
  async function showCompare() {
    if (!state.lastRun) return;
    // 简化：对比需要加载 before/after 两个模型；此处提示 + 占位（完整加载由 M6 演示脚本驱动）
    compareBox.hidden = false;
    toast('对比功能：请在演示脚本中加载 before/after 模型', 'warn', 5000);
  }
  splitInput.addEventListener('input', () => { if (state.rig) state.rig.setSplit(Number(splitInput.value)); });

  // ---------- 发布 ----------
  async function publish() {
    if (!state.connected || !state.selectedAsset) return toast('请先连接并选择资产', 'warn');
    try {
      const res = await pipelineApi.publish(state.selectedAsset, 1);
      onPublish(res.url, state.selectedAsset);
      toast('已加入展厅', 'ok');
    } catch (e) {
      toast('发布失败：' + e.message, 'err', 8000);
    }
  }

  connectBtn.addEventListener('click', connect);
  runBtn.addEventListener('click', runPipeline);
  aiBtn.addEventListener('click', runAgent);
  publishBtn.addEventListener('click', publish);

  return {
    node,
    connect,
    renderAssets,
    runPipeline,
    runAgent,
    publish,
    CompareRig,
    get selectedAsset() { return state.selectedAsset; },
    get connected() { return state.connected; },
  };
}
