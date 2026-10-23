// Filesystem-only glTF IO: dependencies are confined before NodeIO reads anything.
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {unpartition} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {safeResolveExisting} from './paths.mjs';
import {parseGLB} from '../tools/glbkit.mjs';
export function resourcePath(base, uri) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('//') || /[?#]/.test(uri)) throw Object.assign(new Error('只允许资产包内相对资源路径'),{status:400});
  return safeResolveExisting(base, decodeURIComponent(uri));
}
export function resourceFiles(file) {
  const buf=fs.readFileSync(file);
  const json=path.extname(file)==='.glb'?parseGLB(buf).json:JSON.parse(buf.toString('utf8'));
  return [...new Set([...(json.buffers||[]),...(json.images||[])].map(x=>x.uri).filter(u=>u&&!u.startsWith('data:')))];
}
export async function readDocument(file) {
  for(const uri of resourceFiles(file)) resourcePath(path.dirname(file),uri);
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).setAllowNetwork(false);
  return io.read(file);
}
export async function writeDocument(doc,file) {
  await doc.transform(unpartition());
  const stem=path.basename(file,path.extname(file));
  doc.getRoot().listBuffers().forEach((b,i)=>b.setURI(stem+'-'+i+'.bin'));
  doc.getRoot().listTextures().forEach((t,i)=>t.setURI(stem+'-texture-'+i+'.'+(t.getMimeType()==='image/jpeg'?'jpg':t.getMimeType().split('/')[1]||'bin')));
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).setAllowNetwork(false);
  await io.write(file,doc);
  return [path.basename(file),...(path.extname(file)==='.gltf'?resourceFiles(file):[])];
}
