// batch 组测试：5 个琼剧手办真实批量处理 + 发布 + 资产库 + 路径限制。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { runBatch } from '../backend/batch.mjs';
import { publishAsset, listLibrary, listPublished, deleteLibraryFile } from '../backend/library.mjs';
import { EXPECTED } from '../tools/glbkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'assets', 'raw');
const ASSETS_DIR = path.join(ROOT, 'backend', 'workspace', 'assets');
const LIB = path.join(ROOT, 'assets', 'library');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

// 记录 5 手办原始 sha256
const rawHashes = {};
const names = Object.keys(EXPECTED);
for (const n of names) rawHashes[n] = crypto.createHash('sha256').update(fs.readFileSync(path.join(RAW_DIR, n + '.glb'))).digest('hex');

// ---------- 准备 workspace 资产（导入 5 手办） ----------
const assetIds = [];
for (const n of names) {
  const glb = fs.readFileSync(path.join(RAW_DIR, n + '.glb'));
  const id = `${n}-${crypto.createHash('sha256').update(glb).digest('hex').slice(0, 8)}`;
  const dir = path.join(ASSETS_DIR, id);
  fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
  const orig = path.join(dir, 'original', 'file.glb');
  if (!fs.existsSync(orig)) fs.writeFileSync(orig, glb);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, name: n + '.glb', format: 'glb', note: '', bytes: glb.length, sha256: rawHashes[n], originalRelPath: path.relative(path.join(ROOT, 'backend', 'workspace'), orig), importedAt: new Date().toISOString() }));
  assetIds.push(id);
}

// ---------- 1. 批量处理（weld+genNormals+fixMaterials，需确认） ----------
console.log('[1] 批量处理 5 手办');
const ops = [{ op: 'weld', params: {} }, { op: 'genNormals', params: { hardAngle: 180 } }, { op: 'fixMaterials', params: { metallicFactor: 0 } }];

// 未确认 → 409
let gateErr = null;
try { await runBatch({ assetIds, ops }); } catch (e) { gateErr = e; }
check('批量未确认返回 409', gateErr?.status === 409, String(gateErr?.status));
check('409 携带 batch token', typeof gateErr?.token === 'string');

// 确认后执行
const report = await runBatch({ assetIds, ops, confirmToken: gateErr.token });
check('批量 5/5 成功', report.ok === 5, `${report.ok}/${report.total}`);
check('批量失败为 0', report.failed === 0, String(report.failed));
check('每资产 verify 通过', report.results.every((r) => r.verify === true));
check('每资产 tris 不变', report.results.every((r) => r.after.tris === EXPECTED[names[assetIds.indexOf(r.assetId)]].tris || r.after.tris === r.before.tris));
check('BATCH 报告落盘', fs.existsSync(path.join(ROOT, 'pipeline-out', `BATCH-${report.runId}.json`)));

// ---------- 2. 原始素材 sha256 不变 ----------
console.log('[2] 原始素材保护');
let rawOk = true;
for (const n of names) {
  const now = crypto.createHash('sha256').update(fs.readFileSync(path.join(RAW_DIR, n + '.glb'))).digest('hex');
  if (now !== rawHashes[n]) { rawOk = false; console.log(`    ${n} sha256 变化！`); }
}
check('5 手办原始 sha256 全程不变', rawOk);

// ---------- 3. 发布到资产库 ----------
console.log('[3] 发布到资产库');
for (let i = 0; i < assetIds.length; i++) {
  const version = report.results[i].version;
  const pub = await publishAsset({ assetId: assetIds[i], version });
  check(`${names[i]} 发布成功`, fs.existsSync(path.join(LIB, pub.file)), pub.file);
}
const published = listPublished();
check('资产库含 5 个发布文件', published.files.filter((f) => f.file.includes('-v')).length >= 5, String(published.files.length));

// ---------- 4. 资产库列表 ----------
console.log('[4] 资产库列表');
const lib = listLibrary();
// 只断言本组刚处理过的 5 个手办——pipeline-out 里可能还留有其他测试产生的资产，
// 断言不该依赖与本组无关的全局状态（否则会互相污染）。
const own = lib.entries.filter((e) => assetIds.includes(e.assetId));
check('listLibrary 含 5 资产', own.length >= 5, String(own.length));
check('每个资产有版本', own.every((e) => e.versions.length >= 1));
check('版本含 ops 清单', own.every((e) => e.versions.every((v) => v.ops.includes('weld'))), JSON.stringify(own.map((e) => e.versions[0].ops)));

// ---------- 5. 路径限制 ----------
console.log('[5] 路径限制');
let delErr = null;
try { await deleteLibraryFile('../../etc/passwd'); } catch (e) { delErr = e; }
check('删除越界文件被拒', delErr !== null, delErr?.message);
const beforeCount = listPublished().files.length;
await deleteLibraryFile(published.files[0].file);
check('删除库内文件成功', listPublished().files.length === beforeCount - 1);

// ---------- 清理测试产物 ----------
for (const id of assetIds) {
  fs.rmSync(path.join(ASSETS_DIR, id), { recursive: true, force: true });
}
// 清理本次发布的 library 文件与 pipeline-out 版本
for (const f of fs.readdirSync(LIB)) {
  if (assetIds.some((id) => f.startsWith(id))) fs.rmSync(path.join(LIB, f), { force: true });
}

console.log(`\n=== batch: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
