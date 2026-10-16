// proxy 组测试：serve.mjs 的 /api 反向代理（200 透传 / 后端不可达 502 / 静态服务不受影响）。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

function start(cmd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (c) => { log += c; });
    child.stderr.on('data', (c) => { log += c; });
    const timer = setTimeout(() => reject(new Error('启动超时\n' + log)), 15000);
    const addr = new Promise((res) => {
      const int = setInterval(() => {
        const m = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (m) { clearInterval(int); clearTimeout(timer); res({ child, port: Number(m[1]), log }); }
      }, 100);
    });
    resolve(addr);
  });
}

// 1. 启动后端（随机端口）
const backend = await start(['backend/server.mjs'], { FORMA_BACKEND_PORT: '0' });
// 2. 启动 serve（随机端口，反代到后端）
const serve = await start(['serve.mjs'], { PORT: '0', FORMA_BACKEND: `http://127.0.0.1:${backend.port}` });

const base = `http://127.0.0.1:${serve.port}`;

// 反代 200 透传
const health = await fetch(base + '/api/health').then((r) => r.json()).catch(() => null);
check('反代 /api/health 200', health?.ok === true && health?.service === 'forma-pipeline-backend');

// 静态服务不受影响
const index = await fetch(base + '/index.html');
check('静态 /index.html 200', index.status === 200 && (await index.text()).includes('FORMA'));

// POST 经反代（/api/ops 是 GET，用 GET 验证即可；POST 已验证 pipeline 组）
const ops = await fetch(base + '/api/ops').then((r) => r.json()).catch(() => null);
check('反代 /api/ops 返回算子列表', Array.isArray(ops?.ops) && ops.ops.some((o) => o.name === 'weld'));

// 停掉后端 → 502
backend.child.kill();
await new Promise((r) => backend.child.once('exit', r));
await new Promise((r) => setTimeout(r, 500));
const down = await fetch(base + '/api/health');
const downBody = await down.json().catch(() => null);
check('后端不可达返回 502', down.status === 502, String(down.status));
check('502 携带 backend_unavailable', downBody?.error?.code === 'backend_unavailable');

serve.child.kill();
await new Promise((r) => serve.child.once('exit', r));

console.log(`\n=== proxy: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
