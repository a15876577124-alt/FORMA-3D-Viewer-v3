import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Document,NodeIO} from '@gltf-transform/core';
import sharp from 'sharp';
import {runOps} from '../backend/ops/index.mjs';
import {readDocument,writeDocument} from '../backend/gltfIO.mjs';
import {validateGltf} from '../backend/validateGltf.mjs';
import {importAsset} from '../backend/importAsset.mjs';
import {buildGLB} from '../backend/ops/glbWrite.mjs';
const out=process.env.FORMA_TEST_OUTPUT_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
test('multi-buffer, multi-material, UTF-8 names and texture bindings survive conversion',async()=>{
  const doc=new Document(), scene=doc.createScene('场景');doc.getRoot().setDefaultScene(scene);
  const image=await sharp({create:{width:2,height:2,channels:4,background:'#ea8844'}}).png().toBuffer();
  const tex=doc.createTexture('纹理').setMimeType('image/png').setImage(image);
  for(let i=0;i<2;i++){
    const buffer=doc.createBuffer('buffer'+i);
    const pos=doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
    const uv=doc.createAccessor().setType('VEC2').setArray(new Float32Array([0,0,1,0,0,1])).setBuffer(buffer);
    const mat=doc.createMaterial('材质'+i).setMetallicFactor(i/2).setBaseColorTexture(tex);
    const mesh=doc.createMesh('面'+i).addPrimitive(doc.createPrimitive().setAttribute('POSITION',pos).setAttribute('TEXCOORD_0',uv).setMaterial(mat));
    scene.addChild(doc.createNode('节点'+i).setMesh(mesh).setTranslation([i*3,0,0]));
  }
  const source=path.join(out,'source.gltf');await new NodeIO().write(source,doc);
  assert.equal(JSON.parse(fs.readFileSync(source)).buffers.length,2);
  const glb=await runOps({inPath:source,outDir:path.join(out,'glb'),ops:[{op:'convert',params:{to:'glb'}}]});
  const gltf=await runOps({inPath:glb.outPath,outDir:path.join(out,'gltf'),ops:[{op:'convert',params:{to:'gltf'}}]});
  for(const file of [glb.outPath,gltf.outPath]){assert.equal((await validateGltf(file)).issues.numErrors,0);const d=await readDocument(file);assert.equal(d.getRoot().listMaterials().length,2);assert.deepEqual(Buffer.from(d.getRoot().listTextures()[0].getImage()),image);assert.equal(d.getRoot().listMeshes()[1].listPrimitives()[0].getMaterial().getName(),'材质1');}
  const obj=await runOps({inPath:glb.outPath,outDir:path.join(out,'obj'),ops:[{op:'convert',params:{to:'obj'}}]});
  const text=fs.readFileSync(obj.outPath,'utf8');assert.match(text,/mtllib model.mtl/);assert.match(text,/v 3 0 0/);assert.match(text,/f 4\/4 5\/5 6\/6/);assert.match(fs.readFileSync(path.join(out,'obj/model.mtl'),'utf8'),/map_Kd/);
});
test('malicious package references and collisions are rejected before writes',async()=>{
  const j=JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'../private.bin',byteLength:1}]});
  assert.throws(()=>importAsset('escape.gltf',Buffer.from(j),[{name:'../private.bin',dataBase64:'AA=='}]));
  const p=path.join(out,'escape.gltf');fs.writeFileSync(p,j);await assert.rejects(()=>readDocument(p));
  assert.throws(()=>importAsset('duplicate.gltf',Buffer.from(j),[{name:'texture.png',dataBase64:'AA=='},{name:'TEXTURE.png',dataBase64:'AA=='}]));
});
test('GLB container accepts UTF-8 without corrupting byte alignment',()=>{const b=buildGLB({asset:{version:'2.0',generator:'琼剧'}},Buffer.alloc(0));assert.equal(b.readUInt32LE(8),b.length);assert.equal(b.length%4,0);});

test('version ancestry and concurrent tasks never overwrite',async()=>{
  const {runAssetPipeline}=await import('../backend/runPipeline.mjs');
  const original=fs.readFileSync(path.join(out,'glb/model.glb'));
  const asset=importAsset('version-fixture.glb',original);
  const ops=[{op:'dedup',params:{}}];
  const first=await runAssetPipeline({assetId:asset.id,ops});
  const pair=await Promise.all([runAssetPipeline({assetId:asset.id,baseVersion:first.version,ops}),runAssetPipeline({assetId:asset.id,baseVersion:first.version,ops})]);
  assert.notEqual(pair[0].version,pair[1].version);
  for(const r of pair){assert.equal(r.beforePath,first.afterPath);assert.equal(r.baseVersion,first.version);const m=JSON.parse(fs.readFileSync(path.join(process.cwd(),r.outDir,'version.json')));assert.equal(m.status,'complete');}
  assert.deepEqual(fs.readFileSync(path.join(process.cwd(),'backend/workspace',asset.originalRelPath)),original);
});
