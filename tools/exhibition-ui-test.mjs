import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test.mjs';
import {startTestServers} from './test-servers.mjs';
const OUT=process.env.FORMA_TEST_OUTPUT_DIR, ids=['sheng','dan','jing-red','jing-yellow','jing-white'];
const checks=[],errors=[],metrics={};
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
let browser,servers;
try{
  servers=await startTestServers();browser=await launchBrowser();const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setViewport({width:1440,height:1000});
  await page.goto(servers.BASE+'/#/',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA);
  metrics.homeGLBRequests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/\.glb(?:\?|$)/.test(r.name)).length);
  metrics.homeTransferBytes=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0));
  check('home requests zero GLB files',metrics.homeGLBRequests===0);
  check('home has five real model images',await page.$$eval('.ex-work-card img',es=>es.length===5&&es.every(e=>e.complete&&e.naturalWidth===1200)));
  check('home has no secondary WebGL hero',await page.$$eval('.ex-home canvas',es=>es.length===0));
  await page.screenshot({path:path.join(OUT,'home-desktop.png'),fullPage:true});
  check('contact is collapsed by default',await page.$eval('#contactBlock',e=>!e.open));
  await page.click('#contactBlock summary');
  check('contact offers both exact mailto links',await page.$$eval('#contactBlock a',es=>es.map(e=>e.getAttribute('href')).join('|')==='mailto:haorongli09@outlook.com|mailto:haorongli09@gmail.com'));
  await page.screenshot({path:path.join(OUT,'contact-desktop.png')});
  await page.click('#contactBlock summary');
  await page.goto(servers.BASE+'/#/work/dan',{waitUntil:'networkidle0'});
  await page.screenshot({path:path.join(OUT,'work-desktop.png'),fullPage:true});
  await page.click('.ex-work-stats summary');
  check('work report matches Dan measured geometry',await page.$eval('.ex-work-stats',e=>e.textContent.includes('28,662')&&e.textContent.includes('46,828')));
  check('work uses poster without separate GL renderer',await page.$$eval('.ex-work canvas',es=>es.length===0));
  await page.click('.ex-work-copy .ex-button');
  await page.waitForFunction(()=>window.__FORMA.current?.id==='dan'&&!window.__FORMA.viewer.busy);
  for(const id of ids){
    await page.click(`.ex-filmstrip [data-work="${id}"]`);
    await page.waitForFunction(id=>window.__FORMA.current?.id===id&&!window.__FORMA.viewer.busy,{},id);
    check(id+' asset, viewport and selection agree',await page.evaluate(id=>window.__FORMA.viewer.currentEntry.id===id&&document.querySelector('.ex-filmstrip [aria-current=true]').dataset.work===id,id));
    await page.screenshot({path:path.join(OUT,'gallery-'+id+'.png')});
  }
  await page.click('.ex-filmstrip [data-work="dan"]');await page.waitForFunction(()=>window.__FORMA.current?.id==='dan');
  await page.click('#glAdvanced');check('settings opens with keyboard focus',await page.$eval('#glDrawer',e=>!e.hidden&&e.contains(document.activeElement)));
  await page.screenshot({path:path.join(OUT,'gallery-settings.png')});
  await page.keyboard.press('Escape');check('Escape closes settings and restores focus',await page.$eval('#glAdvanced',e=>e===document.activeElement&&e.getAttribute('aria-expanded')==='false'));
  await page.click('#glResources');check('existing import and library remain reachable',await page.$eval('#importZone',e=>e.getBoundingClientRect().width>0));await page.keyboard.press('Escape');
  await page.click('#glRotate');check('rotation starts explicitly',await page.evaluate(()=>window.__FORMA.viewer.controls.autoRotate));
  await page.click('#glRotate');await page.click('#glReset');
  // Count actual renderer submissions after damping settles, not only RAF callbacks.
  await page.evaluate(()=>{window.__renders=0;const v=window.__FORMA.viewer,render=v.renderer.render.bind(v.renderer);v.renderer.render=(...a)=>{window.__renders++;return render(...a);};});
  await new Promise(r=>setTimeout(r,1200));
  const initial=await page.evaluate(()=>window.__renders);await new Promise(r=>setTimeout(r,1000));metrics.idleSubmissions=await page.evaluate(n=>window.__renders-n,initial);
  check('static exhibition stops GPU frame submissions',metrics.idleSubmissions===0);
  await page.goto(servers.BASE+'/#/studio',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.__FORMA.studio.state.status==='online');
  await page.screenshot({path:path.join(OUT,'studio-desktop.png')});
  const input=await page.$('#studioFileInput');await input.uploadFile(path.join(process.cwd(),'test-assets/licensed/Avocado.glb'));
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');
  let held=null;
  await page.setRequestInterception(true);
  const intercept=req=>{if(req.url().includes('/versions/0'))held=req;else req.continue();};
  page.on('request',intercept);
  await page.evaluate(()=>{const c=window.__FORMA.studio.core;window.__pendingSelection=c.selectAsset(c.state.selectedAsset);});
  const deadline=Date.now()+15000;while(!held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));
  assert.ok(held,'Studio source request must really be held in flight');
  await page.evaluate(()=>{location.hash='#/gallery?work=dan';});await page.waitForFunction(()=>window.__FORMA.current?.id==='dan');
  await held.continue();await page.evaluate(()=>window.__pendingSelection);
  check('late Studio response cannot replace Gallery model',await page.evaluate(()=>window.__FORMA.viewer.currentEntry.id==='dan'));
  page.off('request',intercept);await page.setRequestInterception(false);
  await page.goto(servers.BASE+'/#/studio',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');
  check('return to Studio resumes the selected asset and version',await page.evaluate(()=>window.__FORMA.viewer.currentEntry.assetId===window.__FORMA.studio.state.selectedAsset&&window.__FORMA.viewer.currentEntry.version===0));
  await page.screenshot({path:path.join(OUT,'studio-asset.png')});
  check('Studio import clears the previous catalogue highlight',await page.evaluate(()=>document.querySelectorAll('.sidebar .asset.selected').length===0));
  held=null;await page.setRequestInterception(true);
  const holdRun=req=>{if(/\/api\/assets\/[^/]+\/run$/.test(req.url()))held=req;else req.continue();};page.on('request',holdRun);
  await page.evaluate(()=>{window.__pendingRun=window.__FORMA.studio.core.run({ops:[{op:'dedup',params:{}}]});});
  const runDeadline=Date.now()+15000;while(!held&&Date.now()<runDeadline)await new Promise(r=>setTimeout(r,30));assert.ok(held,'Actual operator request is held in flight');
  await page.evaluate(()=>{location.hash='#/gallery?work=dan';});await page.waitForFunction(()=>window.__FORMA.current?.id==='dan');
  await held.continue();metrics.backgroundRun=await page.evaluate(()=>window.__pendingRun.then(r=>({version:r?.version,verified:r?.verify?.pass})));
  check('late operator preserves its verified output without replacing Gallery',metrics.backgroundRun.verified&&await page.evaluate(()=>window.__FORMA.viewer.currentEntry.id==='dan'));
  page.off('request',holdRun);await page.setRequestInterception(false);

  await page.goto(servers.BASE+'/#/',{waitUntil:'networkidle0'});
  check('Studio to home restores public footer',await page.$eval('#contactBlock',e=>e.getClientRects().length>0));

  await page.goto(servers.BASE+'/#/gallery',{waitUntil:'networkidle0'});
  check('return from Studio restores visible canvas',await page.$eval('#stage',e=>e.getBoundingClientRect().width>900&&e.getBoundingClientRect().height>400));
  await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>window.__FORMA.current?.id);
  check('Gallery reload displays a loaded model',await page.evaluate(()=>!!window.__FORMA.viewer.modelRoot));
  await page.evaluate(()=>{location.hash='#/work/sheng';location.hash='#/work/dan';location.hash='#/gallery?work=jing-red';});
  await page.waitForFunction(()=>window.__FORMA.current?.id==='jing-red');
  check('rapid route changes keep the last target',await page.evaluate(()=>location.hash.includes('jing-red')&&!document.querySelector('#app').hidden));
  await page.goto(servers.BASE+'/#sheng',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>location.hash==='#/gallery?work=sheng'&&window.__FORMA.current?.id==='sheng');
  check('legacy exhibit link still resolves',await page.evaluate(()=>!document.querySelector('#app').hidden));
  await page.evaluate(()=>{const f=window.__FORMA;f.viewState.get(f.current).view.autoRotate=true;f.viewState.touch();f.flushState();});
  await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>window.__FORMA.current?.id==='sheng');
  check('reduced motion stops saved autoplay on startup',!await page.evaluate(()=>window.__FORMA.viewer.controls.autoRotate));
  for(const width of [390,768]){
    await page.setViewport({width,height:844});
    for(const [name,route] of [['home','#/'],['work','#/work/dan'],['gallery','#/gallery?work=dan'],['studio','#/studio']]){
      await page.goto(servers.BASE+'/'+route,{waitUntil:'networkidle0'});
      if(name==='gallery')await page.waitForFunction(()=>window.__FORMA.current?.id==='dan');
      check(name+' '+width+' navigation remains visible',await page.$$eval('.v5-nav-link',es=>es.length===3&&es.every(e=>{const r=e.getBoundingClientRect();return getComputedStyle(e.parentElement).opacity==='1'&&r.width>40&&r.right<=innerWidth;})));
      check(name+' '+width+' no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(OUT,`${name}-${width}.png`),fullPage:!['gallery','studio'].includes(name)});
      if(name==='gallery'){
        check('Gallery '+width+' all five choices fit',await page.$$eval('.ex-filmstrip a',es=>es.length===5&&es.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})));
        await page.click('#glAdvanced');await page.screenshot({path:path.join(OUT,'settings-'+width+'.png')});await page.click('#glDrawerClose');
      }
    }
  }
  check('no uncaught page exceptions',errors.length===0);
  metrics.browser=await browser.version();metrics.gpu=await page.evaluate(()=>{const gl=window.__FORMA.viewer.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
}finally{
  await browser?.close();servers?.be.kill();servers?.serve.kill();
  await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({checks,errors,metrics,mobile:'Desktop Edge responsive emulation; physical phones not tested.'},null,2));
}
