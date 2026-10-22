# TASK_STATE — FORMA V5 Ultimate AI 3D Creation Platform 开发状态

> 断点续作文件。每次会话开始先读这里；每完成一个里程碑立即更新。
> **当前阶段：已移交 Codex（2026-10-22）——WorkBuddy 不再继续修改本目录。**
> 更新时间：2026-10-22 15:40 (UTC+8)

## 当前状态（V5.4 工程交接，2026-10-22）

- **分支**：`feature/forma-v5-experience`（与 `origin` 同步；未合并 `main`，未 force push）
- **代码基线**：`665eff6`（V5.3 收尾）；交接文档与发布校验在其后一个提交
- **本轮完成**：
  1. 静态发布清单与可复现打包：新增 `tools/static-release.mjs`（依赖闭包校验 + `docs/STATIC-MANIFEST.json` + `--pack` 打包）与 `tools/static-pack-test.mjs`（真打包 + 真浏览器加载）
  2. `.gitignore` 增补 `dist/`；`package.json` 增补 `release:verify` / `release:pack` / `test:release`
  3. 新增 `docs/CODEX-HANDOFF.md`（A–G 七部分）；修正 `docs/ARCHITECTURE.md` 里已删除的 `src/ui/pipeline.js` 引用
  4. README / TASK_STATE / CHANGELOG / KNOWN-ISSUES 对齐 V5
- **测试基线（2026-10-22 15:31 全量实测）**：`node tests/run.mjs` **19/19 组全绿，约 706 条断言**
  vendor 24 文件 / vendorscan 10 / assets 200 / release 16 / pipeline 50 / agent 36 /
  ops 63 / opparams 44 / batch 20 / compare 29 / fbxtex 58 / proxy 5 / server 7 /
  render 56（5/5 展品）/ ui 26 / import 12 / extended 6 / workspaces 21 / layout 47
- **静态包**：83 文件 / 30,099,590 字节（约 29 MB），五展品全部可加载，零 404
- **启动验证**：`tools/launch.mjs` 实测后端 8899 + 前端 5277 + `/api` 反代 + `main.js` 全 200
- **下一轮起点**：交给 Codex。优先级见 `docs/CODEX-HANDOFF.md` G 节（P0 = 决定 Pages 发布路径并做线上回归）

### V5.4 新增的发布边界（勿破）

- 公开展厅只能引用**仓库内已跟踪文件**。`assets/library/`、`pipeline-out/`、`backend/workspace/`、
  `assets/variants/`、`test-assets/` 出现在静态闭包里即视为失败（`tools/static-release.mjs` 会报错）。
- 静态包必须能独立启动：`#/gallery?work=<id>` 能加载五件手办，`#/studio` 如实显示「后端未运行」。
- 不要用 Git LFS 发 Pages（会读到指针文件）。

## 历史：V5.1 第三轮（2026-10-21 23:01）

- **分支**：`feature/forma-v5-experience`（当时本地 ahead 5 未推送，现已全部推送）
- **本轮完成**：V5.1 任务二 ✅ / 任务六 ✅ / 任务七 ✅（详见下方「V5.1 已完成」）
- **测试基线（2026-10-21 23:00 全量验证）**：`node tests/run.mjs` **16/16 组全绿**
  vendor 24 文件 / vendorscan 10 / assets / pipeline 50 / agent 36 / ops 63 /
  opparams 44 / batch 20 / compare 29 / fbxtex 58 / proxy 5 / server / render 56 /
  ui / import 10(+2 skip) / extended 6
- **浏览器验收补充**：home-deck 7/7、route-test 19/19、compare-ui 11、fbxtex-ui 8
- **下一轮起点**：V5.1 剩余任务（若有）→ M5 演示交付物 / Pages 验证 → 合并 main

### V5.1 已完成（第三轮）

