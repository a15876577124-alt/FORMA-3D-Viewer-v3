// FORMA V5 — 作品详情页 #/work/:id
// 数据原则：3D 是真实手办资产；技术参数优先取本地后端真实分析报告，
// 后端不可达时明确标注降级，绝不虚构数值。
import { el } from '../utils/dom.js';
import { createMiniViewer } from '../core/miniViewer.js';

const CULTURE = {
  sheng: {
    role: '生角', line: '素面俊扮 · 青衫褶子',
    desc: '生角为琼剧行当男性正面角色，俊扮不勾脸谱。此件手办以素面呈现，重在身段与褶子纹样的整洁利落——青衫与乌纱构成读书人的舞台形象。',
  },
  dan: {
    role: '旦角', line: '完整头饰 · 点翠成规',
    desc: '旦角头饰规制繁复：顶花、边凤、后三件逐层佩戴。此件完整呈现头饰层叠结构，点翠蓝与珠饰的配比依琼剧传统样式。',
  },
  'jing-red': {
    role: '净角 · 红谱', line: '红为忠勇 · 额面勾纹',
    desc: '红色脸谱在琼剧谱式中主忠勇耿直。额面勾纹与眉窝的走势决定了角色的气度，此件按红谱标准谱式勾画。',
  },
  'jing-yellow': {
    role: '净角 · 黄谱', line: '黄示骠悍 · 眉窝高挑',
    desc: '黄色谱式多表骠悍凶猛。眉窝高挑、鼻窝宽阔是其识别特征，配色上黄底配红黑线条以强化性格张力。',
  },
  'jing-white': {
    role: '净角 · 白谱', line: '白多疑诈 · 鼻窝三瓦',
    desc: '白色脸谱主多疑奸诈，鼻窝三瓦式是典型画法。此件以白底细线勾出内敛的阴鸷感，与红黄谱式的浓烈形成对照。',
  },
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
  const viewer3d = createMiniViewer({
    container: stage,
    modelUrl: entry.file || `./assets/models/${id}.glb`,
    autoRotateSpeed: 0.04,
    onError: () => stage.replaceChildren(el('div', { class: 'v5-state', 'data-tone': 'err' },
      el('div', { class: 'v5-state-icon' }, '!'),
      el('p', { class: 'v5-state-title' }, '模型加载失败'),
      el('p', { class: 'v5-state-desc' }, '请确认 assets/models 下的 GLB 文件存在。'))),
  });

  // ---- 信息面板 ----
  const infoPanel = el('aside', { class: 'v5-work-info' },
    el('p', { class: 'v5-eyebrow' }, `Work ${String(idx + 1).padStart(2, '0')} / 05`),
    el('h1', { class: 'v5-h1' }, entry.name),
    el('p', { class: 'v5-work-line' }, culture.line),
    el('hr', { class: 'v5-rule' }),
    el('p', { class: 'v5-work-desc' }, culture.desc),
    el('div', { class: 'v5-work-actions' },
      el('a', { class: 'v5-btn v5-btn-gold', href: `#/gallery?work=${id}` }, '在展厅中细看'),
      el('a', { class: 'v5-btn', href: `#/work/${prevId}` }, '‹ 上一件'),
      el('a', { class: 'v5-btn', href: `#/work/${nextId}` }, '下一件 ›'),
    ),
  );

  // ---- 技术参数（异步：后端可达时取真实报告）----
  const techBox = el('div', { class: 'v5-card v5-tech', id: 'v5Tech' },
    el('h3', { class: 'v5-h3' }, '技术参数'),
    el('div', { class: 'v5-tech-body' },
      el('div', { class: 'v5-skeleton v5-skeleton-text' }),
      el('div', { class: 'v5-skeleton v5-skeleton-text', style: { width: '70%' } }),
    ),
  );

  fetchBackendReport(id).then((data) => {
    const body = techBox.querySelector('.v5-tech-body');
    if (!body) return;
    if (!data) {
      body.replaceChildren(el('p', { class: 'v5-work-note' },
        '本地后端未连接——网格/贴图等处理级参数需运行 npm run pipeline:serve 后可用。基础信息见下。'));
      body.append(buildBasicStats());
      return;
    }
    body.replaceChildren(buildReportStats(data));
  });

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
    unmount() { try { viewer3d.dispose(); } catch { /* ignore */ } },
  };
}

// ---- 后端真实报告（workspace assetId 形如 sheng-6ce3cb51，按前缀匹配）----
async function fetchBackendReport(catalogId) {
  try {
    const res = await fetch('/api/assets', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const { assets = [] } = await res.json();
    const asset = assets.find((a) => a.id.startsWith(catalogId + '-') || a.id === catalogId);
    if (!asset) return null;
    const rep = await fetch(`/api/assets/${asset.id}/report`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return { assetId: asset.id, report: rep?.report || null };
  } catch { return null; }
}

function statRow(label, value, sub) {
  return el('div', { class: 'v5-stat' },
    el('div', { class: 'v5-stat-label' }, label),
    el('div', { class: 'v5-stat-value v5-num' }, String(value)),
    sub ? el('div', { class: 'v5-stat-sub' }, sub) : null,
  );
}

function buildBasicStats() {
  return el('div', { class: 'v5-stat-row' },
    statRow('格式', 'GLB', 'glTF 二进制'),
    statRow('行当', '生旦净', '琼剧三行当'),
  );
}

function buildReportStats({ assetId, report }) {
  const s = report?.stats || {};
  const tex = (report?.textures || []);
  const maxTex = tex.reduce((m, t) => Math.max(m, t.width || 0), 0);
  const row = el('div', { class: 'v5-stat-row' },
    statRow('资产 ID', assetId, '本地后端 workspace'),
    statRow('顶点', (s.verts ?? 0).toLocaleString('en-US'), '真实解析'),
    statRow('三角形', (s.tris ?? 0).toLocaleString('en-US'), '真实解析'),
    statRow('贴图最大宽', maxTex ? `${maxTex}px` : '—', `${tex.length} 张`),
  );
  return row;
}
