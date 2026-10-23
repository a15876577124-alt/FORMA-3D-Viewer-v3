import fs from 'node:fs';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {readDocument} from '../backend/gltfIO.mjs';
import {detectFbxTexturesDetailed} from '../backend/fbxTextures.mjs';

// Independent acceptance of the licensed fixture: inspect output bindings AND pixel values.
export async function checkFbxChannels(file,fixture){
  const source=detectFbxTexturesDetailed(fs.readFileSync(fixture));
  const decode=bytes=>sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const original=async suffix=>decode(source.find(t=>t.name.endsWith(suffix)).content);
  const doc=await readDocument(file),mat=doc.getRoot().listMaterials()[0];
  assert.ok(mat.getBaseColorTexture());assert.ok(mat.getMetallicRoughnessTexture());assert.ok(mat.getEmissiveTexture());
  assert.equal(mat.getAlphaMode(),'BLEND');assert.equal(mat.getRoughnessFactor(),1);assert.equal(mat.getMetallicFactor(),1);
  const base=await decode(mat.getBaseColorTexture().getImage()),mr=await decode(mat.getMetallicRoughnessTexture().getImage()),em=await decode(mat.getEmissiveTexture().getImage());
  const [diffuse,alpha,rough,metal,emissive]=await Promise.all(['diffuse.png','weight.png','roughness.png','metallic.png','emissive.png'].map(original));
  assert.equal(base.data.length,diffuse.data.length);assert.equal(mr.data.length,rough.data.length);
  for(let i=0;i<base.data.length;i+=4){
    for(let c=0;c<3;c++){assert.equal(base.data[i+c],diffuse.data[i+c],'base RGB');assert.equal(em.data[i+c],emissive.data[i+c],'emissive RGB');}
    assert.equal(base.data[i+3],Math.round(diffuse.data[i+3]*alpha.data[i]/255),'alpha A');
    assert.equal(mr.data[i+1],rough.data[i],'roughness G');assert.equal(mr.data[i+2],metal.data[i],'metalness B');
  }
  return {pixels:base.data.length/4,sourceImages:source.length,boundImages:doc.getRoot().listTextures().length,channels:['baseColor.RGB','baseColor.A','metallicRoughness.G','metallicRoughness.B','emissive.RGB'],pixelEquality:true,shadingLossless:false};
}
