# AI 服务接入与验证

默认仍使用既有 WorkBuddy Cloud。普通导入、分析、算子、版本、材质与导出不依赖 AI 服务可用性。实现入口为 `backend/providers/index.mjs`，WorkBuddy 适配器为 `backend/providers/workbuddy.mjs`；前端只选择服务 ID 与模型 ID，不能提交服务地址或密钥。

## 可替换服务

在启动后端的本地环境中设置以下变量，或自行写入被忽略的 `backend/.env`，然后重启后端。本次开发未修改私人环境文件、申请账户或引入付费服务。

```text
FORMA_AI_PROVIDER=compatible
FORMA_OPENAI_BASE_URL=https://your-provider.example/v1
FORMA_OPENAI_API_KEY=<server-only secret>
FORMA_OPENAI_MODEL=<native-tool-capable model id>
```

也可不设 `FORMA_AI_PROVIDER`，在 Studio 的 AI 日志面板选择新任务服务。外部地址必须 HTTPS，本机允许 HTTP。地址不接受 URL 凭据、查询参数或重定向。协议要求 `/models`、流式 `/chat/completions`、原生 `tools/tool_choice`。不是所有自称 OpenAI-compatible 的服务都满足这组能力。

“测试连接与工具”只发送合成文本，必须收到正确工具名及参数才显示通过。没有自动启用或自动降级。状态分别显示未配置、凭据错误、额度/限流、工具不支持、超时及流中断。未知工具能力保持 unknown，不由模型名称猜测。

每个 Agent 任务固定服务配置指纹；切换仅影响新任务，待确认任务恢复沿用原服务。配置发生变化时拒绝恢复，且不消耗确认。任务日志保存 provider/model/rounds/native chunks/工具与后验结果。传给模型的工具报告移除本机路径与嵌入数据；上传模型原文件不作为 LLM 请求体。日志仍是本地运行资料，不应公开打包。

## 2026-10-23 验证范围

- `tests/providers.test.mjs`：7 项独立本机协议/故障测试，明确不是实时 AI 演示。
- `tests/agent-stability.test.mjs`：算子串联、确认恢复、取消/超时、dryRun、并发隔离与配置变化防重放。
- Edge `suite-2026-10-23T10-44-17-661Z/quality`：兼容服务未配置时界面给出原因，普通 dedup 仍实际处理并通过后验。
- 实时服务 `suite-2026-10-23T10-44-28-265Z/agent-live`：WorkBuddy / deepseek-v4-pro 实际返回原生工具流，weld → dedup 链式处理与视口版本一致，7 项验收通过。该次运行时 WorkBuddy 桌面进程存在，因此不能将此证据描述为“卸载/未登录 WorkBuddy 后也可用”。服务端代码调用 SDK 配置入口，不调用 WorkBuddy 桌面 IPC；账号、项目授权和额度仍由服务方控制。
- 未提供新的兼容服务凭据：兼容协议已完成合约测试，外部兼容服务尚未完成真实供应商验收。
- 补充独立验证 `suite-2026-10-23T11-21-22-888Z/agent-live`：用户正常退出 WorkBuddy 后，独立 PowerShell 启动隔离 FORMA，运行前后 WorkBuddy/CodeBuddy 进程均为 0；相同真实工具调用与处理验收 7/7 通过。证明当前配置无需桌面客户端运行，不证明注销/卸载后可用，也不改变账户授权依赖。进程状态与结果摘要在 `docs/audit/phase3-results.json`。

本地后端通过 `/api/ai/providers` 返回不含凭据的配置状态；`/api/ai/test` 返回合成连接测试结果。禁止把密钥添加到前端配置、截图、日志或 Git 提交。
