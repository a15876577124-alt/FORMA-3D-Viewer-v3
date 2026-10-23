import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test.mjs';
import sharp from 'sharp';
import {makeFaceCandidate} from './make-face-candidate.mjs';
import {startTestServers} from './test-servers.mjs';
const OUT=process.env.FORMA_TEST_OUTPUT_DIR;
assert.equal(process.cwd(),process.env.FORMA_TEST_ISOLATED_ROOT);
let browser,servers;
try {
  const target=path.join(process.cwd(),'test-out/face-candidate/dan-cheek-depth-v1.glb');
  const report=await makeFaceCandidate(target);
  await fs.copyFile(target,path.join(OUT,'dan-cheek-depth-v1.glb'));
  const candidate=(await fs.readFile(target)).toString('base64');
  servers=await startTestServers();browser=await launchBrowser();const page=await browser.newPage();
  await page.setViewport({width:1200,height:900});
  await page.goto(servers.BASE+'/#/gallery?work=dan',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__FORMA?.viewer.modelRoot);
  const data=await page.evaluate(async candidate=>{
    const T=await import('/vendor/three/build/three.module.js'),{applyView,normalizeModel}=await import('/src/models/place.js');
    const {loadGLTF}=await import('/src/loaders/importers.js');
    const derived=(await loadGLTF(new File([Uint8Array.fromBase64(candidate)],'dan-cheek-depth-v1.glb'))).root;normalizeModel(derived);
    const v=window.__FORMA.viewer;cancelAnimationFrame(v.frame);v.controls.autoRotate=false;v.controls.enableDamping=false;
    v.viewport.style.cssText='position:fixed;left:0;top:0;width:512px;height:512px;z-index:10000';v.applyResize();v.renderer.setPixelRatio(1);v.renderer.setSize(512,512,false);
    v.post.active=false;v.renderer.shadowMap.enabled=false;v.setToneMapping('neutral');v.setExposure(1);v.setEnvIntensity(.85);v.lighting.setMode('studio');v.lighting.fitTo(v.box);
    v.scene.children.forEach(o=>{o.visible=o===v.modelRoot||o===v.lighting.group;});v.scene.background=new T.Color(0);v.camera.aspect=1;v.camera.updateProjectionMatrix();
    applyView(v.camera,v.controls,v.box,{yaw:1.72,pitch:.15,distMul:.42,targetYMul:.59},1.12);v.renderer.render(v.scene,v.camera);
    v.scene.add(derived);const original=v.modelRoot,images=[],conditions=[];
    for(const distance of ['normal','close'])for(const angle of ['front','oblique'])for(const material of ['authored','clay']){
      applyView(v.camera,v.controls,v.box,{yaw:angle==='front'?Math.PI/2:1.95,pitch:.15,distMul:distance==='normal'?1:.45,targetYMul:distance==='normal'?.5:.54},1.12);
      const key=[distance,angle,material].join('-'),pair={key};
      for(const [label,root] of [['before',original],['candidate',derived]]){
        original.visible=root===original;derived.visible=root===derived;const stored=[],temporary=[];
        if(material==='clay')root.traverse(o=>{if(o.isMesh){stored.push([o,o.material]);const m=new T.MeshStandardMaterial({color:0x999999,metalness:0,roughness:1,side:o.material.side});temporary.push(m);o.material=m;}});
        v.renderer.render(v.scene,v.camera);pair[label]=v.canvas.toDataURL();
        for(const [o,m] of stored)o.material=m;for(const m of temporary)m.dispose();
      }
      conditions.push({key,camera:v.camera.position.toArray(),target:v.controls.target.toArray(),exposure:v.renderer.toneMappingExposure,toneMapping:v.renderer.toneMapping});images.push(pair);
    }
    return {images,conditions};
  },candidate);
  for(const pair of data.images){
    const before=Buffer.from(pair.before.split(',')[1],'base64'),after=Buffer.from(pair.candidate.split(',')[1],'base64');
    await fs.writeFile(path.join(OUT,pair.key+'-before.png'),before);await fs.writeFile(path.join(OUT,pair.key+'-candidate.png'),after);
    await sharp({create:{width:1024,height:512,channels:3,background:'#000'}}).composite([{input:before,left:0,top:0},{input:after,left:512,top:0}]).png().toFile(path.join(OUT,pair.key+'-paired.png'));
  }
  await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({...report,conditions:data.conditions,render:'Actual Edge, 512x512 DPR1 MSAA. Same camera, scene, lighting, exposure, environment and authored materials; only geometry and affected normals differ.'},null,2));
  console.log(JSON.stringify({changedVertices:report.changedVertices,maxDisplacement:report.maxDisplacement,flips:report.flippedTriangles,pairs:data.images.length}));

}finally{await browser?.close();servers?.be.kill();servers?.serve.kill();}
