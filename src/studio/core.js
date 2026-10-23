// FORMA V5 — Studio 工作流内核（headless）
//
// 只负责「真实业务」：后端连接状态、资产/版本、分析、算子参数、确认门、
// AI Agent、批量、Before/After 双模型对比、发布与导出。
// 不持有任何 DOM：界面由 src/studio/ui.js 订阅这里的事件后自行渲染。
//
// 事件：connecting / online / offline / assets / analyze / agent / run /
//       batch / compare / publish / log / progress
import { pipelineApi, fileUrl } from '../net/api.js';
import { CompareRig } from '../core/compare.js';
import { loadGLTF, loadOBJ, loadFBX } from '../loaders/importers.js';

// 从后端可服务 URL 载入真实模型。glTF 直接走 URL（相对 .bin/贴图可被解析）；
// OBJ/FBX 的 importer 只接受 File，故先取回字节包成 File（语义与拖放一致）。
export async function loadModelFromUrl(url, name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'glb' || ext === 'gltf') return (await loadGLTF(url)).root;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`载入失败 ${name}（HTTP ${res.status}）`);
  const blob = await res.blob();
  const file = new File([blob], name);
  if (ext === 'obj') return (await loadOBJ(file, [file])).root;
  if (ext === 'fbx') return (await loadFBX(file, [file])).root;
  throw new Error(`暂不支持对比该格式：.${ext}`);
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export function fmtDelta(a, b, fmt = (v) => (Number.isFinite(v) ? v.toLocaleString('en-US') : '-')) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '-';
  const d = b - a;
  if (d === 0) return '±0';
  return (d > 0 ? '+' : '−') + fmt(Math.abs(d));
}

// 后端可达性分级文案：UI 用它解释「为什么点不动」，而不是让用户反复点失败按钮。
export const OFFLINE_GUIDE = {
  title: '本地后端未运行',
  lines: [
    'npm start              # 同时启动前端与 Pipeline 后端（推荐）',
    'npm run pipeline:serve # 只启动后端（127.0.0.1:8787）',
  ],
  note: 'AI Studio 的分析、算子处理、AI Agent、批处理与导出都依赖本地后端。GitHub Pages 静态展示版只提供数字展厅与观展功能——处理类能力请在本地完整版（FORMA.bat / npm run start）中使用。',
};

