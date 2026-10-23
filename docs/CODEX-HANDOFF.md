# CODEX-HANDOFF — 当前工程交接

2026-10-23：当前为 RC2 展陈改造，首读 [EXHIBITION-RC2.md](EXHIBITION-RC2.md) 与 [机器结果](audit/rc2-results.json)。以下 RC1 服务/业务说明继续有效。以 [品质报告](V5-QUALITY.md)、[Logo 接入约定](LOGO-INTEGRATION.md)、[AI 服务适配](AI-PROVIDERS.md) 与 [剩余问题](../KNOWN-ISSUES.md) 为当前状态。阶段 2 [生产闭环记录](V5-PRODUCTION-WORKFLOW.md) 与第一轮审计保留追溯。

## Git 与资产

RC2 运行行为：公开页使用真实 WebP 海报，进入 Gallery 才加载 Exhibition v1；Studio 选择仍以 assetId/version/path 为准。Gallery / Studio 共用 Viewer，离开 Studio 使迟到选择失效。Logo 已批准方案但未接入正式文件。

历史 RC1 已完成全量 31/31 组、最终静态包 19/19、WorkBuddy 完全退出时真实 Agent 7/7。运行代码提交 `d20d1d231bf377b282cc7bdfb68c82ac7918b719`；最终文档/截图另存提交。候选包和复现步骤见品质报告，不依赖私人运行期目录。

当前开发 worktree：D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3-quality，分支 feature/codex-v5-exhibition；从 RC1 检查点 83453aafbc1dd8f8885f05d5ab9d1c3215218b65 创建。原工程 FORMA-3D-Viewer-v3 保留 feature/codex-v5-audit 与原有未提交文档。不要在两个工作区交叉覆盖，不合并 main 或 force push。

docs/ARCHITECTURE.md 的接手前格式改动必须继续保留，未纳入任何功能提交。原始资产、仓库外 OBJ/MTL/PNG、既有用户工作区资产、凭据均不可覆盖；所有处理输出写新版本。

## 启动与测试

Windows / Node 24.22.0 / npm 11.19.1 / Edge 155 已实测。开发依赖要求 Node >=22.12.0。npm ci 后 npm start（或 FORMA.bat）启动前后端。默认 5173/8787，仅本机。

- npm test：快照隔离测试，不操作真实资产。新增文件先 git add 才会进入快照。
- npm run release:verify：验证静态闭包，不部署。
- node tests/run.mjs --only=workflow：实际 Edge 资产闭环，模型服务被设为不可用以验证普通功能独立。
- node tests/run.mjs --only=agent-live：真实 deepseek-v4-pro 工具调用与实际算子；和故障注入测试分开。
- node tests/run.mjs --only=production-visual：390px/1024px/1600px、对比尺度/裁剪/显存、同机位截图。
- node tests/run.mjs --only=quality：联系/品牌、材质编辑、FBX 通道、无 AI 服务的实际处理与最终截图。
- providers、fbx-materials、local-security、geometry-semantics：针对性故障与语义回归；cdp、performance 为单独执行的连接/性能验收。

浏览器路径变量 FORMA_BROWSER。测试输出 test-out/suite-*/；不自动清理历史证据。发布打包只允许新目录。静态站点只有展示，处理和真实 Agent 需要本地后端。

## 当前状态约定

选中资产由 core.state.selection 的 assetId/version/path 定义，version=0 为 Original。任何处理、材质保存、导出都从该版本开始。selectAsset 异步切换用请求序号防止旧响应覆盖新状态；作品列表、拖放导入、版本树和已发布条目也走同一身份。

runAssetPipeline 原子保留版本目录；version.json 记录 baseVersion/kind/status。失败产物保留供检查，不能视为通过或发布。GLTF 下载 ZIP 含依赖；发布写独立完整包。

Material Lab 预览不落盘；撤销/重做限定当前材质，保存生成 Edited 版本，切换资产/路由前保护未保存修改；环境反射为预览参数。FBX/OBJ 先在浏览器用匹配版本的 Three.js GLTFExporter 生成新 GLB，经验证后处理，原始资源不变。已核实 Blender 2.93 FBX 的 PBR 通道由服务端恢复；通道报告与风险保存在版本中。

Agent 每个任务独立追踪通过后验的版本；需要风险确认时保存真实待调用工具，使用 resumeRunId 和 token 恢复一次。超时/取消有明确日志，不自动重放失败写入。同步算子只能在安全边界停止。

## WorkBuddy 与许可证

保留现有 WorkBuddy SDK 和服务，真实调用已验证；可替换服务尚未配置外部凭据，其合约测试不等于供应商实连。第三阶段只有 Puppeteer 开发依赖升级，无新生产依赖；许可证与采用/暂缓理由见 QUALITY-SOURCES.md。Avocado 测试模型 CC0，FBX 测试模型使用 ufbx MIT 许可，来源和哈希在 test-assets/licensed/README.md。

## 尚需工作

复杂 FBX 的全部动画/约束/特殊材质、动态变形 bounds、KTX2 GPU 压缩、手机真机性能、批任务取消恢复、持续压力与 worker 隔离仍未完成。不可把固定模型测试扩展成所有格式/模型都无损的承诺。最终 Logo 等用户交付确认文件/分支/SHA 后独立接入。
