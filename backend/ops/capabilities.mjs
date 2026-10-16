// 算子能力探测：真实检测 gltf-transform / sharp / meshoptimizer 是否可用。
// 结果决定算子 status（available/unavailable），UI 据此灰显并给原因。
let cached = null;

export async function detectCapabilities() {
  if (cached) return cached;
  const cap = { gltfTransform: false, sharp: false, meshoptimizer: false, simplify: false, textureResize: false, textureCompress: false };
  const reasons = [];
  try {
    await import('@gltf-transform/core');
    await import('@gltf-transform/functions');
    cap.gltfTransform = true;
  } catch (e) { reasons.push('gltf-transform: ' + e.message); }
  try {
    await import('sharp');
    cap.sharp = true;
  } catch (e) { reasons.push('sharp: ' + e.message); }
  try {
    const mo = await import('meshoptimizer');
    if (mo.MeshoptSimplifier) cap.meshoptimizer = true;
  } catch (e) { reasons.push('meshoptimizer: ' + e.message); }
  cap.simplify = cap.gltfTransform && cap.meshoptimizer;
  cap.textureResize = cap.gltfTransform && cap.sharp;
  cap.textureCompress = cap.gltfTransform && cap.sharp;
  cached = { ...cap, reasons };
  return cached;
}
