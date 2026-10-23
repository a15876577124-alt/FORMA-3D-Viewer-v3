// Read-only gallery measurements plus a padded licensed fixture upload in the isolated snapshot.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {launchBrowser} from './browser-test.mjs';import {parseGLB} from './glbkit.mjs';import {buildGLB} from '../backend/ops/glbWrite.mjs';
import {analyzeBuffer} from '../backend/analyze.mjs';
const ROOT=process.cwd(),OUT=process.env.FORMA_TEST_OUTPUT_DIR;assert.equal(ROOT,process.env.FORMA_TEST_ISOLATED_ROOT);fs.mkdirSync(OUT,{recursive:true});
const children=[],report={label:process.env.FORMA_PERF_LABEL||'after',node:process.version,measurements:{},errors:[]};let browser;
async function start(script,env){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--import','./tools/perf-probe.mjs',script],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});children.push(p);let log='';const timer=setTimeout(()=>reject(Error('startup timeout')),15000);p.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve({p,url:m[0]});}});p.once('error',reject);});}
async function memory(p){return new Promise(r=>{p.once('message',r);p.send('forma-perf');});}
try{
 const be=await start('backend/server.mjs',{FORMA_BACKEND_PORT:'0'}),fe=await start('serve.mjs',{PORT:'0',FORMA_BACKEND:be.url});
 browser=await launchBrowser();const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.setViewport({width:1440,height:1000});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.evaluateOnNewDocument(()=>{window.heroDraws=0;for(const type of [WebGLRenderingContext,WebGL2RenderingContext])for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const fn=type.prototype[method];if(!fn)continue;type.prototype[method]=function(...args){if(this.canvas.classList.contains('v5-hero-canvas'))window.heroDraws++;return fn.apply(this,args);};}});
 const startTime=Date.now();await page.goto(fe.url+'/#/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelector('.v5-hero-3d')?.dataset.modelState==='ready',{timeout:30000});report.measurements.homeReadyMs=Date.now()-startTime;
 await page.screenshot({path:path.join(OUT,'home.png')});
 report.measurements.reducedMotionHero=await page.evaluate(async()=>{const from=heroDraws,begin=performance.now();for(let i=0;i<120;i++)await new Promise(requestAnimationFrame);return {draws:heroDraws-from,elapsedMs:performance.now()-begin};});
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:r.transferSize,duration:r.duration})));
 report.resources=resources;report.measurements.downloadBytes=resources.reduce((s,r)=>s+r.bytes,0);report.measurements.requestCount=resources.length;
 for(const id of ['sheng','dan','jing-red','jing-yellow','jing-white']){
  await page.goto(fe.url+'/#/gallery?work='+id,{waitUntil:'networkidle0'});await page.waitForFunction(id=>window.__FORMA.viewer.currentEntry?.id===id&&window.__FORMA.info.modelTris>0,{},id);
  await page.evaluate(()=>{const v=window.__FORMA.viewer;v.controls.autoRotate=false;v.setViewPreset(22,8);});
  await page.screenshot({path:path.join(OUT,'gallery-'+id+'.png')});
  if(id==='sheng')report.measurements.galleryFrames=await page.evaluate(async()=>{const times=[];let prev=performance.now();for(let i=0;i<150;i++){const t=await new Promise(requestAnimationFrame);if(i>29)times.push(t-prev);prev=t;}times.sort((a,b)=>a-b);return {medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],memory:window.__FORMA.viewer.info.memory};});
  await page.evaluate(async()=>{const T=await import('/vendor/three/build/three.module.js'),v=window.__FORMA.viewer,b=new T.Box3().setFromObject(v.modelRoot),h=b.max.y-b.min.y,target=b.getCenter(new T.Vector3());target.y=b.max.y-h*.22;const direction=v.camera.position.clone().sub(v.controls.target).normalize();v.controls.target.copy(target);v.camera.position.copy(target).addScaledVector(direction,h*.9);v.controls.update();v.render();});
  await page.screenshot({path:path.join(OUT,'detail-'+id+'.png')});
 }
 report.measurements.hiddenHero=await page.evaluate(async()=>{const from=heroDraws;for(let i=0;i<60;i++)await new Promise(requestAnimationFrame);return {draws:heroDraws-from};});
 report.gpu=await page.evaluate(()=>{const gl=window.__FORMA.viewer.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
 const samples=[];for(let i=0;i<6;i++){const bytes=fs.readFileSync('assets/models/sheng.glb'),t=performance.now();await analyzeBuffer('sheng.glb',bytes,'glb');samples.push(performance.now()-t);}report.measurements.analysisMs=samples;
 // 32 MiB valid GLB: unchanged licensed geometry/textures plus unused buffer padding; no user model.
 const {json,bin}=parseGLB(fs.readFileSync('test-assets/licensed/Avocado.glb')),large=Buffer.alloc(32*1024*1024);bin.copy(large);json.buffers[0].byteLength=large.length;
 const body=JSON.stringify({name:'performance-padded-avocado.glb',dataBase64:buildGLB(json,large).toString('base64')});
 const t=performance.now(),r=await fetch(fe.url+'/api/assets/import',{method:'POST',headers:{'Content-Type':'application/json'},body});
 assert.equal(r.status,200,await r.clone().text());report.measurements.upload={encodedBytes:Buffer.byteLength(body),elapsedMs:performance.now()-t,frontend:await memory(fe.p),backend:await memory(be.p)};
 assert.equal(report.errors.length,0);console.log(JSON.stringify(report.measurements));
}finally{await browser?.close();for(const p of children)p.kill();fs.writeFileSync(path.join(OUT,'performance.json'),JSON.stringify(report,null,2));}
