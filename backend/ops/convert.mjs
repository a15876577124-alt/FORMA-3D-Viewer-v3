// GLB / GLTF use the installed glTF Transform IO. OBJ explicitly loses PBR.
import fs from 'node:fs';
import path from 'node:path';
import {Vector3, Matrix3, Matrix4} from 'three';
import {readDocument,writeDocument} from '../gltfIO.mjs';
import {sha256} from '../../tools/glbkit.mjs';
async function toObj(doc,outPath) {
  const stem=path.basename(outPath,'.obj'), dir=path.dirname(outPath);
  const files=[path.basename(outPath),stem+'.mtl'], lines=['# FORMA OBJ; PBR/animation not representable','mtllib '+stem+'.mtl'], mtl=[];
  const mats=doc.getRoot().listMaterials();
  for(const [i,m] of mats.entries()) {
    mtl.push('newmtl material_'+i,'Kd '+m.getBaseColorFactor().slice(0,3).join(' '),'d '+m.getBaseColorFactor()[3]);
    const t=m.getBaseColorTexture();
    if(t){const name=stem+'-color-'+i+'.'+(t.getMimeType()==='image/jpeg'?'jpg':t.getMimeType().split('/')[1]);fs.writeFileSync(path.join(dir,name),t.getImage());files.push(name);mtl.push('map_Kd '+name);}
  }
  let vOffset=1,uvOffset=1,nOffset=1;
  const scene=doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0];
  scene?.traverse(node=>{
    const matrix=new Matrix4().fromArray(node.getWorldMatrix()),normalMatrix=new Matrix3().getNormalMatrix(matrix);
    for(const p of node.getMesh()?.listPrimitives()||[]){
      if(p.getMode()!==4)throw Error('OBJ 导出目前仅支持三角形');
      if(p.listTargets().length||node.getSkin())throw Error('OBJ 无法保留蒙皮和形变；请选择 GLB/GLTF');
      const pos=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0'),normal=p.getAttribute('NORMAL'),idx=p.getIndices();
      lines.push('o mesh_'+vOffset,'usemtl material_'+mats.indexOf(p.getMaterial()));
      for(let i=0;i<pos.getCount();i++){const v=new Vector3().fromArray(pos.getElement(i,[])).applyMatrix4(matrix);lines.push('v '+v.toArray().join(' '));}
      if(uv)for(let i=0;i<uv.getCount();i++)lines.push('vt '+uv.getElement(i,[]).join(' '));
      if(normal)for(let i=0;i<normal.getCount();i++)lines.push('vn '+new Vector3().fromArray(normal.getElement(i,[])).applyNormalMatrix(normalMatrix).toArray().join(' '));
      const count=idx?idx.getCount():pos.getCount();
      for(let i=0;i<count;i+=3){let ids=[0,1,2].map(k=>idx?idx.getScalar(i+k):i+k);if(matrix.determinant()<0)ids.reverse();lines.push('f '+ids.map(v=>String(v+vOffset)+(uv||normal?'/'+(uv?v+uvOffset:'')+(normal?'/'+(v+nOffset):''):'')).join(' '));}
      vOffset+=pos.getCount();uvOffset+=uv?.getCount()||0;nOffset+=normal?.getCount()||0;
    }
  });
  fs.writeFileSync(outPath,lines.join('\n')+'\n');fs.writeFileSync(path.join(dir,stem+'.mtl'),mtl.join('\n')+'\n');return files;
}
export const convertOps={convert:{appearance:true,async run({inPath,outPath,params}){
  if(!/\.(glb|gltf)$/i.test(inPath)) throw Object.assign(new Error('请先在 Studio 将 OBJ/FBX 转为可处理 GLB 版本'),{status:415});
  if(!['glb','gltf','obj'].includes(params.to))throw Object.assign(new Error('不支持的导出格式'),{status:400});
  const doc=await readDocument(inPath);
  const files=params.to==='obj'?await toObj(doc,outPath):await writeDocument(doc,outPath);
  return {metrics:{bytes:fs.statSync(outPath).size,sourceSha256:sha256(fs.readFileSync(inPath)),files},changes:['convert -> '+params.to+': '+files.join(', ')],warnings:params.to==='obj'?['OBJ 不支持 PBR 与动画；贴图与基础颜色保留']:[]};
}}};
