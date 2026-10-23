// Fixed-camera, identical-material comparison of the two actual renderer implementations.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {launchBrowser} from './browser-test.mjs';
import {startTestServers} from './test-servers.mjs';
const OUT=process.env.FORMA_TEST_OUTPUT_DIR,baseline=process.env.FORMA_CALIBRATION_BASELINE==='1';
assert.equal(process.cwd(),process.env.FORMA_TEST_ISOLATED_ROOT);
const report={baseline,conditions:'512x512, DPR 1, hardware MSAA, identical normalized geometry/camera, authored material, no bloom/shadows/stage, black background; renderer profiles compared.',models:[],errors:[]};
let browser,servers;
try{
  servers=await startTestServers();browser=await launchBrowser();const page=await browser.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.setViewport({width:1440,height:1000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.goto(servers.BASE+'/#/gallery',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA?.viewer.modelRoot);
  for(const id of ['sheng','dan','jing-red','jing-yellow','jing-white']){
    const data=await page.evaluate(async id=>{
      const T=await import('/vendor/three/build/three.module.js');
      const {FIGURINES}=await import('/src/models/catalog.js');
      const {createMiniViewer}=await import('/src/core/miniViewer.js');
      const {normalizeModel,applyView}=await import('/src/models/place.js');
      await window.__FORMA.select(id);const v=window.__FORMA.viewer,entry=FIGURINES.find(e=>e.id===id);
      cancelAnimationFrame(v.frame);v.controls.autoRotate=false;v.controls.enableDamping=false;
      v.viewport.style.cssText='position:fixed;left:0;top:0;width:512px;height:512px;z-index:10000';
      v.applyResize();v.renderer.setPixelRatio(1);v.renderer.setSize(512,512,false);
      v.post.active=false;v.renderer.shadowMap.enabled=false;
      v.setToneMapping('neutral');v.setExposure(1);v.setEnvIntensity(.85);
      v.lighting.setMode('studio');v.lighting.fitTo(v.box);
      v.scene.children.forEach(o=>{o.visible=o===v.modelRoot||o===v.lighting.group;});
      v.scene.background=new T.Color(0);v.camera.aspect=1;v.camera.updateProjectionMatrix();
      applyView(v.camera,v.controls,v.box,entry.best,1.12);
      const host=document.createElement('div');host.style.cssText='position:fixed;left:512px;top:0;width:512px;height:512px;z-index:10000';document.body.append(host);
      const mini=createMiniViewer({container:host,modelUrl:entry.file,view:entry.best,autoRotateSpeed:0});await mini.loadPromise;mini.stop();
      const m=mini.modelRoot;
      // The former detail viewer used a different display scale; hold geometry fixed for profile diagnosis.
      if(!m.userData.__normalized){m.scale.setScalar(1);m.position.set(0,0,0);normalizeModel(m);}
      mini.root.rotation.set(0,0,0);mini.scene.background=new T.Color(0);
      mini.scene.children.forEach(o=>{if(o.isMesh)o.visible=false;});
      mini.renderer.setPixelRatio(1);mini.renderer.setSize(512,512,false);mini.renderer.shadowMap.enabled=false;
      mini.controls.enableDamping=false;mini.camera.copy(v.camera);mini.controls.target.copy(v.controls.target);mini.controls.update();
      // Controls may still hold a last gesture delta: copy the final matrix after updating them.
      mini.camera.copy(v.camera);mini.camera.updateMatrixWorld();
      const capture=()=>{v.renderer.render(v.scene,v.camera);mini.renderer.render(mini.scene,mini.camera);return {gallery:v.canvas.toDataURL(),detail:mini.renderer.domElement.toDataURL()};};
      const output=capture();
      const facts=root=>{const values=[];root.traverse(o=>{if(o.isMesh)for(const a of Array.isArray(o.material)?o.material:[o.material])values.push({metalness:a.metalness,roughness:a.roughness,map:!!a.map,normalMap:!!a.normalMap,env:a.envMapIntensity,flat:a.flatShading,anisotropy:a.map?.anisotropy});});return values;};
      output.facts={gallery:facts(v.modelRoot),detail:facts(mini.modelRoot),camera:v.camera.position.toArray(),target:v.controls.target.toArray(),tone:[v.renderer.toneMapping,mini.renderer.toneMapping],exposure:[v.renderer.toneMappingExposure,mini.renderer.toneMappingExposure]};
      const lights=scene=>{const a=[];scene.traverse(o=>{if(o.isLight)a.push({type:o.type,pos:o.position.toArray(),target:o.target?.position.toArray(),color:o.color.getHexString(),intensity:o.intensity});});return a;};
      output.facts.lights={gallery:lights(v.scene),detail:lights(mini.scene)};
      if(['dan','jing-white'].includes(id)){
        applyView(v.camera,v.controls,v.box,{...entry.best,distMul:.42,targetYMul:.59},1.12);
        const meshes=[];v.modelRoot.traverse(o=>{if(o.isMesh)meshes.push([o,o.material]);});
        output.diagnostics={};
        for(const mode of ['lit','unlit','clay','normals']){
          const temporary=[];
          try{
            for(const [o,original] of meshes){
              const convert=a=>{
                if(mode==='lit')return a;
                const m=mode==='unlit'?new T.MeshBasicMaterial({map:a.map,color:a.color,side:a.side}):mode==='clay'?new T.MeshStandardMaterial({color:0x999999,metalness:0,roughness:1,side:a.side}):new T.MeshNormalMaterial({side:a.side});
                temporary.push(m);return m;
              };
              o.material=Array.isArray(original)?original.map(convert):convert(original);
            }
            v.renderer.render(v.scene,v.camera);output.diagnostics[mode]=v.canvas.toDataURL();
          }finally{for(const [o,original] of meshes)o.material=original;for(const m of temporary)m.dispose();}
        }
        output.facts.faceCamera={position:v.camera.position.toArray(),target:v.controls.target.toArray()};
        output.facts.normals=meshes.map(([o])=>{
          const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,seen=new Map();let repeated=0,maxSeamDegrees=0,minLength=Infinity,maxLength=0;
          for(let i=0;i<p.count;i++){
            const v=new T.Vector3().fromBufferAttribute(n,i),length=v.length();minLength=Math.min(minLength,length);maxLength=Math.max(maxLength,length);
            const key=[p.getX(i),p.getY(i),p.getZ(i)].join(',');
            if(seen.has(key)){repeated++;maxSeamDegrees=Math.max(maxSeamDegrees,T.MathUtils.radToDeg(v.angleTo(seen.get(key))));}else seen.set(key,v);
          }
          return {vertices:p.count,triangles:(o.geometry.index?.count||p.count)/3,repeated,minLength,maxLength,maxSeamDegrees};
        });
      }
      mini.dispose();host.remove();return output;
    },id);
    const buffers={};
    for(const key of ['gallery','detail']){buffers[key]=Buffer.from(data[key].split(',')[1],'base64');await fs.writeFile(path.join(OUT,`${id}-${key}.png`),buffers[key]);}
    const a=await sharp(buffers.gallery).removeAlpha().raw().toBuffer(),b=await sharp(buffers.detail).removeAlpha().raw().toBuffer();
    let sum=0,count=0;for(let i=0;i<a.length;i+=3){if(Math.max(...a.subarray(i,i+3),...b.subarray(i,i+3))<20)continue;for(let k=0;k<3;k++)sum+=Math.abs(a[i+k]-b[i+k]);count+=3;}
    const meanChannelDelta=sum/count;
    report.models.push({id,meanChannelDelta,...data.facts});
    if(!baseline){
      assert.deepEqual(data.facts.gallery,data.facts.detail,`${id}: authored material and texture sampling match`);
      assert.deepEqual(data.facts.lights.gallery,data.facts.lights.detail,`${id}: light positions, targets and intensity match`);
      assert.ok(meanChannelDelta<1.5,`${id}: renderer profile delta ${meanChannelDelta}`);
    }
    console.log('ok '+id+' mean RGB channel delta '+meanChannelDelta.toFixed(4));
    await sharp({create:{width:1024,height:512,channels:3,background:'#000'}}).composite([{input:buffers.gallery,left:0,top:0},{input:buffers.detail,left:512,top:0}]).png().toFile(path.join(OUT,id+'-paired.png'));
    if(data.diagnostics){
      const tiles=[];for(const [mode,url] of Object.entries(data.diagnostics)){const input=Buffer.from(url.split(',')[1],'base64');await fs.writeFile(path.join(OUT,`${id}-face-${mode}.png`),input);tiles.push({input,left:tiles.length*512,top:0});}
      await sharp({create:{width:2048,height:512,channels:3,background:'#000'}}).composite(tiles).png().toFile(path.join(OUT,id+'-face-diagnosis.png'));
    }
  }
  assert.equal(report.errors.length,0);
}finally{await browser?.close();servers?.be.kill();servers?.serve.kill();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2));}
