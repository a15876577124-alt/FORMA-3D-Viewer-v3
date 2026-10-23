import { $, $$, el } from '../utils/dom.js';
import { FIGURINES } from '../models/catalog.js';

export function buildGalleryMode({viewer,capture,resetView,toggle,setImmersive}) {
  const viewport=$('viewport'),workspace=$('workspace');
  const caption=el('section',{class:'ex-gallery-caption',id:'glCard'},
    el('p',{class:'ex-kicker',id:'glIndex'},'01 / 05'),el('h1',{id:'glTitle'},'数字展厅'),
    el('a',{class:'ex-link',id:'glDetails',href:'#/work/sheng'},'作品详情 ↗'));
  const settings=el('button',{class:'ex-gallery-settings',type:'button',id:'glAdvanced','aria-expanded':'false','aria-controls':'glDrawer'},'观看设置');
  const resources=el('button',{class:'ex-gallery-resources',type:'button',id:'glResources','aria-expanded':'false','aria-controls':'sidebar'},'更多资源');
  const rotate=el('button',{type:'button',id:'glRotate','aria-pressed':'false'},'旋转');
  const actions=el('div',{class:'ex-gallery-actions'},rotate,
    el('button',{type:'button',id:'glReset',onclick:()=>resetView?.()},'重置视角'),
    el('button',{type:'button',id:'glShot',onclick:()=>capture?.()},'保存图片'));
  rotate.addEventListener('click',()=>{toggle?.('autoRotate');rotate.setAttribute('aria-pressed',String(viewer.controls.autoRotate));});
  const prev=el('a',{class:'ex-gallery-arrow ex-gallery-prev','aria-label':'上一件作品'},'←');
  const next=el('a',{class:'ex-gallery-arrow ex-gallery-next','aria-label':'下一件作品'},'→');
  const strip=el('nav',{class:'ex-filmstrip','aria-label':'选择展品'},...FIGURINES.map((w,i)=>el('a',{href:`#/gallery?work=${w.id}`,'data-work':w.id},
    el('img',{src:w.thumb,width:320,height:320,alt:''}),
    el('span',{},el('small',{},String(i+1).padStart(2,'0')),w.name))));
  viewport.append(caption,settings,resources,actions,prev,next);workspace.append(strip);
  const drawerBody=el('div',{class:'gl-drawer-body'});
  // Reuse all existing working controls. No duplicate state or material editor.
  for(const section of $$('.inspector-body > details.sect'))drawerBody.append(section);
  const drawer=el('aside',{class:'gl-drawer',id:'glDrawer',hidden:true,'aria-label':'观看设置'},
    el('div',{class:'gl-drawer-head'},el('h2',{},'观看设置'),el('button',{class:'icon-btn',type:'button',id:'glDrawerClose','aria-label':'关闭观看设置'},'×')),
    drawerBody,
    el('div',{class:'gl-extra-actions'},
      el('button',{type:'button',id:'glImmersive',class:'gl-btn',onclick:()=>{closeSettings();setImmersive?.(true);}},'沉浸观看'),
      el('button',{type:'button',id:'glHelp',class:'gl-btn',onclick:()=>{closeSettings();$('helpBtn').click();}},'操作帮助')),
    el('p',{class:'gl-drawer-note'},'这些是观看参数。保存模型材质请前往 Studio。'));
  document.body.append(drawer);
  function closeSettings(focus=false){drawer.hidden=true;settings.setAttribute('aria-expanded','false');if(focus)settings.focus();}
  function closeResources(){document.body.classList.remove('ex-resources-open');resources.setAttribute('aria-expanded','false');}
  settings.addEventListener('click',()=>{closeResources();drawer.hidden=!drawer.hidden;settings.setAttribute('aria-expanded',String(!drawer.hidden));if(!drawer.hidden)$('glDrawerClose').focus();});
  $('glDrawerClose').addEventListener('click',()=>closeSettings(true));
  const close=el('button',{class:'ex-resources-close',type:'button','aria-label':'关闭资源目录'},'关闭 ×');
  $('sidebar').prepend(close);close.addEventListener('click',()=>{closeResources();resources.focus();});
  resources.addEventListener('click',()=>{closeSettings();const open=document.body.classList.toggle('ex-resources-open');resources.setAttribute('aria-expanded',String(open));if(open)close.focus();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!drawer.hidden)closeSettings(true);if(document.body.classList.contains('ex-resources-open')){closeResources();resources.focus();}}});
  function syncInfo(entry){
    if(!entry)return;
    const i=FIGURINES.findIndex(w=>w.id===entry.id);
    $('glTitle').textContent=entry.name;
    $('glIndex').textContent=i>=0?`${String(i+1).padStart(2,'0')} / 05`:'我的资源';
    $('glDetails').hidden=i<0;$('glDetails').href=`#/work/${entry.id}`;
    prev.hidden=next.hidden=i<0;
    prev.href=`#/gallery?work=${FIGURINES[(i+4)%5].id}`;next.href=`#/gallery?work=${FIGURINES[(i+1)%5].id}`;
    for(const a of strip.children){if(a.dataset.work===entry.id)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');}
    rotate.setAttribute('aria-pressed',String(viewer.controls.autoRotate));
    closeResources();
  }
  return {
    enter(){viewer.presentation='gallery';document.body.classList.add('mode-gallery');document.body.classList.remove('mode-studio');},
    leave(){++viewer.ticket;viewer.presentation=null;document.body.classList.remove('mode-gallery');closeSettings();closeResources();},
    syncInfo,drawer,
  };
}
