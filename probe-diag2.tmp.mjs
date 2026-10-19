// 快速诊断：boot 是否完成、路由状态、控制台错误
import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: 'new', protocolTimeout: 120000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const logs = [];
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + e.message.slice(0, 260)));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 260)); });
  await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 1; i <= 8; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await page.evaluate(() => ({
      forma: typeof window.__FORMA,
      ready: window.__FORMA ? String(window.__FORMA.ready) : '-',
      hash: location.hash,
      outletKids: document.getElementById('v5Outlet')?.children.length ?? -1,
      outletHidden: document.getElementById('v5Outlet')?.hidden ?? null,
      appHidden: document.getElementById('app')?.hidden ?? null,
      heroVisible: !!document.querySelector('.v5-hero'),
    }));
    console.log(`[+${i * 3}s]`, JSON.stringify(st));
    if (st.ready === 'true' || st.forma === 'object') break;
  }
  console.log('=== 页面日志 ===\n' + (logs.slice(0, 10).join('\n') || '(无)'));
} finally { await browser.close(); }
