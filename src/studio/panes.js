// FORMA V5 — Studio 右侧 Lab 坞
// 五个面板全部读真实数据：后端 analyze 报告、Viewer 场景里的真实几何/材质/贴图。
// 没有一个面板是装饰性的：每个控件都直接改写 THREE 材质或触发后端真实算子。
import { el } from '../utils/dom.js';
import {disposeObject} from '../utils/dispose.js';
import { fmtBytes } from './core.js';

const rows = (...children) => el('div', { class: 'st-rows' }, ...children);
const kv = (k, v, tone) => el('div', { class: 'st-kv' },
  el('span', { class: 'st-kv-k' }, k),
  el('span', { class: 'st-kv-v' + (tone ? ' is-' + tone : '') }, v == null || v === '' ? '—' : String(v)),
);
const hint = (text, tone) => el('p', { class: 'st-hint' + (tone ? ' is-' + tone : '') }, text);

function collectMeshes(root) {
  const out = [];
  if (!root) return out;
  root.traverse((o) => { if (o.isMesh && o.geometry) out.push(o); });
  return out;
}

function geomFacts(mesh) {
  const g = mesh.geometry;
  const pos = g.attributes?.position;
  const tri = g.index ? g.index.count / 3 : (pos ? pos.count / 3 : 0);
  return {
    verts: pos ? pos.count : 0,
    tris: Math.round(tri),
    uv: !!g.attributes?.uv,
    uv2: !!g.attributes?.uv1,
    normals: !!g.attributes?.normal,
    colors: !!g.attributes?.color,
    tangents: !!g.attributes?.tangent,
    skin: !!mesh.isSkinnedMesh,
    morph: Object.keys(g.morphAttributes || {}).length,
    indexed: !!g.index,
  };
}

function matFacts(mat) {
  const slots = [];
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
    const t = mat?.[k];
    if (t) slots.push({ slot: k, name: t.name || k, w: t.image?.width || null, h: t.image?.height || null });
  }
  return {
    type: mat?.type || '—',
    name: mat?.name || '(未命名)',
    color: mat?.color ? '#' + mat.color.getHexString() : null,
    metalness: mat?.metalness,
    roughness: mat?.roughness,
    emissiveIntensity: mat?.emissiveIntensity,
    opacity: mat?.opacity,
    transparent: !!mat?.transparent,
    doubleSided: mat?.side === 2,
    slots,
  };
}

// ============================ 1. Asset Inspector ==========================
// 真实资产报告：后端 analyze 的文件/统计/边界/网格/材质/贴图/异常清单。
function assetPane({ core }) {
  const node = el('div', { class: 'st-pane', 'data-pane': 'asset' });
  const body = el('div', { class: 'st-pane-body' });
  const actRow = el('div', { class: 'st-actions' },
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stAnalyzeBtn' }, '重新分析'),
  );
  node.append(actRow, body);

  function update() {
    const rep = core.state.analysis;
    const assetId = core.state.selectedAsset;
    body.innerHTML = '';
    if (!assetId) { body.append(hint('在左侧资源树选择一个资产后，这里显示真实分析报告。')); return; }
    if (core.state.status !== 'online') { body.append(hint('后端未连接——无法读取资产分析。', 'warn')); return; }
    if (!rep) { body.append(hint(core.state.selectedAsset ? '分析中…' : '', 'info')); return; }

    const f = rep.file || {};
    const s = rep.stats || {};
    const b = rep.bounds;

    body.append(el('div', { class: 'st-subhead' }, '文件'));
    body.append(rows(
      kv('名称', f.name),
      kv('格式', String(f.format || '').toUpperCase()),
      kv('体积', fmtBytes(f.bytes)),
      kv('SHA256', f.sha256 ? f.sha256.slice(0, 16) + '…' : null),
    ));

    body.append(el('div', { class: 'st-subhead' }, '几何统计'));
    const pairs = [['网格', s.meshes], ['图元', s.primitives], ['顶点', s.verts], ['三角面', s.tris]];
    const pairs2 = [['材质', s.materials], ['贴图', s.textures], ['动画', s.animations], ['蒙皮', s.skins]];
    body.append(rows(...pairs.map(([k, v]) => kv(k, Number(v || 0).toLocaleString('en-US')))));
    body.append(rows(...pairs2.map(([k, v]) => kv(k, Number(v || 0).toLocaleString('en-US')))));

    if (b) {
      const size = (b.size || []).map((v) => Number(v).toFixed(3));
      body.append(el('div', { class: 'st-subhead' }, '边界盒（米）'));
      body.append(rows(
        kv('最小', (b.min || []).map((v) => Number(v).toFixed(3)).join(', ')),
        kv('最大', (b.max || []).map((v) => Number(v).toFixed(3)).join(', ')),
        kv('尺寸', size.join(' × ')),
        kv('来源', b.source),
      ));
    }

    const issues = rep.issues || [];
    body.append(el('div', { class: 'st-subhead' }, `异常与提示（${issues.length}）`));
    if (!issues.length) body.append(hint('后端未报告异常。', 'ok'));
    else {
      for (const i of issues.slice(0, 40)) {
        body.append(el('div', { class: 'st-issue is-' + (i.severity || 'info') },
          el('span', { class: 'st-issue-tag' }, i.severity === 'error' ? '错误' : i.severity === 'warn' ? '警告' : '提示'),
          el('span', { class: 'st-issue-msg' }, i.message),
          el('span', { class: 'st-issue-target' }, i.target ? String(i.target) : ''),
        ));
      }
    }

    if (rep.asset?.generator) body.append(hint('生成器：' + rep.asset.generator, 'info'));
    if (rep.asset?.parseNote) body.append(hint('解析说明：' + rep.asset.parseNote, 'info'));
  }

  return { node, update, title: 'Asset Inspector', id: 'asset' };
}

