// Narrow, evidenced Blender FBX adapter. No geometry re-import or vendor-loader fork.
// Blender 2.93 export_fbx_bin.py: roughness -> ShininessExponent, metalness ->
// ReflectionFactor, alpha texture -> TransparencyFactor. Other exporters stay explicit.
import fs from 'node:fs';
import sharp from 'sharp';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {parseTree,findAll,readVersion} from './fbxTree.mjs';
import {detectFbxTexturesDetailed} from './fbxTextures.mjs';

const value=(n,key)=>n.children.find(c=>c.name===key)?.props[0]?.value;
const name=n=>String(n.props[1]?.value||'').split('\0')[0].replace(/^Material::/,'');
const props=n=>Object.fromEntries((n.children.find(c=>c.name==='Properties70')?.children||[]).map(c=>[String(c.props[0]?.value),c.props.slice(4).map(p=>p.value)]));
const MAP={DiffuseColor:'baseColor',NormalMap:'normal',Shininess:'roughness',ShininessExponent:'roughness',ReflectionFactor:'metallic',TransparencyFactor:'alpha',EmissiveColor:'emissive'};

function inspect(buf,baseDir){
  if(!readVersion(buf))return {creator:'ASCII / unknown',materials:[],channels:[],warnings:['ASCII FBX 材质通道保留原加载器行为，尚未完成逐通道映射。']};
  const {tree}=parseTree(buf), creator=String(findAll(tree,'Creator')[0]?.props[0]?.value||'unknown');
  const blender=/Blender .*2\.93\./.test(creator);
  const links=findAll(tree,'Connections').flatMap(n=>n.children.map(c=>c.props.map(p=>typeof p.value==='bigint'?String(p.value):p.value)));
  const textures=new Map(findAll(tree,'Texture').map(n=>[String(n.props[0].value),n]));
  const images=new Map(detectFbxTexturesDetailed(buf,{baseDir}).map(t=>[t.id,t]));
  const materials=findAll(tree,'Material').map(n=>({id:String(n.props[0].value),name:name(n),properties:props(n)}));
  const channels=[];
  for(const m of materials){
    const visited=new Set();
    for(const [type,textureId,materialId,property]of links){
      if(type!=='OP'||materialId!==m.id||!textures.has(textureId))continue;
      const texture=textures.get(textureId),videoId=links.find(l=>l[0]==='OO'&&l[2]===textureId&&images.has(l[1]))?.[1],image=images.get(videoId);
      const channel=MAP[property]||property;
      if(visited.has(textureId+'|'+channel))continue;visited.add(textureId+'|'+channel);
      const tp=props(texture);
      const transform=['Translation','Rotation','Scaling'].some(k=>{const a=texture.children.find(n=>n.name==='ModelUV'+k)?.props.map(p=>p.value)||tp[k];return Array.isArray(a)&&a.some(v=>Number(v)!==(k==='Scaling'?1:0));});
      const supported=blender&&!!MAP[property]&&!transform;
      channels.push({material:m.name,materialId:m.id,textureId,property,channel,source:image?.source||'missing',sourceName:image?.name||String(value(texture,'RelativeFilename')||''),sha256:image?.sha256||null,
        status:!image||image.source==='missing'?'missing-resource':!supported?'unsupported':'pending',
        outputMaterial:m.name,outputChannel:MAP[property]||null,conversion:supported?'Blender 2.93 connection semantics':'No speculative mapping',
        risk:!blender?'Exporter has not been qualified':transform?'Non-default texture transform requires dedicated mapping':!MAP[property]?'No glTF equivalent implemented':null,
        image});
    }
  }
  return {creator,blender,materials,channels,warnings:blender?[]:['仅对已核实 Blender 2.93 导出语义应用 PBR 通道映射；其他导出器保持原加载行为。']};
}
export function inspectFbxMaterials(buf,{baseDir}={}){
  const data=inspect(buf,baseDir);return {...data,channels:data.channels.map(({image,...r})=>r)};
}

