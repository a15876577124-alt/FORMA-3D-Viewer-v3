import test from 'node:test';import assert from 'node:assert/strict';
import {readAccessor} from '../tools/glbkit.mjs';import {gltfWorldBounds} from '../backend/gltfBounds.mjs';
import {analyzeBuffer} from '../backend/analyze.mjs';import {buildGLB} from '../backend/ops/glbWrite.mjs';
function fixture(){
 const bin=Buffer.alloc(28);[1,2,3].forEach((v,i)=>bin.writeFloatLE(v,i*4));[4,5,6].forEach((v,i)=>bin.writeFloatLE(v,16+i*4));
 return {asset:{version:'2.0'},buffers:[{byteLength:28}],bufferViews:[{buffer:0,byteLength:28,byteStride:16}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:2}],meshes:[{primitives:[{attributes:{POSITION:0},mode:0}]}],nodes:[{translation:[10,0,0],children:[1]},{mesh:0,scale:[-2,3,1]}],scenes:[{nodes:[0]}],scene:0,__bin:bin};
}
test('interleaved accessor uses final element length, not an extra trailing stride',()=>{const g=fixture();assert.deepEqual([...readAccessor(g,0).data],[1,2,3,4,5,6]);});
test('world bounds include parent translation and negative scale',()=>{const b=gltfWorldBounds(fixture());assert.deepEqual(b.min,[2,6,3]);assert.deepEqual(b.max,[8,15,6]);});
test('default scene excludes unused nodes and applies matrix transforms',()=>{
 const g=fixture();g.nodes.push({mesh:0,translation:[999,0,0]});g.nodes[1]={mesh:0,matrix:[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1]};
 assert.deepEqual(gltfWorldBounds(g).min,[5,1,3]);assert.deepEqual(gltfWorldBounds(g).max,[8,4,6]);
 g.scenes[0].nodes=[];assert.equal(gltfWorldBounds(g),null,'empty default scene is valid');
});
test('sparse, zero-filled and normalized accessors read from their actual buffers',()=>{
 const g={buffers:[{__bytes:Buffer.from([1])},{__bytes:Buffer.from([255,128,0])}],bufferViews:[{buffer:0,byteLength:1},{buffer:1,byteLength:3}],accessors:[{type:'VEC3',componentType:5121,count:2,normalized:true,sparse:{count:1,indices:{bufferView:0,componentType:5121},values:{bufferView:1}}}]};
 const pos=readAccessor(g,0).data;assert.deepEqual([...pos.slice(0,3)],[0,0,0]);assert.equal(pos[3],1);assert.ok(Math.abs(pos[4]-128/255)<1e-7);
 g.buffers[0].__bytes[0]=2;assert.throws(()=>readAccessor(g,0),/sparse indices/);
});
test('malformed byte ranges, excessive allocation and cyclic hierarchy reject safely',()=>{
 const g=fixture();g.bufferViews[0].byteLength=24;assert.throws(()=>readAccessor(g,0),/range/);
 g.accessors[0].count=999999999;assert.throws(()=>readAccessor(g,0),/budget/);
 const c=fixture();c.nodes[1].children=[0];assert.throws(()=>gltfWorldBounds(c),/hierarchy/);
});
test('analysis ignores stale accessor min/max and reports actual world-space dimensions',async()=>{
 const g=fixture(),bin=g.__bin;delete g.__bin;g.accessors[0].min=[999,999,999];g.accessors[0].max=[999,999,999];
 const r=await analyzeBuffer('scene.glb',buildGLB(g,bin),'glb');assert.deepEqual(r.bounds.size,[6,9,3]);assert.equal(r.bounds.source,'world-static-position');
 bin.writeFloatLE(NaN,0);const bad=await analyzeBuffer('scene.glb',buildGLB(g,bin),'glb');assert.equal(bad.bounds,null);assert.ok(bad.issues.some(i=>i.severity==='error'));
});
