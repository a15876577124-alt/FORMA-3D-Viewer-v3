# FORMA V5 资产生产闭环修复记录

审计备份已推送：feature/codex-v5-audit，86321954a56cbaf47682660ae7852fead89d7e4c。
ARCHITECTURE.md 原有格式修改保持未提交，SHA256 177CE7069926DAE58FA57FDE4CA2CAAD0C775C0C5198AC4F0A8C06318F21AA42。

## 阶段 1：资产与版本身份

根因：selectAsset 仅更新 ID，未装载模型；分析请求可乱序覆盖；版本树无法选择版本。
修复：版本 0 明确表示 Original；服务端统一解析实际源文件，客户端用请求序号丢弃过期结果。
所选模型、Inspector、材质目标、处理与导出使用同一资产和版本。处理后选择真实产物。
切换时退出对比并隐藏旧模型；模型未就绪时阻止处理与导出。Gallery 与 Studio 共用视口身份回调。
验证：隔离工作区中的 Windows Edge 测试覆盖生/旦切换、快速交叉选择、实际处理、版本回切与报告一致性。
后续阶段继续修复转换、发布依赖包、材质保存、Agent 和视觉问题；此记录不等同全部目标已完成。

阶段 1 实测：workflow 8/8（suite-2026-10-23T07-07-58-484Z），compare-ui 13/13（07-12-47-821Z），安全回归 7/7（07-12-58-058Z）。静态闭包 83 文件通过。

## 阶段 2：真实格式与资源包
根因：转换器先按 GLB 读取所有输入、输出报告使用输入格式、URL GLTF 预检错误、GLTF byteLength 被删除。改用现有 glTF Transform；安全读取包内依赖，保存 UTF-8；OBJ 修复全局索引、节点变换、MTL 和基色纹理。
新依赖仅 gltf-validator 2.0.0-dev.3.10（Apache-2.0），Node 24 实测。导出 GLB/GLTF 加官方格式校验，仍做实际 Edge 重载。
实测：formats 3/3，workflow 13/13（suite-2026-10-23T07-18-49-568Z），ops 64/64，pipeline 50/50，audit 7/7。FBX 转可处理版本与完整下载包在后续闭环阶段实现。

## 阶段 3：版本、材质与资源发布
新增 version.json：baseVersion、kind、running/complete/failed 状态；每次处理独立输出，失败版本不复用。Material Lab 保存指定材质为 Edited 版本，预览/重置与真实保存分开；环境反射仅预览。纹理和几何后验检查通过。
导出下载完整 ZIP（复用 Three.js 随附 MIT fflate），发布 GLTF 连同全部依赖到独立目录；仅后验通过版本可发布。版本树选择真实两端对比。
实测 workflow 23/23（suite-2026-10-23T07-23-42-993Z），formats 4/4（含并发），batch 20/20。没有新增 ZIP 依赖。

## 阶段 4：真实模型端到端
新增许可明确的 CC0 Avocado 与 ufbx MIT Blender 内嵌贴图 FBX；来源、SHA 和许可证位于 test-assets/licensed。复用已锁定 Three.js 的 GLTFExporter，未引入 ufbx 运行时。
修复带真实材质绑定的 FBX 在 Node 分析时调用 DOM ImageLoader 的 500。浏览器等待纹理载入后才转换，保留原始 FBX，输出 Converted GLB 版本；缺失贴图拒绝转换。
真实点击验收揭示 DOM 工厂把 disabled=false 当作 HTML 禁用属性；已修复布尔属性，工具栏按钮恢复可用。
workflow 34/34（suite-2026-10-23T07-36-36-155Z）：上传、分析、绑定纹理、生成 GLB、算子、后验、对比、导出及重新导入。FBX 58/58；UI 26/26。
失败证据：12 面 FBX 使用 simplify ratio=0.7/error=0.01 时保持 12 面，后验失败，未选择失败版本；记录于 suite-2026-10-23T07-35-03-682Z。改用 weld 后顶点真实减少且面数不变。Avocado 减面真实生效。专有 FBX 材质、约束及全部动画兼容性不在本次通过声明内。

## 阶段 5 — Agent 稳定性（2026-10-23）

根因：每个工具调用都从 Original 开始；确认门信息在工具派发中丢失；墙钟限制只在请求结束后检查。

