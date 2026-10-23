// Export only model dependencies, never private reports, workspace files or credentials.
import fs from 'node:fs';import path from 'node:path';
import {zipSync} from 'three/addons/libs/fflate.module.js';
import {resourceFiles,resourcePath} from './gltfIO.mjs';
export function packageFiles(file){
 const base=path.dirname(file), ext=path.extname(file), names=[path.basename(file)];
 if(ext==='.gltf') names.push(...resourceFiles(file));
 if(ext==='.obj'){
   const text=fs.readFileSync(file,'utf8');
   for(const m of text.matchAll(/^mtllib (.+)$/gm)){names.push(m[1]);const mtl=fs.readFileSync(resourcePath(base,m[1]),'utf8');for(const t of mtl.matchAll(/^map_Kd (.+)$/gm))names.push(t[1]);}
 }
 return [...new Set(names)].map(name=>({name,path:resourcePath(base,name)}));
}
export function packageZip(file){const entries={};for(const f of packageFiles(file))entries[f.name]=new Uint8Array(fs.readFileSync(f.path));return Buffer.from(zipSync(entries,{level:0}));}
