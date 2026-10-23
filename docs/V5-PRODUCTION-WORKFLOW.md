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
