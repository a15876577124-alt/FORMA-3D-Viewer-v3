# TASK_STATE — FORMA AI 3D Asset Pipeline 开发状态

> 断点续作文件。每次会话开始先读这里；每完成一个里程碑立即更新。
> 更新时间：2026-10-16 22:27 (UTC+8)

## 当前状态

- **分支**：`feature/ai-asset-pipeline`（基于 `main` @ `0b7c3d0`，基线标签 `v3.0.0-baseline`）
- **当前里程碑**：M0 基线与备份 ✅ 进行中（分支已建、备份已完成、ignore 已更新）
- **下一里程碑**：M0.5 LLM 连通性 Spike（阻断门，用户最高优先级）
- **npm test 基线**：7/7 组通过（运行于 `test-out/suite-2026-10-15T19-58-40-566Z`，待 M0 完成后在新分支复跑确认）

## 里程碑清单

| ID | 内容 | 状态 |
|----|------|------|
| M0 | 基线标签 + 功能分支 + 备份 + .gitignore + 本文档 | 🔄 进行中 |
| M0.5 | WorkBuddy 云端 LLM 独立 Node 进程连通性 Spike（阻断门） | ⬜ |
| M1 | Node 后端骨架（http/https API）+ 真实 GLB/GLTF/OBJ/FBX 分析闭环 | ⬜ |
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