// ============================== 2. Material Lab ==========================
// 逐网格读取真实材质，滑杆直接改写 THREE.MeshStandardMaterial，可一键还原。
function materialPane({ viewer, core }) {
  const node = el('div', { class: 'st-pane', 'data-pane': 'material' });
  const listBox = el('div', { class: 'st-mat-list', id: 'stMatList' });
  const editBox = el('div', { class: 'st-mat-edit', id: 'stMatEdit' });
  const actRow = el('div', { class: 'st-actions' },
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stMatReset' }, '重置预览'),
    el('button', { class: 'st-btn st-btn-primary', type: 'button', id: 'stMatSave' }, '保存为新版本'),
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stMatRefresh' }, '重新读取'),
  );
  node.append(hint('调整先用于预览；保存后生成新的 Edited 版本。环境反射仅影响预览。'), actRow, listBox, editBox);

  // 原始值快照：只在首次读取时记录，供「还原」使用（WeakMap 天然随对象回收）
  const originals = new WeakMap();
  let selected = null;

  function snapshot(mat) {
    if (originals.has(mat)) return;
    originals.set(mat, {
      color: mat.color?.getHex(), metalness: mat.metalness, roughness: mat.roughness,
      envMapIntensity: mat.envMapIntensity, emissiveIntensity: mat.emissiveIntensity, opacity: mat.opacity, transparent: mat.transparent, side: mat.side,
    });
  }

  function renderEdit() {
    editBox.innerHTML = '';
    if (!selected) { editBox.append(hint('选择一个网格材质后，这里可以逐属性调整。')); return; }
    const mat = selected.material;
    if (!mat) { editBox.append(hint('该网格没有可读材质。', 'warn')); return; }
    snapshot(mat);
    const f = matFacts(mat);

    editBox.append(el('div', { class: 'st-subhead' }, selected.name));
    editBox.append(rows(
      kv('类型', f.type), kv('名称', f.name),
      kv('贴图槽', f.slots.length ? f.slots.map((s) => s.slot).join(', ') : '无'),
    ));

    const rangeRow = (label, key, min, max, step, apply) => {
      const out = el('em', { class: 'st-num' }, String(Number(mat[key] ?? 0).toFixed(2)));
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(mat[key] ?? 0), class: 'st-range', 'data-material-param':key });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        out.textContent = v.toFixed(2);
        apply(v);
        viewer.render?.();
      });
      return el('label', { class: 'st-field' }, el('span', {}, label), input, out);
    };

    if (mat.color) editBox.append(rangeRow('金属度', 'metalness', 0, 1, 0.01, (v) => { mat.metalness = v; mat.needsUpdate = true; }));
    if (mat.color) editBox.append(rangeRow('粗糙度', 'roughness', 0, 1, 0.01, (v) => { mat.roughness = v; mat.needsUpdate = true; }));
    if (typeof mat.emissiveIntensity === 'number') editBox.append(rangeRow('自发光强度', 'emissiveIntensity', 0, 3, 0.01, (v) => { mat.emissiveIntensity = v; mat.needsUpdate = true; }));
    if (typeof mat.opacity === 'number') editBox.append(rangeRow('不透明度', 'opacity', 0, 1, 0.01, (v) => { mat.opacity = v; mat.needsUpdate = true; }));
    if (typeof mat.envMapIntensity === 'number') editBox.append(rangeRow('环境反射', 'envMapIntensity', 0, 3, 0.01, (v) => { mat.envMapIntensity = v; mat.needsUpdate = true; }));

    if (mat.color) {
      const picker = el('input', { type: 'color', value: f.color || '#ffffff', class: 'st-color' });
      const hex = el('em', { class: 'st-num' }, f.color);
      picker.addEventListener('input', () => { mat.color.set(picker.value); hex.textContent = picker.value; viewer.render?.(); });
      editBox.append(el('label', { class: 'st-field' }, el('span', {}, '基色'), picker, hex));
    }

    const cbTransparent = el('input', { type: 'checkbox', checked: !!mat.transparent });
    cbTransparent.addEventListener('change', () => { mat.transparent = cbTransparent.checked; mat.needsUpdate = true; viewer.render?.(); });
    const cbDouble = el('input', { type: 'checkbox', checked: mat.side === 2 });
    cbDouble.addEventListener('change', () => { mat.side = cbDouble.checked ? 2 : 0; mat.needsUpdate = true; viewer.render?.(); });
    editBox.append(el('label', { class: 'st-check' }, cbTransparent, el('span', {}, '透明混合')),
      el('label', { class: 'st-check' }, cbDouble, el('span', {}, '双面渲染')));
  }

  function update() {
    listBox.innerHTML = '';
    const meshes = core.state.selectionStatus === 'ready' ? collectMeshes(viewer.modelRoot) : [];
    if (selected && !meshes.includes(selected.mesh)) selected = null;
    if (!meshes.length) { listBox.append(hint('当前视口没有网格——先在资源树里选中资产并载入。')); selected = null; renderEdit(); return; }
    const seen = new Set();
    let idx = 0;
    for (const mesh of meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat, mi) => {
        if (!mat) return;
        const name = `${mesh.name || `Mesh ${idx}`}${mats.length > 1 ? ` [${mi}]` : ''}`;
        const key = name + '|' + (mat.uuid || '');
        if (seen.has(key)) return;
        seen.add(key);
        const f = matFacts(mat);
        const row = el('button', { class: 'st-mat-row' + (selected && selected.mesh === mesh && selected.material === mat ? ' is-active' : ''), type: 'button', 'data-mat': key },
          el('span', { class: 'st-mat-name' }, name),
          el('span', { class: 'st-mat-meta' }, `${f.slots.length} 贴图 · M${Number(f.metalness ?? 0).toFixed(2)} / R${Number(f.roughness ?? 0).toFixed(2)}`),
        );
        row.addEventListener('click', () => { selected = { mesh, material: mat, name }; renderEdit(); });
        listBox.append(row);
      });
      idx += 1;
    }
    renderEdit();
  }

  node.querySelector('#stMatReset').addEventListener('click', () => {
    if (!selected?.material) return;
    const o = originals.get(selected.material);
    if (!o) return;
    const m = selected.material;
    if (m.color && o.color != null) m.color.setHex(o.color);
    for (const k of ['metalness', 'roughness', 'emissiveIntensity', 'envMapIntensity', 'opacity', 'transparent', 'side']) if (o[k] != null) m[k] = o[k];
    m.needsUpdate = true;
    viewer.render?.();
    renderEdit();
  });
  node.querySelector('#stMatRefresh').addEventListener('click', update);
  node.querySelector('#stMatSave').addEventListener('click', () => selected && core.saveMaterial(selected.material));

  return { node, update, title: 'Material Lab', id: 'material' };
}