| 任务 | 内容 | 关键文件 |
|------|------|----------|
| 任务七 | Before/After **真实**双模型对比（此前是占位壳） | `backend/runPipeline.mjs` 回传 before/after 相对路径；`backend/server.mjs` 新增 `/api/file/<rel>`（目录+扩展名白名单、resolve/realpath 防穿越、走路径段而非 query 以保 gltf 相对引用）；`src/core/compare.js` CompareRig 挂真实模型；`tools/compare-ui-test.mjs` 11 断言（47,512→19,003 tris 真实差异） |
| 任务六 | FBX 贴图内嵌/外部/缺失三态检测 + 内嵌提取 | `backend/fbxTree.mjs`（自研 Kaydara 节点树 parse/serialize，修复 EndOffset=0 与 footer 保留）、`backend/fbxTextures.mjs`、`backend/analyze.mjs` 三态诊断、`GET /api/assets/:id/textures` + `POST .../extract-textures`、`tools/make-fbx-texture-samples.mjs` |
| 任务二 | 首页改为软件启动台 | `src/pages/home.js` 2×2 启动卡（展厅/AI Studio/导入/资产库）、`src/state/appState.js` 作零请求状态源、`styles/v5.css` `.v5-launch-*`、`tools/home-deck-test.mjs` 7 断言 |

### V5.1 本轮修掉的真实 bug

1. **确认门死循环**：`sendError` 把 `needConfirm/token` 只塞进 `error` 对象，前端 `e.data?.needConfirm`
   恒为 undefined → 所有外观算子在 UI 上连续 409 无法执行。改为顶层回传
   `needConfirm/token/riskyOps/reasons`，UI 提示带具体原因。
2. **路由图层化遗留验收失败**（4 组）：V5 把 3D 展厅做成常驻图层后，只有 `#/gallery`
   激活时 `#app` 才可见；默认落地页变成启动台后，`extended/render/ui/import` 全部失效
   （render 组 canvas 恒 1×1，5 件展品像素断言 0/5）。统一改为落地 `#/gallery` 并等待图层可见。
3. **vendor 扫描器误判**：`IMPORT_RE` 把字符串字面量 `'import'`（启动卡 key、`/assets/import`
   端点）当模块说明符，且 `postprocessing` 被判为未 vendored。改为语句锚定 + 支持动态
   import，允许清单从 `index.html` 的 importmap 读取；新增 `tools/vendor-scan-selftest.mjs`
   （10 条正负样本）接入 `tests/run.mjs`。
4. **跨组污染**：`batch` 断言同 assetId 的**历史**版本都含 weld，而 ops/opparams 组会留下
   simplify 算子链版本 → 改为只断言本组这次批量真正产出的版本。

### V5.1 新增的坑（下一轮直接看这里）

- `/api/file/<rel>` 必须走**路径段**而非 query，否则 .gltf 的 .bin / 贴图相对引用解析不到
- FBX 二进制节点树：`EndOffset=0` 表示到文件尾；尾部 footer 必须原样保留，否则 three
  FBXLoader 报 `Cannot read properties of undefined (reading 'parents')`
- three FBXLoader 在 Node 下会丢内嵌贴图，所以三态检测走自研 `fbxTree.mjs` 而非 loader
- `render/extended/ui/import` 这些依赖 3D 图层的浏览器验收组**必须落在 `#/gallery`**
- compare-ui 必须显式挑 `.glb` 资产——workspace 里混入 FBX 会破坏 glTF 算子链
- `tests/run.mjs` 才跑 vendor 检查；单组回归 `--only=<group>` 不会覆盖它
- `import` 组两条 OBJ 用例依赖仓库外素材
  `D:\Qiong Opera Reimagined\_Coze_Drive_3D模型生成项目_...\3D模型v5_OBJ\01_生角`
  （原 `D:\琼韵新生\...`，2026-10-21 用户改名），缺失时按 SKIP 处理，
  可用 `--objDir=<路径>` / `FORMA_OBJ_DIR` 覆盖

## 当前状态（V5.2 Gallery / AI Studio 差异化重构，2026-10-22 03:55）

- **分支**：`feature/forma-v5-experience`
- **本轮完成**：Gallery 观展模式 + AI Studio 五区工作区 + 工作流闭环（`2ad304e`）
- **测试基线**：`node tests/run.mjs` **17/17 组全绿**（新增 `workspaces` 组 21 断言）
  vendor / vendorscan / assets / pipeline 50 / agent 36 / ops 63 / opparams 44 /
  batch 20 / compare 29 / fbxtex 58 / proxy 5 / server / render 56 / ui 26 /
  import 12 / extended 6 / workspaces 21
- **浏览器补充验收**：compare-ui 12/12、fbxtex-ui 8/8、home-deck 7/7、route-test 19/19
- **下一轮**：继续 V5 高级功能计划（详见下方里程碑清单），合并 main 前需用户确认

