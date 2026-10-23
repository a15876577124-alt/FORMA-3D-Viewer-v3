# FORMA V5 第三阶段品质提升与 RC1 验收

2026-10-23。开发位于 `FORMA-3D-Viewer-v3-quality` / `feature/codex-v5-quality`，从第二阶段 `7f133b9885466a1a1f528ce06c787775da096122` 继续。完整运行代码为 `d20d1d231bf377b282cc7bdfb68c82ac7918b719`；最终证据文档单独提交。原工程、原始模型、私人凭据和另一工作区的 Logo 设计未修改。

本轮已完成联系与品牌接口、首屏和窄屏排版、材质编辑状态、真实 FBX 通道恢复、可替换 AI 服务、请求边界与内存改进，并形成可独立运行的 Gallery 候选包。它不是所有格式和设备的无限制兼容承诺，也未公开部署。机器结果见 [phase3-results.json](audit/phase3-results.json)，截图出处和 SHA256 见 [evidence/index.json](evidence/phase3/index.json)。

## 优化任务与完成证据

| 优先级 | 实际问题与根因 | 实施范围与收益 | 验收与边界 |
|---|---|---|---|
| Q1 | 首页模型与入口重叠，减少动态效果时停在侧面，部分文字 token 未定义 | 保留现有黑金风格，调整首屏分栏、固定正面、390px 模型留位与文字对比 | 真实 Edge 前后截图；没有改模型原文件 |
| Q1 | 已有联系模块，但触控目标偏小、底部入口无法直达；品牌 SVG 分散 | 复用 contact.js，单页单模块，40px 复制按钮；brand.js 统一配置和文本回退 | 两页桌面/390px 实际 mailto、剪贴板；Gallery/Studio 无联系模块 |
| Q1 | 空 Studio 仍显示此前 Gallery 模型，容易误认处理对象 | 明确空状态和导入/选择入口 | 实际进入工作区检查；选中后保留统一 assetId/version/path |
| Q2 | 材质没有可靠的未保存状态与局部历史，导航会丢预览 | 当前材质 50 步 Undo/Redo，拖动合并，切换资产/版本/路由保护；保存为 Edited 新版本 | 取消切换、撤销、重做、保存、重新读取、导出再导入 |
| Q2 | 通用“修复”强制改材质；纹理面板缺少真实预览 | 保真整理只做 dedup/prune；显示预设参数与风险；真实纹理和 R/G/B 通道缩略图 | 无收益不伪报优化；环境反射明确仅预览 |
| Q2 | 作品详情通过名前缀寻找私人后端报告，可能取错对象或显示假离线 | 直接统计本页载入的公开模型 | 生角 26,951 顶点 / 47,512 三角形 / 2048px 贴图，无后端也准确 |
| Q3 | Blender FBX 的 roughness/metallic/weight 未映射，5 源图只有 2 张有效输出 | 核对实际连接、Video ID 和导出器语义，打包为 3 张绑定图像，保存逐通道决定 | 五通道逐像素校验、同机位、导出再载入；不宣称着色无损 |
| Q3 | Agent 直接绑定 WorkBuddy，缺少服务状态与工具能力核验 | Provider 接口、固定任务配置、原生工具测试、流中断/超时处理与脱敏 | 既有真实服务通过；外部兼容服务只有协议验证，等待凭据 |
| Q4 | 仅有 CORS 头，代理整包缓冲，bounds 忽略节点/stride/sparse | 执行前 Host/Origin 控制、流式代理、正文/图像/几何预算，真实默认场景世界边界 | 对抗请求与复杂语义样本；动态变形、worker 隔离仍未完成 |
| Q4 | 旧 Puppeteer 传递依赖有 7 项 high 告警 | 开发依赖精确升级 25.16.0，Node >=22.12 | 干净安装、Edge/CDP、全依赖和生产 audit 均 0；生产库未升级 |
| Q5 | 静态包缺本地预览依赖与完整许可声明 | 纳入 serve/local-http 和 3 份原始许可证，提供独立包 | 五件模型逐个加载、19 项包验收，不包含后端/私人工作区 |

## 实际画面

这些是浏览器原始截图，没有生成图、修图或合成界面。390px 是桌面 Edge 模拟，尚非手机真机验收。

