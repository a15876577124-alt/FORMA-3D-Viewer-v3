// Material control with a strict "original first" policy.
//
// A freshly loaded model is NEVER mutated. We snapshot its baseline parameters,
// and only take over once the user actually moves a control - which also fixes a
// real V2 defect: the old panel displayed 0.05 / 0.85 while actually rendering
// metalness 1.0 inherited from the glTF default. Here the sliders always show the
// values that are really in effect.
import * as THREE from 'three';

const BASELINE_KEY = 'baseline';

export const MATERIAL_PRESETS = {
  ceramic: { metalness: 0.02, roughness: 0.34, envMapIntensity: 1.15, color: 0xffffff, label: '陶瓷' },
  matte: { metalness: 0.0, roughness: 0.95, envMapIntensity: 0.9, color: 0xffffff, label: '哑光' },
  metal: { metalness: 1.0, roughness: 0.22, envMapIntensity: 1.2, color: 0xffffff, label: '金属' },
};

function collectMaterials(root) {
  const set = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach(m => set.add(m));
  });
  return [...set];
}

export function snapshotBaseline(root) {
  const mats = collectMaterials(root);
  for (const m of mats) {
    if (m[BASELINE_KEY]) continue;
    m[BASELINE_KEY] = {
      color: m.color ? m.color.clone() : null,
      metalness: m.metalness ?? 1,
      roughness: m.roughness ?? 1,
      envMapIntensity: m.envMapIntensity ?? 1,
      transparent: !!m.transparent,
      opacity: m.opacity ?? 1,
      alphaTest: m.alphaTest ?? 0,
      side: m.side ?? THREE.FrontSide,
      flatShading: !!m.flatShading,
      wireframe: !!m.wireframe,
      emissiveIntensity: m.emissiveIntensity ?? 1,
    };
  }
  return mats;
}

function restore(m) {
  const b = m[BASELINE_KEY];
  if (!b) return;
  if (b.color && m.color) m.color.copy(b.color);
  m.metalness = b.metalness;
  m.roughness = b.roughness;
  m.envMapIntensity = b.envMapIntensity;
  m.transparent = b.transparent;
  m.opacity = b.opacity;
  m.alphaTest = b.alphaTest;
  m.side = b.side;
  m.wireframe = b.wireframe;
  if ('emissiveIntensity' in m) m.emissiveIntensity = b.emissiveIntensity;
  m.needsUpdate = true;
}

/**
 * Apply neither nothing nor everything depending on mode:
 *   original -> material exactly as authored
 *   ceramic / matte / metal -> preset, with the colour slider still respected
 *   custom -> explicit slider values
 */
export function applyMaterialState(root, state) {
  const mats = collectMaterials(root);
  const result = { applied: false, effective: null };

  if (!mats.length) return result;

  if (state.mode === 'original') {
    mats.forEach(restore);
    const m0 = mats[0];
    result.effective = {
      metalness: m0.metalness, roughness: m0.roughness,
      envMapIntensity: m0.envMapIntensity,
      color: m0.color ? '#' + m0.color.getHexString() : '#ffffff',
    };
    return result;
  }

  const preset = MATERIAL_PRESETS[state.mode] || null;
  const tint = new THREE.Color(state.color || '#ffffff');
  for (const m of mats) {
    if (preset) {
      if (m.color && preset.color !== undefined) m.color.copy(tint);
      if ('metalness' in m) m.metalness = preset.metalness;
      if ('roughness' in m) m.roughness = preset.roughness;
      if ('envMapIntensity' in m) m.envMapIntensity = preset.envMapIntensity;
    } else {
      // custom
      if (m.color) m.color.copy(tint);
      if ('metalness' in m) m.metalness = state.metalness;
      if ('roughness' in m) m.roughness = state.roughness;
      if ('envMapIntensity' in m) m.envMapIntensity = state.envIntensity;
    }
    m.needsUpdate = true;
  }
  result.applied = true;
  result.effective = {
    metalness: preset ? preset.metalness : state.metalness,
    roughness: preset ? preset.roughness : state.roughness,
    envMapIntensity: mats[0].envMapIntensity,
    color: state.color,
  };
  return result;
}

/** Read whatever is really set on the model right now (for<｜hy_place▁holder▁no▁813｜>.html panels). */
export function readEffective(root) {
  const mats = collectMaterials(root);
  if (!mats.length) return null;
  const m = mats[0];
  return {
    metalness: m.metalness, roughness: m.roughness,
    envMapIntensity: m.envMapIntensity,
    color: m.color ? '#' + m.color.getHexString() : '#ffffff',
    hasMap: !!m.map,
  };
}

/**
 * V2 never honoured glTF transparency and never enabled anisotropy. Both are
 * corrected here, applied once at load time and then left alone.
 */
export function sanitizeMaterials(root, maxAnisotropy) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map) {
        m.map.anisotropy = Math.min(8, maxAnisotropy || 1);
        m.map.needsUpdate = true;
      }
      for (const slot of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        if (m[slot]) { m[slot].anisotropy = Math.min(8, maxAnisotropy || 1); }
      }
      if (m.userData?.alphaMode === 'MASK') { m.transparent = false; m.alphaTest = m.alphaTest || 0.5; }
      else if (m.userData?.alphaMode === 'BLEND') { m.transparent = true; m.depthWrite = true; }
    }
  });
}

export function setWireframe(root, on) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { if (m) m.wireframe = on; });
  });
}

/** Lazily built wireframe overlay - much better looking than flipping wireframe on. */
export function ensureWireframeOverlay(root) {
  if (root.userData.wireOverlay) return root.userData.wireOverlay;
  const group = new THREE.Group();
  group.name = 'wire-overlay';
  const mat = new THREE.LineBasicMaterial({ color: 0xa8c4d2, transparent: true, opacity: 0.22, depthWrite: false });
  let count = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    try {
      const wire = new THREE.WireframeGeometry(o.geometry);
      const lines = new THREE.LineSegments(wire, mat);
      lines.matrixAutoUpdate = false;
      o.updateMatrixWorld(true);
      lines.applyMatrix4(o.matrixWorld);
      lines.updateMatrixWorld(true);
      group.add(lines);
      count++;
    } catch (e) {
      console.warn('[wireframe] skipped a mesh', e);
    }
  });
  group.visible = false;
  group.userData.wireMaterial = mat;
  root.userData.wireOverlay = group;
  root.userData.wireCount = count;
  return group;
}
