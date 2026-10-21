// 算子参数「单一真源」：后端校验与前端 UI 生成共用同一份声明。
// 铁律：这里声明的每一个参数，都必须被对应算子的 run() 真实读取并影响结果；
//      未声明的参数不会被透传；不存在的参数一律不出现在 UI 上（禁止虚假控件）。
//
// spec 字段：
//   type    'number' | 'integer' | 'enum' | 'bool'
//   label   中文名
//   hint    说明文案（UI 显示为辅助文字）
//   default 默认值（缺失时后端强制补默认值，保证结果可复现）
//   min/max/step 数值约束（number/integer 生效）
//   options [{ value, label }]（enum 生效）
//   unit    可选单位后缀

export const OP_GROUPS = [
  { id: 'geometry', label: '几何' },
  { id: 'material', label: '材质' },
  { id: 'texture', label: '纹理' },
  { id: 'container', label: '容器 / 格式' },
];

export const OP_SCHEMA = {
  // ---------------- 几何 ----------------
  weld: {
    label: '焊接顶点',
    group: 'geometry',
    desc: '按容差合并重复顶点，减少冗余数据。位置、法线、UV 同时接近才合并，不会破坏 UV 接缝。',
    appearance: false,
    params: {
      epsilon: {
        type: 'number', label: '焊接容差', default: 1e-5,
        min: 0, max: 0.1, step: 1e-5,
        hint: '模型空间中的距离阈值。0 = 仅合并完全相同的顶点；增大会合并得更多，但可能轻微改变轮廓。',
      },
    },
  },
  genNormals: {
    label: '生成法线',
    group: 'geometry',
    desc: '为缺失 NORMAL 的网格生成面积加权平滑法线，修复"棱面感/黑面"着色问题。',
    appearance: true,
    params: {
      hardAngle: {
        type: 'number', label: '硬边角度', default: 180,
        min: 1, max: 180, step: 1, unit: '°',
        hint: '相邻面夹角大于该值时视为硬边，不参与平滑。180 = 全平滑；30–60 可保留头饰/服饰折角的棱线。',
      },
    },
  },
  fixNormalsOrientation: {
    label: '法线方向校正',
    group: 'geometry',
    desc: '检查 NORMAL 是否存在并说明方向校正策略（外扩一致性由 genNormals 内置保证）。',
    appearance: true,
    params: {},
  },
  simplify: {
    label: '网格简化（减面）',
    group: 'geometry',
    desc: '使用 meshoptimizer 简化三角形数量。会改变脸谱与头饰细节，必须人工复核。',
    appearance: true,
    params: {
      ratio: {
        type: 'number', label: '保留比例', default: 0.5,
        min: 0.01, max: 1, step: 0.01,
        hint: '保留的三角形比例，0.5 = 减掉一半面数。',
      },
      error: {
        type: 'number', label: '允许误差', default: 0.001,
        min: 0, max: 0.1, step: 0.0005,
        hint: '相对模型尺寸的最大形变误差，越大减得越狠、形变越明显。',
      },
    },
  },
  quantize: {
    label: '几何量化',
    group: 'geometry',
    desc: '降低顶点属性存储精度（KHR_mesh_quantization），显著减小体积。',
    appearance: true,
    params: {
      quantizePosition: {
        type: 'integer', label: '位置精度', default: 14,
        min: 8, max: 16, step: 1, unit: 'bit',
        hint: 'POSITION 量化位数，越小体积越小、可能出现轻微位置偏移。',
      },
      quantizeNormal: {
        type: 'integer', label: '法线精度', default: 10,
        min: 8, max: 16, step: 1, unit: 'bit',
        hint: 'NORMAL 量化位数。',
      },
      quantizeTexcoord: {
        type: 'integer', label: 'UV 精度', default: 12,
        min: 8, max: 16, step: 1, unit: 'bit',
        hint: 'TEXCOORD 量化位数，过低会导致贴图轻微错位。',
      },
      quantizationVolume: {
        type: 'enum', label: '量化范围', default: 'mesh',
        options: [
          { value: 'mesh', label: '按网格（精度更高）' },
          { value: 'scene', label: '按场景（利于合批）' },
        ],
        hint: 'mesh = 每个网格独立归一化；scene = 整个场景统一。',
      },
    },
  },
  prune: {
    label: '清理未引用数据',
    group: 'geometry',
    desc: '移除未被任何网格/材质引用的顶点数据、贴图与节点。',
    appearance: false,
    params: {},
  },
  dedup: {
    label: '资源去重',
    group: 'geometry',
    desc: '合并完全重复的 accessor、材质与贴图，减少冗余。',
    appearance: false,
    params: {},
  },
  join: {
    label: '合并网格',
    group: 'geometry',
    desc: '把可合并的 primitive 合并为更少的可绘制批次，降低 draw call。',
    appearance: false,
    params: {
      keepNamed: {
        type: 'bool', label: '保留具名网格', default: false,
        hint: '开启后名称不同的网格不会被合并（便于后续按部件编辑）。',
      },
    },
  },

  // ---------------- 材质 ----------------
  fixMaterials: {
    label: '修复材质',
    group: 'material',
    desc: '修正 PBR 金属度/粗糙度。默认把金属度归零，消除"塑料感过强"的错误高光。',
    appearance: true,
    params: {
      metallicFactor: {
        type: 'number', label: '金属度', default: 0,
        min: 0, max: 1, step: 0.01,
        hint: '目标金属度。已有 metallicRoughness 贴图的材质会被跳过。',
      },
      roughnessFactor: {
        type: 'number', label: '粗糙度', default: 1,
        min: 0, max: 1, step: 0.01,
        hint: '仅在材质缺失 roughnessFactor 时写入。',
      },
    },
  },
  setSampler: {
    label: '统一采样器',
    group: 'material',
    desc: '把所有贴图采样器统一为三线性过滤 + mipmap + 重复寻址，消除远处贴图闪烁与接缝。',
    appearance: false,
    params: {},
  },

  // ---------------- 纹理 ----------------
  textureResize: {
    label: '缩放贴图',
    group: 'texture',
    desc: '按最大边长等比缩小贴图（sharp 重编码为 PNG）。脸谱/纹样清晰度会下降，需人工确认。',
    appearance: true,
    params: {
      maxSize: {
        type: 'integer', label: '最大边长', default: 1024,
        min: 16, max: 4096, step: 16, unit: 'px',
        hint: '超过该边长的贴图会被等比缩小；已小于该值的贴图保持原样不重编码。',
      },
    },
  },
  textureCompress: {
    label: '压缩贴图',
    group: 'texture',
    desc: '把贴图有损重编码为 WebP 或 JPEG，大幅减小体积。脸谱/纹样需人工复核。',
    appearance: true,
    params: {
      format: {
        type: 'enum', label: '目标格式', default: 'webp',
        options: [
          { value: 'webp', label: 'WebP（体积最小）' },
          { value: 'jpeg', label: 'JPEG（兼容性最好）' },
        ],
        hint: 'WebP 在现代浏览器与多数引擎可用；JPEG 兼容性最广但无透明通道。',
      },
      quality: {
        type: 'integer', label: '质量', default: 80,
        min: 1, max: 100, step: 1,
        hint: '1–100，数值越高质量越好体积越大。建议 75–85。',
      },
    },
  },
  textureReport: {
    label: '贴图报告',
    group: 'texture',
    desc: '只读检测：真实解析每张贴图的格式、分辨率与字节数，不修改任何数据。',
    appearance: false,
    params: {},
  },

  // ---------------- 容器 / 格式 ----------------
  convert: {
    label: '格式转换',
    group: 'container',
    desc: '在 GLB / GLTF / OBJ 之间真实转换，顶点与三角形数量保持不变。FBX 只能读取、无法导出。',
    appearance: true,
    params: {
      to: {
        type: 'enum', label: '目标格式', default: 'glb',
        options: [
          { value: 'glb', label: 'GLB（单文件二进制）' },
          { value: 'gltf', label: 'GLTF（JSON + 外部资源）' },
          { value: 'obj', label: 'OBJ（+ MTL，不支持 PBR）' },
        ],
        hint: 'OBJ 不支持 PBR，metallic/roughness 会丢失。',
      },
    },
  },
};

