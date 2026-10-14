// Procedural geometry demos built from three.js primitives.
//
// These exist to exercise the material / lighting / post-processing range on
// subjects with wide specular behaviour. They are explicitly labelled as technical
// demos in the UI and are not presented as original character modelling.
import * as THREE from 'three';

function mat(opts) { return new THREE.MeshStandardMaterial(opts); }

function aetherCore() {
  const g = new THREE.Group();

  const shell = mat({ color: 0x22303c, metalness: 0.92, roughness: 0.18, envMapIntensity: 1.2 });
  const shell2 = mat({ color: 0x8fa6b4, metalness: 1.0, roughness: 0.12 });
  const shell3 = mat({ color: 0xc9d8e0, metalness: 1.0, roughness: 0.06 });

  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.86, 96, 64), shell));
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.66, 72, 48), shell2);
  g.add(mid);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.44, 64, 40), shell3);
  g.add(core);

  const ring = mat({ color: 0xd6e2e8, metalness: 1, roughness: 0.14 });
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(1.02 + i * 0.11, 0.024, 20, 220), ring);
    t.rotation.set(Math.PI / 2 + i * 0.55, i * 0.7, i * 0.35);
    g.add(t);
  }

  const strut = mat({ color: 0x4a5a68, metalness: 0.85, roughness: 0.32 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.3), strut);
    b.position.set(Math.cos(a) * 0.95, Math.sin(a * 2) * 0.22, Math.sin(a) * 0.95);
    b.lookAt(0, 0, 0);
    g.add(b);
  }

  const glow = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, toneMapped: false });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), glow);
    s.position.set(Math.cos(a) * 1.18, 0.42 + Math.sin(a * 3) * 0.2, Math.sin(a) * 1.18);
    g.add(s);
  }
  return g;
}

function fluxSculpture() {
  const g = new THREE.Group();
  const knotMat = mat({ color: 0xe4d9c6, metalness: 0.28, roughness: 0.34, envMapIntensity: 1.1 });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.58, 0.17, 260, 40, 2, 3), knotMat);
  knot.position.y = 0.62;
  g.add(knot);

  const base = new THREE.Mesh(new THREE.SphereGeometry(0.44, 72, 48), mat({ color: 0x6f5f52, metalness: 0.15, roughness: 0.62 }));
  base.position.y = 1.18;
  base.scale.set(1, 0.72, 1);
  g.add(base);

  const ringMat = mat({ color: 0xcfc0aa, metalness: 0.94, roughness: 0.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.03, 18, 200), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.28;
  g.add(ring);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.022, 16, 180), ringMat);
  ring2.rotation.set(Math.PI / 2, 0.4, 0.2);
  ring2.position.y = 0.96;
  g.add(ring2);
  return g;
}

function prismArray() {
  const g = new THREE.Group();
  const body = mat({ color: 0x9fb3c2, metalness: 0.96, roughness: 0.16, envMapIntensity: 1.25 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const h = 1.0 + (i % 3) * 0.34;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, h, 5), body);
    p.position.set(Math.cos(a) * 0.66, h / 2, Math.sin(a) * 0.66);
    p.rotation.y = a;
    g.add(p);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 64, 40),
    new THREE.MeshStandardMaterial({ color: 0xdfeaf2, metalness: 1, roughness: 0.05, emissive: 0x16303f, emissiveIntensity: 0.9 })
  );
  core.position.y = 0.62;
  g.add(core);

  const ringMat = mat({ color: 0xc7d6df, metalness: 1, roughness: 0.1 });
  const base = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.035, 20, 200), ringMat);
  base.rotation.x = Math.PI / 2;
  base.position.y = 0.03;
  g.add(base);
  return g;
}

const BUILDERS = { aether: aetherCore, flux: fluxSculpture, prism: prismArray };

export function buildProcedural(kind) {
  const fn = BUILDERS[kind];
  if (!fn) throw new Error('未知的演示类型：' + kind);
  const g = fn();
  g.name = 'procedural:' + kind;
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.alphaMode = 'OPAQUE';
  });
  return g;
}
