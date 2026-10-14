import puppeteer from 'puppeteer-core';
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b=await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const p=await b.newPage();
await p.setViewport({width:1400,height:900});
await p.goto('http://127.0.0.1:5173/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__FORMA&&window.__FORMA.ready',{timeout:90000});
await p.evaluate(()=>window.__FORMA.ready);
console.log(await p.evaluate(()=>{
  const el=document.getElementById('bloomToggle');
  el.scrollIntoView({block:'center'});
  const r=el.getBoundingClientRect();
  const x=r.x+r.width/2,y=r.y+r.height/2;
  const hit=document.elementFromPoint(x,y);
  return JSON.stringify({rect:[r.x,r.y,r.width,r.height].map(Math.round),hit:hit?hit.tagName+'#'+hit.id+'.'+hit.className:'none', ap:getComputedStyle(el).appearance, pe:getComputedStyle(el).pointerEvents, visible:r.width>0});
}));
await b.close();
