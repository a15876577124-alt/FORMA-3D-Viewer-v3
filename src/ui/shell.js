import { createContactBlock } from './contact.js';
// FORMA V5 — 品牌外壳：顶栏 / 导航 / 页脚 / 路由出口
import { el } from '../utils/dom.js';

import { createBrand, installBrandIcon } from './brand.js';
import { createBrandPresentation } from './brandMotion.js';

// 仅列出当前阶段已实装的路由；新页面完工后再追加，避免死链。
export const NAV_ITEMS = [
  { to: '/', label: '首页', match: '/' },
  { to: '/gallery', label: '数字展厅', match: '/gallery' },
  { to: '/?section=collection', label: '作品', match: '/work' },
  { to: '/studio', label: 'AI Studio', match: '/studio' },
];

export function buildV5Shell({ version = 'V5' } = {}) {
  // ---- 顶栏 ----
  installBrandIcon();
  const brand = createBrand({href:'#/'});

  const nav = el('nav', { class: 'v5-nav', id: 'v5Nav', 'aria-label': '主导航' });
  for (const item of NAV_ITEMS) {
    nav.append(el('a', {
      class: 'v5-nav-link',
      href: '#' + item.to,
      'data-match': item.match,
      onclick: () => { nav.setAttribute('data-open', 'false'); toggle.setAttribute('aria-expanded', 'false'); },
    }, item.label));
  }

  const toggle = el('button', {
    class: 'v5-nav-toggle', type: 'button', 'aria-label': '切换导航', 'aria-expanded': 'false',
    html: '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 4.5h13M2 8.5h13M2 12.5h13"/></svg>',
    onclick: () => {
      const open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    },
  });

  const topbar = el('header', { class: 'v5-topbar' }, brand, toggle, nav);

  // ---- 路由出口 ----
  const outlet = el('main', { class: 'v5-page', id: 'v5Outlet' });

  // ---- 页脚 ----
  const footer = el('footer', { class: 'v5-footer' },
    el('div', { class: 'v5-footer-grid' },
      el('div', { class: 'v5-footer-brand' },
        createBrand({size:'small'}),
        el('p', { class: 'v5-footer-tag' },
          'FORMA 是一个面向数字文化遗产的三维创作平台：以琼剧手办为对象，贯通展示、分析、修复、优化与导出的完整资产生产链路。'),
      ),
      el('div', { class: 'v5-footer-cols' },
        el('div', { class: 'v5-footer-col' },
          el('h4', {}, '浏览'),
          el('a', { href: '#/gallery' }, '数字展厅'),
          el('a', { href: '#/?section=collection' }, '五件作品'),
        ),
        el('div', { class: 'v5-footer-col' },
          el('h4', {}, '工具'),
          el('a', { href: '#/studio' }, 'AI Studio'),
        ),
        createContactBlock(),
        createBrandPresentation(),
      ),
    ),
    el('div', { class: 'v5-footer-legal' },
      el('span', {}, '琼剧数字手办为非商业文化展示用途 · 模型与贴图版权归原作者所有'),
      el('span', {}, 'Three.js r186 · glTF Transform · 本地渲染'),
      el('span', { class: 'v5-footer-scope' }, '观展功能无需后端；分析 / 处理 / AI / 导出需本地完整版'),
    ),
  );

  const shell = el('div', { class: 'v5-shell' }, topbar, outlet, footer);
  return { shell, outlet, nav, topbar, footer };
}

// 依据当前路由路径更新导航高亮
export function syncNavActive(nav, pattern) {
  const links = [...nav.querySelectorAll('.v5-nav-link')];
  for (const a of links) {
    const m = a.getAttribute('data-match');
    const collection=location.hash.includes('section=collection');
    const on = collection ? m==='/work' : pattern && (m === pattern || (m !== '/' && pattern.startsWith(m)));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
