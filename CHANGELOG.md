# CHANGELOG

All notable changes to FORMA are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/).

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
