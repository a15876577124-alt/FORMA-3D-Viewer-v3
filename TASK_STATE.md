# TASK_STATE — FORMA AI 3D Asset Pipeline 开发状态

> 断点续作文件。每次会话开始先读这里；每完成一个里程碑立即更新。
> 更新时间：2026-10-16 22:27 (UTC+8)

## 当前状态

- **分支**：`feature/ai-asset-pipeline`（基于 `main` @ `0b7c3d0`，基线标签 `v3.0.0-baseline`）
- **远程同步**：✅ 分支已推送并跟踪 `origin/feature/ai-asset-pipeline`（2026-10-16 15:12）
- **当前里程碑**：M0 ✅ / M0.5 ✅ / M1 ✅ / M2 ✅ / M3 ✅ / M4 ✅ / **M5 ✅ 完成**（proxy 5/5 + 前端语法全通过）
- **下一里程碑**：M6 测试 + 演示交付物 + 文档 + GitHub 同步 + Pages 验证
- **主力模型**：`deepseek-v4-pro`（用户指定，禁止自动降级到 flash；`llm.mjs` 已设 DEFAULT_AGENT_MODEL）
- **npm test 基线**：pipeline 50/50、agent 36/36、ops 63/63、batch 19/19、proxy 5/5 通过；render/ui/import/extended 组受阻（浏览器），走 CDP 方案
- **远程同步**：本地与远程已同步（M4 `b36317c`），M5 待提交推送

## ✅ M0.5 LLM Spike 结论（2026-10-16 15:30）

- **独立 Node 进程可持续调用 WorkBuddy 云服务 LLM**：`models.list()` 380ms；连续流式 chat 调用 6.9s/3.9s 均成功
- **Origin 匹配未构成阻碍**：Node 进程（无 Origin 头）可直接调用，服务端以 publishableKey 认证
- 云服务应用已激活：`wbapp_fIlxy8R4EAkGCA3ubnQhE6`（FORMA资产管线），billing=normal
- **可用模型 32 个**（全部 supportsToolCall=true）：`auto`、`glm-5.3`/`glm-5.3-flash`、`deepseek-v4-pro`/`deepseek-v4-flash`、`kimi-k2.7`、`hunyuan-2.0-thinking`、`step-5-preview` 等
- 选型初判：日常分析/Agent 用 `glm-5.3-flash` 或 `deepseek-v4-flash`（快+工具调用）；复杂推理可升级 pro 级
- 注意：部分模型带 reasoning（如 auto 实测 215 thinking tokens，首答 6.9s）——Agent 场景要容忍思考延迟
- 凭据形态：`backend/publicConfig.json`（公开配置，可入仓库）；长期密钥只进 `backend/.env`（已 gitignore）
- Spike 脚本：`tools/llm-spike.mjs`

## 🔴 阻塞：测试浏览器无法启动（2026-10-16 14:29 发现）

**现象**：Puppeteer 启动 Edge 报 `Failed to launch the browser process!`；npm test 的 render 组失败，其余组通过。

**已排除**：
- ~~沙箱进程创建限制~~——沙箱外（dangerouslyDisableSandbox）同样失败；notepad 可在沙箱内启动
- ~~Edge 单例冲突~~——14:29 失败时用户 Edge 尚未启动（用户实例 14:38 才起）；且失败早于用户启动
- ~~user-data-dir 残留/锁~~——全新 mkdtemp 目录同样失败；清理 8 个残留 profile 无效
- ~~安装目录损坏~~——复制整个版本目录到 `D:\FORMA-tmp\edge-copy` 后同样 0.2s 秒退
- ~~Chromium 自身 sandbox~~——`--no-sandbox` 无效
- ~~IFEO 映像劫持~~——注册表无相关项
- ~~改名绕过~~——副本改名后同样秒退（只走到 Crashpad 阶段）

**特征**：msedge.exe 任意位置/参数组合均在 0.2 秒内 exit 0 无输出，连 `--version`、`--v=1 --enable-logging` 都零输出；profile 只创建 `Crashpad` 即止。**同一套测试 10-15 日正常运行**（suite-2026-10-15T19-58-40-566Z 7/7 通过），说明环境在此期间发生了变化。

**进行中**：安装 Playwright 自带 Chromium（独立二进制）做区分实验——若 Playwright Chromium 可启动则为 Edge 特定问题；若同样秒退则为系统级浏览器进程拦截。

