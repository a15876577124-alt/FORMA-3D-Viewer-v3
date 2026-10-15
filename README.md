# FORMA 3D — 琼剧数字手办展厅（V3）

一个纯前端的实时三维展示器，用于陈列五件琼剧角色数字手办（生角、旦角·完整头饰、净角·红谱 / 黄谱 / 白谱），支持专业影棚布光、材质与后期调整、多格式模型导入、逐展品参数持久化、沉浸模式与截图导出。

渲染内核为 **three.js r186**，全部依赖已本地化到 `vendor/`，**完全离线可用**——不需要 CDN，不需要联网，只需要一个静态文件服务器（浏览器对 ES Module 的 `file://` 限制，这是唯一的前置条件）。

---

## 快速开始

```bash
node serve.mjs          # 零依赖静态服务器，默认 http://127.0.0.1:5173
```

然后用浏览器打开 <http://127.0.0.1:5173>。（任何静态服务器都可以，例如 `python -m http.server`。）

## 展品

**第一组 · 琼剧数字手办（原创作品）**

| 展品 | 网格 | 来源文件 |
|---|---|---|
| 生角 SHENG | 26,951 顶点 / 47,512 三角面 | `01_生角 / 01_生角.obj` |
| 旦角·完整头饰 DAN | 28,662 / 46,828 | `02_旦角_完整头饰 / …obj` |
| 净角·红谱 JING·RED | 28,472 / 49,178 | `03_净角红谱 / …obj` |
| 净角·黄谱 JING·YELLOW | 27,361 / 47,852 | `04_净角黄谱 / …obj` |
| 净角·白谱 JING·WHITE | 26,720 / 46,939 | `05_净角白谱 / …obj` |

**第二组 · Technical Demos（程序化几何演示，非建模作品）**：Aether Core / Flux Sculpture / Prism Array —— 用 three.js 内置几何体拼出来的渲染能力演示，默认折叠，不与手办混排。

## 功能

**展示**：左侧分组列表、平滑切换、拖拽/滚轮/触控旋转缩放、自动旋转（速度可调）、一键回最佳视角、键盘 `←/→` 切换 / `Space` 自动旋转 / `R` 重置视角 / `I` 沉浸 / `F` 全屏；操作说明由右上角帮助按钮打开。

**渲染**：三点影棚布光（主/补/轮廓，四套预设）+ 离线 IBL（PMREM + RoomEnvironment，无 HDRI 文件）+ VSM 接触阴影 + 径向 AO 贴片；可调曝光、环境强度、FOV、色调映射（Neutral / ACES / 关闭）、辉光后期三档。

**材质**：原始 / 陶瓷 / 亚光 / 金属 / 自定义（金属度、粗糙度、清漆实时可调）。默认档**完全不动**模型自带材质——面板上看到的数值就是资产本身的数值，不撒谎。

**显示**：展台、地面网格、线框叠加层、四种背景。

**沉浸模式**：一键隐藏左右面板，模型居中放大，`Esc` 或按钮返回工作台。

**截图**：经应用自身渲染管线导出 PNG（最高 4× 分辨率，受 `MAX_TEXTURE_SIZE` 限制）。

**导入**：GLB / glTF（含 .bin 与贴图）、OBJ+MTL+PNG/JPG、FBX。拖放与文件对话框等价；不支持或缺失依赖时给出明确的中文提示，绝不静默失败，也绝不弄脏当前舞台。

**持久化**：每个展品的灯光、材质、背景、后期、视角、FOV 独立保存（localStorage，schema 3），切换或刷新后原样恢复。

**性能**：像素比封顶（桌面 2 / 移动 1.5）、LRU 模型缓存（移动 2 / 桌面 5）、切换时完整释放 GPU 资源（含线框叠加层这类场景图兄弟节点）、移动端降阴影分辨率与关闭后期。

## 资产管线

源 OBJ→GLB 转换件有两个真实缺陷，全部实证并修复（详见 [docs/normals-study.md](docs/normals-study.md)）：

