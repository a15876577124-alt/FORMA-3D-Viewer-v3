import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {PROJECT_ROOT, safeJoin, assertSafeId} from './paths.mjs';
import {validateFile, sanitizeName, ValidationError, MAX_FILE_BYTES} from './validate.mjs';
const WORKSPACE=path.join(PROJECT_ROOT,'backend/workspace');
export function importAsset(name,dataBuf,dependencies=[]) {
  const safeName=sanitizeName(name), {format,note}=validateFile(safeName,dataBuf);
  if(!Array.isArray(dependencies)||dependencies.length>256)throw new ValidationError('资源包最多 256 个依赖文件');
  if (!dependencies.length) name = safeName; // Legacy single-file uploads discard client paths.
  const entries=new Map();let bytes=0;
  function add(name,buf){
    if(typeof name!=='string'||name.length>240||name.split('/').some(x=>!x||x==='.'||x==='..'||/[\\:<>"|?*\x00-\x1f]/.test(x)||/[. ]$/.test(x)))throw new ValidationError('非法资源路径');
    if(!/\.(glb|gltf|obj|fbx|mtl|bin|png|jpg|jpeg|webp|ktx2|bmp)$/i.test(name))throw new ValidationError('资源类型不允许');
    if([...entries.keys()].some(n=>n.toLowerCase()===name.toLowerCase()))throw new ValidationError('资源路径重复');
    bytes+=buf.length;if(bytes>MAX_FILE_BYTES)throw new ValidationError('资产包超过 256 MiB');entries.set(name,buf);
  }
  add(name,dataBuf);for(const f of dependencies){if(typeof f?.dataBase64!=='string')throw new ValidationError('依赖内容缺失');add(f.name,Buffer.from(f.dataBase64,'base64'));}
  if(format==='gltf'){
    const j=JSON.parse(dataBuf.toString('utf8'));
    for(const r of [...j.buffers||[],...j.images||[]])if(r.uri&&!r.uri.startsWith('data:')){
      if(/^[a-z][a-z0-9+.-]*:/i.test(r.uri)||r.uri.startsWith('//'))throw new ValidationError('禁止远程资源');
      const decoded=decodeURIComponent(r.uri);safeJoin('/package',decoded);
      const ref=path.posix.normalize(path.posix.join(path.posix.dirname(name),decoded));
      if(!entries.has(ref))throw new ValidationError('资源包缺少 '+ref);
    }
  }
  const hash=crypto.createHash('sha256');
  for(const [n,b]of [...entries].sort(([a],[b])=>a.localeCompare(b)))hash.update(n).update('\0').update(b).update('\0');
  const digest=hash.digest('hex');
  // Keep legacy IDs for single-file ASCII imports; package identity includes dependencies.
  const sourceSha=crypto.createHash('sha256').update(dataBuf).digest('hex');
  const slug=safeName.replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,40)||'asset';
  const id=assertSafeId(slug+'-'+(dependencies.length?digest:sourceSha).slice(0,8));
  const dir=path.join(WORKSPACE,'assets',id),metaFile=path.join(dir,'meta.json');
  if(fs.existsSync(metaFile))return JSON.parse(fs.readFileSync(metaFile,'utf8'));
  fs.mkdirSync(path.dirname(dir),{recursive:true});
  try{fs.mkdirSync(dir);}catch(e){if(e.code==='EEXIST')throw Object.assign(new Error('该资产正在导入或上次导入未完成'),{status:409});throw e;}
  const original=path.join(dir,'original');fs.mkdirSync(original);
  for(const [n,b]of entries){const target=safeJoin(original,n);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,b,{flag:'wx'});}
  const meta={id,name:safeName,format,note,bytes,sha256:sourceSha,packageSha256:digest,primaryRelativePath:name,files:[...entries.keys()],originalRelPath:path.relative(WORKSPACE,path.join(original,name)),importedAt:new Date().toISOString()};
  fs.writeFileSync(metaFile,JSON.stringify(meta,null,2),{flag:'wx'});return meta;
}
