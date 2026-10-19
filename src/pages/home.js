// FORMA V5 — 电影化首页（M1：版式骨架；M2：补真实 3D 主体与滚动叙事）
// 原则：首页所有文案与数据取自真实工程信息，不虚构测试数据。
import { el } from '../utils/dom.js';
import { v5Stat } from '../core/router.js';

// 五件展品的真实分组语义（与 catalog 一致，非虚构）
const SERIES = [
  { id: 'sheng', role: '生角', line: '素面俊扮 · 青衫褶子' },
  { id: 'dan', role: '旦角', line: '完整头饰 · 点翠成规' },
  { id: 'jing-red', role: '净角 · 红谱', line: '红为忠勇 · 额面勾纹' },
  { id: 'jing-yellow', role: '净角 · 黄谱', line: '黄示骠悍 · 眉窝高挑' },
  { id: 'jing-white', role: '净角 · 白谱', line: '白多疑诈 · 鼻窝三瓦' },
];

export function createHomePage({ catalog = [], version = '3.0.0' } = {}) {
  const figurines = catalog.filter((c) => c.group === 'figurines');

  // ---- Hero ----
  const hero = el('section', { class: 'v5-hero' },
    el('div', { class: 'v5-container v5-hero-inner' },
      el('p', { class: 'v5-eyebrow' }, 'Qiong Opera · Digital Figurines'),
      el('h1', { class: 'v5-display v5-hero-title' },
        el('span', { class: 'v5-hero-line' }, '琼剧'),
        el('span', { class: 'v5-hero-line v5-hero-line-accent' }, '五相'),
      ),
      el('p', { class: 'v5-lede v5-hero-lede' },
        '五件琼剧角色数字手办，以实时三维方式陈列。生旦净三行当、脸谱谱式与头饰规制皆可逐件审视；同一套资产贯穿展示、分析、修复与导出。'),
      el('div', { class: 'v5-hero-actions' },
        el('a', { class: 'v5-btn v5-btn-gold', href: '#/gallery' }, '进入数字展厅'),
        el('a', { class: 'v5-btn', href: '#/gallery?work=sheng' }, '看看生角'),
      ),
    ),
  );

  // ---- 真实指标条（数值来自真实工程状态，不做估算）----
  const statRow = el('div', { class: 'v5-stat-row' },
    v5Stat('展品', String(figurines.length), '琼剧角色'),
    v5Stat('渲染内核', 'r186', 'Three.js'),
    v5Stat('依赖', '离线', '无 CDN'),
    v5Stat('版本', 'V' + version, '当前构建'),
  );

  // ---- 展品索引 ----
  const cards = figurines.map((f) => {
    const meta = SERIES.find((s) => s.id === f.id);
    // 深链接到展厅并选中该展品（真实功能：/#/gallery?work=<id>）
    return el('a', { class: 'v5-series-card', href: `#/gallery?work=${f.id}` },
      el('div', { class: 'v5-series-head' },
        el('span', { class: 'v5-series-glyph', 'aria-hidden': 'true' }, meta?.role.slice(0, 1) || '◦'),
        el('span', { class: 'v5-badge', 'data-tone': 'gold' }, '系列'),
      ),
      el('h3', { class: 'v5-series-name' }, f.name),
      el('p', { class: 'v5-series-line' }, meta?.line || ''),
      el('span', { class: 'v5-series-cta' }, '查看作品 →'),
    );
  });

  const seriesSection = el('section', { class: 'v5-section' },
    el('div', { class: 'v5-container' },
      el('div', { class: 'v5-section-head' },
        el('p', { class: 'v5-eyebrow' }, 'The Collection'),
        el('h2', { class: 'v5-h1' }, '五件展品'),
      ),
      statRow,
      el('div', { class: 'v5-series-grid' }, ...cards),
    ),
  );

  // ---- 能力入口（仅列已实装能力，未实装项不展示）----
  const lanes = [
    { to: '/gallery', tag: 'Gallery', title: '数字展厅', desc: '实时三维陈列，可切换灯光、环境与后期，支持任意视角观察与截图。' },
  ];
  const laneCards = lanes.map((l) => el('a', { class: 'v5-card v5-lane', href: '#' + l.to },
    el('span', { class: 'v5-badge' }, l.tag),
    el('h3', { class: 'v5-h3', style: { marginTop: '12px' } }, l.title),
    el('p', { class: 'v5-lane-desc' }, l.desc),
  ));

  const laneSection = el('section', { class: 'v5-section' },
    el('div', { class: 'v5-container' },
      el('div', { class: 'v5-section-head' },
        el('p', { class: 'v5-eyebrow' }, 'Workspace'),
        el('h2', { class: 'v5-h1' }, '从展示到生产'),
      ),
      el('div', { class: 'v5-lane-grid' }, ...laneCards),
    ),
  );

  const node = el('div', { class: 'v5-home' }, hero, seriesSection, laneSection);
  return { node };
}
