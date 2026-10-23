# FORMA 发布前收尾 — 2026-10-24

本轮从实际核验的 `feature/codex-v5-design-integration` / `c22c14eb0684f4eb1c533400a5f004b4a75c0455` 开始，本地和远程一致、工作区干净。在同一个 quality worktree 新建 `feature/codex-v5-release-closeout`，没有回退、合并 main 或公开部署。原工程及其未提交的 `ARCHITECTURE.md` 保留。

## 可复现问题与修复

| 出现条件 → 用户影响 | 根因与修改 | 验证 |
|---|---|---|
| 静态 ZIP 点击任意 Studio 入口 → 进入缺后端的工作区 | 原包沿用本地路由；打包器现在将 HTML 的 `data-edition="local"` 明确写为 `showcase`，清单记录实际输出字节。`runtime.js` 只读该标记，静态 `/studio` 按需加载完整介绍及真实截图；不根据网络超时判断模式 | 首页/导航/页脚共用路由，直接访问/刷新；独立包无后端请求；本地断线/重试仍恢复真实工作区 |
| 从长页面底部进入另一页 → 新页直接落在页脚，错过作品 | 常驻路由只换可见性，没有更新文档滚动位置；不同页面进入时复位到顶部，作品索引/联系深链接仍在下一帧定位 | 页脚→详情、页脚→静态 Studio；原生 200% 与作品集深链接回归 |
| 详情画布覆盖短屏大部分面积 → 滚轮被 OrbitControls 缩放截获，难以向下浏览 | 详情 miniViewer 启用公共页滚动模式：滚轮交给文档，横向拖动可旋转，触控允许纵向滚动和原生缩放；Gallery 保留原来的模型缩放 | 200% 原生缩放下在画布上真实滚轮到页脚；390px 浏览器触摸模拟纵向拖动可滚动。非手机实测 |
| Studio 在原生 200% 下有效高度约 402 CSS px → 视口被工具条/Dock 挤成窄条 | 固定高度 flex 布局允许视口压缩至零；短于 600px 时中间列可滚动，视口保留 320px。Gallery 短屏也允许页面滚动 | 原生浏览器缩放、真实导入模型、按钮命中测试、模型区及处理区均可到达 |
| 390px 作品条仅能同时看到约三件 → 第四/第五件不易发现 | 横向滚动缺乏明确入口；新增数量提示及上一件/下一件，复用真实选模按钮，当前项自动滚入可见区 | 顺序选择全部五件、第五→第四、标题/选中状态/实际几何一致 |
| Gallery 点击切换后刷新 → 返回之前的作品 | V5 跳过了旧版 hash 更新，却未同步新的 Gallery 查询参数；现于发起公开作品选择时 replaceState 更新 work，保留其他参数，不触发第二次加载。写入在请求开始，避免迟到加载覆盖新路由 | 先以未修改代码复现失败，再验证上一件到黄谱后的 URL/刷新；独立静态包实际点击旦角并刷新 |
| 成功复制后立即再次复制失败 → 按钮仍暂时显示“已复制” | 上次反馈定时器未清理；新请求清除旧状态，进行中阻止重复点击，失败恢复“复制”，回退清理 textarea 并恢复焦点 | 真实系统剪贴板内容；注入 Clipboard API 和 execCommand 双失败，验证失败反馈 |
| 导出需要确认 → 提示错误地让人点击“执行”；成功后确认仍残留 | 通用确认文案缺少动作名，导出事件未清理；改为“导出”，成功清理确认。进行中的导出设互斥保护 | 双击只新增一个真实版本，导出使用所选 Edited，GLB 解析和再次导入均保留 roughness 0.64 |

普通材质保存仍使用冻结的资产/版本/参数确认；失败保留草稿，取消切换保留草稿，Original 不覆盖。无 React 迁移、依赖升级或未经批准的全站重构。

## 静态与完整版

静态版 Studio 采用三张真实本地工作流截图（分析、确认保存、Before/After），由 Edge 在隔离副本中操作许可明确的 Microsoft Avocado（CC0）生成，仅无损转为 WebP。来源与哈希在 `assets/studio-demo/PROVENANCE.json`。截图按需加载，首页不请求这些图片；不是外部 AI 自动操作的录像或模拟工作区。使用截图实录，没有制作宣传性质的伪操作视频。

本地源码始终为 `local`。`npm ci` / `npm start` 启动真实后端和工作区。静态包无需 npm 安装，用 Node.js 22.12+ 执行 `node serve.mjs`，打开 `http://127.0.0.1:5173/#/`。观展、旋转、观看设置、PNG 截图保留。直接复制源码为静态网站不会自动变成展示模式，应使用 `npm run release:pack` 的明确产物。

