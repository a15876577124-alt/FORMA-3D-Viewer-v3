// 成熟库算子（gltf-transform + meshoptimizer + sharp）：
// weld / dedup / prune / simplify / quantize / textureResize / textureCompress / join。
// 铁律：所有算子真实变换数据；输出写独立文件；run 前由 index.mjs 统一读原文件。
import path from 'node:path';
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as fns from '@gltf-transform/functions';

function newIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).setAllowNetwork(false);
}

// 读 GLB 为 Document；outPath 由 index.mjs 决定。
async function readDoc(inPath) {
  const io = newIO();
  return io.read(inPath);
}

async function writeDoc(doc, outPath) {
  const io = newIO();
  await io.write(outPath, doc);
  return fs.statSync(outPath).size;
}

// 从 Document 统计真实指标
function docStats(doc) {
  const root = doc.getRoot();
  let verts = 0, tris = 0, materials = 0, textures = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const v = pos ? pos.getCount() : 0;
      const t = idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
      verts += v; tris += t;
    }
  }
  materials = root.listMaterials().length;
  textures = root.listTextures().length;
  return { verts, tris, meshes: root.listMeshes().length, materials, textures };
}

// 容差焊接（自研）。
// 背景：gltf-transform 的 weld() 只合并「按位完全相同」的顶点（选项仅 overwrite），
// 不接受 tolerance。若直接把 epsilon 传进 fns.weld()，该参数会被静默忽略 ——
// 即 UI 上的「焊接容差」是个假控件。这里用量化键自行实现真实容差焊接：
// 位置/法线/UV 全部落在同一量化格才合并，因此不会把 UV 接缝两侧焊在一起。
function weldPrimTolerant(prim, tolerance) {
  const pos = prim.getAttribute('POSITION');
  if (!pos) return 0;
  const count = pos.getCount();
  const semantics = prim.listSemantics().filter((s) => prim.getAttribute(s));
  const src = {};
  for (const s of semantics) {
    const acc = prim.getAttribute(s);
    src[s] = { acc, array: acc.getArray(), size: acc.getElementSize() };
  }

  const inv = tolerance > 0 ? 1 / tolerance : 1e7;
  const keys = new Array(count);
  for (let i = 0; i < count; i++) {
    let k = '';
    for (const s of semantics) {
      const { array, size } = src[s];
      for (let c = 0; c < size; c++) k += `${Math.round(array[i * size + c] * inv)},`;
      k += '|';
    }
    keys[i] = k;
  }

  const map = new Map();
  const remap = new Int32Array(count).fill(-1);
  const ordered = [];
  for (let i = 0; i < count; i++) {
    const hit = map.get(keys[i]);
    if (hit !== undefined) { remap[i] = hit; continue; }
    const ni = ordered.length;
    map.set(keys[i], ni);
    remap[i] = ni;
    ordered.push(i);
  }
  if (ordered.length === count) return 0; // 无可焊接

  const doc = Document.fromGraph(prim.getGraph());
  for (const s of semantics) {
    const { acc, array, size } = src[s];
    const Ctor = array.constructor;
    const out = new Ctor(ordered.length * size);
    for (let j = 0; j < ordered.length; j++) {
      const si = ordered[j];
      for (let c = 0; c < size; c++) out[j * size + c] = array[si * size + c];
    }
    const na = doc.createAccessor(acc.getName() || '').setArray(out).setType(acc.getType());
    if (acc.getNormalized()) na.setNormalized(true);
    prim.setAttribute(s, na);
  }

  const idx = prim.getIndices();
  const oldIdx = idx ? idx.getArray() : null;
  const idxCount = idx ? idx.getCount() : count;
  const Ctor = ordered.length > 65535 ? Uint32Array : Uint16Array;
  const newIdx = new Ctor(idxCount);
  for (let i = 0; i < idxCount; i++) {
    const vi = oldIdx ? oldIdx[i] : i;
    newIdx[i] = remap[vi];
  }
  prim.setIndices(doc.createAccessor('indices').setArray(newIdx).setType('SCALAR'));

  return count - ordered.length;
}

export const transformOps = {
  weld: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      const doc = await readDoc(inPath);
      const before = docStats(doc);
      const tolerance = params.epsilon ?? 1e-5;
      let merged = 0;
      if (tolerance > 0) {
        for (const mesh of doc.getRoot().listMeshes()) {
          for (const prim of mesh.listPrimitives()) {
            if (!prim.getIndices()) {
              // 无索引的 primitive：先建顺序索引，后续统一按索引焊接
              const p = prim.getAttribute('POSITION');
              const n = p.getCount();
              const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
              for (let i = 0; i < n; i++) arr[i] = i;
              const docx = Document.fromGraph(prim.getGraph());
              prim.setIndices(docx.createAccessor('indices').setArray(arr).setType('SCALAR'));
            }
            merged += weldPrimTolerant(prim, tolerance);
          }
        }
      }
      await doc.transform(fns.weld({ overwrite: true }));
      const bytes = await writeDoc(doc, outPath);
      const after = docStats(await readDoc(outPath));
      return {
        metrics: { before, after, bytes, tolerance, merged },
        changes: [`weld(tol=${tolerance}): verts ${before.verts}->${after.verts}, tris ${before.tris}->${after.tris}, merged=${merged}`],
      };
    },
  },
  dedup: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      const doc = await readDoc(inPath);
      await doc.transform(fns.dedup());
      const bytes = await writeDoc(doc, outPath);
      const doc2 = await readDoc(outPath);
      const after = docStats(doc2);
      return { metrics: { after, bytes }, changes: [`dedup: ${after.materials} materials, ${after.textures} textures`] };
    },
  },
  prune: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      const doc = await readDoc(inPath);
      const before = docStats(doc);
      await doc.transform(fns.prune());
      const bytes = await writeDoc(doc, outPath);
      const doc2 = await readDoc(outPath);
      const after = docStats(doc2);
      return { metrics: { before, after, bytes }, changes: [`prune: verts ${before.verts}->${after.verts}, tris ${before.tris}->${after.tris}`] };
    },
  },
  simplify: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const { MeshoptSimplifier } = await import('meshoptimizer');
      const ratio = params.ratio ?? 0.5;
      const error = params.error ?? 0.001;
      const doc = await readDoc(inPath);
      const before = docStats(doc);
      await doc.transform(fns.simplify({ simplifier: MeshoptSimplifier, ratio, error }));
      const bytes = await writeDoc(doc, outPath);
      const doc2 = await readDoc(outPath);
      const after = docStats(doc2);
      return { metrics: { before, after, bytes, ratio }, changes: [`simplify ratio=${ratio}: tris ${before.tris}->${after.tris}`], warnings: ['减面会改变琼剧脸谱/头饰细节，需视觉复核'] };
    },
  },
  quantize: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const doc = await readDoc(inPath);
      await doc.transform(fns.quantize({ ...params }));
      const bytes = await writeDoc(doc, outPath);
      const doc2 = await readDoc(outPath);
      const after = docStats(doc2);
      return { metrics: { after, bytes }, changes: [`quantize: ${JSON.stringify(params)}`] };
    },
  },
  join: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      const doc = await readDoc(inPath);
      const before = docStats(doc);
      await doc.transform(fns.join({ keepNamed: params.keepNamed === true }));
      const bytes = await writeDoc(doc, outPath);
      const after = docStats(await readDoc(outPath));
      return {
        metrics: { before, after, bytes, keepNamed: params.keepNamed === true },
        changes: [`join: ${before.meshes ?? ''} ${after.verts} verts, ${after.tris} tris`],
      };
    },
  },
};
