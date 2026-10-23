import { el } from '../utils/dom.js';

// Real local-workflow captures. No backend probe, mock workspace or automatic media playback.
export function createStudioShowcase() {
  const steps = [
    ['01', '导入与分析', '读取几何、材质与纹理报告，确认当前资产和 Original 版本。', './assets/studio-demo/analysis.webp'],
    ['02', '编辑与保存', '预览材质参数，明确确认后保存新版本；原始文件保持不变。', './assets/studio-demo/material.webp'],
    ['03', '比较与导出', '加载真实的前后版本，对照结果；导出 GLB 或带依赖的 GLTF，再导入验证。', './assets/studio-demo/comparison.webp'],
  ];
  const node = el('article', { class: 'v5-studio-showcase v5-container' },
    el('header', {class:'v5-studio-showcase-head'},
      el('p', {class:'v5-eyebrow'}, 'AI STUDIO · WORKFLOW'),
      el('h1', {class:'v5-h1'}, '从模型，到可交付资产'),
      el('p', {class:'v5-lede'}, '分析、编辑、比较与导出，在同一条可追溯的工作流中完成。'),
      el('p', {class:'v5-studio-edition',role:'note'}, '当前为作品集展示版。以下为本地完整版的真实操作截图；完整编辑与资产处理请在本地工程中使用。'),
      el('div', {class:'v5-studio-showcase-actions'},
        el('button',{class:'v5-btn v5-btn-gold',id:'studioLocalAction',type:'button'},'使用本地完整版 ↓'),
        el('a',{class:'v5-btn v5-btn-ghost',href:'#/gallery'},'浏览实时数字展厅 →'))),
    el('section', {class:'v5-studio-demo','aria-label':'真实资产工作流截图'}, ...steps.map(([n,title,desc,src]) =>
      el('figure',{},
        el('figcaption',{},el('span',{class:'v5-eyebrow'},n),el('h2',{class:'v5-h2'},title),el('p',{},desc)),
        el('a',{href:src,target:'_blank',rel:'noopener','aria-label':`查看${title}原始操作截图`},
          el('img',{src,alt:`FORMA 本地工作区：${title}，Avocado 测试模型`,width:1440,height:1000,loading:'lazy',decoding:'async'}))))),
    el('p',{class:'v5-studio-demo-source'},'实录模型：Microsoft Avocado（CC0）。本示例使用普通材质编辑与实际算子，不代表外部 AI 自动决策。点击图片可查看原图。'),
    el('section',{class:'v5-studio-capabilities','aria-label':'能力与边界'},
      el('div',{},el('h2',{class:'v5-h2'},'已经可以完成'),el('p',{},'GLB / GLTF 导入与分析、支持的 OBJ / FBX 转换、材质草稿与确认保存、独立版本、真实 Before / After、几何与纹理处理、完整资源导出。')),
      el('div',{},el('h2',{class:'v5-h2'},'使用边界'),el('p',{},'复杂 FBX 材质与多 UV 需要单独检查。外部 AI 需要可用的模型服务与授权；普通分析、材质和处理功能可独立运行。'))),
    el('section',{id:'studio-local',class:'v5-studio-local',tabindex:'-1'},
      el('p',{class:'v5-eyebrow'},'LOCAL EDITION'),el('h2',{class:'v5-h2'},'在本地打开完整工作区'),
      el('p',{},'准备 Node.js 22.12 或更高版本，在完整源码目录执行：'),
      el('pre',{},el('code',{},'npm ci\nnpm start')),
      el('p',{},'按终端地址打开页面后进入 AI Studio。静态展示 ZIP 不包含资产处理后端，也不会读取你的私人工作区。'),
      el('a',{class:'v5-btn v5-btn-ghost',href:'https://github.com/a15876577124-alt/FORMA-3D-Viewer-v3/tree/feature/codex-v5-release-closeout',target:'_blank',rel:'noopener'},'查看本版本源码 ↗')));
  // Keep an in-page action within hash routing rather than interpreting it as a new route.
  node.querySelector('#studioLocalAction').addEventListener('click',e=>{
    e.preventDefault();const target=node.querySelector('#studio-local');target.scrollIntoView({block:'start'});target.focus({preventScroll:true});
  });
  return {node};
}
