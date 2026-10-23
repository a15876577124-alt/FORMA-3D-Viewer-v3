// FORMA V5 — 工作区布局系统（可拖拽分栏 + 持久化 + 安全边界）
//
// 设计约束：
//  1. 只写 CSS 变量与类名，不移动 canvas、不重建 Viewer（WebGL 上下文唯一）。
//  2. 所有尺寸都要经过 clamp：任何来源（拖拽、键盘、localStorage、窗口变化）
//     得到的值都必须落在「当前视口可用空间」之内，保证面板永远能拖回来、
//     控制按钮永远可见。
//  3. 拖拽用 Pointer Events（一套代码同时覆盖鼠标 / 触控 / 手写笔）。
import { el } from '../utils/dom.js';

const KEY = 'forma3d.v5.layout';

// 默认值（1440×900 左右的舒适值；保存前会被 clamp 到当前视口）
export const DEFAULTS = { sidebar: 300, inspector: 372, dockH: 252, dockCollapsed: false, railHidden: false };
// Gallery 观展优先：右栏更窄、默认不折叠；Studio 是生产区，右栏更宽
const MODE_DEFAULTS = { gallery: { sidebar: 240, inspector: 280 }, studio: {sidebar:240,inspector:320} };

// 安全边界：硬下限保证「拖不没」，比例上限保证「中央视口永远有可用空间」
export const LIMITS = {
  sidebarMin: 216, sidebarMax: 520,
  inspectorMin: 280, inspectorMax: 620,
  dockMin: 132, dockRatioMax: 0.72,     // dock 不超过工作区高度的 72%
  collapsedH: 40,                        // 折叠后仍保留的头部高度（展开入口常驻）
  viewportMinH: 240,                     // 中央视口最小高度
  viewportMinW: 300,                     // 中央视口最小宽度
  railCollapsedW: 0,
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));

function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

