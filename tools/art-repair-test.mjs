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

  const imported=await post('/api/assets/import',{name:'art-sheng.glb',dataBase64:fs.readFileSync('assets/raw/sheng.glb').toString('base64')});
  browser=await launchBrowser();const page=await browser.newPage();await page.setViewport({width:1600,height:1000});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fe+'/#/studio',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__FORMA?.studio.state.status==='online',{timeout:30000});
  await page.evaluate(id=>window.__FORMA.studio.core.selectAsset(id),imported.asset.id);
  const repaired=await page.evaluate(async()=>{const c=window.__FORMA.studio.core,ops=[{op:'genNormals',params:{hardAngle:180}},{op:'fixMaterials',params:{metallicFactor:0,roughnessFactor:1}}];let r=await c.run({ops});if(!r&&c.state.confirmToken)r=await c.run({ops});return r;});
  check('new repair version preserves geometry and texture bytes',repaired.verify.pass&&repaired.before.tris===repaired.after.tris);
  await page.evaluate(()=>{const v=window.__FORMA.viewer;v.controls.autoRotate=false;v.camera.position.set(2.2,1.3,3.5);v.controls.target.set(0,0.8,0);v.controls.update();});
  for(const [name,split] of [['qiong-before',1],['qiong-after',0]]){
    const url=await page.evaluate(split=>{window.__FORMA.studio.rig.setSplit(split);return window.__FORMA.viewer.capturePNG();},split);
    fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(url.split(',')[1],'base64'));
  }
  await page.evaluate(()=>window.__FORMA.studio.rig.setSplit(.5));await page.waitForFunction(()=>!document.querySelector('.toast'));
  await page.screenshot({path:path.join(OUT,'qiong-comparison.png')});
  check('no browser exceptions',errors.length===0);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,errors,repaired},null,2));
}finally{await browser?.close();for(const c of children)c.kill();}
