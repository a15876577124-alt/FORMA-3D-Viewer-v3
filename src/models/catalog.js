// Exhibit catalogue.
//
// Only hard facts are stated here: role names taken from the source folder names,
// file paths, and geometry statistics measured straight out of the GLBs.
// No invented design story, no invented cultural background, no invented results.
//
// Source of truth for the figurines:
//   D:\Qiong Opera Reimagined\...\3D模型v5_OBJ\0X_XXX\{*.obj, material.mtl, tripo_material_<uuid>.png}
// converted to GLB by trimesh, then repaired by tools/fix-glb.mjs.

export const FIGURINES = [
  {
    id: 'sheng',
    group: 'figurines',
    file: './assets/exhibition-v1/sheng.glb',
    thumb: './assets/exhibition/sheng-thumb.webp',
    poster: './assets/exhibition/sheng.webp',
    name: '生角',
    sub: 'SHENG',
    glyph: '生',
    tone: 't-sheng',
    kind: 'gltf',
    verts: 26951,
    tris: 47512,
    source: '01_生角 / 01_生角.obj',
    best: { yaw: 1.62, pitch: 0.16, distMul: 1.0, targetYMul: 0.5 },
  },
  {
    id: 'dan',
    group: 'figurines',
    file: './assets/exhibition-v1/dan.glb',
    thumb: './assets/exhibition/dan-thumb.webp',
    poster: './assets/exhibition/dan.webp',
    name: '旦角 · 完整头饰',
    sub: 'DAN · FULL HEADDRESS',
    glyph: '旦',
    tone: 't-dan',
    kind: 'gltf',
    verts: 28662,
    tris: 46828,
    source: '02_旦角_完整头饰 / 02_旦角_完整头饰.obj',
    best: { yaw: 1.72, pitch: 0.15, distMul: 1.0, targetYMul: 0.5 },
  },
  {
    id: 'jing-red',
    group: 'figurines',
    file: './assets/exhibition-v1/jing-red.glb',
    thumb: './assets/exhibition/jing-red-thumb.webp',
    poster: './assets/exhibition/jing-red.webp',
    name: '净角 · 红谱',
    sub: 'JING · RED',
    glyph: '净',
    tone: 't-jing-red',
    kind: 'gltf',
    verts: 28472,
    tris: 49178,
    source: '03_净角红谱 / 03_净角红谱.obj',
    best: { yaw: 1.62, pitch: 0.16, distMul: 1.0, targetYMul: 0.5 },
  },
  {
    id: 'jing-yellow',
    group: 'figurines',
    file: './assets/exhibition-v1/jing-yellow.glb',
    thumb: './assets/exhibition/jing-yellow-thumb.webp',
    poster: './assets/exhibition/jing-yellow.webp',
    name: '净角 · 黄谱',
    sub: 'JING · YELLOW',
    glyph: '净',
    tone: 't-jing-yellow',
    kind: 'gltf',
    verts: 27361,
    tris: 47852,
    source: '04_净角黄谱 / 04_净角黄谱.obj',
    best: { yaw: 1.48, pitch: 0.16, distMul: 1.0, targetYMul: 0.5 },
  },
  {
    id: 'jing-white',
    group: 'figurines',
    file: './assets/exhibition-v1/jing-white.glb',
    thumb: './assets/exhibition/jing-white-thumb.webp',
    poster: './assets/exhibition/jing-white.webp',
    name: '净角 · 白谱',
    sub: 'JING · WHITE',
    glyph: '净',
    tone: 't-jing-white',
    kind: 'gltf',
    verts: 26720,
    tris: 46939,
    source: '05_净角白谱 / 05_净角白谱.obj',
    best: { yaw: 1.45, pitch: 0.16, distMul: 1.0, targetYMul: 0.5 },
  },
];

// Procedural geometry demos. Generated live from three.js primitives; these exist
// so the material / lighting / post-processing pipeline can be shown on something
// with broad specular range. They are explicitly NOT presented as modelling work.
export const DEMOS = [
  {
    id: 'aether',
    group: 'demos',
    procedural: 'aether',
    name: 'Aether Core',
    sub: 'PROCEDURAL',
    glyph: 'A',
    tone: 't-sheng',
    kind: 'procedural',
    note: 'Three.js primitives',
    best: { yaw: 0.5, pitch: 0.3, distMul: 1.0, targetYMul: 0.5 },
    defaultPost: { bloom: true, threshold: 0.85, strength: 0.32, radius: 0.5 },
    defaultMaterial: { mode: 'metal' },
  },
  {
    id: 'flux',
    group: 'demos',
    procedural: 'flux',
    name: 'Flux Sculpture',
    sub: 'PROCEDURAL',
    glyph: 'F',
    tone: 't-dan',
    kind: 'procedural',
    note: 'Three.js primitives',
    best: { yaw: 0.7, pitch: 0.24, distMul: 1.0, targetYMul: 0.5 },
    defaultPost: { bloom: true, threshold: 0.9, strength: 0.2, radius: 0.4 },
    defaultMaterial: { mode: 'ceramic' },
  },
  {
    id: 'prism',
    group: 'demos',
    procedural: 'prism',
    name: 'Prism Array',
    sub: 'PROCEDURAL',
    glyph: 'P',
    tone: 't-jing-white',
    kind: 'procedural',
    note: 'Three.js primitives',
    best: { yaw: 0.4, pitch: 0.26, distMul: 1.0, targetYMul: 0.5 },
    defaultPost: { bloom: true, threshold: 0.88, strength: 0.26, radius: 0.45 },
    defaultMaterial: { mode: 'metal' },
  },
];

export const CATALOG = [...FIGURINES, ...DEMOS];
export const BY_ID = new Map(CATALOG.map(c => [c.id, c]));

export const GROUP_LABEL = { figurines: '琼剧数字手办系列', demos: '程序化几何演示' };

export function indexOf(id) { return CATALOG.findIndex(c => c.id === id); }
export function figurineOrdinal(id) {
  const i = FIGURINES.findIndex(f => f.id === id);
  return i < 0 ? null : { index: i, total: FIGURINES.length };
}
