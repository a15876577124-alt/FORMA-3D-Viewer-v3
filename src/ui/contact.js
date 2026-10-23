// FORMA V5 — 联系方式模块
//
// 一处定义、多处复用（首页 / 作品详情页）。两点硬性约束：
//  1. 全局公共页脚不再重复列出邮箱，避免同一页面出现两份联系方式；
//  2. 只做「联系」这一件事——不写个人简介、不做项目汇报。
import { el, toast } from '../utils/dom.js';

export const CONTACT_EMAILS = ['haorongli09@outlook.com', 'haorongli09@gmail.com'];

// 复制文本：优先用异步剪贴板 API，失败时退回 execCommand。
// 回退不是装饰——file://、无窗口焦点的自动化环境、部分旧浏览器都会拒绝
// navigator.clipboard，此时若直接放弃，按钮就成了「点了没反应」的假控件。
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

const copyTimers = new WeakMap();
async function copyText(text, btn) {
  let done = false;
  try {
    await navigator.clipboard.writeText(text);
    done = true;
  } catch { done = legacyCopy(text); }

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

// variant: 'block' 首页区块 | 'inline' 详情页紧凑条
export function createContactBlock({ variant = 'block', title = '联系', note = '', id = 'contactBlock' } = {}) {
  const list = el('div', { class: 'v5-contact-list' });

  for (const mail of CONTACT_EMAILS) {
    const copyBtn = el('button', { class: 'v5-contact-copy', type: 'button', title: `复制 ${mail}`, 'aria-label': `复制 ${mail}`, 'aria-live': 'polite' }, '复制');
    copyBtn.addEventListener('click', () => copyText(mail, copyBtn));
    list.append(el('div', { class: 'v5-contact-row' },
      el('a', { class: 'v5-contact-mail', href: 'mailto:' + mail }, mail),
      copyBtn,
    ));
  }

  const inner = el('div', { class: 'v5-contact-inner' },
    el('div', { class: 'v5-contact-head' },
      el('p', { class: 'v5-eyebrow' }, 'Contact'),
      el('h2', { class: 'v5-contact-title' }, title),
    ),
    list,
    note ? el('p', { class: 'v5-contact-note' }, note) : null,
  );

  const node = el('section', { class: 'v5-contact v5-contact-' + variant, id, 'aria-label': '联系 FORMA' },
    el('div', { class: variant === 'block' ? 'v5-container' : '' }, inner),
  );
  return node;
}
