import {Matrix4,Vector3,Quaternion,Box3} from 'three';
import {readAccessor} from '../tools/glbkit.mjs';

// Static POSITION bounds in the default scene, including parent/node transforms and instances.
// Skin/morph/animation deformation is deliberately not represented as an evaluated pose.
export function gltfWorldBounds(gltf){
  const box=new Box3(),point=new Vector3(),cache=new Map();let visits=0,vertices=0;
  function mesh(index,world){
    for(const prim of gltf.meshes?.[index]?.primitives||[]){
      const id=prim.attributes?.POSITION;if(id===undefined)continue;
      let pos=cache.get(id);if(!pos){pos=readAccessor(gltf,id);if(pos.n!==3)throw new Error('POSITION must be VEC3');cache.set(id,pos);}
      vertices+=pos.count;if(vertices>16777216)throw new Error('scene exceeds 16M transformed vertex budget');
      for(let i=0;i<pos.count;i++){
        point.fromArray(pos.data,i*3).applyMatrix4(world);
        if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))throw new Error('non-finite POSITION or node transform');
        box.expandByPoint(point);
      }
    }
  }
  const nodes=gltf.nodes||[],children=new Set(nodes.flatMap(n=>n.children||[]));
  const roots=gltf.scenes?.[gltf.scene??0]?.nodes||nodes.map((_,i)=>i).filter(i=>!children.has(i));
  const stack=roots.map(id=>({id,parent:new Matrix4(),ancestors:new Set()}));
  while(stack.length){
    const {id,parent,ancestors}=stack.pop(),n=nodes[id];
    if(!n||ancestors.has(id)||ancestors.size>128||++visits>100000)throw new Error('invalid or excessive scene hierarchy');
    const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation||[0,0,0]),new Quaternion().fromArray(n.rotation||[0,0,0,1]),new Vector3().fromArray(n.scale||[1,1,1]));
    const world=parent.clone().multiply(local);if(n.mesh!==undefined)mesh(n.mesh,world);
    const seen=new Set(ancestors).add(id);for(const child of n.children||[])stack.push({id:child,parent:world,ancestors:seen});
  }
  if(nodes.length&&!roots.length&&!gltf.scenes?.length)throw new Error('scene hierarchy has no roots');
  if(!nodes.length)for(let i=0;i<(gltf.meshes||[]).length;i++)mesh(i,new Matrix4());
  return box.isEmpty()?null:{min:box.min.toArray(),max:box.max.toArray(),source:nodes.length?'world-static-position':'mesh-local-position'};
}