export async function restoreFbxMaterials(glb,fbx,{baseDir}={}){
  const report=inspect(fbx,baseDir);
  if(!report.blender)return {bytes:glb,report:inspectFbxMaterials(fbx,{baseDir})};
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).setAllowNetwork(false),doc=await io.readBinary(glb);
  async function pixels(row){
    const t=row.image,bytes=t.content||fs.readFileSync(t.resolvedPath);
    return sharp(bytes,{limitInputPixels:16777216}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  }
  const make=(label,bytes)=>doc.createTexture(label).setImage(bytes).setMimeType('image/png');
  for(const m of report.materials){
    const rows=report.channels.filter(r=>r.materialId===m.id),matches=doc.getRoot().listMaterials().filter(t=>t.getName()===m.name);
    if(matches.length!==1){for(const r of rows){r.status='unsupported';r.risk='Material name is not uniquely bound to output';}continue;}
    const mat=matches[0],get=c=>rows.find(r=>r.channel===c&&r.status==='pending');
    const base=get('baseColor'),alpha=get('alpha');
    if(base||alpha){
      const b=base?await pixels(base):null,a=alpha?await pixels(alpha):null;
      if(a&&b&&(a.info.width!==b.info.width||a.info.height!==b.info.height)){
        alpha.status='unsupported';alpha.risk='Alpha/base dimensions differ; resampling not silently applied';
      }
      const src=b||a,rgba=b?Buffer.from(b.data):Buffer.alloc(src.data.length,255);
      if(alpha?.status==='pending'){for(let i=0;i<rgba.length;i+=4)rgba[i+3]=Math.round(rgba[i+3]*a.data[i]/255);mat.setAlphaMode('BLEND');alpha.status='channel-packed';alpha.outputChannel='baseColor.A';alpha.conversion='Source alpha scalar (R) packed into baseColor A; Blender alpha texture is not inverted';}
      const out=await sharp(rgba,{raw:{width:src.info.width,height:src.info.height,channels:4}}).png().toBuffer();
      mat.setBaseColorTexture(make(m.name+'-base-alpha',out));
      if(base){base.status=alpha?.status==='channel-packed'?'channel-packed':'exact';base.outputChannel='baseColor.RGB';base.conversion='Source RGB bytes preserved, no color-space baking';}
    }
    const rough=get('roughness'),metal=get('metallic');
    if(rough||metal){
      const r=rough?await pixels(rough):null,t=metal?await pixels(metal):null;
      if(r&&t&&(r.info.width!==t.info.width||r.info.height!==t.info.height)){
        for(const c of [rough,metal]){c.status='unsupported';c.risk='Roughness/metalness dimensions differ; no implicit resampling';}
      }else{
        const src=r||t,rgba=Buffer.alloc(src.data.length,255);
        for(let i=0;i<rgba.length;i+=4){rgba[i+1]=r?r.data[i]:255;rgba[i+2]=t?t.data[i]:0;}
        mat.setMetallicRoughnessTexture(make(m.name+'-metal-rough',await sharp(rgba,{raw:{width:src.info.width,height:src.info.height,channels:4}}).png().toBuffer()));
        mat.setRoughnessFactor(1).setMetallicFactor(1);
        for(const c of [rough,metal].filter(Boolean)){c.status='channel-packed';c.outputChannel=c===rough?'metallicRoughness.G':'metallicRoughness.B';c.conversion='Source scalar R copied byte-for-byte; no gamma conversion';}
      }
    }
    for(const channel of ['normal','emissive']){
      const row=get(channel);if(!row)continue;
      const p=await pixels(row),out=make(m.name+'-'+channel,await sharp(p.data,{raw:{width:p.info.width,height:p.info.height,channels:4}}).png().toBuffer());
      if(channel==='normal')mat.setNormalTexture(out);
      else{mat.setEmissiveTexture(out);if(mat.getEmissiveFactor().every(v=>v===0))mat.setEmissiveFactor([1,1,1]);}
      row.status=channel==='normal'?'exact':'approximate';row.conversion=channel==='normal'?'RGB normal map preserved':'RGB retained; missing exporter emission strength uses 1';
    }
    for(const row of rows)if(row.status==='pending'){row.status='unsupported';row.risk='Unresolved channel';}
  }
  for(const t of doc.getRoot().listTextures())if(t.listParents().every(p=>p.propertyType==='Root'))t.dispose();
  report.channels=report.channels.map(({image,...r})=>r);
  report.warnings.push('逐通道映射不等于原创作软件渲染无损；透明混合、自发光强度与 Phong/PBR 光照存在语义差异。');
  return {bytes:Buffer.from(await io.writeBinary(doc)),report};
}
