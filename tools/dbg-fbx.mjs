import puppeteer from 'puppeteer-core';
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b=await puppeteer.launch({executablePath:EDGE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const p=await b.newPage();
await p.setViewport({width:1400,height:900});
p.on('console',m=>console.log('[c:'+m.type()+']',m.text().slice(0,300)));
p.on('pageerror',e=>console.log('[pageerror]',String(e.message).slice(0,300)));
await p.goto('http://127.0.0.1:5173/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__FORMA&&window.__FORMA.ready',{timeout:90000});
await p.evaluate(()=>window.__FORMA.ready);
const res = await p.evaluate(async()=>{
  const txt = await (await fetch('/test-assets/ascii-cube.fbx')).text();
  const f = new File([txt],'ascii-cube.fbx',{type:'application/octet-stream'});
  await window.__FORMA.actions.importFiles([f]);
  return {cur:window.__FORMA.current&&window.__FORMA.current.id, fmt:window.__FORMA.info.format, tris:window.__FORMA.info.modelTris, drawn:window.__FORMA.info.renderTriangles, anims:window.__FORMA.info.animations};
});
console.log(JSON.stringify(res,null,1));
console.log('toast:', await p.evaluate(()=>document.getElementById('toastWrap').innerText));
await b.close();