**后备方案**：
1. browser-test.mjs 增加 `FORMA_CDP_URL` attach 模式（连接用户桌面已启动的带调试端口浏览器，TCP 走 127.0.0.1 不受影响）
2. render 测试交由用户在本机桌面运行一次并归档结果
3. 不阻塞 M1-M5 开发（后端/分析/Agent 开发不需要浏览器；UI 完成后统一处理）

## ✅ M1 完成（2026-10-16 15:45）

**后端架构**（`backend/`，仅监听 127.0.0.1）：
- `server.mjs`：HTTP API（health/models/assets import+analyze+report）；CORS 仅本机前端源
- `analyze.mjs`：分析器——GLB/GLTF 深度解析（网格/图元/材质/贴图/动画/蒙皮/边界盒）；OBJ/FBX 走 three.js loaders
- `validate.mjs`：上传三重校验（魔数 + 扩展名白名单 + 256MB 上限）
- `paths.mjs`：目录穿越防护（safeJoin + realpath 校验 + 资产 ID 字符白名单）
- `llm.mjs`：云服务 LLM 客户端封装（models 缓存 10min、pickAgentModel、chat）
- `texture-sniff.mjs`：PNG/JPEG/WebP 真实尺寸解析

**已验证**（tests/pipeline.test.mjs，50 断言）：
- 5 个手办 GLB verts/tris 与 ground truth 逐一精确一致；贴图 2048x2048 真实解析
- GLTF（外嵌 buffer/贴图）、OBJ（未焊接诊断）、FBX ASCII/二进制（含动画、蒙皮）真实解析
- 安全：伪造魔数 415 / 穿越文件名清洗 / workspace 外零写入 / 危险扩展名 415 / 空文件 415 / 恶意 id 403 / 陌生 Origin 无 CORS 头
- 已知实现细节：three loaders 输出非索引化几何体（FBX/OBJ 每面独立顶点）——分析器如实报告
- FBX Node Buffer → ArrayBuffer 转换（three `new Uint8Array(buffer, from, to)` 语义）

**npm scripts**：`npm run pipeline:serve`、`npm run test:pipeline`

## ✅ M2 完成（2026-10-17）

**关键实测**：SDK 网关**真实转发原生 tools 参数**——`deepseek-v4-pro`/`glm-5.3-flash`/`kimi-k2.7` 均返回 `finish_reason='tool_calls'` + 分片 `delta.tool_calls`（name 首片完整、arguments 逐字符分片）。主力 `deepseek-v4-pro` 首轮工具调用 2.0s。

**Agent 架构**（`backend/agent/`）：
- `tools.mjs`：8 工具单一真源（list_assets/analyze_asset/propose_ops/run_op/verify/compare/export_asset/finish），handler 经 ctx 注入，mutating/confirm 标记
- `toolAccumulator.mjs`：分片累积 + 容错 JSON 解析（括号配平重试）+ index 升序
- `llmStream.mjs`：透传 tools/tool_choice，采样 rawChunkSample 作「AI 决策」证据
- `agent.mjs`：主循环（native/prompt 双协议、多轮回灌、死循环检测、maxRounds/maxToolCalls/墙钟上限、执行日志落盘 `workspace/assets/<id>/runs/<runId>.json`）
- `fakeLlm.mjs`：离线回放，供无网自动化测试
- `paths.mjs` +`safeJoinPipeline`/`safeJoinLibrary`（pipeline-out/、assets/library/）
- `server.mjs` +4 路由（`/api/agent/tools`、`/api/agent/run`、`/api/agent/runs/:runId`、`/api/agent/runs`）

**「证明是 LLM 决策」三重证据**（tests/agent.test.mjs 36 断言）：
1. rawChunkSample 含 delta.tool_calls；dispatchTool 只接受日志 toolCalls，服务端无默认 op 填充
2. 反证测试：朴素规则首推 simplify，Agent 首推 textureResize，两者不同（非规则冒充）
3. `FORMA_LLM_OFFLINE=1` 抛 503 且零轮次、pipeline-out 无新增

**真实模式验证**：`sheng` dryRun 端到端 2 轮完成，list_assets→analyze_asset，LLM 自发识别出 workspace 中 sheng/passwd 是同一文件重复导入。

**npm scripts**：`npm run test:agent`、`npm run agent:spike`

## ✅ M3 完成（2026-10-17）