1. **缺 NORMAL** → glTF 规范默认逐面着色，曲面棱面化。修复：按量化位置虚拟焊接 + 面积加权平均法线，**追加式**写回 GLB（原 POSITION/UV/贴图逐字节不动，`verify-glb.mjs` 用切片哈希证明 200/200 通过）。
2. **缺 metallicFactor** → glTF 缺省值 1.0，手办被渲染成暗哑金属。修复：写明 `metallicFactor = 0`。

原始 GLB 保留在 `assets/raw/`，可追溯。

```bash
node tools/extract-glb.mjs      # 从 V2 源码提取原始 GLB → assets/raw/
node tools/fix-glb.mjs          # 修复 → assets/models/（verify 200/200）
node tools/verify-glb.mjs       # 切片级校验，证明无损
node tools/make-thumbs.mjs      # 用渲染器自身生成缩略图
```

## 测试

统一入口会自动启动独立本地服务器，使用系统分配的空闲端口，顺序执行依赖、资产、HTTP、真实渲染、交互、导入和扩展检查，并在结束时停止服务器：

```bash
npm test                         # 完整回归，无需手动启动服务器
npm test -- --only=server         # HTTP 与模型 Range 请求
npm test -- --only=extended       # 外部 glTF、Maya 蒙皮动画、拖动与移动取景
npm run test:gpu                  # 使用有头浏览器查看测试
npm run shots                     # 导出五个展品的实际渲染图
```

浏览器测试保持 Chromium 沙盒启用，使用默认图形后端；本机 headless Edge 已实测使用 RTX 4060。可用 `FORMA_BROWSER` 指定已安装的 Edge/Chrome。缺少浏览器或 WebGL2 时明确失败，不自动安装浏览器或降低安全设置。

以下原有测试脚本也可在手动启动服务后单独运行（读取真实 WebGL 帧缓冲像素）：

```bash
node tools/test-render.mjs      # 五展品渲染 + 显存泄漏 + 控制台错误   5/5，56/56 断言
node tools/test-ui.mjs          # 交互全量回归                        26/26
node tools/test-import.mjs      # 导入链路                            12/12
node tools/test-ab.mjs --study=normals    # 法线修复前后对照实验
node tools/test-ab.mjs --study=hardedge   # 硬边阈值扫描实验
```

`--headed` 可让渲染测试显示浏览器窗口。headless 是否使用硬件取决于系统能力，报告记录实际 renderer，不预设为 SwiftShader。测试报告落在 `test-out/suite-<时间戳>/`；可以用 `FORMA_TEST_OUTPUT_DIR` 指定输出位置。扩展测试另外保存桌面、移动端和模型渲染截图。

## 目录

```
assets/raw/        原始 GLB（从 V2 提取，只读）
assets/models/     修复后 GLB（运行时加载的版本）
assets/thumbs/     渲染器自产缩略图
docs/              法线修复研究、对照图与数据
src/core/          渲染中枢、能力探测
src/lighting/      影棚灯光、离线 IBL
src/loaders/       GLTF/OBJ/FBX 导入、法线修复、错误文案
src/models/        展品目录、归一化取景、程序化几何
src/post/          后期合成器
src/stage/         地面接触阴影 / 展台 / 网格
src/state/         逐展品参数持久化
src/ui/            侧栏 / 检查器 / 顶栏
src/utils/         dispose、DOM、storage
tests/             tests/run.mjs 统一入口 + 扩展测试 + A/B 对照页
test-assets/       导入测试用的真实样例（glTF 拆包 / FBX 蒙皮动画）
tools/             资产管线与浏览器自动化测试
vendor/            本地化的 three.js r186（完全离线）
```

## 已知未验证项

见 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)。已使用本机 Maya 2025 导出的三关节蒙皮 FBX 实测动画播放、暂停与继续；也已实测 `.gltf + .bin + PNG` 外部依赖导入。复杂生产 FBX、真实手机及远程部署仍需对应场景验证。

## 许可与署名

五件琼剧手办为本项目提供的原创资产。Technical Demos 为 three.js 内置几何体拼装，仅作渲染能力演示，不应被视为建模作品。
