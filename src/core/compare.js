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

  // Use Original placement for both versions; never normalize away an actual change.
  load(rootA, rootB) {
    const groupA=new THREE.Group(),groupB=new THREE.Group();
    groupA.add(rootA);groupB.add(rootB);
    normalizeModel(groupA);
    groupB.position.copy(groupA.position);groupB.scale.copy(groupA.scale);
    // Preserve genuine changes in scale/position between the two asset versions.
    rootA=groupA;rootB=groupB;
    this.groupA=rootA;this.groupB=rootB;
    this.viewer.compareRig=this;
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
          for (const m of mats) { m.clippingPlanes = [plane]; m.clipShadows = false; m.needsUpdate = true; }
        }
      });
    };
    setPlanes(this.groupA, this.planeA);
    setPlanes(this.groupB, this.planeB);
  }

  // t ∈ [0,1]：0 全部显示 B，1 全部显示 A。
  setSplit(t) {
    this.split = Math.max(0, Math.min(1, t));
    this.updatePlanes();
  }

  updatePlanes() {
    const camera=this.viewer.camera;
    camera.updateMatrixWorld();
    const x=(2*this.split-1)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;
    this.planeA.normal.set(-1,0,-x).normalize().applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    this.planeA.constant=-this.planeA.normal.dot(camera.getWorldPosition(new THREE.Vector3()));
    this.planeB.copy(this.planeA).negate();
    this.groupA.visible=this.split>0;this.groupB.visible=this.split<1;
  }

  dispose() {
    if(this.viewer.compareRig===this)this.viewer.compareRig=null;
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
