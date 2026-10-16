// 工具单一真源：8 个工具的 schema + handler + mutating/confirm 标记。
// handler 通过 ctx 注入依赖（读 workspace / 调算子层），便于离线测试与 M3 接线。
import fs from 'node:fs';
import path from 'node:path';

// 8 工具定义。mutating 表示是否改变磁盘；confirm 表示是否需要确认门（auto=算子层判定）。
export const TOOLS = [
  {
    name: 'list_assets',
    description: '列出工作区中所有已导入的资产（id、名称、格式、大小）。只读。',
    parameters: { type: 'object', properties: {}, required: [] },
    mutating: false, confirm: 'none',
    handler: (ctx) => {
      const dir = ctx.assetsDir;
      if (!fs.existsSync(dir)) return { assets: [] };
      const assets = fs.readdirSync(dir).map((id) => {
        const mp = path.join(dir, id, 'meta.json');
        if (!fs.existsSync(mp)) return null;
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        return { id: m.id, name: m.name, format: m.format, bytes: m.bytes, importedAt: m.importedAt };
      }).filter(Boolean);
      return { assets };
    },
  },
  {
    name: 'analyze_asset',
    description: '读取指定资产的分析报告（几何/材质/贴图/问题清单）。只读。',
    parameters: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] },
    mutating: false, confirm: 'none',
    handler: (ctx, args) => {
      const id = String(args.assetId);
      const rp = path.join(ctx.assetsDir, id, 'report.json');
      if (!fs.existsSync(rp)) return { error: `资产 ${id} 无分析报告，请先 analyze` };
      const report = JSON.parse(fs.readFileSync(rp, 'utf8'));
      // 摘要，避免把整个报告灌给模型
      return {
        assetId: id,
        file: report.file,
        stats: report.stats,
        bounds: report.bounds,
        textures: (report.textures || []).map((t) => ({ name: t.name, width: t.width, height: t.height, bytes: t.bytes })),
        materials: (report.materials || []).map((m) => ({ name: m.name, alphaMode: m.alphaMode, doubleSided: m.doubleSided, metallicFactor: m.metallicFactor, roughnessFactor: m.roughnessFactor })),
        issues: report.issues,
      };
    },
  },
  {
    name: 'propose_ops',
    description: '提出一套处理方案（不执行）。列出算子序列、参数、理由与风险。',
    parameters: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: { op: { type: 'string' }, params: { type: 'object' }, reason: { type: 'string' }, risk: { type: 'string' } },
            required: ['op', 'reason'],
          },
        },
      },
      required: ['ops'],
    },
    mutating: false, confirm: 'none',
    handler: (ctx, args) => {
      const ops = Array.isArray(args.ops) ? args.ops : [];
      // 校验并回显，服务端不自动填充/改写任何算子（证明是 LLM 决策）
      const normalized = ops.map((o, i) => ({
        index: i, op: String(o.op || ''), params: o.params || {}, reason: String(o.reason || ''), risk: String(o.risk || ''),
      }));
      return { proposed: normalized, count: normalized.length };
    },
  },
  {
    name: 'run_op',
    description: '执行一个处理算子，输出到 pipeline-out/<id>-v<N>/。可能改变外观，需确认门。',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        op: { type: 'string' },
        params: { type: 'object' },
      },
      required: ['assetId', 'op'],
    },
    mutating: true, confirm: 'auto',
    handler: (ctx, args) => {
      if (typeof ctx.runOp !== 'function') {
        return { status: 'wouldApply', assetId: args.assetId, op: args.op, params: args.params || {}, note: '算子层未接线（M3）' };
      }
      return ctx.runOp(args);
    },
  },
  {
    name: 'verify',
    description: '对某版本产物做后验（结构校验 + 切片哈希 + 重解析），返回通过/失败与逐项检查。',
    parameters: { type: 'object', properties: { assetId: { type: 'string' }, version: { type: 'number' } }, required: ['assetId'] },
    mutating: false, confirm: 'none',
    handler: (ctx, args) => {
      if (typeof ctx.verify !== 'function') return { status: 'not-available', note: '后验未接线（M3）' };
      return ctx.verify(args);
    },
  },
  {
    name: 'compare',
    description: '对比某资产处理前/后的指标（顶点、三角形、贴图、字节、边界盒）。',
    parameters: { type: 'object', properties: { assetId: { type: 'string' }, version: { type: 'number' } }, required: ['assetId'] },
    mutating: false, confirm: 'none',
    handler: (ctx, args) => {
      if (typeof ctx.compare !== 'function') return { status: 'not-available', note: '对比未接线（M3）' };
      return ctx.compare(args);
    },
  },
  {
    name: 'export_asset',
    description: '导出产物为指定格式（glb/gltf/obj）。',
    parameters: { type: 'object', properties: { assetId: { type: 'string' }, version: { type: 'number' }, to: { type: 'string' } }, required: ['assetId', 'to'] },
    mutating: false, confirm: 'auto',
    handler: (ctx, args) => {
      if (typeof ctx.exportAsset !== 'function') return { status: 'not-available', note: '导出未接线（M3）' };
      return ctx.exportAsset(args);
    },
  },
  {
    name: 'finish',
    description: '结束任务并给出总结（结论、建议的算子、已执行项、注意事项）。',
    parameters: { type: 'object', properties: { summary: { type: 'string' }, appliedOps: { type: 'array', items: { type: 'string' } } }, required: ['summary'] },
    mutating: false, confirm: 'none',
    handler: (ctx, args) => ({ summary: String(args.summary || ''), appliedOps: Array.isArray(args.appliedOps) ? args.appliedOps : [] }),
  },
];

export function getTool(name) {
  return TOOLS.find((t) => t.name === name) || null;
}

// 原生 tools 数组（OpenAI 兼容）
export function toNativeTools() {
  return TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

// prompt 协议：工具清单文本
export function toPromptSpec() {
  return TOOLS.map((t) => {
    const params = Object.keys(t.parameters?.properties || {}).join(', ');
    return `- ${t.name}(${params})：${t.description}`;
  }).join('\n');
}

// 派发一个工具调用。ctx 由 agent 注入（assetsDir / runOp / verify / compare / exportAsset）。
export function dispatchTool(ctx, name, args) {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `未知工具: ${name}` };
  try {
    const result = tool.handler(ctx, args);
    return { ok: true, name, args, result };
  } catch (e) {
    return { ok: false, name, args, error: e.message };
  }
}