// 取出某算子的参数声明（未声明则返回 {}）
export function getOpParams(name) {
  return OP_SCHEMA[name]?.params ?? {};
}

// 用声明补全默认值 —— 保证「参数缺失」与「参数等于默认值」结果一致（可复现）
export function withDefaults(name, params) {
  const spec = getOpParams(name);
  const out = {};
  for (const [key, s] of Object.entries(spec)) {
    const v = params?.[key];
    out[key] = v === undefined || v === null || v === '' ? s.default : v;
  }
  return out;
}

// 按声明做类型与范围校验（非法直接抛 OpError，禁止"静默忽略"）
export function validateSchema(name, params) {
  const spec = getOpParams(name);
  const p = params || {};
  if (typeof p !== 'object' || Array.isArray(p)) {
    const e = new Error(`算子 ${name} 参数必须是对象`);
    e.status = 400; throw e;
  }
  for (const [key, s] of Object.entries(spec)) {
    if (!(key in p)) continue;
    const v = p[key];
    if (s.type === 'number' || s.type === 'integer') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        const e = new Error(`${name}.${key} 必须是数字`);
        e.status = 400; throw e;
      }
      if (s.type === 'integer' && !Number.isInteger(v)) {
        const e = new Error(`${name}.${key} 必须是整数`);
        e.status = 400; throw e;
      }
      if (s.min !== undefined && v < s.min) {
        const e = new Error(`${name}.${key} 不能小于 ${s.min}`);
        e.status = 400; throw e;
      }
      if (s.max !== undefined && v > s.max) {
        const e = new Error(`${name}.${key} 不能大于 ${s.max}`);
        e.status = 400; throw e;
      }
    } else if (s.type === 'bool') {
      if (typeof v !== 'boolean') {
        const e = new Error(`${name}.${key} 必须是布尔值`);
        e.status = 400; throw e;
      }
    } else if (s.type === 'enum') {
      const ok = (s.options || []).some((o) => o.value === v);
      if (!ok) {
        const e = new Error(`${name}.${key} 必须是以下之一：${(s.options || []).map((o) => o.value).join(' / ')}`);
        e.status = 400; throw e;
      }
    }
  }
  // 反向：声明外的参数一律拒绝（杜绝 UI 与后端各说各话）
  for (const key of Object.keys(p)) {
    if (!(key in spec)) {
      const e = new Error(`算子 ${name} 不支持参数 ${key}（已忽略未知参数会导致结果不可预期，请改为拒绝）`);
      e.status = 400; throw e;
    }
  }
  return p;
}
