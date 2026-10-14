// Best-view calibration: renders each figurine at 12 yaw angles and writes one
// contact sheet per exhibit (test-out/yaw/<id>.png). Pick the yaw that shows the
// face straight on, then copy it into src/models/catalog.js `best.yaw`.
//   node tools/tune-views.mjs [--base=...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:5173';
const OUT = path.join(ROOT, 'test-out', 'yaw');
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const SHEET = async () => {
  const v = window.__FORMA.viewer;
  const st = window.__FORMA.viewState.get(window.__FORMA.current);
  const orig = { ar: v.controls.autoRotate };
  v.controls.autoRotate = false;
  const N = 12;
  const cell = 300;
  const sheet = document.createElement('canvas');
  sheet.width = cell * 4; sheet.height = cell * 3;
  const ctx = sheet.getContext('2d');
  for (let i = 0; i < N; i++) {
    const yaw = (i / N) * Math.PI * 2;
    v.applyViewAngle(false, { ...st.camera, yaw, pitch: 0.16, distMul: 1.0 });
    v.render();
    const url = v.capturePNG(1);
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, (i % 4) * cell, Math.floor(i / 4) * cell, cell, cell);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(`${i}  ${(yaw).toFixed(2)} rad  ${Math.round(yaw * 180 / Math.PI)}deg`, (i % 4) * cell + 10, Math.floor(i / 4) * cell + 34);
  }
  v.controls.autoRotate = orig.ar;
  return sheet.toDataURL('image/png');
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSERS, headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 90000 });
  await page.evaluate(() => window.__FORMA.ready);

  for (const id of ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white']) {
    await page.evaluate((x) => window.__FORMA.select(x), id);
    await page.waitForFunction((x) => window.__FORMA.current && window.__FORMA.current.id === x, { timeout: 90000 }, id);
    await new Promise((r) => setTimeout(r, 500));
    const url = await page.evaluate(SHEET);
    fs.writeFileSync(path.join(OUT, id + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('sheet:', id + '.png');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
