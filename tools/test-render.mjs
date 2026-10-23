// Real-browser render test.
//
// This drives the actual Chromium engine on this machine (Edge) through
// puppeteer-core and asserts that every exhibit really rasterises geometry - not
// that the loader returned, but that triangles reached the framebuffer. Nothing
// is mocked and nothing is assumed: the pixel statistics are read back out of the
// live WebGL canvas.
//
//   node tools/test-render.mjs [--base=http://127.0.0.1:5173] [--photos] [--probe-only]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, browserPath } from './browser-test.mjs';

// NOTE: never build paths from a raw file URL - import.meta.url is percent-encoded
// and on a Chinese path that yields a directory that does not exist.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes('=') ? hit.split('=')[1] : true) : fallback;
};

const BASE = String(arg('base', process.env.FORMA_BASE || 'http://127.0.0.1:5173'));
const WITH_PHOTOS = !!arg('photos', false);
const PROBE_ONLY = !!arg('probe-only', false);
// --headed displays the browser. Both modes use the default backend; report the actual GPU.
const HEADED = !!arg('headed', false);

const BROWSERS = browserPath;

const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs inside the page: force a synchronous render, then read the framebuffer.
const PROBE = () => {
  const c = document.getElementById('stage');
  const N = 224;
  const c2 = document.createElement('canvas');
  c2.width = N; c2.height = N;
  const ctx = c2.getContext('2d', { willReadFrequently: true });
  if (window.__FORMA && window.__FORMA.renderNow) window.__FORMA.renderNow();
  ctx.drawImage(c, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;

  const n = N * N;
  const lum = new Float64Array(n);
  let sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = L; sum += L; sum2 += L * L;
  }
  const mean = sum / n;
  const variance = Math.max(0, sum2 / n - mean * mean);

  // Background estimate from the frame border; the subject always sits inside it.
  let bsum = 0, bcount = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const edge = x < 6 || y < 6 || x >= N - 6 || y >= N - 6;
      if (!edge) continue;
      bsum += lum[y * N + x]; bcount++;
    }
  }
  const bg = bsum / Math.max(1, bcount);

  let covered = 0, blown = 0, coloured = 0;
  let redPx = 0, yellowPx = 0, brightNeutralPx = 0;
  const hues = new Set();
  for (let i = 0; i < n; i++) {
    if (lum[i] > bg + 14) covered++;
    if (lum[i] > 252) blown++;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 18 ? (mx - mn) / mx : 0;
    if (sat > 0.16) coloured++;
    if (mx > 60 && sat > 0.3) {
      // hue in degrees
      let h = 0;
      if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
      else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
      else h = 60 * ((r - g) / (mx - mn) + 4);
      if (h < 0) h += 360;
      if (h < 22 || h > 335) redPx++;
      else if (h >= 38 && h <= 75) yellowPx++;
    }
    if (lum[i] > 190 && sat < 0.12) brightNeutralPx++;
    hues.add((r >> 3 << 10) | (g >> 3 << 5) | (b >> 3));
  }

  return {
    width: c.width, height: c.height,
    mean: +mean.toFixed(3),
    variance: +variance.toFixed(2),
    stddev: +Math.sqrt(variance).toFixed(3),
    bg: +bg.toFixed(3),
    coverage: +(covered / n).toFixed(5),
    blownRatio: +(blown / n).toFixed(5),
    colouredRatio: +(coloured / n).toFixed(5),
    redRatio: +(redPx / n).toFixed(5),
    yellowRatio: +(yellowPx / n).toFixed(5),
    brightNeutralRatio: +(brightNeutralPx / n).toFixed(5),
    uniqueColors: hues.size,
  };
};

async function launchWithGL() {
  const browser = await launchBrowser(HEADED ? { headless: false } : {});
  try {
    const page = await browser.newPage();
    const gl = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('webgl2');
      if (!context) return null;
      const ext = context.getExtension('WEBGL_debug_renderer_info');
      return { api: 'webgl2', renderer: ext ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER) };
    });
    await page.close();
    if (!gl) throw new Error('浏览器无法创建 WebGL2 上下文；没有降低浏览器安全设置。');
    return { browser, args: [], gl };
  } catch (error) { await browser.close(); throw error; }
}

