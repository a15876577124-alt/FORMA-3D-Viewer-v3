# FORMA RC2 — 数字展陈改造与验收

2026-10-23，Windows 本地工程。当前开发分支 `feature/codex-v5-exhibition`，从 RC1 检查点 `83453aafbc1dd8f8885f05d5ab9d1c3215218b65` 创建。未合并 main、未公开部署。最终源码与候选包信息见 [机器验收记录](audit/rc2-results.json)。

## 设计判断与实现

改版前实际运行了 RC1：首页同时承担作品入口、软件能力说明、启动卡片和大型联系区；Gallery 的左右栏挤占作品，视觉上与 Studio 接近。原首页 Hero 与主 Viewer 各加载一次生角。采用纸白、墨色与少量赭色的展陈方向，让作品颜色成为主角，Studio 保留深色操作环境。

| 区域 | 实际改动及作用 |
| --- | --- |
| 首页 | 左侧「琼剧 / 五相」、右侧真实旦角渲染；下方五件作品目录与一条 Studio 入口。移除四张启动卡、能力统计、重复操作说明及独立 3D Hero。没有增加虚构成绩或能力。 |
| Gallery | 作品占据全宽舞台；角落标题、相邻作品切换、底部五件缩略图，旋转 / 复位 / PNG 三个直接操作。灯光、材质、后期和动画保留在「观看设置」；导入与资源库保留在「更多资源」。 |
| 详情 | 真实海报、简洁外观描述、进入展厅、前后作品链接；模型资料按需展开。指标由模型文件测试核验，不以同名用户资产推测数据。 |
| Studio | 保留资产树、版本、材质、算子、比较与导出闭环；整理工具栏换行和按钮间距，隐藏重复品牌，转换入口仅对可转换格式出现。没有撤除核心能力。 |
| 联系方式 | 首页与详情共享一个页脚「联系」展开项，默认收起；展开后两个真实邮箱可点击 mailto 与复制。Gallery / Studio 不显示页脚。替代上一轮常显大区域，符合本轮明确授权。 |
| 品牌 | 单一 `brand.js` 改用 FORMA 文字回退。已批准 A · Spatial Monogram 与 Spatial Construction，但正式文件尚未接入。未访问另一个设计工作区。 |

概念图仅用于决定布局，不进入网站资产，也不充当验收截图。实际页面保留了选定方向的六个要点：纸色基底、细线导航、中文衬线标题、作品主视觉、五件连续目录、克制页脚。最终使用本项目真实五件手办，未采用概念图生成的不同衣袍或造型；标题两行构图、手机两列目录是实际适配决定。

## 实际前后截图

以下均为本工程 Edge 渲染。桌面对比使用 1440×1000 视口，部分页面保存完整页面，故图片总高度不同。首页主角由生角改为旦角，是内容选择变化；Gallery 和详情比较均为旦角。界面改版改变了背景和取景，不作为法线修复的证明。

| 页面 | RC1 实测 | RC2 实测 |
| --- | --- | --- |
| 首页 | [改版前](evidence/rc2/before-home-desktop.png) | [改版后](evidence/rc2/home-desktop.png) |
| Gallery 旦角 | [改版前](evidence/rc2/before-gallery-dan.png) | [改版后](evidence/rc2/gallery-dan.png) |
| 详情 旦角 | [改版前](evidence/rc2/before-work-desktop.png) | [改版后](evidence/rc2/work-desktop.png) |
| Studio 初始状态 | [改版前](evidence/rc2/before-studio-desktop.png) | [改版后](evidence/rc2/studio-desktop.png) |
| 首页联系展开 | [改版前](evidence/rc2/before-contact-desktop.png) | [改版后](evidence/rc2/contact-desktop.png) |
| 390px 首页 | [改版前](evidence/rc2/before-home-390.png) | [改版后](evidence/rc2/home-390.png) |
| 390px 详情 | [改版前](evidence/rc2/before-work-390.png) | [改版后](evidence/rc2/work-390.png) |
| 390px Studio | [改版前](evidence/rc2/before-studio-390.png) | [改版后](evidence/rc2/studio-390.png) |

