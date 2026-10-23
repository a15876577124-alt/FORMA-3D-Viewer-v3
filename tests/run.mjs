// One command runs the real project checks and owns its temporary local server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7);
if (only && !['server', 'render', 'ui', 'import', 'extended', 'shots', 'pipeline', 'agent', 'ops', 'batch', 'proxy', 'opparams', 'compare', 'fbxtex', 'vendor', 'workspaces', 'layout', 'release', 'audit', 'compare-ui', 'fbxtex-ui', 'workflow'].includes(only)) {
  console.error('未知测试组：' + only); process.exit(2);
}
const out = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'suite-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(out, { recursive: true });
// Tests import, process, publish and delete assets. Run a byte-for-byte snapshot
// of tracked working files so these operations can never touch the user's data.
if (process.env.FORMA_TEST_ISOLATED_ROOT !== ROOT) {
  const snapshot = path.join(out, 'project');
  fs.mkdirSync(snapshot);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of tracked) {
    const target = path.join(snapshot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), target);
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
  console.log('隔离测试工程：' + snapshot);
  const child = spawn(process.execPath, ['tests/run.mjs', ...args], {
    cwd: snapshot, stdio: 'inherit',
    env: { ...process.env, FORMA_TEST_ISOLATED_ROOT: snapshot, FORMA_TEST_OUTPUT_DIR: out, GIT_DIR: gitDir, GIT_WORK_TREE: snapshot },
  });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  process.exit(code ?? 1);
}
const env = { ...process.env, FORMA_TEST_HEADED: args.includes('--gpu') ? '1' : '0' };
let server;
const results = [];

async function check(name, script, extra = []) {
  const dir = path.join(out, name);
  fs.mkdirSync(dir, { recursive: true });
  const child = spawn(process.execPath, [script, ...extra], { cwd: ROOT, env: { ...env, FORMA_TEST_OUTPUT_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { log += chunk; process.stdout.write(chunk); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  fs.writeFileSync(path.join(dir, 'console.log'), log);
  results.push({ name, code, passed: code === 0 });
  if (code !== 0) throw new Error(name + ' 检查失败；请查看 ' + dir);
}

try {
  server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  env.FORMA_BASE = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('本地服务器启动超时')), 12000);
    server.stdout.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) { clearTimeout(timer); resolve(match[0].replace(/\/$/, '')); }
    });
    server.stderr.on('data', (chunk) => { log += chunk; });
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error('本地服务器提前退出：' + code + '\n' + log)); });
  });
  console.log('测试地址：' + env.FORMA_BASE);
  if (!only || only === 'vendor') {
    await check('vendor', 'tools/vendor-three.mjs', ['--check']);
    // 扫描器自身的正负样本：防止把字符串字面量 'import' 误判为模块说明符，
    // 也防止漏掉真实裸导入（漏判会让未 vendored 的依赖溜进离线包）。
    await check('vendorscan', 'tools/vendor-scan-selftest.mjs');
  }
  if (!only) await check('assets', 'tools/verify-glb.mjs');
  // 发布一致性：静态包必须只依赖已跟踪文件，且真的能独立启动（不是只看清单）。
  if (!only || only === 'release') await check('release', 'tools/static-pack-test.mjs');
  if (!only || only === 'pipeline') await check('pipeline', 'tests/pipeline.test.mjs');
  if (!only || only === 'agent') await check('agent', 'tests/agent.test.mjs');
  if (!only || only === 'audit') await check('audit', 'tests/audit.test.mjs');
  if (!only || only === 'ops') await check('ops', 'tests/ops.test.mjs');
  if (!only || only === 'opparams') await check('opparams', 'tests/opparams.test.mjs');
  if (!only || only === 'batch') await check('batch', 'tests/batch.test.mjs');
  if (!only || only === 'compare') await check('compare', 'tests/compare.test.mjs');
  if (!only || only === 'fbxtex') await check('fbxtex', 'tests/fbxtex.test.mjs');
  if (!only || only === 'workflow') await check('workflow', 'tools/workflow-test.mjs');
  if (!only || only === 'compare-ui') await check('compare-ui', 'tools/compare-ui-test.mjs');
  if (!only || only === 'fbxtex-ui') await check('fbxtex-ui', 'tools/fbxtex-ui-test.mjs');
  if (!only || only === 'proxy') await check('proxy', 'tests/proxy.test.mjs');
  if (!only || only === 'server') await check('server', 'tests/server.test.mjs');
  if (!only || ['render', 'shots'].includes(only)) await check('render', 'tools/test-render.mjs', only === 'shots' ? ['--photos'] : []);
  if (!only || only === 'ui') await check('ui', 'tools/test-ui.mjs');
  if (!only || only === 'import') await check('import', 'tools/test-import.mjs');
  if (!only || only === 'extended') await check('extended', 'tests/extended.test.mjs');
  if (!only || only === 'workspaces') await check('workspaces', 'tools/workspace-smoke.mjs');
  if (!only || only === 'layout') await check('layout', 'tools/layout-ui-test.mjs');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill(); await stopped;
  }
  fs.writeFileSync(path.join(out, 'suite-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, passed: !process.exitCode }, null, 2));
  console.log('汇总报告：' + path.join(out, 'suite-report.json'));
}