正式 A · Spatial Monogram、favicon、Spatial Construction V2 已在上一轮正式接入，本轮保持原始交接文件字节不变。V2 是用户主动播放、按需载入、可暂停/重播、关闭或换页销毁、减少动态回退。V3 未进入网页。联系继续为公共页脚单一折叠入口；两个真实邮箱均保持原值。

## 面部局部试验

选择旦角外侧面颊，使用固定近景的射线拾取确定区域，避开眼线、鼻口和外轮廓。当前模型法线在同位置的重复顶点处连续，金属度 0，无 normal map；灰模中仍有起伏，无光贴图中仍有边界，因此不能只归咎于灯光或 UV 法线接缝。

候选 `assets/experiments/dan-cheek-depth-v1/candidate.glb` 从当前 `assets/portfolio-v1/dan.glb` 派生，只在椭圆区域做两次带衰减的深度方向邻域修整，并更新相邻面法线。34 / 28,662 顶点改变（约 0.12%）；最大位移 0.0001867563 原始单位，约全模型高度 0.0623%；46,828 三角形不变、零翻面，Khronos Validator 零错误。保留整个原 BIN、UV、材质和图片，新增 POSITION/NORMAL 数据；不减面、不重拓扑。

八组对照包含正常距离/近景 × 正面/斜侧面 × 正常材质/灰模，左当前、右候选。两边相机、灯光、曝光、环境、画布尺寸完全相同。改善较轻微，局部眼睑与面颊结构及贴图边界仍存在，**没有足够依据替换当前展示版**。候选未加入 catalog，也未进入静态 ZIP；回退不需要任何操作。白谱继续保持当前模型，P1-05 未宣称解决。

## 验证状态与边界

实际结果、来源提交和包哈希见 `docs/audit/release-closeout-results.json`。截图索引在 `docs/evidence/release-closeout/README.md`。