### V5.2 架构要点（下一轮直接看这里）

- **两种模式共用一套渲染**：单一 `Viewer` / 单一 canvas / 单一 WebGL 上下文。
  差异全部来自 `body.mode-gallery` / `body.mode-studio` 与各自的面板容器。
- **Gallery**：`src/ui/gallery.js`。右栏只留观展项；材质 + 后期搬进
  `#glDrawer`（高级控制台抽屉，同一个 DOM 节点搬家，功能不复制）。
  生产工具在 Gallery 下 `display:none`。新增「展厅」布光预设（美术馆三点光）。
- **Studio**：`src/studio/`（core 无 DOM + tree / panes / dock / toolbar / ui）。
  五区：顶部工具条 / 左资源树 / 中央视口 / 右 Lab 坞 / 底部任务 Dock。
- **路由坑（已修，勿回退）**：
  1. 复用同一 DOM 节点时**不能**丢弃新路由的 instance——此前 `#/studio`
     会错调 Gallery 的 `enter()`（本次重构才暴露）。
  2. 每次进入都要刷新 `layer.ctx`，否则 `enter({query})` 解构出 undefined。
  3. Gallery/Studio 必须用**单例图层对象**注册，否则 `?work=<id>` 这类
     不同 cacheKey 会各自再建一份面板（重复 DOM）。
- **抽屉是 fixed 覆盖层**：会挡住右栏与顶栏右侧控件，真实点击类验收
  （tools/test-ui.mjs）用到了 `closeAdvanced()` 先收起。
- **依赖 3D 图层的浏览器验收组**（render / ui / import / extended）必须落在
  `#/gallery`，否则 `#app` 隐藏、canvas 恒 1×1。

### V5.3（2026-10-22 04:30）：联系方式 + 可调整工作区

- **联系方式**：`src/ui/contact.js` 一处定义、首页（区块）与作品详情页（紧凑条）复用；
  公共页脚已移除邮箱列，避免同页重复。复制有 execCommand 真实回退。
- **可调整工作区**：`src/studio/layout.js` + `styles/studio.css`
  - 三个手柄（左树宽 / 右工具面板宽 / 底 Dock 高），Pointer Events 一套代码覆盖鼠标与触控
  - 尺寸只写 CSS 变量 `--st-sidebar / --st-inspector / --st-dock-h`，栅格列宽引用变量
  - 安全边界：dock 上限按视口剩余空间实时算，中央视口恒 ≥ 240px；拖到极限仍可拖回
  - 双击手柄恢复默认、Dock 折叠只留 40px 头部（展开入口常驻）、键盘方向键/Home/End/Enter
  - localStorage 按 gallery/studio 分别保存，窗口与缩放变化时重新 clamp
  - Gallery：可拖/折叠右侧辅助栏，不显示底部任务区；窄屏（≤780px）隐藏手柄用折叠
- **修掉的真实缺陷**：`#app` 原写死 `height:100dvh`，与 V5 顶栏相加超出一屏，
  会把底部 Dock 挤出屏幕。改为百分比高度链（shell→page→#app 每级都有确定高度），
  否则 `.viewport { height:100% }` 会退化成按 canvas 固有尺寸撑高。
- **验收**：新增 `tools/layout-ui-test.mjs` 42 断言（真实鼠标/键盘事件驱动）；
  全量 `node tests/run.mjs` **18/18 组**通过。

### V5 已完成（V5.1 第三轮）

| 任务 | 内容 | 关键文件 |
|------|------|----------|
| 任务七 | Before/After **真实**双模型对比（此前是占位壳） | `backend/runPipeline.mjs` 回传 before/after 路径；`backend/server.mjs` 新增 `/api/file/<rel>`；`src/core/compare.js`；`tools/compare-ui-test.mjs` |
| 任务六 | FBX 贴图内嵌/外部/缺失三态检测 + 内嵌提取 | `backend/fbxTree.mjs`、`backend/fbxTextures.mjs`、`backend/analyze.mjs`、`GET /api/assets/:id/textures`、`POST .../extract-textures` |
| 任务二 | 首页改为软件启动台 | `src/pages/home.js`、`src/state/appState.js`、`styles/v5.css`、tools/home-deck-test.mjs |

## 当前状态（V5 第一轮）