补充：[390px 展厅](evidence/rc2/gallery-390.png)、[390px 设置](evidence/rc2/settings-390.png)、[390px 联系](evidence/rc2/contact-390.png)、[详情联系](evidence/rc2/work-contact-desktop.png)、[Studio 实际资产](evidence/rc2/studio-asset.png)。全部证据的原始输出路径与 SHA256 见 [截图索引](evidence/rc2/index.json)。

## 五件手办：根因、修改和边界

检查区分了 raw、RC1 展示模型和 RC2 新版本。raw 缺少法线及显式金属度，glTF 默认金属度为 1；**RC1 的 assets/models 已经是 metallic=0、roughness=0.9036020036098448**，不能继续把当前反光归因于「金属度仍为 1」。本轮未再改动材质。

法线函数已按位置建立顶点组，但累计邻面时仍只看每个原始顶点的面集。UV 接缝拆分的同位置顶点因此得到不同法线。现按同位置组汇总邻面并按面积加权；不合并顶点、不减面、不改 UV。另发现旧 NORMAL accessor 的 min/max 与实际数据不符；新法线不沿用失效边界元数据。

新输出位于 `assets/exhibition-v1/`，保留源 GLB 原二进制前缀，追加法线数据；材质 JSON、POSITION、UV、索引和嵌入贴图不变。原始文件及 RC1 展示文件均保持字节不变。`tools/exhibition-assets.mjs` 对已有不同内容输出拒绝覆盖；后续修改应使用新版本目录。

| 作品 | 顶点 / 三角形（前后不变） | 同位置法线差异 >5° 的组数（前→后） | Khronos errors（RC1→RC2） |
| --- | --- | --- | --- |
| 生角 | 26,951 / 47,512 | 1,511 → 0 | 6 → 0 |
| 旦角 | 28,662 / 46,828 | 3,766 → 0 | 5 → 0 |
| 净角·红谱 | 28,472 / 49,178 | 2,753 → 0 | 7 → 0 |
| 净角·黄谱 | 27,361 / 47,852 | 1,843 → 0 | 6 → 0 |
| 净角·白谱 | 26,720 / 46,939 | 1,815 → 0 | 8 → 0 |

上述法线指标仅衡量接缝连续性，不代表所有表面都光滑，也不等于艺术质量分数。五件新模型 Validator 均为 0 errors / 0 warnings。无光照贴图通道的前后图像逐像素相同；受光画面的变化主要在接缝局部。

同条件修复证据：1200×1200、同一 studio 灯光、曝光 1、同相机位置 / target / FOV、同裁切；与公开页面的构图调整分开。每件均保存正面、斜侧、背面的 before/after，以及 normals / unlit 诊断，总计 90 张原始图；精确相机见 [采集条件](evidence/rc2/model-capture.json)。

| 作品 | 正面 before | 正面 after | 当前展厅 |
| --- | --- | --- | --- |
| 生角 | [前](evidence/rc2/sheng-front-before.png) | [后](evidence/rc2/sheng-front-after.png) | [实际页面](evidence/rc2/gallery-sheng.png) |
| 旦角 | [前](evidence/rc2/dan-front-before.png) | [后](evidence/rc2/dan-front-after.png) | [实际页面](evidence/rc2/gallery-dan.png) |
| 净角·红谱 | [前](evidence/rc2/jing-red-front-before.png) | [后](evidence/rc2/jing-red-front-after.png) | [实际页面](evidence/rc2/gallery-jing-red.png) |
| 净角·黄谱 | [前](evidence/rc2/jing-yellow-front-before.png) | [后](evidence/rc2/jing-yellow-front-after.png) | [实际页面](evidence/rc2/gallery-jing-yellow.png) |
| 净角·白谱 | [前](evidence/rc2/jing-white-front-before.png) | [后](evidence/rc2/jing-white-front-after.png) | [实际页面](evidence/rc2/gallery-jing-white.png) |

