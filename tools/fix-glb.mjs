// Repair pipeline for the five Qiong-opera figurine GLBs.
//
// Two real defects in the source assets (see plan section 0.3):
//   1. no NORMAL attribute  -> three.js silently falls back to FLAT_SHADED faceting
//   2. no metallicFactor    -> glTF default is 1.0 -> figurines render as dark metal,
//                              and base*(1-metal) kills all diffuse detail
//
// Strategy is APPEND-ONLY: the new NORMAL buffer is appended after the existing BIN
// payload and only the JSON chunk is rewritten. POSITION / TEXCOORD_0 / indices / the
// embedded PNG are preserved byte-for-byte, which verify-glb.mjs proves by hashing
// the exact same slices in both files.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB, readAccessor, sha256, SOURCES, EXPECTED } from './glbkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'assets', 'raw');
const OUT_DIR = path.join(ROOT, 'assets', 'models');
const VARIANT_DIR = path.join(ROOT, 'assets', 'variants');

const GL_FLOAT = 5126, GL_UNSIGNED_INT = 5125;
const TARGET_ARRAY_BUFFER = 34962;

function parseArgs(argv) {
  const args = { hardAngle: 180, out: OUT_DIR, tag: null, keepMetal: false, keepSampler: false };
  for (const a of argv.slice(2)) {
    let m;
    if ((m = /^--hard-angle=([\d.]+)$/.exec(a))) args.hardAngle = parseFloat(m[1]);
    else if ((m = /^--out=(.+)$/.exec(a))) args.out = path.resolve(ROOT, m[1]);
    else if ((m = /^--tag=(.+)$/.exec(a))) args.tag = m[1];
    // Isolation switches used by the normal-fix A/B study (tools/test-ab.mjs):
    // --keep-metal   write NORMAL but leave metallicFactor exactly as the source had it
    // --keep-sampler do not inject the explicit sampler block
    else if (a === '--keep-metal') args.keepMetal = true;
    else if (a === '--keep-sampler') args.keepSampler = true;
    else throw new Error('unknown option ' + a);
  }
  return args;
}

// ---------------------------------------------------------------- normals ----

/**
 * Build per-vertex normals.
 *
 * welding
 *   The mesh was exported with UV-seam vertices split, so a single position can be
 *   referenced by several vertex indices (measured: 12-19% of the vertices are such
 *   duplicates). Averaging per index would therefore leave a visible shading seam
 *   along every UV island border. We build a VIRTUAL weld map by quantised position
 *   and average over welded groups - nothing in the vertex buffer is merged.
 *
 * hard edges
 *   The source OBJ carries no `vn` and no smoothing groups, so there is no ground
 *   truth for creases. With --hard-angle=180 we emit pure area-weighted smooth
 *   normals (the mathematically safe answer). With a smaller angle we pick, per
 *   weld group, the largest-area incident face as a seed and only accumulate
 *   neighbouring faces whose unit normal lies inside the angle. That keeps genuine
 *   creases (headpiece plates, garment folds) crisp while still fully smoothing
 *   curved regions where all incident faces already agree.
 */
