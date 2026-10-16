# TASK_STATE — FORMA AI 3D Asset Pipeline 开发状态

> 断点续作文件。每次会话开始先读这里；每完成一个里程碑立即更新。
> 更新时间：2026-10-16 22:27 (UTC+8)

## 当前状态

- **分支**：`feature/ai-asset-pipeline`（基于 `main` @ `0b7c3d0`，基线标签 `v3.0.0-baseline`）
- **远程同步**：✅ 分支已推送并跟踪 `origin/feature/ai-asset-pipeline`（2026-10-16 15:12）
- **当前里程碑**：M0 ✅ / M0.5 ✅ 完成；**M1 ✅ 完成**（pipeline 测试组 50/50）
- **下一里程碑**：M2 AI Agent 工具链（真实 LLM + 工具调用 + 执行日志 + 后验）
- **npm test 基线**：单元组全通过；render 组受阻（见「阻塞」），不阻塞后续开发；pipeline 组 50/50 通过

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

## 里程碑清单

| ID | 内容 | 状态 |
|----|------|------|
| M0 | 基线标签 + 功能分支 + 备份 + .gitignore + 本文档 | ✅ 完成（render 受阻见阻塞） |
| M0.5 | WorkBuddy 云端 LLM 独立 Node 进程连通性 Spike（阻断门） | ✅ 通过（见下） |
| M1 | Node 后端骨架（http/https API）+ 真实 GLB/GLTF/OBJ/FBX 分析闭环 | ✅ 完成（50/50） |
| M2 | AI Agent 工具链（真实 LLM + 工具调用 + 执行日志 + 后验） | ⬜ |
| M3 | 非破坏式处理算子 + Before/After 3D 对比（Day1 出口：单模型全流程） | ⬜ |
| M4 | 批量处理 + 资产库 + 加入展厅 | ⬜ |
| M5 | 专业 UI/UX（Pipeline 工作模式）+ 性能 | ⬜ |
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
