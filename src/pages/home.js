import { el } from '../utils/dom.js';

export function createHomePage({catalog=[]}={}) {
  const works=catalog.filter(c=>c.group==='figurines');
  const hero=el('section',{class:'ex-hero ex-container'},
    el('div',{class:'ex-hero-copy'},
      el('p',{class:'ex-kicker'},'琼剧数字手办系列'),
      el('h1',{},'琼剧',el('br'),'五相'),
      el('p',{class:'ex-lede'},'五件数字手办，',el('br'),'一场可自由观看的展览。'),
      el('div',{class:'ex-actions'},
        el('a',{class:'ex-button',href:'#/gallery?work=dan'},'进入展厅',el('span',{'aria-hidden':'true'},'↗')),
        el('a',{class:'ex-link',href:'#/?section=collection'},'浏览作品 ↓'))),
    el('a',{class:'ex-hero-image',href:'#/work/dan','aria-label':'查看旦角 · 完整头饰'},
      el('img',{src:'./assets/exhibition/dan.webp',width:1200,height:1200,alt:'旦角手办：蓝色花饰、珠串与红色戏服',fetchpriority:'high'}),
      el('span',{class:'ex-image-caption'},'02 / 05',el('span',{},'旦角 · 完整头饰'))));
  const collection=el('section',{class:'ex-collection ex-container',id:'collection'},
    el('div',{class:'ex-section-head'},el('h2',{},'数字藏品'),el('span',{},'生 · 旦 · 净')),
    el('div',{class:'ex-collection-grid'},...works.map((w,i)=>el('a',{class:'ex-work-card',href:`#/work/${w.id}`},
      el('img',{src:w.poster,width:1200,height:1200,loading:'lazy',alt:w.name+'手办正面渲染'}),
      el('div',{class:'ex-card-label'},el('span',{},String(i+1).padStart(2,'0')),el('h3',{},w.name),el('span',{'aria-hidden':'true'},'↗'))))));
  const studio=el('section',{class:'ex-studio-invite ex-container'},
    el('div',{},el('h2',{},'从观看，到创作。'),el('p',{},'导入自己的模型，在 Studio 中分析、编辑、比较与导出。')),
    el('a',{class:'ex-link',href:'#/studio'},'打开 Studio ↗'));
  return {node:el('div',{class:'ex-home'},hero,collection,studio),enter({query}={}){
    if(query?.section==='collection')requestAnimationFrame(()=>collection.scrollIntoView({block:'start'}));
    if(query?.section==='contact')requestAnimationFrame(()=>{const c=document.getElementById('contactBlock');if(c){c.open=true;c.scrollIntoView({block:'center'});}});
  }};
}