function buildNormals(positions, indices, vertCount, hardAngleDeg) {
  const triCount = indices.length / 3;
  const faceN = new Float64Array(triCount * 3);       // area-weighted (unnormalised)
  const faceArea = new Float64Array(triCount);
  const faceUnit = new Float64Array(triCount * 3);
  let degenerate = 0;

  for (let f = 0; f < triCount; f++) {
    const ia = indices[f * 3], ib = indices[f * 3 + 1], ic = indices[f * 3 + 2];
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const e1x = positions[ib * 3] - ax, e1y = positions[ib * 3 + 1] - ay, e1z = positions[ib * 3 + 2] - az;
    const e2x = positions[ic * 3] - ax, e2y = positions[ic * 3 + 1] - ay, e2z = positions[ic * 3 + 2] - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    faceN[f * 3] = nx; faceN[f * 3 + 1] = ny; faceN[f * 3 + 2] = nz;
    faceArea[f] = len * 0.5;
    if (!(len > 0)) { degenerate++; continue; }
    faceUnit[f * 3] = nx / len; faceUnit[f * 3 + 1] = ny / len; faceUnit[f * 3 + 2] = nz / len;
  }

  // incident triangles per vertex index
  const incident = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) incident[i] = [];
  for (let f = 0; f < triCount; f++) {
    incident[indices[f * 3]].push(f);
    incident[indices[f * 3 + 1]].push(f);
    incident[indices[f * 3 + 2]].push(f);
  }

  // quantised position -> group id
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertCount; i++) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i * 3 + k];
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
  }
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const q = 1e6 / diag;                       // ~1e6 buckets across the diagonal
  const keyOf = (i) => {
    const x = Math.round(positions[i * 3] * q);
    const y = Math.round(positions[i * 3 + 1] * q);
    const z = Math.round(positions[i * 3 + 2] * q);
    return x + ',' + y + ',' + z;
  };
  const groupOf = new Int32Array(vertCount).fill(-1);
  const groupKeys = new Map();
  for (let i = 0; i < vertCount; i++) {
    const key = keyOf(i);
    let g = groupKeys.get(key);
    if (g === undefined) { g = groupKeys.size; groupKeys.set(key, g); }
    groupOf[i] = g;
  }
  const groupCount = groupKeys.size;

  const normals = new Float32Array(vertCount * 3);
  const includeMask = hardAngleDeg >= 179.99 ? null : new Uint8Array(triCount);
  let excluded = 0;

  if (includeMask) {
    const cosLimit = Math.cos((hardAngleDeg * Math.PI) / 180);
    // seed face per weld group (largest area among every face touching the group)
    const groupSeedFace = new Int32Array(groupCount).fill(-1);
    const seenGroup = new Uint8Array(groupCount);
    for (let i = 0; i < vertCount; i++) {
      const g = groupOf[i];
      if (seenGroup[g]) continue;
      seenGroup[g] = 1;
      let best = -1, bestArea = -1;
      for (const f of incident[i]) {
        if (faceArea[f] > bestArea) { bestArea = faceArea[f]; best = f; }
      }
      groupSeedFace[g] = best;
    }
    for (let f = 0; f < triCount; f++) {
      if (!(faceArea[f] > 0)) continue;
      const seed = groupSeedFace[groupOf[indices[f * 3]]];
      if (seed < 0) { includeMask[f] = 1; continue; }
      const d = faceUnit[f * 3] * faceUnit[seed * 3]
              + faceUnit[f * 3 + 1] * faceUnit[seed * 3 + 1]
              + faceUnit[f * 3 + 2] * faceUnit[seed * 3 + 2];
      includeMask[f] = d >= cosLimit ? 1 : 0;
      if (!includeMask[f]) excluded++;
    }
  }

  for (let i = 0; i < vertCount; i++) {
    let sx = 0, sy = 0, sz = 0;
    for (const f of incident[i]) {
      if (includeMask && !includeMask[f]) continue;
      sx += faceN[f * 3]; sy += faceN[f * 3 + 1]; sz += faceN[f * 3 + 2];
    }
    let len = Math.hypot(sx, sy, sz);
    if (!(len > 0)) { // fallback: use this vertex's own largest incident face
      let best = -1, bestArea = -1;
      for (const f of incident[i]) if (faceArea[f] > bestArea) { bestArea = faceArea[f]; best = f; }
      if (best >= 0) { sx = faceUnit[best * 3]; sy = faceUnit[best * 3 + 1]; sz = faceUnit[best * 3 + 2]; len = 1; }
      else { sx = 0; sy = 1; sz = 0; len = 1; }
    }
    normals[i * 3] = sx / len; normals[i * 3 + 1] = sy / len; normals[i * 3 + 2] = sz / len;
  }

  // Orientation insurance: if the mesh winding is inverted, smooth normals point
  // inwards. Rough overall test - compare against the outward radial direction.
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
  let dotSum = 0;
  for (let i = 0; i < vertCount; i++) {
    const rx = positions[i * 3] - cx, ry = positions[i * 3 + 1] - cy, rz = positions[i * 3 + 2] - cz;
    dotSum += rx * normals[i * 3] + ry * normals[i * 3 + 1] + rz * normals[i * 3 + 2];
  }
  let flipped = false;
  if (dotSum < 0) {
    for (let i = 0; i < vertCount * 3; i++) normals[i] = -normals[i];
    flipped = true;
  }

  return { normals, degenerate, flipped, groupCount, vertCount, excluded };
}

