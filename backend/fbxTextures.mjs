// FBX 纹理检测与提取：内嵌 / 外部 / 缺失 三态判定 + 内嵌贴图导出。
//
// 为什么不用 three 的 FBXLoader：它在 Node 下没有 URL.createObjectURL，内嵌贴图
// 会被静默丢弃，报告里 textures 恒为 0；而「内嵌 / 外部 / 缺失」正是 FBX 交付里
// 最容易踩的坑（导出方忘打包贴图 → 线上白模）。这里直接读 FBX 节点树取真凭实据。
//
// 二进制走 fbxTree 的完整节点树解析；ASCII 按块解析 Video 定义。
// 只读取、不改写输入；提取产物写到独立目录，绝不覆盖原始素材。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseTree, findAll, readVersion } from './fbxTree.mjs';

export function isBinaryFbx(buf) {
  return readVersion(buf) != null;
}

// ---------------------------------------------------------------- ASCII ----

// ASCII FBX 的 Video 块：RelativeFilename 给外部路径，Content 给内嵌数据（base64）
function parseAsciiVideos(text) {
  const out = [];
  let inVideo = false, cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!inVideo) {
      if (/^Video\s*:/.test(line)) {
        inVideo = true;
        const nm = /^Video:\s*[\d-]+,\s*"(?:(?:Video|Clip)::)?([^"]*)"/.exec(line);
        cur = { name: nm?.[1] || null, props: {} };
      }
      continue;
    }
    if (line === '}') { if (cur) out.push(cur); inVideo = false; cur = null; continue; }
    const rel = /^RelativeFilename:\s*"(.*)"\s*$/.exec(line);
    if (rel) { cur.props.RelativeFilename = rel[1]; continue; }
    const fn = /^FileName:\s*"(.*)"\s*$/.exec(line);
    if (fn) { cur.props.FileName = fn[1]; continue; }
    if (/^Content:/.test(line)) { cur.props.__hasContent = true; continue; }
    const contentLine = /^a:\s*"(.*)"\s*$/.exec(line);
    if (contentLine && cur.props.__hasContent) cur.props.__contentB64 = (cur.props.__contentB64 || '') + contentLine[1];
  }
  return out;
}

// ---------------------------------------------------------------- 公共 ----

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.tga': 'image/x-tga', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.webp': 'image/webp', '.dds': 'image/vnd-ms.dds',
};

// 从字节嗅探图片类型（不依赖扩展名——FBX 里的文件名经常与实际内容不符）
export function sniffImageMime(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes.toString('latin1', 0, 4) === 'DDS ') return 'image/vnd-ms.dds';
  if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return 'image/tiff';
  return null;
}

function pngSize(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return null;
}

function basenameOf(p) {
  const s = String(p || '').replace(/\\/g, '/');
  return s.split('/').pop() || '';
}

const IMG_RE = /\.(png|jpe?g|tga|bmp|tiff?|webp|dds)$/i;

// 子节点属性值（FBX 把 RelativeFilename/Filename/Content 作为 Video 的子节点存放）
function childProp(node, name) {
  const c = node.children.find((x) => x.name === name);
  return c && c.props[0] ? c.props[0].value : null;
}

// 从 Video 节点还原 (name, uri, content)。子节点为准，属性兜底（个别导出器写法不同）
function videoFields(node) {
  const strings = node.props.filter((p) => typeof p.value === 'string').map((p) => p.value);
  const raws = node.props.filter((p) => Buffer.isBuffer(p.value)).map((p) => p.value);
  // 名字来源优先级：节点名 Video::xxx > 属性里的 Video::xxx > 文件名
  const nameFromNode = /Video::(.*)$/.exec(node.name)?.[1]
    || strings.find((s) => /^Video::/.test(s))?.replace(/^Video::/, '')
    || null;
  let uri = childProp(node, 'RelativeFilename') || childProp(node, 'Filename') || null;
  let content = childProp(node, 'Content');
  if (typeof content === 'string' && content) content = Buffer.from(content, 'base64');
  if (!uri) uri = strings.find((s) => IMG_RE.test(s)) || strings.find((s) => s && !/^(Clip|Video)$/.test(s)) || null;
  if (!content) content = raws.length ? raws.reduce((a, b) => (b.length > a.length ? b : a)) : null;
  return {
    name: nameFromNode || basenameOf(uri) || basenameOf(strings[0]) || 'texture',
    uri,
    content,
  };
}

