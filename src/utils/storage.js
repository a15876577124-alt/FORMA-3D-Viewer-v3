// localStorage wrapper that never throws. Falls back to an in-memory Map when
// storage is unavailable (private mode, blocked cookies, file:// quirks).
let warned = false;

function probe() {
  try {
    const k = '__forma_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

const AVAILABLE = probe();
const MEMORY = new Map();

export const storageAvailable = AVAILABLE;

export function getJSON(key, fallback = null) {
  try {
    const raw = AVAILABLE ? localStorage.getItem(key) : MEMORY.get(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[storage] read failed for ' + key, e);
    return fallback;
  }
}

export function setJSON(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (AVAILABLE) localStorage.setItem(key, raw); else MEMORY.set(key, raw);
    return true;
  } catch (e) {
    console.warn('[storage] write failed for ' + key, e);
    return false;
  }
}

export function removeKey(key) {
  try { AVAILABLE ? localStorage.removeItem(key) : MEMORY.delete(key); } catch { /* ignore */ }
}

export function warnOnceStatus() {
  if (!AVAILABLE && !warned) {
    warned = true;
    return '浏览器禁用了本地存储，本次会话的参数不会被保存。';
  }
  return null;
}
