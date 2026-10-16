// 容器/材质算子（自研，纯 JSON 编辑 + buildGLB，不动 BIN 字节）：
// fixMaterials（metallic/roughness）/ setSampler / textureReport（只读报告）。
import fs from 'node:fs';
import { sha256 } from '../../tools/glbkit.mjs';
import { loadGLB, buildGLB } from './glbWrite.mjs';
import { sniffImageSize } from '../texture-sniff.mjs';

export const containerOps = {
  fixMaterials: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const buf = fs.readFileSync(inPath);
      const { json, bin } = loadGLB(buf);
      const metallicFactor = params.metallicFactor ?? 0;
      const roughnessFactor = params.roughnessFactor ?? 1;
      const changes = [];
      for (const mat of json.materials || []) {
        const pbr = mat.pbrMetallicRoughness || (mat.pbrMetallicRoughness = {});
        if (!pbr.metallicRoughnessTexture) {
          const prev = pbr.metallicFactor;
          pbr.metallicFactor = metallicFactor;
          changes.push(`${mat.name || '(未命名)'} metallicFactor ${prev === undefined ? '(缺省=1.0)' : prev} -> ${metallicFactor}`);
        } else {
          changes.push(`${mat.name || '(未命名)'} 有 metallicRoughness 贴图，跳过 metallicFactor`);
        }
        if (pbr.roughnessFactor === undefined) { pbr.roughnessFactor = roughnessFactor; changes.push(`${mat.name || '(未命名)'} roughnessFactor -> ${roughnessFactor}`); }
      }
      delete json.__bin;
      const outBuf = buildGLB(json, bin);
      fs.writeFileSync(outPath, outBuf);
      return { metrics: { bytes: outBuf.length, sourceSha256: sha256(buf) }, changes, warnings: ['材质金属度/粗糙度改变会改变渲染外观，需人工确认'] };
    },
  },
  setSampler: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      const buf = fs.readFileSync(inPath);
      const { json, bin } = loadGLB(buf);
      json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
      if (json.textures) for (const tex of json.textures) tex.sampler = 0;
      delete json.__bin;
      const outBuf = buildGLB(json, bin);
      fs.writeFileSync(outPath, outBuf);
      return { metrics: { bytes: outBuf.length }, changes: ['+sampler(LINEAR/LINEAR_MIPMAP_LINEAR/REPEAT)'] };
    },
  },
  textureReport: {
    appearance: false,
    async run({ inPath, outPath, params }) {
      // 只读报告：真实解析贴图尺寸，不改任何字节
      const buf = fs.readFileSync(inPath);
      const { json, bin } = loadGLB(buf);
      const report = [];
      for (let i = 0; i < (json.images || []).length; i++) {
        const img = json.images[i];
        let bytes = null;
        if (img.bufferView !== undefined && json.bufferViews) {
          const bv = json.bufferViews[img.bufferView];
          bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
        }
        const size = bytes ? sniffImageSize(bytes) : null;
        report.push({ index: i, name: img.name || `image-${i}`, width: size?.width ?? null, height: size?.height ?? null, bytes: bytes?.length ?? null, mimeType: img.mimeType || null });
      }
      fs.copyFileSync(inPath, outPath); // textureReport 不改数据，产物=原文件（诚实：无变更）
      return { metrics: { bytes: buf.length }, changes: [], report };
    },
  },
};
