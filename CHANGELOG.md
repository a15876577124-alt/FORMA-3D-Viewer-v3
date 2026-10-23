# CHANGELOG

All notable changes to FORMA are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/).

## [2026-10-23 Exhibition RC2] — 数字展陈改造

- 首页真实海报与五件目录、详情信息精简、全宽 Gallery / 设置与资源抽屉，Studio 深色操作区与窄屏触控布局。
- 联系方式收为共享页脚的单一展开项；品牌文字回退，批准的正式 Logo 文件暂不接入。
- 新 Exhibition v1 修复同位置 UV 接缝法线与旧 NORMAL 元数据；原始模型、POSITION、UV、材质、贴图和面数保持不变。
- 首页零 GLB 请求、移除独立 miniViewer 与重复环境预计算、按需 GPU 渲染、手机相机空间取景。
- Studio 离开时迟到响应不覆盖 Gallery；导入后清除旧目录高亮；隐藏视口不缩为 1×1。
- 全量 33/33 组；新增真实模型/展陈回归、三角度同条件采集、候选包哈希及实际解压包验收；限制见 docs/EXHIBITION-RC2.md。

## [2026-10-23 Quality RC] — Codex 第三阶段

- 独立开发 worktree；联系方式可读、mailto/复制与直接定位；共享品牌组件和后续 Logo 动画钩子，保留原标识。
- 首页模型取景、文字与入口分区、390px 可读性；详情页直接统计当前三维模型，移除同名工作区资产猜测及误报离线。
- Material Lab 局部撤销/重做、未保存状态、切换资产/版本/路由确认、真实纹理通道预览与版本标签；保真预设不再强制重写材质。
- Blender 2.93 FBX 基础色/透明度/粗糙度/金属度/自发光通道映射与逐像素验证；缺失/不支持/近似语义单独记录。
- WorkBuddy 保留默认；新增服务端 OpenAI-compatible 适配、合成连接测试、任务配置快照、错误分类和模型输入脱敏。
- Host/Origin 执行前校验、流式上传代理、大小/图像/几何预算、资源流式下载；复杂场景变换、stride、sparse 与 normalized 数据读取。
- Puppeteer Core 25.16.0 精确锁定，Node 开发要求 22.12+；实际 Edge/CDP 兼容测试与依赖审计。
- 增加独立工作区测试、33 张视觉证据和性能前后数据；发布包包含本地预览服务与第三方许可。全量 31/31、包验收 19/19、WorkBuddy 退出后的真实 Agent 7/7；完整结果见 docs/V5-QUALITY.md。

## [2026-10-23 Production workflow] — Codex 第二阶段

- 统一选中资产/版本/视口，修复乱序响应、发布条目身份和 Gallery 分享链接启动竞态。
- NodeIO GLB/GLTF 资源包转换、OBJ 材质/变换；加入 Khronos glTF Validator，保留真实渲染与重导入检查。
- Original/Edited/Repaired/Optimized/Converted 可追溯版本；材质保存、ZIP 下载、完整多文件发布。
- 许可明确的 Avocado 与内嵌贴图 FBX，浏览器实际转换、处理、后验、导出与重导入。
- Agent 真实工具调用结果串联、确认恢复、防重放、取消/超时、失败日志与 dryRun 保护。
- 390px 面板、工具文字、Lab 初始化、对比公共变换/相机裁剪、GPU 生命周期。
- 新增可复现验收组和真实 LLM 单独验收；详见 docs/V5-PRODUCTION-WORKFLOW.md 和 docs/audit/phase2-results.json。

## [2026-10-23 Audit] — Codex 安全接管

- 从交付 `eeb7b3231d329cd3a8b05a0a7d9648fd3e708177` 创建 `feature/codex-v5-audit`，保留既有 ARCHITECTURE 未提交格式改动。
- `1be3f46`：隔离测试、唯一测试资产、并发版本原子分配、Agent await/dryRun/错误回灌、路径安全、静态私有目录限制、安全打包、Windows 字节保护与真实 Edge UI 验收。
- `91f3ff0`：npm start 启动完整版，自定义端口代理、Node >=20.9.0、模型服务降级、报告解包、Agent 参数字段与对比分割端点。
- 原始 19/19 组、706 项报告检查独立复现；最终 22/22 组、735 项报告检查，9 项接管场景通过。release:verify 83 文件 / 30,100,215 字节。
- WorkBuddy SDK 实际安装与真实两轮工具调用成功，未替换服务或升级依赖。已记录未解决的 P1 工作流、安全、视觉问题。
- 更新 CODEX-HANDOFF、TASK_STATE、README、KNOWN-ISSUES、PIPELINE、安全说明；新增 CODEX-AUDIT 与可追溯 JSON 摘要。

