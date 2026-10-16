// 格式转换算子：GLB ↔ GLTF ↔ OBJ（真实转换，verts/tris 保持一致）。
// FBX 只能读不能写（three.js 无 FBXExporter）→ 明确报错，绝不假装支持。
import fs from 'node:fs';
import path from 'node:path';
import { readAccessor, sha256 } from '../../tools/glbkit.mjs';
import { loadGLB, buildGLB } from './glbWrite.mjs';

// GLB → GLTF：JSON 直写 .gltf；BIN 切片写 .bin；内嵌贴图切片写文件（不重编码，sha256 一致）。
function glbToGltf({ inPath, outDir, outPath }) {
  const buf = fs.readFileSync(inPath);
  const { json, bin } = loadGLB(buf);
  const base = path.basename(outPath, path.extname(outPath)); // 遵循 outPath 基准名
  const gltfPath = outPath;
  const binPath = path.join(outDir, `${base}.bin`);

  // BIN 切片（去掉 4 字节对齐填充）
  const binLen = json.buffers?.[0]?.byteLength ?? bin.length;
  fs.writeFileSync(binPath, bin.subarray(0, binLen));

  // 贴图切片
  const texDir = path.join(outDir, 'textures');
  const files = [path.basename(gltfPath), path.basename(binPath)];
  if (json.images?.length) fs.mkdirSync(texDir, { recursive: true });
  for (let i = 0; i < (json.images || []).length; i++) {
    const img = json.images[i];
    if (img.bufferView === undefined) continue;
    const bv = json.bufferViews[img.bufferView];
    const start = bv.byteOffset || 0;
    const imgBytes = bin.subarray(start, start + bv.byteLength);
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[img.mimeType] || '.bin';
    const imgName = `texture-${i}${ext}`;
    fs.writeFileSync(path.join(texDir, imgName), imgBytes);
    // 改为 uri 引用
    img.uri = `textures/${imgName}`;
    delete img.bufferView;
    delete img.mimeType;
    files.push(`textures/${imgName}`);
  }

  // buffer 改为 uri
  if (json.buffers?.[0]) {
    json.buffers[0].uri = `${base}.bin`;
    delete json.buffers[0].byteLength;
  }
  delete json.__bin;
  fs.writeFileSync(gltfPath, JSON.stringify(json));
  return { outPath: gltfPath, files };
}

// GLTF → GLB：外部 .bin 与贴图归集成单个 BIN。
function gltfToGlb({ inPath, outDir, outPath }) {
  const dir = path.dirname(inPath);
  const json = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const base = path.basename(outPath, path.extname(outPath));

  // 归集 buffers
  let bin = Buffer.alloc(0);
  for (let i = 0; i < (json.buffers || []).length; i++) {
    const b = json.buffers[i];
    let bytes;
    if (b.uri?.startsWith('data:')) {
      const m = /^data:[^;,]+;base64,(.*)$/s.exec(b.uri);
      bytes = Buffer.from(m[1], 'base64');
    } else if (b.uri) {
      bytes = fs.readFileSync(path.resolve(dir, decodeURIComponent(b.uri)));
    } else {
      continue; // 无 uri 的 buffer 不应出现在 .gltf
    }
    const pad = (4 - (bin.length % 4)) % 4;
    if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    const offset = bin.length;
    json.buffers[i] = { byteLength: bytes.length };
    // 修正该 buffer 所有 bufferView 的 byteOffset（相对 buffer 内偏移）
    const baseOffset = offset;
    for (const bv of json.bufferViews || []) {
      if (bv.buffer === i) { bv.buffer = 0; bv.byteOffset = (bv.byteOffset || 0) + baseOffset; }
    }
    bin = Buffer.concat([bin, bytes]);
  }

  // 归集贴图
  for (let i = 0; i < (json.images || []).length; i++) {
    const img = json.images[i];
    if (img.bufferView !== undefined) continue;
    if (!img.uri) continue;
    if (img.uri.startsWith('data:')) {
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(img.uri);
      const imgBytes = Buffer.from(m[2], 'base64');
      const pad = (4 - (bin.length % 4)) % 4;
      if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
      const offset = bin.length;
      json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: imgBytes.length });
      img.bufferView = json.bufferViews.length - 1;
      img.mimeType = m[1];
      delete img.uri;
      bin = Buffer.concat([bin, imgBytes]);
    } else {
      const imgBytes = fs.readFileSync(path.resolve(dir, decodeURIComponent(img.uri)));
      const pad = (4 - (bin.length % 4)) % 4;
      if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
      const offset = bin.length;
      json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: imgBytes.length });
      img.bufferView = json.bufferViews.length - 1;
      delete img.uri;
      bin = Buffer.concat([bin, imgBytes]);
    }
  }

  json.buffers = json.buffers.map((b) => ({ byteLength: b.byteLength }));
  if (!json.buffers.length && bin.length) json.buffers = [{ byteLength: bin.length }];
  const outBuf = buildGLB(json, bin);
  fs.writeFileSync(outPath, outBuf);
  return { outPath, files: [path.basename(outPath)] };
}