// Colour guardrails: the face-paint hues that define each figurine must survive
// tone mapping. Ratios are of the whole frame, so they only have to clear a low bar.
const COLOUR_RULES = {
  'sheng':       [['redRatio', 0.015]],
  'dan':         [['redRatio', 0.015]],
  'jing-red':    [['redRatio', 0.03]],
  'jing-yellow': [['yellowRatio', 0.01], ['redRatio', 0.01]],
  'jing-white':  [['brightNeutralRatio', 0.02]],
};

function verdict(id, info, px) {
  const checks = [];
  const add = (name, ok, actual, expected) => checks.push({ name, ok: !!ok, actual, expected });

  add('model-triangles-loaded', info.modelTris > 1000, info.modelTris, '> 1000');
  add('model-vertices-loaded', info.modelVerts > 1000, info.modelVerts, '> 1000');
  add('triangles-rasterised', info.renderTriangles > 1000, info.renderTriangles, '> 1000');
  add('draw-calls', info.renderCalls >= 2, info.renderCalls, '>= 2');
  add('canvas-has-pixels', px.width > 100 && px.height > 100, `${px.width}x${px.height}`, '> 100x100');
  add('reference-frame-size',px.width===768&&px.height===718,`${px.width}x${px.height}`,'768x718');
  add('pixel-variance', px.variance > 200, px.variance, '> 200');
  add('subject-coverage', px.coverage > 0.02 && px.coverage < 0.92, px.coverage, '0.02 - 0.92');
  add('not-blown-out', px.blownRatio < 0.06, px.blownRatio, '< 0.06');
  add('has-coloured-surface', px.colouredRatio > 0.01, px.colouredRatio, '> 0.01');
  add('bbox-normalised-to-1.6', Math.abs(info.bboxHeight - 1.6) < 0.02, info.bboxHeight, '1.6 ± 0.02');

  for (const [key, min] of COLOUR_RULES[id] || []) {
    add(`colour:${key} >= ${min}`, px[key] >= min, px[key], `>= ${min}`);
  }

  const pass = checks.every((c) => c.ok);
  return { id, pass, checks, info, px };
}