## [Historical handoff] — V5.4 工程交接与静态发布（2026-10-22）

交接基线：`feature/forma-v5-experience`。本版不含新功能，只做「可交付、可接手、可复现发布」。

### Added

- `tools/static-release.mjs`：静态发布清单与打包。
  - 从 `index.html` + 动态注入的 `./src/main.js` 出发，递归解析 ES Module（含多行 import、
    动态 `import()`、`new URL(..., import.meta.url)`）与 CSS `@import`/`url()`，经 importmap
    解析裸说明符，再补上 catalog 里运行时加载的 `./assets/*.glb` 与缩略图。
  - **硬校验**：闭包里每个文件必须存在、必须被 `git` 跟踪、且不得落在
    `assets/library/`、`pipeline-out/`、`backend/`、`test-out/`、`assets/variants/`、`test-assets/`。
  - 产出 `docs/STATIC-MANIFEST.json`（83 文件 / 30,099,590 字节，含每个文件的 sha256 前 16 位）；
    `--pack=<dir>` 复制成可上传 Pages 的静态包，并写 `STATIC-BUILD.json` 标明后端不在包内。
- `tools/static-pack-test.mjs`（测试组 `release`，16 断言）：真打包 → 复制 `serve.mjs` →
  起服务器 → 真浏览器加载。验证五件手办在**纯静态包**里逐一加载成功（三角形数与 ground truth
  一致）、canvas 非 1×1、`#/studio` 如实显示「后端未运行」、零 404、零 pageerror。
- `docs/CODEX-HANDOFF.md`：A 基本信息 / B 架构 / C 运行 / D 已完成 / E 未完成与已知问题 /
  F 特殊技术注意事项 / G 下一阶段建议。
- npm scripts：`release:verify`、`release:pack`、`test:release`。

### Changed

- `.gitignore`：新增 `dist/`（`release:pack` 的产物是已跟踪文件的副本，入库只会重复约 29 MB）。
- `README.md`：改为 V5 视角——两种工作形态（Gallery / Studio）、一键启动两条路径、
  19 组测试基线、静态发布命令、目录表补齐 `src/studio` `src/pages` `styles/`。
- `TASK_STATE.md`：新增「V5.4 工程交接」当前状态与「发布边界（勿破）」。
- `KNOWN-ISSUES.md`：补 V5 阶段的已知限制与真实验证范围。
- `docs/ARCHITECTURE.md`：删掉对已删除文件 `src/ui/pipeline.js` 的引用，改指向 `src/studio/`
  与 `src/ui/gallery.js`，并链接交接文档。

### Verified

- 全量 `node tests/run.mjs`：**19/19 组全绿，约 706 条断言**（新增 `release` 组）。
- `tools/launch.mjs` 一键启动实测：后端 8899 + 前端 5277 + `/api` 反代 + `src/main.js` 全 200。
- 五个 GLB 内嵌 1 张贴图 + 1 个 buffer（无外部贴图依赖）；`assets/raw/` 五个 sha256 与
  `INDEX.json` 完全一致。
- 仓库无 `.env`、无已跟踪的密钥；`backend/publicConfig.json` 仅含设计上公开的 publishableKey。

## [Unreleased] — FORMA V5 Ultimate AI 3D Creation Platform (v5)

开发分支 `feature/forma-v5-experience`（基于 `feature/ai-asset-pipeline@0141480`）。
目标：国际数字艺术工作室级视觉 + 完整专业 AI 3D 创作平台。

### Added — M1 品牌视觉系统与页面架构（2026-10-20）

- `styles/tokens.css`：V5 设计系统（香槟金/暖象牙/琼剧红/玉石青色阶、serif 排版、
  间距与动效 scale、z 层、reduced-motion 适配）；纯增量 `--v5-*` 命名空间，
  不覆盖 V3 既有变量，零回归风险
- `styles/v5.css`：品牌外壳（topbar/nav/footer/自绘几何脸谱 logo）、按钮/卡片/
  徽标/指标卡组件、加载/骨架/空态/错误态/Toast、路由图层与响应式断点
- `src/core/router.js`：hash 路由。**常驻图层模式**——页面挂载后保留 DOM，
  切换只改 hidden，Three.js canvas 永不 detach（WebGL 上下文安全）；
  支持路径参数、LRU 缓存上限、unmount/enter 生命周期、旧锚点兼容重定向