| 页面 | 基线 | 当前 |
|---|---|---|
| 首页 | [调整前](evidence/phase3/before-home-desktop.png) | [桌面](evidence/phase3/home-desktop.png) / [390px](evidence/phase3/home-390.png) |
| Gallery 生角 | [之前](evidence/phase3/before-gallery-sheng.png) | [当前](evidence/phase3/gallery-sheng.png) |
| Gallery 旦角 | [之前](evidence/phase3/before-gallery-dan.png) | [当前](evidence/phase3/gallery-dan.png) |
| 空 Studio | [之前残留 Gallery 模型](evidence/phase3/before-studio-desktop.png) | [明确空状态](evidence/phase3/studio-desktop.png) |
| 专业操作 | 第二阶段保存闭环保留 | [材质草稿与撤销](evidence/phase3/material-draft.png) / [实际纹理通道](evidence/phase3/texture-channels.png) / [390px 工具](evidence/phase3/comparison-studio-390-tools.png) |

Gallery 沿用已有展示构图、可调布光与资产原始细节，没有重做整体风格，也没有把展示光照优化描述为模型修复。五件模型当前正面与头饰细节：

| 展品 | 全身 | 细节 |
|---|---|---|
| 生角 | [正面](evidence/phase3/gallery-sheng.png) | [头饰/面部](evidence/phase3/detail-sheng.png) |
| 旦角 | [正面](evidence/phase3/gallery-dan.png) | [头饰/面部](evidence/phase3/detail-dan.png) |
| 净角·红谱 | [正面](evidence/phase3/gallery-jing-red.png) | [头饰/面部](evidence/phase3/detail-jing-red.png) |
| 净角·黄谱 | [正面](evidence/phase3/gallery-jing-yellow.png) | [头饰/面部](evidence/phase3/detail-jing-yellow.png) |
| 净角·白谱 | [正面](evidence/phase3/gallery-jing-white.png) | [头饰/面部](evidence/phase3/detail-jing-white.png) |

本机 `test-out/performance-phase3-before/` 与 `performance-phase3-after/` 另存五件固定侧角、近景和性能原始数据。画面中仍能观察到原资产法线/材质细节问题；没有用过曝、模糊或静默覆盖原件掩盖。

## 联系方式和 Logo 交接

首页末尾使用克制的联系条，公共页脚只有直达它的链接；作品详情末尾保留一处简洁联系。两个邮箱均常显，支持 mailto 与复制。没有编造其他联系方式，也没有在 Gallery/Studio 占用工作空间。

- 首页：[桌面](evidence/phase3/home-contact-desktop.png)、[390px](evidence/phase3/home-contact-390.png)。
- 作品详情：[桌面](evidence/phase3/work-contact-desktop.png)、[390px](evidence/phase3/work-contact-390.png)。
- [导航品牌预留区](evidence/phase3/brand-navigation.png)。这是原有标识，不是附件中的新 Logo。

品牌组件在 `src/ui/brand.js`，通过 `BRAND.image`、`BRAND.favicon`、`lockup` 配置；导航、页脚与工作区共用。图片缺失时显示 FORMA 文字；优先 SVG，也接受透明 PNG/WebP。`setBrandState` / `data-brand-state` / `forma:brand-state` 是未来动画接口，含减少动态效果信息，不阻塞导航或模型加载。

最终接入：用户提供批准的文件或 SHA → 检查来源与 SVG 内容 → 放入 `assets/brand/` → 修改单一 BRAND 配置 → 登记静态资源 → 运行 quality/layout/release 并复核桌面/390px → 单独提交。不要自动合并设计分支。参数与冲突文件见 [LOGO-INTEGRATION.md](LOGO-INTEGRATION.md)。当前未向任何 Logo 设计目录写文件。

## 专业工作流复现

在本地完整版 `npm ci` 后 `npm start`，进入 Studio：

1. 导入 `test-assets/licensed/Avocado.glb`（CC0）或 `blender-embedded.fbx`（ufbx MIT 样本），确认当前资产、Original 版本、报告和视口一致。
2. 在 Asset Inspector 查看实际几何和贴图；Texture Lab 查看真实图像。FBX 选择“转为 GLB 版本”，阅读通道和风险提示，再确认生成 Converted 版本。
3. 在 Material Lab 修改参数，观察“未保存材质”；撤销、重做或重置仅影响当前预览。保存生成 Edited 版本，重新读取后参数一致。环境反射不作为导出材质参数。
4. 选择保真整理/Web 展示/轻量预览/自定义，检查真实参数后执行。输入是选中版本，输出新版本；失败保留失败状态。
5. 选择两个真实版本比较。导出指定版本 GLB，或含 GLTF、buffer、纹理的 ZIP，再次导入检查材质、纹理与几何。
6. “加入展厅”只生成本地发布包，不是部署公共网站。再次点击该条目选择其准确资产版本。

