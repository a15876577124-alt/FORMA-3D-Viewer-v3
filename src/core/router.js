// FORMA V5 — Hash 路由
// 设计约束：
// 1. 静态站点零配置（GitHub Pages 无 rewrite），故用 hash 而非 history API。
// 2. 图层常驻：页面挂载后保留在 DOM 中，切换只改 hidden——避免 Three.js canvas
//    被 detach 导致 WebGL 上下文丢失 / 重新初始化。
// 3. 页面契约：factory(ctx) 返回 Node | { node, unmount?, enter? }。

const routes = new Map();
const mounted = new Map();   // cacheKey -> { node, instance, pattern, params }
let outlet = null;
let notFoundFactory = null;
let currentKey = null;
const listeners = new Set();
const MAX_CACHE = 8;

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const path = (pathPart.startsWith('/') ? pathPart : '/' + pathPart).replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { path, query };
}

function match(pattern, path) {
  const ps = pattern.split('/').filter(Boolean);
  const xs = path.split('/').filter(Boolean);
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
    else if (ps[i] !== xs[i]) return null;
  }
  return params;
}

export function registerRoute(pattern, factory, meta = {}) {
  routes.set(pattern, { factory, meta });
  return () => routes.delete(pattern);
}

export function setNotFound(factory) { notFoundFactory = factory; }

export function activePattern() {
  return mounted.get(currentKey)?.pattern || null;
}
export function onNavigate(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function evictCache() {
  const keys = [...mounted.keys()];
  while (keys.length > MAX_CACHE) {
    const oldest = keys.shift();
    if (oldest === currentKey) { keys.push(oldest); continue; }
    const m = mounted.get(oldest);
    try { m.instance?.unmount?.(); } catch { /* 忽略 */ }
    m.node.remove();
    mounted.delete(oldest);
  }
}

async function render() {
  const { path, query } = parseHash();
  let pattern = null, params = {}, entry = null;
  for (const [p, r] of routes) {
    const m = match(p, path);
    if (m) { pattern = p; params = m; entry = r; break; }
  }

  const cacheKey = (pattern || '__notfound__') + '|' + JSON.stringify(params);
  let layer = mounted.get(cacheKey);

  if (!layer) {
    const factory = entry?.factory || notFoundFactory;
    if (!factory) return;
    let instance;
    try {
      instance = await factory({ params, query, path });
    } catch (e) {
      console.error('[router] factory failed:', e);
      const { v5State } = await import('../ui/feedback.js');
      instance = { node: v5State({ tone: 'err', title: '页面加载失败', desc: String(e?.message || e).slice(0, 240) }) };
    }
    const node = instance?.nodeType ? instance : instance?.node;
    if (!node) { console.error('[router] factory returned no node for', path); return; }
    node.classList?.add('v5-layer');
    layer = { node, instance, pattern, params };
    mounted.set(cacheKey, layer);
    outlet.append(node);
    evictCache();
  }

  // 图层切换：全部隐藏，仅显示当前
  for (const [k, m] of mounted) m.node.hidden = (k !== cacheKey);
  currentKey = cacheKey;

  try { layer.instance?.enter?.({ params, query, path }); } catch (e) { console.warn('[router] enter failed:', e); }

  document.title = entry?.meta?.title
    ? entry.meta.title(params)
    : 'FORMA V5 — Ultimate AI 3D Creation Platform';

  for (const fn of listeners) fn({ pattern, params, path });
}

export function startRouter({ outlet: outletEl }) {
  outlet = outletEl;
  window.addEventListener('hashchange', render);
  if (!location.hash) location.replace('#/');
  else render();
  return { render };
}

export function navigate(to, { replace = false } = {}) {
  const next = '#' + (to.startsWith('/') ? to : '/' + to);
  if (location.hash === next) { render(); return; }
  if (replace) location.replace(next);
  else location.hash = next;
}

// 通用指标卡（多页复用）
export function v5Stat(label, value, sub) {
  const node = document.createElement('div');
  node.className = 'v5-stat';
  const lab = document.createElement('div');
  lab.className = 'v5-stat-label';
  lab.textContent = label;
  const val = document.createElement('div');
  val.className = 'v5-stat-value v5-num';
  val.textContent = value;
  node.append(lab, val);
  if (sub != null) {
    const s = document.createElement('div');
    s.className = 'v5-stat-sub';
    s.textContent = sub;
    node.append(s);
  }
  return node;
}