- `src/ui/feedback.js`：v5Toast/v5Loading/v5Skeleton/v5State/v5AsyncBox 统一反馈组件
- `src/ui/shell.js`：V5 外壳（品牌标记、导航、页脚）；导航只列已实装路由
- `src/pages/home.js`：首页版式（hero serif 标题「琼剧/五相」、真实指标条、
  展品索引、能力入口）；所有数据来自真实工程，未实装功能不放入口
- `tools/shot.mjs`：**可复用视觉验收工具**——headless Edge(SwiftShader WebGL) +
  自动起服 + 桌面/移动/宽屏多视口截图 + 客观像素分析（luma/nonBg/直方图熵）+
  模型加载等待与全部页面错误捕获
- 首页深链接：`#/gallery?work=<id>` 直达展厅并选中展品（真实功能）

### Fixed — M1

- `src/main.js`：V3 `select()` 会把展品写入 URL hash（`#sheng`），与 V5 hash
  路由冲突导致路由被劫持——V5 模式下跳过该写入；并注册 `/:legacyId` 兼容
  旧分享链接重定向
- 首帧 `#app` 未入路由缓存时盖住首页——挂载后立即 hidden
- `src/materials/override.js`：模型切换瞬间 `collectMaterials` 对 null traverse
  抛 pageerror——防御性判空

### Verified — M1

- headless 真实渲染截图：首页（桌面 1440 / 移动 390）+ 展厅深链接
  `?work=jing-red` 正确选中净角·红谱（49,178 tris 与 ground truth 一致）
- pipeline / proxy 测试组通过，无回归

## [Unreleased] — AI Asset Pipeline (v4)

开发分支 `feature/ai-asset-pipeline`。目标：从 3D 展示器升级为
AI 3D 资产分析、修复、优化、转换、管理与发布平台。

### Added
- `TASK_STATE.md`：断点续作状态文件（里程碑 / 外部依赖 / 安全约束）
- `tools/llm-spike.mjs`：M0.5 LLM 连通性 spike（Node 独立进程调用云服务 LLM）
- `backend/publicConfig.json`：云服务公开配置（endpoint + publishableKey，设计上可入仓库）
- 依赖 `@tencent-ai/workbuddy-cloud-sdk@dev`：云服务 SDK（Database/Auth/Storage/LLM）
- **M1 后端与分析闭环**（`backend/`，仅监听 127.0.0.1）：
  - `server.mjs`：HTTP API（`/api/health` `/api/models` `/api/assets` import/analyze/report）
  - `analyze.mjs`：真实解析 GLB/GLTF/OBJ/FBX（网格/材质/贴图/动画/蒙皮/边界盒 + 诊断规则）
  - `validate.mjs`：上传魔数 + 扩展名 + 大小三重校验
  - `paths.mjs`：目录穿越防护
  - `llm.mjs`：云服务 LLM 客户端封装
  - `texture-sniff.mjs`：PNG/JPEG/WebP 真实尺寸解析
- `tests/pipeline.test.mjs`：pipeline 回归组（50 断言）
- **M2 AI Agent 工具链**（`backend/agent/`）：
  - 8 工具单一真源（tools.mjs）+ 分片累积（toolAccumulator.mjs）+ 流式封装（llmStream.mjs）
  - 主循环（agent.mjs）：native/prompt 双协议、多轮回灌、死循环检测、执行日志、rawChunkSample 证据
  - 离线回放（fakeLlm.mjs）+ `tools/llm-tools-spike.mjs`（阻断门）
  - server +4 Agent 路由（tools/run/runs）
  - `tests/agent.test.mjs`（36 断言，含反证与离线失败）
- 主力模型锁定 `deepseek-v4-pro`（`llm.mjs` DEFAULT_AGENT_MODEL，禁止 flash 自动降级）
- **M3 处理算子 + 后验**（`backend/ops/` + `backend/runPipeline.mjs` + `backend/verify.mjs` + `backend/policy.mjs` + `backend/gate.mjs`）：
  - 成熟库算子 weld/dedup/prune/simplify/quantize/join（gltf-transform + meshoptimizer）
  - sharp 自研 textureResize/textureCompress；自研 genNormals/fixMaterials/setSampler/textureReport/convert（glb↔gltf↔obj）
  - 确认门（HMAC token）+ 琼剧红线策略 + 后验（切片哈希/单调性/重解析）
  - `tools/op-demo.mjs` CLI + `tests/ops.test.mjs`（63 断言）
