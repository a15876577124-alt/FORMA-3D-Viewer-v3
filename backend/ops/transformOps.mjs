// 成熟库算子（gltf-transform + meshoptimizer + sharp）：
// weld / dedup / prune / simplify / quantize / textureResize / textureCompress / join。
// 铁律：所有算子真实变换数据；输出写独立文件；run 前由 index.mjs 统一读原文件。
import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
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
  return { verts, tris, materials, textures };
}

export const transformOps = {
  weld: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      const doc = await readDoc(inPath);
      const before = docStats(doc);
      await doc.transform(fns.weld({ tolerance: params.epsilon ?? 1e-5 }));
      const bytes = await writeDoc(doc, outPath);
      const doc2 = await readDoc(outPath);
      const after = docStats(doc2);
      return { metrics: { before, after, bytes }, changes: [`weld: verts ${before.verts}->${after.verts}, tris ${before.tris}->${after.tris}`] };
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
      await doc.transform(fns.join());
      const bytes = await writeDoc(doc, outPath);
      const doc2 = await readDoc(outPath);
      const after = docStats(doc2);
      return { metrics: { after, bytes }, changes: [`join: ${after.verts} verts, ${after.tris} tris`] };
    },
  },
};
