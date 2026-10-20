// Application entry: wires detection -> renderer -> catalogue -> panels, and
// owns every cross-cutting action (switching exhibits, shortcuts, persistence).
import { detectCapabilities } from './core/capabilities.js';
import { Viewer } from './core/viewer.js';
import { ViewState } from './state/viewState.js';
import { AppState } from './state/appState.js';
import { BY_ID, CATALOG, FIGURINES, figurineOrdinal } from './models/catalog.js';
import { buildLibraryEntries, libraryEntryToCatalog } from './models/library.js';
import { buildSidebar } from './ui/sidebar.js';
import { buildPipelinePanel } from './ui/pipeline.js';
import { buildV5Shell, syncNavActive } from './ui/shell.js';
import { startRouter, registerRoute, setNotFound, onNavigate, navigate } from './core/router.js';
import { v5State } from './ui/feedback.js';
import { createHomePage } from './pages/home.js';
import { buildInspector } from './ui/inspector.js';
import { setupChrome } from './ui/chrome.js';
import { importFiles } from './loaders/registry.js';
import { describeError } from './loaders/errors.js';
import { $, el, setProgress, toast, fatal, formatNumber } from './utils/dom.js';

const pad2 = (n) => String(n).padStart(2, '0');

const FORMAT_LABEL = {
  glb: 'glTF 2.0 / GLB', gltf: 'glTF 2.0 / .gltf',
  obj: 'Wavefront OBJ', fbx: 'Autodesk FBX', procedural: 'Three.js 内置几何体',
};

function webglSupported() {
  const c = document.createElement('canvas');
  return !!(c.getContext('webgl2') || c.getContext('webgl'));
}

