// One command runs the real project checks and owns its temporary local server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7);
if (only && !['server', 'render', 'ui', 'import', 'extended', 'shots', 'pipeline'].includes(only)) {
  console.error('未知测试组：' + only); process.exit(2);
}
const out = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'suite-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(out, { recursive: true });
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
  if (!only) {
    await check('vendor', 'tools/vendor-three.mjs', ['--check']);
    await check('assets', 'tools/verify-glb.mjs');
  }
  if (!only || only === 'pipeline') await check('pipeline', 'tests/pipeline.test.mjs');
  if (!only || only === 'server') await check('server', 'tests/server.test.mjs');
  if (!only || ['render', 'shots'].includes(only)) await check('render', 'tools/test-render.mjs', only === 'shots' ? ['--photos'] : []);
  if (!only || only === 'ui') await check('ui', 'tools/test-ui.mjs');
  if (!only || only === 'import') await check('import', 'tools/test-import.mjs');
  if (!only || only === 'extended') await check('extended', 'tests/extended.test.mjs');
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