- 每个 Agent 任务独立追踪通过后验的版本，分析、处理、验证和导出读取该版本。显式导出版本受到尊重，禁止越过当前资产范围。
- 风险操作保留真实 LLM 工具调用及对话，确认后从该调用恢复；磁盘独占标记防止重复恢复；确认绑定资产、参数与输入版本。
- LLM 等待有超时，网络错误写入失败日志；可取消运行。正在执行的算子会完成当前调用并在安全边界停止，失败版本保留，后续步骤不继续。
- dryRun 只允许写执行日志，不能调用修改资产的工具。并发任务各自保留版本链。
- Agent 日志面板可输入目标、仅分析、执行、确认继续、取消。结果加载完成后更新当前资产视图。
- 故障注入测试明确使用 fake LLM；独立真实 Edge 验收使用 deepseek-v4-pro 原生工具调用，6 项通过，真实 weld → dedup → verify，视口与最终版本一致。

证据：`test-out/suite-2026-10-23T08-05-11-517Z/agent-live/`（原始工具调用日志和截图）；4 个稳定性测试通过；旧 Agent 36 项、Pipeline 50 项通过。首次真实验收发现并修复日志与模型加载时序；记录保留在 08-04-03-838Z。单组 Agent 测试发现隔离目录缺少 test-out，已修复 runner 初始化，未修改断言。

限制：取消不是强制终止正在执行的同步 CPU 算子；网络失败不会自动重放可能写入的操作。服务重启会让旧确认 token 失效，再次恢复时会重新要求确认。


## 阶段 6：界面、渲染与可靠性

Gallery 390px Inspector 定位超出屏幕，Studio 固定高度工具栏被压缩。改为实际面板定位、可换行工具组、保留文字、移动抽屉。资源树前置，原作品列表与导入入口继续保留，作品选择和拖放接入统一后端资产；已发布条目携带真实 sourceId/version。Lab 初始化只展示当前页签，处理完成清除旧确认提示。

Before/After 使用 Original 的同一摆放变换，不再各自归一化隐藏尺度变化。裁剪面通过相机与屏幕分割线，旋转后仍对齐；不裁剪影子，不修改作者材质。新增同机位 before.png / after.png。五轮对比后 GPU geometry/texture 回收验证，无新增效果掩盖模型细节。

主 Viewer 在隐藏/后台不继续渲染；释放 PMREM 烘焙临时资源；miniViewer 释放环境目标且拒绝挂载已销毁后的迟到模型。对比部分加载失败释放另一端，包围盒工具随模型切换释放，缓存被全部 pin 时不再无限循环。

全量回归捕获并修复：分享链接竞争导致 ready Promise 永远为 false；单组 Agent 临时目录初始化；比较测试在全套运行时错误选中其它组资产，改为明确选择该测试原本规定的 compare-probe（没有降低断言）。静态包测试使用随机端口，失败时输出页面诊断。未知/只读工具错误继续回灌 LLM，写入工具失败停止，保留第一轮错误恢复契约。

## 开源技术决策

- 继续复用 glTF Transform + meshoptimizer、Three.js 0.186.1、Sharp；未升级它们或替换正常运行的 WorkBuddy 服务。
- 新增 [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) 2.0.0-dev.3.10（Apache-2.0），实际 Node 24 + Edge 往返兼容验证。用于格式检查，不能代替视觉/语义检查。
- [glTF Transform simplify](https://gltf-transform.dev/modules/functions/functions/simplify) 的 error/拓扑约束可能使目标减面比例不可达；无收益失败样本被保留，没有放宽错误阈值来制造结果。
- [ufbx](https://github.com/ufbx/ufbx) 提供嵌入纹理、骨骼和厂商材质等能力，MIT 可选；本轮仅使用其带许可测试资产，未添加运行时。下一步需以当前 Three FBX 的具体失败样本评估 Windows/WASM 集成。
- [KTX-Software](https://github.com/KhronosGroup/KTX-Software) 留作 GPU 纹理压缩候选；需要一起验证编码器、Three KTX2 解码器、移动设备格式和对应组件许可证后再引入，本轮未宣称具备此能力。

## 操作演示路径

1. npm start → AI Studio → 导入 test-assets/licensed/Avocado.glb（或 blender-embedded.fbx）。
2. 确认资源树、名称、Inspector、视口一致。FBX 先“转为 GLB 版本”，阅读风险后再次确认。
3. Material Lab 选择材质，预览/重置；保存为新版本并重新加载。Original 保持只读。
4. 配置实际算子：Avocado 可用 simplify ratio=0.7/error=0.01；12 面 FBX 用 weld epsilon=0.000001，后验检查顶点减少/面数不变。
5. 版本区选择 Before 与 After，旋转/滑动比较；导出选定版本，GLTF 下载 ZIP，解包后选择模型与全部依赖重新导入。
6. 发布通过验证的版本到本地资产库；点击条目加载。这里的“发布”没有部署到公共网站。
7. Agent 日志输入任务，选择“仅分析”或“执行 AI 任务”；风险出现后确认具体工具调用；结果和失败都写实际日志。
