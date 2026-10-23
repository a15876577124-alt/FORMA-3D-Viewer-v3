# 设计接入：真实截图索引

61 张 Windows Edge 截图，原图复制，无局部修图。完整来源、字节数和 SHA256 在 [index.json](index.json)。before 页面来自核验的 `253a1ab`，after 页面来自本轮代码。所有资产操作截图使用隔离测试数据，非用户私人模型。

页面对照用于看布局与操作空间；模型品质只看下面的固定机位校准/诊断。页面截图中的模型旋转、视口形状或测试版本不能作为材质修复证据。390 / 768 都是桌面视口模拟，真机未验证。

| 页面 | 之前 | 现在 |
|---|---|---|
| 首页桌面 | [before](before-home-desktop.png) | [after](after-home-desktop.png) |
| 首页 390 / 768 | [390](before-home-390.png) · [768](before-home-768.png) | [390 完整滚动页](design-home-390.png) · [768 完整滚动页](design-home-768.png) |
| 旦角详情桌面 | [before](before-work-dan.png) | [after](after-work-dan.png) |
| 详情 390 / 768 | [390](before-work-390.png) · [768](before-work-768.png) | [390](after-work-390.png) · [768](after-work-768.png) |
| Gallery 桌面 | [before](before-gallery-dan.png) | [after](after-gallery-dan.png) |
| Gallery 390 / 768 | [390](before-gallery-390.png) · [768](before-gallery-768.png) | [390](after-gallery-390.png) · [768](after-gallery-768.png) |
| Studio 桌面 | [before](before-studio-asset.png) | [after](design-studio-1440.png) |
| Studio 390 / 768 | [390](before-studio-390.png) · [768](before-studio-768.png) | [390](design-studio-390.png) · [768](design-studio-768.png) |

桌面长页另验：[1366×768](design-home-1366.png)、[1920 宽](design-home-1920.png)。实际滚轮到达页脚的断言在 design 报告中，不仅是 fullPage 截图。

交互补充：[Gallery 设置](design-gallery-settings-desktop.png)、[手机属性面板](design-studio-properties-390.png)、[品牌减少动态回退](design-brand-static-reduced-motion.png)、[V2 播放结束](design-brand-v2-final.png)。

联系方式仅在公共页脚展开后显示：[首页桌面](home-contact-desktop.png)、[首页 390](home-contact-390.png)、[详情桌面](work-contact-desktop.png)、[详情 390](work-contact-390.png)。

## 同条件跨页面渲染

每张图左为 Gallery、右为 Detail；同一轮严格相同的相机、几何、材质和采样。512×512，DPR 1，MSAA；关闭舞台、阴影和辉光以隔离渲染配置。前后只使用各自实际 renderer profile，不修改模型。完整条件、灯光/材质数值在 [before](calibration-before.json) / [after](calibration-after.json)。

| 模型 | 校准前 | 校准后 |
|---|---|---|
| 生 | [before](calibration-before-sheng.png) | [after](calibration-after-sheng.png) |
| 旦 | [before](calibration-before-dan.png) | [after](calibration-after-dan.png) |
| 红谱 | [before](calibration-before-jing-red.png) | [after](calibration-after-jing-red.png) |
| 黄谱 | [before](calibration-before-jing-yellow.png) | [after](calibration-after-jing-yellow.png) |
| 白谱 | [before](calibration-before-jing-white.png) | [after](calibration-after-jing-white.png) |

[旦角面部诊断](dan-face-diagnosis.png) · [白谱面部诊断](jing-white-face-diagnosis.png)：从左到右为带光原材质、无光基础色、哑光灰模、插值法线；同一固定面部相机。仅临时替换内存材质，未写入资产。灰模仍可见起伏，不宣称 P1-05 全部解决。

五件详情/Gallery 的全部 after 图也在本目录，文件名为 `after-work-<id>.png`、`after-gallery-<id>.png`。

## 性能与独立包

[同机性能 before](performance-before.json) · [after](performance-after.json)。单次样本，不作跨机器或手机性能承诺。

[解压候选包 Gallery](static-pack-gallery.png) · [静态包 Studio 真实离线](static-pack-studio.png)。完整验收见 [设计接入报告](../../DESIGN-INTEGRATION.md)。
