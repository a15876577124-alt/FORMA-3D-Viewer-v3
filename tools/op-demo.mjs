// 算子链 CLI 演示（无浏览器）：对一个资产执行算子链 + 后验。
// 用法: node tools/op-demo.mjs --asset=assets/raw/sheng.glb --ops=weld,genNormals,fixMaterials [--out=pipeline-out]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOps } from '../backend/ops/index.mjs';
import { verifyPair } from '../backend/verify.mjs';
import { analyzeFile } from '../backend/analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { ops: 'weld,genNormals,fixMaterials', out: path.join(ROOT, 'pipeline-out') };
  for (const a of argv.slice(2)) {
    let m;
    if ((m = /^--asset=(.+)$/.exec(a))) args.asset = path.resolve(ROOT, m[1]);
    else if ((m = /^--ops=(.+)$/.exec(a))) args.ops = m[1];
    else if ((m = /^--out=(.+)$/.exec(a))) args.out = path.resolve(ROOT, m[1]);
    else throw new Error('unknown option ' + a);
  }
  if (!args.asset) throw new Error('缺少 --asset=');
  return args;
}

const args = parseArgs(process.argv);
if (!fs.existsSync(args.asset)) throw new Error('资产不存在: ' + args.asset);

const ops = args.ops.split(',').filter(Boolean).map((op) => ({ op, params: {} }));
const base = path.basename(args.asset).replace(/\.[^.]+$/, '');
const outDir = path.join(args.out, `${base}-demo-${Date.now()}`);
fs.mkdirSync(outDir, { recursive: true });

const before = await analyzeFile(args.asset);
console.log(`资产: ${path.basename(args.asset)}  ${before.stats.verts} verts / ${before.stats.tris} tris / ${before.file.bytes} bytes`);

const { outPath, results } = await runOps({ inPath: args.asset, outDir, ops, onStep: (s) => console.log(`  ✓ ${s.op} (${s.ms}ms) ${s.changes.join('; ')}`) });

const after = await analyzeFile(outPath);
console.log(`产物: ${path.relative(ROOT, outPath)}  ${after.stats.verts} verts / ${after.stats.tris} tris / ${after.file.bytes} bytes`);

let allPass = true;
for (const r of results) {
  const v = await verifyPair({ beforePath: r.inPath, afterPath: r.outPath, opName: r.op, params: r.params });
  const bad = v.checks.filter((c) => !c.ok);
  if (bad.length) allPass = false;
  console.log(`  后验[${r.op}]: ${v.pass ? 'PASS' : 'FAIL'}${bad.length ? ' -> ' + bad.map((c) => c.name).join(',') : ''}`);
}

console.log(`\n${allPass ? '✅ 全部后验通过' : '❌ 存在后验失败'}  输出目录: ${path.relative(ROOT, outDir)}`);
process.exit(allPass ? 0 : 1);