export function createLayout({ app, workspace, viewer, onChange } = {}) {
  const saved = readStore() || {};
  const state = {
    gallery: { ...DEFAULTS, ...MODE_DEFAULTS.gallery, ...(saved.gallery || {}) },
    studio: { ...DEFAULTS, ...MODE_DEFAULTS.studio, ...(saved.studio || {}) },
  };
  let mode = 'gallery';

  // 当前可用空间：以 #app 与 workspace 的实际盒子为准（含浏览器缩放后的 CSS 像素）
  function metrics() {
    const appBox = app?.getBoundingClientRect();
    const wsBox = workspace?.getBoundingClientRect();
    const vw = appBox?.width || window.innerWidth || 1280;
    const vh = wsBox?.height || window.innerHeight || 720;
    return { vw, vh };
  }

  // 把任意来源的尺寸收敛到当前视口允许的范围
  function clampAll(m) {
    const { vw, vh } = metrics();
    const s = state[m];
    const sideMax = Math.max(LIMITS.sidebarMin, Math.min(LIMITS.sidebarMax, vw - LIMITS.viewportMinW - LIMITS.inspectorMin));
    const inspMax = Math.max(LIMITS.inspectorMin, Math.min(LIMITS.inspectorMax, vw - LIMITS.viewportMinW - s.sidebar));
    s.sidebar = clamp(s.sidebar, LIMITS.sidebarMin, sideMax);
    s.inspector = clamp(s.inspector, LIMITS.inspectorMin, inspMax);
    if (s.sidebar + s.inspector > vw - LIMITS.viewportMinW) {
      // 两侧同时过大时优先保住视口：按比例回退
      const over = s.sidebar + s.inspector - (vw - LIMITS.viewportMinW);
      const takeSide = Math.min(over, s.sidebar - LIMITS.sidebarMin);
      s.sidebar -= Math.max(0, takeSide);
      const rest = over - Math.max(0, takeSide);
      s.inspector = Math.max(LIMITS.inspectorMin, s.inspector - Math.max(0, rest));
    }
    const curDock = s.dockCollapsed ? LIMITS.collapsedH : s.dockH;
    const usable = vh - chromeHeight(curDock);
    const dockMax = Math.max(LIMITS.dockMin, Math.min(usable * LIMITS.dockRatioMax, usable - LIMITS.viewportMinH));
    s.dockH = clamp(s.dockH, LIMITS.dockMin, dockMax);
    return s;
  }

  // 视口区（.viewport）当前高度：算 dock 上限时必须把它和工具条/手柄的占位一起扣掉，
  // 否则「最大 dock」会把中央视口压到比 viewportMinH 更小。
  function chromeHeight(curDock) {
    const ws = workspace?.getBoundingClientRect().height || 0;
    const vp = document.querySelector('.viewport')?.getBoundingClientRect().height || 0;
    if (!ws) return 0;
    return Math.max(0, ws - vp - curDock);
  }

  function apply({ notify = true } = {}) {
    const s = clampAll(mode);
    const root = app || document.body;
    root.style.setProperty('--st-sidebar', s.sidebar + 'px');
    root.style.setProperty('--st-inspector', s.inspector + 'px');
    const dockH = s.dockCollapsed ? LIMITS.collapsedH : s.dockH;
    root.style.setProperty('--st-dock-h', dockH + 'px');
    // 状态类统一打在 body 上：CSS 选择器与「当前模式」都在 body 层，避免目标不一致
    document.body.classList.toggle('st-dock-collapsed', !!s.dockCollapsed);
    // Gallery 的辅助信息栏可折叠（Studio 不用这套——它的右栏是主工作区）
    document.body.classList.toggle('gl-rail-hidden', mode === 'gallery' && !!s.railHidden);
    if (notify) onChange?.(s, mode);
  }

  // 视口尺寸同步：ResizeObserver 会自动兜底，这里补一次即时同步避免拖拽时掉帧
  let raf = 0;
  function syncViewer() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      try { viewer?.applyResize?.(); viewer?.render?.(); } catch { /* ignore */ }
    });
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ gallery: state.gallery, studio: state.studio })); } catch { /* 隐私模式 */ }
  }

  function commit({ save = true } = {}) {
    apply();
    syncViewer();
    if (save) persist();
  }

  function setMode(next) {
    mode = next === 'studio' ? 'studio' : 'gallery';
    commit({ save: false });
  }

  function reset(m = mode) {
    state[m] = { ...DEFAULTS, ...(MODE_DEFAULTS[m] || {}) };
    commit();
  }

  function setDockCollapsed(on) {
    const s = state[mode];
    s.dockCollapsed = !!on;
    commit();
  }

  // ------------------------------------------------------------ 拖拽 ----
  // axis: 'x' 水平改宽度 | 'y' 垂直改高度；dir: +1 向右/下增大，-1 反向
  function attachHandle(handle, { axis, dir = 1, get, set, min, max, onDone } = {}) {
    if (!handle) return;
    handle.setAttribute('role', 'separator');
    handle.tabIndex = 0;
    handle.setAttribute('aria-orientation', axis === 'x' ? 'vertical' : 'horizontal');
    handle.style.touchAction = 'none';

    let start = 0, base = 0, active = false;

    const onMove = (e) => {
      if (!active) return;
      const delta = axis === 'x' ? e.clientX - start : e.clientY - start;
      const next = clamp(base + delta * dir, min(), max());
      set(next);
      apply();
      syncViewer();
      e.preventDefault();
    };
    const onUp = (e) => {
      if (!active) return;
      active = false;
      handle.classList.remove('is-dragging');
      document.body.classList.remove('st-resizing-x', 'st-resizing-y');
      try { handle.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
      try { onDone?.(); } catch { /* ignore */ }
      persist();
    };

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      active = true;
      start = axis === 'x' ? e.clientX : e.clientY;
      base = get();
      handle.classList.add('is-dragging');
      document.body.classList.add(axis === 'x' ? 'st-resizing-x' : 'st-resizing-y');
      try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    });
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
    handle.addEventListener('lostpointercapture', onUp);

    // 双击：该维度回到默认
    handle.addEventListener('dblclick', () => {
      const s = state[mode];
      if (axis === 'y') s.dockH = DEFAULTS.dockH;
      else set(DEFAULTS[axis === 'x' ? 'sidebar' : 'inspector']);
      s.dockCollapsed = false;
      commit();
    });

    // 键盘：方向键微调 / Home 最小 / End 最大 / Enter 折叠或展开
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 48 : 16;
      let delta = 0;
      if (axis === 'x') {
        if (e.key === 'ArrowLeft') delta = -step * dir;
        else if (e.key === 'ArrowRight') delta = step * dir;
      } else if (e.key === 'ArrowUp') delta = -step * dir;
      else if (e.key === 'ArrowDown') delta = step * dir;

      if (delta) {
        set(clamp(get() + delta, min(), max()));
        commit();
        e.preventDefault();
        return;
      }
      if (e.key === 'Home') { set(min()); commit(); e.preventDefault(); }
      else if (e.key === 'End') { set(max()); commit(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { setDockCollapsed(!state[mode].dockCollapsed); e.preventDefault(); }
    });
  }

  return {
    state, DEFAULTS, LIMITS,
    get mode() { return mode; },
    get current() { return state[mode]; },
    setMode, apply, commit, reset, setDockCollapsed, syncViewer,
    attachHandle,
    toggleDock() { setDockCollapsed(!state[mode].dockCollapsed); return !state[mode].dockCollapsed; },
    toggleRail() {
      const s = state[mode];
      s.railHidden = !s.railHidden;
      commit();
      return !!s.railHidden;
    },
    // 窗口 / 缩放变化时重新收敛：避免恢复一个已超出当前视口的旧布局
    reflow() { for (const m of ['gallery', 'studio']) clampAll(m); commit({ save: true }); },
    // 供测试读取的当前生效尺寸（CSS 像素）
    read() {
      const s = clampAll(mode);
      return { ...s, effectiveDockH: s.dockCollapsed ? LIMITS.collapsedH : s.dockH, mode };
    },
    makeHandle(axis, label) {
      return el('div', {
        class: 'st-handle st-handle-' + axis,
        'aria-label': label,
        title: label + '（拖动调整 · 双击恢复默认 · 方向键微调）',
      }, el('span', { class: 'st-handle-grip', 'aria-hidden': 'true' }));
    },
  };
}
