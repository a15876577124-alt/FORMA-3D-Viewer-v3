// Drop / dialog import router.
//
// A failed import must never leave the stage empty or half-swapped: the model is
// only handed to the viewer after it has loaded and parsed successfully.
import { loadGLTF, loadOBJ, loadFBX, MAX_FILE_BYTES } from './importers.js';
import { describeError, MESSAGES } from './errors.js';
import { toast, setProgress, formatBytes } from '../utils/dom.js';

const KNOWN_EXT = /\.(glb|gltf|obj|fbx|mtl|bin|png|jpe?g|webp|bmp|tga)$/i;
const MAIN_EXT = /\.(glb|gltf|obj|fbx)$/i;
const ASSET_EXT = /\.(mtl|bin|png|jpe?g|webp|bmp|tga)$/i;

const FORMAT_LABEL = {
  glb: 'glTF 2.0 / GLB', gltf: 'glTF 2.0 / .gltf',
  obj: 'Wavefront OBJ', fbx: 'Autodesk FBX', procedural: 'Three.js 内置几何体',
};

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function entryFor(res, file) {
  const base = (file?.name || 'model').replace(/\.[^.]+$/, '');
  const id = 'imported:' + base;
  const fmt = res.extras?.format || 'gltf';
  let verts = 0, tris = 0;
  res.root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const p = o.geometry.attributes.position;
    if (!p) return;
    verts += p.count;
    tris += o.geometry.index ? o.geometry.index.count / 3 : p.count / 3;
  });
  return {
    id, group: 'imported', imported: true,
    name: file?.name || base,
    sub: 'IMPORTED · ' + String(fmt).toUpperCase(),
    glyph: '↧', tone: 't-sheng', kind: fmt.replace('imported-', ''),
    source: file?.name,
    verts, tris,
    best: { yaw: 0.42, pitch: 0.2, distMul: 1.0, targetYMul: 0.5 },
    formatLabel: FORMAT_LABEL[fmt] || FORMAT_LABEL[extOf(file?.name)] || '外部模型',
  };
}

/**
 * @param {File[]} rawFiles
 * @param {import('../core/viewer.js').Viewer} viewer
 * @param {{ onMounted: (entry, res) => void }} hooks
 */
export async function importFiles(rawFiles, viewer, hooks = {}) {
  const files = [...(rawFiles || [])];
  if (!files.length) return null;

  const rejected = new Set();
  const usable = files.filter((f) => {
    const ok = KNOWN_EXT.test(f.name);
    if (!ok) rejected.add(extOf(f.name) || f.name);
    return ok;
  });
  if (rejected.size) toast(MESSAGES.unsupportedExt([...rejected].join(' / ')), 'warn');

  const tooLarge = usable.filter((f) => f.size > MAX_FILE_BYTES);
  if (tooLarge.length) toast(MESSAGES.tooLarge(tooLarge[0].size, MAX_FILE_BYTES), 'warn');

  const accepted = usable.filter((f) => f.size <= MAX_FILE_BYTES);
  const mains = accepted.filter((f) => MAIN_EXT.test(f.name));

  if (!mains.length) {
    toast(MESSAGES.noSupportedFile, 'err');
    return null;
  }
  if (mains.length > 1) toast(MESSAGES.multipleMain, 'warn');

  const main = mains[0];
  const assets = accepted.filter((f) => f !== main && ASSET_EXT.test(f.name));
  const ext = extOf(main.name);

  setProgress(2, `正在解析 ${main.name}（${formatBytes(main.size)}）…`);
  try {
    let res;
    if (ext === 'glb' || ext === 'gltf') res = await loadGLTF(main, { files: assets });
    else if (ext === 'obj') res = await loadOBJ(main, [main, ...assets]);
    else if (ext === 'fbx') res = await loadFBX(main, [main, ...assets]);
    else { toast(MESSAGES.unsupportedExt('.' + ext), 'err'); return null; }

    const entry = entryFor(res, main);
    entry.sourceFiles = [main,...assets];
    if (!entry.tris) throw new Error('no mesh: this file contains no drawable geometry');

    viewer.mountImported(res, entry);
    setProgress(null);

    // Anything less than perfect is reported, never silently swallowed.
    const x = res.extras || {};
    if (x.missingTextures?.length) toast(MESSAGES.objMissingTexture(x.missingTextures), 'warn', 7000);
    if (ext === 'obj' && !x.hasMtl) toast(MESSAGES.objWithoutMtl, 'warn', 6000);
    if (x.uvGenerated) toast('这个 OBJ 没有 UV 坐标，已生成空 UV，贴图无法贴合显示。', 'warn', 6000);
    if (x.normalsComputed) console.info(`[import] computed normals for ${x.normalsComputed} mesh(es)`);
    if (ext === 'fbx') {
      toast(res.animations?.length ? MESSAGES.fbxAnimation(res.animations[0].name) : MESSAGES.fbxNoAnimation,
        res.animations?.length ? 'ok' : '', 5000);
    }

    toast(MESSAGES.loaded(main.name), 'ok');
    hooks.onMounted?.(entry, res);
    return entry;
  } catch (err) {
    setProgress(null);
    const info = describeError(err);
    console.error('[import]', info.detail || err);
    toast(info.message, 'err', 9000);
    return null;
  }
}
