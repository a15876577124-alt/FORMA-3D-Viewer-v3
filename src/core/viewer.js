// The rendering core: renderer, scene graph, camera rig, model lifecycle and every
// parameter that affects how an exhibit is presented.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Environment, BACKDROPS } from '../lighting/environment.js';
import { Lighting, LIGHT_PRESETS } from '../lighting/studio.js';
import { Stage } from '../stage/ground.js';
import { PostFX } from '../post/composer.js';
import {
  normalizeModel, fitDistance, applyView, readView, countGeometry, PADDING_STANDARD, PADDING_IMMERSIVE, exhibitionDistance,
} from '../models/place.js';
import { snapshotBaseline, applyMaterialState, readEffective, sanitizeMaterials, ensureWireframeOverlay } from '../materials/override.js';
import { buildProcedural } from '../models/procedural.js';
import { loadGLTF, loadOBJ, loadFBX } from '../loaders/importers.js';
import { computeWeldedNormals } from '../loaders/normals.js';
import { disposeObject, purgeRenderLists, snapshotMemory } from '../utils/dispose.js';
import { setProgress, toast, formatNumber } from '../utils/dom.js';
import { MAX_FILE_BYTES } from '../loaders/importers.js';

const TONE_MAP = {
  neutral: THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  none: THREE.NoToneMapping,
};