// ------------------------------------------------------------------- glb ----

function buildGLB(json, bin) {
  const jsonText = JSON.stringify(json);
  const nonAscii = jsonText.match(/[^\x00-\x7F]/g);
  if (nonAscii) throw new Error('JSON chunk must stay ASCII, found ' + nonAscii.length + ' chars');
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

async function fixOne(name, args) {
  const rawPath = path.join(RAW_DIR, name + '.glb');
  const rawBuf = await fs.readFile(rawPath);
  const { json, bin } = parseGLB(rawBuf);
  json.__bin = bin;

  if (json.extensionsRequired?.length) throw new Error(`${name}: requires unsupported extensions ${json.extensionsRequired}`);
  if (json.meshes.length !== 1) throw new Error(`${name}: expected 1 mesh, got ${json.meshes.length}`);
  const prim = json.meshes[0].primitives[0];
  if (prim.mode !== undefined && prim.mode !== 4) throw new Error(`${name}: primitive mode ${prim.mode} != TRIANGLES`);
  if (prim.attributes.NORMAL !== undefined) throw new Error(`${name}: already has NORMAL`);

  const pos = readAccessor(json, prim.attributes.POSITION);
  const idx = readAccessor(json, prim.indices);
  const exp = EXPECTED[name];
  if (pos.count !== exp.verts) throw new Error(`${name}: vert count drift`);
  if (idx.count / 3 !== exp.tris) throw new Error(`${name}: tri count drift`);
  if (idx.accessor.componentType !== GL_UNSIGNED_INT) throw new Error(`${name}: indices not uint32`);

  const t0 = Date.now();
  const res = buildNormals(pos.data, idx.data, pos.count, args.hardAngle);
  const ms = Date.now() - t0;

  // ---- structural edits -------------------------------------------------
  const beforeBinLen = bin.length;
  const pad = (4 - (beforeBinLen % 4)) % 4;
  const normalOffset = beforeBinLen + pad;
  const normalBytes = Buffer.from(res.normals.buffer, res.normals.byteOffset, res.normals.byteLength);
  const newBin = Buffer.concat([bin, Buffer.alloc(pad, 0), normalBytes]);

  const changes = [];

  json.bufferViews.push({ buffer: 0, byteOffset: normalOffset, byteLength: normalBytes.length, target: TARGET_ARRAY_BUFFER });
  const bvIndex = json.bufferViews.length - 1;
  let nxMin = [Infinity, Infinity, Infinity], nxMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = res.normals[i * 3 + k];
      if (!Number.isFinite(v)) throw new Error(`${name}: non-finite normal at ${i}`);
      if (v < nxMin[k]) nxMin[k] = v;
      if (v > nxMax[k]) nxMax[k] = v;
    }
  }
  json.accessors.push({
    bufferView: bvIndex, componentType: GL_FLOAT, count: pos.count, type: 'VEC3',
    min: nxMin.map(v => +v.toFixed(6)), max: nxMax.map(v => +v.toFixed(6)),
  });
  json.accessors[json.accessors.length - 1].byteOffset = 0;
  prim.attributes.NORMAL = json.accessors.length - 1;
  changes.push(`+NORMAL (${pos.count} verts, area-weighted, hardAngle=${args.hardAngle}${res.flipped ? ', orientation flipped' : ''})`);

  json.buffers[0].byteLength = normalOffset + normalBytes.length;

  const mat = json.materials[0];
  const pbr = mat.pbrMetallicRoughness;
  if (args.keepMetal) {
    changes.push('metallicFactor left untouched (isolation build)');
  } else if (!pbr.metallicRoughnessTexture) {
    const prev = pbr.metallicFactor;
    pbr.metallicFactor = 0;
    changes.push(`metallicFactor ${prev === undefined ? '(absent -> glTF default 1.0)' : prev} -> 0`);
  }
  if (args.keepSampler) {
    changes.push('sampler left untouched (isolation build)');
  } else if (pbr.roughnessFactor === undefined) { pbr.roughnessFactor = 1; changes.push('roughnessFactor -> 1 (explicit)'); }

  if (!args.keepSampler) {
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    if (json.textures?.[0]) json.textures[0].sampler = 0;
    changes.push('+sampler (LINEAR / LINEAR_MIPMAP_LINEAR / REPEAT)');
  }

  json.accessors[prim.attributes.POSITION] = json.accessors[prim.attributes.POSITION]; // no-op, keeps order readable
  json.asset.extras = {
    forma: {
      pipeline: 'tools/fix-glb.mjs',
      sourceSha256: sha256(rawBuf),
      // NOTE: must stay ASCII - absolute paths on this machine contain Chinese.
      source: path.relative(ROOT, rawPath).replace(/\\/g, '/'),
      sourceJs: 'FORMA-3D-Viewer-v2/models/' + (SOURCES.find(s => s.name === name)?.file || '?'),
      hardAngle: args.hardAngle,
      degenerateTriangles: res.degenerate,
      weldGroups: res.groupCount,
      duplicateVertices: pos.count - res.groupCount,
      changes,
    },
  };

  delete json.__bin;
  const outBuf = buildGLB(json, newBin);
  await fs.mkdir(args.out, { recursive: true });
  const outPath = path.join(args.out, name + '.glb');
  await fs.writeFile(outPath, outBuf);

  return {
    name, hardAngle: args.hardAngle,
    rawBytes: rawBuf.length, outBytes: outBuf.length, delta: outBuf.length - rawBuf.length,
    verts: pos.count, tris: idx.count / 3,
    degenerate: res.degenerate, flipped: res.flipped,
    weldGroups: res.groupCount, duplicates: pos.count - res.groupCount,
    excludedFaces: res.excluded,
    normalRange: [nxMin.map(v => +v.toFixed(4)), nxMax.map(v => +v.toFixed(4))],
    ms, outPath: path.relative(ROOT, outPath), changes,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(VARIANT_DIR, { recursive: true });
  const report = [];
  console.log(`fix-glb  hardAngle=${args.hardAngle}  out=${path.relative(ROOT, args.out)}`);
  for (const s of SOURCES) {
    const r = await fixOne(s.name, args);
    report.push(r);
    console.log(
      `${r.name.padEnd(12)} ${String(r.rawBytes).padStart(9)} -> ${String(r.outBytes).padStart(9)} B ` +
      `(+${r.delta})  weldGroups ${r.weldGroups} (dup ${r.duplicates})  ` +
      `degenerate ${r.degenerate}  excluded ${r.excludedFaces}  ${r.flipped ? 'FLIPPED ' : ''}${r.ms}ms`
    );
    r.changes.forEach(c => console.log('      · ' + c));
  }
  const suffix = args.tag || (args.hardAngle >= 179.99 ? 'smooth' : 'ha' + args.hardAngle);
  await fs.writeFile(path.join(args.out, 'FIX-REPORT.json'), JSON.stringify({ args, report }, null, 2));
  console.log(`\nwrote ${report.length} repaired GLB -> ${path.relative(ROOT, args.out)}`);
}

const SELF = path.resolve(fileURLToPath(import.meta.url));
if (path.resolve(process.argv[1] || '') === SELF) await main();
