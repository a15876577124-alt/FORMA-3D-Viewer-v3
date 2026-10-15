// Localised, actionable error messages. Every failure tells the user what to do
// next instead of dumping a raw stack trace.

const RULES = [
  {
    test: /extensionsRequired|DRACO|draco|KHR_draco/i,
    msg: '这个模型使用了 Draco 压缩，本展示器没有内置该解码器。请在导出时取消 Draco 压缩（Blender glTF 导出面板 → Compression 关闭；gltf-transform 可用 `dedup` 代替），然后重新导出 GLB。',
  },
  {
    test: /KTX2|ktx2|KHR_texture_basisu/i,
    msg: '这个模型使用了 KTX2 / Basis Universal 压缩贴图，本展示器不支持。请在导出时把贴图格式改为 PNG 或 JPEG。',
  },
  {
    test: /Meshopt|meshopt|EXT_meshopt/i,
    msg: '这个模型使用了 Meshopt 压缩，本展示器不支持。请重新导出为未启用 EXT_meshopt_compression 的 GLB。',
  },
  {
    test: /sparse/i,
    msg: '这个模型含有 sparse accessor，本展示器无法读取。请在导出工具里关闭 sparse 数据优化后重试。',
  },
  {
    test: /unsupported.*componentType|componentType/,
    msg: '这个模型使用了不受支持的顶点数据类型。请改用 Float32 顶点坐标重新导出。',
  },
  {
    test: /能力的|too complex|超过.*上限|上限/,
    msg: '模型面数超出本展示器上限（约 50 万顶点）。请先用减面工具轻量化后再导入。',
  },
  {
    test: /not a valid|Unexpected token|magic|Invalid typed array|glTF version/i,
    msg: '文件损坏或不是有效的 glTF / GLB。请确认文件完整下载，且导出的是 glTF 2.0 格式。',
  },
  {
    test: /FBX|fbx/,
    msg: 'FBX 解析失败。本展示器支持常见静态网格与基础骨骼动画的 FBX；如果是极高版本、含复杂约束或特殊几何的 FBX，建议先转换为 GLB 再导入。',
  },
  {
    // Must run before the 404 rule: a dead server and a missing file look
    // similar in the console but need completely different advice.
    test: /Failed to fetch|NetworkError|ERR_CONNECTION|ERR_INTERNET/i,
    msg: '无法连接本地服务器——模型文件本身没有问题。请重新启动服务器：双击目录里的 启动展厅.bat，或在命令行运行 node serve.mjs 后刷新页面。',
  },
  {
    test: /Failed to fetch|NetworkError|404|Failed to load/i,
    msg: '文件读取失败。如果是通过 HTTP 打开的页面，请确认模型文件已经上传到同一目录（尤其是 .glb 旁边的 .mtl 与贴图）。',
  },
  {
    test: /no mesh|没有网格|no geometry/i,
    msg: '文件里没有可显示的网格。请确认导出时勾选了导出几何体。',
  },
  {
    test: /This browser doesn't|WebGL|webgl/i,
    msg: '当前浏览器不支持 WebGL 2。请使用较新版本的 Chrome、Edge、Firefox 或 Safari，并确认没有禁用硬件加速。',
  },
];

export function describeError(err, fallback = '模型载入失败。') {
  const raw = String(err && err.message ? err.message : err || '');
  const culprit = RULES.find(r => r.test.test(raw));
  return { detail: raw, message: culprit ? culprit.msg : (raw ? fallback + '\n\n' + raw : fallback) };
}

export const MESSAGES = {
  tooLarge: (size, limit) => `文件 ${(size / 1048576).toFixed(1)} MB 超过 ${(limit / 1048576).toFixed(0)} MB 上限，已跳过。`,
  noSupportedFile: '没有找到支持的模型文件。支持的格式：.glb / .gltf / .obj（可配合 .mtl 与贴图）/ .fbx。',
  objWithoutMtl: '未找到同名 .mtl 文件，已使用默认材质显示几何体。若需要贴图，请同时选择 .mtl 与图片文件。',
  objMissingTexture: (names) => `MTL 引用的贴图缺失：${names.join('、')}。请把这些图片一并选中再导入。`,
  multipleMain: '一次只能显示一个主模型文件，已使用第一个。其余贴图与 .mtl 文件会作为关联资源一并读取。',
  fbxNoAnimation: '该 FBX 不含动画剪辑。',
  fbxAnimation: (name) => `已加载 FBX 动画：${name}`,
  unsupportedExt: (ext) => `不支持的文件类型：${ext}。支持 .glb / .gltf / .obj / .mtl / .fbx / 贴图图片。`,
  loaded: (name) => `已载入 ${name}`,
  switched: (name) => `切换到 ${name}`,
  jsonGltf: '检测到 .gltf 文件，请把它依赖的 .bin 与贴图文件也一并选中。',
};