// ============================== 3. Geometry Lab ==========================
// 逐网格真实几何事实：顶点/三角面/UV/法线/顶点色/蒙皮/形态键，以及实时控制。
function geometryPane({ viewer, core }) {
  const node = el('div', { class: 'st-pane', 'data-pane': 'geometry' });
  const sum = el('div', { class: 'st-pane-body', id: 'stGeomSummary' });
  const list = el('div', { class: 'st-geom-list', id: 'stGeomList' });
  const actRow = el('div', { class: 'st-actions' },
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stWireBtn' }, '线框叠加'),
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stBoundsBtn' }, '显示包围盒'),
  );
  node.append(actRow, sum, list);

  let boundsHelper = null, boundsRoot = null;

  function update() {
    if(boundsHelper && boundsRoot!==viewer.modelRoot){disposeObject(boundsHelper);boundsHelper=null;}
    boundsRoot=viewer.modelRoot;
    const meshes = collectMeshes(viewer.modelRoot);
    sum.innerHTML = '';
    if (!meshes.length) { sum.append(hint('当前视口没有网格。')); list.innerHTML = ''; return; }
    let tv = 0, tt = 0, noUv = 0, noNormal = 0;
    for (const m of meshes) {
      const f = geomFacts(m);
      tv += f.verts; tt += f.tris;
      if (!f.uv) noUv += 1;
      if (!f.normals) noNormal += 1;
    }
    sum.append(el('div', { class: 'st-subhead' }, '合计（实时场景）'));
    sum.append(rows(
      kv('网格数', meshes.length),
      kv('顶点', tv.toLocaleString('en-US')),
      kv('三角面', tt.toLocaleString('en-US')),
      kv('缺 UV 的网格', noUv, noUv ? 'warn' : 'ok'),
      kv('缺法线的网格', noNormal, noNormal ? 'warn' : 'ok'),
      kv('统计口径', '已三角化的渲染统计'),
    ));
    if (core.state.analysis?.stats) {
      sum.append(hint(`后端资产口径：顶点 ${core.state.analysis.stats.verts?.toLocaleString('en-US')} · 三角面 ${core.state.analysis.stats.tris?.toLocaleString('en-US')}（两者可能不同：实时场景为已三角化结果）`, 'info'));
    }

    list.innerHTML = '';
    for (const mesh of meshes) {
      const f = geomFacts(mesh);
      const flags = [
        f.indexed ? '索引' : '非索引',
        f.normals ? '法线' : '无法线',
        f.uv ? 'UV' : '无UV',
        f.uv2 ? 'UV2' : null,
        f.colors ? '顶点色' : null,
        f.tangents ? '切线' : null,
        f.skin ? '蒙皮' : null,
        f.morph ? `${f.morph} 形态键` : null,
      ].filter(Boolean);
      list.append(el('div', { class: 'st-geom-row' },
        el('span', { class: 'st-geom-name' }, mesh.name || '(未命名网格)'),
        el('span', { class: 'st-geom-num' }, `${f.verts.toLocaleString('en-US')} 顶点 / ${f.tris.toLocaleString('en-US')} 面`),
        el('span', { class: 'st-geom-flags' }, flags.join(' · ')),
      ));
    }
  }

  node.querySelector('#stWireBtn').addEventListener('click', (e) => {
    const on = !viewer.wireframeOn;
    viewer.setWireframe(on);
    e.currentTarget.classList.toggle('is-on', on);
    viewer.render?.();
  });
  node.querySelector('#stBoundsBtn').addEventListener('click', async (e) => {
    try {
      const THREE = await import('three');
      if (boundsHelper) { disposeObject(boundsHelper); boundsHelper = null; e.currentTarget.classList.remove('is-on'); viewer.render?.(); return; }
      if (!viewer.modelRoot) return;
      const box = new THREE.Box3().setFromObject(viewer.modelRoot);
      boundsHelper = new THREE.Box3Helper(box, 0xd9c4a0);
      viewer.scene.add(boundsHelper);
      e.currentTarget.classList.add('is-on');
      viewer.render?.();
    } catch (err) { console.warn('[geometry] bounds:', err); }
  });

  return { node, update, title: 'Geometry Lab', id: 'geometry' };
}

