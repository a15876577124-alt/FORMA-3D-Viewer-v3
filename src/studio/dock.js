// FORMA V5 — Studio 底部 Dock
// 可收起，四个页签：处理（算子 + 真实参数 + 进度 + 执行/批处理）、Agent 日志、
// 执行历史、结果验证。所有内容都由真实后端响应驱动，没有占位进度条。
import { el } from '../utils/dom.js';
import { buildOpParamEditor } from '../ui/opParams.js';
import { OFFLINE_GUIDE, fmtBytes } from './core.js';

export function createDock({ core, toast, getBatchIds }) {
  const node = el('section', { class: 'st-dock', id: 'studioDock' });

  // ---------------- 头部：页签 + 折叠 ----------------
  const tabs = [
    { id: 'process', label: '处理' },
    { id: 'agent', label: 'Agent 日志' },
    { id: 'history', label: '执行历史' },
    { id: 'verify', label: '结果验证' },
  ];
  const tabBar = el('div', { class: 'st-dock-tabs', role: 'tablist' });
  const stack = el('div', { class: 'st-dock-stack' });

  const statusPill = el('span', { class: 'st-progress-pill', id: 'stProgressPill' }, '就绪');
  const collapseBtn = el('button', { class: 'st-dock-btn', type: 'button', id: 'stDockCollapse', title: '收起 / 展开底部面板' }, '▾');

  const process = el('div', { class: 'st-dock-pane', 'data-pane': 'process' });
  const agent = el('div', { class: 'st-dock-pane', 'data-pane': 'agent' });
  const history = el('div', { class: 'st-dock-pane', 'data-pane': 'history' });
  const verify = el('div', { class: 'st-dock-pane', 'data-pane': 'verify' });
  stack.append(process, agent, history, verify);

  let activeId = 'process';
  for (const t of tabs) {
    const btn = el('button', { class: 'st-dock-tab', type: 'button', role: 'tab', 'data-pane': t.id, 'aria-selected': 'false' }, t.label);
    btn.addEventListener('click', () => activate(t.id));
    tabBar.append(btn);
  }

  function activate(id) {
    activeId = id;
    for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.dataset.pane === id));
    for (const p of stack.children) p.hidden = p.dataset.pane !== id;
    node.classList.remove('is-collapsed');
    render(id);
  }

  collapseBtn.addEventListener('click', () => {
    const collapsed = node.classList.toggle('is-collapsed');
    collapseBtn.textContent = collapsed ? '▴' : '▾';
  });

  node.append(el('div', { class: 'st-dock-head' }, tabBar, el('span', { class: 'st-dock-spacer' }), statusPill, collapseBtn), stack);

  // ---------------- 处理页：预设 / 算子 / 参数 / 执行 ----------------
  const presetSel = el('select', { class: 'st-select', id: 'stPresetSel' }, el('option', { value: '' }, '自定义（手动配置）'));
  const opsBox = el('div', { class: 'st-ops', id: 'stOps' });
  const paramHost = el('div', { class: 'st-params', id: 'stOpParams' });
  const dryCheck = el('input', { type: 'checkbox', id: 'stDryRun' });
  const runBtn = el('button', { class: 'st-btn st-btn-primary', type: 'button', id: 'stRunBtn' }, '执行');
  const batchBtn = el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stBatchBtn' }, '批处理选中');
  const adoptBtn = el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stAdoptBtn' }, '采纳 AI 建议');
  const confirmBox = el('div', { class: 'st-confirm', id: 'stConfirm', hidden: true });
  const progressBar = el('div', { class: 'st-progress', id: 'stProgressBar', hidden: true },
    el('div', { class: 'st-progress-fill' }),
    el('span', { class: 'st-progress-text' }, '处理中…'),
  );

  process.append(
    el('div', { class: 'st-dock-row' },
      el('label', { class: 'st-field st-inline' }, el('span', {}, '预设'), presetSel),
      el('span', { class: 'st-dock-spacer' }),
      el('label', { class: 'st-check' }, dryCheck, el('span', {}, '仅预览 dryRun')),
      adoptBtn,
      batchBtn,
      runBtn,
    ),
    confirmBox,
    progressBar,
    el('div', { class: 'st-dock-cols' },
      el('div', { class: 'st-col st-col-ops' }, el('div', { class: 'st-subhead' }, '算子（后端注册，ⓘ 悬停看说明）'), opsBox),
      el('div', { class: 'st-col st-col-params' }, el('div', { class: 'st-subhead' }, '参数'), paramHost),
    ),
  );

  let paramEditor = null;

  function renderOps() {
    opsBox.innerHTML = '';
    paramHost.innerHTML = '';
    paramEditor = buildOpParamEditor({
      ops: core.state.ops,
      values: core.state.opValues,
      onChange: (v) => { core.state.opValues = v; },
    });
    paramHost.append(paramEditor.node);
    for (const op of core.state.ops) {
      const risky = op.appearance === true;
      const cb = el('input', { type: 'checkbox', value: op.name, checked: core.state.enabledOps.has(op.name) });
      cb.addEventListener('change', () => {
        core.setOpEnabled(op.name, cb.checked);
        paramEditor?.setVisible(op.name, cb.checked);
      });
      const label = el('label', { class: 'st-check st-op-row', title: op.desc || op.label || op.name },
        cb,
        el('span', { class: 'st-op-name' }, op.label || op.name),
        el('span', { class: 'st-op-group' }, op.group || ''),
        risky ? el('em', { class: 'st-risk', title: '会改变外观，执行前需人工确认' }, '⚠') : null,
      );
      opsBox.append(label);
      paramEditor?.setVisible(op.name, core.state.enabledOps.has(op.name));
    }
    presetSel.innerHTML = '';
    presetSel.append(el('option', { value: '' }, '自定义（手动配置）'));
    for (const p of core.state.presets || []) presetSel.append(el('option', { value: p.id }, p.label));
  }

  function syncOpsUI() {
    for (const cb of opsBox.querySelectorAll('input[type="checkbox"]')) cb.checked = core.state.enabledOps.has(cb.value);
    if (paramEditor) core.state.opValues = paramEditor.getValues();
  }

  presetSel.addEventListener('change', () => {
    if (!presetSel.value) return;
    core.applyPreset(presetSel.value);
    renderOps();
  });
  runBtn.addEventListener('click', () => { syncOpsUI(); core.run({ dryRun: dryCheck.checked }); });
  batchBtn.addEventListener('click', () => {
    const ids = getBatchIds?.() || [];
    if (!ids.length) { toast?.('先在左侧资源树勾选要批处理的资产', 'warn'); return; }
    syncOpsUI();
    core.runBatch(ids);
  });
  adoptBtn.addEventListener('click', () => { core.adoptAgentSuggestion(); renderOps(); activate('process'); });

  // ---------------- Agent 日志 ----------------
  let agentGoal = '分析资产，提出方案，再执行必要的无损优化并验证结果。';
  function renderAgent() {
    agent.innerHTML = '';
    const goal = el('input',{class:'st-select',id:'stAgentGoal',value:agentGoal,'aria-label':'AI 任务目标'});
    goal.addEventListener('input',()=>{agentGoal=goal.value;});
    const button=(id,label,action)=>{const b=el('button',{id,class:'st-btn',type:'button'},label);b.addEventListener('click',action);return b;};
    agent.append(el('div',{class:'st-agent-controls'},goal,
      button('stAgentPreview','仅分析',()=>core.runAgent({goal:agentGoal,dryRun:true})),
      button('stAgentExecute','执行 AI 任务',()=>core.runAgent({goal:agentGoal,dryRun:false})),
      button('stAgentCancel','取消运行',()=>core.cancelAgent())));
    const res = core.state.lastAgent;
    if (!res) { agent.append(el('p', { class: 'st-hint' }, '还没有 AI 运行记录——顶部点「AI 优化」启动真实 LLM 调用。')); return; }
    const log = res.log || {};
    if(log.status==='awaiting_confirmation'){
      agent.append(el('p',{class:'st-confirm'},'确认以下操作后继续：'+JSON.stringify(log.confirmation.call.arguments)+'；'+(log.confirmation.reasons||[]).join('；')));
      agent.append(button('stAgentResume','确认并继续',()=>core.runAgent({resume:true})));
    }
    agent.append(el('p',{class:'st-hint'},'状态：'+log.status+' · 当前结果 v'+log.currentVersion+(log.dryRun?' · 仅分析，无资产写入':'')));
    agent.append(el('div', { class: 'st-log-head' }, `模型 ${log.model || '—'} · ${(log.rounds || []).length} 轮 · ${log.totalMs || 0}ms · runId ${res.runId || '—'}`));
    for (const r of log.rounds || []) {
      const calls = (r.toolCalls || []).map((t) => t.name).join(', ') || '(纯文本)';
      agent.append(el('div', { class: 'st-log-line' }, `轮 ${r.i}: ${calls} · ${r.llmMs}ms`));
      for (const t of r.toolCalls || []) {
        let args = t.parsed ?? t.arguments;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { /* 分片/容错后仍不可解析则原样显示 */ } }
        agent.append(el('div', { class: 'st-log-arg' }, `${t.name}(${args ? JSON.stringify(args).slice(0, 220) : ''})`));
      }
    }
    if (log.errors?.length) for (const e of log.errors) agent.append(el('div', { class: 'st-log-err' }, e));
    agent.append(el('p', { class: 'st-log-summary' }, log.finish?.summary || (log.errors?.length ? log.errors.join('; ') : '(无总结)')));
  }

  // ---------------- 执行历史 ----------------
  function renderHistory() {
    history.innerHTML = '';
    const items = core.state.history || [];
    if (!items.length) { history.append(el('p', { class: 'st-hint' }, '本次会话还没有执行记录。')); return; }
    for (const h of [...items].reverse()) {
      const at = new Date(h.at).toLocaleTimeString('zh-CN', { hour12: false });
      const desc = h.kind === 'run'
        ? `处理 ${h.assetId} → v${h.version}（${(h.ops || []).join(', ') || '无算子'}）`
        : h.kind === 'batch' ? `批处理 ${h.count} 个资产（成功 ${h.ok} / 失败 ${h.failed}）`
          : `AI 分析 run ${String(h.runId || '').slice(0, 8)} · ${h.model || 'LLM'} · ${h.rounds || 0} 轮`;
      history.append(el('div', { class: 'st-hist-row' }, el('span', { class: 'st-hist-time' }, at), el('span', { class: 'st-hist-desc' }, desc)));
    }
  }

  // ---------------- 结果验证 ----------------
  function renderVerify() {
    verify.innerHTML = '';
    const run = core.state.lastRun;
    if (!run) { verify.append(el('p', { class: 'st-hint' }, '还没有可验证的执行结果。')); return; }
    const v = run.verify || {};
    verify.append(el('div', { class: 'st-verify-head' + (v.pass ? ' is-ok' : ' is-bad') }, `v${run.version} · 后验${v.pass ? '通过' : '未通过'}`));
    const list = el('div', { class: 'st-verify-list' });
    for (const c of v.checks || []) {
      list.append(el('div', { class: 'st-verify-row' + (c.pass ? '' : ' is-bad') },
        el('span', { class: 'st-verify-name' }, c.name || c.check || 'check'),
        el('span', { class: 'st-verify-res' }, c.pass ? '通过' : '失败'),
        el('span', { class: 'st-verify-note' }, c.note || c.message || ''),
      ));
    }
    verify.append(list);
    if (!(v.checks || []).length) verify.append(el('p', { class: 'st-hint' }, '后端未返回逐项后验明细。'));
    verify.append(el('div', { class: 'st-subhead' }, '算子逐项变化'));
    for (const r of run.results || []) {
      verify.append(el('div', { class: 'st-change-row' },
        el('span', { class: 'st-change-op' }, r.op),
        el('span', { class: 'st-change-txt' }, (r.changes || []).join('；') || '(无变更)'),
      ));
    }
    verify.append(el('div', { class: 'st-subhead' }, '文件体积'));
    verify.append(el('div', { class: 'st-kv-row' },
      el('span', {}, `前 ${fmtBytes(run.before?.bytes)} → 后 ${fmtBytes(run.after?.bytes)}`),
    ));
  }

  function render(which) {
    if (which === 'agent' || which === 'all') renderAgent();
    if (which === 'history' || which === 'all') renderHistory();
    if (which === 'verify' || which === 'all') renderVerify();
    if (which === 'process' || which === 'all') renderOps();
  }

  function setBusy(busy, text) {
    progressBar.hidden = !busy;
    if (text) progressBar.querySelector('.st-progress-text').textContent = text;
    statusPill.textContent = busy ? (text || '处理中…') : '就绪';
    statusPill.classList.toggle('is-busy', busy);
  }

  function showConfirm(reasons, action = '执行') {
    confirmBox.hidden = false;
    confirmBox.innerHTML = '';
    confirmBox.append(el('strong', {}, '需要确认：'));
    for (const r of reasons) confirmBox.append(el('span', { class: 'st-confirm-reason' }, r));
    confirmBox.append(el('span', { class: 'st-hint' }, '再次点击「'+action+'」即视为确认。'));
  }
  function clearConfirm() { confirmBox.hidden = true; confirmBox.innerHTML = ''; }

  function showOfflineGuide() {
    process.querySelector('.st-dock-row').hidden = false;
    agent.innerHTML = '';
    const box = el('div', { class: 'st-offline' },
      el('strong', {}, OFFLINE_GUIDE.title),
      ...OFFLINE_GUIDE.lines.map((l) => el('code', { class: 'st-cmd' }, l)),
      el('p', { class: 'st-hint' }, OFFLINE_GUIDE.note),
    );
    agent.append(box);
    activate('agent');
  }

  node.hidden = true;
  return { node, render, setBusy, showConfirm, clearConfirm, showOfflineGuide, renderOps, syncOpsUI, activate, get activeId() { return activeId; } };
}
