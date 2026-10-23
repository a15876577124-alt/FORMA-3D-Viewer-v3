# FORMA 安全设计

> 2026-10-23 第三阶段：Origin/Host 已在前后端执行前校验；代理改为有背压的流式传输并增加请求预算。针对性请求测试与性能样本见 [V5-QUALITY.md](V5-QUALITY.md)。第一轮 [CODEX-AUDIT.md](CODEX-AUDIT.md) 保留为历史证据。

FORMA 从 3D 展示器升级为「AI 3D 资产分析/修复/优化/转换/管理/发布平台」后，本地处理服务会读取用户上传的模型文件，因此安全约束是硬性要求。

## 1. 网络边界

- 后端服务**仅监听 `127.0.0.1`**（`backend/server.mjs` 硬编码 `HOST`），绝不绑定 `0.0.0.0`。
- 前端静态服务 `serve.mjs` 仅监听本机，`/api/*` 反向代理到本机后端（不暴露到局域网）。
- 后端 CORS 白名单只允许本机前端源（`127.0.0.1` / `localhost`）。
- `local-http.mjs` 校验实际监听端口的 Host、明确允许的本机 Origin，拒绝陌生/null Origin、无 Origin 的 cross-site 请求；请求执行前返回 403。不是仅省略 CORS 响应头。
- 前端代理只允许本机 HTTP 目标，转发受控头并在验证来源后改写 Origin。带正文的 POST 必须是 JSON；无正文的分析动作保持兼容。
- 早期拒绝关闭连接，避免未消费请求体污染下一次请求。请求头/正文接收超时为 15/30 秒；代理等待任务响应 210 秒，Agent 自身上限 180 秒。
- 本机 CLI/本机程序属于信任边界内；这不是多用户认证服务，不适合直接暴露公网。

## 2. 密钥保护

- 云服务配置只从服务端读取：
  - 既有 `backend/publicConfig.json`（`endpoint` + `publishableKey`；发布型配置不代表服务授权、额度或长期可用性无条件开放）
  - 进程环境变量或 `backend/.env`（可选覆盖，**环境文件已被 .gitignore 忽略**）
- **API 密钥 / 长期令牌绝不进入**：前端代码、仓库、日志、`git` 提交。
- 可替换服务只读服务端 `FORMA_OPENAI_*` 环境变量。模型输入脱敏，连接测试用合成文本；详见 [AI-PROVIDERS.md](AI-PROVIDERS.md)。
- 确认门 HMAC 密钥是进程内随机值，不落盘、不写日志。

## 3. 上传校验（三重）

`backend/validate.mjs` 对每个上传文件做：
1. **魔数校验**：GLB=`glTF`、FBX=`Kaydara FBX Binary`/ASCII、PNG/JPEG/WebP 签名——信任文件内容而非客户端声称的 MIME。
2. **扩展名白名单**：glb/gltf/obj/mtl/fbx/png/jpg/jpeg/webp。
3. **大小上限**：256 MB。

预算同时包括：普通 JSON 8 MiB、资产 base64 请求约 342 MiB、导入/ZIP 导出总文件字节 256 MiB 与最多 256 个依赖；单 accessor 16M 分量、世界坐标扫描 16M 顶点、层级 128 层/100k 节点；Sharp 普通贴图解码 64M 像素，FBX 多通道合并 16M 像素。超预算明确失败，不删文件、不隐式降画质。仍不是独立进程沙箱，复杂 FBX 解压与超大同步算子隔离属于后续工作。

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
