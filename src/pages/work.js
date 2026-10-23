import { el } from '../utils/dom.js';

// Descriptions identify visible features; no unsupported claims about traditional rules.
const NOTES={
  sheng:'红色衣袍、乌纱与金色装饰。转动模型，观察正面纹样、袖口和衣袍下缘的蓝白波纹。',
  dan:'蓝色花饰、珠串与红色戏服层层相叠。进入展厅，可以近看头饰、面部与两侧流苏。',
  'jing-red':'红色脸谱与蓝白色戏服形成鲜明对比。面部纹样、髯口与冠饰在不同角度下逐一展开。',
  'jing-yellow':'黄色脸谱、蓝色冠饰与长髯。细看额面纹样以及衣袍下缘的波浪图案。',
  'jing-white':'白色脸谱与黑色线条相衬。冠饰、髯口与服饰共同构成这件手办的轮廓。',
};
export function createWorkPage({params,catalog=[]}={}){
  const works=catalog.filter(c=>c.group==='figurines'), index=works.findIndex(c=>c.id===params?.id), entry=works[index];
  if(!entry)return {node:el('div',{class:'ex-container ex-not-found'},el('h1',{},'未找到这件作品'),el('a',{class:'ex-link',href:'#/'},'返回作品目录'))};
  const prev=works[(index+works.length-1)%works.length],next=works[(index+1)%works.length];
  const stats=el('details',{class:'ex-work-stats',id:'v5Tech-'+entry.id},el('summary',{},'模型资料'),
    el('dl',{},...[
      ['格式','glTF 2.0 / GLB'],['顶点',entry.verts.toLocaleString('en-US')],['三角形',entry.tris.toLocaleString('en-US')],
      ['展示版本','Exhibition v1 · 法线修复'],['来源',entry.source],
    ].map(([label,value])=>el('div',{},el('dt',{},label),el('dd',{},value)))),
    el('p',{},'保留原始造型、UV、贴图与材质。几何数据由资源文件核验；可在 Studio 中进一步分析。'));
  return {node:el('article',{class:'ex-work ex-container'},
    el('div',{class:'ex-work-nav'},el('a',{href:'#/?section=collection'},'← 全部作品'),el('span',{},String(index+1).padStart(2,'0')+' / 05')),
    el('div',{class:'ex-work-layout'},
      el('a',{class:'ex-work-image',href:`#/gallery?work=${entry.id}`,'aria-label':'进入展厅查看 '+entry.name},el('img',{src:entry.poster,width:1200,height:1200,alt:entry.name+'手办正面渲染'})),
      el('div',{class:'ex-work-copy'},el('p',{class:'ex-kicker'},entry.sub),el('h1',{},entry.name),el('p',{class:'ex-work-description'},NOTES[entry.id]),
        el('a',{class:'ex-button',href:`#/gallery?work=${entry.id}`},'在展厅中细看',el('span',{'aria-hidden':'true'},'↗')),stats)),
    el('nav',{class:'ex-work-paging','aria-label':'相邻作品'},el('a',{href:`#/work/${prev.id}`},'← '+prev.name),el('a',{href:`#/work/${next.id}`},next.name+' →')))};
}
