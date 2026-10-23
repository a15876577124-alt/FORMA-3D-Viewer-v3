// FORMA V5 — Studio 左侧资源树
// 项目 / 资产 / 版本 / 批处理选择。数据全部来自后端真实响应，无占位条目。
import { el } from '../utils/dom.js';
import { fmtBytes } from './core.js';

export function createAssetTree({ core, onPreview, toast }) {
  const node = el('div', { class: 'st-tree', id: 'studioTree' });

  const head = el('div', { class: 'st-tree-head' },
    el('span', { class: 'st-tree-title' }, '资源树'),
    el('button', { class: 'st-icon-btn', type: 'button', id: 'stTreeRefresh', title: '刷新资产列表（重新读取工作区）' }, '↻'),
  );

  const search = el('input', { class: 'st-search', id: 'stTreeSearch', type: 'search', placeholder: '筛选资产…', 'aria-label': '筛选资产' });

  // ---- 区块工厂 ----
  function section(key, title, hint) {
    const list = el('div', { class: 'st-list', role: 'list' });
    const box = el('section', { class: 'st-sect', 'data-sect': key },
      el('button', { class: 'st-sect-head', type: 'button', 'aria-expanded': 'true' },
        el('span', { class: 'st-caret', 'aria-hidden': 'true' }, '▾'),
        el('span', { class: 'st-sect-title' }, title),
        el('span', { class: 'st-sect-count', 'data-count': key }, '0'),
      ),
      list,
    );
    if (hint) list.append(el('p', { class: 'st-hint' }, hint));
    const btn = box.querySelector('.st-sect-head');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      list.hidden = open;
    });
    return { box, list, key, title };
  }

  const secAssets = section('assets', '工作区资产');
  const secVersions = section('versions', '版本');
  const secLocal = section('local', '本地导入（未上传后端）');

  const batchBar = el('div', { class: 'st-batch-bar', id: 'stBatchBar' },
    el('label', { class: 'st-check' }, el('input', { type: 'checkbox', id: 'stBatchAll' }), el('span', {}, '全选')),
    el('span', { class: 'st-batch-count', id: 'stBatchCount' }, '已选 0'),
  );

  node.append(head, search, batchBar, secAssets.box, secVersions.box, secLocal.box);

  // 批处理勾选集合（资产 id）
  const batch = new Set();
  let localEntries = [];   // { id, name, format, bytes }

  function rowForAsset(a) {
    const cb = el('input', { type: 'checkbox', class: 'st-row-check', 'data-id': a.id, 'aria-label': `选择 ${a.name} 参与批处理` });
    cb.checked = batch.has(a.id);
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) batch.add(a.id); else batch.delete(a.id);
      updateBatchBar();
    });
    const active = core.state.selectedAsset === a.id;
    const row = el('div', { class: 'st-row' + (active ? ' is-active' : ''), role: 'listitem', 'data-asset': a.id, tabindex: '0', title: a.name },
      cb,
      el('span', { class: 'st-row-main' },
        el('span', { class: 'st-row-name' }, a.name),
        el('span', { class: 'st-row-meta' }, `${String(a.format || '-').toUpperCase()}${a.bytes ? ` · ${fmtBytes(a.bytes)}` : ''}`),
      ),
      el('span', { class: 'st-row-badge' }, String(a.format || '?').slice(0, 4)),
    );
    row.addEventListener('click', () => core.selectAsset(a.id));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); core.selectAsset(a.id); } });
    return row;
  }

  function updateBatchBar() {
    const count = batch.size;
    const c = node.querySelector('#stBatchCount');
    if (c) c.textContent = `已选 ${count}`;
    const all = node.querySelector('#stBatchAll');
    if (all) {
      const ids = (core.state.assets || []).map((a) => a.id);
      all.checked = ids.length > 0 && ids.every((i) => batch.has(i));
      all.indeterminate = !all.checked && count > 0;
    }
    node.dispatchEvent(new CustomEvent('forma:batch', { detail: { ids: [...batch] }, bubbles: true }));
  }

  search.addEventListener('input', renderAssets);
  node.querySelector('#stBatchAll').addEventListener('change', (e) => {
    const ids = filtered().map((a) => a.id);
    if (e.target.checked) ids.forEach((i) => batch.add(i)); else ids.forEach((i) => batch.delete(i));
    renderAssets();
  });
  node.querySelector('#stTreeRefresh').addEventListener('click', async () => {
    await core.refreshAssets();
    toast?.('已刷新工作区资产', 'ok', 2000);
  });

  function filtered() {
    const q = String(search.value || '').trim().toLowerCase();
    const list = core.state.assets || [];
    return q ? list.filter((a) => String(a.name || '').toLowerCase().includes(q) || String(a.id).toLowerCase().includes(q)) : list;
  }

  function renderAssets() {
    const list = secAssets.list;
    list.innerHTML = '';
    const items = filtered();
    node.querySelector('[data-count="assets"]').textContent = String(items.length);
    if (!items.length) {
      list.append(el('p', { class: 'st-hint' }, core.state.status === 'online'
        ? '工作区暂无资产——用顶部「导入」把模型送进来。'
        : '后端未连接，读取不到工作区资产。'));
      return;
    }
    for (const a of items) list.append(rowForAsset(a));
  }

  async function renderVersions(assetId) {
    const list = secVersions.list;
    list.innerHTML = '';
    if (!assetId) {
      node.querySelector('[data-count="versions"]').textContent = '0';
      list.append(el('p', { class: 'st-hint' }, '选择一个资产后显示其处理版本。'));
      return;
    }
    list.append(el('p', { class: 'st-hint' }, '读取版本…'));
    const entries = await core.listVersions();
    if (assetId !== core.state.selectedAsset) return;
    const hit = entries.find((e) => e.assetId === assetId);
    list.innerHTML = '';
    const versions = [{version:0, ops:['Original']}, ...(hit?.versions || []).filter(v => v.modelFile)];
    node.querySelector('[data-count="versions"]').textContent = String(versions.length);
    if (!versions.length) {
      list.append(el('p', { class: 'st-hint' }, '该资产还没有处理版本——执行一次处理后出现。'));
      return;
    }
    for (const v of versions) {
      const label = v.version ? `v${v.version}` : 'Original';
      const ops = (v.ops || []).join(' → ') || '（无算子记录）';
      const row = el('div', { class: 'st-row st-row-version' + (v.version === core.state.selectedVersion ? ' is-active' : ''), role: 'listitem', tabindex:'0', 'data-version':v.version },
        el('span', { class: 'st-ver-badge' }, label),
        el('span', { class: 'st-row-main' },
          el('span', { class: 'st-row-name' }, ops),
          el('span', { class: 'st-row-meta' }, v.createdAt ? String(v.createdAt).slice(0, 19).replace('T', ' ') : '时间未知'),
        ),
      );
      row.addEventListener('click', () => core.selectAsset(assetId, v.version));
      row.addEventListener('keydown', e => { if (e.key === 'Enter') core.selectAsset(assetId, v.version); });
      list.append(row);
    }
  }

  function renderLocal() {
    const list = secLocal.list;
    list.innerHTML = '';
    node.querySelector('[data-count="local"]').textContent = String(localEntries.length);
    if (!localEntries.length) {
      list.append(el('p', { class: 'st-hint' }, '在展厅里直接打开的模型只是本地预览，不会进入后端资源树。'));
      return;
    }
    for (const a of localEntries) {
      const row = el('div', { class: 'st-row', role: 'listitem', 'data-local': a.id, tabindex: '0', title: a.name },
        el('span', { class: 'st-row-main' },
          el('span', { class: 'st-row-name' }, a.name),
          el('span', { class: 'st-row-meta' }, `本地预览 · ${a.format}`),
        ),
      );
      row.addEventListener('click', () => onPreview?.(a.id));
      list.append(row);
    }
  }

  return {
    node,
    renderAssets,
    renderVersions,
    renderLocal,
    setLocalEntries(list) { localEntries = list || []; renderLocal(); },
    getBatchIds: () => [...batch],
    clearBatch() { batch.clear(); updateBatchBar(); },
    refreshAll() { renderAssets(); renderLocal(); },
  };
}
