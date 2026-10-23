// Local art experiment, never a runtime modifier. Preserve Original and portfolio-v1.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {BufferGeometry,BufferAttribute,Vector3} from 'three';
import validator from 'gltf-validator';
import {parseGLB,readAccessor} from './glbkit.mjs';
import {computeWeldedNormals} from '../src/loaders/normals.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
export async function makeFaceCandidate(target) {
  const relative=path.relative(process.cwd(),path.resolve(target));
  assert.ok(relative.startsWith('test-out'+path.sep),'experiment output must stay in test-out');
  const source=await fs.readFile('assets/portfolio-v1/dan.glb'),{json,bin}=parseGLB(source);
  const original=structuredClone(json);json.__bin=bin;
  const prim=json.meshes[0].primitives[0],p=readAccessor(json,prim.attributes.POSITION).data,
    indices=readAccessor(json,prim.indices).data,n=readAccessor(json,prim.attributes.NORMAL).data;
  const groups=[],lookup=new Map(),groupOf=[];
  for(let i=0;i<p.length/3;i++){
    const xyz=Array.from(p.slice(i*3,i*3+3)),key=xyz.join(',');
    if(!lookup.has(key)){lookup.set(key,groups.length);groups.push({xyz,vertices:[],neighbors:new Set()});}
    const g=lookup.get(key);groupOf[i]=g;groups[g].vertices.push(i);
  }
  for(let i=0;i<indices.length;i+=3){
    const triangle=[...indices.slice(i,i+3)].map(v=>groupOf[v]);
    for(const a of triangle)for(const b of triangle)if(a!==b)groups[a].neighbors.add(b);
  }
  // Ray-picked outer cheek, below the eyelid and away from mouth/silhouette.
  // Only depth (X) moves: Y/Z, topology, UVs, texture and material bindings stay exact.
  const region={center:[.044,-.009,-.031],radiiYZ:[.008,.008],frontMinX:.035,iterations:2,strength:.35,maxDepth:.00035};
  const weights=groups.map(({xyz:[x,y,z]})=>{
    const r2=((y-region.center[1])/region.radiiYZ[0])**2+((z-region.center[2])/region.radiiYZ[1])**2;
    return x>region.frontMinX&&r2<1?(1-r2)**2:0;
  });
  let depth=groups.map(g=>g.xyz[0]);
  for(let iteration=0;iteration<region.iterations;iteration++)depth=depth.map((x,i)=>{
    if(!weights[i])return x;
    const neighbors=[...groups[i].neighbors],mean=neighbors.reduce((s,j)=>s+depth[j],0)/neighbors.length;
    const delta=x+region.strength*weights[i]*(mean-x)-groups[i].xyz[0];
    return groups[i].xyz[0]+Math.max(-region.maxDepth,Math.min(region.maxDepth,delta));
  });
  const positions=new Float32Array(p),changed=new Set();let maxDisplacement=0,sumDisplacement=0;
  for(let i=0;i<groups.length;i++)if(weights[i])for(const v of groups[i].vertices){
    positions[v*3]=depth[i];const distance=Math.abs(positions[v*3]-p[v*3]);
    if(distance){changed.add(v);maxDisplacement=Math.max(maxDisplacement,distance);sumDisplacement+=distance;}
  }
  assert.ok(changed.size>0&&changed.size<p.length/3*.02,'strictly local edit under 2% of vertices');
  const affected=new Set(),faceNormal=(a,b,c,P)=>new Vector3().fromArray(P,b*3).sub(new Vector3().fromArray(P,a*3)).cross(new Vector3().fromArray(P,c*3).sub(new Vector3().fromArray(P,a*3)));
  let flips=0,minAreaRatio=Infinity;
  for(let i=0;i<indices.length;i+=3){const tri=[...indices.slice(i,i+3)];if(!tri.some(v=>changed.has(v)))continue;
    for(const v of tri)for(const duplicate of groups[groupOf[v]].vertices)affected.add(duplicate);
    const before=faceNormal(...tri,p),after=faceNormal(...tri,positions);
    if(before.dot(after)<=0)flips++;minAreaRatio=Math.min(minAreaRatio,after.length()/before.length());
  }
  assert.equal(flips,0);assert.ok(minAreaRatio>.8,'no collapsed local triangle');
  const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(positions,3));g.setIndex(new BufferAttribute(new Uint32Array(indices),1));computeWeldedNormals(g);
  const normals=new Float32Array(n);for(const v of affected)normals.set(g.attributes.normal.array.subarray(v*3,v*3+3),v*3);g.dispose();
  // Append new attributes; preserve the entire old binary, including UV/image bytes.
  const parts=[pad(bin)];let offset=parts[0].length;
  for(const [name,data] of [['POSITION',positions],['NORMAL',normals]]){
    const bytes=Buffer.from(data.buffer),view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962})-1;
    const accessor={bufferView:view,componentType:5126,count:data.length/3,type:'VEC3'};
    if(name==='POSITION'){
      accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<data.length;i++){accessor.min[i%3]=Math.min(accessor.min[i%3],data[i]);accessor.max[i%3]=Math.max(accessor.max[i%3],data[i]);}
    }
    json.accessors[prim.attributes[name]]=accessor;parts.push(bytes);offset+=bytes.length;
  }
  delete json.__bin;json.buffers[0].byteLength=offset;
  json.asset.extras={...json.asset.extras,formaLocalTrial:{source:'assets/portfolio-v1/dan.glb',sha256:sha(source),region,approvedForDisplay:false}};
  const j=Buffer.from(JSON.stringify(json)),jb=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),binary=Buffer.concat(parts),header=Buffer.alloc(20),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+binary.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
  const output=Buffer.concat([header,jb,bh,binary]),parsed=parseGLB(output);assert.deepEqual(parsed.bin.subarray(0,bin.length),bin);assert.deepEqual(parsed.json.materials,original.materials);
  assert.deepEqual(parsed.json.textures,original.textures);assert.deepEqual(parsed.json.images,original.images);
  assert.deepEqual(parsed.json.accessors[prim.attributes.TEXCOORD_0],original.accessors[prim.attributes.TEXCOORD_0]);
  const validation=await validator.validateBytes(new Uint8Array(output),{maxIssues:50});assert.equal(validation.issues.numErrors,0);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,output,{flag:'wx'});
  const report={sourceSha256:sha(source),candidateSha256:sha(output),region,vertices:p.length/3,triangles:indices.length/3,changedVertices:changed.size,updatedNormals:affected.size,maxDisplacement,meanDisplacement:sumDisplacement/changed.size,flippedTriangles:flips,minAreaRatio,validator:validation.issues,unchanged:['all original binary bytes','UV coordinates','indices','Y and Z coordinates','materials','textures','images','normals outside affected triangles'],approvedForDisplay:false};
  await fs.writeFile(target+'.json',JSON.stringify(report,null,2));return report;
}
