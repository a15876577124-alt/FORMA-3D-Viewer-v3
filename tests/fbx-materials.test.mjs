import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseTree,serializeTree,findAll} from '../backend/fbxTree.mjs';
import {inspectFbxMaterials,restoreFbxMaterials} from '../backend/fbxMaterials.mjs';
import {NodeIO} from '@gltf-transform/core';
const fbx=fs.readFileSync('test-assets/licensed/blender-embedded.fbx');
test('qualified fixture reports five semantic connections, not just five images',()=>{
  const r=inspectFbxMaterials(fbx);assert.equal(r.blender,true);assert.deepEqual(r.channels.map(c=>c.channel).sort(),['alpha','baseColor','emissive','metallic','roughness']);assert.ok(!JSON.stringify(r).includes('D:\\Dev'));
});
test('unknown exporter never receives Blender-specific material reinterpretation',async()=>{
  const t=parseTree(fbx);for(const n of findAll(t.tree,'Creator'))n.props[0].value='Unqualified exporter';
  const input=fs.readFileSync('test-assets/licensed/Avocado.glb');const out=await restoreFbxMaterials(input,serializeTree(t));
  assert.deepEqual(out.bytes,input);assert.ok(out.report.channels.every(c=>c.status==='unsupported'));
});
test('non-default UV transform is reported unsupported instead of silently flattened',()=>{
  const t=parseTree(fbx),tex=findAll(t.tree,'Texture')[0];tex.children.push({name:'ModelUVTranslation',props:[{type:'D',value:0.5},{type:'D',value:0}],children:[]});
  const r=inspectFbxMaterials(serializeTree(t));assert.equal(r.channels.find(c=>c.channel==='baseColor').status,'unsupported');
});

test('unsupported base mapping cannot be replaced by white when packing alpha',async()=>{
  const t=parseTree(fbx),tex=findAll(t.tree,'Texture')[0];tex.children.push({name:'ModelUVTranslation',props:[{type:'D',value:0.5},{type:'D',value:0}],children:[]});
  const io=new NodeIO(),doc=await io.readBinary(fs.readFileSync('test-assets/licensed/Avocado.glb'));
  const mat=doc.getRoot().listMaterials()[0];mat.setName(inspectFbxMaterials(fbx).materials[0].name);
  const original=Buffer.from(mat.getBaseColorTexture().getImage());
  const out=await restoreFbxMaterials(await io.writeBinary(doc),serializeTree(t));
  const result=await io.readBinary(out.bytes);
  assert.deepEqual(Buffer.from(result.getRoot().listMaterials()[0].getBaseColorTexture().getImage()),original);
  assert.equal(out.report.channels.find(c=>c.channel==='alpha').status,'unsupported');
});