- 依赖：`@gltf-transform/*@4.5.1`、`meshoptimizer@1.3.0`、`sharp@0.35.5`（真实安装并验证可用）
- **M4 批量 + 资产库 + 加入展厅**：
  - `backend/batch.mjs`：批量级确认门 + 逐资产真实执行（5 手办 5/5）
  - `backend/library.mjs`：listLibrary / publishAsset（只复制）/ deleteLibraryFile（防穿越）/ listPublished
  - 前端 `src/state/appState.js`（独立 key）+ `src/models/library.js` + `src/ui/sidebar.js`（资产库组）
  - `src/main.js`：`resolveEntry` 加 libraryMap，`__FORMA.appState` / `__FORMA.library` 只追加
  - `tools/batch-demo.mjs` CLI + `tests/batch.test.mjs`（19 断言）
- **M5 Pipeline 工作模式 UI + 反向代理 + Before/After 对比**：
  - `serve.mjs`：`/api/*` 反代到 8787（透传 + 502 降级）
  - `src/net/api.js`：同源 API 客户端
  - `src/ui/pipeline.js`：Pipeline 面板（惰性连接、算子勾选、AI 分析、确认门、对比、发布）
  - `src/core/compare.js`：CompareRig（clippingPlanes 滑动对比）
  - `src/core/viewer.js` +`pin/unpin`；`src/main.js` 顶栏「管线」按钮 + `__FORMA.pipeline`
  - `tools/browser-test.mjs`：`FORMA_CDP_URL` attach 模式
  - `tests/proxy.test.mjs`（5 断言）+ `docs/demo/README.md`（CDP 指引）

### Changed
- `.gitignore`：追加 AI Pipeline 相关忽略项（`backend/workspace/`、`backend/.env`、`pipeline-out/`、`docs/demo/frames/`）
- `tests/run.mjs`：新增 `--only=pipeline` / `--only=agent` / `--only=ops` 测试组
- `package.json`：新增 `pipeline:serve` / `test:pipeline` / `test:agent` / `test:ops` / `agent:spike` / `op:demo` scripts；描述更新为 AI Asset Pipeline
- `tools/glbkit.mjs`：`readAccessor` 支持 interleaved bufferView（byteStride）
- `backend/analyze.mjs`：`analyzeFile` 传完整路径（gltf 外部资源正确解析）

### Changed
- `.gitignore`：追加 AI Pipeline 相关忽略项（`backend/workspace/`、`backend/.env`、`pipeline-out/`、`docs/demo/frames/`）

### Verified (M0.5 阻断门)
- Node 独立进程可持续调用 WorkBuddy 云服务 LLM：32 个可用模型（全部 supportsToolCall），连续流式调用成功

### Security
- API 密钥仅允许写入 `backend/.env`（已被 gitignore），禁止进入前端代码、日志与仓库

## [3.0.0] - 2026-10-15 — 琼剧五手办展示器（基线）

> 基线标签：`v3.0.0-baseline` @ `0b7c3d0`

### Added
- 多格式导入：GLB / GLTF / OBJ+MTL+PNG / FBX（three.js 0.186.1 本地 vendor）
- 离线 IBL + 三点光 + 接触阴影 + ACES 色调映射
- 三栏专业 UI：分组折叠资产列表 + 参数面板 + 响应式布局
- 交互：全屏 / 截图 / 线框 / 网格 / 沉浸模式 / 参数持久化（viewState SCHEMA 4）
- 后期处理三档可调；资源 dispose + 像素比自适应 + LRU 纹理缓存
- 回归测试 7/7 组（Puppeteer + RTX 4060 真实渲染，56 断言）
- 一键启动 `启动展厅.bat`；`file://` 协议黑屏改为全屏中文指引
- 网络错误与 404 分流提示（src/loaders/errors.js）
- 文档：README / KNOWN-ISSUES / docs/normals-study.md

### Fixed
- `file://` 直接双击 `index.html` 静默黑屏：ES Module 被 CORS 拦截（origin `null`）→ 按协议动态注入入口 + fatal 遮罩指引
- 预扫描竞态：静态 `<script type="module">` 即使 `remove()` 也挡不住 preload scanner 已发出的请求 → 改为不写静态标签
- 测试竞态：动态注入模块可能在 DOMContentLoaded 后才就绪 → `waitForFunction` 等待 `__FORMA.ready`
- 服务器宕机时的误导性提示（原提示让用户检查 .mtl 贴图）→ 网络失败单独提示重启服务器
