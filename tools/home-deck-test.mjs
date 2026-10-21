// 交互验证（真实浏览器）：首页启动台。
// 断言：4 个启动卡全部渲染、主行动是展厅、导入卡触发真实文件选择、
// 通过隐藏 input 注入真实 GLB 后走完整导入链路（toast + 侧栏出现「导入的模型」组）。
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FE_PORT = 5406;

const kids = [];
const serve = spawn(process.execPath, ['serve.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(FE_PORT), HOST: '127.0.0.1' }, stdio: 'ignore',
});
kids.push(serve);
const shutdown = () => kids.forEach((k) => { try { k.kill(); } catch { /* ignore */ } });
process.on('exit', shutdown);
await new Promise((r) => setTimeout(r, 2500));

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${FE_PORT}/#/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });

  const deck = await page.evaluate(() => [...document.querySelectorAll('.v5-launch')].map((n) => ({
    tag: n.querySelector('.v5-badge')?.textContent,
    title: n.querySelector('.v5-launch-title')?.textContent,
    href: n.getAttribute('href'),
    primary: n.classList.contains('is-primary'),
  })));
  ok('启动台渲染 4 张卡', deck.length === 4, JSON.stringify(deck?.map((d) => d.title)));
  ok('主行动是数字展厅', deck[0]?.primary === true && deck[0]?.href === '#/gallery', JSON.stringify(deck[0]));
  ok('AI Studio 入口存在', deck.some((d) => d.href === '#/studio'), JSON.stringify(deck?.map((d) => d.href)));

  // 导入卡：点击必须触发真实文件选择（监听隐藏 input 的 click）
  await page.evaluate(() => {
    window.__inputClicks = 0;
    const proto = HTMLInputElement.prototype;
    const orig = proto.click;
    proto.click = function () {
      if (this.classList.contains('v5-hidden-input')) window.__inputClicks++;
      return orig.call(this);
    };
  });
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.v5-launch')].find((n) => n.querySelector('.v5-launch-title')?.textContent === '导入模型');
    tile.click();
  });
  const clicks = await page.evaluate(() => window.__inputClicks);
  ok('导入卡触发文件选择', clicks === 1, String(clicks));

  // 注入真实 GLB → 走完整导入链路（加载器、toast、侧栏）
  const glbPath = path.join(ROOT, 'assets', 'raw', 'sheng.glb');
  const b64 = fs.readFileSync(glbPath).toString('base64');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'sheng-deck-test.glb', { type: 'model/gltf-binary' }));
    const input = document.querySelector('.v5-hidden-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, b64);
  await page.waitForFunction(() => [...document.querySelectorAll('.v5-toast, .toast')].some((t) => /已载入/.test(t.textContent || '')), { timeout: 90000 });
  ok('真实 GLB 导入成功（出现「已载入」反馈）', true);
  const importedGroup = await page.evaluate(() => !!document.querySelector('[data-group="imported"]'));
  ok('侧栏出现「导入的模型」组', importedGroup);

  await page.screenshot({ path: 'docs/demo/frames/v51-home-deck-interact.png' });
  ok('无页面级错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  shutdown();
}
console.log(`\nhome-deck: ${pass} passed, ${fail} failed`);
if (fail) console.log('失败项：' + failures.join(', '));
process.exit(fail ? 1 : 0);
