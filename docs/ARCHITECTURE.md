# FORMA AI 3D Asset Pipeline — 架构

三层结构：**前端展厅（Three.js）→ 本地后端（Node，仅本机）→ 云服务（WorkBuddy LLM）**。

```
┌─────────────────────────────────────────────────────────────┐
│ 前端 src/（Three.js 0.186 展厅 + Pipeline 工作模式）          │
│  main.js ── viewer ── ui/pipeline ── net/api ── core/compare  │
│     │ 同源 /api（serve.mjs 反代，消灭 CORS）                   │
└─────┼───────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 后端 backend/（Node，仅监听 127.0.0.1:8787）                 │
│  server.mjs ── HTTP 路由（assets / agent / ops / batch / library）│
│     ├─ analyze.mjs      真实解析 GLB/GLTF/OBJ/FBX            │
│     ├─ agent/           AI Agent（tools / agent / llmStream） │
│     ├─ ops/             处理算子（transform/geometry/…）      │
│     ├─ runPipeline.mjs  编排：策略→确认门→算子链→后验         │
│     └─ batch/library    批量 + 资产库                         │
│     │ 密钥只进 backend/.env（gitignore）                      │
└─────┼───────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 云服务（WorkBuddy Cloud，keyless）                            │
│  LLM 32 模型（deepseek-v4-pro 主力）· Database · Auth · Storage│
└─────────────────────────────────────────────────────────────┘
```

## 关键设计决策

1. **前端零直连后端**：`serve.mjs` 把 `/api/*` 反代到 8787，前端用同源相对路径，测试随机端口与 CORS 问题一并消除。
2. **Agent 用原生 tools**：云 SDK 网关真实转发 OpenAI 兼容 `tools`/`tool_choice`，`delta.tool_calls` 分片累积（实测 deepseek-v4-pro 2.0s 返回 tool_calls）。
3. **非破坏式算子**：读 `original/` → 写 `pipeline-out/<id>-v<N>/` → 逐算子切片哈希后验。
4. **确认门**：外观影响算子（法线/材质/贴图/减面）走 HMAC 确认门，未确认 409 不写盘。
5. **状态分离**：`viewState`（per-exhibit，SCHEMA 3）与 `appState`（工作模式+资产库，独立 key）互不干扰。

## 目录速览

| 路径 | 职责 |
|---|---|
| `backend/analyze.mjs` | 多格式真实分析（schema 1 报告） |
| `backend/agent/` | AI Agent：工具单一真源 / 分片累积 / 主循环 / 离线回放 |
| `backend/ops/` | 处理算子注册表 + 各算子实现 |
| `backend/runPipeline.mjs` | 编排 + 确认门 + 后验 + 版本化输出 |
| `backend/verify.mjs` | 后验（切片哈希/重解析/单调性） |
| `backend/policy.mjs` `gate.mjs` | 琼剧红线 + HMAC 确认门 |
| `backend/batch.mjs` `library.mjs` | 批量处理 + 资产库 |
| `src/net/api.js` | 前端 API 客户端 |
| `src/ui/pipeline.js` | Pipeline 工作模式面板 |
| `src/core/compare.js` | Before/After 对比 |
| `tools/` | CLI 工具（spike/op-demo/batch-demo）+ 测试辅助 |

详见 `docs/PIPELINE.md`（算子+后验）与 `docs/SECURITY.md`（安全）。