export function createStudioCore({ viewer, appState, onPublish, onSyncLibrary, onSelection, onEvent }) {
  const emit = (type, payload) => { try { onEvent?.(type, payload); } catch (e) { console.warn('[studio:emit]', e); } };

  const state = {
    status: 'unknown',        // unknown | connecting | online | offline
    lastError: null,
    modelError: null,
    health: null,
    ops: [], tools: [], models: [], assets: [], presets: [], capabilities: null,
    selectedAsset: null,
    selectedVersion: 0,
    selection: null,
    selectionStatus: 'empty',
    opValues: {},             // { opName: params }
    enabledOps: new Set(),    // 勾选的算子名
    confirmToken: null,
    analysis: null,           // 最近一次 analyze 报告
    textures: null,           // 最近一次贴图三态报告
    lastRun: null,
    lastExport: null,
    lastAgent: null,
    lastExtract: null,
    lastBatch: null,
    rig: null,
    compareSplit: 0.5,
    history: [],              // 本次会话的执行记录
  };

  emit('state', state);

  // ------------------------------------------------------------ 连接 ----
  async function connect({ silent = false } = {}) {
    if (state.status === 'connecting') return state.status;
    state.status = 'connecting';
    state.lastError = null;
    emit('connecting', { silent });
    try {
      const [health, opsRes, toolsRes, modelsRes, assetsRes, capsRes, presetsRes] = await Promise.all([
        pipelineApi.health(),
        pipelineApi.ops(),
        pipelineApi.agentTools(),
        pipelineApi.models().catch((e) => ({ models: [], error: String(e?.message || e) })),
        pipelineApi.assets(),
        pipelineApi.capabilities().catch(() => ({ capabilities: null })),
        pipelineApi.presets().catch(() => ({ presets: [] })),
      ]);
      state.health = health;
      state.ops = opsRes.ops || [];
      state.tools = toolsRes.tools || [];
      state.models = modelsRes.models || [];
      state.modelError = modelsRes.error || null;
      state.assets = assetsRes.assets || [];
      state.capabilities = capsRes.capabilities || null;
      state.presets = presetsRes.presets || [];
      state.status = 'online';
      emit('online', { assets: state.assets.length, models: (state.models || []).length });
      emit('assets', state.assets);
      if (state.modelError) emit('log', { tone: 'warn', text: 'AI 模型服务暂不可用，本地分析与处理仍可使用：' + state.modelError });
      try {
        const pub = await pipelineApi.libraryPublished();
        const added = onSyncLibrary ? (onSyncLibrary(pub.files || [], state.assets) || 0) : 0;
        if (added > 0) emit('log', { tone: 'ok', text: `已同步 ${added} 个处理产物到资产库` });
      } catch { /* 资产库不可读不影响主流程 */ }
      return 'online';
    } catch (e) {
      state.status = 'offline';
      state.lastError = String(e?.message || e);
      emit('offline', { error: state.lastError, guide: OFFLINE_GUIDE });
      return 'offline';
    }
  }

  // 静默探测：进入 Studio 时用，失败不弹错误，只更新状态条
  async function probe() { return connect({ silent: true }); }

  function requireOnline() {
    if (state.status !== 'online') {
      emit('log', { tone: 'warn', text: '后端未连接——请先在顶部状态条启动本地后端并重试' });
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------ 资产 ----
  let selectionTicket = 0;
  let compareTicket = 0;
  async function selectAsset(id, version = 0, { keepRun = false } = {}) {
    const ticket = ++selectionTicket;
    ++viewer.ticket; // Invalidate a pending Gallery load as well.
    await exitCompare();
    state.selectedAsset = id || null;
    state.selectedVersion = version;
    state.selection = null;
    state.selectionStatus = id ? 'loading' : 'empty';
    if (viewer.modelRoot) viewer.modelRoot.visible = false;
    state.analysis = null;
    state.textures = null;
    state.lastExport = null;
    state.confirmToken = null;
    if (!keepRun) state.lastRun = null;
    emit('select', state.selectedAsset);
    if (!id) return null;
    try {
      const source = await pipelineApi.source(id, version);
      if (ticket !== selectionTicket) return null;
      const loaded = source.format === 'glb' || source.format === 'gltf'
        ? await loadGLTF(fileUrl(source.path))
        : { root: await loadModelFromUrl(fileUrl(source.path), source.path), animations: [], extras: {format:source.format} };
      if (ticket !== selectionTicket) { viewer._disposeLoaded(loaded); return null; }
      viewer.materialState = {mode:'original'};
      const entry = {id:'studio:' + id + ':' + version, assetId:id, version, name:source.name + (version ? ' · v' + version : ' · Original'), file:fileUrl(source.path), format:source.format};
      viewer.mountImported(loaded, entry);
      viewer.modelRoot.visible = true;
      state.selection = source;
      state.analysis = source.report;
      state.selectionStatus = 'ready';
      onSelection?.(entry);
      emit('selection', source);
      emit('analyze', {report:source.report});
      await detectTextures({silent:true});
      return source;
    } catch (e) {
      if (ticket !== selectionTicket) return null;
      state.selectionStatus = 'error';
      emit('selection', null);
      emit('log', {tone:'err', text:'模型载入失败：' + e.message});
      return null;
    }
  }

  function requireSelection() {
    if (!requireOnline()) return false;
    if (state.selectionStatus !== 'ready' || viewer.currentEntry?.assetId !== state.selectedAsset || viewer.currentEntry?.version !== state.selectedVersion) {
      emit('log', {tone:'warn', text:'请等待所选资产版本载入完成'});
      return false;
    }
    return true;
  }

  function setOpEnabled(name, on) {
    if (on) state.enabledOps.add(name); else state.enabledOps.delete(name);
    emit('ops', selectedOps());
  }

  function setOpParams(name, params) {
    state.opValues[name] = { ...(state.opValues[name] || {}), ...(params || {}) };
    emit('ops', selectedOps());
  }

  function selectedOps() {
    return [...state.enabledOps].map((op) => ({ op, params: state.opValues[op] || {} }));
  }

  function applyPreset(id) {
    const preset = (state.presets || []).find((p) => p.id === id);
    if (!preset) return false;
    state.enabledOps = new Set();
    state.opValues = {};
    for (const step of preset.ops) {
      state.enabledOps.add(step.op);
      state.opValues[step.op] = { ...(step.params || {}) };
    }
    emit('preset', preset);
    emit('ops', selectedOps());
    return true;
  }

  // ------------------------------------------------------------ 分析 ----
  async function analyze({ silent = false } = {}) {
    if (!requireOnline()) return null;
    if (!state.selectedAsset) { if (!silent) emit('log', { tone: 'warn', text: '请先选择资产' }); return null; }
    emit('progress', { busy: true, text: '分析中…' });
    try {
      const ticket = selectionTicket;
      const rep = await pipelineApi.source(state.selectedAsset, state.selectedVersion);
      if (ticket !== selectionTicket) return null;
      state.analysis = rep.report || rep;
      emit('analyze', rep);
      return rep;
    } catch (e) {
      emit('log', { tone: 'err', text: '分析失败：' + (e?.message || e) });
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  async function detectTextures({ silent = false } = {}) {
    if (state.status !== 'online' || !state.selectedAsset) return null;
    const asset = state.assets.find((a) => a.id === state.selectedAsset);
    if (!asset || state.selectedVersion !== 0 || !String(asset.format).startsWith('fbx')) { state.textures = null; emit('textures', null); return null; }
    try {
      const ticket = selectionTicket;
      const res = await pipelineApi.textures(state.selectedAsset);
      if (ticket !== selectionTicket) return null;
      state.textures = { textures: res.textures || [], assetId: state.selectedAsset, name: asset.name };
      emit('textures', state.textures);
      return state.textures;
    } catch (e) {
      if (!silent) emit('log', { tone: 'warn', text: '贴图检测失败：' + (e?.message || e) });
      return null;
    }
  }

  async function extractTextures() {
    if (!requireOnline() || !state.selectedAsset) return null;
    emit('progress', { busy: true, text: '提取内嵌贴图…' });
    try {
      const res = await pipelineApi.extractTextures(state.selectedAsset);
      state.lastExtract = res;
      emit('extract', res);
      emit('log', { tone: 'ok', text: `已提取 ${res.count || (res.files || []).length} 张内嵌贴图` });
      return res;
    } catch (e) {
      emit('log', { tone: 'err', text: '提取失败：' + (e?.message || e) });
      return null;
    } finally {
      emit('progress', { busy: false });
      detectTextures({ silent: true });
    }
  }

  // ------------------------------------------------------------ 执行 ----
  async function run({ dryRun = false, ops } = {}) {
    if (!requireSelection()) return null;
    if (!state.selectedAsset) { emit('log', { tone: 'warn', text: '请先选择资产' }); return null; }
    const list = ops || selectedOps();
    if (!list.length) { emit('log', { tone: 'warn', text: '请至少勾选一个算子' }); return null; }
    emit('progress', { busy: true, text: dryRun ? '预览中…' : '执行中…' });
    try {
      const ticket = selectionTicket;
      const res = await pipelineApi.run(state.selectedAsset, list, state.confirmToken, dryRun, state.selectedVersion);
      if (ticket !== selectionTicket) { emit('log', {tone:'ok', text:'后台处理已完成：' + res.assetId}); return res; }
      state.confirmToken = null;
      if (res.dryRun) {
        emit('dryrun', res);
        emit('log', { tone: 'ok', text: '预览：' + (res.wouldApply || []).map((w) => w.op).join(', ') });
      } else {
        state.lastRun = res;
        state.history.push({ at: Date.now(), kind: 'run', assetId: res.assetId, version: res.version, ops: list.map((o) => o.op) });
        emit('run', res);
        emit('history', state.history);
        emit('log', {
          tone: res.verify?.pass ? 'ok' : 'err',
          text: `完成 v${res.version} · 后验 ${res.verify?.pass ? '通过' : '失败'}`,
        });
        if (res.verify?.pass) {
          await selectAsset(res.assetId, res.version, {keepRun:true});
          await showCompare(res);
        }
      }
      return res;
    } catch (e) {
      if (e?.status === 409 && e?.data?.needConfirm) {
        state.confirmToken = e.data.token;
        emit('confirm', { reasons: e.data.reasons || [], riskyOps: e.data.riskyOps || [] });
        emit('log', { tone: 'warn', text: `需确认${(e.data.reasons || []).length ? '：' + (e.data.reasons || []).slice(0, 2).join('；') : ''} —— 请再次点击「执行」` });
      } else {
        emit('log', { tone: 'err', text: '处理失败：' + (e?.message || e) });
      }
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  async function runBatch(assetIds, ops) {
    if (!requireOnline()) return null;
    const ids = (assetIds || []).filter(Boolean);
    if (!ids.length) { emit('log', { tone: 'warn', text: '请先在资源树勾选要批处理的资产' }); return null; }
    const list = ops || selectedOps();
    if (!list.length) { emit('log', { tone: 'warn', text: '请至少勾选一个算子' }); return null; }
    emit('progress', { busy: true, text: `批处理 ${ids.length} 个资产…` });
    try {
      const res = await pipelineApi.batch(ids, list, state.confirmToken);
      state.confirmToken = null;
      state.lastBatch = res;
      state.history.push({ at: Date.now(), kind: 'batch', count: ids.length, ok: res.ok, failed: res.failed });
      emit('batch', res);
      emit('history', state.history);
      emit('log', { tone: res.failed === 0 ? 'ok' : 'warn', text: `批处理完成：成功 ${res.ok} / 失败 ${res.failed}` });
      await refreshAssets();
      return res;
    } catch (e) {
      if (e?.status === 409 && e?.data?.needConfirm) {
        state.confirmToken = e.data.token;
        emit('confirm', { reasons: e.data.reasons || [], riskyOps: e.data.riskyOps || [] });
        emit('log', { tone: 'warn', text: '批处理需确认——请再次点击「批量处理」' });
      } else {
        emit('log', { tone: 'err', text: '批处理失败：' + (e?.message || e) });
      }
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  async function refreshAssets() {
    try {
      const res = await pipelineApi.assets();
      state.assets = res.assets || [];
      emit('assets', state.assets);
      return state.assets;
    } catch { return state.assets; }
  }

  // -------------------------------------------------------- Agent ----
  async function runAgent({ goal, dryRun = true } = {}) {
    if (!requireOnline()) return null;
    if (!state.selectedAsset) { emit('log', { tone: 'warn', text: '请先选择资产' }); return null; }
    emit('progress', { busy: true, text: 'AI Agent 运行中…' });
    try {
      const res = await pipelineApi.agentRun({
        assetId: state.selectedAsset,
        goal: goal || '分析该资产的结构、材质与贴图问题，给出具体的处理建议（不要实际执行算子）',
        dryRun,
      });
      state.lastAgent = res;
      state.history.push({ at: Date.now(), kind: 'agent', runId: res.runId, model: res.log?.model, rounds: res.log?.rounds?.length });
      try { appState?.addRecentRun?.(res.runId); } catch { /* 可选 */ }
      emit('agent', res);
      emit('history', state.history);
      emit('log', { tone: res.log?.errors?.length ? 'err' : 'ok', text: res.log?.errors?.length ? 'AI 分析未完成：' + res.log.errors.join('；') : `AI 分析完成 · ${res.log?.model || 'LLM'} · ${res.log?.rounds?.length || 0} 轮` });
      return res;
    } catch (e) {
      emit('log', { tone: 'err', text: 'AI 分析失败：' + (e?.message || e) });
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  // AI 建议 → 算子草稿：把 Agent 日志里真实调用过的算子转成待确认的勾选状态。
  // 只取后端工具确实执行过的算子名，并与 ops 注册表求交，绝不凭空生成。
  function adoptAgentSuggestion() {
    const log = state.lastAgent?.log;
    if (!log) return null;
    const known = new Set(state.ops.map((o) => o.name));
    const seen = new Set();
    for (const round of log.rounds || []) {
      for (const call of round.toolCalls || []) {
        if (call.name !== 'run_op' && call.name !== 'propose_ops') continue;
        let args = call.parsed ?? call.arguments;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = null; } }
        const ops = Array.isArray(args?.ops) ? args.ops : (args?.op ? [args] : []);
        for (const o of ops) if (o?.op && known.has(o.op)) { seen.add(o.op); if (o.params) setOpParams(o.op, o.params); }
      }
    }
    for (const name of seen) state.enabledOps.add(name);
    emit('ops', selectedOps());
    emit('log', { tone: seen.size ? 'ok' : 'warn', text: seen.size ? `已采纳 AI 建议的 ${seen.size} 个算子（请复核参数后执行）` : '本次 AI 日志里没有可采纳的算子调用' });
    return [...seen];
  }

  // --------------------------------------------------- Before/After ----
  async function showCompare(run) {
    const target = run || state.lastRun;
    if (!target || !target.beforePath || !target.afterPath) {
      emit('log', { tone: 'warn', text: '本次运行没有可对比的产物路径' });
      return null;
    }
    emit('progress', { busy: true, text: '载入 Before / After 模型…' });
    try {
      await exitCompare();
      const ticket = compareTicket;
      const selected = selectionTicket;
      const [rootA, rootB] = await Promise.all([
        loadModelFromUrl(fileUrl(target.beforePath), String(target.beforePath).split('/').pop()),
        loadModelFromUrl(fileUrl(target.afterPath), String(target.afterPath).split('/').pop()),
      ]);
      if (ticket !== compareTicket || selected !== selectionTicket) { viewer._disposeLoaded({root:rootA}); viewer._disposeLoaded({root:rootB}); return null; }
      const rig = new CompareRig(viewer);
      rig.load(rootA, rootB);
      rig.setSplit(state.compareSplit);
      state.rig = rig;
      emit('compare', { run: target, stats: compareStats(target) });
      emit('log', { tone: 'ok', text: '已载入前后模型，拖动滑块对比' });
      return rig;
    } catch (e) {
      emit('log', { tone: 'err', text: '对比载入失败：' + (e?.message || e) });
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  async function compareVersions(beforeVersion, afterVersion) {
    if (!requireSelection()) return null;
    const ticket=selectionTicket, id=state.selectedAsset;
    const [before,after]=await Promise.all([pipelineApi.source(id,beforeVersion),pipelineApi.source(id,afterVersion)]);
    if(ticket!==selectionTicket)return null;
    const stats=s=>({...s.report.stats,bytes:s.report.file.bytes});
    return showCompare({assetId:id,baseVersion:beforeVersion,version:afterVersion,beforePath:before.path,afterPath:after.path,before:stats(before),after:stats(after)});
  }

  function compareStats(run) {
    const b = run?.before || {}; const a = run?.after || {};
    return [
      { label: '顶点', before: b.verts, after: a.verts, delta: fmtDelta(b.verts, a.verts) },
      { label: '三角面', before: b.tris, after: a.tris, delta: fmtDelta(b.tris, a.tris) },
      { label: '文件体积', before: b.bytes, after: a.bytes, delta: fmtDelta(b.bytes, a.bytes, fmtBytes) },
    ];
  }

  function setCompareSplit(v) {
    const value = Number(v);
    state.compareSplit = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
    try { state.rig?.setSplit(state.compareSplit); } catch { /* rig 未就绪 */ }
  }

  async function exitCompare() {
    ++compareTicket;
    if (state.rig) {
      try { state.rig.dispose(); } catch { /* ignore */ }
      state.rig = null;
      emit('compare', null);
    }
  }

  // ------------------------------------------------------- 导入/发布 ----
  async function importFile(file, dependencies = []) {
    if (!requireOnline()) return null;
    emit('progress', { busy: true, text: `导入 ${file.name}…` });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
      const resources = await Promise.all(dependencies.map(async f => {
        const bytes = new Uint8Array(await f.arrayBuffer()); let text = '';
        for (let i=0;i<bytes.length;i+=CHUNK) text += String.fromCharCode.apply(null, bytes.subarray(i,i+CHUNK));
        return {name:f.webkitRelativePath || f.name, dataBase64:btoa(text)};
      }));
      const res = await pipelineApi.importAsset(file.webkitRelativePath || file.name, btoa(bin), resources);
      await refreshAssets();
      emit('imported', res);
      emit('log', { tone: 'ok', text: `已导入到工作区：${file.name}` });
      if (res?.asset?.id || res?.id) await selectAsset(res?.asset?.id || res?.id);
      return res;
    } catch (e) {
      emit('log', { tone: 'err', text: '导入失败：' + (e?.message || e) });
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  async function importFiles(files) {
    const models = files.filter(f => /\.(glb|gltf|obj|fbx)$/i.test(f.name));
    if (!models.length) { emit('log',{tone:'warn',text:'请选择模型及它的依赖文件'}); return []; }
    const results = [];
    for (const file of models) results.push(await importFile(file, files.filter(f => f !== file && !models.includes(f))));
    return results;
  }

  async function saveMaterial(mat) {
    if (!requireSelection() || !Number.isInteger(mat?.userData?.gltfMaterialIndex)) { emit('log',{tone:'warn',text:'请先选择 GLB/GLTF 版本的材质'});return null; }
    await exitCompare();
    return run({ops:[{op:'setMaterial',params:{materialIndex:mat.userData.gltfMaterialIndex,metallicFactor:mat.metalness,roughnessFactor:mat.roughness,colorR:mat.color.r,colorG:mat.color.g,colorB:mat.color.b,opacity:mat.opacity,emissiveStrength:mat.emissiveIntensity ?? 1,alphaMode:mat.transparent?'BLEND':mat.alphaTest>0?'MASK':'OPAQUE',doubleSided:mat.side===2}}]});
  }

  async function publish(version) {
    if (!requireSelection()) return null;
    if (!requireOnline() || !state.selectedAsset) { emit('log', { tone: 'warn', text: '请先连接并选择资产' }); return null; }
    try {
      const res = await pipelineApi.publish(state.selectedAsset, version ?? state.selectedVersion);
      onPublish?.(res.url, state.selectedAsset, res);
      emit('publish', res);
      emit('log', { tone: 'ok', text: '已发布到展厅资产库' });
      return res;
    } catch (e) {
      emit('log', { tone: 'err', text: '发布失败：' + (e?.message || e) });
      return null;
    }
  }

  // 导出 = 对当前资产跑真实的 convert 算子（后端真实产出文件）
  async function exportAs(to, version) {
    if (!requireSelection()) return null;
    if (!requireOnline() || !state.selectedAsset) { emit('log', { tone: 'warn', text: '请先连接并选择资产' }); return null; }
    emit('progress', { busy: true, text: `导出为 .${to}…` });
    try {
      const res = await pipelineApi.run(state.selectedAsset, [{ op: 'convert', params: { to } }], state.confirmToken, false, version ?? state.selectedVersion);
      state.confirmToken = null;
      state.lastExport = res;
      emit('export', { to, file: res.afterPath, url: fileUrl(res.afterPath), run: res });
      emit('log', { tone: 'ok', text: `已导出 .${to}：v${res.version}` });
      return res;
    } catch (e) {
      if (e?.status === 409 && e?.data?.needConfirm) {
        state.confirmToken = e.data.token;
        emit('confirm', { reasons: e.data.reasons || [] });
        emit('log', { tone: 'warn', text: '导出需确认——请再次点击导出' });
      } else {
        emit('log', { tone: 'err', text: '导出失败：' + (e?.message || e) });
      }
      return null;
    } finally {
      emit('progress', { busy: false });
    }
  }

  async function listVersions() {
    if (state.status !== 'online') return [];
    try {
      const lib = await pipelineApi.library();
      return lib.entries || [];
    } catch { return []; }
  }

  // 将会话之外的文件 URI 转后端可服务 URL
  const toFileUrl = fileUrl;

  return {
    state,
    connect, probe, refreshAssets,
    selectAsset, setOpEnabled, setOpParams, selectedOps, applyPreset,
    analyze, detectTextures, extractTextures,
    run, runBatch, runAgent, adoptAgentSuggestion,
    showCompare, compareVersions, exitCompare, setCompareSplit, compareStats,
    importFile, importFiles, saveMaterial, publish, exportAs, listVersions, toFileUrl,
  };
}
