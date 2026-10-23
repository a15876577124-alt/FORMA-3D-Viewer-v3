// Small DOM helpers shared by every UI module.
export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') n.innerHTML = v;
    else if (['disabled', 'hidden', 'checked', 'selected', 'multiple', 'required', 'open'].includes(k)) n[k] = Boolean(v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

let toastWrap = null;
const TIMERS = new Map();

export function toast(message, kind = '', ms = 4200) {
  if (!toastWrap) toastWrap = $('toastWrap');
  if (!toastWrap) { console.warn('[toast]', message); return; }
  const t = el('div', { class: 'toast' + (kind ? ' ' + kind : '') }, message);
  toastWrap.append(t);
  const id = Symbol();
  TIMERS.set(id, setTimeout(() => {
    t.style.transition = 'opacity .3s'; t.style.opacity = '0';
    setTimeout(() => t.remove(), 320);
    TIMERS.delete(id);
  }, ms));
  // never let the stack grow unbounded
  while (toastWrap.children.length > 4) toastWrap.firstChild.remove();
}

export function setProgress(pct, text) {
  const loader = $('loader'), fill = $('loaderFill'), label = $('loaderText');
  if (!loader) return;
  if (pct === null) { loader.hidden = true; return; }
  loader.hidden = false;
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (text !== undefined && label) label.textContent = text;
}

export function bindRange(id, valueId, onChange, fmt = (v) => v.toFixed(2)) {
  const input = $(id), out = $(valueId);
  if (!input) return null;
  const handler = () => {
    const v = parseFloat(input.value);
    if (out) out.textContent = fmt(v);
    onChange(v);
  };
  input.addEventListener('input', handler);
  return {
    input,
    set(v, silent = true) {
      input.value = String(v);
      if (out) out.textContent = fmt(v);
      if (!silent) onChange(parseFloat(input.value));
    },
    get() { return parseFloat(input.value); },
    fire() { handler(); },
  };
}

export function bindCheck(id, onChange) {
  const input = $(id);
  if (!input) return null;
  input.addEventListener('change', () => onChange(input.checked));
  return {
    input,
    set(v, silent = true) { input.checked = !!v; if (!silent) onChange(input.checked); },
    get() { return input.checked; },
  };
}

export function setSegActive(container, value) {
  if (!container) return;
  $$('button', container).forEach(b => b.classList.toggle('active', b.dataset.mode === value || b.dataset.mode === String(value)));
}

export function onSeg(container, handler) {
  if (!container) return;
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    handler(b.dataset.mode, b);
  });
}

export function fatal(title, message) {
  const box = $('fatal');
  if (!box) { console.error(title, message); return; }
  $('fatalTitle').textContent = title;
  $('fatalMsg').textContent = message;
  box.hidden = false;
}

export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

export function formatNumber(n) { return n.toLocaleString('en-US'); }
