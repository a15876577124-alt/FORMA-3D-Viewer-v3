// 定位 hash 何时变成 #sheng
import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // 在文档最早期注入监听
  await page.evaluateOnNewDocument(() => {
    window.__hashLog = [];
    const rec = (v, src) => window.__hashLog.push({ t: performance.now().toFixed(0), hash: v, src });
    rec(location.hash || '(empty)', 'doc-start');
    window.addEventListener('hashchange', () => rec(location.hash, 'hashchange'));
    const orig = location.hash;
    Object.defineProperty(window, '__hashPoll', { get: () => location.hash });
  });
  await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (const ms of [400, 1200, 2600, 5000]) {
    await new Promise((r) => setTimeout(r, ms));
    const h = await page.evaluate(() => ({ now: location.hash, log: window.__hashLog }));
    console.log(`[+${ms}ms] hash=${h.now} log=${JSON.stringify(h.log)}`);
  }
} finally { await browser.close(); }
