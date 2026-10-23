# 第三阶段技术来源与兼容性

未增加新的生产依赖，继续使用锁文件内的 Three.js 0.186.1（MIT）、glTF Transform 4.5.1（MIT）、meshoptimizer 1.3.0（MIT）、Sharp 0.35.5（Apache-2.0）、Khronos glTF Validator 2.0.0-dev.3.10（Apache-2.0）。测试模型与美术资源许可单独记录于 `test-assets/licensed/README.md`；软件库许可不推定覆盖任意艺术素材。

## 本轮采用

- 静态包沿用 postprocessing 6.39.5（Zlib）和 Three.js 内嵌 fflate 0.8.2（MIT）。原许可分别保存在 `vendor/postprocessing/LICENSE.md`（从已锁定 npm 包逐字复制）、`vendor/fflate/LICENSE`（[上游 v0.8.2](https://github.com/101arrowz/fflate/blob/v0.8.2/LICENSE)，Git blob e84f0d6caca033c62946025c0237a499459af698）、既有 `vendor/three/LICENSE`，均纳入静态清单。未修改第三方实现代码。

- [glTF 2.0 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)：按 bufferView/byteStride/sparse/normalized 与节点 TRS/矩阵语义修正实际读取和场景边界。复用 Three.js 的矩阵计算，没有新增数学依赖。
- [Blender 2.93 FBX 导出器](https://github.com/blender/blender-addons/blob/blender-v2.93-release/io_scene_fbx/export_fbx_bin.py)：核对 alpha、roughness、metallic 的 FBX 连接命名，仅使用文件格式语义，没有复制 GPL 源码。适配器只对已核实 Blender 2.93.x 实施，其他导出器不猜测映射。
- [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html) 与 [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)：沿用浏览器导入与导出，服务端用既有 glTF Transform/Sharp 恢复和打包通道，保持原资产只读。
- Puppeteer Core **25.16.0 / Apache-2.0** 替换开发依赖 22.15.x，移除受影响旧下载/代理链。准确版本与传递依赖在 package-lock.json；[官方运行要求](https://pptr.dev/guides/system-requirements) 为 Node 22.12+。实测 Node 24.22.0、Windows Edge 155/CDP；不宣称所有 Node/浏览器版本均通过。无浏览器自动下载、无生产库升级。

## 评估后暂不引入

- [ufbx](https://github.com/ufbx/ufbx)：MIT/公有领域选项的 C 库，语义覆盖较广；Node 服务需原生/WASM 桥接和 Windows 构建验证。当前已证实的五通道问题可由现有依赖修复，不值得为单个样本引入二进制维护成本。厂商材质、复杂动画/骨骼作为后续专项。
- [Khronos KTX-Software](https://github.com/KhronosGroup/KTX-Software)：主项目采用 [Apache-2.0，第三方组件保留各自许可](https://github.com/KhronosGroup/KTX-Software/blob/main/LICENSE.md)，采用时还需按实际分发版本复核。KTX2/Basis 可解决 GPU 压缩和传输成本，但需要编码器分发、颜色空间/法线质量与浏览器转码矩阵验证。当前 JPEG/WebP 仅是文件压缩，本轮不冒称 KTX2 已实现。

最终 Logo 不属于这些技术来源。只有用户确认的文件或提交可进入 `assets/brand/`，现有品牌组件保留文字回退。
