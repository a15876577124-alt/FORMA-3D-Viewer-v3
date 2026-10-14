# 已知问题与未验证项

按用户要求如实记录：**凡未通过实际测试的功能，都在这里写明，不虚报完成。**

## 未验证（代码路径存在，但没有真实样本实证）

### 1. FBX 骨骼动画

- **状态**：未实测。
- **原因**：开发环境没有 Blender / Maya / 3ds Max，沙箱禁外网，拿不到一个真实带骨骼动画的 FBX 样例。
- **已验证的部分**：FBX 加载链路本身用一份自产的 ASCII FBX（12 三角形静态立方体，`tools/make-fbx-sample.mjs` 生成）实测通过——解析、挂载、上屏、错误路径提示都正常；`FBXLoader` 来自本地化 vendor，其骨骼动画分支未做任何改动。
- **未验证的部分**：真实带骨骼动画的 FBX（Skin/Cluster/Take 节点）能否正确解析、动画能否播放、蒙皮网格的法线与包围盒归一化是否正确。
- **复测方法**：拿到 FBX 后拖入页面，或 `node tools/test-import.mjs`（需先把样例替换为真实文件）。

### 2. `.gltf`（非二进制 glTF）的外部 `.bin` 依赖

- **状态**：链路已搭好，未用真实的「.gltf + .bin + 贴图」三件套实测过。
- **已验证**：`.gltf` 走 `loadGLTF`，`buildBlobMap` 把伴随的 `.bin`/贴图按文件名映射给 LoadingManager；本项目自有 GLB（同解析器）5/5 通过。
- **未验证**：外部引用路径（`buffers[0].uri` 指向 `*.bin`）在 blob 映射下的真实解析。
- **复测方法**：任取一个导出的 `.gltf + .bin + textures` 目录，对话框多选全部文件导入。

### 3. 真机移动端

- **状态**：未在真实手机上验证。
- **已做**：移动端判定（窄屏 / 粗指针）、单列布局 + 作品下拉、dpr 封顶 1.5、阴影 1024、关闭后期、LRU 缓存降到 2——这些都有自动化断言（桌面模拟窄屏 + 触点）。控制台无错误。
- **未验证**：真实 iOS Safari / Android Chrome 的 WebGL 行为、内存压力下的回收、触控手势手感、性能帧率。

### 4. GitHub Pages 在线部署

- **状态**：未执行。等待账号授权，见文末。

## 已修复的真实缺陷（留档）

修复过程中用 A/B 对照实验实锤的问题，详细数据见 [docs/normals-study.md](docs/normals-study.md)：

| # | 缺陷 | 实锤方式 | 修复 |
|---|---|---|---|
| 1 | 源 GLB 缺 NORMAL → glTF 规范默认 flat shading，绒球等曲面棱面化 | 同机位像素对照，白绒球棱面肉眼可见 | 离线预烘焙焊接法线，追加式写回 GLB |
| 2 | 源 GLB 缺 metallicFactor → glTF 缺省 1.0，暗哑金属 | 主体覆盖占比提升 15–37% | 写明 `metallicFactor = 0` |
| 3 | 运行时补完法线后未清 `flatShading` 标记，逐面着色残留 | 对照页 `flat=true/false` 实测 | `clearFlatShading()` 在两处补法线后调用 |
| 4 | `.fatal` / `#helpModal` 带 `hidden` 却仍拦截全屏点击 | 交互测试 13/26 → 24/26 | `styles.css` 补 `[hidden]{display:none!important}` |
| 5 | `import.meta.url` 的百分号编码导致工具写错目录 | 中文路径下 `test-out` 跑到旧工程 | 全部工具改用 `fileURLToPath` |
| 6 | three r186 移除 `PCFSoftShadowMap`、废弃 `Clock` | 启动报错 | VSM 阴影（保留 `?shadow=pcf` 回退）+ `Timer` |

## 当前测试基线

| 测试 | 结果 |
|---|---|
| 渲染（headless SwiftShader） | 5/5 展品，56/56 断言，显存零增长，控制台 0 错误 |
| 渲染（真实 GPU，有头浏览器） | 5/5，56/56，控制台 0 错误 |
| 交互 | 26/26 |
| 导入 | 10/10（2 条控制台 4xx/解析报错属预期） |
| GLB 资产校验 | 200/200 切片哈希一致 |

## 说明：为什么不引入硬边阈值

任务书要求「保留合理硬边」。做了 180°→30° 六档扫描（见 docs/normals-study.md §三），**极限放大下没有任何可感知差异**——因为这批网格的硬边本来就是几何级的（UV 岛边界处顶点已拆分）。因此交付版本采用 180° 纯面积加权平滑：这是最不会引入棱面伪影的选择，硬边由几何本身保证。此为实证结论，不是简化处理。

## 交付时需要用户授权的操作（尚未执行）

- 创建 GitHub 仓库并推送（**含 `assets/` 下全部模型、贴图与 `vendor/`，不只是源码**）
- 开启 GitHub Pages 在线演示
- 以上都需要账号登录或 Personal Access Token，**不会自行处理任何凭据**
