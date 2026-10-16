// Before/After 3D 对比：同场景同相机，两个 group 用相反法线的 clippingPlanes 做滑动对比。
// 不写 viewer.cache、不接管 modelRoot（绕开 LRU 挤出）；dispose 时完整清理。
import * as THREE from 'three';
import { disposeObject, purgeRenderLists } from '../utils/dispose.js';
import { normalizeModel } from '../models/place.js';

export class CompareRig {
  constructor(viewer) {
    this.viewer = viewer;
    this.groupA = null;   // before
    this.groupB = null;   // after
    this.planeA = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.planeB = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    this.xMin = -0.8;
    this.xMax = 0.8;
    this.split = 0.5;
  }

  // 两个 root 均归一化到相同体积（保证对齐），加入场景，开启局部裁剪。
  load(rootA, rootB) {
    const infoA = normalizeModel(rootA);
    const infoB = normalizeModel(rootB);
    const xa = infoA?.box ? infoA.box.min.x : -0.8;
    const xb = infoA?.box ? infoA.box.max.x : 0.8;
    const xc = infoB?.box ? infoB.box.min.x : -0.8;
    const xd = infoB?.box ? infoB.box.max.x : 0.8;
    this.xMin = Math.min(xa, xc);
    this.xMax = Math.max(xb, xd);

    this.groupA = rootA;
    this.groupB = rootB;
    this.viewer.scene.add(rootA);
    this.viewer.scene.add(rootB);
    this.viewer.renderer.localClippingEnabled = true;
    if (this.viewer.modelRoot) this.viewer.modelRoot.visible = false;

    this._applyPlanes();
    this.setSplit(0.5);
    return this;
  }

  _applyPlanes() {
    const setPlanes = (group, plane) => {
      group.traverse((o) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) { m.clippingPlanes = [plane]; m.clipShadows = true; m.needsUpdate = true; }
        }
      });
    };
    setPlanes(this.groupA, this.planeA);
    setPlanes(this.groupB, this.planeB);
  }

  // t ∈ [0,1]：0 全部显示 B，1 全部显示 A。
  setSplit(t) {
    this.split = Math.max(0, Math.min(1, t));
    const x = this.xMin + this.split * (this.xMax - this.xMin);
    this.planeA.constant = x;      // 法线 -x → 保留 x <= constant（A 在左）
    this.planeB.constant = -x;     // 法线 +x → 保留 x >= -constant（B 在右）
  }

  dispose() {
    for (const g of [this.groupA, this.groupB]) {
      if (!g) continue;
      this.viewer.scene.remove(g);
      disposeObject(g);
    }
    purgeRenderLists(this.viewer.renderer);
    this.viewer.renderer.localClippingEnabled = false;
    if (this.viewer.modelRoot) this.viewer.modelRoot.visible = true;
    this.groupA = this.groupB = null;
  }
}
