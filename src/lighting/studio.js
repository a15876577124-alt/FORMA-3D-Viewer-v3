// Studio three-point lighting plus natural ground contact shadow.
//
// Key light uses a DirectionalLight rather than a SpotLight on purpose: its
// orthographic shadow camera can be fit tightly around the subject, so the whole
// 2048^2 shadow texel budget lands on the figurine instead of being wasted on
// empty space. That is what makes the contact shadow read convincingly.
import * as THREE from 'three';

export const LIGHT_PRESETS = {
  studio: {
    label: '影棚',
    key: { color: 0xffffff, intensity: 2.2, pos: [2.6, 3.4, 2.2] },
    fill: { color: 0xdfe9f2, intensity: 0.55, pos: [-3.0, 1.6, 1.4] },
    rim: { color: 0xffe9d0, intensity: 1.1, pos: [-1.4, 2.2, -3.0] },
    hemi: 0.25,
  },
  cool: {
    label: '冷调',
    key: { color: 0xf2f7ff, intensity: 2.4, pos: [2.4, 3.6, 1.8] },
    fill: { color: 0x9fc0e0, intensity: 0.7, pos: [-2.6, 1.4, 1.8] },
    rim: { color: 0xbcd8ff, intensity: 1.3, pos: [-1.2, 2.6, -2.8] },
    hemi: 0.28,
  },
  warm: {
    label: '暖调',
    key: { color: 0xffeed6, intensity: 2.3, pos: [2.2, 3.2, 2.6] },
    fill: { color: 0xe6cdae, intensity: 0.6, pos: [-2.8, 1.5, 1.2] },
    rim: { color: 0xffc98a, intensity: 1.2, pos: [-1.6, 2.0, -2.6] },
    hemi: 0.3,
  },
  dramatic: {
    label: '戏剧',
    key: { color: 0xffffff, intensity: 3.2, pos: [3.2, 2.6, 1.2] },
    fill: { color: 0x4a5a72, intensity: 0.22, pos: [-2.8, 1.2, 1.6] },
    rim: { color: 0xffd9a8, intensity: 1.9, pos: [-1.0, 3.0, -3.2] },
    hemi: 0.1,
  },
};

function makeLight(color, intensity, pos, shadow, mapSize) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.width = mapSize;
    l.shadow.mapSize.height = mapSize;
    l.shadow.camera.near = 0.05;
    l.shadow.camera.far = 24;
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.02;
    // VSM-only knob: with PCF this is ignored. Kept modest so thin headdress
    // parts do not bleed light into each other.
    l.shadow.radius = 3;
    l.shadow.blurSamples = 12;
  }
  return l;
}

export class Lighting {
  constructor(scene, mapSize = 2048) {
    this.scene = scene;
    this.mode = 'studio';

    this.key = makeLight(0xffffff, 2.2, [2.6, 3.4, 2.2], true, mapSize);
    this.fill = makeLight(0xdfe9f2, 0.55, [-3.0, 1.6, 1.4], false, mapSize);
    this.rim = makeLight(0xffe9d0, 1.1, [-1.4, 2.2, -3.0], false, mapSize);
    this.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x12151a, 0.25);

    this.group = new THREE.Group();
    this.group.name = 'studio-lights';
    this.group.add(this.key, this.key.target, this.fill, this.fill.target, this.rim, this.rim.target, this.hemi);
    this.group.userData.shared = true;
    scene.add(this.group);
    this.group.userData.shared = true;

    this._subjectBox = new THREE.Box3(new THREE.Vector3(-0.6, 0, -0.6), new THREE.Vector3(0.6, 1.6, 0.6));
  }

  setShadowMapSize(n) {
    if (this.key.shadow.mapSize.width === n) return;
    this.key.shadow.mapSize.width = n;
    this.key.shadow.mapSize.height = n;
    if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
  }

  /** Fit the key light's shadow frustum tightly around the current subject. */
  fitTo(box) {
    if (!box || box.isEmpty()) return;
    this._subjectBox.copy(box);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.72 + 0.15;

    const preset = LIGHT_PRESETS[this.mode] || LIGHT_PRESETS.studio;
    const dir = new THREE.Vector3(...preset.key.pos).normalize();

    this.key.target.position.copy(center);
    this.key.target.updateMatrixWorld();
    this.key.position.copy(center).addScaledVector(dir, Math.max(4, radius * 4));

    const cam = this.key.shadow.camera;
    cam.left = -radius; cam.right = radius;
    cam.top = radius; cam.bottom = -radius;
    cam.near = 0.05;
    cam.far = Math.max(8, radius * 10);
    cam.updateProjectionMatrix();

    this.fill.target.position.copy(center);
    this.rim.target.position.copy(center);
    this.fill.target.updateMatrixWorld();
    this.rim.target.updateMatrixWorld();
  }

  setMode(mode) {
    const p = LIGHT_PRESETS[mode] || LIGHT_PRESETS.studio;
    this.mode = mode;
    this.key.color.setHex(p.key.color);
    this.fill.color.setHex(p.fill.color);
    this.rim.color.setHex(p.rim.color);
    this.key.intensity = p.key.intensity;
    this.fill.intensity = p.fill.intensity;
    this.rim.intensity = p.rim.intensity;
    this.hemi.intensity = p.hemi;
    const center = this._subjectBox.getCenter(new THREE.Vector3());
    const radius = Math.max(...this._subjectBox.getSize(new THREE.Vector3()).toArray()) * 0.72 + 0.15;
    this.key.position.copy(center).addScaledVector(new THREE.Vector3(...p.key.pos).normalize(), Math.max(4, radius * 4));
    this.fill.position.copy(center).addScaledVector(new THREE.Vector3(...p.fill.pos).normalize(), Math.max(4, radius * 4));
    this.rim.position.copy(center).addScaledVector(new THREE.Vector3(...p.rim.pos).normalize(), Math.max(4, radius * 4));
    return p;
  }

  /** Called every frame the UI touched something - cheap setter bundle. */
  apply(state) {
    this.key.intensity = state.key;
    this.fill.intensity = state.fill;
    this.rim.intensity = state.rim;
    this.hemi.intensity = state.hemi;
    this.key.castShadow = !!state.shadow;
  }

  get sliders() {
    return { key: this.key.intensity, fill: this.fill.intensity, rim: this.rim.intensity, hemi: this.hemi.intensity };
  }
}
