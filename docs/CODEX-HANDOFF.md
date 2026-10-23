# CODEX-HANDOFF — 当前工程交接

2026-10-23：阶段 2 已在原工程完成实现。以 [生产闭环记录](V5-PRODUCTION-WORKFLOW.md)、[机器验收摘要](audit/phase2-results.json) 与 [剩余问题](../KNOWN-ISSUES.md) 为当前状态；第一轮审计为历史基线。

## Git 与资产

工程：D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3。分支 feature/codex-v5-audit。审计 8632195 已推送备份，后续按阶段提交推送；不要合并 main 或 force push。

docs/ARCHITECTURE.md 的接手前格式改动必须继续保留，未纳入任何功能提交。原始资产、仓库外 OBJ/MTL/PNG、既有用户工作区资产、凭据均不可覆盖；所有处理输出写新版本。

## 启动与测试

Windows / Node 24.22.0 / npm 11.19.1 / Edge 155 已实测。npm ci 后 npm start（或 FORMA.bat）启动前后端。默认 5173/8787，仅本机。

- npm test：快照隔离测试，不操作真实资产。新增文件先 git add 才会进入快照。
- npm run release:verify：验证静态闭包，不部署。
- node tests/run.mjs --only=workflow：实际 Edge 资产闭环，模型服务被设为不可用以验证普通功能独立。
- node tests/run.mjs --only=agent-live：真实 deepseek-v4-pro 工具调用与实际算子；和故障注入测试分开。
- node tests/run.mjs --only=production-visual：390px/1024px/1600px、对比尺度/裁剪/显存、同机位截图。

浏览器路径变量 FORMA_BROWSER。测试输出 test-out/suite-*/；不自动清理历史证据。发布打包只允许新目录。静态站点只有展示，处理和真实 Agent 需要本地后端。

## 当前状态约定

选中资产由 core.state.selection 的 assetId/version/path 定义，version=0 为 Original。任何处理、材质保存、导出都从该版本开始。selectAsset 异步切换用请求序号防止旧响应覆盖新状态；作品列表、拖放导入、版本树和已发布条目也走同一身份。

runAssetPipeline 原子保留版本目录；version.json 记录 baseVersion/kind/status。失败产物保留供检查，不能视为通过或发布。GLTF 下载 ZIP 含依赖；发布写独立完整包。

Material Lab 预览不落盘；保存生成 Edited 版本，重置回当前版本；环境反射为预览参数。FBX/OBJ 先在浏览器用匹配版本的 Three.js GLTFExporter 生成新 GLB，经验证后处理，原始资源不变。

Agent 每个任务独立追踪通过后验的版本；需要风险确认时保存真实待调用工具，使用 resumeRunId 和 token 恢复一次。超时/取消有明确日志，不自动重放失败写入。同步算子只能在安全边界停止。

## WorkBuddy 与许可证

保留现有 WorkBuddy SDK 和服务，真实调用已验证；没有添加 OpenAI Key 或替换工作服务。服务长期可用性不作保证。新增 gltf-validator 为 Apache-2.0；Avocado 测试模型 CC0，FBX 测试模型使用 ufbx MIT 许可，来源和哈希在 test-assets/licensed/README.md。

## 尚需工作

复杂 FBX 的全部动画/约束/特殊材质、KTX2 GPU 压缩、手机真机性能、全场景 bounds、长期并发和大文件峰值未完成验证。不可把本次已通过的固定模型测试扩展成所有格式/模型都无损的承诺。
