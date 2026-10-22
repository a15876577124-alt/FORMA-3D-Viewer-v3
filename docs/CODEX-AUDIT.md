# FORMA V5 — Codex 独立接管与技术审计

审计日期：2026-10-23（Asia/Shanghai）。范围：现有工程的安全接管、独立复现、必要修复和产品真实性审查。没有重建项目，没有升级第三方依赖，没有替换 WorkBuddy 云服务，没有部署或推送。

## 1. 结论与交接基线

**接管成功，工程可本地运行；桌面展厅具备展示基础，AI Studio 仍属于有真实处理能力的原型，尚不能认定为完整专业资产工作流。** 原有测试通过的结论得到复现，但测试覆盖不足以支持全部产品宣称。

| 核验项 | 独立结果 |
|---|---|
| 工作目录 | `D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3` |
| 接手分支 | `feature/forma-v5-experience` |
| 本地初始 HEAD | `eeb7b3231d329cd3a8b05a0a7d9648fd3e708177`，与指定交付 SHA 完全一致 |
| GitHub 交接分支 | GitHub API 独立读取到相同 SHA |
| GitHub main | `0b7c3d00ae47ac7fe385dbfa8dc8868f93d1e14a`；本轮未修改 |
| 初始未提交改动 | 只有 `docs/ARCHITECTURE.md` 的表格格式与空白变更；已备份，未覆盖、未纳入 Codex 提交 |
| 审计分支 | 从交付 HEAD 创建 `feature/codex-v5-audit`，没有 reset/rebase/重写原历史 |
| 未同步状态 | 初始没有额外未跟踪源码；有被忽略的工作区资产、产物和本地依赖。本轮新提交保留在本地审计分支，未推送 |
| 远程网络 | GitHub 插件可访问；Git HTTPS 曾遇 schannel 凭据错误，单次 `-c http.sslBackend=openssl` 成功；复核时直连另有 connection reset，API 再次确认 SHA。没有修改全局 Git/TLS 配置 |

按要求依次阅读了 CODEX-HANDOFF、TASK_STATE、README、CHANGELOG、KNOWN-ISSUES、ARCHITECTURE、PIPELINE、package.json。旧文档中“全站唯一 WebGL”“格式互转已完成”“移动端通过”等表述需要按本报告限定范围。

保护证据：`assets/raw/` 与 `assets/models/` 共 12 个文件、接手前工作区及发布库的 30 个文件，前后 SHA-256 全部一致。原有 ARCHITECTURE 文档字节一致。`backend/.env` 在本机不存在，没有创建或修改。仓库外 OBJ/MTL/PNG 仅用于读取测试。

## 2. 环境与测试证据

本机：Windows NT 10.0.26300.0，Node **24.22.0**，npm **11.19.1**，Edge **155.0.4283.62**。`npm ci --no-fund --no-audit` 按锁文件成功安装；`npm ls` 未发现缺失或 invalid 依赖。sharp 0.35.5 要求 Node >=20.9.0，已修正 package.json/package-lock 根节点原来错误的 >=18 声明。没有声称测试过全部 Node 版本。

### 基线与修复后

- 原始功能基线：**19/19 组通过，706 项报告检查**。为保护用户资产，在逐字节复制已跟踪工作文件的隔离副本中运行原始测试逻辑；没有修改断言或屏蔽失败。
- 审计修复后：**22/22 组通过，735 项报告检查**。包含新增 7 个 Node 回归用例、并发版本检查，以及纳入常规套件的真实 Before/After 与 FBX 贴图界面验收。这里统计的是各组报告项；7 个 Node 用例内有多个 assert，不将其假称为精确的 735 条底层断言。
- `npm run release:verify`：**83 个文件，30,100,215 字节**，静态依赖闭包完整；清单已重新生成。
- 正式 `FORMA.bat` 在隔离副本中真实执行，自定义前后端端口下首页及 `/api/health` 正常；自动打开浏览器仅在验收进程设置 `FORMA_NO_OPEN=1` 禁用。通过既有入口启动，未更换项目。测试结束只终止本次启动的进程树；未验收用户手动关闭控制台的全部行为。
- 另有 **9 项接管场景检查**：一键启动/前后端代理、真实导入、超过旧 8 MiB JSON 限制的模型导入、云模型服务 503 时本地 Studio 保持在线、Inspector 显示旦角真实 46,828 面、AI parsed 参数进入草稿、分割值 0 可保存、无未捕获页面异常等。

