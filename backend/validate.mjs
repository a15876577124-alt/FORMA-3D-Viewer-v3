// 上传文件验证：魔数（magic bytes）+ 扩展名白名单 + 大小限制。
// 信任文件内容而非客户端声称的 MIME 类型。
const MAX_FILE_BYTES = 256 * 1024 * 1024; // 256MB

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; this.status = 415; }
}

// 扩展名 -> 校验函数。返回 { format, confidence }。
const CHECKS = [
  {
    ext: '.glb',
    test: (buf) => buf.length >= 12 && buf.readUInt32LE(0) === 0x46546c67 && buf.readUInt32LE(4) === 2,
    format: 'glb',
    note: 'GLB 二进制容器（magic glTF, version 2）',
  },
  {
    ext: '.gltf',
    test: (buf) => looksLikeGltfJson(buf),
    format: 'gltf',
    note: 'glTF JSON',
  },
  {
    ext: '.fbx',
    test: (buf) => buf.length >= 18 && buf.toString('latin1', 0, 18) === 'Kaydara FBX Binary',
    format: 'fbx-binary',
    note: 'FBX 二进制（Kaydara magic）',
  },
  {
    // ASCII FBX: 以 "; FBX ..." 注释头开头
    ext: '.fbx',
    test: (buf) => /^\s*;\s*FBX\s+\d/i.test(buf.subarray(0, 64).toString('latin1')),
    format: 'fbx-ascii',
    note: 'FBX ASCII',
  },
  {
    ext: '.obj',
    test: (buf) => looksLikeObj(buf),
    format: 'obj',
    note: 'Wavefront OBJ',
  },
  {
    ext: '.mtl',
    test: (buf) => looksLikeMtl(buf),
    format: 'mtl',
    note: 'OBJ 材质库',
  },
  {
    ext: '.png',
    test: (buf) => buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47,
    format: 'png',
    note: 'PNG 图像',
  },
  {
    ext: '.jpg',
    test: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
    format: 'jpg',
    note: 'JPEG 图像',
  },
  {
    ext: '.jpeg',
    test: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
    format: 'jpg',
    note: 'JPEG 图像',
  },
  {
    ext: '.webp',
    test: (buf) => buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP',
    format: 'webp',
    note: 'WebP 图像',
  },
];

function looksLikeGltfJson(buf) {
  // 跳过 BOM 与空白，必须以 { 开头；并包含 asset 章节关键字
  let i = 0;
  while (i < buf.length && (buf[i] === 0xef || buf[i] === 0xbb || buf[i] === 0xbf || buf[i] <= 0x20)) i++;
  if (buf[i] !== 0x7b) return false; // '{'
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8');
  return /"asset"\s*:/.test(head) && /"version"\s*:/.test(head);
}

function looksLikeObj(buf) {
  const head = buf.subarray(0, Math.min(buf.length, 8192)).toString('utf8');
  // OBJ 关键行：v / vt / vn / f / o / g / usemtl / mtllib
  return /^\s*(v|vt|vn|f|o|g|s|usemtl|mtllib)\s/m.test(head);
}

function looksLikeMtl(buf) {
  const head = buf.subarray(0, Math.min(buf.length, 8192)).toString('utf8');
  return /^\s*(newmtl|Ka|Kd|Ks|Ns|d|map_Kd|map_Bump|illum)\s/m.test(head);
}

// 从文件名提取小写扩展名（不含点）
export function extOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? '.' + m[1].toLowerCase() : '';
}

// 校验单个文件。返回 { format, note }；失败抛 ValidationError。
export function validateFile(name, buf) {
  if (!buf || !Buffer.isBuffer(buf)) throw new ValidationError('文件内容缺失');
  if (buf.length === 0) throw new ValidationError('空文件');
  if (buf.length > MAX_FILE_BYTES) {
    throw new ValidationError(`文件超过大小上限 ${(MAX_FILE_BYTES / 1048576) | 0}MB`);
  }
  const ext = extOf(name);
  const candidates = CHECKS.filter((c) => c.ext === ext);
  if (candidates.length === 0) {
    throw new ValidationError(`不支持的扩展名 ${ext || '(无)'}；支持: glb/gltf/obj/mtl/fbx/png/jpg/jpeg/webp`);
  }
  const hit = candidates.find((c) => {
    try { return c.test(buf); } catch { return false; }
  });
  if (!hit) {
    throw new ValidationError(`文件内容与扩展名 ${ext} 不匹配（魔数校验失败）——可能损坏或伪造`);
  }
  return { format: hit.format, note: hit.note, ext };
}

// 清理文件名：去掉路径分隔符与危险字符，保留中文等安全字符。
export function sanitizeName(name) {
  const base = String(name || '').replace(/^.*[\\/]/, ''); // 去掉客户端可能夹带的路径
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim();
  if (!cleaned) throw new ValidationError('文件名为空或仅含非法字符');
  return cleaned.slice(0, 120);
}

export { MAX_FILE_BYTES };
