import puppeteer from 'puppeteer-core';
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b=await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const p=await b.newPage();
await p.setViewport({width:1400,height:900});
await p.goto('http://127.0.0.1:5173/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__FORMA&&window.__FORMA.ready',{timeout:90000});
await p.evaluate(()=>window.__FORMA.ready);
for (const sel of ['.asset[data-id="dan"]','#lightModes button[data-mode="cool"]','#bloomToggle','#modeBtn','#resetCamera']) {
  const r = await p.evaluate((s)=>{
    const el=document.querySelector(s);
    if(!el) return 'missing';
    el.scrollIntoView({block:'center'});
    const b=el.getBoundingClientRect();
    const x=b.x+b.width/2, y=b.y+b.height/2;
    const hit=document.elementFromPoint(x,y);
    const hs = el.hidden, disp = getComputedStyle(el).display;
    return JSON.stringify({sel:s, rect:[b.x,b.y,b.width,b.height].map(v=>Math.round(v)), hit: hit ? hit.tagName+'.'+hit.id+(hit.className?'.'+String(hit.className).split(' ')[0]:'') : 'none', hiddenAttr:hs, display:disp});
  }, sel);
  console.log(r);
}
// modal + fatal hidden attribute check
console.log(await p.evaluate(()=>{
  const out={};
  for (const id of ['helpModal','fatal','shade','dropOverlay']) {
    const el=document.getElementById(id);
    out[id]={hidden:el.hidden, display:getComputedStyle(el).display};
  }
  return JSON.stringify(out);
}));
await b.close();