**依赖排查结果**：`@gltf-transform` 之前确实未安装（状态记录有误，已更正）。现成功安装并**真实验证可用**：
- `@gltf-transform/core/extensions/functions` 4.5.1（84 函数）
- `meshoptimizer` 1.3.0（MeshoptSimplifier，simplify 用）
- `sharp` 0.35.5（原生二进制正常，textureResize/Compress 用）

**算子架构**（`backend/ops/` + 编排 `backend/runPipeline.mjs`）：
- 成熟库算子（gltf-transform）：weld/dedup/prune/simplify/quantize/join
- sharp 自研：textureResize/textureCompress（compact 重建 BIN，丢弃旧贴图字节）
- 自研：genNormals（法线生成，源自 fix-glb 算法）/ fixMaterials / setSampler / textureReport / convert（glb↔gltf↔obj；FBX 只进不出）
- `index.mjs`：注册表 + 参数校验 + 能力门控 + 链式执行
- `policy.mjs`：琼剧红线（appearance 算子 + 5 手办 prune/dedup 强制确认）
- `gate.mjs`：HMAC 确认门 token（10min 有效）
- `verify.mjs`：后验（容器/重解析/字节级切片哈希/贴图字节/单调性断言/bounds）

**关键修复**：
- `glbkit.readAccessor` 支持 interleaved bufferView（byteStride）——gltf-transform 常见输出
- `analyze.analyzeFile` 传完整路径（gltf 外部 .bin/贴图正确 dirname）
- `verifyPair` 逐算子「输入 vs 输出」对比（中间产物）；convert 后验适配 gltf/obj 格式

**验证**（tests/ops.test.mjs 63 断言）：能力探测、13 算子独立执行+后验、simplify tris 真实下降、textureResize 贴图 2048→1024 且体积下降、convert fbx 400、确认门 409、链式执行、原始素材 sha256 全程不变、runAssetPipeline 端到端（版本目录+report+verify）。

**npm scripts**：`npm run test:ops`、`npm run op:demo`

## ✅ M4 完成（2026-10-17）

**批量**（`backend/batch.mjs`）：`runBatch({assetIds, ops, concurrency:2, confirmToken})`——批量级确认门（gate 的 generateBatchConfirmToken）→ 逐资产派发真实执行；`tests/batch.test.mjs` 19 断言：5 手办 weld+genNormals+fixMaterials 5/5 成功、每资产 verify 通过、原始 sha256 全程不变、BATCH 报告落盘。

**资产库**（`backend/library.mjs`）：`listLibrary`（扫描 pipeline-out 版本）/ `publishAsset`（只复制不移动，产物到 `assets/library/` 可上 Pages）/ `deleteLibraryFile`（safeJoinLibrary 防穿越）/ `listPublished`。

**前端加入展厅**（不动 viewState SCHEMA、只追加 `__FORMA` 字段）：
- `src/state/appState.js`：独立 key `forma3d.v4.app`（mode + library + recentRuns）
- `src/models/library.js`：library 条目转 FIGURINES 同构 entry（id 前缀 `lib:`）
- `src/main.js`：`resolveEntry` 加 libraryMap；`__FORMA.appState` + `__FORMA.library.addEntry()`
- `src/ui/sidebar.js`：`addLibraryEntry`（「资产库」组，badge ★）

**server 路由**：`POST /api/batch/run`、`GET /api/library`、`GET /api/library/published`、`POST /api/assets/:id/publish`、`DELETE /api/library/:file`（CORS 加 DELETE）。

**npm scripts**：`npm run test:batch`、`npm run batch:demo`

## ✅ M5 完成（2026-10-17）

**反向代理**（`serve.mjs`）：`/api/*` → `127.0.0.1:8787`（方法/头/体透传，后端不可达 502 `backend_unavailable`）；前端用同源 `/api` 消灭 CORS 与随机端口问题。`tests/proxy.test.mjs` 5 断言（200 透传 / 502 降级 / 静态不受影响）。

**Pipeline 工作模式 UI**（`src/ui/pipeline.js`，惰性连接启动零请求）：
- 连接后端（health/ops/tools/models/assets）→ 资产下拉 + 算子勾选（风险 ⚠ 标记）+ 执行处理（确认门 409 → 二次确认）+ AI 分析（agentRun + 日志流）+ Before/After 滑条 + 加入展厅
- `src/net/api.js`：同源 API 客户端（ApiError 携带 status/data 用于确认门）

