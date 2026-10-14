// Placement helpers: normalise any incoming model to a predictable studio scale,
// centre it on the plinth, and frame it from any stored camera state.
import * as THREE from 'three';

export const TARGET_HEIGHT = 1.6;

/**
 * Uniformly scale + centre an arbitrary model so it always occupies the same
 * exhibition volume. Uniform scaling only: proportions are never altered.
 * `root` must already be inside a parent group whose transform is identity.
 *
 * Idempotent: the result is cached on the object, so remounting a model out of
 * the LRU cache can never scale or shift it twice.
 */
export function normalizeModel(root, targetHeight = TARGET_HEIGHT) {
  if (root.userData.__normalized) return root.userData.__normalized;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!(maxDim > 0)) return null;

  const s = targetHeight / maxDim;
  root.scale.multiplyScalar(s);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y;   // sit exactly on the ground plane
  root.updateMatrixWorld(true);

  const size2 = box2.getSize(new THREE.Vector3());
  const info = {
    box: new THREE.Box3().setFromObject(root),
    size: size2,
    height: size2.y,
    center: new THREE.Vector3(0, size2.y / 2, 0),
    appliedScale: s,
    originalHeight: size.y,
  };
  root.userData.__normalized = info;
  return info;
}

/**
 * Distance at which a box fits in frame. Accounts for horizontal fit on narrow
 * viewports, otherwise tall models get cropped on phones.
 */
export function fitDistance(box, camera, padding = 1.45) {
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fovV = THREE.MathUtils.degToRad(camera.fov);
  let dist = (maxDim / 2) / Math.tan(fovV / 2) * padding;
  const aspect = camera.aspect || 1;
  if (aspect < 1) dist /= aspect * 0.86;         // vertical shared between attributes
  const halfH = Math.tan(fovV / 2) * dist;
  const halfW = halfH * aspect;
  const need = Math.max(size.y / 2 / halfH, size.x / 2 / halfW, size.z / 2 / halfW);
  if (need > 1) dist *= need;
  return dist;
}

export const PADDING_STANDARD = 1.45;
export const PADDING_IMMERSIVE = 1.12;

/** Apply a stored camera state (yaw/pitch/distMul) to camera + controls target. */
export function applyView(camera, controls, box, view, padding = PADDING_STANDARD) {
  const size = box.getSize(new THREE.Vector3());
  const targetY = size.y * (view.targetYMul ?? 0.5);
  const target = new THREE.Vector3(0, targetY, 0);
  const base = fitDistance(box, camera, PADDING_STANDARD);
  const dist = base * (view.distMul ?? 1) * (padding / PADDING_STANDARD);

  const pitch = THREE.MathUtils.clamp(view.pitch ?? 0.2, 0.02, 1.4);
  const yaw = view.yaw ?? 0.42;
  const cp = Math.cos(pitch);
  camera.position.set(
    target.x + dist * Math.sin(yaw) * cp,
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(yaw) * cp
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(target);
    controls.minDistance = base * 0.30;
    controls.maxDistance = base * 3.2;
    controls.update();
  }
  return { dist, target, base };
}

/** Read the current camera back into a storable yaw/pitch/distMul. */
export function readView(camera, controls, box) {
  const target = controls ? controls.target : new THREE.Vector3();
  const base = fitDistance(box, camera);
  const offset = camera.position.clone().sub(target);
  const dist = Math.max(offset.length(), 1e-6);
  const size = box.getSize(new THREE.Vector3());
  return {
    yaw: Math.atan2(offset.x, offset.z),
    pitch: Math.asin(THREE.MathUtils.clamp(offset.y / dist, -1, 1)),
    distMul: THREE.MathUtils.clamp(dist / base, 0.3, 3.2),
    targetYMul: size.y > 0 ? THREE.MathUtils.clamp(target.y / size.y, 0, 1) : 0.5,
    fov: camera.fov,
  };
}

/** Count triangles/vertices across a loaded subtree - used by the test harness. */
export function countGeometry(root) {
  let verts = 0, tris = 0, meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const g = o.geometry;
    const pos = g.attributes.position;
    if (!pos) return;
    verts += pos.count;
    tris += g.index ? g.index.count / 3 : pos.count / 3;
  });
  return { verts, tris, meshes };
}