- **分支**：`feature/forma-v5-experience`（基于 `feature/ai-asset-pipeline` @ `0141480`）
- **上游分支**：`feature/ai-asset-pipeline` = `0141480`（173 断言 + 同步修复，已推送远程）
- **当前里程碑**：M0 ✅ / M1 ✅ / M2 ✅（a: hero 3D、b: 视角预设、c: RoomEnvironment）/ **M3a 详情页 ✅ / M4a /studio 路由 ✅** → 下一 M3b Before/After 对比区 → M4b Asset Lab 深化 → M5/M6/M7
- **远程同步**：⬜ 本地 ahead 5（`edb3951`…`5f42166` 未推送）；远程停在 `1e06a02`
- **测试基线**：见上方「V5.1 第三轮」——全量 16/16 组（2026-10-21 23:00 验证）。
  旧基线 173 断言（pipeline 50/agent 36/ops 63/batch 19/proxy 5）已被新基线覆盖
- **五手办完好**：sha256 前 8 位 6ce3cb51/640e77d3/2290c617/390a8b5b/1c5a7822 与 assetId 一致

### V5 已建立的关键设施（M1–M2c）
- **V5 设计系统**：styles/tokens.css（--v5-* 命名空间）+ styles/v5.css（外壳/组件/反馈）
- **hash 路由**（src/core/router.js）：常驻图层模式（canvas 永不 detach）、LRU 缓存、
  `enter/unmount` 生命周期、`/:legacyId` 兼容旧锚点、`#/gallery?work=<id>` 深链接
- **视觉验收工具**（tools/shot.mjs）：headless Edge + SwiftShader WebGL、多视口、
  像素分析、`MSYS_NO_PATHCONV=1` 必须加（否则 --route=/ 被 Git Bash 转成路径）
- **Hero3D**（src/pages/home3d.js）：独立渲染器、postprocessing 6.39.5（vendor 化、
  Zlib）、底对齐归一化、视口外暂停、完整 dispose
- **viewer 升级**：setViewPreset(yaw,pitch)（保持距离）、scene.environment=
  RoomEnvironment（激活 V3 既有「环境反射」滑杆——勿再新增独立 env 滑杆，
  会与 override.js snapshot 机制冲突）
- **首页**（src/pages/home.js）：hero 3D + 真实指标 + 展品索引 + 能力入口
  （未实装页面不放入口）；`__FORMA.v5.navigate` / `__FORMA.actions.viewPreset`

### V5 已知坑（M1–M2c 踩过）
- V3 `select()` 曾写 `history.replaceState('#sheng')` 劫持 hash 路由（已修复：V5 下跳过）
- `__FORMA.info` 形状 = `{modelTris, modelVerts, renderTriangles, memory...}`
- `select()` 返回 boolean 非 Promise；waitModel 等 `info.modelTris > 0`
- headless 下 `file://` 不可用，必须 http://；`networkidle2` 永不空闲，用 `domcontentloaded`
- 后台服务器用 run_in_background（nohup 会被回收）；shot.mjs 自带 spawn serve
- Poly Haven 下载超时（沙箱网络白名单外），HDRI 用 RoomEnvironment 替代

### 下一步（M2d → M3）
1. M2d：展厅导览模式（上一件/下一件键位与按钮）、移动端展厅适配验收、性能自适应
2. M3：五手办详情页 `#/work/:id`（热点注释、真实技术参数、Before/After 入口）
3. M4：Asset Studio 升级（Inspector/Material/Geometry/Texture Lab 接现有算子）
4. 每步：shot.mjs 截图 → 审查 → commit → push（网络恢复后先推积压 3 提交）

## ✅ V5-M0 重大发现：浏览器阻塞已解除（2026-10-20 05:40 验证）

此前的「测试浏览器无法启动」阻塞**不复存在**（环境已恢复，与 10-15 日正常时一致）：
- `msedge.exe` 可启动；`--headless=new` + `--enable-unsafe-swiftshader` + `--use-angle=swiftshader` 下 **WebGL 2.0 可用**（ANGLE/SwiftShader 软件渲染）
- headless + puppeteer-core 22.15.0 打开真实站点：`__FORMA.ready` 通过、`select('sheng')` 后 ~5s 加载完成、`modelTris=47512`/`modelVerts=26951` 与 ground truth 精确一致、**零控制台错误**
- 真实截图 `test-out/v5-render-probe/sheng-hero.png`（1440×900）：生角手办/头饰/脸谱/展台阴影/三栏 UI 全部真实呈现；像素分析 nonBg=21.4%、luma σ=53（有内容有层次）
- 坑：`info` 字段形状是 `{modelTris, modelVerts, renderTriangles, memory...}`（不是 tris/verts）；`select()` 返回 boolean 非 Promise；`file://` 协议 headless 下不可用，必须走 `http://127.0.0.1`
- **结论：V5 全部视觉验收（截图审查、桌面/移动端、Before/After、性能回归）均可自动化闭环**
- SwiftShader 为软件渲染：复杂后期场景耗时上升，探针/测试需给足超时（页面级 90s+）

