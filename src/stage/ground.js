// Everything on the floor: pedestal, shadow catcher, contact AO and reference grid.
import * as THREE from 'three';

function radialAlphaTexture(size = 256, power = 2.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(Math.max(0, 1 - r), power);
      const i = (y * size + x) * 4;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.userData.shared = true;
  return tex;
}

const GRID_VERT = `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GRID_FRAG = `
precision highp float;
varying vec2 vPos;
uniform float uCell;
uniform float uExtent;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uMajorColor;

float gridLine(vec2 p, float step) {
  vec2 c = p / step;
  vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  float minor = gridLine(vPos, uCell);
  float major = gridLine(vPos, uCell * 5.0);
  float r = length(vPos);
  float fade = 1.0 - smoothstep(uExtent * 0.18, uExtent * 0.5, r);
  vec3 col = mix(uColor, uMajorColor, major * 0.85);
  float a = max(minor * 0.5, major) * fade * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

export class Stage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'stage';
    this.group.userData.shared = true;
    scene.add(this.group);

    // ---- shadow catcher ------------------------------------------------
    this.catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.34, depthWrite: false, transparent: true })
    );
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.position.y = 0.001;
    this.catcher.receiveShadow = true;
    this.catcher.name = 'shadow-catcher';
    this.catcher.userData.shared = true;
    this.group.add(this.catcher);

    // ---- soft contact AO ------------------------------------------------
    this.aoTex = radialAlphaTexture(256, 2.4);
    this.ao = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.aoTex, transparent: true, opacity: 0.35,
        depthWrite: false, color: 0x000000, toneMapped: false,
      })
    );
    this.ao.rotation.x = -Math.PI / 2;
    this.ao.position.y = 0.002;
    this.ao.renderOrder = 1;
    this.ao.userData.shared = true;
    this.group.add(this.ao);

    // ---- pedestal -------------------------------------------------------
    this.plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.04, 0.08, 96, 1, false),
      new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 0.62, metalness: 0.08 })
    );
    this.plinth.position.y = -0.04;
    this.plinth.receiveShadow = true;
    this.plinth.castShadow = false;
    this.plinth.userData.shared = true;
    this.group.add(this.plinth);

    // ---- reference grid -------------------------------------------------
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCell: { value: 0.25 },
        uExtent: { value: 6 },
        uOpacity: { value: 0.5 },
        uColor: { value: new THREE.Color(0x6d7b88) },
        uMajorColor: { value: new THREE.Color(0x9fb0bd) },
      },
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.gridMat);
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.y = -0.082;
    this.grid.userData.shared = true;
    this.group.add(this.grid);

    this._box = new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 1.6, 0.4));
  }

  /** Resize floor props to match the current exhibit footprint. */
  fitTo(box) {
    if (!box || box.isEmpty()) return;
    this._box.copy(box);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(0.62, Math.max(size.x, size.z) * 0.62);
    this.plinth.scale.set(r, 1, r);
    // Keep the AO blob circular: uniform X/Z scale, never (>1, <1).
    this.ao.scale.set(r * 2.7, r * 2.7, 1);
  }

  setPlinth(v) {
    this.plinth.visible = v;
    this.grid.position.y = v ? -0.082 : 0.0;
  }
  setGrid(v) { this.grid.visible = v; }
  setCatcher(v) { this.catcher.visible = v; this.catcher.receiveShadow = v; }
  setShadowOpacity(v) { this.catcher.material.opacity = v; }
  setContactAO(v) { this.ao.material.opacity = v; }
}
