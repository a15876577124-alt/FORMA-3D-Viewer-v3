import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {BufferGeometry,BufferAttribute} from 'three';
import validator from 'gltf-validator';
import {parseGLB,readAccessor} from './glbkit.mjs';
import {computeWeldedNormals} from '../src/loaders/normals.js';
import {FIGURINES} from '../src/models/catalog.js';
const manifest=JSON.parse(await fs.readFile('assets/portfolio-v1/manifest.json','utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const geometry=new BufferGeometry();
geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0, 0,0,0,0,1,0,0,0,1]),3));
geometry.setAttribute('uv',new BufferAttribute(new Float32Array([0,0,1,0,0,1, .5,.5,.8,.5,.5,.8]),2));
const positions=geometry.attributes.position.array.slice(),uv=geometry.attributes.uv.array.slice();
computeWeldedNormals(geometry);
for(const i of [0,2,3,4]){
  const n=geometry.attributes.normal;
  assert.ok(Math.abs(n.getX(i)-Math.SQRT1_2)<1e-6);
  assert.ok(Math.abs(n.getZ(i)-Math.SQRT1_2)<1e-6);
}
assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.attributes.uv.array,uv);geometry.dispose();
console.log('ok duplicated UV-border vertices share area-weighted normals without welding geometry or UVs');
for(const e of FIGURINES){
  const source=await fs.readFile(`assets/models/${e.id}.glb`),output=await fs.readFile(e.file),a=parseGLB(source),b=parseGLB(output);
  const record=manifest.models.find(m=>m.id===e.id);
  assert.equal(sha(source),record.sourceSha256);assert.equal(sha(output),record.outputSha256);
  assert.deepEqual(b.bin.subarray(0,a.bin.length),a.bin);assert.deepEqual(b.json.materials,a.json.materials);
  const p=b.json.meshes[0].primitives[0];b.json.__bin=b.bin;
  assert.equal(readAccessor(b.json,p.attributes.POSITION).count,e.verts);assert.equal(readAccessor(b.json,p.indices).count/3,e.tris);
  const n=readAccessor(b.json,p.attributes.NORMAL).data;
  for(let i=0;i<n.length;i+=3)assert.ok(Math.abs(Math.hypot(n[i],n[i+1],n[i+2])-1)<1e-5);
  assert.equal((await validator.validateBytes(new Uint8Array(output))).issues.numErrors,0);
  console.log('ok '+e.id+' immutable source/buffers/materials, measured counts, unit normals and Khronos validation');
}