## 旧状态存档（V3/Pipeline 阶段，2026-10-16）

- Pipeline 阶段里程碑 M0–M6 全部完成（详见 git log 与 CHANGELOG）
- 远程 `feature/ai-asset-pipeline` 已同步；Pages（main 分支）仍为 v3 展示器，HTTP 200

## ✅ M0.5 LLM Spike 结论（2026-10-16 15:30）

- **独立 Node 进程可持续调用 WorkBuddy 云服务 LLM**：`models.list()` 380ms；连续流式 chat 调用 6.9s/3.9s 均成功
- **Origin 匹配未构成阻碍**：Node 进程（无 Origin 头）可直接调用，服务端以 publishableKey 认证
- 云服务应用已激活：`wbapp_fIlxy8R4EAkGCA3ubnQhE6`（FORMA资产管线），billing=normal
- **可用模型 32 个**（全部 supportsToolCall=true）：`auto`、`glm-5.3`/`glm-5.3-flash`、`deepseek-v4-pro`/`deepseek-v4-flash`、`kimi-k2.7`、`hunyuan-2.0-thinking`、`step-5-preview` 等
- 选型初判：日常分析/Agent 用 `glm-5.3-flash` 或 `deepseek-v4-flash`（快+工具调用）；复杂推理可升级 pro 级
- 注意：部分模型带 reasoning（如 auto 实测 215 thinking tokens，首答 6.9s）——Agent 场景要容忍思考延迟
- 凭据形态：`backend/publicConfig.json`（公开配置，可入仓库）；长期密钥只进 `backend/.env`（已 gitignore）
- Spike 脚本：`tools/llm-spike.mjs`

## 🟢 已解除：测试浏览器无法启动（2026-10-16 发现 → 2026-10-20 解除）

> **2026-10-20 更新**：环境自行恢复，headless Edge + WebGL 2.0（SwiftShader）完整可用，
> 真实站点渲染与截图验证通过（见上方 V5-M0 节）。以下排查记录存档。

**现象**：Puppeteer 启动 Edge 报 `Failed to launch the browser process!`；npm test 的 render 组失败，其余组通过。

**已排除**：
- ~~沙箱进程创建限制~~——沙箱外（dangerouslyDisableSandbox）同样失败；notepad 可在沙箱内启动
- ~~Edge 单例冲突~~——14:29 失败时用户 Edge 尚未启动（用户实例 14:38 才起）；且失败早于用户启动
- ~~user-data-dir 残留/锁~~——全新 mkdtemp 目录同样失败；清理 8 个残留 profile 无效
- ~~安装目录损坏~~——复制整个版本目录到 `D:\FORMA-tmp\edge-copy` 后同样 0.2s 秒退
- ~~Chromium 自身 sandbox~~——`--no-sandbox` 无效
- ~~IFEO 映像劫持~~——注册表无相关项
- ~~改名绕过~~——副本改名后同样秒退（只走到 Crashpad 阶段）

**特征**：msedge.exe 任意位置/参数组合均在 0.2 秒内 exit 0 无输出，连 `--version`、`--v=1 --enable-logging` 都零输出；profile 只创建 `Crashpad` 即止。**同一套测试 10-15 日正常运行**（suite-2026-10-15T19-58-40-566Z 7/7 通过），说明环境在此期间发生了变化。

**进行中**：安装 Playwright 自带 Chromium（独立二进制）做区分实验——若 Playwright Chromium 可启动则为 Edge 特定问题；若同样秒退则为系统级浏览器进程拦截。

**后备方案**：
1. browser-test.mjs 增加 `FORMA_CDP_URL` attach 模式（连接用户桌面已启动的带调试端口浏览器，TCP 走 127.0.0.1 不受影响）
2. render 测试交由用户在本机桌面运行一次并归档结果
3. 不阻塞 M1-M5 开发（后端/分析/Agent 开发不需要浏览器；UI 完成后统一处理）

