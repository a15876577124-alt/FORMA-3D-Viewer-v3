// FORMA V5 — 首页 Hero 电影化 3D 主体
// 独立 scene/renderer，与展厅 viewer 完全隔离；unmount 时完整 dispose。
// 原则：模型是真实琼剧手办资产；光照服务展示，不加无意义粒子与廉价特效。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer, RenderPass, BloomEffect, EffectPass } from 'postprocessing';

const MODEL_URL = './assets/models/sheng.glb';

export function createHero3D({ container, reducedMotion = false, quality = 'high' } = {}) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const renderer = new THREE.WebGLRenderer({
    antialias: quality !== 'low',
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.6);
  renderer.setPixelRatio(dpr);
  renderer.domElement.className = 'v5-hero-canvas';
  container.append(renderer.domElement);

  // ---- 布光：影棚三点（主光在模型面朝侧，暖金；轮廓冷蓝分离）----
  const keyLight = new THREE.DirectionalLight(0xffe2b8, 3.0);
  keyLight.position.set(-2.2, 3.2, 2.9);
  const rimLight = new THREE.DirectionalLight(0x9db8dd, 1.6);
  rimLight.position.set(2.9, 2.2, -2.5);
  const fillLight = new THREE.DirectionalLight(0xf2ede4, 1.1);
  fillLight.position.set(1.6, 0.5, 2.4);
  const ambient = new THREE.AmbientLight(0x3a4050, 0.95);
  scene.add(keyLight, rimLight, fillLight, ambient);

  // 地面微光：极淡暖金小光晕托住脚部（克制，仅提示接地，不喧宾）
  const floorGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 40),
    new THREE.MeshBasicMaterial({
      color: 0xd9c4a0,
      transparent: true,
      opacity: 0.032,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = -1.06;
  scene.add(floorGlow);

  // 环境反射（无 HDRI 时用渐变 env 保证 PBR 高光不空洞）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x1a1d24);
  const envLight = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x59616e, side: THREE.BackSide }),
  );
  envScene.add(envLight);

  // ---- 后期：轻量 Bloom，只提亮金饰高光（阈值高、强度低，克制）----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ intensity: 0.42, luminanceThreshold: 0.72, luminanceSmoothing: 0.28, radius: 0.5 });
  composer.addPass(new EffectPass(camera, bloom));

  // ---- 加载真实手办 ----
  const root = new THREE.Group();
  scene.add(root);
  let model = null;
  let disposed = false, envTarget = null, inView = false;
  root.rotation.y = -1.42;
  const loadState = { ok: false, error: null };
  const loadPromise = new Promise((resolve) => {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if(disposed){gltf.scene.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});resolve(false);return;}
        model = gltf.scene;
        // 归一化：最大维度 2.1；底对齐——脚踩 y=-1.05（适配任意资产外形）
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 2.1 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -box.min.y * scale - 1.05, -center.z * scale);
        model.traverse((o) => {
          if (o.isMesh) {
            o.material.envMapIntensity = 0.9;
            o.castShadow = false; o.receiveShadow = false;
          }
        });
        root.add(model);
        envTarget = pmrem.fromScene(envScene, 0.04);
        scene.environment = envTarget.texture;
        envLight.geometry.dispose();envLight.material.dispose();pmrem.dispose();
        loadState.ok = true;
        resolve(true);
      },
      undefined,
      (err) => { loadState.error = String(err?.message || err).slice(0, 200); resolve(false); },
    );
  });

  // ---- 取景：模型偏画面右侧（文字在左）----
  function frame() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }

  // 相机基准位：视轴向左偏移，使模型（原点）落在画面右三分之一；
  // 初始角 0.55 rad：微侧脸入画（电影感），转速放慢保持庄重
  const BASE = { px: 0.4, py: 0.35, pz: 4.5, lx: 0, ly: -0.05 };
  camera.position.set(BASE.px, BASE.py, BASE.pz);
  camera.lookAt(BASE.lx, BASE.ly, 0);

  // ---- 动画：克制自转 + 呼吸漂移 + 滚动视差 ----
  let raf = 0;
  let running = false;
  let scrollY = 0;
  const clock = new THREE.Clock();
  const reduced = reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick() {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (model && !reduced) {
      // -1.62 rad：与 gallery best yaw 相对（相机方位角 vs 模型自转互为相反）；
      // 微侧脸入画，慢速自转
      root.rotation.y = -1.42 + Math.sin(t * 0.16) * 0.16;
      camera.position.x = BASE.px + Math.sin(t * 0.23) * 0.1;
      camera.position.y = BASE.py - scrollY * 0.0011; // 滚动视差：镜头下沉
      camera.lookAt(BASE.lx, BASE.ly + scrollY * 0.0005, 0);
    }
    composer.render();
  }

  function start() {
    if (running || disposed || document.hidden || !inView) return;
    if(reduced){composer.render();return;}
    running = true;
    clock.start();
    tick();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // 视口外暂停（省电）
  const io = new IntersectionObserver(([e]) => { inView=e.isIntersecting; inView ? start() : stop(); }, { threshold: 0.02 });
  io.observe(container);
  const onScroll = () => { scrollY = window.scrollY || 0; };
  if (!reduced) window.addEventListener('scroll', onScroll, { passive: true });

  const onVisibility=()=>document.hidden?stop():start();
  document.addEventListener('visibilitychange',onVisibility);
  const ro = new ResizeObserver(() => { frame();if(reduced&&!disposed)composer.render(); });
  ro.observe(container);
  frame();
  if (reduced) { // 静态单帧
    loadPromise.then(() => { if(!disposed){frame(); composer.render();} });
  }

  function dispose() {
    disposed=true;
    stop();
    io.disconnect(); ro.disconnect();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange',onVisibility);
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
          m?.dispose();
        }
      }
    });
    pmrem.dispose();
    envTarget?.dispose();envLight.geometry.dispose();envLight.material.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { loadPromise, loadState, dispose, start, stop, get rendered() { return running; } };
}
