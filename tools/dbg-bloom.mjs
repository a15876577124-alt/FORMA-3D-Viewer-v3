import puppeteer from 'puppeteer-core';
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b=await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const p=await b.newPage();
await p.setViewport({width:1400,height:900});
await p.goto('http://127.0.0.1:5173/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__FORMA&&window.__FORMA.ready',{timeout:90000});
await p.evaluate(()=>window.__FORMA.ready);
console.log(await p.evaluate(()=>{
  const v=window.__FORMA.viewer;
  return JSON.stringify({lowPower:window.__FORMA.caps.lowPower, software:window.__FORMA.caps.software, canFloat:v.post.canFloat, rtType:v.post.rtType, active:v.post.active, bloomEnabled:v.post.bloomEnabled});
}));
await p.click('#bloomToggle');
await new Promise(r=>setTimeout(r,300));
console.log(await p.evaluate(()=>{
  const v=window.__FORMA.viewer;
  const cb=document.getElementById('bloomToggle');
  return JSON.stringify({checked:cb.checked, active:v.post.active, bloomEnabled:v.post.bloomEnabled, info:window.__FORMA.info.postActive});
}));
await b.close();
