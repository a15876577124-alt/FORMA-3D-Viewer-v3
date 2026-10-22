# CODEX-HANDOFF — FORMA V5 工程交接说明

> 面向接手的 **Codex**（或任何后来者）：这是唯一一份「按当前代码事实写成」的交接文档。
> 里边的路径、命令、测试数字都来自 2026-10-22 的实际执行，不是计划稿。
> 文档与代码不一致时，**以代码和测试为准**，并顺手修正本文档。

---

## A. 项目基本信息

| 项 | 值 |
|---|---|
| 项目名称 | FORMA 3D — 琼剧数字手办展厅（V3 品牌）→ V5「Ultimate AI 3D Creation Platform」 |
| 对外定位 | 一个可离线运行的 3D 展厅（Gallery）+ 一个本地 AI 资产工作区（AI Studio） |
| GitHub | <https://github.com/a15876577124-alt/FORMA-3D-Viewer-v3> |
| 开发分支 | `feature/forma-v5-experience` |
| 代码基线 SHA | `665eff6`（V5.3 最后一个功能提交：隐藏左栏滚动条） |
| 交接提交（HEAD） | 本文件所在提交。取法：`git log -1 --format=%H`。未合并 `main`，未 force push |
| 本地工程绝对路径 | `D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3` |
| 原始素材（仓库外） | `D:\Qiong Opera Reimagined\_Coze_Drive_3D模型生成项目_琼剧Q版玩偶_琼剧Q版玩偶_OBJ模型\3D模型v5_OBJ\` |
| 备份 | `D:\FORMA-backups\2026-10-16\FORMA-v3-baseline-*.tar.gz`（208 MB，v3 基线） |
| 许可 | 五件手办为本项目原创资产；Technical Demos 为 three.js 内置几何体拼装，非建模作品 |

**技术栈**

| 层 | 实现 | 说明 |
|---|---|---|
| 前端 | 原生 ES Module + `<script type="importmap">`，**无打包器、无框架、无 TS** | 改完刷新即可，不需要 build |
| 渲染 | three.js **r186**，全部 vendored 到 `vendor/` | 完全离线；`node_modules` 不参与前端运行时 |
| 后期 | `postprocessing` 6.39.5，vendored（Zlib） | 首页 Hero3D 用 EffectComposer |
| 样式 | 手写 CSS：`styles.css`（V3 基座）+ `styles/tokens.css` + `styles/v5.css` + `styles/studio.css` | CSS 变量驱动布局（`--st-sidebar` 等） |
| 后端 | Node 原生 `http`，仅监听 `127.0.0.1:8787` | 无 express/koa |
| 资产处理 | `@gltf-transform/*` 4.5.1、`meshoptimizer` 1.3.0、`sharp` 0.35.5 | 运行期**动态 import**，缺失时能力门控 |
| LLM | `@tencent-ai/workbuddy-cloud-sdk`（OpenAI 兼容网关） | 主力模型 `deepseek-v4-pro` |
| 测试 | 自写 runner（`tests/run.mjs`）+ Node `node:test` + `puppeteer-core` 驱动本机 Edge | headless + SwiftShader WebGL2 |
| 运行环境 | Node **v22.22.2**（实测）、npm 10.9.7、Windows 10/11 | `engines.node >= 18` |

---

## B. 工程架构

### B.1 一张图看清

```
index.html
  └─ (inline) 动态注入 <script type="module" src="./src/main.js">   ← file:// 防御
       └─ src/main.js
            ├─ core/viewer.js        ← 唯一 Viewer / 唯一 WebGL 上下文 / 唯一 canvas
            ├─ core/router.js        ← hash 路由，常驻图层（DOM 不销毁，只切 hidden）
            ├─ ui/shell.js           ← V5 外壳：顶栏 / 导航 / 页脚
            ├─ pages/home.js         ← 启动台（4 张卡）
            ├─ pages/work.js         ← 作品详情 #/work/:id
            ├─ ui/gallery.js         ← Gallery 观展图层 #/gallery
            ├─ studio/ui.js          ← AI Studio 五区工作区 #/studio
            └─ net/api.js            ← 同源 /api 客户端（serve.mjs 反代到 8787）

serve.mjs (5173, 静态 + /api 反代)
  └─ backend/server.mjs (8787, 仅本机)
       ├─ analyze.mjs / validate.mjs / paths.mjs / texture-sniff.mjs
       ├─ fbxTree.mjs + fbxTextures.mjs   ← FBX 三态与内嵌提取（自研解析）
       ├─ ops/*                           ← 14 个算子
       ├─ runPipeline.mjs + policy.mjs + gate.mjs + verify.mjs
       ├─ agent/*                         ← AI Agent（native tools）
       ├─ batch.mjs / library.mjs         ← 批量 + 资产库
       └─ workspace/                      ← 用户上传与运行日志（gitignore）
```

### B.2 前端入口与外壳

- `index.html`：静态外壳 + importmap + `file://` 兜底提示。**入口 script 是动态注入的**（`document.createElement('script')`），因为 `file://` 下静态 module 会失败但页面照常渲染，表现为「黑屏无提示」。改入口相关的东西必须保留这个机制。
- `src/main.js`（约 540 行）：装配 Viewer、外壳、路由、Gallery/Studio 图层、`__FORMA` 自动化接口。
- `src/ui/shell.js`：只列**已实装**路由；页脚不重复邮箱（联系方式在首页/详情页）。

### B.3 Three.js Viewer（`src/core/viewer.js`）

职责：**全站唯一的渲染器**。

- 单一 `WebGLRenderer` + 单一 canvas，挂在 `#app` 的 `.viewport` 里。
- 影棚灯光（`src/lighting/studio.js`，含 `gallery` 美术馆预设）、离线 IBL（PMREM + `RoomEnvironment`，无 HDRI 文件）、VSM 接触阴影、径向 AO 贴片。
- 材质覆盖（`src/materials/override.js`）：原始 / 陶瓷 / 亚光 / 金属 / 自定义。**默认档完全不动模型材质**。
- 后期（`src/post/composer.js`）：辉光三档。
- 展品切换：LRU 缓存（移动 2 / 桌面 5），`pin/unpin` 供 Before/After 使用。
- `viewer.info` = `{ modelTris, modelVerts, renderTriangles, memory… }` —— 注意字段名不是 `tris`。
- `applyResize()` 由 `ResizeObserver`（观察 `.viewport`）+ 布局拖拽显式调用。

### B.4 路由与图层（`src/core/router.js`）

**这是本项目最容易踩坑的地方，改之前先读源码。**

- hash 路由（`#/`、`#/gallery`、`#/work/:id`、`#/studio`，以及旧锚点 `#sheng` → 重定向）。
- **常驻图层模式**：页面 DOM 挂载到 `#outlet` 后**永不销毁**，切换只改 `hidden`。原因：canvas 一旦 detach，WebGL 上下文可能丢失，重建代价与风险都高。
- 每条路由持有一个 **instance**（`enter/leave`）。同一个 DOM 节点被两条路由复用时，**不能丢弃新路由的 instance**——历史 bug：`#/studio` 会错调 Gallery 的 `enter()`。
- 每次进入都要刷新 `layer.ctx = { params, query, path }`，否则 `enter({ query })` 解构出 `undefined`。
- Gallery / Studio 用**单例图层对象**注册（`src/main.js`），否则不同 `cacheKey`（如 `?work=<id>`）会各建一份面板 → 重复 DOM。

### B.5 Gallery 数字展厅（`src/ui/gallery.js` + `styles/studio.css`）

定位：**观展，不是生产**。保留大视口，把专业参数收进抽屉。

- `buildGalleryMode()` 生成：观展信息卡、观展动作条（最佳视角 / 展厅布光 / 导出 PNG / 高级控制台）、可折叠右栏（`#glRailToggle` / `#glRailRestore`）。
- 高级控制台 `#glDrawer`：把材质与后期控件**搬家**（同一个 DOM 节点），不复制功能。
- Gallery 下生产工具（导入、算子、批量、导出管理）`display:none`。
- body 类 `mode-gallery`（与 `mode-studio` 互斥）驱动布局。

### B.6 AI Studio 专业工作区（`src/studio/`）

五区结构，全部由 CSS Grid + 变量驱动：

| 区域 | 容器 | 文件 |
|---|---|---|
| 顶部工具条 | `#studioToolbar`（workspace 首部） | `toolbar.js` |
| 左资源树 | `#studioTree`（`.sidebar` 内） | `tree.js` |
| 中央视口 | `.viewport`（**复用 Viewer**） | `ui.js` |
| 右 Lab 坞 | `#studioRail`（`.inspector-body`） | `panes.js` |
| 底部 Dock | `#studioDock`（workspace 尾部） | `dock.js` |

- `studio/core.js`（480 行）：**无 DOM** 的工作流内核。连接状态机、资产、算子参数、确认门、分析、AI Agent、批量、Before/After、导入、发布、导出、版本。对外只发事件（`connecting/online/offline/assets/select/analyze/textures/run/batch/agent/history/compare/confirm/progress/log/export/publish/imported`）。
- `studio/ui.js`：装配五区 + 三个拖拽手柄 + 模式生命周期（`enter()` / `leave()`）。
- `studio/layout.js`：布局系统，见 B.7。
- `panes.js`：Asset Inspector（后端 analyze 报告）/ Material Lab（**真实读写** THREE 材质属性 + 快照还原）/ Geometry Lab（逐网格 UV/法线/蒙皮/包围盒）/ Texture Lab（实时贴图 + FBX 三态 + 内嵌提取）/ Export Manager（真实 convert + 下载 + 发布）。
- `dock.js`：处理 / Agent 日志 / 执行历史 / 结果验证 四页签。

### B.7 布局系统（`src/studio/layout.js`）

- 状态只写 CSS 变量与 body 类：`--st-sidebar / --st-inspector / --st-dock-h`，栅格列宽引用变量。**不移动 canvas、不重建 Viewer**。
- 三个手柄：左树宽 / 右面板宽 / Dock 高。Pointer Events 一套代码覆盖鼠标与触控；`role="separator"` + 方向键 / Home / End / Enter；双击恢复默认。
- 安全边界（`LIMITS`）：sidebar 216–520、inspector 280–620、dock ≥132、视口 ≥240px 高 / ≥300px 宽、折叠头 40px。
- **Dock 上限按视口剩余空间实时算**（不是固定比例），保证拖到极限后仍能拖回来。
- 持久化：`localStorage['forma3d.v5.layout']`，gallery / studio 分别保存；窗口或缩放变化时重新 clamp。
- 状态类打在 `document.body`（`st-dock-collapsed` / `gl-rail-hidden`）——打在 `#app` 上不生效（CSS 选择器在 body 层）。

### B.8 后端服务（`backend/server.mjs`）

硬性约束（**不要放宽**）：

1. 仅监听 `127.0.0.1`（`HOST` 写死）。
2. 上传三重校验：魔数 + 扩展名 + 大小（`validate.mjs`，上限 256 MB）。
3. 所有路径经 `safeJoin` 限制在 workspace 内（防目录穿越，`paths.mjs`）。
4. CORS 仅允许 `127.0.0.1:5173` / `localhost:5173` / 自身端口。
5. 密钥只进 `backend/.env`（已 gitignore，**当前不存在**）。

API 一览（`route(METHOD, path)`）：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 健康检查（前端「连接后端」探针） |
| GET | `/api/models` | 云端可用 LLM 列表 |
| POST | `/api/assets/import` | base64 上传（写 `workspace/assets/<id>/original.<ext>`） |
| GET | `/api/assets` | 资产列表 |
| POST | `/api/assets/:id/analyze` | 真实分析 → 报告 |
| GET | `/api/assets/:id/report` | 读取报告 |
| GET | `/api/assets/:id/textures` | FBX 贴图三态 |
| POST | `/api/assets/:id/extract-textures` | 提取内嵌贴图（只写新文件） |
| GET | `/api/agent/tools` | 8 个 Agent 工具定义 |
| POST | `/api/agent/run` | 跑 Agent（SSE/JSON） |
| GET | `/api/agent/runs/:runId` · `/api/agent/runs` | 执行日志 |
| GET | `/api/ops` · `/api/ops/capabilities` · `/api/presets` | 算子 / 能力 / 预设 |
| POST | `/api/assets/:id/run` | 执行算子链（确认门 409） |
| POST | `/api/batch/run` | 批量（批量级确认门） |
| GET | `/api/library` · `/api/library/published` | 资产库扫描 / 已发布 |
| POST | `/api/assets/:id/publish` | 发布到 `assets/library/` |
| DELETE | `/api/library/:file` | 删除已发布文件（防穿越） |
| GET | `/api/file/<rel>` | **安全文件服务**（目录 + 扩展名白名单，走路径段而非 query） |

> `/api/file/<rel>` 必须走**路径段**：`.gltf` 的 `.bin` / 贴图是按相对路径解析的，塞进 query 会全部 404。

### B.9 AI Agent（`backend/agent/`）

- `tools.mjs`：8 工具单一真源（`list_assets / analyze_asset / propose_ops / run_op / verify / compare / export_asset / finish`），handler 经 ctx 注入，标 `mutating` / `confirm`。
- `toolAccumulator.mjs`：`delta.tool_calls` 分片累积 + 容错 JSON 解析（括号配平重试）。
- `llmStream.mjs`：透传 `tools` / `tool_choice`，采样 `rawChunkSample` 作为「AI 真的决策了」的证据。
- `agent.mjs`：主循环（native / prompt 双协议、多轮回灌、死循环检测、`maxRounds` / `maxToolCalls` / 墙钟上限、日志落盘 `workspace/assets/<id>/runs/<runId>.json`）。
- `fakeLlm.mjs`：离线回放，供无网测试（`FORMA_LLM_OFFLINE=1` 必须失败且零轮次）。

### B.10 资产分析器（`backend/analyze.mjs`）

- GLB/GLTF 自研深度解析（`tools/glbkit.mjs` 读 accessor，支持 interleaved bufferView）。
- OBJ / FBX 走 three.js loaders（Node 端）。
- 输出：网格 / 图元 / 材质 / 贴图（真实像素尺寸）/ 动画 / 蒙皮 / 边界盒 + 诊断规则。
- **FBX 贴图不用 three FBXLoader**：它在 Node 下没有 `URL.createObjectURL`，内嵌贴图会被静默丢弃 → 用自研 `fbxTree.mjs`（Kaydara 二进制节点树 parse/serialize）。

### B.11 算子系统（`backend/ops/`）

14 个算子，注册在 `ops/index.mjs`，参数 schema 在 `ops/schema.mjs`：

| 组 | 算子 |
|---|---|
| geometry | `weld` `dedup` `prune` `simplify`★ `quantize`★ `join` `genNormals`★ `fixNormalsOrientation`★ |
| material | `fixMaterials`★ `setSampler` |
| texture | `textureReport` `textureResize`★ `textureCompress`★ |
| container | `convert`★（glb↔gltf↔obj；FBX 只进不出） |

★ = 影响外观，走确认门（`policy.mjs` 琼剧红线 + `gate.mjs` HMAC token，10 分钟有效）。

- 非破坏式：读 `workspace/assets/<id>/original.*` → 写 `pipeline-out/<name>-v<N>/`。
- `verify.mjs` 后验：容器重解析、切片哈希、贴图字节、单调性断言、bounds。
- 能力门控：`capabilities.mjs` 动态 import 探测 gltf-transform / sharp / meshoptimizer，不可用时**明确报错**，绝不假执行。

### B.12 导入与导出

- 前端导入（`src/loaders/importers.js`）：GLB / glTF（含 .bin 与贴图）/ OBJ+MTL+PNG / FBX。拖放与文件对话框等价；失败给中文明确提示，**不弄脏当前舞台**。
- Studio 导入：`POST /api/assets/import`（base64）→ 后端写 `original.<ext>` → 资产树刷新。
- 导出：`Export Manager` 调 `convert` 出 glb/gltf/obj，产物在 `pipeline-out/`，前端给下载链接（`/api/file/<rel>`）。

### B.13 模型发布流程

```
导入 (workspace/assets/<id>/original.glb)
  → 分析 (report.json)
  → 选算子 / AI 建议 → 执行 (pipeline-out/<name>-vN/ + report + verify)
  → Before/After 对比（同场景同相机，双模型裁剪平面滑动）
  → 发布 (复制到 assets/library/<file>.glb，只复制不移动)
  → 加入展厅（appState.library + sidebar「资产库」组，id 前缀 lib:）
```

**发布产物是本机状态，不入库**（见 C.4 与 `docs/STATIC-MANIFEST.json`）。公开站点不依赖 `assets/library/`。

---

## C. 本地运行说明

### C.1 环境

- Windows 10/11，Node **20 或 22 LTS**（实测 v22.22.2）。
- 浏览器：Edge 或 Chrome（测试默认找 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，可用 `FORMA_EDGE` 覆盖）。
- 不需要 GPU 也能跑测试：headless 走 SwiftShader 软件 WebGL2（慢但真实）。

### C.2 依赖安装

```bash
cd "D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3"
npm ci          # 严格按 package-lock.json（首次或换机用这个）
# npm install   # 需要改动依赖时用
```

> 前端运行时**不读 `node_modules`**（three/postprocessing 已 vendored）。`node_modules` 只服务后端算子、分析器与测试脚本。

### C.3 启动

| 方式 | 命令 | 说明 |
|---|---|---|
| **一键（推荐）** | 双击 `FORMA.bat` | 起后端 8787 + 前端 5173，健康检查通过后打开 `#/studio`；关窗口即停 |
| 只开展厅 | 双击 `启动展厅.bat` | 只起静态前端 5173，无 AI 功能 |
| 手动（全量） | `npm run pipeline:serve`（终端 A）+ `npm run serve`（终端 B） | 等价于一键启动 |
| 只开前端 | `npm run serve` | 展厅 / 首页 / 详情页可用；Studio 显示「后端未运行」 |

端口：前端 `5173`（`PORT` 可改）、后端 `8787`（`FORMA_BACKEND_PORT` 可改）。
`serve.mjs` 把 `/api/*` 反代到后端，前端一律走同源相对路径 —— **不要**让前端直连 8787，否则 CORS 与随机端口会一起爆炸。

### C.4 测试

```bash
npm test                       # 全量 19 组（自带服务器，约 3 分钟）
npm test -- --only=layout      # 单组
npm run test:release           # 静态发布包验收（打包 + 真浏览器加载）
npm run release:verify         # 只校验静态清单（不启浏览器，秒级）
npm run release:pack           # 生成 dist/（可上传 Pages，约 29 MB）
npm run shots                  # 五展品截图 → docs/demo/frames/
```

组名：`vendor` `vendorscan` `assets` `release` `pipeline` `agent` `ops` `opparams` `batch` `compare` `fbxtex` `proxy` `server` `render` `ui` `import` `extended` `workspaces` `layout`。

报告落在 `test-out/suite-<时间戳>/`，`suite-report.json` 是机器可读汇总。

### C.5 需要额外配置的服务

| 服务 | 是否必需 | 说明 |
|---|---|---|
| WorkBuddy 云 LLM | AI 分析/Agent 才需要 | `backend/publicConfig.json` 已含 endpoint + **publishableKey**（设计上公开、可入库）；长期密钥如需增强走 `backend/.env`（当前不存在） |
| 无网环境 | — | 展厅完全离线可用；Studio 的 AI 分析会失败并给出原因，算子仍可本地执行 |

---

## D. 已完成功能（按模块，标注真实程度）

| 模块 | 状态 | 真实程度 / 证据 |
|---|---|---|
| 五件琼剧手办加载与渲染 | ✅ | 顶点/三角形与 ground truth 逐一一致（26951/47512、28662/46828、28472/49178、27361/47852、26720/46939）；`render` 组 56 断言 + 5/5 展品像素校验 |
| 影棚布光 / 材质 / 后期 / 背景 / 展台 | ✅ | `ui` 组 26 断言真实点击；四套灯光 + 「展厅」美术馆预设 |
| 相机交互（拖拽/滚轮/触控/预设） | ✅ | `extended` 组真实鼠标拖动 + 移动视口取景 |
| 沉浸模式 / 截图 / 快捷键 | ✅ | `ui` 组覆盖；截图走应用自身管线（最高 4×） |
| 逐展品参数持久化 | ✅ | `viewState` schema 3，独立 key |
| 首页启动台 | ✅ | 4 张卡（展厅 / AI Studio / 导入 / 资产库），`home-deck` 7 断言 |
| 作品详情页 `#/work/:id` | ✅ | 真实参数 + mini viewer + 联系方式 |
| Gallery 观展模式 | ✅ | 信息卡 / 动作条 / 高级抽屉 / 可折叠右栏；`workspaces` 21 断言 |
| AI Studio 五区 | ✅ | 顶栏 / 树 / 视口 / Lab / Dock；`workspaces` 21 断言（含「WebGL 上下文唯一」与三次往返稳定性） |
| 可调整工作区（拖拽 + 键盘 + 持久化） | ✅ | `layout` 组 **47 断言**，真实 pointer 事件 + 极限回弹 + 刷新保持 + 三档视口 |
| 首页/详情联系方式（双邮箱 + 复制） | ✅ | `layout` 组真实点击复制（剪贴板被拒时退回 `execCommand`） |
| 模型导入（GLB/GLTF/OBJ/FBX） | ✅ | `import` 组 12/12（含外部 .bin + PNG、FBX 蒙皮动画） |
| FBX 贴图三态 + 内嵌提取 | ✅ | `fbxtex` 组 58 断言；自研 Kaydara 解析 |
| 资产分析 | ✅ | `pipeline` 组 50 断言（5 GLB 精确 + GLTF/OBJ/FBX ASCII/二进制） |
| 14 个处理算子 + 后验 | ✅ | `ops` 63 断言（逐算子执行 + verify + 原始 sha256 不变） |
| 确认门 / 琼剧红线策略 | ✅ | 409 + token 二次提交；`opparams` 44 断言 |
| 批量处理 | ✅ | `batch` 20 断言（5 手办 5/5 成功） |
| Before/After 真实双模型对比 | ✅ | `compare` 29 断言 + `compare-ui` 12 断言（47,512 → 19,003 tris 真实差异） |
| AI Agent（真实 LLM + 工具调用） | ✅ | `agent` 36 断言（含反证：Agent 首推 textureResize，规则会推 simplify） |
| 资产库发布 / 加入展厅 | ✅ | `batch` + 手工验证；产物只复制不移动 |
| 静态发布清单与打包 | ✅ | `tools/static-release.mjs` + `release` 组 16 断言（真打包、真浏览器、五展品全过、零 404） |
| Windows 一键启动 | ✅ | `tools/launch.mjs` 实测：后端 8899 + 前端 5277 + 反代 + `main.js` 全 200 |

**测试基线（2026-10-22 15:31 实测）**：`node tests/run.mjs` → **19/19 组全绿**，约 **706 条断言**。

| 组 | 数量 | 组 | 数量 |
|---|---|---|---|
| vendor | 24 文件 / 43 模块 | ui | 26 |
| vendorscan | 10 | import | 12 |
| assets | 200/200 | extended | 6 |
| release | 16 | workspaces | 21 |
| pipeline | 50 | layout | 47 |
| agent | 36 | render | 56（5/5 展品） |
| ops | 63 | server | 7 |
| opparams | 44 | proxy | 5 |
| batch | 20 | fbxtex | 58 |
| compare | 29 | | |

---

## E. 未完成及已知问题

> 按「会不会坑到接手人」排序。没有一条是致命的，但都不该被当成「已完成」。

### E.1 功能缺口

1. **Material Lab 无撤销栈**：`src/studio/panes.js` 里材质微调直接写 THREE 材质属性，只有「还原快照」一个粗粒度回退。连续改 20 次只能一次还原。
2. **Geometry Lab 只读**：逐网格 UV/法线/蒙皮统计是只读的，没有「只对选中网格跑算子」的入口——算子仍作用在整份资产上。
3. **Before/After 只对比几何**：`src/core/compare.js` 的双模型是「同一资产的两个版本」，没有材质/贴图差异标注（改了贴图分辨率看不出差别）。
4. **Agent 建议需人工点采纳**：`src/studio/core.js` 的 `adoptAgentSuggestion()` 只采纳「后端日志里真实调用过且算子注册表里存在」的算子——这是刻意的安全设计，不是漏做。但没有「一键采纳全部并预览差异」。
5. **版本管理只有线性列表**：`pipeline-out/<name>-vN` 递增，没有删除/对比任意两版/回滚到某一版的 UI（只能重新跑）。
6. **资产库无缩略图**：发布到 `assets/library/` 的条目 `thumb: null`，展厅里显示 ★ 占位。
7. **批量只支持算子链**：`batch.mjs` 不支持「每件资产用不同算子」，也不能中途取消。

### E.2 已知 bug / 易踩坑

1. **布局状态类必须打在 `document.body`**：打在 `#app` 上 CSS 不生效（选择器在 body 层）。改布局代码时别「优化」这一处。
2. **高度链不能写死 `100dvh`**：`#app` 曾写死 `height:100dvh`，与 V5 顶栏相加超一屏，导致 Dock 被挤到屏幕外；且 `.viewport{height:100%}` 会退化成按 canvas 固有尺寸撑高（实测 1493px）。现为 `shell → page → #app` 每级确定高度。
3. **Studio 左栏唯一滚动容器是 `.sidebar`**：`sidebar-body` 取自然高度，资源树**不**内部滚动。曾因「两个内容各自滚动」导致拖拽手柄被盖住。滚动条按用户要求隐藏（`scrollbar-width:none` + 隐藏 `::-webkit-scrollbar`），滚轮仍可滚。
4. **`#/studio` 曾错调 Gallery 的 `enter()`**：路由器复用 DOM 节点时丢弃了新路由 instance。已修，勿回退。
5. **确认门响应体字段在顶层**：`sendError` 必须把 `needConfirm/token/riskyOps/reasons` 放响应体**顶层**，塞进 `error` 对象会让前端 `e.data?.needConfirm` 恒为 `undefined`，确认流程死循环。
6. **`import` 组两条用例依赖仓库外素材**：`D:\Qiong Opera Reimagined\...\3D模型v5_OBJ\`。目录改名或换机时这两条会 SKIP（不是 FAIL），可用 `--objDir=` 或 `FORMA_OBJ_DIR` 指定。**不要在 CI 里假装它通过**。
7. **headless 剪贴板被拒**：`navigator.clipboard` 在 headless 下常抛 `NotAllowedError`，`src/ui/contact.js` 已退回 `document.execCommand('copy')`。真实浏览器无此问题。

### E.3 性能

1. **首屏模型体积大**：五个 GLB 各 4–6 MB（贴图 2048² 内嵌），合计 25 MB。首次进 Gallery 会串行拉取，移动网络体验差。可考虑：Draco/KTX2（需额外 vendored 解码器）、或缩略图先行 + 按需加载。
2. **单 WebGL 上下文是优点也是约束**：所有模式共用，切换零重建；但也意味着一次只能有一个场景，无法「左右并排两个展品」。
3. **SwiftShader 下渲染测试慢**：单个浏览器组 20–60 秒，全量约 3 分钟。别在循环里加 sleep 硬等，用 `waitForFunction`。
4. **`pipeline-out/` 会无限增长**：当前本机已 **1.9 GB**（历史测试产物）。没有清理策略。

### E.4 UI / UX

1. **Gallery 高级抽屉是 `position:fixed` 覆盖层**，会盖住右栏与顶栏右侧控件。真实点击类测试必须先 `closeAdvanced()`。
2. **窄屏（≤780px）拖拽手柄被隐藏**，只能折叠——触屏上拖 8px 宽的手柄体验差，这是刻意的取舍。
3. **Studio 首次进入不自动连接后端**（`probe()` 只探一次健康）；后端晚启动时需要手动点「连接」。
4. **错误提示偏技术**：确认门 409 会把算子名与原因直接抛给用户，没有做「人话翻译」。
5. **移动端 Studio 只是「不溢出」**，不是真正可用的移动工作区（五区在 390px 下靠折叠勉强成立）。

### E.5 测试未覆盖

1. **真实手机**（iOS Safari / Android Chrome 真机）：只在桌面模拟移动视口验证过。
2. **复杂生产 FBX**：只覆盖小型真实蒙皮文件；多动画层、BlendShape、非均匀骨骼缩放、特殊材质未测。
3. **并发**：批量是 `concurrency: 2` 串行派发，未做高并发压力测试。
4. **LLM 真实调用**：`agent` 组用 `fakeLlm` 离线回放；真实模型输出不稳定，只做过人工验证。
5. **GitHub Pages 线上回归**：静态包本地验证通过（`release` 组），但**没有**自动化去访问线上 URL 核对。

### E.6 FBX 与纹理兼容性限制

1. 只解析 **Kaydara FBX Binary** 与 **ASCII** 两种；加密/压缩变体不支持。
2. 内嵌贴图只认 `Video` 节点的 `Content`（base64）；引用 `RelativeFilename` 的外部贴图按 FBX 同目录解析**一次**，找不到即判 `missing`，不猜路径、不回退。
3. **FBX 只进不出**：`convert` 算子拒绝 FBX 输出（`400`），因为没有可靠的 Node 端 FBX 写出器。
4. 贴图 MIME 靠**字节嗅探**（`texture-sniff.mjs`），只认 PNG/JPEG/WebP；TGA/DDS/PSD 会被判未知。
5. 非 2 的幂贴图、超大贴图（> `MAX_TEXTURE_SIZE`）只报告不修复。

### E.7 外部依赖 / SDK 限制

1. **WorkBuddy 云 SDK**（`@tencent-ai/workbuddy-cloud-sdk`）：AI 分析的唯一通道。换机器/换账号时 `publicConfig.json` 的 `publishableKey` 可能失效 → 届时 Studio 的「AI 优化」不可用，但**算子链、分析、对比、导出全部仍可用**。
2. **`sharp` 是原生二进制**：换 Node 大版本（如 18→22）可能需要 `npm rebuild sharp`。
3. **测试强依赖本机 Edge 路径**：`FORMA_EDGE` / `FORMA_BROWSER` 可覆盖；CI 上需装 Chrome 或用 `FORMA_CDP_URL` attach 已有浏览器。
4. 无 CI（没有 `.github/workflows`）。

### E.8 发布 / 部署风险

1. **Pages 目前指向 `main` 分支根目录**，而 V5 在 `feature/forma-v5-experience`。**未合并 = 线上还是 V3 版本**。这是当前最大的「看起来完成了其实没上线」风险。
2. **不要用 LFS 发 Pages**：Pages 读到的是指针文件，页面会白。正确做法是 `npm run release:pack` 后整体部署 `dist/`。
3. **`docs/demo/frames/`（11 MB 截图）未入库**，文档里不要引用这些路径，否则远程是断链。
4. 仓库当前 ~215 个跟踪文件 / 约 60 MB（主要是 5 个 GLB × 2 份：`assets/raw/` 原始 + `assets/models/` 修复版）。**不要**再往仓库塞 `assets/variants/`（165 MB 派生件）。

---

## F. 特殊技术注意事项

### F.1 Gallery / Studio 共用 Viewer 的生命周期

- 全站**一个** `WebGLRenderer`、**一个** canvas、**一个** WebGL 上下文。Gallery 与 Studio 的差异**只在容器与 CSS 变量**，不在渲染器。
- `studio.enter()` 做三件事：`layout.setMode('studio')` → 各面板 `hidden=false` → `core.probe()`。`leave()` 反过来并切回 gallery 模式。
- **绝不能**在 `enter()` 里 `new WebGLRenderer()` 或重建 canvas：会导致上下文数量翻倍、显存泄漏、切回来黑屏。
- `workspaces` 组里有一条断言就是「canvas 唯一且上下文复用」，改这块先跑它。
- 模式类 `body.mode-gallery` / `body.mode-studio` **互斥**，不要同时存在。

### F.2 路由缓存与页面隐藏

- 页面 DOM 挂载后不销毁，切走只加 `hidden`。好处：canvas 不 detach、状态不丢、切换即时。
- 代价：**所有页面始终在 DOM 里**。写选择器时别假设「只有一个 `.sidebar`」——Gallery 与 Studio 共用同一个 `.sidebar` 节点。
- 依赖 3D 图层的测试必须**先落到 `#/gallery`** 并等图层可见，否则 `#app` 处于 hidden，canvas 恒 1×1（历史上 4 个测试组因此假失败）。
- LRU 缓存有上限；`viewer.pin/unpin` 保护对比用的两个模型不被回收。

### F.3 Three.js resize 与布局调整

- `ResizeObserver` 观察 `.viewport`，回调里 `renderer.setSize` + `camera.aspect`。
- 拖拽手柄时**每帧都改 CSS 变量**，浏览器会合并布局；必须在 `pointerup` / `requestAnimationFrame` 里显式调 `viewer.applyResize()`，否则画面拉伸。
- `.viewport { height: 100% }` 要求父链每级都有确定高度（见 E.2.2），否则退化成按 canvas 固有尺寸撑高。
- `canvas` 的 CSS 尺寸与 drawing buffer 尺寸是两回事：`test-render` 断言的是 `canvas.width/height`（drawing buffer）。

### F.4 模型版本与来源关系

```
D:\Qiong Opera Reimagined\...\3D模型v5_OBJ\0X_*\*.obj  ← 原始（仓库外，禁改）
  └─(trimesh 转换)→ V2 时代 GLB → tools/extract-glb.mjs → assets/raw/*.glb（只读，sha256 记录在 INDEX.json）
       └─(tools/fix-glb.mjs)→ assets/models/*.glb（运行时加载：补 NORMAL + metallicFactor=0 + sampler）
            └─(后端算子)→ pipeline-out/<name>-vN/
                 └─(publish)→ assets/library/*.glb（公开展厅条目 lib:*）
```

- `assets/raw/INDEX.json` 记录每个原始 GLB 的 sha256 与顶点/三角形数——**这是 ground truth**，测试直接对它断言。
- `assets/models/FIX-REPORT.json` 记录修复参数与每条改动（追加式写回，原 POSITION/UV/贴图字节不动）。
- **绝不覆盖 `assets/raw/`**，`fix-glb.mjs` 也只写 `assets/models/`。

### F.5 FBX 内嵌纹理解析规则

- 用自研 `fbxTree.mjs` 解析 Kaydara 节点树（不用 three 的 FBXLoader，原因见 B.10）。
- 二进制节点：`EndOffset = 0` 表示「到文件尾」；尾部 footer 必须**原样保留**，否则 three FBXLoader 报 `Cannot read properties of undefined (reading 'parents')`。
- 三态判定：`bytes` 有值 → `embedded`；`RelativeFilename` 按 FBX 同目录解析成功 → `external`；其余 → `missing`。
- 提取只写新文件，同名加 `-1/-2` 后缀，**绝不覆盖**。

### F.6 Pipeline 确认门

- 影响外观的算子（★）走 `policy.mjs` 红线判定 + `gate.mjs` HMAC token。
- 第一次请求 → `409 { needConfirm: true, token, riskyOps, reasons }`（**顶层**）。
- 前端带 `confirmToken` 重发 → 执行。
- token 10 分钟有效；批量有独立的批量级 token。
- 5 件手办的 `prune` / `dedup` 强制确认（琼剧红线：不能悄悄改变外观）。

### F.7 Before/After 双模型对比

- `src/core/compare.js` 的 `CompareRig`：同一个 scene、同一台相机，两个 group 用**相反法线的 clippingPlanes** 做滑动分割。
- 两个模型都 `viewer.pin()`，避免 LRU 回收。
- 不写 cache、不接管 `modelRoot`。
- 分割线位置 `0..1`，由 `#stSplit` 滑条驱动；`#stCompareBar` 是控制条。

### F.8 GitHub Pages 静态部署限制

- Pages 只跑静态文件，**没有 `/api`**：Studio 的 AI 分析、算子执行、发布在线上全部不可用（会显示「后端未运行」引导，这是真实降级，不是 bug）。
- 部署来源当前是 `main` 分支根目录。要么合并 `main`，要么把 `dist/` 推到 Pages 分支。
- **不要用 LFS**（Pages 会读到指针文件）。
- 单文件 < 100 MB、站点 < 1 GB：当前静态包 83 文件 / 29 MB，安全。
- `index.html` 的 importmap 是相对路径（`./vendor/…`），所以放在 Pages 子路径（`/FORMA-3D-Viewer-v3/`）也能工作——**别改成绝对路径**。

### F.9 WorkBuddy SDK 依赖与替代方案

- 唯一用途：`backend/llm.mjs` 调云端 OpenAI 兼容网关（`chat/completions` + `tools`）。
- 依赖点很薄：`llm.mjs`（客户端）+ `publicConfig.json`（endpoint + publishableKey）+ `agent/llmStream.mjs`（流式解析）。
- **替代路径**（Codex 若要脱离 WorkBuddy）：
  1. 换任意 OpenAI 兼容 endpoint（改 `llm.mjs` 的 baseURL / key 读取）；
  2. 保留 `tools.mjs` 的 8 工具与 `agent.mjs` 主循环，只换 transport；
  3. `fakeLlm.mjs` 已证明「无网也能跑完整 Agent 流程」，可作为替换后的回归基线。
- 注意：`DEFAULT_AGENT_MODEL = 'deepseek-v4-pro'`，**禁止静默降级到 flash**（否则「AI 决策」的证据链会失真）。

---

## G. 下一阶段建议（按严重程度）

### P0 — 上线一致性（不做就等于没交付）

1. **决定发布路径**：合并 `feature/forma-v5-experience` → `main`（会触发 Pages 更新），还是单独部署 `npm run release:pack` 的 `dist/`。
   - 涉及：`main` 分支、GitHub Pages 设置。
   - 现状风险：线上仍是 V3，任何人打开演示地址都看不到 V5。
2. **线上回归**：合并后手动或脚本访问 `https://a15876577124-alt.github.io/FORMA-3D-Viewer-v3/`，确认 `__FORMA.ready`、五展品可加载、`#/studio` 显示「后端未运行」而不是白屏。
   - 建议新增 `tools/pages-probe.mjs`（复用 `tools/browser-test.mjs` 的 `launchBrowser`，指向线上 URL）。

### P1 — 会持续咬人的技术债

3. **`pipeline-out/` 清理策略**：当前 1.9 GB 且只增不减。
   - 位置：`backend/runPipeline.mjs`（写入）、`backend/library.mjs`（读取）。
   - 建议：加 `keepVersions`（默认 10）+ `npm run pipeline:gc`，删除前校验目标在 `pipeline-out/` 内。
4. **首屏体积**：25 MB 模型串行加载。
   - 位置：`src/models/catalog.js`（`file`）与 `src/core/viewer.js`（加载链路）。
   - 建议：先上缩略图占位 + `IntersectionObserver` 懒加载相邻展品；KTX2 需先 vendored 解码器（`vendor/three/addons/libs/ktx-parse.module.js` + transcoder），不要引 CDN。
5. **Material Lab 撤销栈**：`src/studio/panes.js`。
   - 建议：把「改属性」收敛成一个 `applyMaterialPatch(patch)`，前面挂 50 步环形缓冲；`还原快照` 作为 `undo all`。

### P2 — 功能完善

6. **Before/After 支持材质/贴图对比**：`src/core/compare.js` 目前只切几何。
   - 建议：对比时给两侧不同材质 tint（或在 UI 标注「材质已变更」），并在 `runPipeline` 的 report 里带 `materialDelta`。
7. **Geometry Lab 支持选中网格 + 局部算子**：`src/studio/panes.js` + `backend/ops/schema.mjs`（加 `meshIndex` 参数）。
8. **资产库缩略图**：`backend/library.mjs` 发布时用 `sharp` 渲一张 512²，写 `assets/library/<file>.png`；`src/models/library.js` 的 `thumb` 填上。
9. **版本管理 UI**：`src/studio/dock.js` 的「执行历史」页签加删除/回滚/两版对比入口。

### P3 — 工程质量

10. **CI**：新增 `.github/workflows/ci.yml`，跑 `npm test -- --only=vendor --only=...`（浏览器组需要 `--gpu` 或 headless Chrome）。
    - 注意：`import` 组有 2 条依赖仓库外素材，CI 里应显式 SKIP 并在日志里写明。
11. **`docs/ARCHITECTURE.md` 已过期**：仍写 `src/ui/pipeline.js`（该文件已删除，被 `src/studio/` 取代）。交接时已修正这一行，但整篇仍是 V4 视角，建议按 B 节重写。
12. **测试去 flake**：`layout` / `workspaces` 靠固定 `sleep` 等渲染，慢机器上偶发。建议改成 `waitForFunction` 轮询具体条件。

### P4 — 可选

13. **移动端 Studio**：真正做一套单栏 + 抽屉的手势布局，而不是把五区硬塞进 390px。
14. **多语言**：`src/ui/*` 与 `src/studio/*` 的中文文案目前硬编码，若要做英文站需抽 i18n 表。

---

## 附：Codex 接手第一步（15 分钟）

```bash
cd "D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3"
git status -sb                     # 应为 ## feature/forma-v5-experience...origin/...
git log -1 --format='%H %s'
git rev-parse HEAD                 # 应与 origin/feature/forma-v5-experience 一致
npm ci
npm test                           # 期望 19/19 组全绿
npm run release:verify             # 期望 83 文件 / 约 29 MB，0 问题
```

**必读文件顺序**：

1. `docs/CODEX-HANDOFF.md`（本文）
2. `TASK_STATE.md` 顶部「当前状态」与「路由坑速查」
3. `src/core/router.js`（图层模式 + instance 生命周期）
4. `src/main.js`（路由注册、模式切换、`__FORMA` 接口）
5. `src/studio/layout.js`（布局边界与持久化）
6. `src/studio/core.js`（工作流内核与事件）
7. `backend/server.mjs` + `backend/runPipeline.mjs`（API 与确认门）
8. `backend/ops/index.mjs` + `schema.mjs`（算子契约）
9. `tools/static-release.mjs`（发布边界）

**不要动的东西**：

- `assets/raw/`（原始 GLB，sha256 已记录在 `INDEX.json`）
- `D:\Qiong Opera Reimagined\`（仓库外原始 OBJ 素材）
- `backend/.env`（若将来存在）
- `vendor/` 里的文件（要升级走 `npm run vendor`，别手改）
- Git 历史（不要 rebase / force push / 删除分支）