// =============================== 4. Texture Lab =========================
// 场景里真实挂载的贴图 + FBX 内嵌/外部/缺失三态 + 内嵌贴图提取。
function texturePane({ viewer, core }) {
  const node = el('div', { class: 'st-pane', 'data-pane': 'texture' });
  const liveBox = el('div', { class: 'st-pane-body', id: 'stTexLive' });
  const fbxBox = el('div', { class: 'st-pane-body', id: 'stTexFbx' });
  const actRow = el('div', { class: 'st-actions' },
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stTexDetect' }, '重新检测'),
    el('button', { class: 'st-btn st-btn-primary', type: 'button', id: 'stTexExtract' }, '提取内嵌贴图'),
  );
  node.append(actRow, liveBox, fbxBox);

  const TEX_LABEL = { embedded: '内嵌', external: '外部', missing: '缺失' };

  function renderLive() {
    liveBox.innerHTML = '';
    liveBox.append(el('div', { class: 'st-subhead' }, '当前载入的贴图（实时场景）'));
    const meshes = collectMeshes(viewer.modelRoot);
    const seen = new Map();
    for (const mesh of meshes) {
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
        if (!mat) continue;
        for (const s of matFacts(mat).slots) {
          if (seen.has(s.slot + s.name)) continue;
          seen.set(s.slot + s.name, true);
          liveBox.append(el('div', { class: 'st-tex-row' },
            el('span', { class: 'st-tex-badge is-live' }, s.slot.replace('Map', '')),
            el('span', { class: 'st-tex-name', title: s.name }, s.name),
            el('span', { class: 'st-tex-dim' }, s.w && s.h ? `${s.w}×${s.h}` : '尺寸未知'),
          ));
        }
      }
    }
    if (!seen.size) liveBox.append(hint('当前材质没有挂载贴图（可能为纯色材质）。'));
  }

  function renderFbx() {
    fbxBox.innerHTML = '';
    fbxBox.append(el('div', { class: 'st-subhead' }, 'FBX 贴图关系（后端真实解析）'));
    const t = core.state.textures;
    if (!t) {
      const asset = (core.state.assets || []).find((a) => a.id === core.state.selectedAsset);
      fbxBox.append(hint(asset && String(asset.format).startsWith('fbx')
        ? '等待后端解析…'
        : '当前资产不是 FBX——贴图三态检测仅用于 FBX（OBJ/GLB 的贴图关系已由上方列表实时反映）。'));
      return;
    }
    const list = t.textures || [];
    if (!list.length) { fbxBox.append(hint('该 FBX 未引用任何贴图。')); return; }
    for (const item of list) {
      const cls = item.source === 'embedded' ? 'is-emb' : item.source === 'external' ? 'is-ext' : 'is-miss';
      const meta = item.source === 'embedded'
        ? `${item.mime || '未知类型'}${item.width ? ` · ${item.width}×${item.height}` : ''} · ${fmtBytes(item.bytes)}`
        : item.source === 'external' ? `外部文件${item.external?.resolved ? '（已随文件提供）' : '（未找到）'}`
          : '未随文件提供——导入后会白模';
      fbxBox.append(el('div', { class: 'st-tex-row' },
        el('span', { class: 'st-tex-badge ' + cls }, TEX_LABEL[item.source] || item.source),
        el('span', { class: 'st-tex-name', title: item.uri || '' }, item.uri || item.name),
        el('span', { class: 'st-tex-dim' }, meta),
      ));
    }
    const missing = list.filter((i) => i.source === 'missing').length;
    const embedded = list.filter((i) => i.source === 'embedded').length;
    if (missing) fbxBox.append(hint(`⚠ ${missing} 张贴图缺失——交付时会显示白模，请连同贴图一起交付。`, 'warn'));
    const btn = node.querySelector('#stTexExtract');
    if (btn) btn.disabled = embedded === 0;

    // 内嵌贴图提取产物：真实文件链接（走同源 /api/file 安全服务）
    const ex = core.state.lastExtract;
    if (ex && (ex.files || []).length) {
      fbxBox.append(el('div', { class: 'st-subhead' }, `已提取 ${ex.count ?? ex.files.length} 张内嵌贴图`));
      const out = el('div', { class: 'st-tex-out' });
      for (const f of ex.files) {
        out.append(el('a', { class: 'st-link', href: f.url, target: '_blank', rel: 'noreferrer', download: f.name },
          `${f.name}${f.width ? ` · ${f.width}×${f.height}` : ''}`));
      }
      fbxBox.append(out);
    }
  }

  function update() { renderLive(); renderFbx(); }

  node.querySelector('#stTexDetect').addEventListener('click', () => core.detectTextures());
  node.querySelector('#stTexExtract').addEventListener('click', () => core.extractTextures());

  return { node, update, title: 'Texture Lab', id: 'texture' };
}

