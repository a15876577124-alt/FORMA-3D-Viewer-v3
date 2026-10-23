# FORMA 处理算子与后验

> 2026-10-23 阶段 2：GLB/GLTF 通过统一 NodeIO 转换，完整资源包导出/发布、版本选择、材质保存和 FBX→GLB 工作版本已验证。实际覆盖与限制见 [生产闭环记录](V5-PRODUCTION-WORKFLOW.md)。

## 算子清单

| 算子 | 实现 | 外观影响 | 说明 |
|---|---|---|---|
| `weld` | gltf-transform | 否 | 合并重复顶点（量化容差） |
| `dedup` | gltf-transform | 否 | 合并重复 accessor/材质/贴图 |
| `prune` | gltf-transform | 否* | 移除未引用的数据 |
| `simplify` | gltf-transform + meshoptimizer | **是** | 减面（ratio + error），高风险 |
| `quantize` | gltf-transform | **是** | 顶点/属性量化 |
| `join` | gltf-transform | 否* | 合并图元 |
| `genNormals` | 自研（源自 fix-glb 算法） | **是** | 面积加权平滑法线 + 方向校正 |
| `fixMaterials` | 自研 | **是** | metallicFactor/roughnessFactor 归正 |
| `setSampler` | 自研 | 否 | 三线性 + mipmap + REPEAT |
| `textureReport` | 自研 | 否 | 只读贴图尺寸/字节报告 |
| `textureResize` | sharp | **是** | 缩放贴图（compact 重建 BIN） |
| `textureCompress` | sharp | **是** | WebP/JPEG 有损压缩 |
| `convert` | glTF Transform NodeIO + OBJ writer | **是** | GLB↔GLTF，含依赖包；GLB/GLTF→OBJ+MTL；FBX/OBJ 需先生成 GLB 工作版本，无 FBX 输出 |
| `setMaterial` | glTF Transform | **是** | 指定材质参数保存为 Edited 版本，并验证几何与纹理未改 |

\* 琼剧手办命中 `prune`/`join` 等仍强制确认（红线见 `docs/SECURITY.md`）。

## 确认门

- `appearance=true` 或命中琼剧红线的算子，未携带有效 HMAC token 时返回 `409 { needConfirm, token, riskyOps, reasons }`，**不写盘**。
- token 10 分钟有效，绑定 `assetId + baseVersion + ops`（批量绑定整组资产）。
- `dryRun` 模式只返回 `wouldApply`，不写盘（供 AI Agent 决策阶段）。

## 后验（每算子「输入 vs 输出」）

`backend/verify.mjs` 对每个算子逐项断言：

1. **容器**：合法 GLB/GLTF/OBJ。
2. **重解析**：`analyzeFile` 能解析，且无 `error` 级 issue。
3. **字节级切片哈希**（append-only / 纯 JSON / 只改贴图的算子）：POSITION/indices/TEXCOORD_0 语义数据一致。
4. **贴图字节**（未涉贴图的算子）：image bufferView 切片 sha256 一致。
5. **单调性**：weld→verts↓/tris 不变；simplify→tris↓；dedup/prune/quantize/join→tris 不变；genNormals→verts/tris 不变且法线出现；fixMaterials→metallic 变化；textureResize→贴图变小；convert→几何一致。
6. **边界盒**：几何语义保持算子尺寸不漂移。

任何断言失败 → `verify.pass=false`，如实记录在 `verify.json`。

## 版本化输出

```
pipeline-out/<assetId>-v<N>/
  model.glb            # 最终产物
  report.before.json   # 处理前分析
  report.after.json    # 处理后分析
  ops.json             # 算子链 + 参数 + 结果 + 策略
  verify.json          # 后验结论
  CHANGE.txt           # 变更摘要
```

版本号 `<N>` 递增，通过排他 mkdir 在异步处理前保留目录，避免并发覆盖。失败任务的目录保留、不复用；失败状态展示尚待完善。
