// Approved H01/H02: collection first, with the existing live Hero and Studio workflow.
import { el } from '../utils/dom.js';
import { createHero3D } from './home3d.js';
import { IS_SHOWCASE } from '../runtime.js';


// 五件展品的真实分组语义（与 catalog 一致，非虚构）
const SERIES = [
  { id: 'sheng', role: '生角', line: '红袍乌纱 · 蓝白波纹' },
  { id: 'dan', role: '旦角', line: '蓝色花饰 · 珠串流苏' },
  { id: 'jing-red', role: '净角 · 红谱', line: '红色脸谱 · 蓝白戏服' },
  { id: 'jing-yellow', role: '净角 · 黄谱', line: '黄色脸谱 · 冠饰长髯' },
  { id: 'jing-white', role: '净角 · 白谱', line: '白色脸谱 · 黑线冠饰' },
];

export function createHomePage({ catalog = [], quality = 'high' } = {}) {
  const figurines = catalog.filter((c) => c.group === 'figurines');

  // ---- Hero（3D 主体铺满右侧，文字层在左）----
  const heroStage = el('div', { class: 'v5-hero-3d', 'aria-hidden': 'true' });
  const hero = el('section', { class: 'v5-hero' },
    heroStage,
    el('div', { class: 'v5-container v5-hero-inner' },
      el('p', { class: 'v5-eyebrow' }, 'FORMA · Digital Art & 3D Creation'),
      el('h1', { class: 'v5-display v5-hero-title' },
        el('span', { class: 'v5-hero-line' }, '琼剧'),
        el('span', { class: 'v5-hero-line v5-hero-line-accent' }, '五相'),
      ),
      el('p', { class: 'v5-lede v5-hero-lede' },
        '五件数字手办，五种舞台神采。近距离观察冠饰、衣纹与脸谱，探索琼剧角色的形与色。'),
      el('div', { class: 'v5-hero-actions' },
        el('a', {class:'v5-btn v5-btn-gold',href:'#/gallery'}, '进入数字展厅 →'),
        el('a', {class:'v5-btn v5-btn-ghost',href:'#/studio'}, IS_SHOWCASE ? '了解 AI Studio' : '打开 AI Studio'),
      ),
    ),
  );

  // ---- 展品索引 ----
  const cards = figurines.map((f) => {
    const meta = SERIES.find((s) => s.id === f.id);
    // One link per card; the detail page preserves this identity when entering Gallery.
    return el('a', { class: 'v5-series-card', href: `#/work/${f.id}` },
      el('div', { class: 'v5-series-head' },
        el('img', { class: 'v5-series-thumb', src:f.thumb, width:512, height:512, loading:'lazy', alt:f.name+'手办模型渲染' }),
      ),
      el('h3', { class: 'v5-series-name' }, f.name),
      el('p', { class: 'v5-series-line' }, meta?.line || ''),
      el('span', { class: 'v5-series-cta' }, '查看详情 →'),
    );
  });

  const seriesSection = el('section', { class: 'v5-section', id:'collection' },
    el('div', { class: 'v5-container' },
      el('div', { class: 'v5-section-head' },
        el('p', { class: 'v5-eyebrow' }, 'The Collection'),
        el('h2', { class: 'v5-h1' }, '五件展品'),
      ),
      el('div', { class: 'v5-series-grid' }, ...cards),
    ),
  );

  const laneSection = el('section', { class:'v5-studio-invite v5-container' },
    el('div', {}, el('p',{class:'v5-eyebrow'},'AI Studio'),
      el('h2',{class:'v5-h2'},'从观察，到创作'),
      el('p',{class:'v5-lede'},'在本地工作区分析、编辑与处理三维资产，保留原始版本，比较并导出结果。')),
    el('a',{class:'v5-btn v5-btn-ghost',href:'#/studio'},IS_SHOWCASE ? '查看工作流实录 →' : '进入工作区 →'),
  );

  const node = el('div', { class: 'v5-home' }, hero, seriesSection, laneSection);

  // 3D 主体：挂载后启动；unmount 完整释放（renderer/geo/textures/composer）
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = quality === 'auto'
    ? (navigator.hardwareConcurrency >= 6 ? 'high' : 'low')
    : quality;
  const hero3d = createHero3D({ container: heroStage, quality: q, reducedMotion: reduced });

  return {
    node,
    enter({query}={}) { if(query?.section==='collection')requestAnimationFrame(()=>document.getElementById('collection')?.scrollIntoView({block:'start'})); if(query?.section==='contact')requestAnimationFrame(()=>{const contact=document.getElementById('contactBlock');if(contact){contact.open=true;contact.scrollIntoView({block:'center'});}}); },
    unmount() {
      try { hero3d.dispose(); } catch (e) { console.warn('[home] hero3d dispose:', e); }
    },
    hero3d,
  };
}