**P1-05 仍部分开放。** 旦角脸颊和净角面部边界仍可见网格面片、锯齿状起伏，白谱斜侧最明显。白谱 unlit 图不出现相同受光三角纹，normal 图仍显示局部边界，说明不能只归因于底色贴图，也不能靠改灯光视为修好。下一步需要局部拓扑与边界法线的技术美术修复，再输出新版本；本轮没有用减面、模糊、压暗或特选角度掩盖。

## 生命周期与状态修复

- 移除已不再使用的 `home3d.js` / `miniViewer.js`，首页与详情使用从真实模型渲染的 WebP，不再创建独立 WebGL 实例。
- 不在启动首页时抢先选中第一个 GLB；进入展厅才加载指定展品，保留旧 `#sheng` 和 entry 路由兼容。
- Router 对异步页面工厂采用请求序号并调用 leave；Studio 离开时使未完成选择失效。迟到的读取或实际算子结果不会把展厅旦角换成 Studio 资产；已经成功的后台版本保留，返回 Studio 可继续查看。
- 图像复核发现 Studio 导入后原目录还高亮旦角。新增断言先复现失败，再将 Studio 统一选择回调同步至旧目录；资源树和旧目录不再同时指向不同模型。
- 隐藏时不把 Viewer / render target 缩为 1×1；返回后恢复有效尺寸。展厅用相机空间包围盒拟合，手机宽高比下完整头饰和流苏仍在画面内。
- 主 Viewer 去掉重复的环境贴图预计算；静态状态只在相机、参数或内容变化时提交渲染，旋转和动画仍正常更新。RAF 仍用于控件更新，**并非零 CPU 或彻底停止事件循环**。
- 默认停止自动旋转；减少动态效果偏好会覆盖保存的启动自动旋转设置，用户仍可主动点击旋转。设置抽屉有焦点恢复和 Escape 关闭。

## 回归与性能

全量测试使用 `tests/run.mjs` 快照隔离工作区、独立端口及临时资产，不写用户真实资产。最终 `npm test` **33/33 组通过**，输出 `test-out/suite-2026-10-23T13-45-38-802Z/`：展陈 46 项、品质 34 项、真实工作流 38 项、渲染 56 项、布局 46 项通过。最终结果与机器环境见 [rc2-results.json](audit/rc2-results.json)。新增 exhibition-models / exhibition 两组，其余核心流程组继续运行。

- 实际 Edge / ANGLE / NVIDIA RTX 4060 Laptop GPU，非软件渲染替代。
- 旧首页性能样本记录两次 4,138,444 字节的生角响应，新首页 GLB 请求为 0；所有资源合计由约 12.09 MB 降至约 3.58 MB（同机单次本地加载样本，非公网速度承诺）。
- 静止展厅等待 damping 后连续采样 1 秒，GPU render 提交数为 0；旋转与动画启用时继续渲染。资源循环回归同时检查几何 / 贴图 / shader 数量边界。
- 真实路径：首页 → 详情 → Gallery 五件 → Studio 导入 → 处理 → 返回 Gallery → 刷新。延迟读取及实际算子请求故意挂起后切页，确认结果不覆盖新页面。
- 材质草稿、撤销/重做、离开保护、保存版本、比较、GLB/GLTF/FBX 转换、导出重导入及 AI 离线普通处理保留验收；FBX / 外部服务限制沿用 [品质报告](V5-QUALITY.md)，未扩大成全格式无损承诺。
- WorkBuddy 完全退出后的真实 Agent 验证属于 RC1 历史证据；本轮未修改 AI 服务，也未将协议测试冒称新的外部供应商实连。

测试随界面更新保持等效能力：旧常驻 Inspector 改为先打开抽屉；旧黑底像素阈值改为真实模型 silhouette 掩码，再在模型像素内检查颜色与过曝，避免纸色背景污染统计；旧四入口页测试改为当前真实目录 / 路由测试。早期失败和修复日志均保留在 test-out，未跳过失败组。

## 手机与可访问性边界

