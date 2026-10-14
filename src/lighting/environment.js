// Environment lighting + backdrop, entirely offline.
//
// There is no HDRI file in this project, so we use three.js' procedural
// RoomEnvironment - a purpose-built studio box of emissive panels - run through
// PMREMGenerator. That gives real image-based diffuse and specular reflections
// with zero external assets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const BACKDROPS = {
  charcoal: { outer: '#080a0c', inner: '#1e242c', halt: 0.55 },
  slate:    { outer: '#070a0e', inner: '#18242f', halt: 0.6 },
  warm:     { outer: '#0b0907', inner: '#2a2320', halt: 0.55 },
  void:     { outer: '#000000', inner: '#0a0c0e', halt: 0.7 },
};

function makeBackdropTexture(spec) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S * 0.5, S * 0.46, 0, S * 0.5, S * 0.46, S * 0.62);
  grad.addColorStop(0, spec.inner);
  grad.addColorStop(spec.halt, mixHex(spec.inner, spec.outer, 0.65));
  grad.addColorStop(1, spec.outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.userData.shared = true;
  return tex;
}

function parseHex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
function mixHex(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.envRT = null;
    this.backdrop = null;
    this.backdropKey = null;
    this.build();
  }

  build() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.85;

    room.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
    pmrem.dispose();

    // Keep for the lifetime of the page.
    this.envRT.texture.userData.shared = true;
  }

  setIntensity(v) { this.scene.environmentIntensity = v; }

  setBackdrop(key) {
    const spec = BACKDROPS[key] || BACKDROPS.charcoal;
    if (this.backdropKey === key && this.backdrop) return this.backdrop;
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    this.backdrop = makeBackdropTexture(spec);
    this.scene.background = this.backdrop;
    this.backdropKey = key;
    return this.backdrop;
  }

  dispose() {
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    this.scene.environment = null;
    this.scene.background = null;
  }
}
