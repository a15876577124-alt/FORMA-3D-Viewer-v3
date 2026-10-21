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

export function buildStudio({ viewer, appState, onPublish, onSyncLibrary, getLocalEntries, onPreview }) {
  const workspace = document.querySelector('main.workspace') || $('workspace');
  const sidebar = document.querySelector('.sidebar') || $('sidebar');
  const inspectorBody = document.querySelector('.inspector-body');
  if (!workspace || !sidebar || !inspectorBody) {
    console.error('[studio] 骨架缺失，无法装配 Studio');
    return null;
  }

  let ui = null;      // 事件订阅时可能还没建好，用惰性引用
  const core = createStudioCore({
    viewer, appState, onPublish, onSyncLibrary,
    onEvent: (type, payload) => handle(type, payload),
  });

  const tree = createAssetTree({ core, onPreview, toast });
  const toolbar = createStudioToolbar({
    core, toast,
    compareUI: () => ui,
    getBatchIds: () => tree.getBatchIds(),
  });
  const labs = createLabs({ viewer, core, toast });
  const dock = createDock({ core, toast, getBatchIds: () => tree.getBatchIds() });

  workspace.insertBefore(toolbar.node, workspace.firstChild);
  workspace.append(dock.node);
  sidebar.append(tree.node);
  inspectorBody.append(labs.node);

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
        const asset = core.state.assets.find((a) => a.id === payload);
        toolbar.setAsset(asset?.name || payload || null);
        tree.renderAssets();
        tree.renderVersions(payload);
        labs.updateAll();
        break;
      }
      case 'analyze':
        labs.updateAll();
        dock.activate('process');
        break;
      case 'textures':
        labs.updateAll();
        break;
      case 'run':
        labs.updateAll();
        dock.render('verify');
        dock.activate('verify');
        tree.renderVersions(payload.assetId);
        break;
      case 'batch':
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
        dock.showConfirm(payload.reasons || []);
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
    core, toolbar, tree, labs, dock,
    // 进入 / 离开 Studio 的生命周期：只切换模式类与面板可见性，
    // 不改动 canvas 的挂载位置，也不销毁 Viewer。
    async enter() {
      active = true;
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
    },
    leave() {
      active = false;
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
