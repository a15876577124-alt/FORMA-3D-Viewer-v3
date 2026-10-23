// Targeted RC1 acceptance. Runs only in the runner's disposable project.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {launchBrowser} from './browser-test.mjs';
import {startTestServers} from './test-servers.mjs';
const OUT=process.env.FORMA_TEST_OUTPUT_DIR,checks=[],errors=[],metrics={};
assert.equal(process.env.FORMA_TEST_ISOLATED_ROOT,process.cwd());
const ids=['sheng','dan','jing-red','jing-yellow','jing-white'];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
let browser,servers;
try{
  servers=await startTestServers();browser=await launchBrowser();const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setViewport({width:1440,height:1000});
  await page.goto(servers.BASE+'/#/',{waitUntil:'networkidle0'});
  await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
  metrics.homeRequests=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:r.transferSize})));
  check('home loads only its real 3D Hero GLB',metrics.homeRequests.filter(r=>r.path.endsWith('.glb')).length===1);
  check('hidden main Viewer has no eager model',await page.evaluate(()=>!window.__FORMA.viewer.currentEntry));
  check('RC1 interactive Hero remains present',!!await page.$('.v5-hero-3d canvas'));
  check('five existing cards display real thumbnails',await page.$$eval('.v5-series-thumb',es=>es.length===5&&es.every(e=>e.complete&&e.naturalWidth>0)));
  check('one quiet footer contact defaults to collapsed',await page.$eval('#contactBlock',e=>e.tagName==='DETAILS'&&!e.open&&!!e.closest('footer')));
  await page.screenshot({path:path.join(OUT,'home-desktop.png'),fullPage:true});
  await page.$eval('.v5-series-grid',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(OUT,'collection-desktop.png')});
  for(const id of ids){
    await page.goto(servers.BASE+'/#/work/'+id,{waitUntil:'networkidle0'});
    await page.waitForFunction(id=>document.querySelector('#v5Tech-'+id)?.textContent.includes('真实解析'),{},id);
    check(id+' detail has actual geometry report and visible canvas',await page.evaluate(id=>{
      const c=document.querySelector('.v5-layer:not([hidden]) .v5-work-stage canvas');return c?.width>100&&document.querySelector('#v5Tech-'+id).textContent.includes('GLB');
    },id));
    await page.screenshot({path:path.join(OUT,'work-'+id+'.png'),fullPage:true});
    await page.evaluate(id=>{location.hash='#/gallery?work='+id;},id);
    await page.waitForFunction(id=>window.__FORMA.current?.id===id&&window.__FORMA.info?.modelTris>40000,{},id);
    await page.evaluate(()=>window.__FORMA.viewer.setAutoRotate(false));
    check(id+' detail renderer is disposed on leaving',await page.$$eval('.v5-work-stage canvas',es=>es.length===0));
    check(id+' Gallery identity and sidebar agree',await page.evaluate(id=>window.__FORMA.viewer.currentEntry.id===id&&document.querySelector('.asset.selected')?.dataset.id===id, id));
    await page.screenshot({path:path.join(OUT,'gallery-'+id+'.png')});
  }
  await page.goto(servers.BASE+'/#/studio',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.__FORMA.studio.state.status==='online');
  await page.screenshot({path:path.join(OUT,'studio-empty.png')});
  await (await page.$('#studioFileInput')).uploadFile(path.join(process.cwd(),'test-assets/licensed/Avocado.glb'));
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');
  let held;await page.setRequestInterception(true);
  const holdSource=req=>{if(req.url().includes('/versions/0'))held=req;else req.continue();};page.on('request',holdSource);
  await page.evaluate(()=>{const c=window.__FORMA.studio.core;window.__pending=c.selectAsset(c.state.selectedAsset);});
  const deadline=Date.now()+15000;while(!held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));assert.ok(held);
  await page.evaluate(()=>{location.hash='#/gallery?work=dan';});await page.waitForFunction(()=>window.__FORMA.current?.id==='dan');
  await held.continue();await page.evaluate(()=>window.__pending);
  check('late Studio selection cannot overwrite Gallery',await page.evaluate(()=>window.__FORMA.viewer.currentEntry.id==='dan'));
  page.off('request',holdSource);await page.setRequestInterception(false);
  await page.evaluate(()=>{location.hash='#/studio';});await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');
  check('Studio resumes selected Original with no stale catalogue highlight',await page.evaluate(()=>window.__FORMA.viewer.currentEntry.assetId===window.__FORMA.studio.state.selectedAsset&&window.__FORMA.viewer.currentEntry.version===0&&document.querySelectorAll('.sidebar .asset.selected').length===0));
  await page.screenshot({path:path.join(OUT,'studio-asset.png')});
  held=null;await page.setRequestInterception(true);
  const holdRun=req=>{if(/\/api\/assets\/[^/]+\/run$/.test(req.url()))held=req;else req.continue();};page.on('request',holdRun);
  await page.evaluate(()=>{window.__pendingRun=window.__FORMA.studio.core.run({ops:[{op:'dedup',params:{}}]});});
  const runDeadline=Date.now()+15000;while(!held&&Date.now()<runDeadline)await new Promise(r=>setTimeout(r,30));assert.ok(held);
  await page.evaluate(()=>{location.hash='#/gallery?work=dan';});await page.waitForFunction(()=>window.__FORMA.current?.id==='dan');
  await held.continue();metrics.backgroundRun=await page.evaluate(async()=>{const r=await window.__pendingRun;return {version:r?.version,verified:r?.verify?.pass};});
  check('late verified operator output cannot replace Gallery',metrics.backgroundRun.verified&&await page.evaluate(()=>window.__FORMA.viewer.currentEntry.id==='dan'));
  page.off('request',holdRun);await page.setRequestInterception(false);
  for(let i=0;i<3;i++){
    await page.evaluate(()=>{location.hash='#/studio';});await page.waitForFunction(()=>window.__FORMA.studio.active);
    await page.evaluate(()=>{location.hash='#/';});await page.waitForFunction(()=>!document.querySelector('.v5-home').hidden);
    check('public footer visible after Studio cycle '+i,await page.$eval('.v5-footer',e=>e.getBoundingClientRect().height>0));
    await page.evaluate(()=>{location.hash='#/gallery?work=sheng';});await page.waitForFunction(()=>window.__FORMA.current?.id==='sheng');
    check('Gallery canvas and projection restored on cycle '+i,await page.evaluate(()=>{const v=window.__FORMA.viewer,r=v.canvas.getBoundingClientRect();return r.width>100&&r.height>100&&Math.abs(v.camera.aspect-r.width/r.height)<.01&&v.modelRoot.visible;}));
  }
  await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>window.__FORMA.info?.modelTris>40000);
  check('Gallery refresh loads a real model',await page.evaluate(()=>window.__FORMA.current.id==='sheng'));
  for(const width of [390,768]){
    await page.setViewport({width,height:844});
    for(const [name,route]of [['home','/'],['work','/work/dan'],['gallery','/gallery?work=dan'],['studio','/studio']]){
      await page.goto(servers.BASE+'/#'+route,{waitUntil:'networkidle0'});
      if(name==='home'){
        await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
        const {data,info}=await sharp(await (await page.$('.v5-hero-3d')).screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
        let red=0;for(let i=0;i<data.length;i+=info.channels)if(data[i]>80&&data[i]>data[i+1]*1.25&&data[i]>data[i+2]*1.3)red++;
        check('home '+width+' actually renders the red figurine, not only its pedestal',red>250);
      }
      if(name==='work')await page.waitForFunction(()=>document.querySelector('#v5Tech-dan')?.textContent.includes('真实解析'));
      if(name==='gallery'){
        await page.waitForFunction(()=>window.__FORMA.current?.id==='dan'&&window.__FORMA.info?.modelTris===46828);
        await page.evaluate(()=>window.__FORMA.viewer.setAutoRotate(false));
        check('Gallery '+width+' displays the requested Dan model',await page.evaluate(()=>window.__FORMA.viewer.currentEntry.id==='dan'));
      }
      check(name+' '+width+' has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(OUT,name+'-'+width+'.png')});
    }
  }
  metrics.gpu=await page.evaluate(()=>{const gl=window.__FORMA.viewer.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  check('no page exceptions',errors.length===0);
  await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({checks,errors,metrics,mobile:'Desktop Edge emulation only; physical phones untested.'},null,2));
}finally{await browser?.close();servers?.be.kill();servers?.serve.kill();}
