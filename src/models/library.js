// 资产库（本地发布产物）：把 appState.library 的条目转为与 FIGURINES 同构的 catalog entry，
// 使它们能走既有 loadGLTF / select() 链路在展厅中渲染。
// 硬事实：只承载用户真实发布的版本（url/verts/tris 来自后端发布结果），不虚构。

export function libraryEntryToCatalog(item) {
  return {
    id: 'lib:' + item.id,
    group: 'library',
    file: item.url,
    thumb: null,
    name: item.name || item.id,
    sub: 'LIBRARY · v' + (item.version ?? 1),
    glyph: '★',
    tone: 't-sheng',
    kind: 'gltf',
    verts: item.verts ?? null,
    tris: item.tris ?? null,
    best: { yaw: 1.62, pitch: 0.16, distMul: 1.0, targetYMul: 0.5 },
    library: true,
    sourceId: item.sourceId || null,
    assetId: item.sourceId || null,
    version: item.version ?? 1,
  };
}

export function buildLibraryEntries(libraryState) {
  return (libraryState || []).map(libraryEntryToCatalog);
}
