// FORMA V5 — 统一反馈组件：Toast / Loading / Skeleton / Empty / Error
// 站级一致性入口，所有 V5 页面通过它产出加载、空态、错误态，避免各页自造样式。
import { el } from '../utils/dom.js';

// ---------- Toast ----------
let toastHost = null;

function ensureHost() {
  if (!toastHost) {
    toastHost = el('div', { class: 'v5-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  return toastHost;
}

export function v5Toast(message, tone = 'info', ms = 4200) {
  const host = ensureHost();
  const node = el('div', { class: 'v5-toast', 'data-tone': tone },
    el('span', { class: 'v5-toast-dot' }),
    el('span', {}, message),
  );
  host.append(node);
  const kill = () => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 320);
  };
  setTimeout(kill, ms);
  return kill;
}

// ---------- Loading ----------
// 返回可更新的句柄：handle.set(pct, text) / handle.done() / handle.node
export function v5Loading(text = '载入中…', pct = null) {
  const bar = el('div', { class: 'v5-progress-bar', style: { width: `${Math.max(0, Math.min(100, pct ?? 0))}%` } });
  const label = el('div', {}, text);
  const node = el('div', { class: 'v5-loading', role: 'status' },
    el('div', { class: 'v5-spinner' }),
    label,
    pct === null ? null : el('div', { class: 'v5-progress' }, bar),
  );
  return {
    node,
    set(nextPct, nextText) {
      if (nextPct != null) bar.style.width = `${Math.max(0, Math.min(100, nextPct))}%`;
      if (nextText != null) label.textContent = nextText;
    },
    done() { node.remove(); },
  };
}

// ---------- Skeleton ----------
// shapes: 'text' | 'block' | 'circle'；lines 用于 text 型行数
export function v5Skeleton(kind = 'block', count = 1) {
  const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' } });
  for (let i = 0; i < count; i++) {
    if (kind === 'text') {
      const t = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px' } },
        el('div', { class: 'v5-skeleton v5-skeleton-text' }),
        el('div', { class: 'v5-skeleton v5-skeleton-text', style: { width: '86%' } }),
        el('div', { class: 'v5-skeleton v5-skeleton-text', style: { width: '62%' } }),
      );
      wrap.append(t);
    } else {
      wrap.append(el('div', { class: `v5-skeleton v5-skeleton-${kind === 'circle' ? 'circle' : 'block'}` }));
    }
  }
  return wrap;
}

// ---------- Empty / Error ----------
const ICONS = {
  empty: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M7 4v12"/></svg>',
  err: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="10" cy="10" r="7.2"/><path d="M10 6.2v5M10 13.4v.6"/></svg>',
  warn: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 3.4 17.4 16H2.6z"/><path d="M10 8v3.4M10 13.8v.5"/></svg>',
  offline: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 5.2c4.2-2.2 9.8-2.2 14 0M5.6 9c2.8-1.5 6-1.5 8.8 0M8 12.6c1.2-.7 2.8-.7 4 0"/><path d="M3.4 16.6 16.6 3.4"/></svg>',
};

// tone: 'empty' | 'err' | 'warn' | 'offline'
export function v5State({ tone = 'empty', title, desc, actionLabel, onAction } = {}) {
  const children = [
    el('div', { class: 'v5-state-icon', html: ICONS[tone] || ICONS.empty }),
    el('p', { class: 'v5-state-title' }, title || (tone === 'err' ? '出错了' : '暂无内容')),
  ];
  if (desc) children.push(el('p', { class: 'v5-state-desc' }, desc));
  if (actionLabel && onAction) {
    children.push(el('button', {
      class: 'v5-btn', type: 'button', style: { marginTop: '8px' }, onclick: onAction,
    }, actionLabel));
  }
  return el('div', { class: 'v5-state', 'data-tone': tone === 'empty' ? '' : tone }, ...children);
}

// 统一的异步容器：自动在 pending / empty / error / content 之间切换
// load: async () => data；render: (data) => Node；isEmpty: (data) => bool
export function v5AsyncBox({ load, render, isEmpty, emptyState, loadingText = '载入中…' }) {
  const slot = el('div', {});
  let currentToken = 0;

  async function run() {
    const token = ++currentToken;
    const loading = v5Loading(loadingText);
    slot.replaceChildren(loading.node);
    try {
      const data = await load();
      if (token !== currentToken) return; // 已被更新的请求取代
      if (isEmpty ? isEmpty(data) : (Array.isArray(data) ? data.length === 0 : !data)) {
        slot.replaceChildren(emptyState || v5State({ tone: 'empty', title: '没有可显示的数据' }));
        return;
      }
      slot.replaceChildren(render(data));
    } catch (e) {
      if (token !== currentToken) return;
      slot.replaceChildren(v5State({
        tone: 'err',
        title: '加载失败',
        desc: String(e?.message || e).slice(0, 200),
        actionLabel: '重试',
        onAction: run,
      }));
    }
  }

  return { node: slot, run, refresh: run };
}