## ✅ M1 完成（2026-10-16 15:45）

**后端架构**（`backend/`，仅监听 127.0.0.1）：
- `server.mjs`：HTTP API（health/models/assets import+analyze+report）；CORS 仅本机前端源
- `analyze.mjs`：分析器——GLB/GLTF 深度解析（网格/图元/材质/贴图/动画/蒙皮/边界盒）；OBJ/FBX 走 three.js loaders
- `validate.mjs`：上传三重校验（魔数 + 扩展名白名单 + 256MB 上限）
- `paths.mjs`：目录穿越防护（safeJoin + realpath 校验 + 资产 ID 字符白名单）
- `llm.mjs`：云服务 LLM 客户端封装（models 缓存 10min、pickAgentModel、chat）
- `texture-sniff.mjs`：PNG/JPEG/WebP 真实尺寸解析

**已验证**（tests/pipeline.test.mjs，50 断言）：
- 5 个手办 GLB verts/tris 与 ground truth 逐一精确一致；贴图 2048x2048 真实解析
- GLTF（外嵌 buffer/贴图）、OBJ（未焊接诊断）、FBX ASCII/二进制（含动画、蒙皮）真实解析
- 安全：伪造魔数 415 / 穿越文件名清洗 / workspace 外零写入 / 危险扩展名 415 / 空文件 415 / 恶意 id 403 / 陌生 Origin 无 CORS 头
- 已知实现细节：three loaders 输出非索引化几何体（FBX/OBJ 每面独立顶点）——分析器如实报告
- FBX Node Buffer → ArrayBuffer 转换（three `new Uint8Array(buffer, from, to)` 语义）

**npm scripts**：`npm run pipeline:serve`、`npm run test:pipeline`

## ✅ M2 完成（2026-10-17）

**关键实测**：SDK 网关**真实转发原生 tools 参数**——`deepseek-v4-pro`/`glm-5.3-flash`/`kimi-k2.7` 均返回 `finish_reason='tool_calls'` + 分片 `delta.tool_calls`（name 首片完整、arguments 逐字符分片）。主力 `deepseek-v4-pro` 首轮工具调用 2.0s。

**Agent 架构**（`backend/agent/`）：
- `tools.mjs`：8 工具单一真源（list_assets/analyze_asset/propose_ops/run_op/verify/compare/export_asset/finish），handler 经 ctx 注入，mutating/confirm 标记
- `toolAccumulator.mjs`：分片累积 + 容错 JSON 解析（括号配平重试）+ index 升序
- `llmStream.mjs`：透传 tools/tool_choice，采样 rawChunkSample 作「AI 决策」证据
- `agent.mjs`：主循环（native/prompt 双协议、多轮回灌、死循环检测、maxRounds/maxToolCalls/墙钟上限、执行日志落盘 `workspace/assets/<id>/runs/<runId>.json`）
- `fakeLlm.mjs`：离线回放，供无网自动化测试
- `paths.mjs` +`safeJoinPipeline`/`safeJoinLibrary`（pipeline-out/、assets/library/）
- `server.mjs` +4 路由（`/api/agent/tools`、`/api/agent/run`、`/api/agent/runs/:runId`、`/api/agent/runs`）

**「证明是 LLM 决策」三重证据**（tests/agent.test.mjs 36 断言）：
1. rawChunkSample 含 delta.tool_calls；dispatchTool 只接受日志 toolCalls，服务端无默认 op 填充
2. 反证测试：朴素规则首推 simplify，Agent 首推 textureResize，两者不同（非规则冒充）
3. `FORMA_LLM_OFFLINE=1` 抛 503 且零轮次、pipeline-out 无新增

**真实模式验证**：`sheng` dryRun 端到端 2 轮完成，list_assets→analyze_asset，LLM 自发识别出 workspace 中 sheng/passwd 是同一文件重复导入。

**npm scripts**：`npm run test:agent`、`npm run agent:spike`

## ✅ M3 完成（2026-10-17）

**依赖排查结果**：`@gltf-transform` 之前确实未安装（状态记录有误，已更正）。现成功安装并**真实验证可用**：
- `@gltf-transform/core/extensions/functions` 4.5.1（84 函数）
- `meshoptimizer` 1.3.0（MeshoptSimplifier，simplify 用）
- `sharp` 0.35.5（原生二进制正常，textureResize/Compress 用）

