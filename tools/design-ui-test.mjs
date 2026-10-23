// Approved handoff G01/S01 acceptance. Writes only to the runner's disposable copy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {launchBrowser} from './browser-test.mjs';
const ROOT=process.cwd(),OUT=process.env.FORMA_TEST_OUTPUT_DIR,children=[],checks=[],errors=[];
assert.equal(ROOT,process.env.FORMA_TEST_ISOLATED_ROOT);
let browser;
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
async function start(script,env){return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[script],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(p);
  let log='';const timer=setTimeout(()=>reject(Error(log||'startup timeout')),15000);
  p.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
  p.stderr.on('data',b=>{log+=b;});p.once('error',reject);
});}
try{
  for(const f of JSON.parse(fs.readFileSync('assets/brand/PROVENANCE.json','utf8')).files){
    check('brand handoff bytes '+f.file,createHash('sha256').update(fs.readFileSync(path.join('assets/brand',f.file))).digest('hex')===f.sha256);
  }
  const backend=await start('backend/server.mjs',{FORMA_BACKEND_PORT:'0'});
  const url=await start('serve.mjs',{PORT:'0',FORMA_BACKEND:backend});
  browser=await launchBrowser();const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:1000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.goto(url+'/#/',{waitUntil:'networkidle0'});
  await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
  check('H01 one primary Gallery action and secondary Studio',await page.$$eval('.v5-hero-actions a',es=>es.length===2&&es[0].getAttribute('href')==='#/gallery'&&es[1].getAttribute('href')==='#/studio'));
  check('H02 five cards link to their own detail',await page.$$eval('.v5-series-card',es=>es.length===5&&es.every((e,i)=>e.getAttribute('href')==='#/work/'+['sheng','dan','jing-red','jing-yellow','jing-white'][i])));
  for(const width of [1440,768,390]){
    await page.setViewport({width,height:1000});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
    check('H01 home fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('A01 body text readable '+width,await page.$eval('.v5-hero-lede',e=>parseFloat(getComputedStyle(e).fontSize)>=14));
    check('H01 uniform cards '+width,await page.$$eval('.v5-series-card',es=>Math.max(...es.map(e=>e.clientWidth))-Math.min(...es.map(e=>e.clientWidth))<=1));
    await page.screenshot({path:path.join(OUT,'home-'+width+'.png'),fullPage:true});
    await page.mouse.move(width/2,500);await page.mouse.wheel({deltaY:6000});
    await page.waitForFunction(()=>document.querySelector('.v5-footer').getBoundingClientRect().bottom<=innerHeight+2);
    check('home footer reachable by wheel '+width,await page.evaluate(()=>scrollY>0&&document.querySelector('.v5-footer').getBoundingClientRect().bottom<=innerHeight+2));
    await page.goto(url+'/#/work/dan',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.querySelector('#v5Tech-dan')?.textContent.includes('真实解析'));
    await page.screenshot({path:path.join(OUT,'detail-'+width+'.png'),fullPage:true});
    await page.goto(url+'/#/',{waitUntil:'networkidle0'});
  }
  await page.setViewport({width:1440,height:1000});
  await page.click('.v5-nav-link[data-match="/work"]');
  await page.waitForFunction(()=>location.hash.includes('section=collection'));
  check('H02 works navigation opens collection',await page.evaluate(()=>location.hash.includes('section=collection')));
  await page.goto(url+'/#/gallery',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA?.viewer.modelRoot);
  for(const width of [1440,768,390]){
    await page.setViewport({width,height:900});
    await page.evaluate(()=>window.__FORMA.viewer.setAutoRotate(false));
    await page.waitForFunction(()=>{const v=window.__FORMA.viewer,r=v.canvas.getBoundingClientRect();return Math.abs(v.camera.aspect-r.width/r.height)<.01;});
    check('G03 canvas uses available width '+width,await page.$eval('#stage',(e,width)=>e.clientWidth>width*(width>=1200?.5:.9),width));
    check('G02 real thumbnails are above fallback '+width,await page.$eval('.gl-selection .asset-thumb img',e=>getComputedStyle(e).zIndex==='1'&&e.naturalWidth>0));
    await page.screenshot({path:path.join(OUT,'gallery-'+width+'.png')});
  }
  await page.setViewport({width:1440,height:1000});
  await page.click('#glAdvanced');
  check('G01 named native modal focuses close',await page.$eval('#glDrawer',e=>e.matches(':modal')&&e.contains(document.activeElement)&&!!e.getAttribute('aria-label')));
  await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
  check('G01 reverse Tab remains within drawer',await page.$eval('#glDrawer',e=>e.contains(document.activeElement)));
  await page.screenshot({path:path.join(OUT,'gallery-settings-desktop.png')});
  await page.keyboard.press('Escape');
  check('G01 Escape closes and restores focus',await page.$eval('#glDrawer',e=>e.hidden&&!e.open&&document.activeElement.id==='glAdvanced'));
  await page.click('#glAdvanced');await page.evaluate(()=>{location.hash='#/studio';});
  await page.waitForFunction(()=>window.__FORMA.studio.state.status==='online');
  check('G01 route leave clears modal and inert state',await page.evaluate(()=>!document.querySelector(':modal')&&!document.body.classList.contains('gl-drawer-open')));
  const input=await page.$('#studioFileInput');await input.uploadFile(path.join(ROOT,'test-assets/licensed/Avocado.glb'));
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');
  await page.click('.st-tab[data-pane="material"]');await page.click('#stMatList button');
  await page.waitForSelector('#stCompareVersions');
  check('S02 same-version comparison disabled with a reason',await page.$eval('#stCompareVersions',e=>e.disabled&&!document.querySelector('#stCompareReason').hidden));
  check('S02 Before and After labels visible',await page.$$eval('.st-version-field',es=>es.length===2&&es.every(e=>e.textContent.includes(e.textContent.startsWith('Before')?'处理前':'处理后'))));
  check('S03 numeric input preserves the raw value before editing',await page.evaluate(()=>{
    let m;window.__FORMA.viewer.modelRoot.traverse(o=>{if(!m&&o.isMesh)m=Array.isArray(o.material)?o.material[0]:o.material;});
    return Number(document.querySelector('[data-material-number="roughness"]').value)===m.roughness&&!window.__FORMA.studio.state.materialDirty;
  }));
  await page.focus('[data-material-param="roughness"]');await page.keyboard.press('ArrowLeft');
  const requests=[];let abortNext=false;
  await page.setRequestInterception(true);
  page.on('request',req=>{
    if(req.method()==='POST'&&/\/api\/assets\/[^/]+\/run$/.test(req.url())){
      requests.push({url:req.url(),...JSON.parse(req.postData())});
      if(abortNext){abortNext=false;void req.abort('connectionfailed');return;}
    }
    void req.continue();
  });
  await page.click('#stMatSave');await page.waitForSelector('#stConfirmMaterialSave');
  check('S01 confirmation names the material action',await page.$eval('#stConfirmMaterialSave',e=>e.textContent==='确认保存材质版本'));
  const count=requests.length;await page.click('#stCancelMaterialSave');
  check('S01 cancel preserves draft without another request',requests.length===count&&await page.evaluate(()=>window.__FORMA.studio.state.materialDirty&&!window.__FORMA.studio.state.confirmToken));
  await page.click('#stMatSave');await page.waitForSelector('#stConfirmMaterialSave');
  await page.focus('[data-material-param="roughness"]');await page.keyboard.press('ArrowLeft');
  check('S01 editing invalidates an earlier confirmation',await page.evaluate(()=>!window.__FORMA.studio.state.confirmToken&&!document.querySelector('#stConfirmMaterialSave')));
  abortNext=true;await page.click('#stMatSave');
  await page.waitForFunction(()=>window.__FORMA.studio.state.materialSaveStatus==='error');
  check('S01 network failure retains dirty values',await page.evaluate(()=>window.__FORMA.studio.state.materialDirty&&window.__FORMA.studio.state.selectedVersion===0));
  const failedCount=requests.length;await new Promise(r=>setTimeout(r,400));
  check('S01 failed write is not automatically replayed',requests.length===failedCount);
  await page.click('#stMatSave');await page.waitForSelector('#stConfirmMaterialSave');
  const frozen=requests.at(-1);
  await page.screenshot({path:path.join(OUT,'material-confirmation.png')});
  // Two same-frame clicks must replay one frozen request, even if an external preview changes.
  await page.evaluate(()=>{
    window.__FORMA.viewer.modelRoot.traverse(o=>{if(o.isMesh){const m=Array.isArray(o.material)?o.material[0]:o.material;m.roughness=.123;}});
    const b=document.querySelector('#stConfirmMaterialSave');b.click();b.click();
  });
  await page.waitForFunction(()=>window.__FORMA.studio.state.selectedVersion>0&&window.__FORMA.studio.state.selectionStatus==='ready');
  check('S01 confirmation uses the frozen asset and version',requests.at(-1).url===frozen.url&&requests.at(-1).baseVersion===frozen.baseVersion);
  check('S01 confirmation uses frozen material parameters',JSON.stringify(requests.at(-1).ops)===JSON.stringify(frozen.ops));
  check('S01 double click submits once',requests.length===failedCount+2);
  check('S01 real validated version clears draft',await page.evaluate(()=>!window.__FORMA.studio.state.materialDirty&&window.__FORMA.studio.state.lastRun?.verify.pass));
  await page.evaluate(()=>window.__FORMA.studio.core.exitCompare());
  await page.waitForFunction(()=>window.__FORMA.studio.state.materialSaveStatus==='idle');
  for(const width of [1440,768,390]){
    await page.setViewport({width,height:900});
    check('S04 Studio fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('S04 asset and save status stay visible '+width,await page.$eval('.st-identity',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
    await page.screenshot({path:path.join(OUT,'studio-'+width+'.png')});
    if(width===390){
      await page.click('#stToolsToggle');
      check('S04 properties opens alone',await page.evaluate(()=>document.querySelector('#inspector.open')&&!document.querySelector('#sidebar.st-mobile-open')));
      await page.screenshot({path:path.join(OUT,'studio-properties-390.png')});
      await page.keyboard.press('Escape');await page.click('#stAssetsToggle');
      check('S04 assets opens alone',await page.evaluate(()=>document.querySelector('#sidebar.st-mobile-open')&&!document.querySelector('#inspector.open')));
      await page.click('#stAssetsClose');
    }
  }
  await page.setViewport({width:1440,height:900});
  await page.click('#stMore summary');
  check('S04 original low-frequency actions remain reachable',await page.$$eval('.st-more-menu button',es=>es.length===4&&es.every(e=>e.getBoundingClientRect().width>0)));
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{location.hash='#/';});await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
  await page.mouse.move(700,500);await page.mouse.wheel({deltaY:6000});
  await page.waitForFunction(()=>document.querySelector('.v5-footer').getBoundingClientRect().bottom<=innerHeight+2);
  check('public scrolling restored after Studio',await page.evaluate(()=>scrollY>0));
  check('brand V2 never loads before interaction',await page.evaluate(()=>!performance.getEntriesByType('resource').some(r=>r.name.includes('/motion-v2/'))));
  await page.click('.v5-brand-presentation');
  check('brand reduced motion keeps the static SVG',await page.$eval('#brandPresentation',e=>e.open&&!!e.querySelector('.v5-brand-motion-host>img')&&!e.querySelector('.v5-brand-motion-host>svg')));
  await page.screenshot({path:path.join(OUT,'brand-static-reduced-motion.png')});
  await page.keyboard.press('Escape');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.click('.v5-brand-presentation');
  await page.waitForFunction(()=>document.querySelector('.v5-brand-motion-host')?.dataset.playing==='true');
  check('brand uses approved Spatial V2',await page.$eval('.v5-brand-motion-host svg',e=>e.getAttribute('aria-label')==='FORMA Spatial Construction'));
  await page.screenshot({path:path.join(OUT,'brand-v2-playing.png')});
  await page.waitForFunction(()=>Number(document.querySelector('.v5-brand-motion-host')?.dataset.time)===3);
  check('brand stops after one actual timeline',await page.$eval('.v5-brand-motion-host',e=>e.dataset.playing==='false'));
  check('brand final paths match the delivered SVG',await page.evaluate(async()=>{
    const approved=new DOMParser().parseFromString(await(await fetch('./assets/brand/lockup-ivory.svg')).text(),'image/svg+xml');
    const paths=root=>[...root.querySelectorAll('path')].map(p=>p.getAttribute('d')).join('|');
    return paths(approved)===paths(document.querySelector('.v5-brand-motion-host svg'));
  }));
  await page.screenshot({path:path.join(OUT,'brand-v2-final.png')});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  check('brand preference changes restore real static artwork',await page.$eval('.v5-brand-motion-host',e=>!!e.querySelector('img')&&!e.querySelector('svg')));
  await page.keyboard.press('Escape');
  check('brand close restores its trigger focus',await page.evaluate(()=>document.activeElement.classList.contains('v5-brand-presentation')));
  check('no page exceptions',errors.length===0);
}finally{
  await browser?.close();for(const p of children)p.kill();
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,errors},null,2));
}
