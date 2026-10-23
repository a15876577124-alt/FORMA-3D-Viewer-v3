// Real Edge/WebGL captures, not design mockups. Reads assets without a backend.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';

import {launchBrowser} from './browser-test.mjs';
import {FIGURINES} from '../src/models/catalog.js';
const output=path.resolve('test-out/portfolio-models-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});

const server=spawn(process.execPath,['serve.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try {
  const base=await new Promise((resolve,reject)=>{let log='';server.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.once('error',reject);server.once('exit',()=>reject(Error('server exited')));});
  browser=await launchBrowser();const page=await browser.newPage();
  await page.setViewport({width:1200,height:1200,deviceScaleFactor:1});
  await page.goto(base+'/?test=1#/gallery?work=dan',{waitUntil:'networkidle0'});
  await page.evaluate(()=>window.__FORMA.ready);
  await page.addStyleTag({content:'.v5-topbar,.v5-footer,.sidebar,.inspector,.viewport>*:not(canvas),.viewport-shell>*:not(.viewport){display:none!important} #app,.viewport-shell,.viewport{display:block!important;position:fixed!important;inset:0!important;width:1200px!important;height:1200px!important;padding:0!important;margin:0!important}'});
  const records=[];
  for(const sourceEntry of FIGURINES)for(const [angle,offset] of [['front',0],['three-quarter',.8],['back',Math.PI]]){
    const entry={...sourceEntry,best:{...sourceEntry.best,yaw:sourceEntry.best.yaw+offset}};
    const conditions=[];
    for(const variant of ['before','after']){
      const result=await page.evaluate(async({entry,variant})=>{
        const T=await import('/vendor/three/build/three.module.js');
        const v=window.__FORMA.viewer;
        await v.showEntry({...entry,id:entry.id+'-'+variant,file:`./assets/${variant==='before'?'models':'portfolio-v1'}/${entry.id}.glb`});
        v.onStateChange=null;v.controls.enableDamping=false;v.setAutoRotate(false);v.setGrid(false);v.setPlinth(false);
        v.setLightMode('studio');v.setExposure(1);v.setToneMapping('neutral');v.setPost({bloom:false,vignette:false});
        v.scene.background=new T.Color('#0c1016');v.stage.setContactAO(.15);v.stage.setShadowOpacity(.2);
        v.controls.update();v.applyResize();v.applyViewAngle(true);v.render();
        const png=v.capturePNG(1);
        const conditions={camera:v.camera.position.toArray(),target:v.controls.target.toArray(),fov:v.camera.fov,exposure:v.renderer.toneMappingExposure,light:'studio',crop:[1200,1200]};
        const original=[];v.modelRoot.traverse(o=>{if(o.isMesh){original.push([o,o.material]);o.material=new T.MeshNormalMaterial();}});
        const normals=v.capturePNG(1);
        original.forEach(([o,m])=>{o.material.dispose();o.material=new T.MeshBasicMaterial({map:m.map,color:m.color});});
        const unlit=v.capturePNG(1);
        original.forEach(([o,m])=>{o.material.dispose();o.material=m;});
        return {png,normals,unlit,conditions,stats:v.stats};
      },{entry,variant});
      for(const key of ['png','normals','unlit'])await fs.writeFile(path.join(output,`${entry.id}-${angle}-${variant}${key==='png'?'':'-'+key}.png`),Buffer.from(result[key].split(',')[1],'base64'));
      conditions.push(result.conditions);
      console.log(entry.id,angle,variant,JSON.stringify(result.stats));
    }
    if(JSON.stringify(conditions[0])!==JSON.stringify(conditions[1]))throw Error('A/B camera or lighting drift: '+entry.id+JSON.stringify(conditions));
    records.push({id:entry.id,angle,conditions:conditions[0],before:`assets/models/${entry.id}.glb`,after:`assets/portfolio-v1/${entry.id}.glb`});
  }
  console.log('Evidence:',output);
  await fs.writeFile(path.join(output,'capture.json'),JSON.stringify({browser:await browser.version(),records},null,2));
}finally{if(browser)await browser.close();server.kill();}