| 测试组 | 报告检查数 | 结果 |
|---|---:|---|
| vendor | 24 个文件 / 43 个源模块 | 通过，文件数不累加进检查总数 |
| vendorscan / assets / release | 10 / 200 / 16 | 全部通过 |
| pipeline / agent / audit | 50 / 36 / 7 | 全部通过 |
| ops / opparams / batch | 64 / 44 / 20 | 全部通过 |
| compare / fbxtex | 29 / 58 | 全部通过 |
| compare-ui / fbxtex-ui | 13 / 8 | 全部通过 |
| proxy / server / render | 5 / 7 / 56 | 全部通过 |
| ui / import / extended | 26 / 12 / 6 | 全部通过 |
| workspaces / layout | 21 / 47 | 全部通过；视觉缺陷仍见下文 |

### 真实渲染与资产

渲染器报告：`ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU, Direct3D11)`，WebGL2。没有使用 SwiftShader 替代硬件验收，没有关闭浏览器/GPU 沙盒。5/5 模型、56/56 渲染检查通过；渲染组 console errors、warnings、pageErrors 都为 0。两轮循环后资源计数稳定在 geometries=24、textures=14、programs=15；这仅证明该切换场景有界，不代表全路由长期无泄漏。

| 资产 | 顶点 | 三角形 |
|---|---:|---:|
| 生角 sheng | 26,951 | 47,512 |
| 旦角 dan | 28,662 | 46,828 |
| 净角红谱 | 28,472 | 49,178 |
| 净角黄谱 | 27,361 | 47,852 |
| 净角白谱 | 26,720 | 46,939 |

Gallery 导入组覆盖真实仓库外 OBJ+MTL+PNG、GLB、外部 GLTF+BIN+PNG、ASCII FBX、二进制带动画 FBX。12/12 项通过，本机外部素材存在，未跳过相关检查。导入负例产生的两条控制台错误是预期错误路径，不与渲染组“零错误”混淆。FBX 专项 58 项及界面 8 项通过，PNG 提取结果可真实下载。

可入库的摘要见 [audit/2026-10-23-results.json](audit/2026-10-23-results.json)。完整日志、失败复现和截图在本地 `test-out/`，不会随 Git 推送；精确路径记录在摘要中。

## 3. 已修复的问题及验证

