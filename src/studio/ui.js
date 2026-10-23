// FORMA V5 — AI Studio 总装
//
// 把azin五个真实区域装配到既有的三层骨架里（sidebar / workspace / inspector），
// 共用同一个 Viewer 与同一份 DOM：不重复初始化 WebGL，不做第二次 canvas 挂载。
// .sidebar 里插入资源树；main.workspace 首部插工具条、尾部插 Dock；
// .inspector 里插 Lab 坞。可见性由 body.mode-studio / body.mode-gallery 控制。
import { el, $, toast } from '../utils/dom.js';
import { createStudioCore } from './core.js';
import { createAssetTree } from './tree.js';
import { createLabs } from './panes.js';
import { createDock } from './dock.js';
import { createStudioToolbar } from './toolbar.js';
import { createLayout } from './layout.js';

export function buildStudio({ viewer, appState, onPublish, onSyncLibrary, getLocalEntries, onPreview, onSelection }) {
  const workspace = document.querySelector('main.workspace') || $('workspace');
  const sidebar = document.querySelector('.sidebar') || $('sidebar');
  const inspectorBody = document.querySelector('.inspector-body');
  if (!workspace || !sidebar || !inspectorBody) {
    console.error('[studio] 骨架缺失，无法装配 Studio');
    return null;
  }

  let ui = null;      // 事件订阅时可能还没建好，用惰性引用
  const core = createStudioCore({
    viewer, appState, onPublish, onSyncLibrary, onSelection,
    onEvent: (type, payload) => handle(type, payload),
  });

  const tree = createAssetTree({ core, onPreview, toast });
  const toolbar = createStudioToolbar({
    core, toast,
    compareUI: () => ui,
    getBatchIds: () => tree.getBatchIds(),
    onResetLayout: () => { layout.reset(); dock.node.classList.remove('is-collapsed'); const c = dock.node.querySelector('#stDockCollapse'); if (c) c.textContent = '▾'; toast?.('已恢复默认布局', 'ok', 2200); },
  });
  const labs = createLabs({ viewer, core, toast });
  const dock = createDock({ core, toast, getBatchIds: () => tree.getBatchIds() });

  workspace.insertBefore(toolbar.node, workspace.firstChild);

  // ---------------------------------------------------------- 可拖拽布局 --
  const appRoot = document.getElementById('app');
  const layout = createLayout({ app: appRoot, workspace, viewer, onChange: () => { /* 尺寸由 CSS 变量承载 */ } });

  // 左：资源树宽度 / 右：Inspector 宽度（绝对定位，不参与 #app 的栅格分列）
  const handleLeft = layout.makeHandle('x', '调整左侧资源树宽度');
  const handleRight = layout.makeHandle('x', '调整右侧工具面板宽度');
  // 底：任务 Dock 高度（正常文档流，位于视口与 Dock 之间）
  const handleBottom = layout.makeHandle('y', '调整底部任务区高度');
  handleLeft.id = 'stHandleLeft';
  handleRight.id = 'stHandleRight';
  handleBottom.id = 'stHandleBottom';
  appRoot?.append(handleLeft, handleRight);

  layout.attachHandle(handleLeft, {
    axis: 'x', dir: 1,
    get: () => layout.current.sidebar,
    set: (v) => { layout.current.sidebar = v; },
    min: () => Math.min(layout.LIMITS.sidebarMin, layout.current.sidebar),
    max: () => Math.max(layout.LIMITS.sidebarMin, Math.min(layout.LIMITS.sidebarMax,
      (appRoot?.getBoundingClientRect().width || window.innerWidth) - layout.LIMITS.viewportMinW - layout.current.inspector)),
  });
  layout.attachHandle(handleRight, {
    axis: 'x', dir: -1,
    get: () => layout.current.inspector,
    set: (v) => { layout.current.inspector = v; },
    min: () => Math.min(layout.LIMITS.inspectorMin, layout.current.inspector),
    max: () => Math.max(layout.LIMITS.inspectorMin, Math.min(layout.LIMITS.inspectorMax,
      (appRoot?.getBoundingClientRect().width || window.innerWidth) - layout.LIMITS.viewportMinW - layout.current.sidebar)),
  });
  layout.attachHandle(handleBottom, {
    axis: 'y', dir: -1,
    get: () => layout.current.dockH,
    set: (v) => { layout.current.dockH = v; layout.current.dockCollapsed = false; },
    min: () => layout.LIMITS.dockMin,
    max: () => {
      // 以「当前视口高度还能让出多少」为准，保证中央视口永远 ≥ viewportMinH
      const vp = document.querySelector('.viewport')?.getBoundingClientRect().height || 0;
      const cur = layout.current.dockCollapsed ? layout.LIMITS.collapsedH : layout.current.dockH;
      return Math.max(layout.LIMITS.dockMin, cur + Math.max(0, vp - layout.LIMITS.viewportMinH));
    },
  });

  workspace.append(handleBottom);
  workspace.append(dock.node);
  sidebar.insertBefore(tree.node,sidebar.querySelector('.sidebar-body'));
  tree.node.addEventListener('click',e=>{if(e.target.closest('[data-asset], [data-version]'))sidebar.classList.remove('st-mobile-open');});
  inspectorBody.prepend(labs.node);

  // Dock 折叠 / 展开：交给布局系统，保证折叠后展开入口（头部）始终可见
  const dockCollapse = dock.node.querySelector('#stDockCollapse');
  dockCollapse?.addEventListener('click', () => {
    const collapsed = layout.toggleDock();
    dock.node.classList.toggle('is-collapsed', collapsed);
    dockCollapse.textContent = collapsed ? '▴' : '▾';
  });

  // 窗口尺寸 / 浏览器缩放变化：重新收敛所有保存值，避免恢复出界旧布局
  const reflow = () => {
    layout.reflow();
    dock.node.classList.toggle('is-collapsed', !!layout.current.dockCollapsed);
    const c = dock.node.querySelector('#stDockCollapse');
    if (c) c.textContent = layout.current.dockCollapsed ? '▴' : '▾';
  };
  window.addEventListener('resize', reflow);
  window.addEventListener('orientationchange', () => setTimeout(reflow, 120));

  // V5.1 之前的「AI 管线」折叠面板已被 Studio 的五个真实区域取代，
  // 这里把它整块下线（而不是隐藏后留个空壳），保证生产入口只有一处。
  const legacy = $('pipelineSect');
  if (legacy) legacy.hidden = true;

  let compareBoxMounted = false;
  function ensureCompareUI() {
    if (compareBoxMounted) return;
    const vp = document.querySelector('.viewport');
    if (!vp) return;
    const box = el('div', { class: 'st-compare-bar', id: 'stCompareBar', hidden: true },
      el('span', { class: 'st-compare-label' }, 'Before'),
      el('input', { type: 'range', id: 'stSplit', min: '0', max: '1', step: '0.01', value: '0.5', 'aria-label': '前后对比分割位置' }),
      el('span', { class: 'st-compare-label' }, 'After'),
      el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stCompareClose' }, '退出对比'),
    );
    vp.append(box);
    const split = box.querySelector('#stSplit');
    split.addEventListener('input', () => core.setCompareSplit(split.value));
    box.querySelector('#stCompareClose').addEventListener('click', () => core.exitCompare());
    ui = { compareBar: box, split };
    compareBoxMounted = true;
  }

  function handle(type, payload) {
    switch (type) {
      case 'connecting':
        toolbar.setStatus('connecting');
        break;
      case 'online':
        toolbar.setStatus('online', `资产 ${payload.assets} · 可用模型 ${payload.models}`);
        tree.renderAssets();
        dock.renderOps();
        labs.updateAll();
        tree.setLocalEntries(getLocalEntries?.() || []);
        break;
      case 'offline':
        toolbar.setStatus('offline', payload.error);
        tree.renderAssets();
        dock.showOfflineGuide();
        toast(payload.error || '后端未连接', 'err', 6000);
        break;
      case 'assets':
        tree.renderAssets();
        break;
      case 'select': {
        dock.clearConfirm();
        const asset = core.state.assets.find((a) => a.id === payload);
        toolbar.setAsset(asset?.name || payload || null);
        tree.renderAssets();
        tree.renderVersions(payload);
        labs.updateAll();
        break;
      }
      case 'selection':
        toolbar.setAsset(core.state.selection ? core.state.selection.name + ' · ' + (core.state.selectedVersion ? 'v' + core.state.selectedVersion : 'Original') : '载入失败');
        tree.renderVersions(core.state.selectedAsset);
        labs.updateAll();
        break;
      case 'analyze':
        labs.updateAll();
        dock.activate(core.state.lastRun ? 'verify' : 'process');
        break;
      case 'textures':
        labs.updateAll();
        break;
      case 'run':
        dock.clearConfirm();
        labs.updateAll();
        dock.render('verify');
        dock.activate('verify');
        tree.renderVersions(payload.assetId);
        break;
      case 'batch':
        dock.clearConfirm();
        dock.render('history');
        dock.activate('history');
        tree.renderAssets();
        break;
      case 'agent':
        dock.render('agent');
        dock.activate('agent');
        break;
      case 'history':
        dock.render('history');
        break;
      case 'compare':
        ensureCompareUI();
        if (ui?.compareBar) ui.compareBar.hidden = !payload;
        toolbar.setCompareAvailable(!!payload);
        break;
      case 'confirm':
        dock.showConfirm(payload.reasons || [], payload.action);
        dock.activate('process');
        break;
      case 'progress':
        dock.setBusy(payload.busy, payload.text);
        break;
      case 'log':
        if (payload.tone === 'err') toast(payload.text, 'err', 7000);
        else if (payload.tone === 'warn') toast(payload.text, 'warn', 5500);
        else toast(payload.text, 'ok', 4000);
        break;
      case 'export':
      case 'publish':
      case 'imported':
        labs.updateAll();
        break;
      default:
        break;
    }
  }

  let active = false;
  return {
    core, toolbar, tree, labs, dock, layout, reflow,
    // 进入 / 离开 Studio 的生命周期：只切换模式类与面板可见性，
    // 不改动 canvas 的挂载位置，也不销毁 Viewer。
    async enter() {
      active = true;
      const restore = core.state.selection;
      layout.setMode('studio');
      document.body.classList.add('mode-studio');
      document.body.classList.remove('mode-gallery');
      toolbar.node.hidden = false;
      tree.node.hidden = false;
      labs.node.hidden = false;
      dock.node.hidden = false;
      tree.refreshAll();
      labs.update();
      dock.renderOps();
      if (core.state.status !== 'online') await core.probe();
      else core.refreshAssets();
      if (active && restore && core.state.selection === restore) await core.selectAsset(restore.assetId, restore.version, {keepRun:true});
    },
    leave() {
      active = false;
      core.exitCompare();
      layout.setMode('gallery');
      document.body.classList.remove('mode-studio');
      document.body.classList.add('mode-gallery');
      toolbar.node.hidden = true;
      tree.node.hidden = true;
      labs.node.hidden = true;
      dock.node.hidden = true;
      if (ui?.compareBar) ui.compareBar.hidden = true;
      // 退出 Studio 时不销毁 CompareRig（用户可能回来看），但把模型交还 Viewer
    },
    refreshViewerPanels() { if (active) { labs.updateAll(); dock.render(core.state.lastAgent ? 'agent' : 'process'); } },
    get isActive() { return active; },
  };
}
