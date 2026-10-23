// Normal generation shared by the import pipeline.
//
// Source OBJ exports carry no `vn`, and naive
// per-index averaging leaves dark seams along every UV island border - therefore
// we average over a *virtual* position weld.
import { BufferAttribute } from 'three';

export function computeWeldedNormals(geometry) {
  const pos = geometry.attributes.position;
  if (!pos) return null;

  const index = geometry.index;
  const vertCount = pos.count;
  const triCount = index ? index.count / 3 : vertCount / 3;
  const P = pos.array;
  const I = index ? index.array : null;

  const idxAt = (i) => (I ? I[i] : i);

  const faceN = new Float64Array(triCount * 3);
  const faceArea = new Float64Array(triCount);

  for (let f = 0; f < triCount; f++) {
    const ia = idxAt(f * 3), ib = idxAt(f * 3 + 1), ic = idxAt(f * 3 + 2);
    const ax = P[ia * 3], ay = P[ia * 3 + 1], az = P[ia * 3 + 2];
    const e1x = P[ib * 3] - ax, e1y = P[ib * 3 + 1] - ay, e1z = P[ib * 3 + 2] - az;
    const e2x = P[ic * 3] - ax, e2y = P[ic * 3 + 1] - ay, e2z = P[ic * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    faceN[f * 3] = nx; faceN[f * 3 + 1] = ny; faceN[f * 3 + 2] = nz;
    faceArea[f] = Math.hypot(nx, ny, nz) * 0.5;
  }

  const incident = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) incident[i] = [];
  for (let f = 0; f < triCount; f++) {
    incident[idxAt(f * 3)].push(f);
    incident[idxAt(f * 3 + 1)].push(f);
    incident[idxAt(f * 3 + 2)].push(f);
  }

  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertCount; i++) {
    for (let k = 0; k < 3; k++) {
      const v = P[i * 3 + k];
      if (!Number.isFinite(v)) return null;
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
  }
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const q = 1e6 / diag;
  const keyOf = (i) => `${Math.round(P[i * 3] * q)},${Math.round(P[i * 3 + 1] * q)},${Math.round(P[i * 3 + 2] * q)}`;

  const groups = new Map();
  const groupOf = new Int32Array(vertCount).fill(-1);
  for (let i = 0; i < vertCount; i++) {
    const k = keyOf(i);
    let g = groups.get(k);
    if (g === undefined) { g = groups.size; groups.set(k, g); }
    groupOf[i] = g;
  }
  const groupCount = groups.size;

  const groupFaces = Array.from({ length: groupCount }, () => new Set());
  for (let i = 0; i < vertCount; i++) {
    for (const f of incident[i]) groupFaces[groupOf[i]].add(f);
  }

  const normals = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    let sx = 0, sy = 0, sz = 0;
    for (const f of groupFaces[groupOf[i]]) { sx += faceN[f * 3]; sy += faceN[f * 3 + 1]; sz += faceN[f * 3 + 2]; }
    let len = Math.hypot(sx, sy, sz);
    if (!(len > 0)) { sy = 1; sx = 0; sz = 0; len = 1; }
    normals[i * 3] = sx / len; normals[i * 3 + 1] = sy / len; normals[i * 3 + 2] = sz / len;
  }

  geometry.setAttribute('normal', new BufferAttribute(normals, 3));

  // Afterwards, degenerate triangles contributed nothing; keep faces sane.
  return { groupCount, duplicates: vertCount - groupCount };
}

export function ensureNormals(root) {
  let fixed = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (g.attributes.normal) return;
    g.computeVertexNormals();
    if (!g.attributes.normal) return;
    fixed++;
  });
  return fixed;
}

/**
 * GLTFLoader marks a material flatShading=true when the source primitive has no
 * NORMAL accessor (that is the glTF 2.0 specified behaviour). If we then repair
 * the normals at runtime the flag survives, and the mesh keeps rendering
 * per-face through screen-space derivatives - exactly the defect the repair was
 * supposed to remove. Any loader that builds normals after parse must call this.
 */
export function clearFlatShading(root) {
  let cleared = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && 'flatShading' in m && m.flatShading) { m.flatShading = false; m.needsUpdate = true; cleared++; }
    }
  });
  return cleared;
}
