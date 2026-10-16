# FORMA 演示与浏览器验收（CDP 方案）

## 为什么需要 CDP

开发环境的沙箱无法启动本地 Edge（进程级静默退出，`--version` 都无输出），但你在桌面正常启动的 Edge 完全可用。因此渲染类验收（UI 面板、Before/After 对比、截图、短视频）通过 **CDP attach** 连接你桌面已启动的浏览器完成。

## 一次性启动（供测试连接）

在 Windows 终端（PowerShell 或 cmd）运行一次：

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\forma-cdp-profile" `
  about:blank
```

保持这个窗口开着（不要关闭）。它会启动一个独立的 Edge 实例，仅用于自动化，不影响你的日常浏览。

## 运行渲染验收

另开一个终端（在你的桌面环境，非沙箱）：

```powershell
cd D:\haorongli09\FORMA-3D-Viewer-琼剧五手办版\FORMA-3D-Viewer-v3
$env:FORMA_CDP_URL = "http://127.0.0.1:9222"
npm test
```

`tools/browser-test.mjs` 检测到 `FORMA_CDP_URL` 后改用 `puppeteer.connect`，连接上述 Edge 实例完成 render/ui/import/extended 各组的真实渲染断言与截图。

## 无浏览器自动化组（随时可跑，不依赖 CDP）

```bash
npm run test:pipeline   # 分析/后端/安全（50 断言）
npm run test:agent      # AI Agent 工具链（36 断言）
npm run test:ops        # 处理算子 + 后验（63 断言）
npm run test:batch      # 批量 + 资产库（19 断言）
npm run test:proxy      # /api 反向代理（5 断言）
```

## 端到端演示（求职用）

```bash
# 1. 启动后端（仅本地监听）
npm run pipeline:serve

# 2. 启动展厅（含 /api 反代）
npm start

# 3. 浏览器打开 http://127.0.0.1:5173 ，点顶栏「管线」进入工作模式
```

CLI 演示：

```bash
npm run op:demo -- --asset=assets/raw/sheng.glb --ops=weld,genNormals,fixMaterials
npm run batch:demo    # 5 手办批量处理 + 发布到资产库
```
