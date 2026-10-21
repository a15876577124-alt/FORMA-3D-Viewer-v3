// FBX 二进制节点树的解析与序列化（Kaydara FBX Binary）。
//
// 只做两件事，但要求字节级可靠：
//   1. parseTree：把节点树完整读出来（属性原样保留，含压缩数组的原始字节）
//   2. serializeTree：把树写回二进制（两遍：先算尺寸，再写 EndOffset）
// 有了这对能力就能「读真实 FBX → 注入 Video 节点 → 写回」，
// 从而在没有 Blender 的机器上造出带内嵌贴图的真实二进制 FBX 样例。

export const FBX_MAGIC = 'Kaydara FBX Binary  \x00';

export function readVersion(buf) {
  if (buf.length < 27 || buf.toString('latin1', 0, 21) !== FBX_MAGIC) return null;
  return buf.readUInt32LE(23);
}

function readProp(buf, off) {
  const t = String.fromCharCode(buf[off]);
  let p = off + 1;
  switch (t) {
    case 'Y': return { type: t, value: buf.readInt16LE(p), next: p + 2 };
    case 'C': return { type: t, value: buf[p] === 1, next: p + 1 };
    case 'I': return { type: t, value: buf.readInt32LE(p), next: p + 4 };
    case 'F': return { type: t, value: buf.readFloatLE(p), next: p + 4 };
    case 'D': return { type: t, value: buf.readDoubleLE(p), next: p + 8 };
    case 'L': return { type: t, value: buf.readBigInt64LE(p), next: p + 8 };
    case 'S': {
      const len = buf.readUInt32LE(p);
      return { type: t, value: buf.toString('binary', p + 4, p + 4 + len), next: p + 4 + len };
    }
    case 'R': {
      const len = buf.readUInt32LE(p);
      return { type: t, value: buf.subarray(p + 4, p + 4 + len), next: p + 4 + len };
    }
    case 'f': case 'd': case 'l': case 'i': case 'b': {
      const count = buf.readUInt32LE(p);
      const encoding = buf.readUInt32LE(p + 4);
      const compLen = buf.readUInt32LE(p + 8);
      const start = p + 12;
      const end = start + (encoding ? compLen : count * (t === 'd' || t === 'l' ? 8 : 4));
      return { type: t, value: { count, encoding, bytes: buf.subarray(start, end) }, next: end };
    }
    default: return null;
  }
}

function headerSize(wide) { return wide ? 25 : 13; }

function isNullRecord(buf, off, wide) {
  const n = headerSize(wide);
  if (off + n > buf.length) return true;
  for (let i = 0; i < n; i++) if (buf[off + i] !== 0) return false;
  return true;
}

// 解析单个节点（含子节点），返回 { node, next }
function parseNode(buf, off, version) {
  const wide = version >= 7500;
  if (isNullRecord(buf, off, wide)) return { node: null, next: off + headerSize(wide) };
  let endOffset, numProps, propLen, nameLen, name, childStart;
  if (wide) {
    endOffset = Number(buf.readBigUInt64LE(off));
    numProps = Number(buf.readBigUInt64LE(off + 8));
    propLen = Number(buf.readBigUInt64LE(off + 16));
    nameLen = buf[off + 24];
    name = buf.toString('latin1', off + 25, off + 25 + nameLen);
    childStart = off + 25 + nameLen + propLen;
  } else {
    endOffset = buf.readUInt32LE(off);
    numProps = buf.readUInt32LE(off + 4);
    propLen = buf.readUInt32LE(off + 8);
    nameLen = buf[off + 12];
    name = buf.toString('latin1', off + 13, off + 13 + nameLen);
    childStart = off + 13 + nameLen + propLen;
  }
  // EndOffset = 0 表示「直到文件末尾」（根节点常见写法）
  const end = endOffset && endOffset > off ? endOffset : buf.length;
  const props = [];
  let p = childStart - propLen;
  const propsEnd = childStart;
  for (let i = 0; i < numProps && p < propsEnd; i++) {
    const r = readProp(buf, p);
    if (!r) break;
    props.push({ type: r.type, value: r.value });
    p = r.next;
  }
  const node = { name, props, children: [] };
  let c = childStart;
  let guard = 0;
  let terminator = -1;
  while (c < end && guard++ < 100000) {
    if (isNullRecord(buf, c, wide)) { terminator = c; break; }
    const r = parseNode(buf, c, version);
    if (!r.node) { terminator = c; break; }
    node.children.push(r.node);
    c = r.next;
  }
  // EndOffset=0 表示「到文件尾」——此时以子节点列表的终止记录为准，
  // 否则会把文件尾部（FBX 的 footer）误当成节点内容。
  const realEnd = endOffset ? end : (terminator >= 0 ? terminator + headerSize(wide) : end);
  return { node, next: realEnd };
}

export function parseTree(buf) {
  const version = readVersion(buf);
  if (version == null) throw new Error('不是二进制 FBX');
  const root = { name: '__root__', props: [], children: [] };
  let off = 27;
  let guard = 0;
  while (off < buf.length - 8 && guard++ < 10000) {
    if (isNullRecord(buf, off, version >= 7500)) break;
    const r = parseNode(buf, off, version);
    if (!r.node) break;
    root.children.push(r.node);
    if (r.next <= off) break;
    off = r.next;
  }
  // 顶层列表的终止记录不算尾部块（序列化时会自己写），跳过后剩余字节才是
  // FBX 尾部（padding + 版本魔数），必须原样保留，否则解析端会报错。
  if (isNullRecord(buf, off, version >= 7500)) off += headerSize(version >= 7500);
  const footer = buf.subarray(off);
  return { version, tree: root, footer };
}

