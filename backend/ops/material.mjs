import {readDocument,writeDocument} from '../gltfIO.mjs';
import {KHRMaterialsEmissiveStrength} from '@gltf-transform/extensions';
export const materialOps={setMaterial:{appearance:true,async run({inPath,outPath,params:p}){
  const doc=await readDocument(inPath),mat=doc.getRoot().listMaterials()[p.materialIndex];
  if(!mat)throw Object.assign(new Error('材质索引不存在'),{status:400});
  mat.setBaseColorFactor([p.colorR,p.colorG,p.colorB,p.opacity]).setMetallicFactor(p.metallicFactor).setRoughnessFactor(p.roughnessFactor).setAlphaMode(p.alphaMode).setDoubleSided(p.doubleSided);
  mat.setExtension('KHR_materials_emissive_strength',doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(p.emissiveStrength));
  await writeDocument(doc,outPath);return {changes:['材质 '+p.materialIndex+' 已保存，保留几何及贴图关联'],metrics:{materialIndex:p.materialIndex}};
}}};
