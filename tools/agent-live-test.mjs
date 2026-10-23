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

  const imported=await post('/api/assets/import',{name:'agent-live-avocado.glb',dataBase64:fs.readFileSync('test-assets/licensed/Avocado.glb').toString('base64')});
  browser=await launchBrowser();const page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fe+'/#/studio',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORMA?.ready&&window.__FORMA.studio.state.status==='online',{timeout:30000});
  await page.evaluate(id=>window.__FORMA.studio.core.selectAsset(id),imported.asset.id);
  await page.click('.st-dock-tab[data-pane="agent"]');
  await page.$eval('#stAgentGoal',e=>{e.value='这是许可明确的 Avocado 测试资产。请先分析并提出方案，然后依次实际运行 weld (epsilon=0.000001) 和 dedup 两个无损算子，验证最终结果并 finish。不要减面和修改贴图。不接受仅建议。';e.dispatchEvent(new Event('input'));});
  await page.click('#stAgentExecute');
  await page.waitForFunction(()=>!!window.__FORMA.studio.state.lastAgent,{timeout:190000});
  let log=await page.evaluate(()=>window.__FORMA.studio.state.lastAgent.log);
  fs.writeFileSync(path.join(OUT,'live-agent.json'),JSON.stringify(log,null,2));
  check('real model returns native tool-call chunks',log.rawChunkSample.length>0&&log.model==='deepseek-v4-pro');
  check('real agent completes without failure',log.status==='complete'&&!log.errors.length);
  const results=log.rounds.flatMap(r=>r.toolCalls).filter(c=>c.name==='run_op').map(c=>c.result);
  check('two real operators pass post-verification',results.length>=2&&results.every(r=>r.verify?.pass));
  check('second operator consumes previous output',results[1].beforePath===results[0].afterPath);
  check('viewport selects actual AI result',await page.evaluate(()=>{const s=window.__FORMA.studio.state,v=window.__FORMA.viewer;return s.selectedVersion===s.lastAgent.log.currentVersion&&v.currentEntry.version===s.selectedVersion;}));
  await page.screenshot({path:path.join(OUT,'live-agent.png')});
  check('no browser runtime exceptions',errors.length===0);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,errors,model:log.model,runId:log.runId},null,2));
}finally{await browser?.close();for(const c of children)c.kill();}