// ------------------------------------------------------------- 序列化 ----

function propSize(p, wide) {
  switch (p.type) {
    case 'Y': return 3;
    case 'C': return 2;
    case 'I': case 'F': return 5;
    case 'D': case 'L': return 9;
    case 'S': case 'R': return 5 + Buffer.byteLength(p.value, 'binary');
    case 'f': case 'd': case 'l': case 'i': case 'b': return 13 + p.value.bytes.length;
    default: throw new Error('未知属性类型 ' + p.type);
  }
}

function writeProp(buf, p, off, wide) {
  buf.write(p.type, off, 'latin1');
  let q = off + 1;
  switch (p.type) {
    case 'Y': buf.writeInt16LE(p.value, q); return q + 2;
    case 'C': buf[q] = p.value ? 1 : 0; return q + 1;
    case 'I': buf.writeInt32LE(p.value, q); return q + 4;
    case 'F': buf.writeFloatLE(p.value, q); return q + 4;
    case 'D': buf.writeDoubleLE(p.value, q); return q + 8;
    case 'L': buf.writeBigInt64LE(BigInt(p.value), q); return q + 8;
    case 'S': {
      const b = Buffer.from(p.value, 'binary');
      buf.writeUInt32LE(b.length, q); b.copy(buf, q + 4); return q + 4 + b.length;
    }
    case 'R': {
      const b = Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value || [], 'binary');
      buf.writeUInt32LE(b.length, q); b.copy(buf, q + 4); return q + 4 + b.length;
    }
    case 'f': case 'd': case 'l': case 'i': case 'b': {
      const v = p.value;
      buf.writeUInt32LE(v.count, q);
      buf.writeUInt32LE(v.encoding || 0, q + 4);
      buf.writeUInt32LE(v.bytes.length, q + 8);
      v.bytes.copy(buf, q + 12);
      return q + 12 + v.bytes.length;
    }
    default: throw new Error('未知属性类型 ' + p.type);
  }
}

// 节点序列化后的总字节数（含头 + 属性 + 子节点 + 终止记录）
function nodeSize(node, wide) {
  const h = headerSize(wide);
  let n = h + Buffer.byteLength(node.name, 'latin1');
  for (const p of node.props) n += propSize(p, wide);
  if (node.children.length) {
    for (const c of node.children) n += nodeSize(c, wide);
    n += h; // 子节点列表的终止记录
  }
  return n;
}

function writeNode(buf, node, off, wide, endOffset) {
  const h = headerSize(wide);
  let p = off;
  if (wide) {
    buf.writeBigUInt64LE(BigInt(endOffset), p);
    buf.writeBigUInt64LE(BigInt(node.props.length), p + 8);
    const propLen = node.props.reduce((s, x) => s + propSize(x, wide), 0);
    buf.writeBigUInt64LE(BigInt(propLen), p + 16);
    buf[p + 24] = Buffer.byteLength(node.name, 'latin1');
    buf.write(node.name, p + 25, 'latin1');
    p += 25 + Buffer.byteLength(node.name, 'latin1');
  } else {
    buf.writeUInt32LE(endOffset, p);
    buf.writeUInt32LE(node.props.length, p + 4);
    const propLen = node.props.reduce((s, x) => s + propSize(x, wide), 0);
    buf.writeUInt32LE(propLen, p + 8);
    buf[p + 12] = Buffer.byteLength(node.name, 'latin1');
    buf.write(node.name, p + 13, 'latin1');
    p += 13 + Buffer.byteLength(node.name, 'latin1');
  }
  for (const prop of node.props) p = writeProp(buf, prop, p, wide);
  if (node.children.length) {
    for (const c of node.children) {
      const size = nodeSize(c, wide);
      writeNode(buf, c, p, wide, p + size);
      p += size;
    }
    buf.fill(0, p, p + h); // 子节点终止记录
    p += h;
  }
  return p;
}

export function serializeTree({ version, tree, footer = null }) {
  const wide = version >= 7500;
  const h = headerSize(wide);
  const tail = footer && footer.length ? footer : Buffer.alloc(0);
  let total = 27;
  for (const c of tree.children) total += nodeSize(c, wide);
  total += h; // 顶层节点列表的终止记录
  const buf = Buffer.alloc(total + tail.length);
  buf.write(FBX_MAGIC, 0, 'latin1');
  buf[20] = 0x00; buf[21] = 0x1a; buf[22] = 0x00;
  buf.writeUInt32LE(version, 23);
  let p = 27;
  for (const c of tree.children) {
    const size = nodeSize(c, wide);
    writeNode(buf, c, p, wide, p + size);
    p += size;
  }
  buf.fill(0, p, p + h); // 终止记录
  p += h;
  tail.copy(buf, p);      // 原样保留尾部块
  return buf;
}

// 在树中查找（按名字，深度优先返回第一个）
export function findNode(node, name) {
  for (const c of node.children) {
    if (c.name === name) return c;
    const deep = findNode(c, name);
    if (deep) return deep;
  }
  return null;
}

export function findAll(node, name, out = []) {
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}
