// FORMA V5 — 轻量独立 3D 查看器
// 与 gallery viewer 完全隔离的独立 WebGL 上下文，用于首页 Hero 与作品详情页。
// 职责：加载任意 GLB、底对齐归一化、影棚布光 + RoomEnvironment、
// 可选交互（OrbitControls）、慢速自转、完整 dispose。
import * as THREE from 'three';
import {disposeObject} from '../utils/dispose.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Environment } from '../lighting/environment.js';
import { Lighting } from '../lighting/studio.js';
import { PUBLIC_RENDER_PROFILE } from '../lighting/profile.js';
import { normalizeModel, applyView, readView } from '../models/place.js';
import { sanitizeMaterials } from '../materials/override.js';

export function createMiniViewer({
  container,
  modelUrl,
  autoRotateSpeed = 0.05,
  view = {yaw:0.235,pitch:0.11,distMul:1,targetYMul:0.5},
  interactive = true,
  cameraFov = 38,
  onReady,
  onError,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.toneMapping = PUBLIC_RENDER_PROFILE.toneMapping;
  renderer.toneMappingExposure = PUBLIC_RENDER_PROFILE.exposure;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.VSMShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'v5-mini-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.05, 80);
  camera.position.set(1.1, 0.5, 4.6);

  const lighting=new Lighting(scene,innerWidth<=767?1024:2048);
  const environment=new Environment(renderer,scene);

  // 接地微光（与 hero 一致的克制处理）
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 40),
    new THREE.MeshBasicMaterial({ color: 0xd9c4a0, transparent: true, opacity: 0.032, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.01;
  scene.add(glow);

  const root = new THREE.Group();
  scene.add(root);

  const controls = interactive
    ? new OrbitControls(camera, renderer.domElement)
    : null;
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.2;
    controls.maxDistance = 9;
    controls.target.set(0, 0, 0);
  }
  const cameraControls=controls||{target:new THREE.Vector3(),update(){}};

  // ---- 与 Gallery 共用底对齐归一化和纹理采样 ----
  let model = null, bounds=null, framed=false, disposed = false;
  const stats = { tris: 0, verts: 0, meshes: 0, textures:0, maxTextureWidth:0 };
  const loadPromise = new Promise((resolve) => {
    new GLTFLoader().load(modelUrl, (gltf) => {
      if(disposed){disposeObject(gltf.scene);resolve(null);return;}
      model = gltf.scene;
      sanitizeMaterials(model,renderer.capabilities.getMaxAnisotropy());
      bounds=normalizeModel(model).box;
      lighting.setMode('studio');lighting.fitTo(bounds);
      const textures=new Set();
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow=true;o.receiveShadow=true;
        stats.meshes++;
        const pos = o.geometry?.getAttribute?.('position');
        if (pos) { stats.verts += pos.count; stats.tris += (o.geometry.index ? o.geometry.index.count : pos.count) / 3; }
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
        }
      });
      root.add(model);
      stats.textures=textures.size;stats.maxTextureWidth=Math.max(0,...[...textures].map(t=>t.image?.width||0));
      frame();
      resolve(stats);
      onReady?.(stats);
    }, undefined, (err) => { onError?.(err); resolve(null); });
  });

  // ---- 尺寸与渲染循环 ----
  function frame() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const current=bounds&&framed?readView(camera,cameraControls,bounds):view;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if(bounds){applyView(camera,cameraControls,bounds,current);framed=true;}
    render();
  }
  let raf = 0, running = false;
  const clock = new THREE.Clock();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(controls){controls.enableDamping=!reduced;controls.autoRotate=!reduced&&autoRotateSpeed>0;controls.autoRotateSpeed=autoRotateSpeed*30;controls.addEventListener('change',()=>{if(reduced)render();});}
  function render(){if(!disposed&&!document.hidden&&renderer.domElement.getClientRects().length)renderer.render(scene,camera);}

  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if(document.hidden)return;
    controls?.update(dt);
    renderer.render(scene, camera);
  }
  function start() { if (running || disposed || document.hidden) return; if(reduced){render();return;}running = true; clock.start(); tick(); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  const io = new IntersectionObserver(([e]) => { e.isIntersecting ? start() : stop(); }, { threshold: 0.02 });
  io.observe(container);
  const visibility=()=>document.hidden?stop():container.getClientRects().length&&start();
  document.addEventListener('visibilitychange',visibility);
  const ro = new ResizeObserver(frame);
  ro.observe(container);
  frame();

  function dispose() {
    if(disposed)return;disposed=true;
    stop();
    document.removeEventListener('visibilitychange',visibility);
    io.disconnect(); ro.disconnect(); controls?.dispose();
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m?.dispose(); }
      }
    });
    lighting.key.shadow.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return { loadPromise, stats, dispose, start, stop, render, renderer, scene, camera, controls, root,
    get modelRoot() { return model; }, get running() { return running; } };
}
