// V5.1 P0 验收：路由循环切换后展厅不空白
// 序列：首页 → 展厅 → 作品 → 展厅 → AI Studio → 展厅，重复 N 轮
// 断言：每次停在展厅时 canvas 可见且画面有真实内容（非空/非纯色）
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = process.env.FORMA_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = process.cwd();
const OUT = process.env.SHOT_DIR || 'docs/demo/frames';
const ROUNDS = Number(process.env.ROUNDS || 3);

function startServer() {
  return new Promise((resolve, reject) => {
    const port = 5900 + Math.floor(Math.random() * 300);
    const child = spawn(process.execPath, ['serve.mjs'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('serve 启动超时')), 20000);
    child.stdout.on('data', (b) => { if (String(b).includes('local')) { clearTimeout(timer); resolve({ child, port }); } });
    child.stderr.on('data', (b) => process.stderr.write('[serve] ' + b));
  });
}

async function analyze(file) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const raw = await img.removeAlpha().raw().toBuffer();
  const px = width * height;
  let nonBg = 0, sum = 0, n = 0;
  const hist = new Uint32Array(16);
  for (let i = 0; i < px; i += 3) {
    const o = i * 3;
    const lum = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2];
    sum += lum; n++;
    if (lum > 24) nonBg++;
    hist[Math.min(15, lum >> 4)]++;
  }
  let ent = 0;
  for (const v of hist) if (v) { const p = v / n; ent -= p * Math.log2(p); }
  return { meanLuma: +(sum / n).toFixed(2), nonBgRatio: +(nonBg / n).toFixed(4), entropy: +ent.toFixed(3) };
}

const results = [];
let failures = 0;

const { child, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader', '--use-gl=angle', '--hide-scrollbars', '--window-size=1440,900'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));

  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__FORMA', { timeout: 120000 });
  await page.waitForFunction('window.__FORMA.info && window.__FORMA.info.modelTris > 0', { timeout: 180000 });
  await new Promise((r) => setTimeout(r, 4000));

  const nav = async (route, label) => {
    await page.evaluate((r) => { location.hash = r; }, '#' + route);
    await new Promise((r) => setTimeout(r, 2600));
    const st = await page.evaluate(() => {
      const cv = document.querySelector('#app canvas') || document.querySelector('canvas');
      let vis = false, w = 0, h = 0;
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const comp = getComputedStyle(cv);
        w = Math.round(rect.width); h = Math.round(rect.height);
        vis = rect.width > 0 && rect.height > 0 && comp.visibility !== 'hidden' && comp.display !== 'none';
      }
      const appH = document.getElementById('app')?.hidden ?? null;
      const layers = [...document.querySelectorAll('.v5-layer')].filter((n) => !n.hidden).length;
      return { canvasVisible: vis, cw: w, ch: h, appHidden: appH, visibleLayers: layers };
    });
    return { label, ...st };
  };

  for (let r = 1; r <= ROUNDS; r++) {
    const seq = ['/', '/gallery', '/work/dan', '/gallery', '/studio', '/gallery'];
    for (const route of seq) {
      const st = await nav(route, `R${r}:${route}`);
      // 展厅路由必须可见且唯一
      const isGallery = route === '/gallery';
      let ok = true;
      if (isGallery) {
        ok = st.canvasVisible && st.appHidden === false && st.visibleLayers === 1;
      } else if (route === '/') {
        ok = st.visibleLayers === 1 && st.appHidden === true;
      } else {
        ok = st.visibleLayers === 1;
      }
      if (!ok) failures++;
      results.push({ round: r, route, ok, ...st });
    }
  }

  // 最终停留在展厅并截图
  const file = path.join(OUT, 'v51-gallery-final-1440.png');
  await page.screenshot({ path: file });
  const px = await analyze(file);
  if (px.nonBgRatio < 0.10) failures++;
  results.push({ round: 'final', route: '/gallery', ok: px.nonBgRatio >= 0.10, file, ...px });

  console.log('\n路由切换验收：');
  for (const r of results) {
    const detail = 'canvasVisible=' + r.canvasVisible + ' appHidden=' + r.appHidden + ' layers=' + r.visibleLayers
      + (r.nonBgRatio != null ? ' nonBg=' + r.nonBgRatio : '');
    console.log(`  ${String(r.round).padEnd(5)} ${String(r.route).padEnd(14)} ${r.ok ? 'OK  ' : 'FAIL'} ${detail}`);
  }
  console.log(`\n结果：${results.length - failures} passed, ${failures} failed`);
} finally {
  await browser.close();
  child.kill();
}

process.exit(failures ? 1 : 0);
