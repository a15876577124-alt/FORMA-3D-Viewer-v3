// Before/after study harness for asset repair and shading decisions.
//
//   node tools/test-ab.mjs --study=normals      normal-repair A/B/C
//   node tools/test-ab.mjs --study=hardedge     hard-angle sweep (180/90/75/60/45/30)
//   node tools/test-ab.mjs --study=custom --set='[{"key":"X","dir":"assets/variants/HA-60/"}]'
//
// Everything is rendered through the app's own Viewer over HTTP, then read back
// out of the live canvas. Nothing here is mocked and nothing is retouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true) : fallback;
};

const BASE = String(arg('base', process.env.FORMA_BASE || 'http://127.0.0.1:5173'));
const STUDY = String(arg('study', 'normals'));
const SCALE = Number(arg('scale', 2));

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const COMMON = [
  '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  '--disable-features=Vulkan', '--window-size=1400,1000', '--mute-audio',
];
const LADDER = [
  ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  ['--enable-unsafe-swiftshader'],
  [],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(ROOT, 'test-out', 'ab-' + STUDY);
fs.mkdirSync(OUT, { recursive: true });

const FIG = './../assets/variants/';
const FINAL = './../assets/models/';

const STUDIES = {
  normals: {
    note: '法线修复前后对照：F = glTF 规范对缺 NORMAL 的默认处理（flat shading）；V = 朴素逐索引平均（不焊接）；W = 本项目位置焊接法线；C = 交付版本。四者同源同材质，仅法线策略不同。',
    variants: [
      { key: 'F', label: 'F · 修复前：glTF 规范默认（flat shading 逐面着色）', dir: FIG + 'A-raw/', post: 'flat' },
      { key: 'V', label: 'V · 朴素逐索引平均 computeVertexNormals()（UV 接缝发暗）', dir: FIG + 'A-raw/', post: 'naive' },
      { key: 'W', label: 'W · 位置焊接 + 面积加权（本项目算法）', dir: FIG + 'A-raw/', post: 'welded' },
      { key: 'C', label: 'C · 交付版（预烘焙法线 + metallicFactor=0 + sampler）', dir: FINAL, post: 'none' },
    ],
  },
  hardedge: {
    note: '硬边阈值扫描：数值越小，越多夹角余弦不同的邻接面被排除出平滑',
    variants: [
      { key: '180', label: '180° 纯平滑（当前交付）', dir: FINAL },
      { key: '90',  label: '90°',  dir: FIG + 'HA-90/' },
      { key: '75',  label: '75°',  dir: FIG + 'HA-75/' },
      { key: '60',  label: '60°',  dir: FIG + 'HA-60/' },
      { key: '45',  label: '45°',  dir: FIG + 'HA-45/' },
      { key: '30',  label: '30°（接近逐面着色）', dir: FIG + 'HA-30/' },
    ],
  },
};

const customSet = arg('set', null);
if (STUDY === 'custom') {
  if (!customSet) { console.error('--study=custom 需要 --set=<json>'); process.exit(2); }
  STUDIES.custom = { note: '自定义对照', variants: JSON.parse(customSet) };
}
const STUDY_DEF = STUDIES[STUDY];
if (!STUDY_DEF) { console.error('未知 study: ' + STUDY + '（可选: ' + Object.keys(STUDIES).join(', ') + '）'); process.exit(2); }

// --------------------------------------------------------------- analysis --
function stats(px) {
  const { N, lum } = px;
  const n = N * N;
  const at = (x, y) => lum[y * N + x];
  let sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) { sum += lum[i]; sum2 += lum[i] * lum[i]; }
  const mean = sum / n;
  const variance = Math.max(0, sum2 / n - mean * mean);

  let bSum = 0, bN = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (x < 6 || y < 6 || x >= N - 6 || y >= N - 6) { bSum += at(x, y); bN++; }
  const bg = bSum / bN;

  const mask = new Uint8Array(n);
  let cov = 0;
  for (let i = 0; i < n; i++) if (Math.abs(lum[i] - bg) > 12) { mask[i] = 1; cov++; }
  let mSum = 0;
  for (let i = 0; i < n; i++) if (mask[i]) mSum += lum[i];
  const maskMean = cov ? mSum / cov : 0;

  // Mean |Laplacian| over the subject. Per-face (faceted) shading puts a hard
  // luminance step on every triangle border, which drives this up. Meaningful
  // only as a RELATIVE comparison across variants of the same mesh.
  let lapSum = 0, lapN = 0;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    if (!(mask[i] && mask[i - 1] && mask[i + 1] && mask[i - N] && mask[i + N])) continue;
    lapSum += Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - N] - lum[i + N]);
    lapN++;
  }
  return {
    bg: +bg.toFixed(2), mean: +mean.toFixed(2), stddev: +Math.sqrt(variance).toFixed(2),
    coverage: +coverage(cov, n), subjectMean: +maskMean.toFixed(2),
    laplacian: +(lapN ? lapSum / lapN : 0).toFixed(3),
  };
  function coverage(c, t) { return +(c / t).toFixed(5); }
}