| 编号 / 级别 | 根因与修复 | 验证 |
|---|---|---|
| F01 P0 资产保护 | 原 batch 测试使用真实资产固定 ID，重写元数据、删除资产目录，并删除发布库的第一项。统一 runner 现在复制已跟踪工作文件到独立工程，依赖通过 junction 复用；batch 采用随机 ID，仅清理本次创建文件 | batch 20 项、完整套件、保护哈希全部一致 |
| F02 P0 Agent dryRun | 工具派发未 await 异步 handler，错误无法正确捕获；dryRun 没有传到真实算子；export 错标为只读 | await 派发，mutating 工具在 dryRun 返回 wouldApply；工具失败结构化回灌。6 个最初全部失败的回归用例修复后通过，原 agent 36 项通过 |
| F03 P0 文件边界 | Agent 工具 assetId 没有验证；分析器 GLTF/FBX 外部 URI 可越出模型目录；静态服务器能直接读取 backend/隐藏文件/依赖 | ID 校验、safeResolveExisting、真实路径校验及私有目录屏蔽；临时 PNG 证明修复前越界读取 103 字节，修复后拒读且同目录 PNG 正常 |
| F04 P0 版本覆盖 | nextVersionDir 检查目录存在后才 await 分析并建目录，两个请求均分配 v3 | mkdir 排他创建，在首次 await 前保留版本；修复前并发回归失败，修复后 ops 64/64；HTTP 并发实测分别生成 v2/v3 |
| F05 P0 打包删除 | `--pack=<任意目录>` 原先先执行 recursive rm，可能删除 raw 或外部目录 | 仅允许 dist / test-out 下的新目录，已有目录直接拒绝；不再递归清理；静态包 16 项通过 |
| F06 P1 可复现性 | Windows core.autocrlf 对 vendor 与 ASCII FBX 的字节转换破坏哈希或格式；原打包测试输出假定未入库目录存在 | `.gitattributes` 固定 vendor/FBX 字节；快照按工作文件字节复制；截图输出使用测试目录。原 Git blob 与本机 vendor 字节一致，问题来自归档/换行转换，不是提交中 vendor 损坏；修复后 git archive 的 33 个 vendor/FBX 文件逐字节一致 |
| F07 P1 启动与报告 | npm start 只启动前端；自定义后端端口没传到前端代理；模型列表失败把本地服务误判离线；分析报告包装层读取错误 | start 接入既有 launcher，透传代理地址；models 10 秒超时及独立降级；读取 report 字段；真实 batch 启动和 Edge 场景验证 |
| F08 P1 参数/状态 | AI 日志字段 parsed 与前端 arguments 不一致；错误回合仍显示完成；比较滑条 0 被 `||0.5` 吞掉 | 兼容 parsed，显示已有 log.errors，保留 0 且夹取合法范围；接管场景与 UI 回归验证 |
| F09 P1 HTTP | 非法 percent URL 导致后端解码异常；导入接口 JSON 8 MiB 小于声明的模型限额 | 非法 URL 返回 400 且健康检查正常；导入按 base64 膨胀计算请求上限，其他 JSON 仍 8 MiB；超过旧限额的真实模型导入成功。未做 256 MiB 峰值压力验收 |
| F10 P1 测试真实性 | compare/fbxtex UI 未纳入常规套件，使用禁用沙盒/软件渲染配置；比较读取早于加载完成；程序化参数被旧控件覆盖 | 接入共享安全 Edge 启动器，等待两模型挂载，从真实参数控件输入 ratio=0.4 并验证执行结果；两组加入 npm test |

Agent dryRun 仍会写审计日志，这是既有明确设计；已阻止的是模型处理和导出产物写入。失败的版本任务可能保留空目录，这样不会重用已分配版本；后续应增加失败状态记录。

## 4. 真实完成度（按可验证工作流评估）

| 领域 | 当前真实能力 | 尚未达到的标准 |
|---|---|---|
| 工程架构 | 原生 ESM、路由、viewer、Studio core/UI、算子/策略/验证分层存在，能直接接着开发 | 前后端资产状态和视口状态分裂；API 结构依靠隐式约定；全局 DOM 和手写事件难以长期维护。无需为此立即重写框架 |
| Three.js | 五模型、灯光/材质/后期、相机、动画、LRU 缓存及基础资源释放真实可用 | 场景级尺度/变换、导入后法线一致性、压缩扩展支持、全部路由 GPU 生命周期尚不完整 |
| Gallery | 桌面视觉风格统一，模型纹样可辨，选型/截图/分享 hash 路由可用 | 移动端裁切；大图传输和首屏预算不足；需美术基准图及触控验收 |
| AI Studio | 可调整布局、后端报告、手动算子、确认、批处理、处理结果实际存在 | 资产选择与视口脱节，Material Lab 修改未进入资产版本/导出，尚不是可靠专业闭环 |
| 资产导入 | Gallery 的文件包导入验证较充分，FBX 内嵌/外部/缺失三态和提取可用 | Studio 逐文件上传，不能把 MTL/纹理/BIN 组成一项后端资产；复杂生产 FBX 未验证 |
| AI Agent | 真实模型、native tool calls、多轮、日志、错误回灌可用，离线回放 36 项 | 多步 run_op 每次仍从原始文件开始；人工确认后续跑、严格超时/取消、成功条件验证不完整 |
| 资产处理 | 已装 glTF-Transform/meshoptimizer/sharp 的减面、焊接、缩图等真实执行 | 格式链路、中文命名、场景变换、压缩扩展和视觉质量门控缺口较大；WebP/JPEG 文件变小不等于 GPU 纹理压缩 |
| Comparison Lab | 同场景双模型、反向裁剪、面数真实不同、退出释放通过 | 独立归一化掩盖尺度变化，裁剪按世界 X 非屏幕竖线；缺少任选版本与误差热图 |
| UI/UX | 桌面拖拽、键盘调整、折叠与刷新持久化均通过 | Inspector 被通用灯光控件挤到折叠区下方；通知叠加挡模型；手机工具栏不可读 |
| 工程可靠性 | 锁文件安装、隔离测试、静态闭包和独立打包运行可复现 | 缺少 CI 跨环境执行、真实手机、长任务取消/断点恢复、限流和长期压力测试 |

