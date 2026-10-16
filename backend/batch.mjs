// 批量处理：对一组资产执行同一算子链，并发 2，逐资产隔离失败。
// 确认门：批量级 token（gate.mjs generateBatchConfirmToken）确认后，逐资产派发真实执行。
import fs from 'node:fs';
import path from 'node:path';
import { runAssetPipeline } from './runPipeline.mjs';
import { assessPolicy } from './policy.mjs';
import { generateBatchConfirmToken, verifyBatchConfirmToken, generateConfirmToken } from './gate.mjs';
import { PIPELINE_OUT_ROOT } from './paths.mjs';

export class BatchError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.name = 'BatchError'; this.status = status; Object.assign(this, extra); }
}

export async function runBatch({ assetIds, ops, confirmToken, concurrency = 2, stopOnError = false }) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) throw new BatchError('assetIds 不能为空');
  if (!Array.isArray(ops) || ops.length === 0) throw new BatchError('ops 不能为空');

  // 批量确认门：任一资产命中红线且无有效 batch token → 409
  const policy = assessPolicy('batch', assetIds.join(','), ops);
  if (policy.required && !verifyBatchConfirmToken(confirmToken, assetIds, ops)) {
    throw new BatchError('批量处理会改变外观/贴图，需人工确认', 409, {
      needConfirm: true,
      token: generateBatchConfirmToken(assetIds, ops),
      riskyOps: policy.riskyOps,
      reasons: policy.reasons,
    });
  }

  const runId = `batch_${Date.now()}`;
  const results = [];
  const queue = [...assetIds];
  const workers = new Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
    while (queue.length) {
      const assetId = queue.shift();
      try {
        // 批量已确认，逐资产派发真实执行（生成 per-asset token 以通过单资产门）
        const perAssetToken = policy.required ? generateConfirmToken(assetId, ops) : undefined;
        const r = await runAssetPipeline({ assetId, ops, confirmToken: perAssetToken });
        results.push({ assetId, ok: true, version: r.version, verify: r.verify?.pass, before: r.before, after: r.after });
      } catch (e) {
        results.push({ assetId, ok: false, error: e.message, status: e.status });
        if (stopOnError) throw e;
      }
    }
  });
  await Promise.all(workers);

  const okCount = results.filter((r) => r.ok).length;
  const report = {
    runId, assetIds, ops, startedAt: new Date().toISOString(),
    total: assetIds.length, ok: okCount, failed: assetIds.length - okCount,
    results,
  };
  fs.mkdirSync(PIPELINE_OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(PIPELINE_OUT_ROOT, `BATCH-${runId}.json`), JSON.stringify(report, null, 2));
  return report;
}
