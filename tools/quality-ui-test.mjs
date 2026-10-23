// Product acceptance runs only in the disposable snapshot created by tests/run.mjs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {launchBrowser} from './browser-test.mjs';
import {checkFbxChannels} from './check-fbx-channels.mjs';
const ROOT=process.cwd(), OUT=process.env.FORMA_TEST_OUTPUT_DIR;
assert.equal(process.env.FORMA_TEST_ISOLATED_ROOT,ROOT);
const baseline=process.env.FORMA_QUALITY_BASELINE==='1', children=[],checks=[],errors=[],metrics={};
let browser;
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
async function start(script,env){return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[script],{cwd:ROOT,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(p);
  let log=''; const timer=setTimeout(()=>reject(Error(log||'Server startup timeout')),15000);
  p.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(m[0]);}});
  p.stderr.on('data',b=>{log+=b;});p.once('error',reject);
});}
try{
  const be=await start('backend/server.mjs',{FORMA_BACKEND_PORT:'0'});
  const fe=await start('serve.mjs',{PORT:'0',FORMA_BACKEND:be});
  browser=await launchBrowser();const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setViewport({width:1440,height:1000});
  const begin=Date.now();await page.goto(fe+'/#/',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA?.ready,{timeout:30000});metrics.homeReadyMs=Date.now()-begin;
  metrics.homeRequests=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.transferSize,duration:r.duration})));
  if(!baseline){
    check('brand missing artwork falls back to text',await page.evaluate(async()=>{
      const {createBrand,setBrandState}=await import('/src/ui/brand.js');
      const b=createBrand({image:'data:image/png;base64,broken',lockup:'symbol'});document.body.append(b);
      await new Promise(r=>b.querySelector('img').addEventListener('error',r,{once:true}));
      setBrandState(b,'loading');const ok=!b.querySelector('.v5-brand-text').hidden&&b.dataset.brandState==='loading';b.remove();return ok;
    }));
    await page.goto(fe+'/#/?section=contact',{waitUntil:'networkidle0'});
    check('contact direct route scrolls into view',await page.$eval('#contactBlock',e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight;}));
    await page.evaluate(()=>scrollTo(0,0));
  }
  await page.screenshot({path:path.join(OUT,'home-desktop.png')});
  const visibleContact=()=>page.$('.v5-layer:not([hidden]) .v5-contact');
  for(const [route,name] of [['/','home'],['/work/sheng','work']]){
    await page.goto(fe+'/#'+route,{waitUntil:'networkidle0'});
    const contact=await visibleContact();await contact.scrollIntoView();
    check(name+' has one visible contact module',await page.$$eval('.v5-layer:not([hidden]) .v5-contact',e=>e.length===1));
    check(name+' both mailto links',await contact.$$eval('a',es=>['haorongli09@outlook.com','haorongli09@gmail.com'].every(mail=>es.some(e=>e.textContent===mail&&e.getAttribute('href')==='mailto:'+mail))));
    await page.screenshot({path:path.join(OUT,name+'-contact-desktop.png')});
    if(!baseline){
      await browser.defaultBrowserContext().overridePermissions(fe,['clipboard-read','clipboard-write']);
      for(let i=0;i<2;i++){
        const buttons=await contact.$$('button');await buttons[i].click();
        check(name+' copy '+i,await page.evaluate(()=>navigator.clipboard.readText())===['haorongli09@outlook.com','haorongli09@gmail.com'][i]);
      }
    }
    await page.setViewport({width:390,height:844});await contact.scrollIntoView();
    check(name+' mobile emails readable',await contact.$$eval('a',es=>es.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=390&&getComputedStyle(e).visibility==='visible';})));
    await page.screenshot({path:path.join(OUT,name+'-contact-390.png')});
    await page.setViewport({width:1440,height:1000});
  }
  for(const id of ['sheng','dan','jing-red','jing-yellow','jing-white']){
    await page.goto(fe+'/#/gallery?work='+id,{waitUntil:'networkidle0'});
    await page.waitForFunction(id=>window.__FORMA?.viewer.currentEntry?.id===id&&window.__FORMA.viewer.modelRoot,id?{timeout:30000}:{},id);
    await page.evaluate(()=>{window.__FORMA.viewer.controls.autoRotate=false;});
    await page.screenshot({path:path.join(OUT,'gallery-'+id+'.png')});
    check(id+' gallery has no contact module',await page.$$eval('.v5-layer:not([hidden]) .v5-contact',es=>es.length===0));
  }
  await page.goto(fe+'/#/studio',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA.studio.state.status==='online',{timeout:30000});
  if(!baseline)check('empty studio does not present a Gallery model as an editing target',await page.$eval('#stEmptyView',e=>!e.hidden));
  await page.screenshot({path:path.join(OUT,'studio-desktop.png')});
  check('studio has no contact module',await page.$$eval('.v5-layer:not([hidden]) .v5-contact',es=>es.length===0));
  await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(OUT,'studio-390.png')});
  if(!baseline){
    await page.setViewport({width:1440,height:1000});
    const input=await page.$('#studioFileInput');await input.uploadFile(path.join(ROOT,'test-assets/licensed/Avocado.glb'));
    await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');
    await page.click('.st-tab[data-pane="material"]');await page.click('#stMatList button');
    await page.focus('[data-material-param="roughness"]');await page.keyboard.press('ArrowLeft');
    check('material edit marks unsaved state',await page.evaluate(()=>window.__FORMA.studio.state.materialDirty));
    await page.click('#stMatUndo');check('undo restores version material',!await page.evaluate(()=>window.__FORMA.studio.state.materialDirty));
    await page.click('#stMatRedo');check('redo restores unsaved material',await page.evaluate(()=>window.__FORMA.studio.state.materialDirty));
    page.once('dialog',d=>d.dismiss());
    await page.evaluate(()=>window.__FORMA.studio.core.selectAsset(window.__FORMA.studio.selectedAsset));
    check('cancelled asset switch retains draft',await page.evaluate(()=>window.__FORMA.studio.state.materialDirty));
    await page.screenshot({path:path.join(OUT,'material-draft.png')});
    await page.click('#stMatSave');await page.waitForFunction(()=>window.__FORMA.studio.state.confirmToken);
    await page.click('#stMatSave');await page.waitForFunction(()=>window.__FORMA.studio.state.selectedVersion>0&&window.__FORMA.studio.state.selectionStatus==='ready');
    check('material saved to new version clears draft',!await page.evaluate(()=>window.__FORMA.studio.state.materialDirty));
    await page.evaluate(()=>window.__FORMA.studio.core.exitCompare());
    await page.click('.st-tab[data-pane="texture"]');
    check('texture lab draws actual texture previews',await page.$$eval('.st-tex-preview',es=>es.length>=3));
    await page.screenshot({path:path.join(OUT,'texture-channels.png')});
    await input.uploadFile(path.join(ROOT,'test-assets/licensed/blender-embedded.fbx'));
    await page.waitForFunction(()=>window.__FORMA.studio.state.selection?.format==='fbx'&&window.__FORMA.studio.state.selectionStatus==='ready');
    await page.screenshot({path:path.join(OUT,'fbx-before.png')});
    const camera=await page.evaluate(()=>{const v=window.__FORMA.viewer;return {position:v.camera.position.toArray(),target:v.controls.target.toArray()};});
    await page.click('#stPrepareGLB');await page.waitForFunction(()=>window.__FORMA.studio.state.confirmToken);
    await page.click('#stPrepareGLB');await page.waitForFunction(()=>window.__FORMA.studio.state.selection?.format==='glb'&&window.__FORMA.studio.state.selectionStatus==='ready');
    const conversion=await page.evaluate(()=>window.__FORMA.studio.lastRun);
    metrics.fbx=await checkFbxChannels(path.join(ROOT,conversion.afterPath),path.join(ROOT,'test-assets/licensed/blender-embedded.fbx'));
    check('FBX five semantic channels match source pixels and output bindings',metrics.fbx.pixelEquality);
    await page.evaluate(c=>{const v=window.__FORMA.viewer;v.camera.position.fromArray(c.position);v.controls.target.fromArray(c.target);v.controls.update();v.render();},camera);
    await page.click('.st-tab[data-pane="texture"]');await page.screenshot({path:path.join(OUT,'fbx-after.png')});
    fs.writeFileSync(path.join(OUT,'fbx-channel-report.json'),JSON.stringify(conversion.channelReport,null,2));
    await page.evaluate(()=>window.__FORMA.studio.core.exportAs('glb'));
    if(await page.evaluate(()=>!!window.__FORMA.studio.state.confirmToken))await page.evaluate(()=>window.__FORMA.studio.core.exportAs('glb'));
    const exported=await page.evaluate(()=>window.__FORMA.studio.state.lastExport);
    const reloaded=await checkFbxChannels(path.join(ROOT,exported.afterPath),path.join(ROOT,'test-assets/licensed/blender-embedded.fbx'));
    check('exported FBX-derived GLB preserves packed channel pixels',reloaded.pixelEquality);
    await page.click('.st-dock-tab[data-pane="agent"]');
    await page.select('#stProvider','compatible');
    await page.waitForFunction(()=>window.__FORMA.studio.state.provider==='compatible'&&window.__FORMA.studio.state.modelError);
    await page.click('#stProviderTest');
    await page.waitForFunction(()=>window.__FORMA.studio.state.providerTest?.code==='provider_unconfigured');
    check('unconfigured provider has explicit UI status',await page.$eval('#stProviderResult',e=>e.textContent.includes('未配置')));
    await page.screenshot({path:path.join(OUT,'ai-provider-unconfigured.png')});
    const ordinary=await page.evaluate(()=>window.__FORMA.studio.core.run({ops:[{op:'dedup',params:{}}]}));
    check('ordinary asset processing works while AI is unconfigured',ordinary?.verify?.pass===true);
  }
  check('no page exceptions',errors.length===0);
  metrics.gpu=await page.evaluate(()=>{const gl=window.__FORMA.viewer.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
}finally{
  await browser?.close();for(const p of children)p.kill();
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({baseline,checks,errors,metrics},null,2));
}