## 5. P0 / P1 / P2 问题清单

分级：P0=可能破坏资产或严重失守的接管阻断；P1=主要工作流或公开演示前应修复；P2=质量、性能与维护改进。代码审查推断与实测复现明确区分。

### P0

本轮确认的 F01–F05 已处理。没有据此宣称项目不存在其他严重漏洞；凭据扫描和压力测试有边界。

### P1（未关闭）

| ID | 问题、证据与影响 | 下一步验收 |
|---|---|---|
| P1-01 资产身份 | **实测**选择 audit-dan，Inspector=46,828 面，`currentExhibit=sheng`，视口仍是生角。`src/studio/core.js:selectAsset` 未加载所选模型，panes 的材质操作直接改 viewer.modelRoot | 选资产、视口、Inspector、编辑、版本、导出统一同一 assetId/version；多次切换无异步旧结果覆盖 |
| P1-02 导出链路 | **实测** GLB→GLTF API 返回 500 `bad magic 0x6373227b`；runPipeline 后验沿用输入 meta.format。convert 提前 loadGLB 使 GLTF→GLB 分支不可达；GLTF 导出还删除必需 byteLength。OBJ 多 primitive 索引从 1 重置、场景变换/材质信息不完整 | 明确支持矩阵，GLB↔GLTF 及 OBJ 场景夹具往返，官方 validator 零 error，纹理全打包；不能只断言文件存在 |
| P1-03 编辑与版本 | **代码审查** Material Lab 只改运行时材质；exportAsset 的 version 参数未参与源文件选择；publishAsset 只复制 model 文件，不复制 GLTF/OBJ 依赖，也不强制 verify 成功 | 处理版本可准确导出；发布包含完整依赖且拒绝失败版本；发布不可默默覆盖已有库文件 |
| P1-04 导入资源包 | **代码审查 + API 结构** Studio toolbar 对每个 file 单独 importFile，后端只收一份 base64，不能保留多文件依赖关系；GLB preflight 拒绝所有 extensionsRequired，包括本项目量化产物所需扩展 | 文件包收集/路径重映射；KHR_mesh_quantization 支持及能力清单；缺失依赖有可操作提示 |
| P1-05 视觉后验 | **截图检查**减面后的对比视图出现明显面片/反光破碎，而后验显示通过；尚未将显示问题单独归因于减面算法；比较两边独立 normalizeModel，世界 X 裁剪旋转后不等于屏幕左右 | 固定相机/光照/材质/共同变换；法线/UV/轮廓误差检查与人审；三角形减少不等于质量合格 |
| P1-06 移动端 | **实测**390px Gallery 右栏 left≈350、right≈693，内容被视口裁掉，但 document.scrollWidth=390，因此旧“无横向溢出”断言误报通过；Studio 工具文字被压成竖排 | 320/390/768 下逐控件可见/可点/不遮挡；实际 iOS/Android 触控与旋转验收 |
| P1-07 Agent 工作流 | **代码审查**多次 run_op 不串接上次版本；工具确认错误未转为可恢复的审批状态；墙钟在 await 后检查，不能中断挂起请求；finish 可宣称完成而没有强制 verify pass | 每步明确输入输出版本、等待确认/继续、AbortSignal、失败分类重试、机器可验证成功条件；至少一条真实多步骤资产闭环 |
| P1-08 请求来源 | **HTTP 探针实测**不受信 Origin + text/plain POST dryRun 返回 200，证明 CORS 仅限制浏览器读响应、没有拒绝执行请求；目前也缺少 Host 校验。未实际驱动恶意网页执行写操作 | 后端检查可信 Origin/Host、状态变更请求类型或会话令牌，连同自定义端口代理兼容测试。浏览器私网请求限制不能替代服务端控制 |
| P1-09 资源预算 | **代码审查**代理累计 Buffer.concat、无代理层体积限制，解析/部分算子占主线程；大模型可触发内存峰值或阻塞，256 MiB 上限尚未负载验证 | 流式代理+统一大小限制、任务队列/worker、超时取消、真实峰值内存与长任务测试 |
| P1-10 数据准确性 | **代码审查**analyze 检查 NORMAL/TEXCOORD_0 用 truthiness，accessor 索引 0 会被误判；bounds 多按 mesh 本地数据，忽略节点变换；verify 的切片哈希未充分覆盖 stride/sparse；glbWrite 拒绝合法中文 JSON | 含索引 0、非单位变换、交错/sparse、中文命名的 fixtures；官方验证与渲染双验证 |
| P1-11 开发依赖 | **npm audit 实测**7 项 high 级受影响包，均在 puppeteer-core 开发依赖链；生产依赖审计 0。npm 建议跨主版本升级，不能直接 force fix | 独立升级分支验证 Edge/CDP/Node、全部浏览器回归、lockfile 与许可记录；本轮未升级 |

