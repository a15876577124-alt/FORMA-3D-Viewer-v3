// Sidebar / immersive-strip thumbnails, rendered by the engine itself.
//
// These are real renders through the app's own capture path, not exported views
// from a DCC tool - so they can never drift from what the viewer actually shows.
//
//   node tools/make-thumbs.mjs [--size=512] [--base=...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes('=') ? hit.split('=')[1] : true) : fallback;
};

const BASE = String(arg('base', process.env.FORMA_BASE || 'http://127.0.0.1:5173'));
const PAGE_URL = BASE + (BASE.includes('?') ? '' : '/index.html');
const SIZE = Number(arg('size', 512));
const THUMBS = path.join(ROOT, 'assets', 'thumbs');

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SQUASH = (size) => {
  // Runs in the page: capture through the viewer's own export path, then centre
  // crop to a square and downscale.
  const v = window.__FORMA.viewer;
  const url = v.capturePNG(2);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const S = size;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
};

(async () => {
  fs.mkdirSync(THUMBS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: BROWSERS, headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    protocolTimeout: 240000,
  });
  const page = await browser.newPage();
  // Square viewport so the subject fills the frame before cropping.
  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 60000 });
  await page.evaluate(() => window.__FORMA.ready);

  const ids = await page.evaluate(() => window.__FORMA.catalog.map((c) => c.id));
  for (const id of ids) {
    await page.evaluate((x) => window.__FORMA.select(x), id);
    await page.waitForFunction((x) => window.__FORMA.current && window.__FORMA.current.id === x && window.__FORMA.info.modelTris > 0, { timeout: 120000 }, id);
    await sleep(600);
    await page.evaluate(() => window.__FORMA.actions.setImmersive(false));
    const dataUrl = await page.evaluate(SQUASH, SIZE);
    const file = path.join(THUMBS, id + '.png');
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`缩略图 ${id}.png  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }

  await browser.close();
  console.log(`完成：${ids.length} 张 → ${THUMBS}`);
})().catch((e) => { console.error(e); process.exit(1); });