// 收集原始引用（尚未判定三态）
function collectRefs(buf) {
  if (isBinaryFbx(buf)) {
    const { tree } = parseTree(buf);
    return findAll(tree, 'Video').map(videoFields);
  }
  return parseAsciiVideos(buf.toString('utf8')).map((v) => ({
    name: v.name || basenameOf(v.props.RelativeFilename) || 'texture',
    uri: v.props.RelativeFilename || v.props.FileName || null,
    content: v.props.__contentB64 ? Buffer.from(v.props.__contentB64, 'base64') : null,
  }));
}

// 主解析：判定 内嵌 / 外部 / 缺失，并把内嵌字节带出（供提取使用）
export function detectFbxTexturesDetailed(buf, { baseDir = null } = {}) {
  const refs = collectRefs(buf);
  const out = [];
  for (let i = 0; i < refs.length; i++) {
    const f = refs[i];
    const bytes = f.content && f.content.length ? f.content : null;
    const uri = f.uri || null;
    let source = 'missing', resolvedPath = null;
    if (bytes) source = 'embedded';
    else if (uri) {
      // 外部引用：按 FBX 所在目录解析一次；找不到即判 missing（不猜测、不回退）
      const cand = baseDir ? path.resolve(baseDir, uri) : null;
      if (cand && fs.existsSync(cand) && fs.statSync(cand).isFile()) { source = 'external'; resolvedPath = cand; }
    }
    const sniffed = bytes ? sniffImageMime(bytes) : null;
    const dims = bytes ? pngSize(bytes) : null;
    const disk = source === 'external' ? fs.readFileSync(resolvedPath) : null;
    const diskDims = disk ? pngSize(disk) : null;
    const payload = bytes || disk;
    out.push({
      index: i,
      name: f.name,
      uri,
      source,                                   // embedded | external | missing
      content: bytes,
      bytes: payload ? payload.length : null,
      sha256: payload ? crypto.createHash('sha256').update(payload).digest('hex') : null,
      mime: sniffed || (disk ? sniffImageMime(disk) : null) || (uri ? MIME_BY_EXT[path.extname(uri).toLowerCase()] || null : null),
      width: dims?.width ?? diskDims?.width ?? null,
      height: dims?.height ?? diskDims?.height ?? null,
      resolvedPath,
    });
  }
  return out;
}

// 只返回元数据（不含字节内容）——给分析报告用
export function detectFbxTextures(buf, { baseDir = null } = {}) {
  return detectFbxTexturesDetailed(buf, { baseDir }).map(({ content, ...meta }) => meta);
}

// 提取内嵌贴图到 outDir（只写新文件，绝不覆盖；同名加 -1/-2 后缀）
export function extractEmbeddedTextures(buf, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const t of detectFbxTexturesDetailed(buf)) {
    if (t.source !== 'embedded' || !t.content || !t.content.length) continue;
    const ext = (t.mime === 'image/png' && '.png')
      || (t.mime === 'image/jpeg' && '.jpg')
      || (t.mime === 'image/webp' && '.webp')
      || path.extname(t.uri || '') || '.bin';
    const raw = basenameOf(t.uri || t.name).replace(/[^\w.\-]/g, '_') || `texture-${t.index}`;
    const stem = raw.replace(/\.[^.]+$/, '') || `texture-${t.index}`;
    let dest = path.join(outDir, stem + ext);
    let n = 1;
    while (fs.existsSync(dest)) dest = path.join(outDir, `${stem}-${n++}${ext}`);
    fs.writeFileSync(dest, t.content);
    written.push({
      name: path.basename(dest),
      source: t.name,
      uri: t.uri,
      bytes: t.content.length,
      sha256: crypto.createHash('sha256').update(t.content).digest('hex'),
      mime: t.mime, width: t.width, height: t.height,
      path: dest,
    });
  }
  return written;
}

export { MIME_BY_EXT };
