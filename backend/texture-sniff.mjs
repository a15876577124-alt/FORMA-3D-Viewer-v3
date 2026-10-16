// 贴图尺寸嗅探：从图像二进制头部真实解析宽高（不依赖第三方图像库）。
// 支持 PNG / JPEG / WebP(VP8/VP8L/VP8X)。失败返回 null（调用方按未知处理）。
export function sniffImageSize(buf) {
  if (!buf || buf.length < 16) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height big-endian @16
  if (buf.readUInt32BE(0) === 0x89504e47) {
    if (buf.toString('latin1', 12, 16) === 'IHDR') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    return null;
  }
  // JPEG: scan SOF0-SOF15 markers for dimensions
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { off += 2; continue; }
      if (marker === 0xda) break; // start of scan - no SOF found
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
    return null;
  }
  // WebP: RIFF....WEBP
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('latin1', 12, 16);
    if (fourcc === 'VP8X') {
      // 24-bit little-endian width-1 / height-1 at offset 24
      return { width: (buf.readUIntLE(24, 3) + 1), height: (buf.readUIntLE(27, 3) + 1) };
    }
    if (fourcc === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  return null;
}

export function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}