function diff(a, b) {
  const px = a.N * a.N;
  let s = 0, changed = 0;
  for (let i = 0; i < px * 3; i += 3) {
    const d = Math.abs(a.rgb[i] - b.rgb[i]) + Math.abs(a.rgb[i + 1] - b.rgb[i + 1]) + Math.abs(a.rgb[i + 2] - b.rgb[i + 2]);
    s += d;
    if (d > 12) changed++;
  }
  return { meanChannelDiff: +(s / (px * 3)).toFixed(2), changedPct: +(100 * changed / px).toFixed(2) };
}

async function launchWithGL() {
  for (const extra of LADDER) {
    const args = [...COMMON, ...extra];
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: BROWSERS, args, headless: true,
        protocolTimeout: 240000, defaultViewport: { width: 1200, height: 800 },
      });
    } catch { continue; }
    const page = await browser.newPage();
    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return null;
      const e = g.getExtension('WEBGL_debug_renderer_info');
      return { api: g.getParameter(g.VERSION), renderer: String((e && g.getParameter(e.UNMASKED_RENDERER_WEBGL)) || '') };
    });
    await page.close();
    if (gl) return { browser, args, gl };
    await browser.close();
  }
  throw new Error('无法创建 WebGL 上下文');
}

async function main() {
  if (!BROWSERS) { console.error('找不到 Chromium 内核浏览器（Edge / Chrome）。'); process.exit(2); }
  const IDS = String(arg('ids', 'sheng,dan,jing-red,jing-yellow,jing-white')).split(',');
  const KEYS = STUDY_DEF.variants.map(v => v.key);

  const { browser, gl } = await launchWithGL();
  console.log(`study : ${STUDY}  — ${STUDY_DEF.note}`);
  console.log(`浏览器: ${BROWSERS}`);
  console.log(`WebGL : ${gl.api} / ${gl.renderer}`);
  STUDY_DEF.variants.forEach(v => console.log(`  ${v.key.padEnd(4)} ${v.label}`));
  console.log('');

  const url = `${BASE}/tests/ab.html?v=${encodeURIComponent(JSON.stringify(STUDY_DEF.variants))}`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__AB_READY === true || window.__AB_ERR', { timeout: 60000 });
  const bootErr = await page.evaluate(() => window.__AB_ERR || null);
  if (bootErr) { console.error('页面启动失败:\n' + bootErr); await browser.close(); process.exit(1); }

  const rows = [];
  for (const id of IDS) {
    const v = {};
    for (const key of KEYS) {
      await page.evaluate((i, k) => window.__AB.show(i, k), id, key);
      await sleep(260);
      const px = await page.evaluate(() => window.__AB.probe());
      const st = await page.evaluate(() => window.__AB.stats());
      v[key] = { ...stats(px), raw: px, load: { tris: st.tris, meshesWithNormal: st.hasNormal, mesh: st.mesh,
        metalness: st.metalness, flatShading: st.flatShading } };
    }
    console.log(`── ${id} ─────────────────────────────────────────────────`);
    console.log('   key   主体亮度   覆盖占比   |Laplacian|   法线网格   metal   相对首项变化像素');
    const base = KEYS[0];
    for (const key of KEYS) {
      const t = v[key];
      const d = key === base ? '-' : diff(v[base].raw, t.raw).changedPct + '%';
      console.log(`   ${String(key).padEnd(5)} ${String(t.subjectMean).padStart(8)} ${String(t.coverage).padStart(10)} ${String(t.laplacian).padStart(12)}   ${t.load.meshesWithNormal}/${t.load.mesh}      ${String(t.load.metalness).padEnd(5)} flat=${String(t.load.flatShading).padEnd(5)} ${String(d).padStart(10)}`);
    }
    const full = {};
    for (const key of KEYS) {
      await page.evaluate((i, k) => window.__AB.show(i, k), id, key);
      const dataUrl = await page.evaluate((s) => window.__AB.png(s), SCALE);
      fs.writeFileSync(path.join(OUT, `${id}-${key}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
      delete v[key].raw;
      full[key] = v[key];
    }
    rows.push({ id, variants: full });
  }

  fs.writeFileSync(path.join(OUT, 'ab-report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), study: STUDY, note: STUDY_DEF.note,
    base: BASE, webgl: gl, variants: STUDY_DEF.variants, exhibits: rows, consoleErrors: errors,
  }, null, 2), 'utf8');

  console.log('');
  console.log(`控制台错误: ${errors.length}`);
  errors.slice(0, 8).forEach(e => console.log('  · ' + e));
  console.log(`图片  : ${OUT}\\<id>-<key>.png`);
  console.log(`数据  : ${OUT}\\ab-report.json`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
