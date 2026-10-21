// 交互验证（真实浏览器）：选中 FBX 资产 → 面板列出贴图三态 → 一键提取内嵌贴图
// → 产物链接可真实下载。断言全部来自页面真实 DOM 与真实 HTTP 响应。
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BE_PORT = 5396, FE_PORT = 5404;

const kids = [];
const start = (cmd, env) => { const c = spawn(process.execPath, cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); kids.push(c); return c; };
const shutdown = () => kids.forEach((k) => { try { k.kill(); } catch { /* ignore */ } });
process.on('exit', shutdown);

start(['backend/server.mjs'], { FORMA_BACKEND_PORT: String(BE_PORT), HOST: '127.0.0.1' });
start(['serve.mjs'], { PORT: String(FE_PORT), HOST: '127.0.0.1', FORMA_BACKEND: `http://127.0.0.1:${BE_PORT}` });
await new Promise((r) => setTimeout(r, 3000));

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};

const SAMPLE = path.join(ROOT, 'test-assets', 'fbx-textures', 'textured-binary.fbx');
if (!fs.existsSync(SAMPLE)) throw new Error('缺少样例，请先运行 tools/make-fbx-texture-samples.mjs');
const imp = await fetch(`http://127.0.0.1:${BE_PORT}/api/assets/import`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'textured-binary.fbx', dataBase64: fs.readFileSync(SAMPLE).toString('base64') }),
}).then((r) => r.json());
const assetId = imp?.asset?.id;
if (!assetId) throw new Error('导入失败：' + JSON.stringify(imp).slice(0, 200));

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${FE_PORT}/#/studio`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });
  await page.evaluate(() => window.__FORMA.pipeline.connect());
  await page.waitForFunction(() => document.getElementById('pipelineStatus')?.textContent.includes('已连接'), { timeout: 60000 });

  // 选中该 FBX 资产
  await page.evaluate((id) => {
    const sel = document.getElementById('pipelineAssetSel');
    sel.value = id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, assetId);
  await page.waitForFunction(
    () => !document.getElementById('pipelineTex')?.hidden
      && document.querySelectorAll('#pipelineTex .p-tex-row').length > 0,
    { timeout: 30000 },
  );

  const rows = await page.evaluate(() => [...document.querySelectorAll('#pipelineTex .p-tex-row')].map((r) => ({
    badge: r.querySelector('.p-tex-badge')?.textContent,
    cls: r.querySelector('.p-tex-badge')?.className,
    name: r.querySelector('.p-tex-name')?.textContent,
  })));
  ok('贴图区列出 3 条', rows.length === 3, JSON.stringify(rows));
  ok('内嵌贴图有「内嵌」标记', rows.some((r) => r.badge === '内嵌' && /embedded/.test(r.cls)), JSON.stringify(rows));
  ok('未随行贴图标记为「缺失」', rows.filter((r) => r.badge === '缺失').length === 2, JSON.stringify(rows));
  ok('缺失项给出交付警告', await page.evaluate(() => [...document.querySelectorAll('#pipelineTex .p-hint, #pipelineTex .p-tex-meta')].some((n) => /缺失|白模/.test(n.textContent || ''))));

  // 一键提取
  const btnText = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#pipelineTex button')][0];
    return { text: b?.textContent, disabled: b?.disabled };
  });
  ok('提取按钮显示内嵌数量', /提取内嵌贴图（1）/.test(btnText.text || ''), JSON.stringify(btnText));
  await page.evaluate(() => [...document.querySelectorAll('#pipelineTex button')][0].click());
  await page.waitForFunction(
    () => document.querySelector('#pipelineTex .p-tex-out a')?.href?.includes('/api/file/'),
    { timeout: 30000 },
  );
  const href = await page.evaluate(() => document.querySelector('#pipelineTex .p-tex-out a')?.getAttribute('href'));
  const dl = await fetch(`http://127.0.0.1:${FE_PORT}${href}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  ok('提取产物可真实下载', dl.status === 200 && buf.length > 0, `${dl.status} ${buf.length}`);
  ok('下载内容是真实 PNG', buf[0] === 0x89 && buf[1] === 0x50, buf.subarray(0, 4).toString('hex'));

  await page.screenshot({ path: 'docs/demo/frames/v51-fbx-textures.png' });
  ok('无页面级错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  shutdown();
}
console.log(`\nfbxtex-ui: ${pass} passed, ${fail} failed`);
if (fail) console.log('失败项：' + failures.join(', '));
process.exit(fail ? 1 : 0);