// GLB/GLTF → OBJ：用 readAccessor 真实展开为 v/vt/f。
function toObj({ inPath, outDir, outPath, json, bin }) {
  const base = path.basename(outPath, path.extname(outPath));
  const outPathObj = outPath;
  const lines = ['# FORMA pipeline: converted from ' + path.basename(inPath)];
  const usedMaterials = [];
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const pos = readAccessor(json, prim.attributes.POSITION);
      const idx = prim.indices !== undefined ? readAccessor(json, prim.indices) : null;
      const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, prim.attributes.TEXCOORD_0) : null;
      const n = idx ? idx.count : pos.count;
      lines.push(`o ${mesh.name || 'mesh'}`);
      for (let i = 0; i < pos.count; i++) {
        lines.push(`v ${pos.data[i * 3]} ${pos.data[i * 3 + 1]} ${pos.data[i * 3 + 2]}`);
      }
      if (uv) for (let i = 0; i < uv.count; i++) lines.push(`vt ${uv.data[i * 2]} ${uv.data[i * 2 + 1]}`);
      const matName = prim.material !== undefined && json.materials?.[prim.material]?.name ? json.materials[prim.material].name : 'default';
      if (!usedMaterials.includes(matName)) usedMaterials.push(matName);
      lines.push(`usemtl ${matName}`);
      for (let i = 0; i < n; i += 3) {
        if (idx) {
          const a = idx.data[i] + 1, b = idx.data[i + 1] + 1, c = idx.data[i + 2] + 1;
          lines.push(uv ? `f ${a}/${a} ${b}/${b} ${c}/${c}` : `f ${a} ${b} ${c}`);
        } else {
          const a = i + 1, b = i + 2, c = i + 3;
          lines.push(uv ? `f ${a}/${a} ${b}/${b} ${c}/${c}` : `f ${a} ${b} ${c}`);
        }
      }
    }
  }
  // .mtl 基础材质（OBJ 无 PBR，明确警告）
  const mtlPath = path.join(outDir, `${base}.mtl`);
  const mtl = usedMaterials.map((m) => `newmtl ${m}\nKd 0.8 0.8 0.8\n`).join('\n');
  fs.writeFileSync(mtlPath, mtl);
  fs.writeFileSync(outPathObj, lines.join('\n') + '\n');
  return { outPath: outPathObj, files: [path.basename(outPathObj), path.basename(mtlPath)] };
}

export const convertOps = {
  convert: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const to = params.to;
      if (to === 'fbx') {
        const err = new Error('FBX 只能读取不能导出（three.js 无 FBXExporter），请选择 glb/gltf/obj');
        err.status = 400; throw err;
      }
      const buf = fs.readFileSync(inPath);
      const { json, bin } = loadGLB(buf);
      const outDir = path.dirname(outPath);
      fs.mkdirSync(outDir, { recursive: true });

      let result;
      if (to === 'gltf') {
        result = glbToGltf({ inPath, outDir, outPath });
      } else if (to === 'obj') {
        result = toObj({ inPath, outDir, outPath, json, bin });
      } else if (to === 'glb') {
        // 输入可能已是 glb，复制即可；若为 gltf 则归集
        if (inPath.toLowerCase().endsWith('.gltf')) result = gltfToGlb({ inPath, outDir, outPath });
        else { fs.copyFileSync(inPath, outPath); result = { outPath, files: [path.basename(outPath)] }; }
      } else {
        const err = new Error(`不支持的转换目标: ${to}`);
        err.status = 400; throw err;
      }
      return {
        metrics: { bytes: fs.statSync(result.outPath).size, sourceSha256: sha256(buf), files: result.files },
        changes: [`convert -> ${to}: ${result.files.join(', ')}`],
        warnings: to === 'obj' ? ['OBJ 不支持 PBR（metallic/roughness 丢失），需人工确认'] : [],
      };
    },
  },
};
