// Right-hand parameter panel.
//
// Contract: every control shows the value that is ACTUALLY in effect. Nothing is
// cosmetic. V2 displayed metalness 0.05 while the renderer used 1.0 (the glTF
// default when metallicFactor is absent); the fix in the assets plus the baseline
// snapshot in materials/override.js means "effective" is now literally what the
// material holds, so we can read it straight back after applying.
import { el, $, bindRange, bindCheck, setSegActive, onSeg, toast } from '../utils/dom.js';
import { MATERIAL_PRESETS } from '../materials/override.js';

const MAT_LABEL = { original: '原始贴图', ceramic: '陶瓷', matte: '哑光', metal: '金属', custom: '自定义' };

const hex2 = (v) => (v >= 0 ? v.toFixed(2) : '0.00');
const deg = (v) => Math.round(v) + '°';

/**
 * @param {{viewer, viewState, getEntry: () => object, onView: (state) => void}} ctx
 */
export function buildInspector(ctx) {
  const { viewer, viewState, getEntry } = ctx;
  const st = () => viewState.get(getEntry());
  const save = () => viewState.touch();
  const ui = {};

  // ------------------------------------------------------------- material --
  // A "custom" chip only appears once the user has actually moved a slider, so
  // the four authored presets stay the primary vocabulary.
  let customChip = null;
  function ensureCustomChip() {
    if (customChip) return customChip;
    customChip = el('button', { type: 'button', 'data-mode': 'custom' }, '自定义');
    $('materialModes').append(customChip);
    return customChip;
  }

  function toCustom() {
    const s = st();
    if (s.material.mode === 'custom') return;
    ensureCustomChip();
    s.material.mode = 'custom';
  }

  function applyMaterial() {
    const s = st();
    const res = viewer.applyMaterial(s.material) || {};
    const eff = res.effective || viewer.readMaterial() || {};
    if (typeof eff.metalness === 'number') ui.metalness?.set(eff.metalness);
    if (typeof eff.roughness === 'number') ui.roughness?.set(eff.roughness);
    if (typeof eff.envMapIntensity === 'number') ui.envIntensity?.set(eff.envMapIntensity);
    if (eff.color) { ui.color.input.value = eff.color; $('colorValue').textContent = eff.color.toUpperCase(); }
    if (customChip) customChip.style.display = s.material.mode === 'custom' ? '' : 'none';
    setSegActive($('materialModes'), s.material.mode);
    $('matTag').textContent = MAT_LABEL[s.material.mode] || s.material.mode;
    const hint = $('materialHint');
    hint.textContent = s.material.mode === 'original'
      ? '当前显示的是模型原始贴图与原始材质参数，未做任何接管。'
      : '已按预设接管材质：原贴图仍保留，光洁度与金属感被覆盖。';
    hint.classList.toggle('on', s.material.mode !== 'original');
  }

  onSeg($('materialModes'), (mode) => {
    const s = st();
    s.material.mode = mode;
    const p = MATERIAL_PRESETS[mode];
    if (p) {
      // Seed the sliders with the preset's true numbers so they stay honest.
      s.material.metalness = p.metalness;
      s.material.roughness = p.roughness;
      s.material.envIntensity = p.envMapIntensity;
    }
    save();
    applyMaterial();
    applyLight();
  });

  ui.metalness = bindRange('metalness', 'metalnessValue', (v) => {
    toCustom(); st().material.metalness = v; save(); applyMaterial();
  }, hex2);
  ui.roughness = bindRange('roughness', 'roughnessValue', (v) => {
    toCustom(); st().material.roughness = v; save(); applyMaterial();
  }, hex2);
  ui.envIntensity = bindRange('envIntensity', 'envIntensityValue', (v) => {
    toCustom(); st().material.envIntensity = v; save(); applyMaterial(); applyLight();
  }, hex2);

  ui.color = { input: $('colorPicker'), set(v) { this.input.value = v; } };
  $('colorPicker').addEventListener('input', (e) => {
    toCustom();
    const s = st();
    s.material.color = e.target.value;
    $('colorValue').textContent = e.target.value.toUpperCase();
    save(); applyMaterial();
  });

  // ---------------------------------------------------------------- light --
  function applyLight() {
    const s = st();
    viewer.applyLighting({ ...s.light, __envIntensity: s.material.envIntensity });
  }

  onSeg($('lightModes'), (mode) => {
    const s = st();
    const p = viewer.setLightMode(mode) || {};
    s.light.mode = mode;
    if (p.key) {
      s.light.key = p.key.intensity;
      s.light.fill = p.fill.intensity;
      s.light.rim = p.rim.intensity;
      s.light.hemi = p.hemi;
    }
    save();
    syncLight(s);
    applyLight();
  });

  function syncLight(s) {
    ui.key?.set(s.light.key);
    ui.fill?.set(s.light.fill);
    ui.rim?.set(s.light.rim);
    ui.shadowOpacity?.set(s.light.shadowOpacity);
    ui.contactAO?.set(s.light.contactAO);
    ui.shadow?.set(s.light.shadow);
    setSegActive($('lightModes'), s.light.mode);
    $('lightTag').textContent = { studio: '影棚', cool: '冷调', warm: '暖调', dramatic: '戏剧' }[s.light.mode] || s.light.mode;
  }

  ui.key = bindRange('lightKey', 'lightKeyValue', (v) => { st().light.key = v; save(); applyLight(); }, hex2);
  ui.fill = bindRange('lightFill', 'lightFillValue', (v) => { st().light.fill = v; save(); applyLight(); }, hex2);
  ui.rim = bindRange('lightRim', 'lightRimValue', (v) => { st().light.rim = v; save(); applyLight(); }, hex2);
  ui.shadowOpacity = bindRange('shadowOpacity', 'shadowOpacityValue', (v) => { st().light.shadowOpacity = v; save(); applyLight(); }, hex2);
  ui.contactAO = bindRange('contactAO', 'contactAOValue', (v) => { st().light.contactAO = v; save(); applyLight(); }, hex2);
  ui.shadow = bindCheck('shadowToggle', (v) => { st().light.shadow = v; save(); applyLight(); });

  // ------------------------------------------------------- camera + env ----
  onSeg($('envModes'), (mode) => {
    st().env.background = mode;
    viewer.setBackground(mode);
    save();
    setSegActive($('envModes'), mode);
  });

  ui.exposure = bindRange('exposure', 'exposureValue', (v) => { st().env.exposure = v; viewer.setExposure(v); save(); }, hex2);
  ui.fov = bindRange('fov', 'fovValue', (v) => { st().camera.fov = v; viewer.setFov(v); save(); }, deg);

  $('toneMapping').addEventListener('change', (e) => {
    st().env.toneMapping = e.target.value;
    viewer.setToneMapping(e.target.value);
    save();
  });

  // ----------------------------------------------------------------- post --
  function applyPost() {
    const s = st();
    viewer.setPost(s.post);
    ui.bloom?.set(s.post.bloom);
    $('postTag').textContent = s.post.bloom ? `辉光 ${(s.post.strength ?? 0).toFixed(2)}` : '关闭';
  }

  ui.bloom = bindCheck('bloomToggle', (v) => { st().post.bloom = v; save(); applyPost(); });
  ui.threshold = bindRange('bloomThreshold', 'bloomThresholdValue', (v) => { st().post.threshold = v; save(); applyPost(); }, hex2);
  ui.strength = bindRange('bloomStrength', 'bloomStrengthValue', (v) => { st().post.strength = v; save(); applyPost(); }, hex2);
  ui.radius = bindRange('bloomRadius', 'bloomRadiusValue', (v) => { st().post.radius = v; save(); applyPost(); }, hex2);

  // --------------------------------------------------------------- display --
  function applyView() {
    const s = st();
    viewer.setWireframe(s.view.wireframe);
    viewer.setGrid(s.view.grid);
    viewer.setPlinth(s.view.plinth);
    viewer.setShadowCatcher(s.view.shadowCatcher);
    viewer.setAutoRotate(s.view.autoRotate);
    viewer.setAutoRotateSpeed(s.view.autoRotateSpeed);
    ui.wire?.set(s.view.wireframe);
    ui.grid?.set(s.view.grid);
    ui.plinth?.set(s.view.plinth);
    ui.catcher?.set(s.view.shadowCatcher);
    ui.autoRotate?.set(s.view.autoRotate);
    ui.speed?.set(s.view.autoRotateSpeed);
    ctx.onView?.(s);
  }

  ui.wire = bindCheck('wireframe', (v) => { st().view.wireframe = v; save(); applyView(); });
  ui.grid = bindCheck('gridToggle', (v) => { st().view.grid = v; save(); applyView(); });
  ui.plinth = bindCheck('plinthToggle', (v) => { st().view.plinth = v; save(); applyView(); });
  ui.catcher = bindCheck('shadowCatcherToggle', (v) => { st().view.shadowCatcher = v; save(); applyView(); });
  ui.autoRotate = bindCheck('autorotate', (v) => { st().view.autoRotate = v; save(); applyView(); });
  ui.speed = bindRange('autoRotateSpeed', 'autoRotateSpeedValue', (v) => { st().view.autoRotateSpeed = v; save(); applyView(); }, hex2);

  // ------------------------------------------------------------ animations --
  function setAnimations(list, activeIndex = 0) {
    const panel = $('animationPanel');
    panel.textContent = '';
    if (!list || !list.length) {
      panel.className = 'anim-empty';
      panel.textContent = '当前模型无动画。';
      return;
    }
    panel.className = 'anim-clip-wrap';
    for (let i = 0; i < list.length; i++) {
      const name = list[i].name || `Clip ${i + 1}`;
      const b = el('button', { type: 'button', class: i === activeIndex ? 'on' : '' }, name);
      b.addEventListener('click', () => {
        const idx = viewer.playClip(i);
        [...panel.children].forEach((c, n) => c.classList.toggle('on', n === i));
        toast(`播放动画剪辑：${name}（${typeof idx === 'string' ? idx : ''}）`.replace('（）', ''), 'ok', 2600);
      });
      panel.append(b);
    }
    if (list.length > 0) {
      const pause = el('button', { type: 'button' }, '暂停 / 继续');
      pause.addEventListener('click', () => {
        const playing = viewer.toggleAnimation();
        toast(playing ? '动画继续播放' : '动画已暂停', 'ok', 1800);
      });
      panel.append(pause);
    }
  }

  // --------------------------------------------------------------- reset ----
  $('resetAll').addEventListener('click', () => {
    const entry = getEntry();
    const s = viewState.reset(entry.id);
    sync(s);
    toast(`已恢复「${entry.name}」的默认展示参数`, 'ok');
  });

  // ------------------------------------------------------------ full sync --
  /** Push a whole state object into every control and every renderer call. */
  function sync(s = st()) {
    viewer.setToneMapping(s.env.toneMapping);
    viewer.setExposure(s.env.exposure);
    viewer.setBackground(s.env.background);
    viewer.setFov(s.camera.fov);
    $('toneMapping').value = s.env.toneMapping;
    ui.exposure?.set(s.env.exposure);
    ui.fov?.set(s.camera.fov);
    setSegActive($('envModes'), s.env.background);

    viewer.setLightMode(s.light.mode);
    syncLight(s);
    applyLight();

    applyMaterial();

    ui.threshold?.set(s.post.threshold);
    ui.strength?.set(s.post.strength);
    ui.radius?.set(s.post.radius);
    applyPost();

    applyView();
  }

  return { sync, setAnimations, applyView, applyMaterial, applyLight, applyPost, toCustom };
}
