// Resource disposal. Without this, switching exhibits or repeatedly importing
// files leaks VAOs, buffers and 2048x2048 textures - V2 never released anything.

const TEXTURE_SLOTS = [
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
  'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap',
  'specularMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'anisotropyMap', 'gradientMap',
];

function isShared(x) {
  return !x || x.userData?.shared === true;
}

export function disposeTexture(tex) {
  if (!tex || isShared(tex)) return;
  if (typeof tex.dispose === 'function') tex.dispose();
}

/**
 * Recursively release GPU resources below `root`.
 * Objects flagged `userData.shared = true` are skipped - those are the long-lived
 * resources owned by the app (environment RT, contact-AO texture, grid, plinth).
 */
export function disposeObject(root) {
  if (!root) return;
  const seenGeo = new Set(), seenMat = new Set(), seenTex = new Set();

  // The wireframe overlay lives in the scene graph as its own sibling, so it is
  // not reachable through traverse(root) and has to be released explicitly.
  const overlay = root.userData?.wireOverlay;
  if (overlay) {
    overlay.traverse((o) => {
      if (o.geometry && !seenGeo.has(o.geometry)) { seenGeo.add(o.geometry); try { o.geometry.dispose(); } catch { /* ignore */ } }
    });
    overlay.userData.wireMaterial?.dispose();
    overlay.userData.wireMaterial = null;
    if (overlay.parent) overlay.parent.remove(overlay);
    root.userData.wireOverlay = null;
  }

  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && !isShared(o.skeleton)) {
      try { o.skeleton.dispose(); } catch { /* already gone */ }
    }

    if (o.geometry && !isShared(o.geometry) && !seenGeo.has(o.geometry)) {
      seenGeo.add(o.geometry);
      try { o.geometry.dispose(); } catch { /* ignore */ }
    }

    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m || isShared(m) || seenMat.has(m)) continue;
      seenMat.add(m);
      for (const slot of TEXTURE_SLOTS) {
        const t = m[slot];
        if (t && !seenTex.has(t)) { seenTex.add(t); disposeTexture(t); }
      }
      try { m.dispose(); } catch { /* ignore */ }
    }
  });

  if (root.parent) root.parent.remove(root);
}

/** Drop render lists so orphaned VAO bindings do not accumulate. */
export function purgeRenderLists(renderer) {
  try { renderer.renderLists?.dispose(); } catch { /* ignore */ }
}

export function snapshotMemory(renderer) {
  const info = renderer.info;
  return {
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    triangles: info.render.triangles,
    calls: info.render.calls,
  };
}
