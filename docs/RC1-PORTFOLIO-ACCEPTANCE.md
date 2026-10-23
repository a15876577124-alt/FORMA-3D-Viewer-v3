# RC1 作品集展示验收与针对性修正

2026-10-23（Asia/Shanghai）。本轮从实际核验的 RC1 重新开始，保留黑金视觉、实时 Hero、Gallery 和 Studio 的原有结构。没有继续 RC2 首页重构或扩展生产功能。此记录是当前状态；[第三阶段报告](V5-QUALITY.md) 保留为 RC1 历史证据。

## Git 与保护范围

- 开始时 quality 工作树干净，实际分支 `feature/codex-v5-exhibition`，HEAD `7a2c65738cde8eeef70d3a878e780fff733e6c4b`，与远程一致。
- 实际 RC1 分支 `feature/codex-v5-quality` 的本地与远程均为 `83453aafbc1dd8f8885f05d5ab9d1c3215218b65`，包含 RC1 代码与最终文档。
- 使用 `git switch -c feature/codex-v5-rc1-polish feature/codex-v5-quality` 新建分支。没有 hard reset、历史改写、强推、合并 main 或公开部署；RC2 分支和包仍保留。
- 当前运行代码提交：`17ac8ffc4df42a4e2b01757d50273b2628acaace`，已推送并核对远程 SHA。文档与截图另存后续提交。
- 原工程 `FORMA-3D-Viewer-v3` 仍在 `feature/codex-v5-audit`；其 `docs/ARCHITECTURE.md` 格式修改保持未提交，SHA256 为 `177ce7069926dae58fa57fde4ca2caad0c775c0c5198ac4f0a8c06318f21aa42`。
- `assets/raw/`、`assets/models/`、仓库外模型、既有工作区、`backend/.env`、依赖锁定文件、`src/ui/brand.js` 均未修改。没有访问品牌设计工作区。

## 实际发现与修改

| 发现和根因 | 本轮处理 | 验证与边界 |
|---|---|---|
| 首页只有生角实时 Hero，另外四件在作品卡片中主要以文字/单字标识呈现 | 原卡片使用已有五张真实缩略图，保留布局；改正生角“青衫”等与画面不符的说明，删除未核实的传统规制断言 | 五件缩略图成功解码；逐一进入实际作品详情与 Gallery，身份、几何统计与画面一致 |
| 首页 Hero 与隐藏的主 Viewer 各发一次生角 GLB 请求 | 去掉启动时主 Viewer 的抢先选择；Gallery 进入时才加载目标，保留原查询参数和 Studio 选择路径 | 本机冷页面 GLB 请求 2 → 1；资源计时中的 GLB 总传输 8,276,888 → 4,462,060 bytes。新法线版本稍大，不能描述为下载体积恰好减半；这不是公网/手机测速 |
| 网络请求结束时 GLB 可能仍在解析，早截图只有台座 | Hero 显示加载状态，模型解析及首次绘制后才标记 ready；隐藏尺寸不再归一成 1×1 | 390/768px 等待 ready 后还检查红色手办像素，避免把台座当作已加载 |
| Studio 迟到的读取/算子结果可能在离开后改写共享 Viewer，资源树还残留目录选中高亮 | 路由离开使选择请求失效；恢复 Studio 时重新按 assetId/version 选择；同步侧栏高亮；路由异步工厂加入过期检查 | 实际拦截版本读取与真实 dedup 请求，切到旦角 Gallery 后放行响应；Gallery 不被覆盖，后端通过后验的输出版本仍保留 |
| 公共页缓存了详情 Viewer，隐藏页面资源未及时释放；切回公共页还可能保留 Studio/Gallery body 模式 | 详情离开即 dispose 与释放上下文，重进重新创建；公共路由清除工作区模式；主 Viewer 跳过零尺寸，删去被 Environment 覆盖的重复 PMREM 初始化 | 五个详情逐一离开后无遗留详情 canvas；3 次 Studio → 首页 → Gallery 循环、投影比例、刷新均通过。主 Viewer 与缓存的 Hero 仍是独立上下文，不能称整个网站只有一个上下文 |
| 联系区域面积与视觉权重过高 | 删除首页/详情独立联系区，复用共享页脚的默认收起“联系”入口 | 两个原邮箱和复制逻辑保留，展开后 13px 字体、44px 操作目标、mailto/复制可用。Gallery/Studio 不展示页脚，未增加悬浮模块 |

主要运行文件：`src/main.js`、`src/core/{router,viewer,miniViewer}.js`、`src/pages/{home,home3d,work}.js`、`src/studio/{core,ui}.js`、`src/ui/{contact,shell}.js`、`src/state/viewState.js`、`styles/v5.css`。`src/models/catalog.js` 指向独立展示版本；法线修正位于 `src/loaders/normals.js`。

## P1-05：法线问题部分修复，面片仍保留

