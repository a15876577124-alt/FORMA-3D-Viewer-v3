// Non-destructive exhibition derivative. Geometry, UVs, texture bytes and materials
// remain identical; only normals change. Never writes assets/raw or assets/models.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { BufferGeometry, BufferAttribute } from 'three';
import { parseGLB, readAccessor } from './glbkit.mjs';
import { computeWeldedNormals } from '../src/loaders/normals.js';
import validator from 'gltf-validator';

const out = path.resolve('assets/exhibition-v1');
const ids = ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pad = (b, value = 0) => Buffer.concat([b, Buffer.alloc((4-b.length%4)%4, value)]);
function glb(json, bin) {
  const j = pad(Buffer.from(JSON.stringify(json)), 32), b = pad(bin);
  const h = Buffer.alloc(20); h.writeUInt32LE(0x46546c67); h.writeUInt32LE(2,4); h.writeUInt32LE(28+j.length+b.length,8); h.writeUInt32LE(j.length,12); h.writeUInt32LE(0x4e4f534a,16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length); bh.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([h,j,bh,b]);
}
function seams(p, n) {
  const groups = new Map();
  for (let i=0;i<p.length;i+=3) {
    const key = [p[i],p[i+1],p[i+2]].join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  let discontinuities=0, maxAngle=0;
  for (const group of groups.values()) {
    let max=0;
    for (const a of group) for (const b of group) {
      const cosine = (n[a]*n[b]+n[a+1]*n[b+1]+n[a+2]*n[b+2])/(Math.hypot(n[a],n[a+1],n[a+2])*Math.hypot(n[b],n[b+1],n[b+2])||1);
      max=Math.max(max,Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI);
    }
    if(max>5)discontinuities++;
    maxAngle=Math.max(maxAngle,max);
  }
  return { positionGroups:groups.size, discontinuitiesOver5Degrees:discontinuities, maxAngle:+maxAngle.toFixed(3) };
}
await fs.mkdir(out, {recursive:true});
const report=[];
for (const id of ids) {
  const source = await fs.readFile(`assets/models/${id}.glb`), {json,bin} = parseGLB(source);
  const original = structuredClone(json), parts = [pad(bin)]; let offset=parts[0].length;
  const primReports=[];
  json.__bin=bin;
  for (const mesh of json.meshes) for (const prim of mesh.primitives) {
    const p=readAccessor(json,prim.attributes.POSITION), index=readAccessor(json,prim.indices), before=readAccessor(json,prim.attributes.NORMAL);
    const g=new BufferGeometry(); g.setAttribute('position',new BufferAttribute(p.data,3)); g.setIndex(new BufferAttribute(index.data,1));
    const welded=computeWeldedNormals(g), n=g.attributes.normal.array;
    const bytes=Buffer.from(n.buffer,n.byteOffset,n.byteLength);
    const bv=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962})-1;
    json.accessors[prim.attributes.NORMAL]={bufferView:bv,componentType:5126,count:p.count,type:'VEC3'};
    parts.push(bytes);offset+=bytes.length;
    primReports.push({vertices:p.count,triangles:index.count/3,...welded,before:seams(p.data,before.data),after:seams(p.data,n)});
    g.dispose();
  }
  delete json.__bin; json.buffers[0].byteLength=offset;
  json.asset.extras={...json.asset.extras,formaDerivative:{source:`assets/models/${id}.glb`,sha256:sha(source),operation:'position-welded area-weighted normals',version:1}};
  const output=glb(json,Buffer.concat(parts)), parsed=parseGLB(output);
  assert.deepEqual(parsed.bin.subarray(0,bin.length),bin,'original geometry/UV/image buffer bytes must be preserved');
  assert.deepEqual(parsed.json.materials,original.materials);
  const validation=await validator.validateBytes(new Uint8Array(output),{maxIssues:50});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
  // Idempotent regeneration is allowed only when bytes are already identical.
  const target=path.join(out,id+'.glb');
  try { assert.equal(sha(await fs.readFile(target)),sha(output),'existing derivative differs; use a new version directory'); }
  catch(e) { if(e.code==='ENOENT') await fs.writeFile(target,output,{flag:'wx'});else throw e; }
  const baselineValidation=await validator.validateBytes(new Uint8Array(source),{maxIssues:50});
  report.push({id,sourceSha256:sha(source),outputSha256:sha(output),materials:original.materials,primitives:primReports,validator:{sourceErrors:baselineValidation.issues.numErrors,errors:validation.issues.numErrors,warnings:validation.issues.numWarnings}});
  console.log(id,JSON.stringify(primReports));
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({operation:'Normals only; all original buffer bytes and material definitions preserved.',models:report},null,2)+'\n');