function boot() {
  if (!webglSupported()) {
    fatal('无法启动三维视图', '当前浏览器不支持 WebGL。请使用最新版 Chrome / Edge / Firefox / Safari，并确认没有在系统设置里关闭硬件加速。');
    return;
  }

  const caps = detectCapabilities();
  const canvas = $('stage');
  if (!canvas) { fatal('页面结构损坏', '找不到画布元素 #stage。'); return; }

  let viewer;
  try {
    viewer = new Viewer(canvas, caps);
  } catch (err) {
    console.error(err);
    const info = describeError(err);
    fatal('无法启动三维渲染器', info.message);
    return;
  }

  const viewState = new ViewState();
  const appState = new AppState();
  const extra = new Map();          // imported entries, keyed by id
  const libraryMap = new Map();     // published library entries, keyed by 'lib:' id
  const current = { entry: null };

  // Rehydrate library entries persisted in appState.
  for (const entry of buildLibraryEntries(appState.get().library)) {
    libraryMap.set(entry.id, entry);
  }

  const resolveEntry = (id) => BY_ID.get(id) || extra.get(id) || libraryMap.get(id) || null;
  const getEntry = () => current.entry;

  // ------------------------------------------------------------- panels ----
  const sidebar = buildSidebar({ onSelect: (id) => { select(id); } });

  const inspector = buildInspector({
    viewer, viewState, getEntry,
    onView: (state) => chrome.syncView(state),
  });

  // ------------------------------------------------------------- actions ---
  function toggle(field) {
    const entry = getEntry();
    if (!entry) return;
    const s = viewState.get(entry);
    s.view[field] = !s.view[field];
    viewState.touch();
    inspector.applyView();
  }

  function capture() {
    const entry = getEntry();
    if (!entry) return null;
    try {
      const url = viewer.capturePNG(2, viewer.currentFilename());
      toast('已导出 PNG 截图', 'ok');
      return url;
    } catch (err) {
      console.error(err);
      toast('截图失败：' + (err?.message || err), 'err', 8000);
      return null;
    }
  }

  function resetView() {
    const entry = getEntry();
    if (!entry) return;
    const s = viewState.get(entry);
    const best = entry.best || { yaw: 0.42, pitch: 0.2, distMul: 1, targetYMul: 0.5 };
    s.camera = { ...s.camera, ...best, fov: s.camera.fov };
    viewState.touch();
    viewer.applyViewAngle(false, s.camera);
    toast('已回到最佳展示视角', 'ok', 1800);
  }

  function setImmersive(on) {
    const next = on === undefined ? !document.body.classList.contains('mode-immersive') : !!on;
    viewer.setImmersive(next);
    chrome.setImmersiveUI(next);
  }

  function step(delta) {
    const entry = getEntry();
    const list = CATALOG;
    const i = entry ? list.findIndex((c) => c.id === entry.id) : 0;
    const next = list[((i + delta) % list.length + list.length) % list.length];
    select(next.id);
  }

  async function doImport(files) {
    return importFiles(files, viewer, {
      onMounted: (imported) => {
        if (!extra.has(imported.id)) {
          extra.set(imported.id, imported);
          sidebar.addImported(imported, (id) => select(id));
        }
        adoptImported(imported);
      },
    });
  }

  const chrome = setupChrome({
    toggleImmersive: () => setImmersive(),
    setImmersive,
    resetView,
    capture,
    step,
    toggle,
    importFiles: (files) => { doImport(files); },
  });

  // --------------------------------------------------------------- select --
  function updateMeta(entry) {
    const st = viewer.stats || {};
    const tri = st.tris ?? entry.tris;
    const vtx = st.verts ?? entry.verts;

    $('crumbItem').textContent = entry.name;
    $('objectName').textContent = entry.name;
    $('objectRoman').textContent = entry.sub || '';

    const ord = figurineOrdinal(entry.id);
    $('objNum').textContent = ord
      ? `${pad2(ord.index + 1)} / ${pad2(ord.total)}`
      : (entry.group === 'demos' ? 'TECHNICAL DEMO' : 'IMPORTED');

    $('objectCaption').textContent = [
      tri ? `${formatNumber(tri)} 三角形` : '',
      vtx ? `${formatNumber(vtx)} 顶点` : '',
    ].filter(Boolean).join(' · ');

    $('modelType').textContent = entry.formatLabel
      || (entry.procedural ? FORMAT_LABEL.procedural : null)
      || FORMAT_LABEL[st.format] || 'glTF 2.0 / GLB';
    $('meshCount').textContent = `${st.meshes ?? 0} 个网格`;

    $('immName').textContent = entry.name;
    $('immRoman').textContent = entry.sub || '';
    $('immIndex').textContent = ord
      ? `${pad2(ord.index + 1)} / ${pad2(ord.total)}`
      : (entry.group === 'demos' ? 'TECHNICAL DEMO' : 'IMPORTED');
  }

  // An import is adopted exactly like a catalogue exhibit - same wiring, same
  // per-exhibit parameter persistence - it just lives in its own sidebar group.
  async function adoptImported(entry) {
    current.entry = entry;
    const s = viewState.get(entry);
    inspector.sync(s);
    inspector.setAnimations(viewer.animations, 0);
    sidebar.select(entry.id);
    updateMeta(entry);
    viewer.applyStoredView(s);
    viewState.touch();
  }

  async function select(id, opts = {}) {
    const entry = resolveEntry(id);
    if (!entry) { toast('找不到展品：' + id, 'err'); return false; }

    // Hand the outgoing camera to its own exhibit before switching away.
    if (current.entry && current.entry.id !== entry.id) {
      try { viewState.get(current.entry).camera = viewer.readCamera(); } catch { /* no model yet */ }
      viewState.touch();
    }

    setProgress(2, '载入 ' + entry.name + '…');
    try {
      await viewer.showEntry(entry, opts);
    } catch (err) {
      setProgress(null);
      if (err && err.stale) return false;
      const info = describeError(err);
      console.error('[showEntry]', info.detail || err);
      toast(info.message, 'err', 9000);
      return false;
    }
    setProgress(null);

    current.entry = entry;
    const s = viewState.get(entry);
    inspector.sync(s);
    inspector.setAnimations(viewer.animations, 0);
    sidebar.select(entry.id);
    updateMeta(entry);
    viewer.applyStoredView(s);
    viewState.touch();

    // V3 行为：把展品写进 URL hash 以便分享。V5 引入 hash 路由后此写法会
    // 破坏路由（#sheng 会覆盖 #/gallery），故 V5 模式下跳过——分享链接由
    // V5 路由的 /gallery?work=<id> 承担。
    if (!document.getElementById('v5Outlet')) {
      try { history.replaceState(null, '', '#' + entry.id); } catch { /* file:// may refuse */ }
    }
    return true;
  }

  // Camera moves are persisted to the *current* exhibit only.
  viewer.onStateChange = () => {
    if (!current.entry) return;
    try { viewState.get(current.entry).camera = viewer.readCamera(); } catch { /* ignore */ }
    viewState.touch();
  };

  // ---------------------------------------------------------- pipeline -----
  // Pipeline 面板：惰性连接后端（启动零请求），挂到右栏最上方。
  const pipeline = buildPipelinePanel({
    viewer,
    appState,
    onPublish: (url, assetId) => {
      const file = url.split('/').pop();
      const item = { id: assetId, name: assetId, url, version: 1 };
      const entry = libraryEntryToCatalog(item);
      libraryMap.set(entry.id, entry);
      appState.addLibraryEntry(item);
      sidebar.addLibraryEntry(entry, (id) => select(id));
      toast('已加入展厅 · ' + file, 'ok');
    },
    // 连接后端后，把已发布的产物登记进左栏「资产库」组（按文件名去重，不重复添加）。
    onSyncLibrary: (files, assets) => {
      let added = 0;
      for (const f of files) {
        const file = String(f.file || f.url || '').split('/').pop();
        const m = /^(.+)-v(\d+)\.(glb|gltf)$/.exec(file);
        if (!m) continue;
        const [, assetId, ver] = m;
        const id = `${assetId}-v${ver}`;
        if (libraryMap.has('lib:' + id)) continue; // 已登记，跳过
        const src = (assets || []).find((a) => a.id === assetId);
        const item = {
          id,
          name: `${src?.name || assetId} · 已处理 v${ver}`,
          url: f.url || `/assets/library/${file}`,
          version: Number(ver),
          sourceId: assetId,
          bytes: f.bytes ?? null,
        };
        const entry = libraryEntryToCatalog(item);
        libraryMap.set(entry.id, entry);
        appState.addLibraryEntry(item);
        sidebar.addLibraryEntry(entry, (eid) => select(eid));
        added += 1;
      }
      return added;
    },
  });
  const inspectorBody = $('inspectorBody') || document.querySelector('#inspector .inspector-body');
  if (inspectorBody && inspectorBody.firstChild) inspectorBody.insertBefore(pipeline.node, inspectorBody.firstChild);
  else if (inspectorBody) inspectorBody.append(pipeline.node);

  // 顶栏模式切换按钮（动态插入，不新增静态 DOM）
  const pipelineBtn = el('button', { class: 'tool-btn', type: 'button', id: 'pipelineBtn', title: 'AI 管线工作模式' }, '管线');
  pipelineBtn.addEventListener('click', () => {
    const next = appState.getMode() === 'pipeline' ? 'gallery' : 'pipeline';
    appState.setMode(next);
    document.body.classList.toggle('mode-pipeline', next === 'pipeline');
    pipeline.node.open = next === 'pipeline';
    pipelineBtn.classList.toggle('active', next === 'pipeline');
    if (next === 'pipeline' && !pipeline.connected) toast('进入管线模式：点击面板「连接后端」开始', 'ok', 5000);
  });
  const tools = $('topbarTools') || document.querySelector('.topbar-tools');
  if (tools) tools.append(pipelineBtn);

  function setMode(mode) {
    appState.setMode(mode);
    document.body.classList.toggle('mode-pipeline', mode === 'pipeline');
    pipeline.node.open = mode === 'pipeline';
    pipelineBtn.classList.toggle('active', mode === 'pipeline');
    return appState.getMode();
  }

  // ------------------------------------------------------------ shortcuts --
  const KEYS = {
    r: () => resetView(),
    p: () => capture(),
    g: () => toggle('grid'),
    t: () => toggle('plinth'),
    w: () => toggle('wireframe'),
    f: () => chrome.toggleFullscreen(),
    i: () => setImmersive(),
    arrowleft: () => step(-1),
    arrowright: () => step(1),
  };

  window.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      toggle('autoRotate');
      return;
    }
    if (e.key === 'Escape') {
      if (!$('helpModal').hidden) { $('helpModal').hidden = true; return; }
      if (document.body.classList.contains('mode-immersive')) { setImmersive(false); return; }
      if ($('inspector').classList.contains('open')) { $('inspector').classList.remove('open'); $('shade').hidden = true; }
      return;
    }
    const fn = KEYS[(e.key || '').toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  });

  // Flush pending writes before the tab goes away, so nothing is lost.
  window.addEventListener('pagehide', () => viewState.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) viewState.flush(); });

  // ------------------------------------------------------------- startup ---
  const hash = (location.hash || '').replace(/^#/, '');
  const requested = caps.params.get('entry') || hash;
  const first = (requested && resolveEntry(requested)) || FIGURINES[0];

  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });

  if (caps.params.has('test')) {
    $('engineLabel').textContent = `本地运行 · TEST · ${caps.renderer ? caps.renderer.slice(0, 46) : 'unknown GPU'}`;
  } else if (caps.software) {
    $('engineLabel').textContent = '本地运行 · 软件渲染模式';
  }

  select(first.id).then((ok) => resolveReady(ok));

  // 视角预设（右栏「相机与环境」分组）：正/右/背/左/顶
  $('viewPresets')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-yaw]');
    if (!b) return;
    viewer.setViewPreset(Number(b.dataset.yaw), Number(b.dataset.pitch));
  });

  // --------------------------------------------------------- V5 shell ------
  // #app 作为常驻的「展厅图层」直接移入外壳；路由切换只改 hidden，
  // canvas 永不 detach，WebGL 上下文不会被回收。
  const existingApp = document.getElementById('app');
  const { shell: v5ShellNode, outlet, nav } = buildV5Shell({ version: 'V5' });
  document.body.append(v5ShellNode);
  v5ShellNode.insertBefore(existingApp, outlet);
  // 展厅层初始隐藏：路由首次激活 gallery 时由 router 显示。
  // 不隐藏的话，首帧 #app（未入 router 缓存）会盖住首页。
  existingApp.hidden = true;

  registerRoute('/',
    () => createHomePage({ catalog: CATALOG, version: '3.0.0' }),
    { title: () => 'FORMA V5 · 琼剧数字五相' });

  registerRoute('/gallery',
    () => ({
      node: existingApp,
      enter: ({ query }) => {
        const want = query?.work;
        if (want && BY_ID.has(want) && current.entry?.id !== want) select(want);
      },
    }),
    { title: () => 'FORMA V5 · 数字展厅' });

  setNotFound(() => v5State({
    tone: 'empty',
    title: '页面不存在',
    desc: '该地址尚未实装或拼写有误。',
    actionLabel: '返回首页',
    onAction: () => navigate('/'),
  }));

  // 兼容 V3 时代的分享链接（#sheng 等单段锚点）：重定向到展厅并选中该展品。
  // 必须最后注册，避免抢占具名路由。
  registerRoute('/:legacyId', ({ params }) => {
    const id = params.legacyId;
    if (BY_ID.has(id)) navigate(`/gallery?work=${encodeURIComponent(id)}`, { replace: true });
    else navigate('/', { replace: true });
    return { node: el('div', { hidden: true }) }; // 立即被重定向，节点只是占位
  });

  startRouter({ outlet });
  onNavigate(({ pattern }) => syncNavActive(nav, pattern));

  // Automation surface. Everything the test harness needs to assert real
  // rendering happens against this object - no mocking, no shortcuts.
  window.__FORMA = {
    version: '3.0.0',
    caps,
    viewer,
    viewState,
    appState,
    catalog: CATALOG.map((c) => ({ id: c.id, name: c.name, group: c.group, file: c.file })),
    ready,
    select,
    actions: { toggle, capture, resetView, setImmersive, step, importFiles: doImport, viewPreset: (y, p) => viewer.setViewPreset(y, p) },
    get current() { return current.entry; },
    get info() { return viewer.info; },
    renderNow: () => viewer.render(),
    flushState: () => viewState.flush(),
    // 资产库：把后端发布结果登记为展厅条目（只追加，不改现有字段）。
    library: {
      addEntry(item) {
        const entry = libraryEntryToCatalog(item);
        libraryMap.set(entry.id, entry);
        appState.addLibraryEntry(item);
        sidebar.addLibraryEntry(entry, (id) => select(id));
        return entry;
      },
      entries: () => [...libraryMap.values()],
    },
    // Pipeline 工作模式（惰性，不发启动请求）。
    pipeline: {
      setMode,
      getMode: () => appState.getMode(),
      connect: () => pipeline.connect(),
      get connected() { return pipeline.connected; },
      get selectedAsset() { return pipeline.selectedAsset; },
    },
    // V5 路由（供测试与调试驱动页面切换）。
    v5: { navigate, version: 'V5' },
  };

  return ready;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
