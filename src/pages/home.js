// FORMA V5 — 首页即「软件启动台」
// M2：hero 加入真实 3D 手办主体（独立渲染器，见 home3d.js）。
// 原则：首页所有文案与数据取自真实工程信息，不虚构测试数据；
// 启动台上的每个入口都必须是已实装功能，状态数字来自本地真实记录（零后端请求）。
import { el } from '../utils/dom.js';
import { v5Stat } from '../core/router.js';
import { createHero3D } from './home3d.js';
import { createContactBlock } from '../ui/contact.js';

// 五件展品的真实分组语义（与 catalog 一致，非虚构）
const SERIES = [
  { id: 'sheng', role: '生角', line: '素面俊扮 · 青衫褶子' },
  { id: 'dan', role: '旦角', line: '完整头饰 · 点翠成规' },
  { id: 'jing-red', role: '净角 · 红谱', line: '红为忠勇 · 额面勾纹' },
  { id: 'jing-yellow', role: '净角 · 黄谱', line: '黄示骠悍 · 眉窝高挑' },
  { id: 'jing-white', role: '净角 · 白谱', line: '白多疑诈 · 鼻窝三瓦' },
];

export function createHomePage({ catalog = [], version = '3.0.0', quality = 'high', appState = null, onImportFiles = null } = {}) {
  const figurines = catalog.filter((c) => c.group === 'figurines');

  // 启动台状态全部来自本地已记录的真实数据（localStorage），不发任何后端请求
  const app = appState?.get?.() || { library: [], recentRuns: [] };
  const libCount = Array.isArray(app.library) ? app.library.length : 0;
  const runCount = Array.isArray(app.recentRuns) ? app.recentRuns.length : 0;
  const lastRun = Array.isArray(app.recentRuns) && app.recentRuns[0] ? String(app.recentRuns[0]) : null;

  // ---- 导入：真实文件选择（与侧栏导入同一条链路）----
  const fileInput = el('input', {
    type: 'file', multiple: true, class: 'v5-hidden-input',
    accept: '.glb,.gltf,.obj,.mtl,.fbx,.png,.jpg,.jpeg,.webp',
  });
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (files.length && onImportFiles) onImportFiles(files);
  });

  // ---- 启动台：4 个已实装的入口 ----
  const deck = [
    {
      key: 'gallery', tag: 'Gallery', title: '数字展厅',
      desc: '五件展品实时陈列，可切灯光/环境/后期，任意视角观察与截图。',
      cta: '进入展厅', href: '#/gallery', primary: true,
    },
    {
      key: 'studio', tag: 'AI Studio', title: 'AI 资产工作台',
      desc: '连接本地后端后：资产分析、算子处理、AI 诊断、前后对比与导出。',
      cta: '打开工作台', href: '#/studio', primary: false,
    },
    {
      key: 'import', tag: 'Import', title: '导入模型',
      desc: '直接打开 GLB / GLTF / OBJ / FBX，导入即刻进入展厅观察。',
      cta: '选择文件…', href: null, primary: false,
    },
    {
      key: 'library', tag: 'Library', title: '资产库',
      desc: libCount ? `已发布 ${libCount} 件处理产物，可在展厅资产库组直接查看。` : '还没有产物：在 AI Studio 处理并「加入展厅」后会出现在这里。',
      cta: libCount ? `查看 ${libCount} 件` : '暂无产物', href: libCount ? '#/gallery' : null, primary: false, disabled: libCount === 0,
    },
  ];

  const deckCards = deck.map((d) => {
    const node = d.href
      ? el('a', { class: 'v5-launch' + (d.primary ? ' is-primary' : '') + (d.disabled ? ' is-disabled' : ''), href: d.href })
      : el('button', { class: 'v5-launch' + (d.primary ? ' is-primary' : '') + (d.disabled ? ' is-disabled' : ''), type: 'button', disabled: d.disabled ? true : undefined });
    node.append(
      el('span', { class: 'v5-badge', 'data-tone': d.primary ? 'gold' : undefined }, d.tag),
      el('h3', { class: 'v5-launch-title' }, d.title),
      el('p', { class: 'v5-launch-desc' }, d.desc),
      el('span', { class: 'v5-launch-cta' }, d.cta + ' →'),
    );
    if (d.key === 'import') node.addEventListener('click', () => fileInput.click());
    return node;
  });

  // ---- Hero（3D 主体铺满右侧，文字层在左）----
  const heroStage = el('div', { class: 'v5-hero-3d', 'aria-hidden': 'true' });
  const hero = el('section', { class: 'v5-hero' },
    heroStage,
    el('div', { class: 'v5-container v5-hero-inner' },
      el('p', { class: 'v5-eyebrow' }, 'Qiong Opera · Digital Figurines'),
      el('h1', { class: 'v5-display v5-hero-title' },
        el('span', { class: 'v5-hero-line' }, '琼剧'),
        el('span', { class: 'v5-hero-line v5-hero-line-accent' }, '五相'),
      ),
      el('p', { class: 'v5-lede v5-hero-lede' },
        '五件琼剧角色数字手办，以实时三维方式陈列。生旦净三行当、脸谱谱式与头饰规制皆可逐件审视；同一套资产贯穿展示、分析、修复与导出。'),
      el('div', { class: 'v5-launch-grid' }, ...deckCards, fileInput),
    ),
  );

  // ---- 真实指标条（数值来自真实工程状态，不做估算）----
  const statRow = el('div', { class: 'v5-stat-row' },
    v5Stat('展品', String(figurines.length), '琼剧角色'),
    v5Stat('渲染内核', 'r186', 'Three.js'),
    v5Stat('依赖', '离线', '无 CDN'),
    v5Stat('资产库', String(libCount), '处理产物'),
    v5Stat('运行记录', String(runCount), lastRun ? `最近 ${lastRun.slice(0, 12)}` : '暂无'),
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

  // ---- 工作流（三步，每一步都指向已实装能力；未实装项不列入）----
  const lanes = [
    { to: '/studio', tag: 'Step 01', title: '导入与分析', desc: '把 GLB/GLTF/OBJ/FBX 交给本地后端：网格、材质、贴图、动画与边界盒全部真实解析，FBX 还会判定内嵌/外部/缺失贴图。' },
    { to: '/studio', tag: 'Step 02', title: 'AI 诊断与处理', desc: '算子链（焊接/减面/法线/贴图压缩/格式转换等）按真实参数执行，AI Agent 可自主分析并给出处理建议。' },
    { to: '/studio', tag: 'Step 03', title: '对比与导出', desc: '处理前后两个模型在同一场景同相机下滑条对比，顶点/面数/体积差值一目了然，确认后加入展厅或发布。' },
  ];
  const laneCards = lanes.map((l) => el('a', { class: 'v5-card v5-lane', href: '#' + l.to },
    el('span', { class: 'v5-badge' }, l.tag),
    el('h3', { class: 'v5-h3', style: { marginTop: '12px' } }, l.title),
    el('p', { class: 'v5-lane-desc' }, l.desc),
  ));

  const laneSection = el('section', { class: 'v5-section' },
    el('div', { class: 'v5-container' },
      el('div', { class: 'v5-section-head' },
        el('p', { class: 'v5-eyebrow' }, 'Workflow'),
        el('h2', { class: 'v5-h1' }, '从展示到生产'),
      ),
      el('div', { class: 'v5-lane-grid' }, ...laneCards),
    ),
  );

  // ---- 联系方式：位于功能展示之后、公共页脚之前，只占一小条 ----
  const contactSection = createContactBlock({
    variant: 'block',
    title: '联系',
    note: '关于展品授权、模型交付或本地完整版部署，都可以直接邮件联系。',
  });

  const node = el('div', { class: 'v5-home' }, hero, seriesSection, laneSection, contactSection);

  // 3D 主体：挂载后启动；unmount 完整释放（renderer/geo/textures/composer）
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = quality === 'auto'
    ? (navigator.hardwareConcurrency >= 6 ? 'high' : 'low')
    : quality;
  const hero3d = createHero3D({ container: heroStage, quality: q, reducedMotion: reduced });

  return {
    node,
    unmount() {
      try { hero3d.dispose(); } catch (e) { console.warn('[home] hero3d dispose:', e); }
    },
    hero3d,
  };
}
