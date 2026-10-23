// Left sidebar: two collapsible exhibit groups, plus the mobile gallery select
// and the immersive-mode thumbnail strip, which are the same data rendered for
// narrow layouts.
import { FIGURINES, DEMOS } from '../models/catalog.js';
import { el, $, formatNumber } from '../utils/dom.js';

const pad2 = (n) => String(n).padStart(2, '0');

function thumbNode(entry) {
  const box = el('span', { class: 'asset-thumb ' + (entry.tone || '') });
  box.append(el('span', { class: 'asset-fallback' }, entry.glyph || '·'));
  if (entry.thumb) {
    // The thumbnails are generated later by tools/shots.mjs; until a file exists
    // the gradient glyph plate stands in for it. No broken-image boxes.
    const img = el('img', { src: entry.thumb, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

function captionFor(entry) {
  if (entry.tris) return `${formatNumber(entry.tris)} tris`;
  return entry.note || entry.kind || '';
}

function assetCard(entry, badge, onSelect) {
  const node = el('button', {
    class: 'asset', type: 'button', role: 'listitem',
    'data-id': entry.id, 'aria-label': entry.name,
    title: entry.source ? entry.source : entry.name,
  },
    thumbNode(entry),
    el('span', { class: 'asset-text' },
      el('span', { class: 'asset-name' }, entry.name, el('em', {}, ' ' + captionFor(entry))),
      el('span', { class: 'asset-sub' }, entry.sub),
    ),
    el('span', { class: 'asset-num' }, badge),
  );
  node.addEventListener('click', () => onSelect(entry.id));
  return node;
}

function setupGroup(headId, listId, expanded) {
  const head = $(headId);
  const list = $(listId);
  if (!head || !list) return { expand: () => {} };
  const setOpen = (open) => {
    head.setAttribute('aria-expanded', String(!!open));
    list.hidden = !open;
  };
  setOpen(expanded);
  head.addEventListener('click', () => setOpen(head.getAttribute('aria-expanded') !== 'true'));
  return { expand: () => setOpen(true), head, list };
}

function buildGallery(entries, onSelect) {
  const select = $('mobileGallery');
  if (!select) return null;
  const groups = [
    { label: '琼剧数字手办系列', items: FIGURINES },
    { label: '程序化几何演示', items: DEMOS },
  ];
  for (const g of groups) {
    const og = el('optgroup', { label: g.label });
    for (const e of g.items) og.append(el('option', { value: e.id }, e.name));
    select.append(og);
  }
  select.addEventListener('change', () => onSelect(select.value));
  return select;
}

function buildStrip(entries, onSelect) {
  const strip = $('immStrip');
  if (!strip) return new Map();
  const map = new Map();
  for (const e of entries) {
    const b = el('button', { class: 'imm-thumb', type: 'button', 'data-id': e.id, title: e.name, 'aria-label': e.name },
      el('span', {}, e.glyph || '·'));
    if (e.thumb) {
      const img = el('img', { src: e.thumb, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      b.append(img);
    }
    b.addEventListener('click', () => onSelect(e.id));
    strip.append(b);
    map.set(e.id, b);
  }
  return map;
}

/**
 * @returns {{ select(id), addImported(entry), cards: Map, strip: Map }}
 */
export function buildSidebar({ onSelect }) {
  const cards = new Map();
  const groupOf = new Map();
  const all = [...FIGURINES, ...DEMOS];

  const listFig = $('groupFigurines');
  const listDemo = $('groupDemos');

  FIGURINES.forEach((entry, i) => {
    const node = assetCard(entry, pad2(i + 1), onSelect);
    listFig.append(node);
    cards.set(entry.id, node);
    groupOf.set(entry.id, 'fig');
  });

  DEMOS.forEach((entry, i) => {
    const node = assetCard(entry, 'D' + (i + 1), onSelect);
    listDemo.append(node);
    cards.set(entry.id, node);
    groupOf.set(entry.id, 'demo');
  });

  // First group open by default so the main work is visible immediately; the
  // technical demos start collapsed so they read as secondary.
  const fig = setupGroup('groupFigurinesHead', 'groupFigurines', true);
  const demo = setupGroup('groupDemosHead', 'groupDemos', false);

  const gallery = buildGallery(all, onSelect);
  const strip = buildStrip(all, onSelect);

  const setSelected = (id) => {
    for (const [key, node] of cards) {node.classList.toggle('selected', key === id);node.setAttribute('aria-pressed',String(key===id));}
    for (const [key, node] of strip) node.classList.toggle('on', key === id);
    if (gallery && gallery.value !== id) gallery.value = id;
    const g = groupOf.get(id);
    if (g === 'demo') demo.expand();
    if (g === 'fig') fig.expand();
    const node = cards.get(id);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', inline:'nearest' });
  };
  listFig.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
    const i=FIGURINES.findIndex(f=>f.id===document.activeElement?.dataset.id);
    if(i<0)return;
    e.preventDefault();
    const id=FIGURINES[(i+(e.key==='ArrowRight'?1:-1)+FIGURINES.length)%FIGURINES.length].id;
    cards.get(id)?.focus();onSelect(id);
  });

  // Imports land in their own group so they never masquerade as catalogue work.
  function addImported(entry, onSelectImported) {
    let section = document.querySelector('.group[data-group="imported"]');
    if (!section) {
      section = el('section', { class: 'group', 'data-group': 'imported' });
      const head = el('button', { class: 'group-head', type: 'button', id: 'groupImportedHead', 'aria-expanded': 'true' });
      head.innerHTML = '<svg class="group-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1 L8 5 L2 9 Z"/></svg><span class="group-title">导入的模型</span><span class="group-count">0</span>';
      const list = el('div', { class: 'asset-list', id: 'groupImported', role: 'list' });
      const note = el('p', { class: 'group-note' }, 'Imported — 由你在本机载入的外部模型文件，不属于上述任何一个作品组。');
      section.append(head, list, note);
      $('groupDemos').closest('.group').after(section);
      setupGroupRaw(head, list, true);
    }
    const list = section.querySelector('.asset-list');
    const node = assetCard(entry, '↧', onSelectImported || onSelect);
    list.append(node);
    cards.set(entry.id, node);
    strip.delete(entry.id);
    groupOf.set(entry.id, 'imported');
    section.querySelector('.group-count').textContent = String(list.children.length);
    return node;
  }

  // Library-published assets land in their own group (badge ★), same wiring.
  function addLibraryEntry(entry, onSelectLibrary) {
    let section = document.querySelector('.group[data-group="library"]');
    if (!section) {
      section = el('section', { class: 'group', 'data-group': 'library' });
      const head = el('button', { class: 'group-head', type: 'button', id: 'groupLibraryHead', 'aria-expanded': 'true' });
      head.innerHTML = '<svg class="group-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1 L8 5 L2 9 Z"/></svg><span class="group-title">资产库</span><span class="group-count">0</span>';
      const list = el('div', { class: 'asset-list', id: 'groupLibrary', role: 'list' });
      const note = el('p', { class: 'group-note' }, 'Library — 经 FORMA 管线处理并发布的可交付资产。');
      section.append(head, list, note);
      const imported = document.querySelector('.group[data-group="imported"]') || $('groupDemos').closest('.group');
      imported.after(section);
      setupGroupRaw(head, list, true);
    }
    const list = section.querySelector('.asset-list');
    const node = assetCard(entry, '★', onSelectLibrary || onSelect);
    list.append(node);
    cards.set(entry.id, node);
    strip.delete(entry.id);
    groupOf.set(entry.id, 'library');
    section.querySelector('.group-count').textContent = String(list.children.length);
    return node;
  }

  function setupGroupRaw(head, list, expanded) {
    const setOpen = (open) => { head.setAttribute('aria-expanded', String(!!open)); list.hidden = !open; };
    setOpen(expanded);
    head.addEventListener('click', () => setOpen(head.getAttribute('aria-expanded') !== 'true'));
  }

  return { select: setSelected, addImported, addLibraryEntry, cards, strip, gallery };
}
