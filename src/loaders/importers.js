// GLB / GLTF / OBJ+MTL+PNG / FBX importers.
//
// Every importer returns the same shape so the app can treat them identically:
//   { root: THREE.Object3D, animations: [], extras: {...} }
// Import failures NEVER damage whatever is currently on stage - the caller only
// swaps the model after a successful load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { computeWeldedNormals, clearFlatShading } from './normals.js';

export const MAX_FILE_BYTES = 80 * 1024 * 1024;
export const MAX_VERTICES = 500000;

const CHUNK_JSON = 0x4e4f534a;

/** Cheap structural pre-flight so we can fail with a useful message, not a stack trace. */
export function preflightGLB(buffer) {
  if (buffer.byteLength < 20) throw new Error('too small to be a GLB');
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const total = view.getUint32(8, true);
  if (magic !== 0x46546c67) throw new Error('not a glTF container (bad magic)');
  if (version !== 2) throw new Error('glTF version ' + version + ' is not supported (expected 2)');
  if (total > buffer.byteLength) throw new Error('truncated file: declared length exceeds actual size');

  let off = 12;
  while (off + 8 <= view.byteLength) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > view.byteLength) throw new Error('chunk overruns file');
    if (type === CHUNK_JSON) {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer, start, len));
      let json;
      try { json = JSON.parse(text); } catch { throw new Error('JSON chunk is not valid JSON'); }
      const req = json.extensionsRequired || [];
      if (req.length) throw new Error('extensionsRequired: ' + req.join(', '));
      const meshes = json.meshes || [];
      if (!meshes.length) throw new Error('no mesh found in this glTF');
      let verts = 0;
      for (const a of json.accessors || []) if (a.type === 'VEC3' && a.componentType === 5126) verts = Math.max(verts, a.count || 0);
      if (verts > MAX_VERTICES) throw new Error(`model too complex: ${verts} vertices (limit ${MAX_VERTICES})`);
      return { extensionsRequired: req, verts };
    }
    off = start + len + ((4 - (len % 4)) % 4);
    if (len === 0) break;
  }
  throw new Error('no JSON chunk found');
}

/** Streamed download so the UI can show real byte-level progress on large GLBs. */
export async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load ' + url + ' (HTTP ' + res.status + ')');
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buffer = await res.arrayBuffer();
    onProgress?.(1, buffer.byteLength, buffer.byteLength);
    return { buffer, total: buffer.byteLength };
  }
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(total ? received / total : 0, received, total);
  }
  const blob = new Blob(chunks);
  const buffer = await blob.arrayBuffer();
  onProgress?.(1, received, received);
  return { buffer, total: received };
}

/** Wrapping every loaded scene in a Group keeps transforms predictable. */
function wrap(object) {
  const g = new THREE.Group();
  g.add(object);
  return g;
}

function enableShadows(root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

/** Wrap every dropped file name -> blob URL, so relative refs inside the model
 *  (.bin next to a .gltf, .mtl next to an .obj, textures referenced by either)
 *  can be resolved even though local File objects have no usable path. */
function buildBlobMap(files) {
  const map = new Map();
  const urls = [];
  for (const f of files) {
    const u = URL.createObjectURL(f);
    urls.push(u);
    map.set(f.name.toLowerCase(), u);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => {
    const base = decodeURIComponent(String(u).split(/[\\/]/).pop() || '').toLowerCase();
    return map.get(base) || u;
  });
  const revoke = () => setTimeout(() => urls.forEach(URL.revokeObjectURL), 60000);
  return { manager, map, revoke };
}

// ------------------------------------------------------------------ glTF ----

export async function loadGLTF(source, { files = [], onProgress } = {}) {
  let gltf, url, baseName = 'model.glb';

  if (source instanceof File) {
    baseName = source.name;
    if (source.size > MAX_FILE_BYTES) throw new Error(`too complex: ${source.size} bytes`);

    if (/\.glb$/i.test(source.name)) {
      const buffer = await source.arrayBuffer();
      preflightGLB(buffer);
      const loader = new GLTFLoader();
      gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
    } else {
      // .gltf needs whatever it references; resolve them through the blob map.
      const text = await source.text();
      const { manager, revoke } = buildBlobMap([source, ...files]);
      try {
        const loader = new GLTFLoader(manager);
        gltf = await new Promise((resolve, reject) => loader.parse(text, '', resolve, reject));
      } finally { revoke(); }
    }
  } else {
    url = source;
    baseName = String(source).split(/[\\/]/).pop() || 'model.glb';
    const { buffer } = await fetchWithProgress(url, onProgress);
    preflightGLB(buffer);
    const loader = new GLTFLoader();
    gltf = await new Promise((resolve, reject) => { loader.load(url, resolve, onProgress, reject); });
  }

  const scene = gltf.scene || gltf.scenes?.[0];
  if (!scene) throw new Error('no mesh found in this glTF');

  const root = wrap(scene);
  enableShadows(root);

  // Skinned / KHR_materials_unlit meshes occasionally arrive without normals or
  // with normals that were averaged across UV seams; recompute defensively.
  // clearFlatShading is mandatory here: GLTFLoader set flatShading=true because
  // the primitive lacked NORMAL, and leaving it on would undo the repair.
  let normalsComputed = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.attributes.normal) { computeWeldedNormals(g); clearFlatShading(o); normalsComputed++; }
  });

  return {
    root,
    animations: gltf.animations || [],
    extras: {
      format: url ? 'gltf' : 'imported-gltf',
      name: baseName,
      normalsComputed,
      parserInfo: gltf.parser?.json?.asset?.generator || null,
    },
  };
}

