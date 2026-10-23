// FORMA V5 — 作品详情页 #/work/:id
// 公开详情的技术参数来自本页载入的模型，不猜测私人工作区的同名资产。
import { el } from '../utils/dom.js';

import { createMiniViewer } from '../core/miniViewer.js';

const CULTURE = {
  sheng: {role:'生角',line:'红袍乌纱 · 蓝白波纹',desc:'红色衣袍、乌纱与金色装饰。转动模型，观察正面纹样、袖口和衣袍下缘的蓝白波纹。'},
  dan: {role:'旦角',line:'蓝色花饰 · 珠串流苏',desc:'蓝色花饰、珠串与红色戏服层层相叠。可以转动作品，近看头饰、面部与两侧流苏。'},
  'jing-red': {role:'净角 · 红谱',line:'红色脸谱 · 蓝白戏服',desc:'红色脸谱与蓝白色戏服形成对比。可从不同角度观察面部纹样与冠饰。'},
  'jing-yellow': {role:'净角 · 黄谱',line:'黄色脸谱 · 冠饰长髯',desc:'黄色脸谱、蓝色冠饰与长髯。可近看额面纹样以及衣袍下缘的波浪图案。'},
  'jing-white': {role:'净角 · 白谱',line:'白色脸谱 · 黑线冠饰',desc:'白色脸谱与黑色线条相衬。冠饰、髯口与服饰共同构成作品的轮廓。'},
};

const FIGURINE_IDS = ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white'];

export function createWorkPage({ params, catalog = [] } = {}) {
  const id = params?.id || 'sheng';
  const entry = catalog.find((c) => c.id === id) || { id, name: id, group: 'figurines' };
  const culture = CULTURE[id] || { role: entry.name, line: '', desc: '此展品的谱式说明待补充。' };
  const idx = FIGURINE_IDS.indexOf(id);
  const prevId = FIGURINE_IDS[(idx - 1 + FIGURINE_IDS.length) % FIGURINE_IDS.length];
  const nextId = FIGURINE_IDS[(idx + 1) % FIGURINE_IDS.length];

  // ---- 3D 展示（独立轻量查看器，可拖拽旋转）----
  const stage = el('div', { class: 'v5-work-stage' });
  let viewer3d = null;
  const mountViewer = () => { if(viewer3d)return; viewer3d = createMiniViewer({
    container: stage,
    modelUrl: entry.file || `./assets/models/${id}.glb`,
    autoRotateSpeed: 0.04,
    pageScroll: true,
    view:entry.best,
    onReady:stats=>techBox.querySelector('.v5-tech-body').replaceChildren(buildReportStats(stats)),
    onError: () => stage.replaceChildren(el('div', { class: 'v5-state', 'data-tone': 'err' },
      el('div', { class: 'v5-state-icon' }, '!'),
      el('p', { class: 'v5-state-title' }, '模型加载失败'),
      el('p', { class: 'v5-state-desc' }, '请确认展品资源文件存在。'))),
  }); };

  // ---- 信息面板 ----
  const infoPanel = el('aside', { class: 'v5-work-info' },
    el('p', { class: 'v5-eyebrow' }, `Work ${String(idx + 1).padStart(2, '0')} / 05`),
    el('h1', { class: 'v5-h1' }, entry.name),
    el('p', { class: 'v5-work-line' }, culture.line),
    el('hr', { class: 'v5-rule' }),
    el('p', { class: 'v5-work-desc' }, culture.desc),
    el('p', { class: 'v5-work-desc' }, '横向拖动旋转 · 滚动浏览页面。进入展厅可缩放并调整观看设置。'),
    el('div', { class: 'v5-work-actions' },
      el('a', { class: 'v5-btn v5-btn-gold', href: `#/gallery?work=${id}` }, '在展厅中细看'),
      el('a', { class: 'v5-btn', href: `#/work/${prevId}` }, '‹ 上一件'),
      el('a', { class: 'v5-btn', href: `#/work/${nextId}` }, '下一件 ›'),
    ),
  );

  // ---- 技术参数（异步：当前模型加载后的真实统计）----
  const techBox = el('div', { class: 'v5-card v5-tech', id: 'v5Tech-'+id },
    el('h3', { class: 'v5-h3' }, '技术参数'),
    el('div', { class: 'v5-tech-body' },
      el('div', { class: 'v5-skeleton v5-skeleton-text' }),
      el('div', { class: 'v5-skeleton v5-skeleton-text', style: { width: '70%' } }),
    ),
  );

  const node = el('div', { class: 'v5-work' },
    el('div', { class: 'v5-container' },
      el('div', { class: 'v5-work-layout' }, stage, infoPanel),
      techBox,
      el('div', { class: 'v5-work-nav' },
        el('a', { class: 'v5-work-navlink', href: `#/work/${prevId}` }, `‹ ${prevId}`),
        el('a', { class: 'v5-work-navlink', href: `#/work/${nextId}` }, `${nextId} ›`),
      ),
    ),
  );

  return {
    node,
    enter: mountViewer,
    leave() { viewer3d?.dispose(); viewer3d=null; },
    unmount() { viewer3d?.dispose(); viewer3d=null; },
  };
}

function statRow(label, value, sub) {
  return el('div', { class: 'v5-stat' },
    el('div', { class: 'v5-stat-label' }, label),
    el('div', { class: 'v5-stat-value v5-num' }, String(value)),
    sub ? el('div', { class: 'v5-stat-sub' }, sub) : null,
  );
}

function buildReportStats(s) {
  const row = el('div', { class: 'v5-stat-row' },
    statRow('格式', 'GLB', '当前展品'),
    statRow('顶点', (s.verts ?? 0).toLocaleString('en-US'), '真实解析'),
    statRow('三角形', (s.tris ?? 0).toLocaleString('en-US'), '真实解析'),
    statRow('贴图最大宽', s.maxTextureWidth ? `${s.maxTextureWidth}px` : '—', `${s.textures} 张 · 当前载入资源`),
  );
  return row;
}
