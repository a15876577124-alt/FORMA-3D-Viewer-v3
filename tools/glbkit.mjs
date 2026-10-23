// Extract the five original GLB binaries that are Base64-embedded inside
// ../FORMA-3D-Viewer-v2/models/*.js  (read-only source, never written back).
//
// Source files look like:
//   /* FORMA embedded asset... */
//   window.FORMA_ASSETS=window.FORMA_ASSETS||{};window.FORMA_ASSETS[3]="<base64>";
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_BASE = path.resolve(ROOT, '..', 'FORMA-3D-Viewer-v2');
const OUT_DIR = path.join(ROOT, 'assets', 'raw');

// Asset key -> output name -> source .js file (matches viewer.js figurines map)
export const SOURCES = [
  { key: 3, name: 'sheng',      file: 'sheng.js' },
  { key: 4, name: 'dan',        file: 'dan.js' },
  { key: 5, name: 'jing-red',   file: 'jing-red.js' },
  { key: 6, name: 'jing-yellow',file: 'jing-yellow.js' },
  { key: 7, name: 'jing-white', file: 'jing-white.js' },
];

// Expected geometry, cross-checked against the source OBJ. Fails loudly on drift.
export const EXPECTED = {
  'sheng':       { verts: 26951, tris: 47512 },
  'dan':         { verts: 28662, tris: 46828 },
  'jing-red':    { verts: 28472, tris: 49178 },
  'jing-yellow': { verts: 27361, tris: 47852 },
  'jing-white':  { verts: 26720, tris: 46939 },
};

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

export function parseGLB(buf) {
  if (buf.length < 20) throw new Error('too small for GLB');
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  if (magic !== 0x46546c67) throw new Error(`bad magic 0x${magic.toString(16)} (expected glTF)`);
  if (version !== 2) throw new Error(`bad version ${version} (expected 2)`);
  if (total > buf.length) throw new Error(`declared length ${total} > file ${buf.length}`);

  let off = 12;
  let json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (start + len > buf.length) throw new Error(`chunk overruns at ${off}`);
    const data = buf.subarray(start, start + len);
    if (type === 0x4e4f534a) json = data;               // 'JSON'
    else if (type === 0x004e4942) bin = data;           // 'BIN\0'
    off = start + len + ((4 - (len % 4)) % 4);
    if (len === 0) break;
  }
  if (!json) throw new Error('no JSON chunk');
  return { json: JSON.parse(json.toString('utf8')), bin: bin || Buffer.alloc(0) };
}