原始 raw 的缺失法线与默认金属参数问题，不能直接当作 RC1 展示文件的现状。实际 RC1 `assets/models/` 五件均已有 NORMAL，材质均为 metallicFactor=0、roughnessFactor=0.9036020036098448。本轮没有修改材质、贴图、曝光或面数。

现有法线函数计算了同位置顶点分组，却仍只累计每个索引自身的相邻三角形；UV 边界上位置重复的顶点因此得不到共同法线。修正为同组的相邻面集合做面积加权，并以两个相交三角形、分离 UV 的明确期望值回归验证。

新版本存放于 `assets/portfolio-v1/`。生成器 `tools/portfolio-assets.mjs` 只追加法线 buffer、更新 NORMAL accessor 和来源元数据；整个原始 BIN 前缀与材质定义逐字节/结构核验保留。已有输出不一致时拒绝覆盖，必须使用新目录。`manifest.json` 记录来源/输出完整 SHA256。原 `assets/models/`、Original 与用户资产均未覆盖。

| 展品 | 顶点 / 三角形，前后相同 | 同位置法线差异 >5° 的组，前 → 后 | Validator errors，前 → 后 | 实际视觉观察 |
|---|---:|---:|---:|---|
| 生角 | 26,951 / 47,512 | 1,511 → 0 | 6 → 0 | 红袍、蓝白波纹、帽饰完整；局部面颊/饰边仍可见三角面痕迹 |
| 旦角 | 28,662 / 46,828 | 3,766 → 0 | 5 → 0 | 头饰、珠串与流苏完整；面颊和花饰近看仍有面片 |
| 净角·红谱 | 28,472 / 49,178 | 2,753 → 0 | 7 → 0 | 脸谱和衣袍纹样保持，冠饰边缘保留原始轮廓 |
| 净角·黄谱 | 27,361 / 47,852 | 1,843 → 0 | 6 → 0 | 冠饰、长髯、衣袍保持；局部边缘仍有原网格痕迹 |
| 净角·白谱 | 26,720 / 46,939 | 1,815 → 0 | 8 → 0 | 白脸、眉缘、髯口周围仍可见三角形反光/阴影边界，尚未消除 |

Validator 原有错误涉及过时的 NORMAL min/max；新 NORMAL accessor 不保留错误边界，五件均为 0 errors / 0 warnings。这与真实视觉质量是两个不同结论。法线连续性数值通过，不等于艺术品质已完全修复。

固定条件截图由 `tools/portfolio-render.mjs` 产生：Windows Edge 155.0.4283.62、1200×1200、studio 布光、Neutral 色调映射、曝光 1、相同相机位置/target/FOV；每件正面、斜侧面、背面，各做 lit、normal、unlit 前后对照，共 90 张。脚本断言前后相机条件一致。15 组 unlit 图像逐字节像素差异均为 0，配合原 BIN/材质不变，支持纹理与几何外观未被重写。白谱斜侧面仍有亮暗面片，而 unlit 下对应亮暗边界明显减弱：这指向剩余几何/着色问题，不能只靠本次法线平均解决。没有据此进行未经验证的重拓扑、贴图重绘或减面。

另一个实际问题是作品详情 miniViewer 使用 ACES/曝光 1.2 与较强灯光，Gallery 使用 Neutral/曝光 1。详情看起来偏淡。此为 RC1 既有跨页面呈现差异，本轮保留为后续统一渲染校准项，没有拿不同页面的亮度变化作为修复证据。

## 回归结果与证据

| 实测 | 结果 |
|---|---|
| `npm test` | 33/33 组通过；在一次性项目快照中执行，不写真实资产 |
| 作品集专项最后一次 | 43 项通过：五件真实详情/展厅、路由循环、刷新、迟到选择/处理、390/768px；该次补强了窄屏目标模型完成加载后的截图等待 |
| 法线专项 | 6 项通过：构造 UV 边界场景 + 五件原 buffer/材质/数量/单位法线/Validator |
| 品质专项 | 34 项通过：mailto/复制、品牌回退、实际材质撤销重做、取消资产/路由切换保护草稿、FBX、AI 离线普通处理 |
| 布局专项 | 47 项通过：拖拽、键盘、双击复位、持久化、不同分辨率及联系方式 |
| 真实资产工作流 | 38 项通过：许可 GLB/FBX 导入、处理、版本、比较、导出、重导入；沿用隔离样本 |
| `npm run release:verify` | 90 个运行文件闭包通过，共 31,903,633 bytes |
| 新 ZIP 解压后的独立包 | 22/22 通过；93 文件，其中 90 运行文件 + 3 说明/构建/来源元数据；92 文件完整哈希核对及 SOURCE.json 独立哈希 |

