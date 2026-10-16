// Pipeline 工作模式面板：惰性连接后端（启动零请求），集成资产/AI 分析/算子/对比/发布。
import { pipelineApi } from '../net/api.js';
import { CompareRig } from '../core/compare.js';
import { el, $, toast, setProgress } from '../utils/dom.js';

const OPS_META = {
  weld: { label: '焊接顶点', appearance: false, note: '合并重复顶点' },
  dedup: { label: '去重', appearance: false, note: '合并重复 accessor/材质' },
  prune: { label: '清理未用', appearance: false, note: '移除未引用的数据', qiong: true },
  simplify: { label: '减面', appearance: true, note: '降低三角形数（高风险）' },
  quantize: { label: '量化', appearance: true, note: '压缩顶点精度' },
  genNormals: { label: '生成法线', appearance: true, note: '修复平滑着色' },
  fixMaterials: { label: '修复材质', appearance: true, note: '金属度/粗糙度归零' },
  setSampler: { label: '采样器', appearance: false, note: '三线性 + mipmap' },
  textureResize: { label: '缩放贴图', appearance: true, note: '缩小贴图（高风险）' },
  textureCompress: { label: '压缩贴图', appearance: true, note: 'WebP/JPEG 有损（高风险）' },
  convert: { label: '转换格式', appearance: true, note: 'glb/gltf/obj' },
};

export function buildPipelinePanel({ viewer, appState, onPublish }) {
  const state = { connected: false, assets: [], ops: [], tools: [], models: [], selectedAsset: null, lastRun: null, rig: null, confirmToken: null };

  const node = el('details', { class: 'sect', id: 'pipelineSect' });
  node.innerHTML = `<summary>AI 管线 <span class="sect-tag" id="pipelineStatus">未连接</span></summary>`;
  const body = el('div', { class: 'sect-body', id: 'pipelineBody' });

  // 连接区
  const connectBtn = el('button', { class: 'ghost-btn', type: 'button' }, '连接后端');
  const connectRow = el('div', { class: 'field' },
    el('label', {}, '后端'),
    el('span', { id: 'pipelineConn' }, '未连接'),
  );

  // 资产区
  const assetSel = el('select', { id: 'pipelineAssetSel', class: 'p-select' });
  const assetRow = el('div', { class: 'field' }, el('label', {}, '资产'), assetSel);

  // 算子区（动态生成 checkbox）
  const opsBox = el('div', { id: 'pipelineOps', class: 'p-ops' });

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
    connectRow, connectBtn,
    el('hr', {}),
    assetRow, opsBox, runBtn, dryCheck,
    el('hr', {}),
    aiBtn, aiLog,
    el('hr', {}),
    compareBox, publishBtn,
  );
  node.append(body);

  const status = (text, tone) => {
    const s = $('pipelineStatus');
    if (s) { s.textContent = text; s.className = 'sect-tag ' + (tone || ''); }
  };

  // ---------- 连接（唯一的首次请求入口） ----------
  async function connect() {
    setProgress(2, '连接后端…');
    try {
      const [health, opsRes, toolsRes, modelsRes, assetsRes] = await Promise.all([
        pipelineApi.health(),
        pipelineApi.ops(),
        pipelineApi.agentTools(),
        pipelineApi.models(),
        pipelineApi.assets(),
      ]);
      state.connected = true;
      state.ops = opsRes.ops || [];
      state.tools = toolsRes.tools || [];
      state.models = modelsRes.models || [];
      state.assets = assetsRes.assets || [];
      $('pipelineConn').textContent = `已连接 · ${state.assets.length} 资产`;
      status('已连接', 'ok');
      renderOps();
      renderAssets();
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
  assetSel.addEventListener('change', () => { state.selectedAsset = assetSel.value || null; });

  // ---------- 算子列表 ----------
  function renderOps() {
    opsBox.innerHTML = '';
    for (const op of state.ops) {
      const meta = OPS_META[op.name] || { label: op.name, appearance: op.appearance, note: '' };
      const risky = op.appearance === true || meta.qiong;
      const label = el('label', { class: 'check' },
        el('input', { type: 'checkbox', value: op.name, 'data-appearance': String(op.appearance === true) }),
        el('span', {}, meta.label),
        risky ? el('em', { class: 'p-risk', title: '会改变外观，需人工确认' }, ' ⚠') : null,
      );
      opsBox.append(label);
    }
  }

  function selectedOps() {
    return [...opsBox.querySelectorAll('input:checked')].map((c) => ({ op: c.value, params: {} }));
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