### P2（未关闭）

| ID | 发现 | 建议 |
|---|---|---|
| P2-01 GPU 生命周期 | Gallery/Studio 共用 viewer，但作品详情 miniViewer 会另建 WebGL；路由缓存最多 8 项；PMREM 产物目标没有显式保留/统一释放，主 viewer 隐藏时仍 RAF | 全路由计数/离屏暂停/统一 dispose；先测后优化，不以“两轮模型切换稳定”推论全部无泄漏 |
| P2-02 版本与批量 UX | 线性版本、缺任选两版/回滚 UI，批量没有取消或逐资产方案 | 在可靠版本语义基础上补选版、任务状态、重试及取消 |
| P2-03 界面层级 | 灯光区常驻占据 Inspector 大部分高度，处理面板与通知抢视口；长名称截断，资产库缺缩略图 | 基于任务重排信息层级、收敛通知、加强焦点与可访问名称；保留现有布局持久化 |
| P2-04 工程收尾 | launcher 端口占用仅提示，前端成功信息依赖固定等待；其他旧辅助脚本仍有硬编码 Edge/旧选择器；npm ao 指向缺失脚本 | 身份化健康检查、明确退出码、清理失效命令与可复现脚本清单，不批量重构 |
| P2-05 质量预算 | 纹理/文件传输预算、手机帧率、作品详情并发 GPU、长期内存未形成回归门槛 | 建性能基准，区分文件字节、解码像素、显存占用和 GPU 时间 |

## 6. WorkBuddy SDK 可移植性

安装版本：`@tencent-ai/workbuddy-cloud-sdk@0.1.4-dev.ca27990.202610161713`。本机无需 WorkBuddy 桌面运行即可安装、列模型和调用 Agent。探针清除子进程所有 `WORKBUDDY_*` 环境变量，`backend/.env` 不存在，使用项目既有 publicConfig：列出 **34** 个模型，默认 `deepseek-v4-pro` 可用；真实请求 **2 轮**，`analyze_asset` 与 `finish` 各一次，**10** 个工具流片段，errors=[]，耗时 **5,545ms**。输入仅为专门创建的合成资产报告，未向云端上传用户模型内容。