export class Viewer {
  constructor(canvas, caps) {
    this.canvas = canvas;
    this.caps = caps;
    this.container = canvas.parentElement;
    this.shell = canvas.closest('.viewport-shell') || this.container;
    this.viewport = canvas.closest('.viewport') || this.container;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: caps.antialias,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: caps.testMode,   // only where it helps automated capture
    });
    this.renderer.setPixelRatio(caps.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = TONE_MAP.neutral;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    // three r186 removed PCFSoftShadowMap. VSM is the only remaining type whose
    // blur radius can be tuned, and soft contact shadow is a stated requirement,
    // so we use VSM with a tight frustum (see Lighting.fitTo) to keep it clean.
    // ?shadow=pcf switches to the crisper, artifact-free fallback.
    this.renderer.shadowMap.type = caps.params?.get('shadow') === 'pcf'
      ? THREE.PCFShadowMap
      : THREE.VSMShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 220);
    this.camera.position.set(0, 1.2, 4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 1.2;

    this.environment = new Environment(this.renderer, this.scene);
    this.lighting = new Lighting(this.scene, caps.shadowMapSize);
    this.stage = new Stage(this.scene);
    this.post = new PostFX(this.renderer, this.scene, this.camera, caps);

    this.modelRoot = null;
    this.currentEntry = null;
    this.currentMeta = null;
    this.box = new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 1.6, 0.4));
    this.padding = PADDING_STANDARD;
    this.immersive = false;

    this.cache = new Map();
    this.pinned = new Set();   // pinned entries are never evicted (Before/After compare)
    this.ticket = 0;
    this.mixer = null;
    this.timer = new THREE.Timer();
    this.timer.connect(document);   // keeps delta sane when the tab is restored
    this.animations = [];
    this.clipIndex = 0;
    this.busy = false;

    this.onStateChange = null;   // called on every camera move, for persistence
    this.onMount = null;

    this._cameraDirty = false;
    this.controls.addEventListener('change', () => { this._cameraDirty = true; });

    this._bindResize();
    this._start();
  }

  // ------------------------------------------------------------------ loop --

  _start() {
    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      this.timer.update();
      if(document.hidden || !this.canvas.getClientRects().length) return;
      const dt = Math.min(this.timer.getDelta(), 0.1);
      if (this.mixer) this.mixer.update(dt);
      this.controls.update(dt);
      if(this._renderDirty || this._cameraDirty || this.controls.autoRotate || (this.action && !this.action.paused))this.render(dt);
      if (this._cameraDirty) {
        this._cameraDirty = false;
        this.onStateChange?.('camera');
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  invalidate() { this._renderDirty = true; }

  render() { this._renderDirty = false; this.compareRig?.updatePlanes(); this.post.render(); }

  // ---------------------------------------------------------------- resize --

  _bindResize() {
    const apply = () => {
      const w = this.viewport.clientWidth;
      const h = this.viewport.clientHeight;
      // A hidden route keeps its last valid aspect and camera. Do not resize its
      // shared render targets to 1x1 or serialize that temporary projection.
      if(!w||!h)return;
      if(this.size?.w===w && this.size?.h===h)return;
      const view=this.modelRoot&&this.size?.w>1&&this.size?.h>1 ? this.readCamera() : null;
      this.invalidate();
      this.size = { w, h };
      this.renderer.setPixelRatio(this.caps.dpr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.post.setSize(w, h, this.caps.dpr);
      if(view&&w>1&&h>1)this.applyViewAngle(false,view);
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', () => setTimeout(apply, 120));
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => apply());
      this._ro.observe(this.viewport);
    }
    this.applyResize = apply;
  }

  // ----------------------------------------------------------- load / mount --

  async _loadEntry(entry) {
    if (entry.procedural) {
      const proc = buildProcedural(entry.procedural);
      return { root: proc, animations: [], extras: { format: 'procedural', name: entry.name } };
    }
    const onProgress = (r, loaded, total) => {
      const pct = Math.round(r * 100);
      setProgress(pct, total ? `载入 ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : '载入中…');
    };
    const t0 = performance.now();
    const res = await loadGLTF(entry.file, { onProgress });
    res.extras.loadMs = Math.round(performance.now() - t0);
    return res;
  }

  async showEntry(entry, { force = false } = {}) {
    const ticket = ++this.ticket;
    setProgress(2, '载入 ' + entry.name + '…');
    this.busy = true;
    try {
      let loaded = this.cache.get(entry.id);
      if (!loaded || force) {
        loaded = await this._loadEntry(entry);
        if (ticket !== this.ticket) { this._disposeLoaded(loaded); throw { stale: true }; }
        snapshotBaseline(loaded.root);
        sanitizeMaterials(loaded.root, this.caps.maxAnisotropy);
        this.cache.set(entry.id, loaded);
        this._evictCache();
      }
      this._mount(loaded, entry);
      setProgress(null);
      return true;
    } catch (err) {
      setProgress(null);
      if (err && err.stale) return false;
      throw err;
    } finally {
      if (ticket === this.ticket) this.busy = false;
    }
  }

  _evictCache() {
    const cap = this.caps.mobile ? 2 : 5;
    const keys = [...this.cache.keys()];
    for (const oldest of keys) {
      if(this.cache.size <= cap)break;
      if (this.currentEntry && oldest === this.currentEntry.id) { continue; }
      if (this.pinned && this.pinned.has(oldest)) { continue; }
      const victim = this.cache.get(oldest);
      this.cache.delete(oldest);
      this._disposeLoaded(victim);
    }
  }

  pin(id) { this.pinned.add(id); }
  unpin(id) { this.pinned.delete(id); }

  _disposeLoaded(loaded) {
    if (!loaded) return;
    disposeObject(loaded.root);
    purgeRenderLists(this.renderer);
  }

  _mount(loaded, entry) {
    // Anything already on stage goes away first; cached roots are never freed.
    if (this.modelRoot && this.modelRoot !== loaded.root) this.scene.remove(this.modelRoot);

    this.modelRoot = loaded.root;
    this.currentEntry = entry;
    this.currentMeta = loaded.extras;
    this.scene.add(loaded.root);

    const info = normalizeModel(loaded.root);
    if (!info) throw new Error('模型为空或无法归一化：' + entry.name);
    this.box = info.box;
    this.modelHeight = info.height;
    this.originalHeight = info.originalHeight;

    this.lighting.fitTo(this.box);
    this.stage.fitTo(this.box);

    this.animations = loaded.animations || [];
    this.mixer = null;
    this.clipIndex = 0;
    if (this.animations.length) {
      this.mixer = new THREE.AnimationMixer(loaded.root);
      this.clipIndex = 0;
      this.action = this.mixer.clipAction(this.animations[0]);
      this.action.play();
    }

    const stats = countGeometry(loaded.root);
    this.stats = { ...stats, height: info.height, originalHeight: info.originalHeight, format: loaded.extras.format };

    this.applyViewAngle(true);
    applyMaterialState(loaded.root, this.materialState || { mode: 'original' });
    this._syncWireframe();
  }

  /** Cache then mount a user import, so it can be navigated back to like any
   *  catalogue exhibit and is disposed by the same LRU policy. */
  mountImported(loaded, entry) {
    snapshotBaseline(loaded.root);
    sanitizeMaterials(loaded.root, this.caps.maxAnisotropy);
    const previous = this.cache.get(entry.id);
    this.cache.set(entry.id, loaded);
    this._mount(loaded, entry);
    if (previous && previous !== loaded) this._disposeLoaded(previous);
    this._evictCache();
  }

  forget(id) {
    const victim = this.cache.get(id);
    if (!victim) return;
    this.cache.delete(id);
    if (this.modelRoot === victim.root) this.scene.remove(victim.root);
    this._disposeLoaded(victim);
  }

  // --------------------------------------------------------------- visuals --

  setToneMapping(mode) { this.invalidate();
    this.renderer.toneMapping = TONE_MAP[mode] ?? TONE_MAP.neutral;
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => (x.needsUpdate = true)); } });
  }

  setExposure(v) { this.invalidate(); this.renderer.toneMappingExposure = v; }

  setBackground(key) { this.invalidate(); this.environment.setBackdrop(key || 'charcoal'); }
  static get backgrounds() { return Object.keys(BACKDROPS); }

  setFov(v) { this.invalidate();
    this.camera.fov = v;
    this.camera.updateProjectionMatrix();
    if (!this.modelRoot) return;
    // Re-frame at the same angle, otherwise changing FOV "zooms" unexpectedly.
    const cur = this.readCamera();
    this.applyViewAngle(false, { ...cur, fov: v });
  }

  applyLighting(state) { this.invalidate();
    this.lighting.apply(state);
    this.stage.setShadowOpacity(state.shadowOpacity);
    this.stage.setContactAO(state.contactAO);
    this.environment.setIntensity(state.__envIntensity ?? 0.85);
  }

  setLightMode(mode) { this.invalidate();
    const p = this.lighting.setMode(mode);
    this.lighting.fitTo(this.box);
    return p;
  }

  applyMaterial(state) { this.invalidate();
    this.materialState = state;
    const res = applyMaterialState(this.modelRoot, state);
    return res;
  }

  readMaterial() { return readEffective(this.modelRoot); }

  setWireframe(on) { this.invalidate();
    this.wireframeOn = on;
    this._syncWireframe();
  }

  _syncWireframe() {
    if (!this.modelRoot) return;
    const grp = ensureWireframeOverlay(this.modelRoot);
    grp.visible = !!this.wireframeOn;
    if (!this.wireAdded) { this.scene.add(grp); this.wireAdded = grp; }
    if (this.wireAdded !== grp) { this.scene.remove(this.wireAdded); this.scene.add(grp); this.wireAdded = grp; }
  }

  setGrid(on) { this.invalidate(); this.stage.setGrid(on); }
  setPlinth(on) { this.invalidate(); this.stage.setPlinth(on); }
  setShadowCatcher(on) { this.invalidate(); this.stage.setCatcher(on); }
  setAutoRotate(on) { this.invalidate(); this.controls.autoRotate = !!on; }
  setAutoRotateSpeed(v) { this.invalidate(); this.controls.autoRotateSpeed = 1.2 * v; }

  // 视角预设：yaw/pitch（度）。yaw 0 = 正面（+z），pitch 90 = 顶视。
  // 保持当前距离，仅改方位——不破坏用户已调好的取景。
  setViewPreset(yawDeg = 0, pitchDeg = 0) {
    const c = this.controls;
    const r = c.getDistance();
    const phi = THREE.MathUtils.clamp(
      Math.PI / 2 - THREE.MathUtils.degToRad(pitchDeg), 0.08, Math.PI - 0.08,
    );
    const sph = new THREE.Spherical(r, phi, THREE.MathUtils.degToRad(yawDeg));
    c.object.position.setFromSpherical(sph).add(c.target);
    c.update();
    this.onStateChange?.();
    this.render();
  }
  setEnvIntensity(v) { this.invalidate(); this.environment.setIntensity(v); }

  setPost(state) { this.invalidate();
    this.post.configure(state);
    if (!state.bloom && this.caps.lowPower) this.post.active = false;
  }

  // ---------------------------------------------------------------- camera --

  applyViewAngle(reset, viewState) { this.invalidate();
    if (!this.modelRoot) return;
    const view = reset
      ? { yaw: this.currentEntry?.best?.yaw ?? 0.42, pitch: this.currentEntry?.best?.pitch ?? 0.2, distMul: this.currentEntry?.best?.distMul ?? 1, targetYMul: this.currentEntry?.best?.targetYMul ?? 0.5, fov: this.camera.fov }
      : (viewState || this.lastView || this.currentEntry?.best);
    if (!view) return;
    if (view.fov && Math.abs(view.fov - this.camera.fov) > 0.01) { this.camera.fov = view.fov; this.camera.updateProjectionMatrix(); }
    const r = applyView(this.camera, this.controls, this.box, view, this.padding, this.presentation==='gallery'?exhibitionDistance:null);
    this.fitBase = r.base;
    this.lastView = r.view ?? view;
    this.controls.update();
  }

  /** Restore the stored camera for the current exhibit. */
  applyStoredView(state) { this.applyViewAngle(false, state.camera); }

  readCamera() { return readView(this.camera, this.controls, this.box, this.presentation==='gallery'?exhibitionDistance:null); }

  setImmersive(on) {
    this.immersive = on;
    this.padding = on ? PADDING_IMMERSIVE : PADDING_STANDARD;
    document.body.classList.toggle('mode-immersive', on);
    requestAnimationFrame(() => { this.applyResize(); this.applyViewAngle(false, this.lastView || this.currentEntry?.best); });
  }

  // ------------------------------------------------------------ animations --

  playClip(i) {
    if (!this.animations.length || !this.mixer) return null;
    this.clipIndex = ((i % this.animations.length) + this.animations.length) % this.animations.length;
    this.mixer.stopAllAction();
    this.action = this.mixer.clipAction(this.animations[this.clipIndex]);
    this.action.reset().play();
    return this.animations[this.clipIndex].name;
  }
  toggleAnimation() { this.invalidate();
    if (!this.action) return null;
    this.action.paused = !this.action.paused;
    return !this.action.paused;
  }

  // --------------------------------------------------------------- capture --

  /** Synchronous render + read so the drawing buffer is guaranteed to be intact. */
  capturePNG(scale = 1, filename) {
    const { w, h } = this.size;
    const maxDim = Math.min(this.caps.maxTextureSize, 8192);
    const maxScale = Math.max(1, Math.min(4, maxDim / (Math.max(w, h) * this.caps.dpr)));
    const s = Math.min(scale, maxScale);
    const basePR = this.caps.dpr;
    const pr = basePR * s;

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.post.forceComposer?.();
    this.post.render();
    this.renderer.render(this.scene, this.camera);
    this.post.render();

    const url = this.canvas.toDataURL('image/png');

    this.renderer.setPixelRatio(basePR);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, basePR);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.render();

    if (filename) {
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
    }
    return url;
  }

  currentFilename(ext = 'png') {
    const n = (this.currentEntry?.id || 'model');
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `FORMA-${n}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  }

  // -------------------------------------------------------------- analytics --

  get info() {
    return {
      model: this.currentEntry?.id || null,
      modelTris: this.stats?.tris ?? 0,
      modelVerts: this.stats?.verts ?? 0,
      meshes: this.stats?.meshes ?? 0,
      bboxHeight: +(this.modelHeight ?? 0).toFixed(4),
      format: this.stats?.format ?? null,
      renderTriangles: this.renderer.info.render.triangles,
      renderCalls: this.renderer.info.render.calls,
      memory: snapshotMemory(this.renderer),
      toneMapping: this.renderer.toneMapping,
      exposure: this.renderer.toneMappingExposure,
      padding: this.padding,
      immersive: this.immersive,
      animations: this.animations.map(a => a.name),
      wireframe: !!this.wireframeOn,
      postActive: this.post.active,
    };
  }

  describe() {
    return {
      tri: formatNumber(this.stats?.tris ?? 0),
      vert: formatNumber(this.stats?.verts ?? 0),
      mesh: this.stats?.meshes ?? 0,
    };
  }
}