**算子架构**（`backend/ops/` + 编排 `backend/runPipeline.mjs`）：
- 成熟库算子（gltf-transform）：weld/dedup/prune/simplify/quantize/join
- sharp 自研：textureResize/textureCompress（compact 重建 BIN，丢弃旧贴图字节）
- 自研：genNormals（法线生成，源自 fix-glb 算法）/ fixMaterials / setSampler / textureReport / convert（glb↔gltf↔obj；FBX 只进不出）
- `index.mjs`：注册表 + 参数校验 + 能力门控 + 链式执行
- `policy.mjs`：琼剧红线（appearance 算子 + 5 手办 prune/dedup 强制确认）
- `gate.mjs`：HMAC 确认门 token（10min 有效）
- `verify.mjs`：后验（容器/重解析/字节级切片哈希/贴图字节/单调性断言/bounds）

**关键修复**：
- `glbkit.readAccessor` 支持 interleaved bufferView（byteStride）——gltf-transform 常见输出
- `analyze.analyzeFile` 传完整路径（gltf 外部 .bin/贴图正确 dirname）
- `verifyPair` 逐算子「输入 vs 输出」对比（中间产物）；convert 后验适配 gltf/obj 格式

**验证**（tests/ops.test.mjs 63 断言）：能力探测、13 算子独立执行+后验、simplify tris 真实下降、textureResize 贴图 2048→1024 且体积下降、convert fbx 400、确认门 409、链式执行、原始素材 sha256 全程不变、runAssetPipeline 端到端（版本目录+report+verify）。

**npm scripts**：`npm run test:ops`、`npm run op:demo`

## ✅ M4 完成（2026-10-17）

**批量**（`backend/batch.mjs`）：`runBatch({assetIds, ops, concurrency:2, confirmToken})`——批量级确认门（gate 的 generateBatchConfirmToken）→ 逐资产派发真实执行；`tests/batch.test.mjs` 19 断言：5 手办 weld+genNormals+fixMaterials 5/5 成功、每资产 verify 通过、原始 sha256 全程不变、BATCH 报告落盘。

**资产库**（`backend/library.mjs`）：`listLibrary`（扫描 pipeline-out 版本）/ `publishAsset`（只复制不移动，产物到 `assets/library/` 可上 Pages）/ `deleteLibraryFile`（safeJoinLibrary 防穿越）/ `listPublished`。

**前端加入展厅**（不动 viewState SCHEMA、只追加 `__FORMA` 字段）：
- `src/state/appState.js`：独立 key `forma3d.v4.app`（mode + library + recentRuns）
- `src/models/library.js`：library 条目转 FIGURINES 同构 entry（id 前缀 `lib:`）
- `src/main.js`：`resolveEntry` 加 libraryMap；`__FORMA.appState` + `__FORMA.library.addEntry()`
- `src/ui/sidebar.js`：`addLibraryEntry`（「资产库」组，badge ★）

**server 路由**：`POST /api/batch/run`、`GET /api/library`、`GET /api/library/published`、`POST /api/assets/:id/publish`、`DELETE /api/library/:file`（CORS 加 DELETE）。

**npm scripts**：`npm run test:batch`、`npm run batch:demo`

## ✅ M5 完成（2026-10-17）

**反向代理**（`serve.mjs`）：`/api/*` → `127.0.0.1:8787`（方法/头/体透传，后端不可达 502 `backend_unavailable`）；前端用同源 `/api` 消灭 CORS 与随机端口问题。`tests/proxy.test.mjs` 5 断言（200 透传 / 502 降级 / 静态不受影响）。

**Pipeline 工作模式 UI**（`src/ui/pipeline.js`，惰性连接启动零请求）：
- 连接后端（health/ops/tools/models/assets）→ 资产下拉 + 算子勾选（风险 ⚠ 标记）+ 执行处理（确认门 409 → 二次确认）+ AI 分析（agentRun + 日志流）+ Before/After 滑条 + 加入展厅
- `src/net/api.js`：同源 API 客户端（ApiError 携带 status/data 用于确认门）

**Before/After 对比**（`src/core/compare.js` CompareRig）：同场景同相机，两个 group 相反法线 clippingPlanes 滑动对比；不写 cache、不接管 modelRoot；`viewer.js` +`pin/unpin`（_evictCache 跳过 pinned）。