这证明当前应用配置可在 Codex 本地使用，不证明服务无需授权或长期可用。SDK 的应用级 publishableKey 是 `wbpk_` 类型，使用 `x-wb-webapp-access-key` 请求头，LLM 路径是 `/.cloud/llm`；用户 session token 为可选 Bearer。此处不输出任何 key 值，也未把新凭据写入代码。账户额度、应用授权和服务端策略仍依赖 WorkBuddy 云应用。

现有工具/消息结构接近 OpenAI chat completions，但并没有通用 baseURL/apiKey 适配器。建议后续在 `backend/llm.mjs` 和 `agent/llmStream.mjs` 限定边界增加一个传输适配层：保留默认 WorkBuddy 实现；通用实现仅在后端读取环境变量，支持模型列表、流式 content/tool_calls/usage、AbortSignal、错误分类。复用既有 Agent 工具 schema 和回放用例，增加分片工具参数/超时/429/未知模型契约测试。不要把整个 Agent 改成另一个框架，也不要移除已实测可用服务。

已跟踪非 vendor 文本 155 文件的常见私钥/OpenAI/GitHub/AWS token 特征扫描无命中、无已跟踪 `.env`。这不是历史全量秘密扫描或完整渗透测试。生产依赖公告为零也不等于应用安全问题已全部解决。

## 7. 成熟开源技术与下一阶段

资料核对日期同审计日期；只评估，未安装新依赖或拷贝新代码。

| 候选 | 适用价值 | 整合与许可边界 |
|---|---|---|
| [glTF Transform](https://gltf-transform.dev/modules/functions/functions/simplify) + [meshoptimizer](https://github.com/zeux/meshoptimizer) | 优先用项目已安装版本收敛 GLB/GLTF 读写、压缩和误差约束；simplify 支持 ratio/error，可能因误差先停止 | MIT；先修复版本/输入输出语义，用固定 fixtures 比较数值和视觉，不仅追求减面比例 |
| [Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) | 补上规范、accessor、buffer、扩展有效性门槛，直接针对当前 byteLength/后验漏检 | Apache-2.0；作为补充验证，不能代替视觉判断 |
| [ufbx](https://github.com/ufbx/ufbx) | 评估复杂 FBX 的解析后备路径及对照工具，减少自研节点解析维护面 | 可选 MIT 或 Public Domain；初期仅验证 Windows CLI/WASM 接口、内嵌纹理/骨骼/动画/单位，不能据库名承诺全格式无损 |
| [KTX-Software](https://github.com/KhronosGroup/KTX-Software) + Three KTX2Loader | 评估 KTX2/Basis，区分 GPU 压缩与当前 WebP/JPEG 文件压缩 | 项目独有代码通常 Apache-2.0，依赖许可需逐项核对；[LICENSE](https://github.com/KhronosGroup/KTX-Software/blob/main/LICENSE.md) 特别列出 etcdec 非开源组件，可按构建选项排除；必须同时交付离线 transcoder 和兼容测试 |

下一阶段可在现有审计分支之后自主开展的小步迭代，按以下顺序验收：

1. **资产身份一致性与真实导出**：先修 P1-01/02/03；验收导入→选中→编辑/处理→选版本→导出→重新导入，模型身份、hash、统计、贴图一致。优先可靠 GLB，再做 GLTF 依赖包；不声称 OBJ/FBX 全量互转。
2. **移动端与可见性**：修 P1-06，补控件边界和触控测试，桌面保留现有工作区体验。无需推翻视觉风格。
3. **资产后验与视觉标准**：P1-04/05/10，补 validator/扩展白名单、中文与场景 fixtures、固定视角前后图；原始资产只读，优化始终输出新版本。
4. **Agent 可恢复处理**：P1-07 加明确步骤/版本/确认状态和传输契约；先维持 WorkBuddy，通用模型适配按兼容测试接入。
5. **本地请求安全与任务预算**：P1-08/09，加来源拒绝和可取消处理；Puppeteer 单独兼容升级，不执行 npm audit fix --force。

本轮不启动大型架构重构。真机移动端、复杂生产 FBX、长时间/大模型压力、公开 Pages 线上回归及云服务长期稳定性均未完成验收，不能据当前测试数字宣称已完成。
