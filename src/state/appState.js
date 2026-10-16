// 应用级状态（工作模式 + 资产库 + 最近运行）。
// 独立 localStorage key，与 viewState（per-exhibit）分离——绝不 bump viewState 的 SCHEMA。
import { getJSON, setJSON } from '../utils/storage.js';

const KEY = 'forma3d.v4.app';
const SCHEMA = 1;
const DEFAULT_STATE = { schema: SCHEMA, mode: 'gallery', library: [], recentRuns: [] };

export class AppState {
  constructor() {
    this.state = this._load();
  }

  _load() {
    const saved = getJSON(KEY);
    if (saved && saved.schema === SCHEMA && saved.mode && Array.isArray(saved.library)) {
      return { ...DEFAULT_STATE, ...saved };
    }
    return { ...DEFAULT_STATE };
  }

  _persist() {
    setJSON(KEY, this.state);
  }

  get() { return this.state; }

  getMode() { return this.state.mode === 'pipeline' ? 'pipeline' : 'gallery'; }

  setMode(mode) {
    this.state.mode = mode === 'pipeline' ? 'pipeline' : 'gallery';
    this._persist();
    return this.state.mode;
  }

  addLibraryEntry(entry) {
    const existing = this.state.library.find((e) => e.id === entry.id);
    if (existing) {
      Object.assign(existing, entry);
    } else {
      this.state.library.push({ addedAt: Date.now(), ...entry });
    }
    this._persist();
    return entry;
  }

  removeLibraryEntry(id) {
    this.state.library = this.state.library.filter((e) => e.id !== id);
    this._persist();
  }

  addRecentRun(runId) {
    this.state.recentRuns = [runId, ...this.state.recentRuns.filter((r) => r !== runId)].slice(0, 20);
    this._persist();
  }
}