// ============================== 5. Export Manager =======================
// 真实导出：调用后端 convert 算子产出目标格式，并给出可直接下载的真实 URL。
function exportPane({ core, toast }) {
  const node = el('div', { class: 'st-pane', 'data-pane': 'export' });
  const body = el('div', { class: 'st-pane-body', id: 'stExportBody' });
  const fmtSel = el('select', { class: 'st-select', id: 'stExportFormat' },
    el('option', { value: 'glb' }, 'glTF Binary (.glb)'),
    el('option', { value: 'gltf' }, 'glTF JSON (.gltf)'),
    el('option', { value: 'obj' }, 'Wavefront (.obj)'),
  );
  const actRow = el('div', { class: 'st-actions' },
    el('label', { class: 'st-field st-inline' }, el('span', {}, '目标格式'), fmtSel),
    el('button', { class: 'st-btn st-btn-primary', type: 'button', id: 'stExportRun' }, '导出'),
    el('button', { class: 'st-btn st-btn-ghost', type: 'button', id: 'stExportPublish' }, '发布到展厅资产库'),
  );
  node.append(actRow, body);

  function update() {
    body.innerHTML = '';
    const run = core.state.lastExport || core.state.lastRun;
    body.append(el('div', { class: 'st-subhead' }, '最近产物'));
    if (!run) { body.append(hint('还没有处理产物——执行处理后，这里会出现真实文件的下载链接。')); return; }
    const url = '/api/assets/' + encodeURIComponent(run.assetId) + '/versions/' + run.version + '/download';
    body.append(rows(
      kv('资产', run.assetId),
      kv('版本', 'v' + run.version),
      kv('前体积', fmtBytes(run.before?.bytes)),
      kv('后体积', fmtBytes(run.after?.bytes)),
      kv('后验', run.verify?.pass ? '通过' : (run.verify ? '失败' : '未执行'), run.verify?.pass ? 'ok' : 'warn'),
    ));
    body.append(el('div', { class: 'st-link-row' },
      el('a', { class: 'st-link', href: url, target: '_blank', rel: 'noreferrer', download: String(run.afterPath).split('/').pop() }, '下载完整资源包 ZIP'),
      el('a', { class: 'st-link', href: core.toFileUrl(run.beforePath), target: '_blank', rel: 'noreferrer' }, '原始文件'),
    ));
    body.append(hint('产物路径由后端真实落盘后返回（pipeline-out/<资产>-v<N>/），链接走同源 /api/file 安全服务。', 'info'));
  }

  node.querySelector('#stExportRun').addEventListener('click', async () => {
    const res = await core.exportAs(fmtSel.value);
    if (res) { const b = body; update(); b.scrollTop = 0; toast?.('已导出 ' + String(res.afterPath).split('/').pop(), 'ok'); }
  });
  node.querySelector('#stExportPublish').addEventListener('click', () => core.publish());

  return { node, update, title: 'Export Manager', id: 'export' };
}

