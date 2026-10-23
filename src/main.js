import { createBrand } from './ui/brand.js';
import { IS_SHOWCASE } from './runtime.js';
// Application entry: wires detection -> renderer -> catalogue -> panels, and
// owns every cross-cutting action (switching exhibits, shortcuts, persistence).
import { detectCapabilities } from './core/capabilities.js';
import { Viewer } from './core/viewer.js';
import { ViewState } from './state/viewState.js';
import { AppState } from './state/appState.js';
import { BY_ID, CATALOG, FIGURINES, figurineOrdinal } from './models/catalog.js';
import { buildLibraryEntries, libraryEntryToCatalog } from './models/library.js';
import { buildSidebar } from './ui/sidebar.js';
import { buildGalleryMode } from './ui/gallery.js';
import { buildStudio } from './studio/ui.js';
import { buildV5Shell, syncNavActive } from './ui/shell.js';
import { startRouter, registerRoute, setNotFound, onNavigate, navigate } from './core/router.js';
import { v5State } from './ui/feedback.js';
import { createHomePage } from './pages/home.js';
import { createWorkPage } from './pages/work.js';
import { buildInspector } from './ui/inspector.js';
import { setupChrome } from './ui/chrome.js';
import { importFiles } from './loaders/registry.js';
import { describeError } from './loaders/errors.js';
import { $, el, setProgress, toast, clearToasts, fatal, formatNumber } from './utils/dom.js';

const pad2 = (n) => String(n).padStart(2, '0');

const FORMAT_LABEL = {
  glb: 'glTF 2.0 / GLB', gltf: 'glTF 2.0 / .gltf',
  obj: 'Wavefront OBJ', fbx: 'Autodesk FBX', procedural: 'Three.js 内置几何体',
};

