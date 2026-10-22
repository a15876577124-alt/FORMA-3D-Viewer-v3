# FORMA 安全设计

> 2026-10-23 审计修正：已修复 Agent dryRun/异步派发、资产引用越界、静态私有目录访问、测试资产破坏与并发版本覆盖。现有 CORS 仅控制响应读取，不能拒绝非可信来源的操作请求；Origin/Host 限制及资源预算仍属 P1。详见 [CODEX-AUDIT.md](CODEX-AUDIT.md)。下文原有设计约束不等于全部已实施的防护。

FORMA 从 3D 展示器升级为「AI 3D 资产分析/修复/优化/转换/管理/发布平台」后，本地处理服务会读取用户上传的模型文件，因此安全约束是硬性要求。

## 1. 网络边界

- 后端服务**仅监听 `127.0.0.1`**（`backend/server.mjs` 硬编码 `HOST`），绝不绑定 `0.0.0.0`。
- 前端静态服务 `serve.mjs` 仅监听本机，`/api/*` 反向代理到本机后端（不暴露到局域网）。
- 后端 CORS 白名单只允许本机前端源（`127.0.0.1` / `localhost`）。

## 2. 密钥保护

- 云服务凭据只来自两处：
  - `backend/publicConfig.json`（`endpoint` + `publishableKey`，**公开值**，设计上可入仓库）
  - `backend/.env`（可选覆盖，**已被 .gitignore 忽略**）
- **API 密钥 / 长期令牌绝不进入**：前端代码、仓库、日志、`git` 提交。
- 确认门 HMAC 密钥是进程内随机值，不落盘、不写日志。

## 3. 上传校验（三重）

`backend/validate.mjs` 对每个上传文件做：
1. **魔数校验**：GLB=`glTF`、FBX=`Kaydara FBX Binary`/ASCII、PNG/JPEG/WebP 签名——信任文件内容而非客户端声称的 MIME。
2. **扩展名白名单**：glb/gltf/obj/mtl/fbx/png/jpg/jpeg/webp。
3. **大小上限**：256 MB。

## 4. 路径安全（防目录穿越）

`backend/paths.mjs`：
- `safeJoin` / `safeResolveExisting`（含 realpath 符号链接校验）拒绝 `..` 与绝对路径逃逸。
- `assertSafeId` 限制资产 ID 为 `[A-Za-z0-9._-]{1,64}`。
- 写盘只落在 `pipeline-out/`、`assets/library/`、`backend/workspace/` 三个受控目录。

## 5. 原始素材保护（不可破坏）

- `assets/raw/` 五个琼剧手办 GLB **只读打开**，任何算子不写回。
- 处理产物只写 `pipeline-out/<id>-v<N>/`（版本号递增，**永不覆盖**）。
- `publish` 只复制不移动；`meta.json` 幂等写入不覆盖原始文件。
- 测试逐字节校验：处理后 `assets/raw/` 的 sha256 与 `glbkit.EXPECTED` 基线一致。

## 6. 琼剧红线（外观保护）

`backend/policy.mjs` 硬编码（不交给 LLM 判断，防诱导绕过）：
- 会改变外观/贴图的算子（`genNormals`/`fixMaterials`/`quantize`/`textureResize`/`textureCompress`/`simplify`/`convert`）→ 强制确认门。
- 琼剧手办命中 `pruneUnused`/`dedupMaterials`/`textureDedup`/`prune`/`join` → 强制确认门。

确认门（`backend/gate.mjs`）签发 10 分钟有效的 HMAC token，未确认一律 409 不写盘。

## 7. 依赖真实性

- 处理算子采用成熟库（gltf-transform + meshoptimizer + sharp）+ 自研（genNormals/convert）。
- 后验（`backend/verify.mjs`）用切片哈希 + 重解析 + 单调性断言，**禁止假优化**（改文件名/假统计/无效处理一律不通过）。
