// Temporary extension in an isolated Edge profile: browser.tabs.setZoom, not CSS or pinch zoom.
// API: https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test.mjs';import {startTestServers} from './test-servers.mjs';
const OUT=process.env.FORMA_TEST_OUTPUT_DIR;assert.equal(process.cwd(),process.env.FORMA_TEST_ISOLATED_ROOT);
let browser,servers;const report={method:'Temporary test extension chrome.tabs.setZoom(2); getZoom verification; no CSS zoom, no deviceScaleFactor simulation',checks:[],errors:[]};
const check=(name,v)=>{assert.ok(v,name);report.checks.push(name);console.log('ok '+name);};
try{
  const extension=path.join(OUT,'zoom-extension');await fs.mkdir(extension,{recursive:true});
  await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'FORMA isolated zoom verification',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
  await fs.writeFile(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(() => {});');
  servers=await startTestServers();browser=await launchBrowser({enableExtensions:[extension],defaultViewport:null,args:['--window-size=1366,900','--no-first-run','--mute-audio']});
  const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(servers.BASE+'/#/',{waitUntil:'networkidle0'});await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
  const worker=await(await browser.waitForTarget(t=>t.type()==='service_worker'&&t.url().includes('worker.js'),{timeout:10000})).worker();
  report.before=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale}));
  report.zoom=await worker.evaluate(async base=>{const tab=(await chrome.tabs.query({})).find(t=>t.url.startsWith(base));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},servers.BASE);
  await page.waitForFunction(w=>innerWidth<=w*.51,{},report.before.width);
  report.after=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale}));
  check('browser reports native 200 percent',report.zoom===2&&report.after.visualScale===1&&report.after.dpr===report.before.dpr*2);
  for(const [route,ready,name] of [['/','.v5-hero-3d[data-model-state="ready"]','home'],['/work/dan','#v5Tech-dan canvas','detail'],['/gallery?work=dan','.gl-stage-controls','gallery'],['/studio','#studioToolbar','studio']]){
    await page.evaluate(route=>{location.hash='#'+route;},route);
    if(name==='detail')await page.waitForFunction(()=>document.querySelector('#v5Tech-dan')?.textContent.includes('46,828'));
    else await page.waitForSelector(ready,{visible:true});
    if(name==='studio'){await page.waitForFunction(()=>window.__FORMA.studio.state.status==='online');const input=await page.$('#studioFileInput');await input.uploadFile(path.join(process.cwd(),'test-assets/licensed/Avocado.glb'));await page.waitForFunction(()=>window.__FORMA.studio.state.selectionStatus==='ready');}
    if(name==='detail')check('detail starts at top after footer navigation',await page.evaluate(()=>scrollY===0));
    check('no horizontal page clipping at 200% '+name,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(OUT,name+'-200.png')});
    if(name==='home'||name==='detail'){
      await page.mouse.move(report.after.width/2,report.after.height/2);await page.mouse.wheel({deltaY:20000});
      await page.waitForFunction(()=>document.querySelector('.v5-footer').getBoundingClientRect().bottom<=innerHeight+2);
      check('footer reachable at 200% '+name,await page.evaluate(()=>scrollY>0));
    }
    if(name==='gallery'){
      await page.click('#glAdvanced');check('settings opens at 200%',await page.$eval('#glDrawer',e=>e.matches(':modal')));await page.keyboard.press('Escape');
    }
    if(name==='studio')check('Studio primary actions reachable at 200%',await page.evaluate(()=>['stImportBtn','stAnalyzeBtn2','stExportBtn'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})));
  }
  check('Studio retains usable canvas at native zoom',await page.$eval('#stage',e=>e.getBoundingClientRect().height>=240));
  await page.$eval('.viewport',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(OUT,'studio-model-200.png')});
  await page.$eval('#studioDock',e=>e.scrollIntoView({block:'end'}));
  check('Studio processing area reachable at native zoom',await page.$eval('#studioDock',e=>e.getBoundingClientRect().top<innerHeight));
  check('no page exceptions',report.errors.length===0);report.status='verified';
}catch(e){report.status='failed';report.failure=e.message;throw e;}
finally{await browser?.close();servers?.be.kill();servers?.serve.kill();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2));}