function webglSupported() {
  const c = document.createElement('canvas');
  const gl=c.getContext('webgl2') || c.getContext('webgl');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return !!gl;
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
  let resolveReady;
  // 观展模式 / AI Studio 在下方构建；这里先占位，供早于它们执行的钩子安全访问。
  let gallery = null;
  let studio = null;

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
    if(studio?.isActive)return studio.core.importFiles([...files]);
    return importFiles(files, viewer, {
      onMounted: (imported) => {
        if (!extra.has(imported.id)) {
          extra.set(imported.id, imported);
          sidebar.addImported(imported, (id) => select(id));
        }
        adoptImported(imported);
        // 本地预览条目进 Studio 资源树（明确标注「未上传后端」）
        try { studio?.tree?.setLocalEntries([...extra.values()].map((e) => ({ id: e.id, name: e.name, format: e.format || 'model' }))); } catch { /* ignore */ }
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

    // 观展信息卡：跟随当前展品刷新（同一份真实数据，不做二次估算）
    try { gallery?.syncInfo(entry); } catch { /* 面板尚未构建 */ }
    // AI Studio 的实时面板（材质/几何/贴图）依赖当前载入的模型
    try { studio?.refreshViewerPanels(); } catch { /* 同上 */ }
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
    if(studio?.isActive)return studio.core.selectEntry(entry);

    // Hand the outgoing camera to its own exhibit before switching away.
    if (current.entry && current.entry.id !== entry.id) {
      try { viewState.get(current.entry).camera = viewer.readCamera(); } catch { /* no model yet */ }
      viewState.touch();
    }

    setProgress(2, '载入 ' + entry.name + '…');
    try {
      if (!await viewer.showEntry(entry, opts)) return false;
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
    resolveReady?.(true);
    return true;
  }

  // Camera moves are persisted to the *current* exhibit only.
  viewer.onStateChange = () => {
    if (!current.entry) return;
    try { viewState.get(current.entry).camera = viewer.readCamera(); } catch { /* ignore */ }
    viewState.touch();
  };

  // ------------------------------------------------------------ Gallery --
  // Gallery 观展模式：右栏策展化 + 高级控制台抽屉 + 隐藏生产工具。
  gallery = buildGalleryMode({
    viewer, capture, resetView,
    // Gallery 的辅助信息栏折叠走同一套布局系统（状态按模式分别保存）
    onToggleRail: () => {
      const hidden = studio?.layout?.toggleRail();
      toast(hidden ? '已收起右侧信息栏' : '已展开右侧信息栏', 'ok', 2000);
    },
  });
  // ------------------------------------------------------------- Studio --
  // AI Studio 是独立的工作区（顶部工具条 / 左侧资源树 / 中央视口 / 右侧 Lab 坞 /
  // 底部任务 Dock），与 Gallery 共用同一个 Viewer 与同一份 DOM，不重复初始化 WebGL。
  studio = buildStudio({
    viewer,
    appState,
    onSelection: (entry) => { current.entry = entry; sidebar.select(entry.id); updateMeta(entry); inspector.setAnimations(viewer.animations, 0); },
    onPublish: (url, assetId, res) => {
      const file = String(url).split('/').pop();
      const item = { id: assetId + '-v' + res.version, sourceId:assetId, name:assetId + ' · v' + res.version, url, version:res.version };
      const entry = libraryEntryToCatalog(item);
      libraryMap.set(entry.id, entry);
      appState.addLibraryEntry(item);
      sidebar.addLibraryEntry(entry, (id) => select(id));
      toast('已发布到展厅资产库 · ' + file, 'ok');
    },
    // 连接后端后，把已发布的产物登记进左栏「资产库」组（按文件名去重）
    onSyncLibrary: (files, assets) => {
      let added = 0;
      for (const f of files) {
        const file = String(f.file || f.url || '').split('/').pop();
        const m = f.assetId && f.version ? [null,f.assetId,String(f.version)] : /^(.+)-v(\d+)\.(glb|gltf)$/.exec(file);
        if (!m) continue;
        const [, assetId, ver] = m;
        const id = `${assetId}-v${ver}`;
        if (libraryMap.has('lib:' + id)) continue;
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
    // 本地预览条目（拖进来但还没上传到后端）——在资源树里单列，不与后端资产混淆
    getLocalEntries: () => [...extra.values()].map((e) => ({ id: e.id, name: e.name, format: e.format || 'model' })),
    onPreview: (id) => select(id),
  });

  // V5 之前挂在右栏顶部的「AI 管线」折叠面板已由 Studio 的五个区域取代，
  // 这里不再构建，保证生产入口只有一个。
  function setMode(mode) {
    const next = mode === 'pipeline' ? 'studio' : 'gallery';
    if (IS_SHOWCASE && next === 'studio') { navigate('/studio'); return next; }
    appState.setMode(next === 'studio' ? 'pipeline' : 'gallery');
    if (next === 'studio') {
      gallery.leave();
      studio?.enter();
    } else {
      studio?.leave();
      gallery.enter();
      if (current.entry) gallery.syncInfo(current.entry);
    }
    return next;
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


  const ready = new Promise((r) => { resolveReady = r; });

  if (caps.params.has('test')) {
    $('engineLabel').textContent = `本地运行 · TEST · ${caps.renderer ? caps.renderer.slice(0, 46) : 'unknown GPU'}`;
  } else if (caps.software) {
    $('engineLabel').textContent = '本地运行 · 软件渲染模式';
  }

  // Home owns its real 3D Hero; the hidden Gallery loads only on entry.

  // 默认站在观展一侧：路由未接管前也保持 Gallery 视觉语言
  document.body.classList.add('mode-gallery');

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
  const legacyBrand=document.querySelector('#sidebar .brand');
  if(legacyBrand)legacyBrand.replaceChildren(createBrand({size:'small',lockup:'wordmark'}));
  v5ShellNode.insertBefore(existingApp, outlet);
  // 展厅层初始隐藏：路由首次激活 gallery 时由 router 显示。
  // 不隐藏的话，首帧 #app（未入 router 缓存）会盖住首页。
  existingApp.hidden = true;

  registerRoute('/',
    () => createHomePage({
      catalog: CATALOG,
      version: '3.0.0',
      appState,
      // 启动台「导入模型」走与侧栏同一条真实导入链路
      onImportFiles: (files) => doImport(files),
    }),
    { title: () => 'FORMA V5 · 琼剧数字五相' });

  // Gallery / Studio 是「模式」而非一次性页面：实例只构建一次并复用，
  // 否则 ?work=<id> 这类不同 cacheKey 会各自再建一份观展面板（重复 DOM）。
  const galleryLayer = {
    node: existingApp,
    enter: ({ query }) => {
      studio?.leave();
      gallery.enter();
      const want = query?.work || (!current.entry ? first.id : null);
      if (want && BY_ID.has(want) && current.entry?.id !== want) select(want);
      if (current.entry) gallery.syncInfo(current.entry);
    },
    leave: () => { viewer.ticket++; gallery.leave(); },
    // 从隐藏恢复显示：canvas 在 hidden 期间尺寸为 0，需重算并补帧
    refresh: () => {
      try { window.dispatchEvent(new Event('resize')); viewer.render(); } catch { /* ignore */ }
    },
  };

  registerRoute('/gallery', () => galleryLayer, { title: () => 'FORMA V5 · 数字展厅' });

  registerRoute('/work/:id',
    ({ params }) => createWorkPage({ params, catalog: CATALOG }),
    { title: (p) => `FORMA V5 · ${BY_ID.get(p?.id)?.name || '作品'}` });

  // AI Studio：独立工作区（左右Tool容器 + 底部任务 Dock）。
  // 与 Gallery 共用常驻的 3D 图层，进入时只切换模式与面板，不重建 Viewer。
  const studioLayer = {
    node: existingApp,
    beforeLeave:()=>studio?.core?.canLeave()??true,
    leave:()=>studio?.leave(),
    enter: () => {
      gallery.leave();
      studio?.enter();
    },
    refresh: () => {
      try { window.dispatchEvent(new Event('resize')); viewer.render(); } catch { /* ignore */ }
      studio?.refreshViewerPanels();
    },
  };

  registerRoute('/studio', IS_SHOWCASE
    ? async () => (await import('./pages/studioShowcase.js')).createStudioShowcase()
    : () => studioLayer, { title: () => IS_SHOWCASE ? 'FORMA V5 · Studio 功能与实录' : 'FORMA V5 · AI Studio' });

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

  if(caps.params.has('entry')&&!location.hash)location.replace('#/gallery?work='+encodeURIComponent(first.id));
  onNavigate(({ pattern }) => {
    clearToasts();syncNavActive(nav, pattern);
    if(pattern!=='/gallery'&&(pattern!=='/studio'||IS_SHOWCASE))document.body.classList.remove('mode-gallery','mode-studio');
    if(pattern!=='/gallery')resolveReady?.(true);
  });
  startRouter({ outlet });

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
    // AI Studio：五区工作区（进入路由自动探测后端；也可手动触发）
    studio: {
      enter: () => studio?.enter(),
      leave: () => studio?.leave(),
      get active() { return !!studio?.isActive; },
      get core() { return studio?.core || null; },
      // 兼容旧管线 API（部分脚本用 async connect 等待连接结果）
      connect: async () => { await studio?.core?.connect(); return studio?.core?.state.status === 'online'; },
      get connected() { return studio?.core?.state.status === 'online'; },
      get selectedAsset() { return studio?.core?.state.selectedAsset || null; },
      selectAsset: (id) => studio?.core?.selectAsset(id),
      analyze: () => studio?.core?.analyze(),
      run: (opts) => studio?.core?.run(opts),
      runAgent: (opts) => studio?.core?.runAgent(opts),
      runBatch: (ids, ops) => studio?.core?.runBatch(ids, ops),
      // Before/After 真实双模型对比（真实加载 before/after 两个模型）
      showCompare: () => studio?.core?.showCompare(),
      exitCompare: () => studio?.core?.exitCompare(),
      setSplit: (v) => studio?.core?.setCompareSplit(v),
      publish: (v) => studio?.core?.publish(v),
      exportAs: (to) => studio?.core?.exportAs(to),
      get rig() { return studio?.core?.state.rig || null; },
      get lastRun() { return studio?.core?.state.lastRun || null; },
      get state() { return studio?.core?.state || null; },
    },
    // V5 路由（供测试与调试驱动页面切换）。
    v5: { navigate, version: 'V5' },
    // 工作区布局（供测试驱动；生产入口是拖拽手柄与工具栏「布局」按钮）
    layout: {
      read: () => studio?.layout?.read?.() || null,
      reset: () => studio?.layout?.reset?.(),
      toggleDock: () => studio?.layout?.toggleDock?.(),
      toggleRail: () => studio?.layout?.toggleRail?.(),
      reflow: () => studio?.reflow?.(),
      get defaults() { return studio?.layout?.DEFAULTS || null; },
      get limits() { return studio?.layout?.LIMITS || null; },
    },
    // Gallery 观展模式（供测试驱动；生产入口由路由负责）
    gallery: {
      enter: () => gallery?.enter(),
      leave: () => gallery?.leave(),
      syncInfo: (entry) => gallery?.syncInfo(entry || current.entry),
      get drawerOpen() { return !!(gallery?.drawer && !gallery.drawer.hidden); },
    },
  };

  return ready;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
