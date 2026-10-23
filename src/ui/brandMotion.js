// Optional user-triggered presentation of the byte-identical approved V2 player.
import {el} from '../utils/dom.js';

export function createBrandPresentation(){
  const trigger=el('button',{class:'v5-brand-presentation',type:'button','aria-haspopup':'dialog'},'品牌动态 ↗');
  const host=el('div',{class:'v5-brand-motion-host'});
  const status=el('p',{class:'v5-brand-motion-status',role:'status'});
  const replay=el('button',{class:'v5-btn',type:'button'},'播放一次');
  const pause=el('button',{class:'v5-btn',type:'button',disabled:true},'暂停');
  const close=el('button',{class:'v5-btn',type:'button','aria-label':'关闭品牌动态'},'关闭');
  const dialog=el('dialog',{class:'v5-brand-dialog',id:'brandPresentation',hidden:true,'aria-label':'FORMA · Spatial Construction V2'},
    el('div',{class:'v5-brand-motion-head'},el('span',{},'FORMA · Spatial Construction V2'),close),
    host,el('div',{class:'v5-brand-motion-controls'},replay,pause),status);
  document.body.append(dialog);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let player=null,ticket=0;
  function staticFrame(){
    player?.destroy();player=null;
    host.replaceChildren(el('img',{src:'./assets/brand/lockup-ivory.svg',alt:'FORMA'}));
    host.dataset.playing='false';pause.disabled=true;
    replay.disabled=reduce.matches;
    status.textContent=reduce.matches?'已遵循减少动态效果偏好，显示静态标识。':'点击播放一次；动画不影响模型加载。';
  }
  function closeDialog(){ticket++;player?.destroy();player=null;dialog.close();dialog.hidden=true;staticFrame();}
  async function play(){
    if(reduce.matches||!dialog.open)return;
    const current=++ticket;replay.disabled=true;status.textContent='正在载入品牌动态…';
    try{
      await import('../../assets/brand/motion-v2/geometry.js');
      await import('../../assets/brand/motion-v2/motion.js');
      if(current!==ticket||!dialog.open||reduce.matches)return;
      player?.destroy();
      player=new window.FORMA_MOTION.Player(host,{variant:'spatial',theme:'dark',id:'forma-web-v2',onUpdate:p=>{
        host.dataset.playing=String(p.playing);host.dataset.time=String(p.time);
        pause.disabled=!p.playing;status.textContent=p.playing?'Spatial Construction · 播放中':p.time>=p.duration?'播放完成':'已暂停';
      }});
      player.replay();replay.disabled=false;
    }catch{if(current===ticket){staticFrame();status.textContent='动态暂不可用，已保留静态标识。';}}
  }
  trigger.addEventListener('click',()=>{staticFrame();dialog.hidden=false;dialog.showModal();close.focus();void play();});
  replay.addEventListener('click',play);pause.addEventListener('click',()=>player?.pause());
  close.addEventListener('click',closeDialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  dialog.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const items=[close,replay,pause].filter(n=>!n.disabled),first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeDialog();});
  reduce.addEventListener('change',()=>{ticket++;staticFrame();});
  window.addEventListener('hashchange',()=>{if(dialog.open)closeDialog();});
  staticFrame();
  return trigger;
}
