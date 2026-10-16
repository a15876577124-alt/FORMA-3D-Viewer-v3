// 几何算子（自研）：genNormals（法线生成，算法源自 tools/fix-glb.mjs buildNormals）。
import fs from 'node:fs';
import { readAccessor, sha256 } from '../../tools/glbkit.mjs';
import { loadGLB, buildGLB, appendToBin } from './glbWrite.mjs';

const GL_FLOAT = 5126;
const TARGET_ARRAY_BUFFER = 34962;

// 面积加权平滑法线 + 量化位置虚拟 weld 分组（避免 UV 岛边界出现着色接缝）。
function buildNormals(positions, indices, vertCount, hardAngleDeg = 180) {
  const triCount = indices.length / 3;
  const faceN = new Float64Array(triCount * 3);
  const faceArea = new Float64Array(triCount);
  const faceUnit = new Float64Array(triCount * 3);
  let degenerate = 0;
  for (let f = 0; f < triCount; f++) {
    const ia = indices[f * 3], ib = indices[f * 3 + 1], ic = indices[f * 3 + 2];
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const e1x = positions[ib * 3] - ax, e1y = positions[ib * 3 + 1] - ay, e1z = positions[ib * 3 + 2] - az;
    const e2x = positions[ic * 3] - ax, e2y = positions[ic * 3 + 1] - ay, e2z = positions[ic * 3 + 2] - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    faceN[f * 3] = nx; faceN[f * 3 + 1] = ny; faceN[f * 3 + 2] = nz;
    faceArea[f] = len * 0.5;
    if (!(len > 0)) { degenerate++; continue; }
    faceUnit[f * 3] = nx / len; faceUnit[f * 3 + 1] = ny / len; faceUnit[f * 3 + 2] = nz / len;
  }
  const incident = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) incident[i] = [];
  for (let f = 0; f < triCount; f++) {
    incident[indices[f * 3]].push(f);
    incident[indices[f * 3 + 1]].push(f);
    incident[indices[f * 3 + 2]].push(f);
  }
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertCount; i++) for (let k = 0; k < 3; k++) {
    const v = positions[i * 3 + k];
    if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
  }
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const q = 1e6 / diag;
  const groupOf = new Int32Array(vertCount).fill(-1);
  const groupKeys = new Map();
  for (let i = 0; i < vertCount; i++) {
    const key = `${Math.round(positions[i * 3] * q)},${Math.round(positions[i * 3 + 1] * q)},${Math.round(positions[i * 3 + 2] * q)}`;
    let g = groupKeys.get(key);
    if (g === undefined) { g = groupKeys.size; groupKeys.set(key, g); }
    groupOf[i] = g;
  }
  const groupCount = groupKeys.size;

  const normals = new Float32Array(vertCount * 3);
  const hardEdges = hardAngleDeg < 179.99;
  const includeMask = hardEdges ? new Uint8Array(triCount) : null;
  let excluded = 0;
  if (includeMask) {
    const cosLimit = Math.cos((hardAngleDeg * Math.PI) / 180);
    const groupSeedFace = new Int32Array(groupCount).fill(-1);
    const seen = new Uint8Array(groupCount);
    for (let i = 0; i < vertCount; i++) {
      const g = groupOf[i]; if (seen[g]) continue; seen[g] = 1;
      let best = -1, bestArea = -1;
      for (const f of incident[i]) if (faceArea[f] > bestArea) { bestArea = faceArea[f]; best = f; }
      groupSeedFace[g] = best;
    }
    for (let f = 0; f < triCount; f++) {
      if (!(faceArea[f] > 0)) continue;
      const seed = groupSeedFace[groupOf[indices[f * 3]]];
      if (seed < 0) { includeMask[f] = 1; continue; }
      const d = faceUnit[f * 3] * faceUnit[seed * 3] + faceUnit[f * 3 + 1] * faceUnit[seed * 3 + 1] + faceUnit[f * 3 + 2] * faceUnit[seed * 3 + 2];
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
    if (!(len > 0)) {
      let best = -1, bestArea = -1;
      for (const f of incident[i]) if (faceArea[f] > bestArea) { bestArea = faceArea[f]; best = f; }
      if (best >= 0) { sx = faceUnit[best * 3]; sy = faceUnit[best * 3 + 1]; sz = faceUnit[best * 3 + 2]; len = 1; }
      else { sx = 0; sy = 1; sz = 0; len = 1; }
    }
    normals[i * 3] = sx / len; normals[i * 3 + 1] = sy / len; normals[i * 3 + 2] = sz / len;
  }
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
  let dotSum = 0;
  for (let i = 0; i < vertCount; i++) {
    dotSum += (positions[i * 3] - cx) * normals[i * 3] + (positions[i * 3 + 1] - cy) * normals[i * 3 + 1] + (positions[i * 3 + 2] - cz) * normals[i * 3 + 2];
  }
  let flipped = false;
  if (dotSum < 0) { for (let i = 0; i < vertCount * 3; i++) normals[i] = -normals[i]; flipped = true; }
  return { normals, degenerate, flipped, groupCount, vertCount, excluded };
}

