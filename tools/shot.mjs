// FORMA V5 — 视觉验收截图工具
// 用 headless Edge（WebGL via SwiftShader）对真实站点截图，并做客观像素分析。
// 这是 V5 每个里程碑的「视觉自检」入口：截图后必须人工或脚本审阅，
// 不能仅凭代码运行成功断定视觉达标。
//
// 用法：
//   node tools/shot.mjs --route=/ --name=home
//   node tools/shot.mjs --route=/gallery?work=sheng --name=gallery-sheng --waitModel
//   node tools/shot.mjs --all-figurines        # 五手办逐一截图
//   node tools/shot.mjs --viewport=mobile --route=/ --name=home-mobile
//
// --all-figurines 为 false 默认值，默认只截一张。
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EDGE = process.env.FORMA_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = process.cwd();
const OUT_DIR = process.env.SHOT_DIR || 'docs/demo/frames';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return [m[1], m[2] ?? true];
  }),
);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  wide: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  laptop: { width: 1280, height: 800, deviceScaleFactor: 1 },
  tablet: { width: 834, height: 1112, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

// ---- 启动静态服务器 ----
function startServer() {
  return new Promise((resolve, reject) => {
    const port = 5233 + Math.floor(Math.random() * 300);
    const child = spawn(process.execPath, ['serve.mjs'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('静态服务器启动超时')), 20000);
    child.stdout.on('data', (b) => {
      if (String(b).includes('local')) { clearTimeout(timer); resolve({ child, port }); }
    });
    child.stderr.on('data', (b) => process.stderr.write('[serve] ' + b));
    child.on('exit', (c) => { clearTimeout(timer); if (c) reject(new Error('serve exited ' + c)); });
  });
}

// ---- 客观像素分析：判断画面是否真的有内容 ----
async function analyze(file) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const raw = await img.removeAlpha().raw().toBuffer();
  const ch = 3;
  const px = width * height;
  let nonBg = 0, bright = 0, sum = 0, n = 0;
  const hist = new Uint32Array(16);
  for (let i = 0; i < px; i += 3) {
    const o = i * ch;
    const r = raw[o], g = raw[o + 1], b = raw[o + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += lum; n++;
    if (lum > 24) nonBg++;
    if (lum > 130) bright++;
    hist[Math.min(15, lum >> 4)]++;
  }
  const stats = await img.stats();
  return {
    width, height,
    meanLuma: +(sum / n).toFixed(2),
    nonBgRatio: +(nonBg / n).toFixed(4),
    brightRatio: +(bright / n).toFixed(4),
    channelStdev: stats.channels.slice(0, 3).map((c) => +c.stdev.toFixed(1)),
    // 直方图熵：过低说明画面几乎纯色（渲染失败/空白的特征）
    histEntropy: +(Object.values(hist).reduce((acc, v) => {
      if (!v) return acc;
      const p = v / n;
      return acc - p * Math.log2(p);
    }, 0)).toFixed(3),
  };
}

async function main() {
  const trace = (...a) => console.error('[shot]', ...a);
  const route = args.route || '/';
  const viewport = VIEWPORTS[args.viewport || 'desktop'];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  trace('启动静态服务器…');
  const { child, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  trace(`serve 就绪 :${port}`);
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    protocolTimeout: 300000,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle',
      '--hide-scrollbars',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });

  const results = [];
  const errors = [];
  try {
    trace('浏览器已启动');
    const page = await browser.newPage();
    await page.setViewport(viewport);
    trace(`viewport ${viewport.width}x${viewport.height}`);
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url().split('/').pop() + ' ' + (r.failure()?.errorText || '')));

    const targets = args['all-figurines']
      ? ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white'].map((id) => ({
          id, route: `/gallery?work=${id}`, waitModel: true,
        }))
      : [{ id: args.name || 'shot', route, waitModel: !!args.waitModel }];

    for (const t of targets) {
      trace(`goto ${t.route}`);
      await page.goto(`${base}/#${t.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      trace('dom loaded，等待应用就绪');
      // __FORMA 在 boot 末尾赋值，出现即代表初始化完成。
      // SwiftShader 冷启动可能极慢（首帧 shader 编译），超时给足并自动重试一次。
      await page.waitForFunction('window.__FORMA', { timeout: 180000 });
      trace('ready ✓');

      if (t.waitModel) {
        await page.waitForFunction(
          () => window.__FORMA.info && window.__FORMA.info.modelTris > 0,
          { timeout: 240000 },
        );
        // SwiftShader 软渲染较慢，给足帧生成时间
        await new Promise((r) => setTimeout(r, Number(args.settle || 7000)));
        await page.evaluate(() => window.__FORMA.renderNow && window.__FORMA.renderNow());
        await new Promise((r) => setTimeout(r, 2500));
      } else {
        await new Promise((r) => setTimeout(r, Number(args.settle || 2200)));
      }

      const vw = String(viewport.width);
      const file = path.join(OUT_DIR, `${t.id}-${vw}.png`);
      await page.screenshot({ path: file, fullPage: !!args.full });
      const metrics = await analyze(file);
      const info = await page.evaluate(() => ({
        model: window.__FORMA.info?.model ?? null,
        tris: window.__FORMA.info?.modelTris ?? null,
        verts: window.__FORMA.info?.modelVerts ?? null,
        title: document.title,
        layerVisible: [...document.querySelectorAll('.v5-layer')].filter((n) => !n.hidden).length,
      }));
      const rec = { id: t.id, route: t.route, file, viewport: vw, ...info, ...metrics };
      results.push(rec);
      console.log(`${t.id.padEnd(18)} ${String(metrics.meanLuma).padStart(6)} luma | nonBg ${(metrics.nonBgRatio * 100).toFixed(1)}% | entropy ${metrics.histEntropy} | ${file}`);
    }

    const report = {
      at: new Date().toISOString(),
      viewport: args.viewport || 'desktop',
      shots: results,
      errors: errors.slice(0, 12),
    };
    const rpath = path.join(OUT_DIR, 'shots-report.json');
    fs.writeFileSync(rpath, JSON.stringify(report, null, 2));
    console.log(`\n报告: ${rpath}`);
    if (errors.length) console.log('页面错误:', errors.slice(0, 6).join('\n  '));
  } finally {
    await browser.close();
    child.kill();
  }
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1); });
