// Splits one of the shipped GLBs into a NON-embedded glTF package:
//     <id>.gltf  +  <id>.bin  +  <id>.png
// with the buffer and image referenced by URI instead of being packed into the
// container. Used by tools/test-import.mjs to exercise the .gltf code path with
// real external dependencies (which the OBJ/GLB tests never touch).
//
//   node tools/make-gltf-sample.mjs [id]
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from './glbkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] || 'sheng';
const SRC = path.join(ROOT, 'assets', 'models', `${id}.glb`);
const OUT = path.join(ROOT, 'test-assets', 'gltf-package');

const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg' };

async function main() {
  const buf = await fs.readFile(SRC);
  const { json, bin } = parseGLB(buf);
  await fs.mkdir(OUT, { recursive: true });

  // 1. buffer -> external .bin
  const binName = `${id}.bin`;
  await fs.writeFile(path.join(OUT, binName), bin);
  json.buffers = [{ uri: binName, byteLength: bin.length }];

  // 2. images -> external texture files
  const written = [];
  const images = json.images || [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const bv = json.bufferViews[img.bufferView];
    const mime = img.mimeType || 'image/png';
    const ext = MIME[mime] || 'png';
    const name = images.length > 1 ? `${id}_${i}.${ext}` : `${id}.${ext}`;
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    await fs.writeFile(path.join(OUT, name), data);
    img.uri = name;
    delete img.bufferView;
    delete img.mimeType;
    written.push(name);
  }

  // 3. bufferViews no longer need to carry a buffer index of 0 into GLB BIN -
  //    glTF 2.0 defaults bufferView.buffer to 0, which is our external file.
  const gltfText = JSON.stringify(json, null, 1);
  const gltfName = `${id}.gltf`;
  await fs.writeFile(path.join(OUT, gltfName), gltfText, 'utf8');

  console.log(`已生成 ${path.relative(ROOT, path.join(OUT, gltfName))}`);
  console.log(`  ├── ${binName}  ${bin.length} 字节`);
  for (const w of written) {
    const st = await fs.stat(path.join(OUT, w));
    console.log(`  └── ${w}  ${st.size} 字节`);
  }
  console.log('\n导入时请同时选择这三个文件（多选）。');
}

main().catch((e) => { console.error(e); process.exit(1); });