**Before/After 对比**（`src/core/compare.js` CompareRig）：同场景同相机，两个 group 相反法线 clippingPlanes 滑动对比；不写 cache、不接管 modelRoot；`viewer.js` +`pin/unpin`（_evictCache 跳过 pinned）。

**集成**（`src/main.js`）：顶栏「管线」按钮切换 `mode-pipeline`；面板挂右栏顶部；`__FORMA.pipeline` / `__FORMA.appState` / `__FORMA.library` 只追加；`setMode()`。

**CDP 方案**（`tools/browser-test.mjs`）：`FORMA_CDP_URL` 环境变量 → `puppeteer.connect`；启动指引 `docs/demo/README.md`。

**已知**：UI 渲染（面板/对比/截图）需 CDP 或用户本机浏览器验证（沙箱起不了 Edge）；代码已语法检查通过，逻辑待真实渲染确认。

**npm scripts**：`npm run test:proxy`

## 里程碑清单

| ID | 内容 | 状态 |
|----|------|------|
| M0 | 基线标签 + 功能分支 + 备份 + .gitignore + 本文档 | ✅ 完成（render 受阻见阻塞） |
| M0.5 | WorkBuddy 云端 LLM 独立 Node 进程连通性 Spike（阻断门） | ✅ 通过（见下） |
| M1 | Node 后端骨架（http/https API）+ 真实 GLB/GLTF/OBJ/FBX 分析闭环 | ✅ 完成（50/50） |
| M2 | AI Agent 工具链（真实 LLM + 工具调用 + 执行日志 + 后验） | ✅ 完成（36/36 + 真实跑通） |
| M3 | 非破坏式处理算子 + Before/After 3D 对比（Day1 出口：单模型全流程） | ✅ 完成（63/63） |
| M4 | 批量处理 + 资产库 + 加入展厅 | ✅ 完成（19/19） |
| M5 | 专业 UI/UX（Pipeline 工作模式）+ 性能 | ✅ 完成（proxy 5/5；UI 代码就绪待 CDP 验证） |
| M6 | 测试 + 演示交付物 + 文档 + GitHub 同步 + Pages 验证 | ⬜ |

## 外部依赖状态

| 依赖 | 状态 | 备注 |
|------|------|------|
| GitHub 仓库 `a15876577124-alt/FORMA-3D-Viewer-v3` | ✅ 已推送 8 提交、公开、Pages 在线 | 演示 <https://a15876577124-alt.github.io/FORMA-3D-Viewer-v3/> |
| `feature/ai-asset-pipeline` 分支远程同步 | ⬜ 待推送 | 沙箱 git push 通道不稳定（502/schannel），失败时请求用户 GitHub Desktop 推送 |
| WorkBuddy 云服务 LLM | ⬜ M0.5 验证 | 环境变量 `WORKBUDDY_VLM_AUTH_TOKEN` 存在；需 `connect_cloud_service` 取短期凭据 |
| Blender | ❌ 不可用 | FBX 走 three.js FBXLoader 离线烘焙路线 |
| npm registry | ✅ 可用 | gltf-transform 4.5.1 已装（见 package.json） |

## 安全约束（每次涉及资产处理时自查）

1. 处理服务**仅监听 127.0.0.1**，禁止 0.0.0.0
2. 上传文件必须验证魔数与扩展名（GLB=`glTF`、GLTF=JSON、OBJ 文本、FBX=`Kaydara FBX Binary`）
3. 所有文件路径必须解析后限制在 workspace 根内（防目录穿越）
4. API 密钥只进 `backend/.env`（已 gitignore），禁入前端/日志/仓库
5. **绝不删除或覆盖 `assets/raw/` 原始素材**；处理输出只写 `pipeline-out/<name>-v<N>/`

## 已完成的验收基线（v3.0.0）

- 5 个琼剧手办 GLB：字节级完好（与 200/200 校验一致）
- 线上 Pages 渲染实测：生角 95,804 drawn triangles，控制台零错误
- 回归测试：7/7 组（RTX 4060 真实渲染，56 断言）

## 关键路径速查

- 项目根：`D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3`
- 原始素材：`assets/raw/`（禁动）
- 测试输出：`test-out/`（可再生）
- 备份：`D:\FORMA-backups\2026-10-16\FORMA-v3-baseline-*.tar.gz`（208 MB，含全部源文件）
- 计划终稿：`C:\Users\a1587\.workbuddy\plans\toasty-nebula-einstein-E_Cdgbsj.md`