const COMPONENT = {
  5120: { size: 1, array: Int8Array },
  5121: { size: 1, array: Uint8Array },
  5122: { size: 2, array: Int16Array },
  5123: { size: 2, array: Uint16Array },
  5125: { size: 4, array: Uint32Array },
  5126: { size: 4, array: Float32Array },
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function readAccessor(gltf, index) {
  const acc = gltf.accessors[index];
  if (!acc) throw new Error(`accessor ${index} missing`);
  const comp = COMPONENT[acc.componentType];
  if (!comp) throw new Error(`unsupported componentType ${acc.componentType}`);
  const n = NUM_COMPONENTS[acc.type];
  if (!n) throw new Error(`unsupported accessor type ${acc.type}`);
  const count = acc.count;
  if(!Number.isSafeInteger(count)||count<0||count*n>16777216)throw new Error('accessor exceeds 16M component budget');
  function reader(viewIndex,offset,elements,width,componentType,interleaved=false){
    const bv=gltf.bufferViews?.[viewIndex],c=COMPONENT[componentType];
    if(!bv||!c)throw new Error('missing bufferView or component type');
    const bin=gltf.buffers?.[bv.buffer]?.__bytes||(bv.buffer===0?gltf.__bin:null);
    if(!bin)throw new Error('missing buffer '+bv.buffer);
    const start=(bv.byteOffset||0)+(offset||0),stride=interleaved?(bv.byteStride||width*c.size):width*c.size;
    const needed=elements?(elements-1)*stride+width*c.size:0;
    if(!Number.isSafeInteger(start)||start<0||stride<width*c.size||offset<0||needed+(offset||0)>bv.byteLength||start+needed>bin.length)throw new Error('accessor exceeds bufferView range');
    const view=new DataView(bin.buffer,bin.byteOffset+start,needed);
    const getter={5120:'getInt8',5121:'getUint8',5122:'getInt16',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[componentType];
    return (i,k=0)=>view[getter](i*stride+k*c.size,true);
  }
  // DataView handles interleaving and unaligned Buffer slices; the last vertex has no trailing stride requirement.
  const base=acc.bufferView===undefined?null:reader(acc.bufferView,acc.byteOffset||0,count,n,acc.componentType,true);
  const data=new (acc.normalized?Float32Array:comp.array)(count*n);
  const normalize=v=>!acc.normalized?v:acc.componentType===5120?Math.max(v/127,-1):acc.componentType===5122?Math.max(v/32767,-1):v/({5121:255,5123:65535,5125:4294967295}[acc.componentType]||1);
  if(base)for(let i=0;i<count;i++)for(let k=0;k<n;k++)data[i*n+k]=normalize(base(i,k));
  if(acc.sparse){
    const s=acc.sparse;
    if(!Number.isSafeInteger(s.count)||s.count<0||s.count>count||![5121,5123,5125].includes(s.indices.componentType))throw new Error('invalid sparse accessor');
    const indices=reader(s.indices.bufferView,s.indices.byteOffset||0,s.count,1,s.indices.componentType);
    const values=reader(s.values.bufferView,s.values.byteOffset||0,s.count,n,acc.componentType);
    let previous=-1;
    for(let i=0;i<s.count;i++){const id=indices(i);if(id<=previous||id>=count)throw new Error('sparse indices must increase within accessor count');previous=id;for(let k=0;k<n;k++)data[id*n+k]=normalize(values(i,k));}
  }
  return { data, count, n, accessor: acc };
}

export async function extract() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = [];
  for (const s of SOURCES) {
    const srcPath = path.join(SRC_BASE, 'models', s.file);
    const code = await fs.readFile(srcPath, 'utf8');
    const re = new RegExp(`FORMA_ASSETS\\[${s.key}\\]\\s*=\\s*"([A-Za-z0-9+/=]+)"`);
    const m = re.exec(code);
    if (!m) throw new Error(`cannot find FORMA_ASSETS[${s.key}] in ${srcPath}`);
    const glb = Buffer.from(m[1], 'base64');
    const outPath = path.join(OUT_DIR, s.name + '.glb');
    await fs.writeFile(outPath, glb);

    const { json, bin } = parseGLB(glb);
    json.__bin = bin;
    const prim = json.meshes[0].primitives[0];
    const pos = readAccessor(json, prim.attributes.POSITION);
    const idx = readAccessor(json, prim.indices);

    // Bounding box sanity
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++) {
      for (let k = 0; k < 3; k++) {
        const v = pos.data[i * 3 + k];
        if (!Number.isFinite(v)) throw new Error(`non-finite position at ${i} in ${s.name}`);
        if (v < mn[k]) mn[k] = v;
        if (v > mx[k]) mx[k] = v;
      }
    }
    const exp = EXPECTED[s.name];
    const tris = idx.count / 3;
    const okV = pos.count === exp.verts, okT = tris === exp.tris;
    if (!okV || !okT) throw new Error(`${s.name}: geometry drift verts ${pos.count}/${exp.verts} tris ${tris}/${exp.tris}`);

    const rec = {
      name: s.name,
      sourceAssetKey: s.key,
      sourceFile: path.relative(ROOT, srcPath),
      glbBytes: glb.length,
      sha256: sha256(glb),
      verts: pos.count,
      tris,
      bboxMin: mn.map(v => +v.toFixed(6)),
      bboxMax: mx.map(v => +v.toFixed(6)),
      hasNormal: prim.attributes.NORMAL !== undefined,
      metallicFactor: json.materials?.[0]?.pbrMetallicRoughness?.metallicFactor ?? null,
      roughnessFactor: json.materials?.[0]?.pbrMetallicRoughness?.roughnessFactor ?? null,
      images: (json.images || []).length,
      samplers: (json.samplers || []).length,
      generator: json.asset?.generator || null,
    };
    report.push(rec);
    console.log(`${s.name.padEnd(12)} ${String(rec.glbBytes).padStart(9)} B  verts ${rec.verts}  tris ${rec.tris}  NORMAL=${rec.hasNormal}  metal=${rec.metallicFactor}  bbox ${mn.map(v=>v.toFixed(3))} .. ${mx.map(v=>v.toFixed(3))}`);
  }
  await fs.writeFile(path.join(OUT_DIR, 'INDEX.json'), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${report.length} raw GLB -> assets/raw/`);
  return report;
}

const SELF = path.resolve(fileURLToPath(import.meta.url));
if (path.resolve(process.argv[1] || '') === SELF) await extract();
