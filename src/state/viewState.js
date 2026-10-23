// Per-exhibit view state: every exhibit keeps its own camera, lighting, material,
// post-processing and display settings, and gets them back when you switch to it.
//
// Stored under one localStorage key; migrating through SCHEMA bumps discards old
// data wholesale rather than half-applying it.
import { getJSON, setJSON } from '../utils/storage.js';
import { CATALOG, BY_ID } from '../models/catalog.js';

const KEY = 'forma3d.v3.views';
const SCHEMA = 3;
const DEBOUNCE_MS = 300;

export const DEFAULT_STATE = {
  camera: { yaw: 0.42, pitch: 0.2, distMul: 1.0, targetYMul: 0.5, fov: 38 },
  light: { mode: 'studio', key: 2.2, fill: 0.55, rim: 1.1, hemi: 0.25, shadowOpacity: 0.26, contactAO: 0.35, shadow: true },
  material: { mode: 'original', color: '#ffffff', metalness: 0, roughness: 0.9, envIntensity: 0.85 },
  env: { background: 'charcoal', exposure: 1.0, toneMapping: 'neutral' },
  post: { bloom: false, threshold: 0.92, strength: 0.22, radius: 0.4 },
  view: { wireframe: false, grid: true, plinth: true, shadowCatcher: true, autoRotate: false, autoRotateSpeed: 1 },
};

function deepDefault(overrides = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_STATE));
  for (const [k, v] of Object.entries(overrides || {})) out[k] = { ...out[k], ...v };
  return out;
}

// Presets declared by the catalogue entry (e.g. demos want bloom on by default).
function baseFor(entry) {
  const o = {};
  if(entry.group==='figurines'){o.env={background:'paper'};o.view={grid:false,plinth:false};}
  if (entry.defaultPost) o.post = entry.defaultPost;
  if (entry.defaultMaterial) o.material = entry.defaultMaterial;
  if (entry.best) o.camera = { yaw: entry.best.yaw, pitch: entry.best.pitch, distMul: entry.best.distMul, targetYMul: entry.best.targetYMul, fov: 38 };
  return deepDefault(o);
}

function migrate(entry, saved) {
  const base = deepDefault();
  if (!saved || typeof saved !== 'object') return baseFor(entry);
  for (const section of Object.keys(DEFAULT_STATE)) {
    if (saved[section] && typeof saved[section] === 'object') {
      Object.assign(base[section], saved[section]);
    }
  }
  return base;
}

export class ViewState {
  constructor() {
    const raw = getJSON(KEY, null);
    this.data = {};
    if (raw && raw.schema === SCHEMA && raw.views) {
      for (const c of CATALOG) this.data[c.id] = migrate(c, raw.views[c.id]);
    } else {
      for (const c of CATALOG) this.data[c.id] = baseFor(c);
    }
    if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
      for(const state of Object.values(this.data))state.view.autoRotate=false;
    }
    this._timer = null;
    this._dirty = false;
  }

  get(entry) {
    if (entry && !this.data[entry.id]) this.data[entry.id] = baseFor(entry);
    return entry ? this.data[entry.id] : null;
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._dirty) return;
    setJSON(KEY, { schema: SCHEMA, views: this.data });
    this._dirty = false;
  }

  touch() {
    this._dirty = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  reset(id) {
    this.data[id] = baseFor(BY_ID.get(id));
    this.touch();
    return this.data[id];
  }

  resetAll() { this.data = {}; for (const c of CATALOG) this.data[c.id] = baseFor(c); this.touch(); this.flush(); }
}
