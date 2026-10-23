// FORMA V5 — Studio 顶部主工具条
// 导入 / 分析 / AI 优化 / 批处理 / 对比 / 导出 + 后端连接状态（含引导与重试）。
import { el } from '../utils/dom.js';

export function createStudioToolbar({ core, toast, compareUI, getBatchIds, onResetLayout }) {
  const node = el('header', { class: 'st-toolbar', id: 'studioToolbar' });

  const fileInput = el('input', {
    type: 'file', multiple: true, id: 'studioFileInput', class: 'st-hidden-input',
    accept: '.glb,.gltf,.bin,.obj,.mtl,.fbx,.png,.jpg,.jpeg,.webp',
  });

  const crumb = el('div', { class: 'st-crumb' },
    el('span', { class: 'st-crumb-app' }, 'AI STUDIO'),
    el('span', { class: 'st-crumb-sep' }, '/'),
    el('span', { class: 'st-crumb-item', id: 'stAssetName' }, '未选择资产'),
  );

  const STATUS_TEXT = { unknown: '后端未检测', connecting: '连接中…', online: '后端已连接', offline: '后端未运行' };

  const statusDot = el('span', { class: 'st-dot' });
  const statusText = el('span', { class: 'st-status-text', id: 'stConnText' }, STATUS_TEXT.unknown);
  const statusPill = el('button', { class: 'st-status', type: 'button', id: 'stConnBtn', title: '点击重新检测后端并显示启动指引' },
    statusDot, statusText, el('span', { class: 'st-status-retry', id: 'stConnRetry' }, '重试'),
  );

  const act = (id, label, title, onClick, cls = 'st-btn-ghost') => {
    const b = el('button', { class: 'st-btn ' + cls, type: 'button', id, title, disabled: false }, label);
    b.addEventListener('click', onClick);
    return b;
  };

  const importBtn = act('stImportBtn', '导入', '把模型送入后端工作区并开始分析', () => fileInput.click(), 'st-btn-primary');
  const analyzeBtn = act('stAnalyzeBtn2', '分析', '调用后端重新生成真实资产报告', () => core.analyze());
  const aiBtn = act('stAiBtn', 'AI 分析', '运行真实 LLM Agent：分析资产并给出处理建议', () => { core.runAgent(); });
  const batchBtnTop = act('stBatchBtnTop', '批处理', '对资源树勾选的资产批量执行当前算子', () => {
    const ids = getBatchIds?.() || [];
    if (!ids.length) { toast?.('先在左侧资源树勾选要批处理的资产', 'warn'); return; }
    core.runBatch(ids);
  });
  const compareBtn = act('stCompareBtn', '对比', '载入处理前后两个真实模型做滑条对比', () => core.showCompare());
  const exitCompareBtn = act('stExitCompareBtn', '退出对比', '退出 Before/After 对比并释放 GPU 资源', () => core.exitCompare());
  const prepareBtn = act('stPrepareGLB', '转为 GLB 版本', '将 FBX/OBJ 生成可处理工作版本；保留原始资源', () => core.prepareGLB());
  const exportBtn = act('stExportBtn', '导出', '导出当前产物为 GLB / GLTF / OBJ', () => core.exportAs('glb'));

  exitCompareBtn.hidden = true;
  compareBtn.hidden = true;

  const groupLeft = el('div', { class: 'st-tb-group' }, importBtn, analyzeBtn);
  const layoutBtn = act('stLayoutReset', '布局', '恢复默认工作区布局（面板宽度与底部任务区高度）', () => onResetLayout?.());
  const groupRight = el('div', { class: 'st-tb-group' }, compareBtn, exitCompareBtn, exportBtn);
  const more=el('details',{class:'st-more',id:'stMore'},el('summary',{},'更多'),
    el('div',{class:'st-more-menu'},prepareBtn,aiBtn,batchBtnTop,layoutBtn));
  document.addEventListener('click',e=>{if(!more.contains(e.target))more.open=false;});
  more.addEventListener('keydown',e=>{if(e.key==='Escape'){more.open=false;more.querySelector('summary').focus();}});
  const saveState=el('span',{class:'st-save-state',id:'stSaveState',role:'status'},'尚未选择资产');
  const saveBtn=act('stSaveTop','保存为新版本','保存当前材质草稿，保留原始版本',()=>document.getElementById('stMatSave')?.click(),'st-btn-primary');
  const identity=el('div',{class:'st-identity'},crumb,saveState,saveBtn);

  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    await core.importFiles(files);
  });

  statusPill.addEventListener('click', () => { core.connect(); });

  const assetsBtn=act('stAssetsToggle','资产','展开或收起资源树',()=>{
    document.getElementById('inspector').classList.remove('open');toolsBtn.setAttribute('aria-expanded','false');
    assetsBtn.setAttribute('aria-expanded',String(document.getElementById('sidebar').classList.toggle('st-mobile-open')));
  });
  const toolsBtn=act('stToolsToggle','属性','展开或收起资产工具',()=>{
    document.getElementById('sidebar').classList.remove('st-mobile-open');assetsBtn.setAttribute('aria-expanded','false');
    toolsBtn.setAttribute('aria-expanded',String(document.getElementById('inspector').classList.toggle('open')));
  });
  for(const [b,id] of [[assetsBtn,'sidebar'],[toolsBtn,'inspector']]){b.setAttribute('aria-controls',id);b.setAttribute('aria-expanded','false');}
  const closeAssets=act('stAssetsClose','关闭资产','收起资源树',()=>{document.getElementById('sidebar').classList.remove('st-mobile-open');assetsBtn.setAttribute('aria-expanded','false');assetsBtn.focus();});
  closeAssets.classList.add('st-mobile-assets');document.getElementById('sidebar').prepend(closeAssets);
  function closePanels(){
    document.getElementById('sidebar').classList.remove('st-mobile-open');document.getElementById('inspector').classList.remove('open');
    assetsBtn.setAttribute('aria-expanded','false');toolsBtn.setAttribute('aria-expanded','false');more.open=false;
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!document.body.classList.contains('mode-studio')||document.querySelector(':modal'))return;
    const target=document.getElementById('sidebar').classList.contains('st-mobile-open')?assetsBtn:document.getElementById('inspector').classList.contains('open')?toolsBtn:null;
    if(target){closePanels();target.focus();}
  });
  assetsBtn.classList.add('st-mobile-assets');toolsBtn.classList.add('st-mobile-tools');
  groupRight.append(assetsBtn,toolsBtn);
  node.append(identity,groupLeft,groupRight,more,statusPill,fileInput);

  function syncSave(){
    const s=core.state,status=s.materialSaveStatus;
    saveState.textContent=status==='saving'?'正在保存…':status==='confirm'?'等待确认':status==='error'?'保存失败 · 草稿已保留':s.materialDirty?'未保存材质':s.selectionStatus==='ready'?'材质与版本一致':s.selectionStatus==='loading'?'正在载入…':'尚未选择资产';
    saveState.dataset.state=status==='error'?'error':s.materialDirty?'dirty':'clean';
    saveBtn.disabled=status==='saving'||!s.materialDirty||s.selectionStatus!=='ready';
    saveBtn.textContent=status==='saving'?'正在保存…':status==='confirm'?'确认保存材质版本':'保存为新版本';
  }

  function setStatus(status, detail) {
    statusPill.className = 'st-status is-' + status;
    statusDot.className = 'st-dot is-' + status;
    statusText.textContent = STATUS_TEXT[status] || status;
    statusPill.title = detail ? String(detail) : '点击重新检测后端并显示启动指引';
  }

  function setAsset(name) {
    const el2 = node.querySelector('#stAssetName');
    if (el2) el2.textContent = name || '未选择资产';
    syncSave();
  }

  function setCompareAvailable(on) {
    compareBtn.hidden = !on;
    exitCompareBtn.hidden = !on;
  }

  setStatus('unknown');
  syncSave();

  return { node, setStatus, setAsset, setCompareAvailable, syncSave, closePanels, fileInput };
}
