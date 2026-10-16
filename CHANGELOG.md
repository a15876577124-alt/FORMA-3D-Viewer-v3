# CHANGELOG

All notable changes to FORMA are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/).

## [Unreleased] — AI Asset Pipeline (v4)

开发分支 `feature/ai-asset-pipeline`。目标：从 3D 展示器升级为
AI 3D 资产分析、修复、优化、转换、管理与发布平台。

### Added
- `TASK_STATE.md`：断点续作状态文件（里程碑 / 外部依赖 / 安全约束）

### Changed
- `.gitignore`：追加 AI Pipeline 相关忽略项（`backend/workspace/`、`backend/.env`、`pipeline-out/`、`docs/demo/frames/`）

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
