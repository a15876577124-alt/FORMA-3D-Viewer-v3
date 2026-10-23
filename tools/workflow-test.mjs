// Real Edge acceptance. The runner supplies a disposable project, never user assets.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
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
  const assets=[];
  for(const name of ['sheng','dan']) assets.push((await post('/api/assets/import',{name:'identity-'+name+'.glb',dataBase64:fs.readFileSync(path.join(ROOT,'assets/raw',name+'.glb')).toString('base64')})).asset);
  browser=await launchBrowser();const page=await browser.newPage();
  await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,300));});console.log({be,fe});
  await page.setRequestInterception(true);page.on('request',r=>r.url().endsWith('/api/models')?r.respond({status:503,contentType:'application/json',body:'{"error":{"message":"offline test"}}'}):r.continue());
  await page.goto(fe+'/#/studio',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORMA?.ready && window.__FORMA.studio.core.state.status==='online',{timeout:30000}).catch(async e=>{console.log(await page.evaluate(()=>({text:document.body.innerText.slice(0,500),state:window.__FORMA?.studio?.state})));throw e;});
  async function clickAsset(id){await page.click('[data-asset="'+id+'"]');await page.waitForFunction(id=>window.__FORMA.studio.core.state.selectionStatus==='ready' && window.__FORMA.studio.core.state.selection?.assetId===id,{timeout:60000},id);}
  async function identity(){return page.evaluate(()=>{const c=window.__FORMA.studio.core,v=window.__FORMA.viewer;return {id:c.state.selection?.assetId,version:c.state.selectedVersion,path:c.state.selection?.path,viewer:v.currentEntry,report:c.state.analysis?.stats,stats:v.stats,visible:v.modelRoot?.visible};});}
  await clickAsset(assets[0].id);check('sheng viewport and report agree',(await identity()).stats.tris===47512);
  await clickAsset(assets[1].id);let s=await identity();check('dan selection loads dan geometry',s.stats.tris===46828&&s.report.tris===46828&&s.id===assets[1].id&&s.viewer.assetId===s.id&&s.visible);
  await page.evaluate(async(ids)=>{const c=window.__FORMA.studio.core;await Promise.all([c.selectAsset(ids[0]),c.selectAsset(ids[1])]);},assets.map(a=>a.id));
  s=await identity();check('rapid selection discards stale model and report',s.id===assets[1].id&&s.viewer.assetId===s.id&&s.report.tris===s.stats.tris);
  const run=await page.evaluate(async()=>{const c=window.__FORMA.studio.core;const ops=[{op:'dedup',params:{}}];let r=await c.run({ops});if(!r && c.state.confirmToken)r=await c.run({ops});return r;});
  check('processing targets selected asset',run?.assetId===assets[1].id && run.baseVersion===0 && run.verify?.pass);
  s=await identity();check('processed version is selected and rendered',s.version===run.version&&s.viewer.version===run.version&&s.path===run.afterPath);
  await page.click('[data-version="0"]');await page.waitForFunction(()=>window.__FORMA.studio.core.state.selectionStatus==='ready'&&window.__FORMA.studio.core.state.selectedVersion===0);
  s=await identity();check('Original version restores actual source',s.path.includes('/original/')&&!await page.evaluate(()=>!!window.__FORMA.studio.rig));
  const exported=await page.evaluate(async()=>{const c=window.__FORMA.studio.core;let r=await c.exportAs('gltf');if(!r&&c.state.confirmToken)r=await c.exportAs('gltf');return r;});
  check('GLB to GLTF passes real post-verification',exported?.verify?.pass);
  await page.evaluate(v=>window.__FORMA.studio.core.selectAsset(window.__FORMA.studio.state.selectedAsset,v),exported.version);
  s=await identity();check('external GLTF renders correct geometry and textures',s.stats.tris===46828&&s.report.textures>0&&s.viewer.version===exported.version);
  const gltfFile=path.join(ROOT,exported.afterPath),json=JSON.parse(fs.readFileSync(gltfFile,'utf8'));
  const deps=[...new Set([...json.buffers,...json.images].map(x=>x.uri).filter(x=>x&&!x.startsWith('data:')))];
  const imported=await post('/api/assets/import',{name:'roundtrip.gltf',dataBase64:fs.readFileSync(gltfFile).toString('base64'),files:deps.map(name=>({name,dataBase64:fs.readFileSync(path.join(path.dirname(gltfFile),name)).toString('base64')}))});
  check('GLTF package re-import preserves texture sizes',imported.report.textures.every(t=>t.bytes>0&&t.width>0));
  await page.evaluate(async id=>{const c=window.__FORMA.studio.core;await c.refreshAssets();await c.selectAsset(id);},imported.asset.id);
  const glb=await page.evaluate(async()=>{const c=window.__FORMA.studio.core;let r=await c.exportAs('glb');if(!r&&c.state.confirmToken)r=await c.exportAs('glb');return r;});
  check('GLTF to GLB passes validator and semantic checks',glb?.verify?.pass);
  const roundtrip=await post('/api/assets/import',{name:'roundtrip.glb',dataBase64:fs.readFileSync(path.join(ROOT,glb.afterPath)).toString('base64')});
  await page.evaluate(async id=>{const c=window.__FORMA.studio.core;await c.refreshAssets();await c.selectAsset(id);},roundtrip.asset.id);
  s=await identity();check('exported GLB re-import renders original geometry',s.stats.tris===46828&&s.report.textures===imported.report.stats.textures);
  await page.screenshot({path:path.join(OUT,'roundtrip.png')});
  const rejected=await fetch(be+'/api/assets/'+assets[0].id+'/versions/-1');check('invalid versions rejected',rejected.status===400);
  await page.screenshot({path:path.join(OUT,'identity.png')});
  check('no uncaught browser errors',errors.length===0);
  const gpu=await page.evaluate(()=>{const gl=window.__FORMA.viewer.renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';});
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,errors,gpu,selection:s},null,2));
}finally{if(browser)await browser.close();for(const c of children)c.kill();}
