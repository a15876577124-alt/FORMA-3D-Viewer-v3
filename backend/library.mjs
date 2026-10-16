// 资产库：扫描 pipeline-out 版本，发布产物到 assets/library/（可上 Pages），删除。
import fs from 'node:fs';
import path from 'node:path';
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
      if (f.startsWith('model.')) { modelFile = f; break; }
    }
    const entry = entries.get(assetId) || { assetId, versions: [] };
    entry.versions.push({ version, dir: dirName, ops: ops?.ops?.map((o) => o.op) || [], verifyPass: verify?.pass ?? null, modelFile, createdAt: ops?.createdAt ?? null });
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
export function publishAsset({ assetId, version }) {
  const id = assertSafeId(assetId);
  const dir = path.join(PIPELINE_OUT_ROOT, `${id}-v${version}`);
  if (!fs.existsSync(dir)) throw new LibraryError(`版本不存在: ${id}-v${version}`, 404);
  const modelFile = fs.readdirSync(dir).find((f) => f.startsWith('model.'));
  if (!modelFile) throw new LibraryError(`版本无产物: ${id}-v${version}`, 404);
  const src = path.join(dir, modelFile);
  const ext = path.extname(modelFile);
  fs.mkdirSync(LIBRARY_ROOT, { recursive: true });
  const dest = path.join(LIBRARY_ROOT, `${id}-v${version}${ext}`);
  fs.copyFileSync(src, dest); // 只复制，原始产物保留在 pipeline-out
  return { url: `/assets/library/${path.basename(dest)}`, file: path.basename(dest), bytes: fs.statSync(dest).size };
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
  if (!fs.existsSync(LIBRARY_ROOT)) return { files: [] };
  return { files: fs.readdirSync(LIBRARY_ROOT).filter((f) => f.endsWith('.glb') || f.endsWith('.gltf')).map((f) => ({ file: f, url: `/assets/library/${f}`, bytes: fs.statSync(path.join(LIBRARY_ROOT, f)).size })) };
}
