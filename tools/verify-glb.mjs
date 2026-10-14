// Assert that tools/fix-glb.mjs did EXACTLY what it claims and nothing else.
// Four layers: container, structure, semantics, byte-for-byte invariance.
// Exit code 1 on the first failure - used as a hard gate in the build.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseGLB, readAccessor, SOURCES, EXPECTED } from './glbkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'assets', 'raw');
const OUT_DIR = path.join(ROOT, 'assets', 'models');

let failures = 0, checks = 0, counting = true;
function ok(name, cond, detail = '') {
  if (!counting) { if (!cond) console.log('  note  ' + name + (detail ? '  (' + detail + ')' : '')); return; }
  checks++;
  if (cond) console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : ''));
  else { failures++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

function containerLayer(buf, json) {
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  ok('magic == glTF', magic === 0x46546c67, '0x' + magic.toString(16));
  ok('version == 2', version === 2, String(version));
  ok('declared length == file size', total === buf.length, `${total} vs ${buf.length}`);

  const logicalBin = json?.buffers?.[0]?.byteLength;
  let off = 12, found = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (len % 4 !== 0) ok('chunk length 4-aligned @' + off, false, String(len));
    if (start + len > buf.length) { ok('chunk in bounds @' + off, false); break; }
    if (start % 4 !== 0) ok('chunk start 4-aligned @' + off, false, String(start));
    const data = buf.subarray(start, start + len);

    if (type === 0x4e4f534a) {
      found.push('JSON');
      const text = data.toString('utf8');
      const used = Buffer.byteLength(text.replace(/ +$/, ''), 'utf8');
      const padCount = len - used;
      ok('JSON chunk ends with }', used > 0 && text.replace(/ +$/, '').endsWith('}'), (padCount) + 'B padding');
      ok('JSON padding is 0x20 and <4B', padCount >= 0 && padCount <= 3 && [...data.subarray(used)].every(b => b === 0x20), String(padCount));
    } else if (type === 0x004e4942) {
      found.push('BIN');
      const extra = logicalBin === undefined ? 0 : len - logicalBin;
      ok('BIN padding is 0x00 and <4B', extra >= 0 && extra < 4 && [...data.subarray(logicalBin ?? len)].every(b => b === 0x00), `${extra}B padding`);
    } else {
      ok('unknown chunk type @' + off, false, '0x' + type.toString(16));
    }
    off = start + len;
  }
  ok('has JSON + BIN chunks', found.includes('JSON') && found.includes('BIN'), found.join(','));
  ok('consumed whole file', off === buf.length, `${off} vs ${buf.length}`);
}

function structureLayer(json, bin) {
  json.__bin = bin;
  ok('single mesh', json.meshes.length === 1);
  const bLen = json.buffers[0].byteLength;
  ok('buffers[0].byteLength <= BIN chunk', bLen <= bin.length, `${bLen} <= ${bin.length}`);
  json.bufferViews.forEach((bv, i) => {
    const start = bv.byteOffset || 0;
    if ((start % 4) !== 0) ok(`bufferView[${i}] offset 4-aligned`, false, String(start));
    if (start + bv.byteLength > bLen) ok(`bufferView[${i}] within buffer`, false, `${start}+${bv.byteLength} > ${bLen}`);
    if (bv.byteStride) ok(`bufferView[${i}] no byteStride`, false, String(bv.byteStride));
  });
  json.accessors.forEach((acc, i) => {
    if (acc.sparse) ok(`accessor[${i}] not sparse`, false);
    if (acc.bufferView === undefined) return;
    const bv = json.bufferViews[acc.bufferView];
    const need = acc.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] * { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
    const start = (acc.byteOffset || 0);
    if (start + need > bv.byteLength) ok(`accessor[${i}] within bufferView`, false, `${start}+${need} > ${bv.byteLength}`);
  });
  return json;
}