真实浏览器流程 `node tests/run.mjs --only=workflow` 完成 **38 项**检查；包括快速资产切换、GLB→多文件 GLTF→GLB、材质保存、ZIP 下载、发布再载入、Avocado/FBX 实际处理与重导入。证据：[重新导入](evidence/phase3/workflow-roundtrip.png)、[材质版本比较](evidence/phase3/workflow-material-comparison.png)、[同机位 Before](evidence/phase3/comparison-before.png) / [After](evidence/phase3/comparison-after.png)。对比采用许可 Avocado，682→477 三角形是有损减面，不能据此声称艺术细节无损。

## FBX 逐通道结果

失败样本为 Blender 2.93.1 静态嵌入贴图 FBX，原文件 SHA256 在 [许可记录](../test-assets/licensed/README.md)。适配仅对已核实 Blender 2.93.x 连接实施，不以文件名猜测材质。当前 **5 张源图 → 3 张真正绑定的输出图**，5 个语义通道在 16,384 个像素上逐字节相等，导出后的 GLB 再次校验仍相等。

| 源属性 | 输出位置 | 处理与限制 |
|---|---|---|
| DiffuseColor | baseColor RGB | 通道打包，保留源 RGB |
| TransparencyFactor / weight | baseColor A | 该 Blender 导出器的 alpha 连接，保留数据；不套用其他厂商的透明度反转规则 |
| ShininessExponent / roughness | metallicRoughness G | 源 R 逐字节复制到 G，无 gamma 转换 |
| ReflectionFactor / metallic | metallicRoughness B | 源 R 逐字节复制到 B |
| EmissiveColor | emissive RGB | 像素保留，着色标记 approximate；强度/Phong/PBR 不能保证一致 |

样本没有独立法线贴图，不将不存在的通道算作通过。未知导出器、非默认 UV 变换、同名材质歧义、缺少资源等会报告不支持/缺失；部分通道不可映射时保留已有基色和 MR 绑定。源材质、源图像、输出通道、状态与风险见 [fbx-channels.json](evidence/phase3/fbx-channels.json)。[原 FBX](evidence/phase3/fbx-before.png) 与 [转换后](evidence/phase3/fbx-after.png) 固定同机位，画面仍有着色差异，不能称为原创作软件渲染无损。

## AI 服务的实际验证

默认 WorkBuddy Provider 保留。兼容 Provider 的地址、密钥与模型只在服务端配置；连接测试用合成文本且实际验证原生工具名和参数。任务固定 provider/model/配置指纹，切换只影响新任务；配置变化拒绝恢复且不消耗确认。模型报告去除本机路径和嵌入数据。

用户从托盘正常退出 WorkBuddy 后，于独立 PowerShell 终端启动隔离 FORMA，运行前后相关进程均为 **0**。`suite-2026-10-23T11-21-22-888Z/agent-live` 收到 `deepseek-v4-pro` 真实原生工具流，完成 weld → dedup，后一算子读取前一结果，后验和视口一致，**7/7**。这证明当前配置不要求桌面客户端正在运行；没有测试卸载、注销、撤销授权或长期额度。截图见 [独立终端实时结果](evidence/phase3/agent-client-closed.png)。

新兼容服务未提供外部凭据：**7 项本机协议/故障测试通过，不等于外部供应商实连**。未配置状态下普通 dedup 仍实际完成并通过后验；[界面证据](evidence/phase3/ai-provider-unconfigured.png)。配置与错误类别见 [AI-PROVIDERS.md](AI-PROVIDERS.md)。

## 性能、安全与兼容性

同机 Windows / Node 24.22.0 / Edge 155 / RTX 4060 Laptop D3D11，1440×1000、减少动态效果，按基线→修改后串行采样。不是统计显著性实验，也不是手机帧率结论。

| 指标 | 基线 | 修改后 | 解读 |
|---|---:|---:|---|
| 首页模型就绪 | 1694 ms | 1631 ms | 单次观测，不宣称稳定提速 |
| 首页下载 / 请求 | 12,077,866 B / 75 | 12,093,963 B / 76 | 新功能增加约 16 KB；保留完整模型细节 |
| 减少动态效果静止 Hero，120 次 RAF 内 draw calls | 2280 | 0 | 按需绘制；隐藏页均为 0 |
| Gallery RAF 间隔中位数 / p95 | 4.2 / 4.4 ms | 4.2 / 4.3 ms | 调度间隔，不冒充 GPU 时间 |
| 静态几何分析暖运行中位数 | 1.97 ms | 4.37 ms | 实际世界顶点扫描更准确，有额外成本 |
| 32 MiB 许可测试文件代理上传 | 3433 ms | 323 ms | 流式代理的此样本观测 |
| 代理进程峰值 RSS | 351024 KiB | 80016 KiB | 约 343→78 MiB |
| 后端峰值 RSS | 357056 KiB | 364660 KiB | 没有改善；JSON/base64 仍待改进 |