(async () => {
  if (!BROWSERS) {
    console.error('找不到 Chromium 内核浏览器（Edge / Chrome）。测试无法进行。');
    process.exit(2);
  }

  console.log(`浏览器: ${BROWSERS}`);
  console.log(`目标地址: ${BASE}`);

  const { browser, args, gl } = await launchWithGL();
  console.log(`WebGL: ${gl.api} / ${gl.renderer}`);
  console.log(`启动参数: ${args.join(' ') || '(默认)'}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  page.on('console', (m) => {
    const t = m.type();
    const text = m.text();
    if (t === 'error') consoleErrors.push(text);
    else if (t === 'warning') consoleWarnings.push(text);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  page.on('requestfailed', (r) => pageErrors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));

  // 像素级渲染验收必须落在展厅路由：V5 路由图层化后，默认落地页是启动台，
  // 3D 图层（#app）处于隐藏态，canvas 会是 1x1，取不到任何像素。
  await page.goto(BASE + '/index.html#/gallery', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const a = document.getElementById('app');
    return !!a && !a.hidden && a.offsetParent !== null;
  }, { timeout: 30000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 60000 });
  // Awaiting the page-side readiness promise covers first model load + first frame.
  const firstOk = await page.evaluate(() => window.__FORMA.ready);
  // Colour ratios use the whole framebuffer. Preserve the measured RC1 reference
  // dimensions (768x718) across UI layouts, without changing camera presets,
  // authored materials, exposure or the existing thresholds. Production layout
  // and default-size screenshots are verified independently by portfolio/design.
  await page.evaluate(()=>{
    const v=window.__FORMA.viewer;
    v.viewport.style.cssText='position:fixed;left:0;top:0;width:768px;height:718px;z-index:10000';
    v.renderer.setPixelRatio(1);v.applyResize();
  });

  console.log(`首个展品就绪: ${firstOk ? '是' : '否'}`);
  await sleep(700);

  const results = [];
  const ids = ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white'];

  if (PROBE_ONLY) {
    const px = await page.evaluate(PROBE);
    const info = await page.evaluate(() => window.__FORMA.info);
    console.log(JSON.stringify({ info, px }, null, 2));
    await browser.close();
    return;
  }

  const before = await page.evaluate(() => window.__FORMA.info.memory);

  for (const id of ids) {
    await page.evaluate((x) => window.__FORMA.select(x), id);
    await page.waitForFunction((x) => window.__FORMA.current && window.__FORMA.current.id === x && window.__FORMA.info.modelTris > 0,
      { timeout: 90000 }, id);
    await sleep(500);                       // let damping settle + a few frames pass
    const info = await page.evaluate(() => window.__FORMA.info);
    const px = await page.evaluate(PROBE);
    const r = verdict(id, info, px);
    results.push(r);
    if (WITH_PHOTOS) {
      // Take the picture through the app's own export path (render + toDataURL in
      // one synchronous task) instead of CDP screenshot: without
      // preserveDrawingBuffer the compositor hands back an empty canvas.
      const dataUrl = await page.evaluate(() => window.__FORMA.viewer.capturePNG(2));
      fs.writeFileSync(path.join(OUT, `${id}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
    const bad = r.checks.filter((c) => !c.ok);
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${id.padEnd(12)} tris=${String(info.modelTris).padStart(6)} drawn=${String(info.renderTriangles).padStart(6)} var=${String(px.variance).padStart(8)} cov=${px.coverage}${bad.length ? '  ✗ ' + bad.map(b => b.name + '=' + b.actual).join(', ') : ''}`);
  }

  const after = await page.evaluate(() => window.__FORMA.info.memory);

  // Second cycle: same five again, to prove switching is repeatable and memory is bounded.
  for (const id of ids) {
    await page.evaluate((x) => window.__FORMA.select(x), id);
    await page.waitForFunction((x) => window.__FORMA.current && window.__FORMA.current.id === x && window.__FORMA.info.modelTris > 0, { timeout: 90000 }, id);
  }
  await sleep(400);
  const cycled = await page.evaluate(() => window.__FORMA.info.memory);

  const memoryBounded = ['geometries', 'textures', 'programs'].every((key) => cycled[key] <= after[key]);
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    browser: BROWSERS,
    args,
    webgl: gl,
    firstReady: !!firstOk,
    exhibits: results,
    memory: { before, afterFirstCycle: after, afterSecondCycle: cycled, bounded: memoryBounded },
    console: { errors: consoleErrors, warnings: consoleWarnings.slice(0, 20), pageErrors },
    summary: {
      exhibitsPassed: results.filter((r) => r.pass).length,
      exhibitsTotal: results.length,
      checksPassed: results.reduce((a, r) => a + r.checks.filter((c) => c.ok).length, 0),
      checksTotal: results.reduce((a, r) => a + r.checks.length, 0),
    },
  };

  fs.writeFileSync(path.join(OUT, 'render-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('');
  console.log(`展品通过: ${report.summary.exhibitsPassed}/${report.summary.exhibitsTotal}`);
  console.log(`断言通过: ${report.summary.checksPassed}/${report.summary.checksTotal}`);
  console.log(`显存对象 首次循环后: geo=${after.geometries} tex=${after.textures} prog=${after.programs}`);
  console.log(`显存对象 二次循环后: geo=${cycled.geometries} tex=${cycled.textures} prog=${cycled.programs}`);
  console.log(`控制台错误: ${consoleErrors.length}${consoleErrors.length ? '\n  ' + consoleErrors.slice(0, 10).join('\n  ') : ''}`);
  console.log(`页面异常: ${pageErrors.length}${pageErrors.length ? '\n  ' + pageErrors.slice(0, 10).join('\n  ') : ''}`);
  console.log(`报告: ${path.join(OUT, 'render-report.json')}`);

  await browser.close();
  const ok = report.summary.exhibitsPassed === report.summary.exhibitsTotal && memoryBounded && !consoleErrors.length && !pageErrors.length;
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
