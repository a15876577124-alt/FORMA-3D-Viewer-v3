// 可复用处理预设：由真实算子组合而成，参数全部落在 schema 声明范围内。
// UI 与 CLI 共用同一份，避免「界面预设」与「实际执行」不一致。
import { OP_SCHEMA, validateSchema } from './schema.mjs';

export const PIPELINE_PRESETS = [
  {
    id: 'repair',
    label: '保真整理',
    desc: '适合已有正确材质的 GLB/GLTF：去重并清理未引用资源。不重建法线、不改金属度、不减面或缩图；没有重复资源时可能无体积收益。',
    ops: [
      { op: 'dedup', params: {} },
      { op: 'prune', params: {} },
    ],
  },
  {
    id: 'web',
    label: 'Web 展示优化',
    desc: '资源去重与几何量化；保持材质与纹理分辨率。量化有精度损失，适合常规静态 Web 展示，精密模型须对比检查，不保证所有模型都会变小。',
    ops: [
      { op: 'dedup', params: {} },
      { op: 'prune', params: {} },
      { op: 'quantize', params: { quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizationVolume: 'mesh' } },
    ],
  },
  {
    id: 'lightweight',
    label: '轻量化交付',
    desc: '减面 + 贴图缩放 + 去重清理。会改变外观，执行前需确认。',
    ops: [
      { op: 'weld', params: { epsilon: 1e-5 } },
      { op: 'simplify', params: { ratio: 0.5, error: 0.001 } },
      { op: 'textureResize', params: { maxSize: 1024 } },
      { op: 'dedup', params: {} },
      { op: 'prune', params: {} },
    ],
  },
];

// 校验所有预设的算子名与参数是否合法（启动时自检，避免预设失效）
export function validatePresets() {
  const errors = [];
  for (const preset of PIPELINE_PRESETS) {
    for (const { op, params } of preset.ops) {
      if (!OP_SCHEMA[op]) { errors.push(`预设 ${preset.id} 引用了未知算子 ${op}`); continue; }
      try {
        validateSchema(op, params);
      } catch (e) {
        errors.push(`预设 ${preset.id} 的 ${op} 参数非法：${e.message}`);
      }
    }
  }
  return errors;
}

export function getPreset(id) {
  return PIPELINE_PRESETS.find((p) => p.id === id) || null;
}