// -------------------------------------------------------------------- OBJ ---

function mtlTextureNames(mtlText) {
  const names = [];
  const re = /^\s*map_\w+\s+(.+)$/gm;
  let m;
  while ((m = re.exec(mtlText))) {
    const raw = m[1].trim().split(/\s+/).pop();
    if (raw) names.push(raw.split(/[\\/]/).pop());
  }
  return names;
}

export async function loadOBJ(file, files, { onProgress } = {}) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`too complex: ${file.size} bytes`);

  // Map every dropped file name -> blob URL. Local File objects have no usable
  // path, so this is the only way the MTL and its textures can be resolved.
  const blobMap = new Map();
  const urls = [];
  for (const f of files) {
    const u = URL.createObjectURL(f);
    urls.push(u);
    blobMap.set(f.name.toLowerCase(), u);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => {
    const base = decodeURIComponent(String(u).split(/[\\/]/).pop() || '').toLowerCase();
    return blobMap.get(base) || u;
  });

  try {
    const objText = await file.text();
    const missing = [];
    let materialsCreator = null;

    const mtlFile = files.find(f => /\.mtl$/i.test(f.name));
    if (mtlFile) {
      const mtlText = await mtlFile.text();
      for (const need of mtlTextureNames(mtlText)) {
        if (!blobMap.has(need.toLowerCase())) missing.push(need);
      }
      materialsCreator = new MTLLoader(manager).parse(mtlText, '');
      materialsCreator.preload?.();
    }

    const objLoader = new OBJLoader(manager);
    if (materialsCreator) objLoader.setMaterials(materialsCreator);
    const obj = objLoader.parse(objText);

    const root = wrap(obj);
    enableShadows(root);

    let uvMissing = false, normalFixed = 0;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      if (!g.attributes.normal) { computeWeldedNormals(g); normalFixed++; }
      if (!g.attributes.uv) { uvMissing = true; g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    });
    if (normalFixed) clearFlatShading(root);

    return {
      root, animations: [],
      extras: {
        format: 'obj', name: file.name,
        hasMtl: !!mtlFile, missingTextures: missing, uvGenerated: uvMissing, normalsComputed: normalFixed,
      },
    };
  } finally {
    // Safe only after parsing finished.
    setTimeout(() => urls.forEach(URL.revokeObjectURL), 60000);
  }
}

// -------------------------------------------------------------------- FBX ---

export async function loadFBX(file, files, { onProgress } = {}) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`too complex: ${file.size} bytes`);

  const blobMap = new Map();
  const urls = [];
  for (const f of files) {
    const u = URL.createObjectURL(f);
    urls.push(u);
    blobMap.set(f.name.toLowerCase(), u);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => {
    const base = decodeURIComponent(String(u).split(/[\\/]/).pop() || '').toLowerCase();
    return blobMap.get(base) || u;
  });

  try {
    const buffer = await file.arrayBuffer();
    const loader = new FBXLoader(manager);
    const obj = loader.parse(buffer, '');
    const root = wrap(obj);
    enableShadows(root);

    let verts = 0;
    root.traverse((o) => { if (o.isMesh && o.geometry?.attributes.position) verts += o.geometry.attributes.position.count; });
    if (verts > MAX_VERTICES) throw new Error(`model too complex: ${verts} vertices (limit ${MAX_VERTICES})`);

    return {
      root,
      animations: obj.animations || [],
      extras: { format: 'fbx', name: file.name, verts },
    };
  } finally {
    setTimeout(() => urls.forEach(URL.revokeObjectURL), 60000);
  }
}
