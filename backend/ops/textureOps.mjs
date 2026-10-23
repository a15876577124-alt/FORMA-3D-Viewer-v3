// 贴图算子（sharp 自研）：真实缩放 / 有损压缩。
// 采用 compact 重建：只保留 accessor 引用的几何 bufferView + 新贴图，丢弃旧的（未引用）贴图字节。
import fs from 'node:fs';
import { parseGLB } from '../../tools/glbkit.mjs';
import { buildGLB } from './glbWrite.mjs';

// 重建 BIN：保留 accessor 引用的 bufferView，替换 image 为新 bytes。
// 返回新 json（bufferViews/accessors/images 已重映射）+ 新 bin。
function compactWithNewImages(json, bin, newImageBytes) {
  // 1. 记录 accessor 引用的 bufferView
  const usedBV = new Set();
  for (const acc of json.accessors || []) {
    if (acc.bufferView !== undefined) usedBV.add(acc.bufferView);
  }

  // 2. 复制保留的 bufferView 到新 BIN
  let newBin = Buffer.alloc(0);
  const bvOffset = new Map(); // old bufferView index -> new byteOffset
  for (let i = 0; i < (json.bufferViews || []).length; i++) {
    if (!usedBV.has(i)) continue;
    const bv = json.bufferViews[i];
    const pad = (4 - (newBin.length % 4)) % 4;
    if (pad) newBin = Buffer.concat([newBin, Buffer.alloc(pad)]);
    const offset = newBin.length;
    bvOffset.set(i, offset);
    newBin = Buffer.concat([newBin, bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)]);
  }

  // 3. 追加新贴图
  const imgBVOffset = []; // image index -> new bufferView index（重新编号）
  const newBufferViews = [];
  for (let i = 0; i < (json.images || []).length; i++) {
    const bytes = newImageBytes[i];
    if (bytes === null || bytes === undefined) { imgBVOffset.push(undefined); continue; }
    const pad = (4 - (newBin.length % 4)) % 4;
    if (pad) newBin = Buffer.concat([newBin, Buffer.alloc(pad)]);
    const offset = newBin.length;
    newBufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    imgBVOffset.push(newBufferViews.length - 1);
    newBin = Buffer.concat([newBin, bytes]);
  }

  // 4. 重建 bufferViews 数组：保留的（按旧顺序）+ 新贴图
  const keptBufferViews = [];
  const oldToNew = new Map(); // old index -> new index（仅保留的）
  for (let i = 0; i < (json.bufferViews || []).length; i++) {
    if (!usedBV.has(i)) continue;
    oldToNew.set(i, keptBufferViews.length);
    keptBufferViews.push({ ...json.bufferViews[i], buffer: 0, byteOffset: bvOffset.get(i) });
  }
  const newBvBase = keptBufferViews.length;
  const newBV = keptBufferViews.concat(newBufferViews);

  // 5. 更新 accessor 的 bufferView 引用
  for (const acc of json.accessors || []) {
    if (acc.bufferView !== undefined) acc.bufferView = oldToNew.get(acc.bufferView);
  }

  // 6. 更新 image 的 bufferView 引用
  for (let i = 0; i < (json.images || []).length; i++) {
    if (newImageBytes[i] !== null && newImageBytes[i] !== undefined) {
      json.images[i].bufferView = newBvBase + imgBVOffset[i];
    }
  }

  json.bufferViews = newBV;
  json.buffers = [{ byteLength: newBin.length }];
  return { json, bin: newBin };
}

async function rewriteTextures({ inPath, outPath, transform, mimeType }) {
  const buf = fs.readFileSync(inPath);
  const { json, bin } = parseGLB(buf);
  const changes = [];

  const newImageBytes = [];
  for (let i = 0; i < (json.images || []).length; i++) {
    const img = json.images[i];
    if (img.bufferView === undefined) { newImageBytes.push(null); continue; }
    const bv = json.bufferViews[img.bufferView];
    const start = bv.byteOffset || 0;
    const src = bin.subarray(start, start + bv.byteLength);
    const outBytes = await transform(src, i);
    if (!Buffer.isBuffer(outBytes) || outBytes.length === 0) throw new Error(`贴图 ${i} 处理后为空（禁止假执行）`);
    newImageBytes.push(outBytes);
    if (mimeType) json.images[i].mimeType = mimeType;
    changes.push(`image ${i}: ${src.length} -> ${outBytes.length} bytes`);
  }

  const { json: newJson, bin: newBin } = compactWithNewImages(json, bin, newImageBytes);
  const outBuf = buildGLB(newJson, newBin);
  fs.writeFileSync(outPath, outBuf);
  return { metrics: { bytes: outBuf.length, sourceBytes: buf.length }, changes };
}

export const textureOps = {
  textureResize: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const { default: sharp } = await import('sharp');
      const maxSize = params.maxSize ?? 1024;
      return rewriteTextures({
        inPath, outPath, mimeType: 'image/png',
        transform: async (bytes) => {
          const info = await sharp(bytes,{limitInputPixels:67108864}).metadata();
          if (info.width <= maxSize && info.height <= maxSize) return bytes; // 已小于阈值，保持原样
          return sharp(bytes,{limitInputPixels:67108864}).resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        },
      }).then((r) => ({ ...r, warnings: ['贴图缩放会改变脸谱/纹样清晰度，需人工确认'] }));
    },
  },
  textureCompress: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const { default: sharp } = await import('sharp');
      const format = params.format ?? 'webp';
      const quality = params.quality ?? 80;
      return rewriteTextures({
        inPath, outPath, mimeType: format === 'webp' ? 'image/webp' : 'image/jpeg',
        transform: async (bytes) => {
          if (format === 'webp') return sharp(bytes,{limitInputPixels:67108864}).webp({ quality }).toBuffer();
          return sharp(bytes,{limitInputPixels:67108864}).jpeg({ quality }).toBuffer();
        },
      }).then((r) => ({ ...r, warnings: ['有损压缩会改变贴图，需人工确认'] }));
    },
  },
};
