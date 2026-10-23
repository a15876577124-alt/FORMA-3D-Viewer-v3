// Real Edge acceptance. The runner supplies a disposable project, never user assets.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {readDocument} from '../backend/gltfIO.mjs';
import {launchBrowser} from './browser-test.mjs';
const ROOT=process.cwd(), OUT=process.env.FORMA_TEST_OUTPUT_DIR;
assert.equal(process.env.FORMA_TEST_ISOLATED_ROOT, ROOT, 'Must run through isolated tests/run.mjs');
const children=[], checks=[], errors=[];
let browser;
function start(script,env){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{cwd:ROOT,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
  let log='';const timer=setTimeout(()=>reject(Error('server start timeout '+log)),15000);
  child.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});
  child.stderr.on('data',b=>{log+=b;});child.once('error',reject);
});}
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
try{
  const be=await start('backend/server.mjs',{FORMA_BACKEND_PORT:'0'});
  const fe=await start('serve.mjs',{PORT:'0',FORMA_BACKEND:be});
  const post=async(url,body)=>{const r=await fetch(be+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};

  const imported=await post('/api/assets/import',{name:'visual-avocado.glb',dataBase64:fs.readFileSync('test-assets/licensed/Avocado.glb').toString('base64')});
  browser=await launchBrowser();const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});await page.goto(fe+'/#/gallery',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORMA?.ready&&window.__FORMA.viewer.modelRoot,{timeout:30000});
  const box=selector=>page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};});
  let rect=await box('#viewport');check('390px Gallery viewport stays in screen',rect.x>=0&&rect.right<=391&&rect.width>300);
  await page.click('#openInspector');await page.waitForFunction(()=>getComputedStyle(document.getElementById('inspector')).transform==='none');rect=await box('#inspector');check('390px Gallery inspector fully accessible',rect.x>=0&&rect.right<=391&&rect.width>=280);
  await page.screenshot({path:path.join(OUT,'gallery-390-panel.png')});await page.click('#closeInspector');await page.waitForFunction(()=>document.getElementById('inspector').getBoundingClientRect().x>=innerWidth);
  await page.screenshot({path:path.join(OUT,'gallery-390.png')});
  await page.goto(fe+'/#/studio',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORMA?.studio.state.status==='online',{timeout:30000});
  await page.click('#stAssetsToggle');rect=await box('#sidebar');check('mobile asset picker opens within screen',rect.x>=0&&rect.right<=391&&rect.width>200);
  await page.click('[data-asset="'+imported.asset.id+'"]');
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready',{timeout:30000});
  check('mobile asset selection closes picker',await page.$eval('#sidebar',e=>!e.classList.contains('st-mobile-open')));
  await page.click('#stToolsToggle');await page.waitForFunction(()=>getComputedStyle(document.getElementById('inspector')).transform==='none');rect=await box('#studioRail');check('mobile material and asset tools accessible',rect.width>200&&rect.x>=0&&rect.right<=391);
  await page.screenshot({path:path.join(OUT,'studio-390-tools.png')});await page.click('#closeInspector');await page.waitForFunction(()=>document.getElementById('inspector').getBoundingClientRect().x>=innerWidth);
  check('mobile action labels do not wrap',await page.$$eval('#studioToolbar .st-btn',es=>es.filter(e=>e.getClientRects().length).every(e=>getComputedStyle(e).whiteSpace==='nowrap'&&e.scrollWidth<=e.clientWidth+2)));
  await page.screenshot({path:path.join(OUT,'studio-390.png')});
  await page.setViewport({width:1600,height:1000});
  await page.click('.asset[data-id="dan"]');
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready'&&window.__FORMA.studio.state.selection?.name==='dan.glb');
  check('catalogue selection uses unified backend identity',await page.evaluate(()=>{const s=window.__FORMA.studio.state,v=window.__FORMA.viewer;return s.selectionStatus==='ready'&&s.selection.name==='dan.glb'&&s.selection.assetId===v.currentEntry.assetId&&s.analysis.stats.tris===v.stats.tris;}));
  await page.evaluate(id=>window.__FORMA.studio.core.selectAsset(id),imported.asset.id);
  await page.evaluate(()=>window.__FORMA.viewer.controls.autoRotate=false);
  const result=await page.evaluate(async()=>{const c=window.__FORMA.studio.core,ops=[{op:'simplify',params:{ratio:0.7,error:0.01}}];let r=await c.run({ops});if(!r&&c.state.confirmToken)r=await c.run({ops});return r;});
  check('comparison uses verified actual optimized model',result.verify.pass&&result.after.tris<result.before.tris);
  await page.evaluate(()=>{const v=window.__FORMA.viewer;v.controls.autoRotate=false;v.camera.position.set(2.5,1.5,3.5);v.controls.target.set(0,0.8,0);v.controls.update();});
  for(const [name,split] of [['before',1],['after',0]]){
    const url=await page.evaluate(split=>{const c=window.__FORMA.studio.core; c.state.rig.setSplit(split);return window.__FORMA.viewer.capturePNG();},split);
    fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(url.split(',')[1],'base64'));
  }
  const plane=await page.evaluate(async()=>{const THREE=await import('/vendor/three/build/three.module.js');const v=window.__FORMA.viewer,r=window.__FORMA.studio.rig;r.setSplit(0.37);v.render();return [-0.7,0,0.8].map(y=>r.planeA.distanceToPoint(new THREE.Vector3(2*.37-1,y,0.1).unproject(v.camera)));});
  check('comparison boundary follows screen after orbit',plane.every(d=>Math.abs(d)<1e-6));
  await page.waitForFunction(()=>!document.querySelector('.toast'));
  await page.screenshot({path:path.join(OUT,'studio-1600-comparison.png')});
  await page.evaluate(()=>window.__FORMA.studio.core.exitCompare());
  const memory=await page.evaluate(()=>window.__FORMA.viewer.info.memory);
  for(let i=0;i<5;i++)await page.evaluate(async()=>{const c=window.__FORMA.studio.core;await c.showCompare();window.__FORMA.viewer.render();await c.exitCompare();window.__FORMA.viewer.render();});
  const after=await page.evaluate(()=>window.__FORMA.viewer.info.memory);
  check('comparison cycles release geometry and textures',after.geometries<=memory.geometries+2&&after.textures<=memory.textures+2);
  const scaled=await page.evaluate(async()=>{const T=await import('/vendor/three/build/three.module.js'),{CompareRig}=await import('/src/core/compare.js');const a=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),b=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshStandardMaterial());const r=new CompareRig(window.__FORMA.viewer).load(a,b);const aa=new T.Box3().setFromObject(r.groupA).getSize(new T.Vector3()),bb=new T.Box3().setFromObject(r.groupB).getSize(new T.Vector3());r.dispose();return bb.x/aa.x;});
  check('comparison preserves actual dimension changes',Math.abs(scaled-2)<1e-6);
  await page.setViewport({width:1024,height:768});rect=await box('#viewport');check('1024px Studio keeps usable viewport',rect.width>=299&&rect.height>=239);
  check('no browser exceptions',errors.length===0);
  const gpu=await page.evaluate(()=>{const gl=window.__FORMA.viewer.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,errors,gpu,memoryBefore:memory,memoryAfter:after,operation:result},null,2));
}finally{await browser?.close();for(const c of children)c.kill();}