已验证桌面 Edge 的 390px / 768px 响应式布局，并保留 900px / 1024px / 1600px / 1920px 工作区与对比测试；导航、五件切换、抽屉、44px 触控入口、邮件复制、键盘焦点及 reduced motion 均有检查。**手机真机未验证**。

人工真机清单：

1. iOS Safari 与 Android Chrome 分别从首页进入旦角，确认首次加载、无横向裁切和文字可读；记录设备、系统、浏览器及网络。
2. Gallery 拖动旋转、双指缩放、五件连续切换、复位、设置展开 / 关闭，横竖屏各一次。
3. 进入 Studio 再返回 Gallery；若有条件，导入一件许可模型并检查材质草稿保护和导出下载。
4. 展开页脚联系，测试 mailto 与复制；开启系统减少动态效果，确认不自动旋转。
5. 连续使用至少 10 分钟并切到后台再回来，记录掉帧、发热、页面重载或 WebGL context loss。任何失败按实记录，不能以桌面模拟替代。

## 候选包与恢复

源码提交：`e2b27252c8ecea32299b9eee7f0357a21c25d439`，已推送 `feature/codex-v5-exhibition`。文档与截图在其后的独立提交，不改变包内代码。

- ZIP：`test-out/FORMA-V5-RC2-Exhibition-e2b2725.zip`，25,322,769 字节。
- SHA256：`f34196bf861ab9553f63a961b6caeff23baf3c105fb9e20a23cc07d82cd169ac`。
- 静态闭包：93 个文件 / 30,177,823 字节；另含 README、STATIC-BUILD 和 SOURCE 三份交付元数据。
- 实际 ZIP 解压至新目录后直接启动，**22/22 验收通过**；93 文件完整 SHA256 与 SOURCE 匹配，三份元数据也与打包目录一致。
- [解压包 Gallery 实际截图](evidence/rc2/package-gallery.png) / [无后端 Studio 实际状态](evidence/rc2/package-studio.png)。该检查不再重打包或补文件。

RC2 是独立静态候选包，不包含 backend、用户资产库、API Key 或账户资料。源码完整版用 `npm ci` 后 `npm start`；静态包在解压目录运行 `node serve.mjs`，首页 `http://127.0.0.1:5173/#/`，展厅 `/#/gallery`，完整 Studio `/#/studio` 需要本地后端。包内不需 npm 安装，浏览器不能以 file:// 直接加载。

本轮开始时，RC1 的 `test-out/forma-v5-rc1-gallery-final/` 展开目录仍存在，但旧报告所述最终 ZIP 未找到。已保留该目录，并在改动前从 83453aa 重建 `test-out/FORMA-RC1-reconstructed-83453aa.zip`；该文件明确是重建件，不能冒充原 ZIP 的相同字节。RC2 使用另一目录与文件名，绝不覆盖 RC1。

安全回看旧版可在新的空路径执行 `git worktree add --detach <新的空目录> 83453aafbc1dd8f8885f05d5ab9d1c3215218b65`。不要在原工程执行 reset / clean；原工程 `docs/ARCHITECTURE.md` 的格式修改仍为用户保留。

## 修改位置与后续工作

运行界面：`src/pages/home.js`、`work.js`、`src/ui/shell.js`、`gallery.js`、`contact.js`、`brand.js`、`styles/exhibition.css`、`styles/v5.css`、`index.html`。状态和渲染：`main.js`、`core/router.js`、`core/viewer.js`、`state/viewState.js`、`models/place.js`、`lighting/environment.js`、`studio/core.js`、`ui.js`、`toolbar.js`。模型：`loaders/normals.js`、`models/catalog.js`、新增 exhibition-v1 / exhibition 资源及对应生成、采集与测试工具。

下一阶段优先级：P1 技术美术局部面部拓扑 / 法线边界；真实手机验收；收到批准的最终文件后独立接入 Logo。worker、大文件传输、复杂 FBX、多 UV、KTX2、批任务取消恢复继续作为专项，不借此次展陈改造全面扩展后台系统。
