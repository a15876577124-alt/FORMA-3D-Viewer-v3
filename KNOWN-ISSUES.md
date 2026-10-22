# KNOWN ISSUES — FORMA V5

更新：2026-10-23，来源为 Codex 独立代码审查、真实 HTTP/Edge 检查及截图审阅。详细证据、根因和验收标准见 [docs/CODEX-AUDIT.md](docs/CODEX-AUDIT.md)。测试通过不代表下列工作流已完成。

## P0

本轮已修复：测试误改/误删真实资产、Agent dryRun 实际写入、工具派发未 await、资产引用越界读取/静态私有目录暴露、并发版本覆盖、任意打包目录递归删除。没有据此声称系统不存在未发现的 P0。

## P1 — 优先迭代

| 编号 | 未完成或缺陷 |
|---|---|
| P1-01 | 所选后端资产与视口脱节：选旦角后视口仍为生角，Material Lab 可能编辑另一个模型 |
| P1-02 | GLB→GLTF API 导出 500；GLTF→GLB 分支被提前 GLB 解析阻断；OBJ 多 primitive/变换/材质导出不完整 |
| P1-03 | 材质编辑未存为资产版本；export 忽略请求版本；publish 未复制多文件依赖、未强制 verify、同名可覆盖 |
| P1-04 | Studio 多文件逐个上传，无法归集 GLTF BIN/纹理或 OBJ MTL；GLB preflight 拒绝全部 required extensions |
| P1-05 | simplify 后验通过但截图可见明显面片/反光破碎；对比独立归一化掩盖尺度，世界 X 裁剪不是屏幕竖线 |
| P1-06 | 390px Gallery 右栏超出可视范围；Studio 文字竖向挤压；旧 scrollWidth 测试未捕获裁切 |
| P1-07 | Agent 多步算子各自从原始文件重跑；缺少确认后恢复、请求中断、严格结果验收 |
| P1-08 | 非可信 Origin/text/plain POST 可进入后端；CORS 响应头不构成操作授权，缺 Host 防护 |
| P1-09 | 代理无流式/上限，重解析阻塞主线程；256 MiB 大模型未做峰值负载验收 |
| P1-10 | 分析器误判索引 0 的 NORMAL/UV，bounds 未完整考虑场景变换；后验 stride/sparse 覆盖不足；GLB 写出拒绝中文名称 |
| P1-11 | npm audit 开发依赖链 7 项 high；生产依赖 0；升级需验证 Puppeteer/Edge/CDP 兼容性 |

## P2 — 质量与维护

- 全路由 GPU 生命周期：作品详情另建 miniViewer，主 Viewer 隐藏仍 RAF，PMREM 目标释放需补测。
- 版本列表缺任意两版比较、回滚，批处理缺取消和逐资产方案。
- 灯光面板挤占 Inspector、消息挡住模型、长名称与缩略图不足。
- launcher 端口占用未验证服务身份、前端固定等待；部分旧辅助脚本及 npm ao 尚需清理。
- 纹理传输/显存、移动帧率、长期内存需要固定性能基准。

## 未验收范围

真实 iOS/Android；复杂多层动画/BlendShape/特殊材质生产 FBX；高并发/大文件压力；公开 Pages 线上回归；WorkBuddy 云端长期稳定性。SDK 仅已证明本机当前配置可真实列模型和完成一次两轮 Agent 请求，不承诺无授权依赖或服务 SLA。

前端 Gallery 已验证的 GLB/GLTF/OBJ/FBX 导入不代表后端互转。FBX 没有导出实现；WebP/JPEG 压缩不等于 GPU 压缩。静态站点只提供展示，不提供本地处理后端。原始历史问题记录可从交付 SHA 查阅。
