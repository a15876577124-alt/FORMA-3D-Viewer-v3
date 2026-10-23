// GLB 容器写入工具：从 tools/fix-glb.mjs 抽取（不改动已验收的 fix-glb）。
// buildGLB：JSON chunk 4 字节对齐（0x20 填充）+ BIN chunk（0x00 填充）+ UTF-8 JSON。
import { parseGLB } from '../../tools/glbkit.mjs';

export function buildGLB(json, bin) {
  const jsonText = JSON.stringify(json);
  const jsonBuf = Buffer.from(jsonText, 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);

  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  let o = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;
  binChunk.copy(out, o);
  return out;
}

// 读 GLB → { json, bin }（json 上挂 __bin 供 readAccessor 用）。
export function loadGLB(buf) {
  const { json, bin } = parseGLB(buf);
  json.__bin = bin;
  return { json, bin };
}

// 追加一段字节到 BIN（4 字节对齐），返回 { newBin, offset }。
export function appendToBin(bin, bytes) {
  const pad = (4 - (bin.length % 4)) % 4;
  const offset = bin.length + pad;
  const newBin = Buffer.concat([bin, Buffer.alloc(pad, 0), bytes]);
  return { newBin, offset, pad };
}
