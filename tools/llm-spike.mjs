// M0.5 LLM 连通性 Spike：验证独立 Node 进程持续调用 WorkBuddy 云服务 LLM
// 用法: node tools/llm-spike.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// publicConfig 是公开配置（publishableKey 设计上可存在于代码中），但仍从文件读取避免散落
const cfgPath = path.join(ROOT, 'backend', 'publicConfig.json');
if (!fs.existsSync(cfgPath)) {
  console.error('缺少 backend/publicConfig.json（cloud-service activate 返回的 publicConfig）');
  process.exit(1);
}
const publicConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');
const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
});

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    console.log(`[OK] ${name} (${Date.now() - t0}ms)`);
    return result;
  } catch (e) {
    console.error(`[FAIL] ${name} (${Date.now() - t0}ms): ${e.message}`);
    if (e.error) console.error('  code:', e.error.code, '| type:', e.error.type, '| status:', e.status ?? 'n/a');
    if (e.requestId) console.error('  requestId:', e.requestId);
    throw e;
  }
}

async function chatOnce(model, prompt) {
  let content = '';
  let finishReason = null;
  let usage = null;
  for await (const chunk of cloud.llm.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: '你是 FORMA 3D 资产管线的测试助手。用一句话简短回答。' },
      { role: 'user', content: prompt },
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.3,
  })) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) content += delta.content;
    if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  return { content, finishReason, usage };
}

const main = async () => {
  // 1) 模型列表
  const models = await step('models.list()', () => cloud.llm.models.list());
  console.log('  可用模型数:', models.length);
  for (const m of models) {
    console.log(`   - id=${m.id} disabled=${m.disabled ?? false} toolCall=${m.supportsToolCall === true} image=${m.supportsImages === true} reasoning=${m.supportsReasoning === true}`);
  }
  const model = models.find((m) => m.disabled !== true && m.supportsToolCall === true) ?? models.find((m) => m.disabled !== true);
  if (!model) { console.error('无可用模型'); process.exit(1); }
  console.log('  选用模型:', model.id);

  // 2) 单次流式调用
  const r1 = await step('chat#1 单次流式', () => chatOnce(model.id, '请回复：FORMA-LLM-SPIKE-OK'));
  console.log('  回复:', JSON.stringify(r1.content.slice(0, 200)));
  console.log('  finish:', r1.finishReason, '| usage:', JSON.stringify(r1.usage));

  // 3) 连续调用验证持续性（间隔 1s）
  for (let i = 2; i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await step(`chat#${i} 连续调用`, () => chatOnce(model.id, `用数字 ${i} 回复`));
    console.log('  回复:', JSON.stringify(r.content.slice(0, 80)));
  }

  console.log('\n=== SPIKE 结论：Node 独立进程可持续调用云服务 LLM ===');
};

main().catch(() => process.exit(1));