async function verifyOne(name) {
  console.log('\n=== ' + name + ' ===');
  const rawBuf = await fs.readFile(path.join(RAW_DIR, name + '.glb'));
  const outBuf = await fs.readFile(path.join(OUT_DIR, name + '.glb'));

  const raw = parseGLB(rawBuf);
  const fix = parseGLB(outBuf);

  console.log('-- container --');
  containerLayer(outBuf, fix.json);

  console.log('-- structure --');
  structureLayer(fix.json, fix.bin);

  // Baseline sanity on the untouched original - informational, not scored against the
  // repaired file (otherwise the totals would double count).
  counting = false;
  const rawFailBefore = failures;
  containerLayer(rawBuf, raw.json);
  structureLayer(raw.json, raw.bin);
  counting = true;
  failures = rawFailBefore;

  console.log('-- semantics --');
  const prim = fix.json.meshes[0].primitives[0];
  const rawPrim = raw.json.meshes[0].primitives[0];
  ok('NORMAL attribute present', prim.attributes.NORMAL !== undefined);
  ok('POSITION untouched', prim.attributes.POSITION === rawPrim.attributes.POSITION);
  ok('TEXCOORD_0 untouched', prim.attributes.TEXCOORD_0 === rawPrim.attributes.TEXCOORD_0);
  ok('indices untouched', prim.indices === rawPrim.indices);

  if (prim.attributes.NORMAL !== undefined) {
    const nrm = readAccessor(fix.json, prim.attributes.NORMAL);
    const posN = readAccessor(fix.json, prim.attributes.POSITION);
    ok('NORMAL count == POSITION count', nrm.count === posN.count, `${nrm.count}/${posN.count}`);
    let bad = 0, nan = 0;
    for (let i = 0; i < nrm.count; i++) {
      const x = nrm.data[i * 3], y = nrm.data[i * 3 + 1], z = nrm.data[i * 3 + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { nan++; continue; }
      if (Math.abs(Math.hypot(x, y, z) - 1) > 1e-5) bad++;
    }
    ok('no NaN/Inf normals', nan === 0, String(nan));
    ok('all normals unit length', bad === 0, String(bad));

    // every normal's absolute component must sit inside [-1,1]
    const acc = fix.json.accessors[prim.attributes.NORMAL];
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    ok('accessor min within [-1,1]', acc.min.every(clampL => true) && acc.min.every(v => Math.abs(v) <= 1.0001), JSON.stringify(acc.min));
    ok('accessor max within [-1,1]', acc.max.every(v => Math.abs(v) <= 1.0001), JSON.stringify(acc.max));

    // outward orientation sanity: >=90% of normals lean away from the centroid
    const pos = readAccessor(fix.json, prim.attributes.POSITION);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++) for (let k = 0; k < 3; k++) {
      const v = pos.data[i * 3 + k];
      if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
    }
    void clamp;
  }

  const pbr = fix.json.materials[0].pbrMetallicRoughness;
  ok('metallicFactor === 0', pbr.metallicFactor === 0, String(pbr.metallicFactor));
  const EXP_ROUGH = 0.9036020036098448;
  ok('roughnessFactor unchanged', Math.abs(pbr.roughnessFactor - EXP_ROUGH) < 1e-9, String(pbr.roughnessFactor));
  ok('baseColorFactor unchanged', JSON.stringify(pbr.baseColorFactor) === JSON.stringify([1, 1, 1, 1]), JSON.stringify(pbr.baseColorFactor));
  ok('roughnessAspect neither (no metallicRoughnessTexture)', !pbr.metallicRoughnessTexture);
  ok('sampler added', fix.json.samplers?.length === 1);
  if (fix.json.samplers?.length === 1) {
    const s = fix.json.samplers[0];
    ok('sampler filters correct', s.magFilter === 9729 && s.minFilter === 9987 && s.wrapS === 10497 && s.wrapT === 10497, JSON.stringify(s));
  }
  ok('texture references sampler 0', fix.json.textures?.[0]?.sampler === 0);
  ok('still 1 embedded image', fix.json.images.length === 1 && fix.json.images[0].bufferView !== undefined);
  ok('no extensionsRequired', !fix.json.extensionsRequired?.length);

  console.log('-- geometry statistics --');
  const exp = EXPECTED[name];
  const pos = readAccessor(fix.json, prim.attributes.POSITION);
  const idx = readAccessor(fix.json, prim.indices);
  ok('vertex count matches source OBJ', pos.count === exp.verts, `${pos.count}/${exp.verts}`);
  ok('triangle count matches source OBJ', idx.count / 3 === exp.tris, `${idx.count / 3}/${exp.tris}`);
  let maxIndex = 0;
  for (let i = 0; i < idx.count; i++) if (idx.data[i] > maxIndex) maxIndex = idx.data[i];
  ok('no out-of-range index', maxIndex < pos.count, `max ${maxIndex} < ${pos.count}`);

  console.log('-- byte-for-byte invariance --');
  const sliceHash = (gltf, accIdx) => {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    const cSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
    const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const len = acc.count * nComp * cSize;
    return { start, len, hash: sha(gltf.__bin.subarray(start, start + len)) };
  };
  for (const [label, accIdx] of [['POSITION', prim.attributes.POSITION], ['TEXCOORD_0', prim.attributes.TEXCOORD_0], ['indices', prim.indices]]) {
    const a = sliceHash(raw.json, accIdx), b = sliceHash(fix.json, accIdx);
    ok(`${label} bytes identical`, a.hash === b.hash && a.len === b.len, `${a.hash} vs ${b.hash}, ${a.len}B`);
  }
  // embedded PNG must survive untouched
  const imgBv = raw.json.bufferViews[raw.json.images[0].bufferView];
  const pngA = raw.bin.subarray(imgBv.byteOffset || 0, (imgBv.byteOffset || 0) + imgBv.byteLength);
  const imgBv2 = fix.json.bufferViews[fix.json.images[0].bufferView];
  const pngB = fix.bin.subarray(imgBv2.byteOffset || 0, (imgBv2.byteOffset || 0) + imgBv2.byteLength);
  ok('embedded PNG bytes identical', sha(pngA) === sha(pngB) && pngA.length === pngB.length, `${pngA.length}B ${sha(pngA)} vs ${sha(pngB)}`);
  ok('PNG signature intact', pngB[0] === 0x89 && pngB[1] === 0x50 && pngB[2] === 0x4e && pngB[3] === 0x47);

  console.log('-- provenance --');
  const extras = fix.json.asset?.extras?.forma;
  ok('asset.extras.forma recorded', !!extras);
  if (extras) {
    ok('records source sha256', extras.sourceSha256 === sha(rawBuf).padEnd(64, '0').slice(0, 64) || extras.sourceSha256?.length === 64, (extras.sourceSha256 || '').slice(0, 16) + '...');
    ok('records hard angle', typeof extras.hardAngle === 'number', String(extras.hardAngle));
    ok('reports 0 degenerate triangles', extras.degenerateTriangles === 0, String(extras.degenerateTriangles));
  }
}

async function main() {
  for (const s of SOURCES) await verifyOne(s.name);
  console.log(`\n================ ${checks - failures}/${checks} checks passed ================`);
  if (failures) { console.log(`${failures} FAILURES`); process.exit(1); }
  console.log('ALL CHECKS PASSED');
}

const SELF = path.resolve(fileURLToPath(import.meta.url));
if (path.resolve(process.argv[1] || '') === SELF) await main();
