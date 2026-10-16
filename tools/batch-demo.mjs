// 批量处理 CLI：对 5 个琼剧手办执行同一算子链 + 发布到资产库。
// 用法: node tools/batch-demo.mjs [--ops=weld,genNormals,fixMaterials]
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runBatch } from '../backend/batch.mjs';
import { publishAsset } from '../backend/library.mjs';
import { EXPECTED } from './glbkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'backend', 'workspace', 'assets');
const RAW_DIR = path.join(ROOT, 'assets', 'raw');

const opsArg = (process.argv.find((a) => a.startsWith('--ops=')) || '--ops=weld,genNormals,fixMaterials').slice(6);
const ops = opsArg.split(',').filter(Boolean).map((op) => ({ op, params: {} }));

// 确保 5 手办已导入 workspace
const assetIds = [];
for (const name of Object.keys(EXPECTED)) {
  const glb = fs.readFileSync(path.join(RAW_DIR, name + '.glb'));
  const id = `${name}-${crypto.createHash('sha256').update(glb).digest('hex').slice(0, 8)}`;
  const dir = path.join(ASSETS_DIR, id);
  fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
  const orig = path.join(dir, 'original', 'file.glb');
  if (!fs.existsSync(orig)) fs.writeFileSync(orig, glb);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, name: name + '.glb', format: 'glb', note: '', bytes: glb.length, sha256: crypto.createHash('sha256').update(glb).digest('hex'), originalRelPath: path.relative(path.join(ROOT, 'backend', 'workspace'), orig), importedAt: new Date().toISOString() }));
  assetIds.push(id);
}

console.log(`批量处理 5 手办，算子: ${ops.map((o) => o.op).join(' → ')}`);

// 首次运行无 token 会 409，直接走「确认」路径：用 gate 生成 batch token
const { generateBatchConfirmToken } = await import('../backend/gate.mjs');
const token = generateBatchConfirmToken(assetIds, ops);

const report = await runBatch({ assetIds, ops, confirmToken: token });
for (const r of report.results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.assetId.padEnd(20)} v${r.version}  tris ${r.before?.tris}->${r.after?.tris}  verify=${r.verify}`);
}

// 发布
console.log('\n发布到资产库:');
for (const r of report.results) {
  if (!r.ok) continue;
  const pub = await publishAsset({ assetId: r.assetId, version: r.version });
  console.log(`  ✓ ${r.assetId} -> ${pub.url}`);
}

console.log(`\n完成：${report.ok}/${report.total} 成功。`);
process.exit(report.failed === 0 ? 0 : 1);