export function createLabs({ viewer, core, toast }) {
  const panes = [
    assetPane({ core }),
    materialPane({ viewer, core }),
    geometryPane({ viewer, core }),
    texturePane({ viewer, core }),
    exportPane({ core, toast }),
  ];

  const tabs = el('div', { class: 'st-tabs', role: 'tablist' });
  const stack = el('div', { class: 'st-pane-stack' });
  for (const p of panes) {
    const btn = el('button', { class: 'st-tab', type: 'button', role: 'tab', 'data-pane': p.id, 'aria-selected': 'false' }, p.title);
    btn.addEventListener('click', () => activate(p.id));
    tabs.append(btn);
    stack.append(p.node);
  }

  let activeId = panes[0].id;
  function activate(id) {
    activeId = id;
    for (const btn of tabs.children) btn.setAttribute('aria-selected', String(btn.dataset.pane === id));
    for (const p of panes) p.node.hidden = p.id !== id;
    panes.find((p) => p.id === id)?.update();
  }

  activate(activeId);
  const node = el('div', { class: 'st-labs', id: 'studioRail' }, tabs, stack);
  node.hidden = true;

  return {
    node,
    activate,
    update() { panes.find((p) => p.id === activeId)?.update(); },
    updateAll() { for (const p of panes) p.update(); },
    get activeId() { return activeId; },
  };
}