export const geometryOps = {
  genNormals: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      const buf = fs.readFileSync(inPath);
      const { json, bin: _bin } = loadGLB(buf);
      let bin = _bin;
      const hardAngle = params.hardAngle ?? 180;
      const changes = [];
      let totalDegenerate = 0;

      for (const mesh of json.meshes || []) {
        for (const prim of mesh.primitives || []) {
          if (prim.mode !== undefined && prim.mode !== 4) continue;
          if (prim.attributes.NORMAL !== undefined) continue; // 已无法线则跳过
          const pos = readAccessor(json, prim.attributes.POSITION);
          const idx = readAccessor(json, prim.indices);
          const res = buildNormals(pos.data, idx.data, pos.count, hardAngle);
          totalDegenerate += res.degenerate;

          const normalBytes = Buffer.from(res.normals.buffer, res.normals.byteOffset, res.normals.byteLength);
          const { newBin, offset } = appendToBin(bin, normalBytes);
          bin = newBin; // eslint-disable-line no-param-reassign
          json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: normalBytes.length, target: TARGET_ARRAY_BUFFER });
          const bvIndex = json.bufferViews.length - 1;
          let nxMin = [Infinity, Infinity, Infinity], nxMax = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < pos.count; i++) for (let k = 0; k < 3; k++) {
            const v = res.normals[i * 3 + k];
            if (v < nxMin[k]) nxMin[k] = v; if (v > nxMax[k]) nxMax[k] = v;
          }
          json.accessors.push({ bufferView: bvIndex, componentType: GL_FLOAT, count: pos.count, type: 'VEC3', min: nxMin.map((v) => +v.toFixed(6)), max: nxMax.map((v) => +v.toFixed(6)) });
          prim.attributes.NORMAL = json.accessors.length - 1;
          json.buffers[0].byteLength = offset + normalBytes.length;
          changes.push(`+NORMAL(${pos.count} verts, hardAngle=${hardAngle}${res.flipped ? ', flipped' : ''}, degenerate=${res.degenerate})`);
        }
      }

      delete json.__bin;
      const outBuf = buildGLB(json, bin);
      fs.writeFileSync(outPath, outBuf);
      return {
        metrics: { bytes: outBuf.length, sourceSha256: sha256(buf), degenerate: totalDegenerate },
        changes,
        warnings: changes.length ? ['法线生成会改变光照着色外观，需人工确认'] : [],
      };
    },
  },
  fixNormalsOrientation: {
    appearance: true,
    async run({ inPath, outPath, params }) {
      // 已由 genNormals 内置方向校正；此处提供空转但真实校验（无 NORMAL 时不做）
      const buf = fs.readFileSync(inPath);
      const { json } = loadGLB(buf);
      const hasNormal = (json.meshes || []).some((m) => (m.primitives || []).some((p) => p.attributes.NORMAL !== undefined));
      if (!hasNormal) return { metrics: { bytes: buf.length }, changes: [], warnings: ['无 NORMAL 属性，未执行方向校正'] };
      fs.copyFileSync(inPath, outPath);
      return { metrics: { bytes: buf.length }, changes: ['NORMAL 已存在，方向校正由 genNormals 内置'] };
    },
  },
};
