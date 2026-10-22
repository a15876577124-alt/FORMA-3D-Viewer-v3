// FORMA 本地完整版一键启动器
// 职责：拉起 AI 管线后端(8787) + 静态前端(5173)，打开浏览器进入 AI Studio；
// 退出（Ctrl+C / 关窗口）时安全清理本次启动的子进程，不影响用户其他程序。
// 用法：双击 FORMA.bat（内部执行 node tools/launch.mjs）
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND_PORT = Number(process.env.FORMA_BACKEND_PORT || 8787);
const FRONT_PORT = Number(process.env.PORT || 5173);
const children = [];
let shuttingDown = false;

const say = (msg) => process.stdout.write(msg + '\n');
// 沙箱/便携环境下 process.execPath 可能不可 spawn，回退 PATH 中的 node
const NODE_EXE = fs.existsSync(process.execPath) ? process.execPath : 'node';

function portInUse(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => s.close(() => resolve(false)));
    s.listen(port, '127.0.0.1');
  });
}

function waitHealthy(url, timeoutMs = 15000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const probe = async () => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (r.ok) return resolve(true);
      } catch { /* 未就绪继续探测 */ }
      if (Date.now() - t0 > timeoutMs) return resolve(false);
      setTimeout(probe, 500);
    };
    probe();
  });
}

function start(name, args, env, color) {
  const child = spawn(NODE_EXE, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const tag = `[${name}]`;
  child.stdout.on('data', (b) => process.stdout.write(b.toString().split('\n').filter(Boolean).map((l) => `${tag} ${l}`).join('\n') + '\n'));
  child.stderr.on('data', (b) => process.stderr.write(b.toString().split('\n').filter(Boolean).map((l) => `${tag} ${l}`).join('\n') + '\n'));
  child.on('exit', (code) => {
    if (!shuttingDown) say(`\n!! ${name} 意外退出 (code=${code})。请检查上方日志；常见原因：端口被占用或依赖缺失。`);
  });
  return child;
}

async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  say('\n正在停止 FORMA 服务…');
  for (const c of children) {
    try { c.kill(); } catch { /* 已退出 */ }
  }
  // 给子进程一点时间退出；Windows 上 node 的 kill() 发送终止信号即可
  setTimeout(() => process.exit(0), 600);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => { for (const c of children) { try { c.kill(); } catch { /* noop */ } } });

say('==============================================');
say('  FORMA V5 · 本地完整版');
say('  数字展厅 + AI 资产管线（分析/优化/导出）');
say('==============================================\n');

// 0) 端口预检：被占用说明服务已在运行或端口冲突
if (await portInUse(BACKEND_PORT)) {
  say(`⚠ 端口 ${BACKEND_PORT} 已被占用——AI 管线后端可能已在运行。`);
  say('  如需重启请先关闭旧的 node 窗口，或设置 FORMA_BACKEND_PORT 换端口。\n');
} else {
  say(`• 启动 AI 管线后端 :${BACKEND_PORT} …`);
  start('后端', ['backend/server.mjs'], { FORMA_BACKEND_PORT: String(BACKEND_PORT) });
  const ok = await waitHealthy(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
  say(ok ? `  ✓ 后端就绪 (http://127.0.0.1:${BACKEND_PORT})\n`
    : '  ✗ 后端健康检查超时——AI 功能可能不可用，请查看下方日志。\n');
}

if (await portInUse(FRONT_PORT)) {
  say(`⚠ 端口 ${FRONT_PORT} 已被占用——前端可能已在运行，直接打开浏览器。`);
} else {
  say(`• 启动前端服务 :${FRONT_PORT} …`);
  start('前端', ['serve.mjs'], { PORT: String(FRONT_PORT), FORMA_BACKEND: `http://127.0.0.1:${BACKEND_PORT}` });
  await new Promise((r) => setTimeout(r, 1200));
}

const url = `http://127.0.0.1:${FRONT_PORT}/#/studio`;
say(`\n✓ 启动完成：${url}`);
say('  浏览器将自动打开；关闭本窗口或按 Ctrl+C 即停止全部服务。\n');

// 打开默认浏览器（Windows）
if (process.platform === 'win32' && process.env.FORMA_NO_OPEN !== '1') {
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
}

// 保活：后端/前端任一意外退出时提示（不自动拉起，避免端口竞争）
setInterval(() => { /* keepalive；真实事件由 child exit 监听处理 */ }, 60000);
