// Composes stills into a labelled contact sheet, so a set of variants can be
// compared side by side in one image. Uses the browser's canvas because there is
// no image library available offline.
//
//   node tools/make-montage.mjs --dir=test-out/ab-hardedge --pattern='<id>-<key>'
//        --ids=sheng,dan --keys=N,V,W,B,C --cols=3 --cell=520 --out=test-out/montage.png
//        [--crop=l,t,w,h]   crop each source to the subject before scaling
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return hit ? (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true) : f;
};

const DIR = path.resolve(ROOT, String(arg('dir', 'test-out/ab-normals')));
const IDS = String(arg('ids', 'sheng')).split(',');
const KEYS = String(arg('keys', 'N,V,W,B,C')).split(',');
const COLS = Number(arg('cols', KEYS.length));
const CELL = Number(arg('cell', 460));
const OUTP = path.resolve(ROOT, String(arg('out', 'test-out/montage.png')));
const CROP = String(arg('crop', ''));                 // "left,top,width,height" fractions
const SCALE_MODE = String(arg('fit', 'cover'));       // cover | contain
const TITLE = String(arg('title', ''));

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const cells = [];
for (const id of IDS) for (const key of KEYS) {
  const p = path.join(DIR, `${id}-${key}.png`);
  if (!fs.existsSync(p)) { console.warn('缺少 ' + path.basename(p)); continue; }
  cells.push({ id, key, b64: fs.readFileSync(p).toString('base64') });
}
if (!cells.length) { console.error('没有可合成的图片'); process.exit(1); }

const rows = Math.ceil(cells.length / COLS);
const W = COLS * CELL;
const H = rows * CELL + (TITLE ? 46 : 0);

const browser = await puppeteer.launch({
  executablePath: BROWSERS, headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });

const url = await page.evaluate(async (cells, W, H, COLS, CELL, CROP, FIT, TITLE) => {
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const g = cvs.getContext('2d');
  g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
  if (TITLE) { g.fillStyle = '#e8eef5'; g.font = '600 26px system-ui, sans-serif'; g.fillText(TITLE, 18, 32); }

  const crop = CROP ? CROP.split(',').map(Number) : null;
  for (let i = 0; i < cells.length; i++) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + cells[i].b64; });
    const sx = crop ? crop[0] * img.width : 0;
    const sy = crop ? crop[1] * img.height : 0;
    const sw = crop ? crop[2] * img.width : img.width;
    const sh = crop ? crop[3] * img.height : img.height;
    const s = FIT === 'contain' ? Math.min(CELL / sw, CELL / sh) : Math.max(CELL / sw, CELL / sh);
    const dw = sw * s, dh = sh * s;
    const gx = (i % COLS) * CELL, gy = Math.floor(i / COLS) * CELL + (TITLE ? 46 : 0);
    g.save();
    g.beginPath(); g.rect(gx, gy, CELL, CELL); g.clip();
    g.drawImage(img, sx, sy, sw, sh, gx + (CELL - dw) / 2, gy + (CELL - dh) / 2, dw, dh);
    g.restore();
    // label
    g.fillStyle = 'rgba(0,0,0,0.62)';
    g.fillRect(gx, gy + CELL - 40, CELL, 40);
    g.fillStyle = '#f2f6fa';
    g.font = '600 20px system-ui, sans-serif';
    g.fillText(`${cells[i].id} · ${cells[i].key}`, gx + 14, gy + CELL - 13);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1;
    g.strokeRect(gx + 0.5, gy + 0.5, CELL - 1, CELL - 1);
  }
  return cvs.toDataURL('image/png');
}, cells, W, H, COLS, CELL, CROP, SCALE_MODE, TITLE);

fs.mkdirSync(path.dirname(OUTP), { recursive: true });
fs.writeFileSync(OUTP, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
console.log(`已生成 ${OUTP}  (${W}x${H}, ${cells.length} 格)`);
