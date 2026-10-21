// 生成带纹理的 FBX 测试样例（内嵌 / 外部 / 缺失 三态齐备）。
// 机器上没有 Blender，二进制样例走「解析真实 FBX → 注入 Video 节点 → 原样序列化」
// 的路子：既保证文件仍能被 three FBXLoader 解析，又造出了真实的内嵌贴图字节。
//   node tools/make-fbx-texture-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseTree, serializeTree, findNode } from '../backend/fbxTree.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'test-assets', 'fbx-textures');

async function makePng(w, h, rgb) {
  return sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer();
}

function videoNode({ id, name, uri, content }) {
  const node = {
    name: 'Video',
    props: [{ type: 'L', value: BigInt(id) }, { type: 'S', value: `Video::${name}` }, { type: 'S', value: 'Clip' }],
    children: [
      { name: 'Type', props: [{ type: 'S', value: 'Clip' }], children: [] },
      { name: 'RelativeFilename', props: [{ type: 'S', value: uri }], children: [] },
    ],
  };
  if (content) node.children.push({ name: 'Content', props: [{ type: 'R', value: content }], children: [] });
  return node;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const embedded = await makePng(8, 8, { r: 200, g: 60, b: 40 });
const external = await makePng(16, 16, { r: 40, g: 90, b: 180 });
fs.writeFileSync(path.join(OUT_DIR, 'shipped.png'), external);

// ---------- 1. 二进制：在真实 FBX 的 Objects 下注入 3 个 Video ----------
const src = fs.readFileSync(path.join(ROOT, 'test-assets', 'vCube.fbx'));
const { version, tree } = parseTree(src);
const objects = findNode(tree, 'Objects');
if (!objects) throw new Error('源 FBX 没有 Objects 节点');
objects.children.push(
  videoNode({ id: 900001, name: 'tex_embedded', uri: 'embedded.png', content: embedded }),
  videoNode({ id: 900002, name: 'tex_shipped', uri: 'shipped.png', content: null }),
  videoNode({ id: 900003, name: 'tex_missing', uri: 'not-shipped.png', content: null }),
);
const outBin = serializeTree({ version, tree });
fs.writeFileSync(path.join(OUT_DIR, 'textured-binary.fbx'), outBin);

// ---------- 2. ASCII：在真实样例（ascii-cube.fbx）的 Objects 块里注入 Video ----------
const baseAscii = fs.readFileSync(path.join(ROOT, 'test-assets', 'ascii-cube.fbx'), 'utf8').split(/\r?\n/);
const objAt = baseAscii.findIndex((l) => /^Objects:/.test(l));
if (objAt < 0) throw new Error('源 ASCII FBX 没有 Objects 块');
let closeAt = -1;
for (let i = objAt + 1; i < baseAscii.length; i++) if (baseAscii[i] === '}') { closeAt = i; break; }
if (closeAt < 0) throw new Error('Objects 块未闭合');
const videoBlocks = [
  `\tVideo: 800001, "Video::tex_embedded", "Clip" {`,
  `\t\tType: "Clip"`,
  `\t\tRelativeFilename: "embedded.png"`,
  `\t\tContent:  *1 {`,
  `\t\t\ta: "${embedded.toString('base64')}"`,
  `\t\t}`,
  `\t}`,
  `\tVideo: 800002, "Video::tex_shipped", "Clip" {`,
  `\t\tType: "Clip"`,
  `\t\tRelativeFilename: "shipped.png"`,
  `\t}`,
  `\tVideo: 800003, "Video::tex_missing", "Clip" {`,
  `\t\tType: "Clip"`,
  `\t\tRelativeFilename: "not-shipped.png"`,
  `\t}`,
];
const ascii = [...baseAscii.slice(0, closeAt), ...videoBlocks, ...baseAscii.slice(closeAt)].join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'textured-ascii.fbx'), ascii);

console.log(`生成完成：
  ${path.relative(ROOT, path.join(OUT_DIR, 'textured-binary.fbx'))} (${outBin.length} bytes, v${version})
  ${path.relative(ROOT, path.join(OUT_DIR, 'textured-ascii.fbx'))} (${Buffer.byteLength(ascii)} bytes)
  ${path.relative(ROOT, path.join(OUT_DIR, 'shipped.png'))} (${external.length} bytes，外部存在)
  not-shipped.png —— 故意不生成，用于「缺失」判定`);
