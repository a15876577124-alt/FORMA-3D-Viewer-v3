// One identity for source files, reports and versioned operations. Version 0 = Original.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, PIPELINE_OUT_ROOT, assertSafeId, safeResolveExisting } from './paths.mjs';
import { analyzeBuffer } from './analyze.mjs';
export function resolveAssetSource(assetId, version = 0) {
  const id = assertSafeId(assetId);
  if (!Number.isSafeInteger(version) || version < 0) throw Object.assign(new Error('版本必须是非负整数'), {status:400});
  const dir = path.join(PROJECT_ROOT, 'backend/workspace/assets', id);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const base = version ? path.join(PIPELINE_OUT_ROOT, id + '-v' + version) : path.join(dir, 'original');
  const name = version ? fs.readdirSync(base).find(f => /^model\.(glb|gltf|obj|fbx)$/.test(f)) : (meta.primaryRelativePath || path.basename(meta.originalRelPath || 'file' + path.extname(meta.name)));
  if (!name) throw Object.assign(new Error('版本没有可加载的模型'), {status:404});
  const file = safeResolveExisting(base, name);
  const format = path.extname(file).slice(1);
  return { assetId:id, version, meta, file, format, path:path.relative(PROJECT_ROOT,file).split(path.sep).join('/') };
}
export async function describeAssetSource(id, version = 0) {
  const src = resolveAssetSource(id, version);
  const report = await analyzeBuffer(path.basename(src.file), fs.readFileSync(src.file), src.format === 'fbx' ? src.meta.format : src.format, {baseDir:path.dirname(src.file)});
  const metaPath=path.join(path.dirname(src.file),'version.json');
  const versionMeta=version&&fs.existsSync(metaPath)?JSON.parse(fs.readFileSync(metaPath,'utf8')):null;
  return {assetId:src.assetId, version:src.version, path:src.path, format:src.format, name:src.meta.name, report, versionMeta, resources:version ? [] : (src.meta.files || []).map(name => ({name,path:path.relative(PROJECT_ROOT,safeResolveExisting(path.join(PROJECT_ROOT,'backend/workspace/assets',src.assetId,'original'),name)).split(path.sep).join('/')}))};
}