主浏览路径包含：首页 → 五件实际作品详情 → Gallery → 切换模型 → Studio → Gallery → 刷新，以及连续 3 次 Studio/公共页/Gallery 往返。未复现返回空白、迟到选择覆盖或退出后的旧详情 canvas 留存。未保存材质的取消导航保护通过。Gallery 以观展信息、灯光与视角为主；Studio 保留资产树、版本、算子、报告与任务区，截图能区分两种用途。

GPU 报告为 ANGLE / NVIDIA GeForce RTX 4060 Laptop GPU / Direct3D11。浏览器验收使用实际 Edge WebGL，不是合成页面图；但这是桌面环境，不代表手机实测。完整机器记录：[rc1-portfolio-results.json](audit/rc1-portfolio-results.json)。

本轮没有重新调用外部 AI 服务，不能把 RC1 早先的 WorkBuddy 退出后实连记录描述为本轮新测；本轮 Agent/Provider 测试是既有故障和稳定性回归。

58 张选用的原始截图与来源/哈希存于 [截图索引](evidence/rc1-portfolio/README.md)，未做局部修图。首页/详情的 before 为当前重新运行的 RC1；不是引用 RC2 或旧报告截图。完整 90 张模型对照仍保留在 `test-out/portfolio-models-2026-10-23T14-26-14-276Z/`，对应机位记录已经汇入机器报告。

## 手机人工验收：真机未验证

可用条件只有 Windows Edge 的 390×844 和 768×844 视口模拟；两种尺寸无横向页面溢出，Hero 与旦角实际加载后截图。没有获取真实 iOS/Android 设备，因此触摸、GPU、热降频、后台恢复、移动网络加载时间仍未验证。

真机验收应使用经许可的本地静态包访问方式，不需要公开部署，也不要直接把完整 Studio 后端暴露到公网。记录设备型号、系统、浏览器版本、DPR、网络与是否冷缓存，然后执行：

1. 冷启动首页，记录从打开到真实手办出现的时间；确认不是只有底座，五张作品缩略图清晰，能自然滚动。
2. 五件详情逐一进入；单指旋转、双指缩放、竖横屏切换，确认页面滚动与三维操作不相互卡住。
3. 详情 → Gallery → 五件切换；核对标题与实际模型，检查头饰/流苏不被裁切，触摸按钮与抽屉能关闭。
4. Gallery → Studio → 返回 Gallery → 刷新，反复 10 次；记录空白、系统回收 WebGL、崩溃、机身升温与帧率变化。静态包的 Studio 应明确显示后端不可用。
5. 若使用安全连接的本地完整版，导入隔离样本，修改材质后尝试离开；取消应保留草稿，确认丢弃才离开，重新进入保持正确版本。
6. 在首页页脚展开“联系”，点击两个 mailto 并复制核对；Gallery/Studio 无联系遮挡。开启系统减少动态效果再重复首页/展厅检查。

记录模板：设备/系统/浏览器 | 网络/冷缓存 | 首页首模秒数 | 五件切换 | 旋转/缩放 | 横竖屏 | 路由/刷新 | 草稿保护 | 10 次往返/温度 | 截图/失败步骤。

## 包、运行和后续范围

新候选包：`test-out/FORMA-RC1-Portfolio-17ac8ff.zip`，26,566,194 bytes，SHA256：`1de65af22b6e5b505e0424630743d2855565c30b1aaf6cef5cf7a3dce8738cd3`。解压后在目录执行 `node serve.mjs`，打开 `http://127.0.0.1:5173/#/`。静态包不包含 AI/资产后端；完整开发工程运行 `npm ci`、`npm start`。

来源 `SOURCE.json` 绑定完整运行代码 SHA 与文件哈希。发布工具只写新目录，不会覆盖旧包。原 `test-out/forma-v5-rc1-gallery-final/` 和已有 RC1 重建包保留；`FORMA-RC1-reconstructed-83453aa.zip` 是按已验证 RC1 提交重建的包，不宣称与早期未找到的原 ZIP 字节相同。RC2 包也未覆盖。

可复现命令：`npm test`、`npm run release:verify`、`node tests/run.mjs --only=portfolio`、`node tests/run.mjs --only=portfolio-models`、`node tools/portfolio-render.mjs`。最后一项会产生新的时间戳截图目录；`node tools/static-release.mjs --pack=test-out/<新目录名>` 生成独立静态包。新增文件先纳入 Git，测试快照才会包含。

下一轮仍以白谱面部/旦角面颊的几何与着色定位、跨页面渲染校准、手机真机验收为优先。大资产 worker 隔离、复杂 FBX、多 UV、批处理恢复继续延期；本轮未发现这些未覆盖能力阻止当前五件模型加载，不将其视为已完成。

Logo：设计方案已经批准（A Spatial Monogram；动态方向 Spatial Construction），正式资源尚未接入。保留现有 `brand.js` 接口、旧标识与文字回退，没有重画截图或加入新动画。最终交付文件/分支/SHA 到位后独立接入；详见 [Logo 交接](LOGO-INTEGRATION.md)。
