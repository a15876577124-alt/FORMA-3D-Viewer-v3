// FORMA V5 — Gallery 观展模式
//
// 目标：Gallery 是专业数字艺术展厅，不是资产生产软件。
//  · 右栏只留「观展」必要的：构图/视角、灯光、环境、自动旋转、截图、作品信息
//  · 高级材质与后期参数搬进独立的「高级控制台」抽屉（同一个 DOM 节点搬家，功能不复制）
//  · 生产工具（AI Pipeline / 后端状态 / 任务执行）在 Gallery 下彻底隐藏
//  · 程序化 Technical Demos 与五件正式作品在侧栏里明确分开
import { $, $$, el, toast } from '../utils/dom.js';

const ADV_TITLES = ['材质', '后期处理'];   // 搬进高级控制台的两个分组
const EXHIBIT_SECT = ['相机与环境', '灯光']; // 观展必需的分组，留在右栏

function summaryOf(details) {
  return details.querySelector('summary');
}

export function buildGalleryMode({ viewer, capture, resetView }) {
  const inspectorBody = document.querySelector('.inspector-body');
  const inspectorTitle = document.querySelector('.inspector-title');
  if (!inspectorBody) return { enter() { }, leave() { } };

  const sects = $$(':scope > details.sect', inspectorBody);
  const byTitle = new Map();
  for (const s of sects) {
    const label = summaryOf(s)?.textContent?.trim().split(/\s+/)[0] || '';
    byTitle.set(label, s);
  }

  // ---- 观展信息条（右栏顶部）：真实来自当前展品的名称/行当/三角面 ----
  const info = el('section', { class: 'gl-card', id: 'glCard' },
    el('div', { class: 'gl-card-head' },
      el('span', { class: 'gl-card-eyebrow', id: 'glRole' }, 'Exhibit'),
      el('span', { class: 'gl-card-index', id: 'glIndex' }, '01 / 05'),
    ),
    el('h2', { class: 'gl-card-title', id: 'glTitle' }, '生角'),
    el('p', { class: 'gl-card-sub', id: 'glSub' }, 'SHENG'),
    el('dl', { class: 'gl-card-specs', id: 'glSpecs' },
      el('div', {}, el('dt', {}, '三角形'), el('dd', { id: 'glTris' }, '—')),
      el('div', {}, el('dt', {}, '顶点'), el('dd', { id: 'glVerts' }, '—')),
      el('div', {}, el('dt', {}, '网格'), el('dd', { id: 'glMeshes' }, '—')),
      el('div', {}, el('dt', {}, '格式'), el('dd', { id: 'glFormat' }, '—')),
    ),
    el('p', { class: 'gl-card-note', id: 'glNote' }, '拖动旋转 · 滚轮缩放 · Space 自动旋转 · P 导出 PNG'),
  );

  // ---- 观展动作条 ----
  const actions = el('div', { class: 'gl-actions' },
    el('button', { class: 'gl-btn', type: 'button', id: 'glReset' }, '最佳视角'),
    el('button', { class: 'gl-btn', type: 'button', id: 'glCurate', title: '切换美术馆布光并把背景设为暖砂' }, '展厅布光'),
    el('button', { class: 'gl-btn', type: 'button', id: 'glShot' }, '导出 PNG'),
    el('button', { class: 'gl-btn gl-btn-primary', type: 'button', id: 'glAdvanced' }, '高级控制台'),
  );

  inspectorBody.insertBefore(info, inspectorBody.firstChild);
  inspectorBody.insertBefore(actions, info.nextSibling);

  const realReset = $('resetChip');
  actions.querySelector('#glReset').addEventListener('click', () => {
    if (realReset) realReset.click(); else resetView?.();
  });
  actions.querySelector('#glShot').addEventListener('click', () => capture?.());
  // 「展厅布光」：真实切换到美术馆灯光预设 + 暖砂环境（与右栏控件同一套状态）
  actions.querySelector('#glCurate').addEventListener('click', () => {
    const light = [...(document.querySelectorAll('#lightModes button') || [])].find((b) => b.dataset.mode === 'gallery');
    light?.click();
    const env = [...(document.querySelectorAll('#envModes button') || [])].find((b) => b.dataset.mode === 'warm');
    env?.click();
    toast('已切换到展厅布光 · 暖砂环境', 'ok', 2600);
  });

  // ---- 高级控制台抽屉（材质 / 后期处理的真实控件搬到这里）----
  const drawerBody = el('div', { class: 'gl-drawer-body' });
  const moved = [];
  for (const title of ADV_TITLES) {
    const s = byTitle.get(title);
    if (!s) continue;
    moved.push(s);
    s.open = true;
    drawerBody.append(s);
  }

  const drawer = el('aside', { class: 'gl-drawer', id: 'glDrawer', hidden: true, 'aria-label': '高级控制台' },
    el('div', { class: 'gl-drawer-head' },
      el('h3', {}, '高级控制台'),
      el('span', { class: 'gl-drawer-tag' }, '材质 · 后期'),
      el('button', { class: 'icon-btn', type: 'button', id: 'glDrawerClose', 'aria-label': '关闭高级控制台' },
        el('span', { 'aria-hidden': 'true' }, '✕'),
      ),
    ),
    drawerBody,
    el('p', { class: 'gl-drawer-note' }, '这里只对当前展品生效，并随展品切换独立保存。'),
  );
  document.body.append(drawer);

  const closeDrawer = () => { drawer.hidden = true; document.body.classList.remove('gl-drawer-open'); };
  drawer.querySelector('#glDrawerClose').addEventListener('click', closeDrawer);
  actions.querySelector('#glAdvanced').addEventListener('click', () => {
    drawer.hidden = !drawer.hidden;
    document.body.classList.toggle('gl-drawer-open', !drawer.hidden);
  });
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });

  // ---- 侧栏策展：正式作品 vs Technical Demos ----
  const figurines = document.querySelector('.group[data-group="figurines"]');
  const demos = document.querySelector('.group[data-group="demos"]');
  if (demos) {
    demos.classList.add('is-demos');
    const head = demos.querySelector('.group-title');
    if (head) head.textContent = 'Technical Demos · 技术演示';
  }
  if (figurines) figurines.classList.add('is-exhibits');

  function syncInfo(entry) {
    if (!entry) return;
    const st = viewer.stats || {};
    info.querySelector('#glTitle').textContent = entry.name || '—';
    info.querySelector('#glSub').textContent = entry.sub || '';
    info.querySelector('#glTris').textContent = (st.tris ?? entry.tris ?? '—').toLocaleString('en-US');
    info.querySelector('#glVerts').textContent = (st.verts ?? entry.verts ?? '—').toLocaleString('en-US');
    info.querySelector('#glMeshes').textContent = String(st.meshes ?? '—');
    info.querySelector('#glFormat').textContent = String(st.format || 'glb').toUpperCase();
    info.querySelector('#glRole').textContent = entry.group === 'demos' ? 'Technical Demo' : 'Exhibit';
    info.querySelector('#glIndex').textContent = entry.group === 'demos' ? 'DEMO' : ($('objNum')?.textContent || '');
    info.querySelector('#glNote').textContent = entry.group === 'demos'
      ? '技术演示：由 Three.js 内置几何体实时生成，用于验证材质与渲染管线，不是角色建模作品。'
      : '拖动旋转 · 滚轮缩放 · Space 自动旋转 · P 导出 PNG';
  }

  return {
    enter() {
      document.body.classList.add('mode-gallery');
      document.body.classList.remove('mode-studio');
      info.hidden = false;
      actions.hidden = false;
      if (inspectorTitle) inspectorTitle.textContent = '观展';
      // Gallery 下生产类分组不显示
      for (const s of sects) {
        const label = summaryOf(s)?.textContent?.trim().split(/\s+/)[0] || '';
        const inDrawer = ADV_TITLES.includes(label);
        s.hidden = !inDrawer && !EXHIBIT_SECT.includes(label) && label !== '动画';
      }
    },
    leave() {
      document.body.classList.remove('mode-gallery');
      info.hidden = true;
      actions.hidden = true;
      closeDrawer();
      if (inspectorTitle) inspectorTitle.textContent = '参数';
      for (const s of sects) s.hidden = false;
    },
    syncInfo,
    drawer,
  };
}