上传样本为许可 Avocado GLB 加未使用 padding 到 32 MiB，几何和图像不变；编码 JSON 44,741,369 字节。性能采样在最终作品详情统计/手机 CSS 微调之前，针对代理、Hero 和 Gallery 的实际快照，来源路径记录在 JSON。首页双 Viewer 各取一次生角仍有重复下载机会，未掩盖此项。

对比反复开启/关闭后 renderer geometries **9→9**、textures **14→14**、programs **16→16**。这是受测场景资源计数，不是所有长期任务无泄漏的保证。

本机服务新增 Host/Origin 执行前校验、跨站拒绝、JSON 类型和预算、流式代理及连接清理；普通 JSON 8 MiB、资产总文件 256 MiB、依赖 256 项，图像和顶点也有限额。进程仍在本机信任边界内，不是公网多用户授权系统。[安全约束](SECURITY.md) 与 [剩余问题](../KNOWN-ISSUES.md) 保留 worker/FBX 解压预算等限制。

## 验收记录

- 干净 `npm ci --ignore-scripts`：成功，49 packages added / 50 audited，0 vulnerabilities；Sharp 及实际模型算子已随全套测试执行。
- `npm test`：**31/31 组通过**，目录 `test-out/suite-2026-10-23T11-10-14-363Z`。包括质量 34 项、生产流程 38 项、布局 47 项、工作区 21 项，以及安全、几何语义、Provider、FBX 和历史回归。统计口径不同，不累加成虚构断言总数。
- 最终发布补充只涉及打包脚本、许可文件和说明：`--only=release` **19/19**，目录 `suite-2026-10-23T11-23-56-274Z`；真实加载五件模型，零非 API 断链、零 pageerror。
- `npm run release:verify`：90 个依赖文件 / **30,246,772 bytes**，含原始许可、预览服务；README-RC/STATIC-BUILD 为生成说明。
- 独立 CDP 附加实际 Edge，WebGL 为 true，旦角 46,828 三角形；Provider 协议与实时 Agent 分开报告。
- npm audit：旧版 7 项 high，当前全依赖和生产依赖均 0（采样结果，不替代长期维护）。

失败测试和输出未删除：正文类型检查曾误拦无正文 reanalyze，修正后 pipeline 50/50；旧测试把新增纹理 2D canvas 当作重复 WebGL，已改为断言同一 WebGL context 和真实 2D 预览，未屏蔽检查。独立 workspace 测试现在使用自己的许可资产与随机端口，不依赖前组副作用。

## RC1 与本地运行

候选包：本机 `test-out/FORMA-V5-RC1-Gallery.zip`，**25,210,231 bytes**；SHA256 `d6872e92bc761b4aef36e890d209e7866f6dc5a2c5d714be2404b9ed1d600b0b`。ZIP 仅本地生成，未上传 Releases 或部署。

解压后进入 `forma-v5-rc1-gallery-final`，运行 `node serve.mjs`，打开 `http://127.0.0.1:5173/#/gallery`。静态预览无需 npm 安装；后端不在包内，Studio 如实显示未运行。完整本地 Studio 使用 quality 工作区 `npm ci`、`npm start`（或 FORMA.bat）。不要与原工作区同时占用默认端口。

重新生成：`node tools/static-release.mjs --pack=test-out/<一个不存在的新目录>`。不覆盖已有目录或删除历史证据。[QUALITY-SOURCES.md](QUALITY-SOURCES.md) 记录来源、锁定版本、许可证与暂缓 ufbx/KTX 的理由。

## 下一阶段建议与明确边界

1. 大资产上传改为二进制/分块，同步处理进入 worker，补充超时/取消与复杂 FBX 解压预算；这是当前最有证据支持的可靠性投入。
2. 扩展复杂 FBX / 多 UV / 动画样本，采用新版本评估 ufbx；保持像素保持和着色一致分开验收。
3. 批任务逐资产版本目标、取消/恢复与可重试日志；材质局部撤销不冒充全局 Undo。
4. 收到正式 Logo 后按接口接入，再做真机触摸/性能复核。首页重复下载、动态变形 bounds、KTX2 仍在问题清单。

本轮普通优化已自主完成。最终 Logo、外部服务凭据、重大架构投入与公共部署继续按用户确认范围执行。
