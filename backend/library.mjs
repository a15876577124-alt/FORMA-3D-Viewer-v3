// 资产库：扫描 pipeline-out 版本，发布产物到 assets/library/（可上 Pages），删除。
import fs from 'node:fs';
import path from 'node:path';
import {resolveAssetSource} from './assetSource.mjs';
import {packageFiles} from './assetPackage.mjs';
import { PIPELINE_OUT_ROOT, LIBRARY_ROOT, safeJoinLibrary, assertSafeId } from './paths.mjs';

export class LibraryError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'LibraryError'; this.status = status; }
}

// 列出所有版本（扫描 pipeline-out/<id>-v<N>/ 的 ops.json）
export function listLibrary() {
  const entries = new Map();
  if (!fs.existsSync(PIPELINE_OUT_ROOT)) return { entries: [] };
  for (const dirName of fs.readdirSync(PIPELINE_OUT_ROOT)) {
    const m = /^(.+)-v(\d+)$/.exec(dirName);
    if (!m) continue;
    const assetId = m[1], version = Number(m[2]);
    const dir = path.join(PIPELINE_OUT_ROOT, dirName);
    const opsPath = path.join(dir, 'ops.json');
    const verifyPath = path.join(dir, 'verify.json');
    let ops = null, verify = null, modelFile = null;
    if (fs.existsSync(opsPath)) ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
    if (fs.existsSync(verifyPath)) verify = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
    for (const f of fs.readdirSync(dir)) {
      if (/^model\.(glb|gltf|obj|fbx)$/.test(f)) { modelFile = f; break; }
    }
    const entry = entries.get(assetId) || { assetId, versions: [] };
    const vp = path.join(dir,'version.json');
    const versionMeta = fs.existsSync(vp) ? JSON.parse(fs.readFileSync(vp,'utf8')) : {};
    entry.versions.push({ ...versionMeta, baseVersion:ops?.baseVersion ?? versionMeta.baseVersion ?? 0, version, dir: dirName, ops: ops?.ops?.map((o) => o.op) || [], verifyPass: verify?.pass ?? null, modelFile, createdAt: ops?.createdAt ?? null });
    entries.set(assetId, entry);
  }
  const out = [];
  for (const [assetId, e] of entries) {
    e.versions.sort((a, b) => b.version - a.version);
    // 发布状态
    e.published = fs.existsSync(path.join(LIBRARY_ROOT, `${assetId}-v${e.versions[0].version}.glb`));
    out.push(e);
  }
  return { entries: out };
}

// 发布某版本产物到 assets/library/（只复制，不移动、不删原文件）
export function publishAsset({assetId,version}) {
  const src=resolveAssetSource(assetId,version);
  if(version===0)throw new LibraryError('请先创建并验证处理版本');
  const verify=JSON.parse(fs.readFileSync(path.join(path.dirname(src.file),'verify.json'),'utf8'));
  if(!verify.pass)throw new LibraryError('后验未通过，不能发布',409);
  if(!['glb','gltf'].includes(src.format))throw new LibraryError('展厅发布需要 GLB/GLTF');
  fs.mkdirSync(LIBRARY_ROOT,{recursive:true});
  const key=src.assetId+'-v'+version;
  if(src.format==='glb'){
    const file=key+'.glb', dest=path.join(LIBRARY_ROOT,file);
    if(!fs.existsSync(dest))fs.copyFileSync(src.file,dest,fs.constants.COPYFILE_EXCL);
    return {assetId:src.assetId,version,url:'/assets/library/'+file,file,bytes:fs.statSync(dest).size};
  }
  const dest=path.join(LIBRARY_ROOT,key), manifest=path.join(dest,'publication.json');
  if(!fs.existsSync(manifest)){
    try{fs.mkdirSync(dest);}catch(e){if(e.code==='EEXIST')throw new LibraryError('发布正在进行或未完成',409);throw e;}
    for(const f of packageFiles(src.file)){const target=path.join(dest,f.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f.path,target,fs.constants.COPYFILE_EXCL);}
    fs.writeFileSync(manifest,JSON.stringify({assetId:src.assetId,version,modelFile:path.basename(src.file)}),{flag:'wx'});
  }
  const file=key+'/'+path.basename(src.file);
  return {assetId:src.assetId,version,file,url:'/assets/library/'+file,bytes:fs.statSync(path.join(LIBRARY_ROOT,file)).size};
}

// 删除 assets/library/ 内的文件（仅限该目录内，防穿越）
export function deleteLibraryFile(file) {
  const p = safeJoinLibrary(file);
  if (!fs.existsSync(p)) throw new LibraryError(`文件不存在: ${file}`, 404);
  if (!p.startsWith(LIBRARY_ROOT + path.sep)) throw new LibraryError('禁止删除库目录外的文件', 403);
  fs.unlinkSync(p);
  return { deleted: path.basename(p) };
}

// 列出已发布到 assets/library/ 的文件
export function listPublished() {
  if(!fs.existsSync(LIBRARY_ROOT))return {files:[]};
  const files=[];
  for(const item of fs.readdirSync(LIBRARY_ROOT,{withFileTypes:true})){
    if(item.isFile()&&/\.(glb|gltf)$/.test(item.name))files.push({file:item.name,url:'/assets/library/'+item.name,bytes:fs.statSync(path.join(LIBRARY_ROOT,item.name)).size});
    else if(item.isDirectory()){
      const p=path.join(LIBRARY_ROOT,item.name,'publication.json');if(!fs.existsSync(p))continue;
      const m=JSON.parse(fs.readFileSync(p,'utf8')), file=item.name+'/'+m.modelFile;
      files.push({...m,file,url:'/assets/library/'+file,bytes:fs.statSync(path.join(LIBRARY_ROOT,file)).size});
    }
  }
  return {files};
}