- 桌面：Windows / Node 24.22.0 / npm 11.19.1 / Edge 155 / NVIDIA RTX 4060 Laptop，实际 WebGL。
- 布局模拟：390px、768px、1366×768；触摸测试为桌面 Edge 的触摸事件模拟。
- 原生 200%：临时独立浏览器配置中的扩展调用 `chrome.tabs.setZoom(2)`，`getZoom()` 返回 2；1336×805 → 668×402 CSS px，DPR 1→2，visualViewport.scale 保持 1。不是 CSS zoom 或设备比例替代。实现依据 [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom) 与 [Puppeteer 扩展加载文档](https://pptr.dev/guides/chrome-extensions)。临时扩展不安装到用户日常浏览器配置。
- WorkBuddy：已有服务配置，隔离 Avocado 上一次真实 Agent 运行通过 7 项；两个真实算子、前后输出串联和最终视口选择有日志。第三方 OpenAI-compatible 未配置外部凭据，仍只确认协议/故障测试，不声称供应商实连。
- 真机与读屏器：本轮没有可操控的实体手机或读屏器，不声称已通过。没有执行手机长时发热/显存/性能测试。

最终复核另外发现 Gallery 按钮选择与地址未同步：之前的刷新用例从直接路由进入，未覆盖点击切换后的刷新。补充的真实点击回归先在旧代码上失败；修复后重跑完整回归及独立 ZIP。已生成的中间包 `FORMA-Portfolio-Candidate-cd8630b.zip` 保留追溯，但不作为最终交付。

首次完整回归发现新增收尾测试错误地假设 Avocado 只有两个版本；前置品质测试合法产生了同一隔离资产的历史版本。修正为比较此次导出前后版本数量差（必须恰好 +1），没有删除历史版本、跳过断言或放宽数据正确性要求。

## 本轮结果与候选包

- 运行代码：`8a025d72847846da0af3806e2adcf7fa598a668f`。最终文档提交位于其后，未改变候选包运行代码；以分支 HEAD 查看完整证据。
- 分支：[feature/codex-v5-release-closeout](https://github.com/a15876577124-alt/FORMA-3D-Viewer-v3/tree/feature/codex-v5-release-closeout)。本轮四个实现提交分别负责展示版 Studio/滚动、工作区可靠性、验收与面颊试验、Gallery 点击后的刷新保持。
- 新包：`test-out/FORMA-Portfolio-Candidate-8a025d7.zip`，27,253,815 字节；SHA-256：`61d5e877340ffb219cb1c834033e4d289f004222e19b257468fa3bc1debc5d6e`。旧 RC1/RC2/设计包及中间包均保留，不覆盖。
- 包内 SOURCE.json 标明上述代码提交，STATIC-MANIFEST.json 核验 102 项静态依赖，含三张真实演示截图及来源。最终 ZIP 在新目录 `test-out/FORMA-Portfolio-Candidate-8a025d7-extracted` 解压并直接验收，没有重建或修补包内容。
- 启动：解压后在该目录执行 `node serve.mjs`，打开 `http://127.0.0.1:5173/#/`。需要 Node.js 22.12+，无需 npm 安装、AI 认证或资产后端。源码完整版继续 `npm start`。

| 实际执行 | 结果 |
|---|---|
| 最终完整 npm test | 36/36 组；所有原有有效断言保留 |
| 收尾真实工作流/浏览路径 | 33 项通过；包含点击作品后刷新、材质保存/双击导出/重新导入、复制双失败、断线恢复 |
| 作品集 / 品质 / 设计 / 布局专项 | 43 / 34 / 76 / 47 项通过 |
| 原有生产工作流 | 38 项通过，包含真实文件转换及重新加载 |
| 独立解压 ZIP | 53/53；五件详情/Gallery、正式品牌、Studio 演示、390/768/1366、零未捕获页面错误与断链 |
| 原生 200% | 13 项通过；实际浏览器缩放，不是 CSS 模拟 |
| 现有 WorkBuddy 真实 Agent | 7/7；隔离资产两步实际算子与后验验证 |
| 一键启动 | 独立副本真实 launcher 启动，4 项服务/页面/代理检查通过 |
| 静态依赖核验 | release:verify 102 文件 / 32,617,523 字节 |

固定测量为同台 Windows / Edge / RTX 4060、1440×1000、减少动态效果、同一生角、全新浏览器配置；测试之间没有并发 GPU 验收。每侧仅一次采样，不能据此宣称速度提升。

| 测量 | c22c14e 基线 | 本轮最终运行代码 |
|---|---:|---:|
| 首页就绪 | 1694 ms | 1539 ms |
| 首页请求 / 传输字节 | 84 / 9,788,335 | 85 / 9,793,823 |
| Gallery 帧间隔中位 / P95 | 4.2 / 4.3 ms | 4.2 / 4.3 ms |
| GPU geometry / texture / program 计数 | 7 / 8 / 9 | 7 / 8 / 9 |
| Hero 隐藏时 / 减少动态时新增绘制 | 0 / 0 | 0 / 0 |

五件详情/Gallery 的固定条件校准仍通过；本轮没有改变展示模型或默认曝光/材质来掩盖面片。20 个受保护 GLB/品牌文件与基线哈希一致，原工程未提交 ARCHITECTURE.md 的 SHA-256 仍为 177ce7069926dae58fa57fde4ca2caad0c775c0c5198ac4f0a8c06318f21aa42。

57 张实际截图与来源哈希已归档。关键前后对比：[静态 Studio 修复前](evidence/release-closeout/static-studio-before.png) / [修复后](evidence/release-closeout/static-studio-1366.png)；[200% Studio 修复前](evidence/release-closeout/studio-before-200.png) / [修复后](evidence/release-closeout/studio-model-200.png)；[窄屏 Gallery 修复前](evidence/release-closeout/gallery-before-390.png) / [修复后](evidence/release-closeout/gallery-390.png)；[点击切换并刷新后的黄谱](evidence/release-closeout/gallery-button-refresh-390.png)。面部八组对照从截图索引进入，均左当前、右候选。

## 手机人工验收（六步）

1. 解压新静态 ZIP 到独立目录。电脑与手机连接同一可信 Wi-Fi；本机已有 Python，可在**解压目录**运行 `py -m http.server 5174 --bind 0.0.0.0`。手机打开 `http://电脑局域网IPv4:5174/#/`；如系统提示防火墙，仅允许所用的私人网络。此方法只共享静态包，不启动资产后端。不要在含私人资源的源码目录执行。
2. 记录手机型号、系统、浏览器版本、首屏等待时间；上下滑动首页到页脚，检查作品和联系入口。
3. 逐件进入详情，竖向滑动应滚动页面，横向拖动应旋转模型；进入 Gallery，选完五件，试第四/第五件和返回详情。
4. Gallery 拖动、缩放、最佳视角、设置开关和截图；切到 Studio 介绍后返回 Gallery，再刷新，确认模型不黑屏且标题一致。
5. 打开联系并点击/复制两个邮箱；品牌动态播放、暂停、重播、关闭，系统开启减少动态效果后重试。
6. 连续浏览 5–10 分钟记录卡顿、发热或错误；完成后电脑终端 Ctrl+C 停止临时静态服务器。把问题对应的设备、操作和截图记录即可。

## 后续范围

继续保留：白谱/旦角精细技术美术审阅、真机与读屏器、复杂 FBX/多 UV、批任务取消恢复、大资产 worker 隔离和持续压力测试。它们没有被包装成本轮已完成能力。包只面向作品集展示，不包含私人工作区、测试原模型、后端或面部试验资产。