**集成**（`src/main.js`）：顶栏「管线」按钮切换 `mode-pipeline`；面板挂右栏顶部；`__FORMA.pipeline` / `__FORMA.appState` / `__FORMA.library` 只追加；`setMode()`。

**CDP 方案**（`tools/browser-test.mjs`）：`FORMA_CDP_URL` 环境变量 → `puppeteer.connect`；启动指引 `docs/demo/README.md`。

**已知**：UI 渲染（面板/对比/截图）需 CDP 或用户本机浏览器验证（沙箱起不了 Edge）；代码已语法检查通过，逻辑待真实渲染确认。

**npm scripts**：`npm run test:proxy`

## 里程碑清单

| ID | 内容 | 状态 |
|----|------|------|
| M0 | 基线标签 + 功能分支 + 备份 + .gitignore + 本文档 | ✅ 完成（render 受阻见阻塞） |
| M0.5 | WorkBuddy 云端 LLM 独立 Node 进程连通性 Spike（阻断门） | ✅ 通过（见下） |
| M1 | Node 后端骨架（http/https API）+ 真实 GLB/GLTF/OBJ/FBX 分析闭环 | ✅ 完成（50/50） |
| M2 | AI Agent 工具链（真实 LLM + 工具调用 + 执行日志 + 后验） | ✅ 完成（36/36 + 真实跑通） |
| M3 | 非破坏式处理算子 + Before/After 3D 对比（Day1 出口：单模型全流程） | ✅ 完成（63/63） |
| M4 | 批量处理 + 资产库 + 加入展厅 | ✅ 完成（19/19） |
| M5 | 专业 UI/UX（Pipeline 工作模式）+ 性能 | ✅ 完成（proxy 5/5；UI 代码就绪待 CDP 验证） |
| M6 | 测试 + 演示交付物 + 文档 + GitHub 同步 + Pages 验证 | ✅ 完成（173 断言 + 文档 + 远程同步） |

## 外部依赖状态

| 依赖 | 状态 | 备注 |
|------|------|------|
| GitHub 仓库 `a15876577124-alt/FORMA-3D-Viewer-v3` | ✅ 已推送 8 提交、公开、Pages 在线 | 演示 <https://a15876577124-alt.github.io/FORMA-3D-Viewer-v3/> |
| `feature/ai-asset-pipeline` 分支远程同步 | ⬜ 待推送 | 沙箱 git push 通道不稳定（502/schannel），失败时请求用户 GitHub Desktop 推送 |
| WorkBuddy 云服务 LLM | ⬜ M0.5 验证 | 环境变量 `WORKBUDDY_VLM_AUTH_TOKEN` 存在；需 `connect_cloud_service` 取短期凭据 |
| Blender | ❌ 不可用 | FBX 走 three.js FBXLoader 离线烘焙路线 |
| npm registry | ✅ 可用 | gltf-transform 4.5.1 已装（见 package.json） |

## 安全约束（每次涉及资产处理时自查）

1. 处理服务**仅监听 127.0.0.1**，禁止 0.0.0.0
2. 上传文件必须验证魔数与扩展名（GLB=`glTF`、GLTF=JSON、OBJ 文本、FBX=`Kaydara FBX Binary`）
3. 所有文件路径必须解析后限制在 workspace 根内（防目录穿越）
4. API 密钥只进 `backend/.env`（已 gitignore），禁入前端/日志/仓库
5. **绝不删除或覆盖 `assets/raw/` 原始素材**；处理输出只写 `pipeline-out/<name>-v<N>/`

## 已完成的验收基线（v3.0.0）

- 5 个琼剧手办 GLB：字节级完好（与 200/200 校验一致）
- 线上 Pages 渲染实测：生角 95,804 drawn triangles，控制台零错误
- 回归测试：7/7 组（RTX 4060 真实渲染，56 断言）

## 关键路径速查

- 项目根：`D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3`
- 原始素材：`assets/raw/`（禁动）
- 测试输出：`test-out/`（可再生）
- 备份：`D:\FORMA-backups\2026-10-16\FORMA-v3-baseline-*.tar.gz`（208 MB，含全部源文件）
- 计划终稿：`C:\Users\a1587\.workbuddy\plans\toasty-nebula-einstein-E_Cdgbsj.md`
