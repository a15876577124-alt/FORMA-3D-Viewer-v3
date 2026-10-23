// FORMA V5 — 联系方式模块
//
// 公共页脚单一展开入口；邮箱配置保留，不占用三维工作区。
import { el, toast } from '../utils/dom.js';

export const CONTACT_EMAILS = ['haorongli09@outlook.com', 'haorongli09@gmail.com'];

// 复制文本：优先用异步剪贴板 API，失败时退回 execCommand。
// 回退不是装饰——file://、无窗口焦点的自动化环境、部分旧浏览器都会拒绝
// navigator.clipboard，此时若直接放弃，按钮就成了「点了没反应」的假控件。
function legacyCopy(text) {
  let ta;
  const focus = document.activeElement;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    return ok;
  } catch { return false; }
  finally { ta?.remove(); focus?.focus({preventScroll:true}); }
}

const copyTimers = new WeakMap();
async function copyText(text, btn) {
  if (btn?.disabled) return false;
  if (btn) { clearTimeout(copyTimers.get(btn)); btn.textContent = '复制中…'; btn.disabled = true; }
  let done = false;
  try {
    await navigator.clipboard.writeText(text);
    done = true;
  } catch { done = legacyCopy(text); }
  if (btn) { btn.disabled = false; btn.textContent = '复制'; }

  if (done) {
    toast('已复制 ' + text, 'ok', 2000);
    if (btn) {
      clearTimeout(copyTimers.get(btn));
      btn.textContent = '已复制';
      copyTimers.set(btn, setTimeout(() => { btn.textContent = '复制'; }, 1600));
    }
  } else {
    toast('复制未成功，请手动选中邮箱地址后按 Ctrl+C', 'warn', 4000);
  }
  return done;
}

export function createContactBlock({ id = 'contactBlock' } = {}) {
  const list = el('div', { class: 'v5-contact-list' });

  for (const mail of CONTACT_EMAILS) {
    const copyBtn = el('button', { class: 'v5-contact-copy', type: 'button', title: `复制 ${mail}`, 'aria-label': `复制 ${mail}`, 'aria-live': 'polite' }, '复制');
    copyBtn.addEventListener('click', () => copyText(mail, copyBtn));
    list.append(el('div', { class: 'v5-contact-row' },
      el('a', { class: 'v5-contact-mail', href: 'mailto:' + mail }, mail),
      copyBtn,
    ));
  }

  return el('details', { class: 'v5-contact', id }, el('summary', {}, '联系'), list);
}
