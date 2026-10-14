// Import pipeline test, driven with REAL files from this machine:
//   - the original Wavefront OBJ + MTL + PNG set the figurines were built from
//   - one of the project's own GLBs (exercises the File branch, not the URL branch)
//   - deliberately corrupt files, to prove failures never damage the stage
//
//   node tools/test-import.mjs [--base=http://127.0.0.1:5173]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBJ_DIR = 'D:\\琼韵新生\\_Coze_Drive_3D模型生成项目_琼剧Q版玩偶_琼剧Q版玩偶_OBJ模型\\3D模型v5_OBJ\\01_生角';

const argv = process.argv.slice(2);
const get = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const BASE = String(get('base', process.env.FORMA_BASE || 'http://127.0.0.1:5173'));

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scratch copies with ASCII-safe names (uploadFile + non-ASCII paths can be
// flaky depending on the Chromium build).
function stage(name, ...sources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forma-import-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.concat(sources.map((s) => (Buffer.isBuffer(s) ? s : fs.readFileSync(s)))));
  return file;
}

const results = [];
const t = (name, fn) => results.push({ name, fn });

async function upload(page, files) {
  const input = await page.$('#fileInput');
  await input.uploadFile(...files);
}

async function waitImported(page, ms = 120000) {
  await page.waitForFunction(() => window.__FORMA.current && String(window.__FORMA.current.id).startsWith('imported:'), { timeout: ms });
  await page.waitForFunction(() => window.__FORMA.info.modelTris > 0, { timeout: ms });
  await sleep(400);
}

t('导入: 原始 OBJ + MTL + PNG 全链路', async (ctx) => {
  const obj = path.join(OBJ_DIR, '01_生角.obj');
  const mtl = path.join(OBJ_DIR, 'material.mtl');
  const png = fs.readdirSync(OBJ_DIR).find((f) => /\.png$/i.test(f));
  if (!fs.existsSync(obj) || !png) throw new Error('源 OBJ 文件缺失');
  await upload(ctx.page, [obj, mtl, path.join(OBJ_DIR, png)]);
  await waitImported(ctx.page);
  const s = await ctx.page.evaluate(() => ({
    id: window.__FORMA.current.id,
    format: window.__FORMA.info.format,
    tris: window.__FORMA.info.modelTris,
    drawn: window.__FORMA.info.renderTriangles,
    hasMap: window.__FORMA.viewer.readMaterial()?.hasMap,
  }));
  if (s.format !== 'obj') throw new Error('format=' + s.format);
  if (s.tris < 10000) throw new Error('三角形数异常 ' + s.tris);
  if (s.drawn < 10000) throw new Error('未实际绘制: ' + s.drawn);
  if (!s.hasMap) throw new Error('贴图未挂载到材质');
  // imported group appears in the sidebar
  const cards = await ctx.page.evaluate(() => document.querySelectorAll('.group[data-group="imported"] .asset').length);
  if (cards < 1) throw new Error('侧栏没有出现导入分组');
});

t('导入: OBJ 缺少 MTL 时给出明确警告且仍显示几何', async (ctx) => {
  const obj = path.join(OBJ_DIR, '01_生角.obj');
  const png = path.join(OBJ_DIR, fs.readdirSync(OBJ_DIR).find((f) => /\.png$/i.test(f)));
  await upload(ctx.page, [obj, png]);
  await waitImported(ctx.page);
  const toast = await ctx.page.evaluate(() => document.getElementById('toastWrap').innerText);
  if (!/\.mtl|MTL/i.test(toast)) throw new Error('缺少 MTL 警告，实际 toast: ' + toast.slice(0, 120));
});

t('导入: GLB 走 File 分支（本项目的 sheng.glb）', async (ctx) => {
  const glb = path.join(ROOT, 'assets', 'models', 'sheng.glb');
  await upload(ctx.page, [glb]);
  await waitImported(ctx.page);
  const s = await ctx.page.evaluate(() => ({
    format: window.__FORMA.info.format,
    tris: window.__FORMA.info.modelTris,
    drawn: window.__FORMA.info.renderTriangles,
  }));
  if (s.format !== 'imported-gltf') throw new Error('format=' + s.format);
  if (s.drawn < 10000) throw new Error('未实际绘制: ' + s.drawn);
});

t('导入: 损坏的 GLB 报错且当前展品不受影响', async (ctx) => {
  const before = await ctx.page.evaluate(() => window.__FORMA.current.id);
  const bad = stage('corrupt.glb', Buffer.from('this is not a glb file at all, just noise 0123456789'));
  await upload(ctx.page, [bad]);
  await sleep(2500);
  const s = await ctx.page.evaluate(() => ({
    now: window.__FORMA.current.id,
    drawn: window.__FORMA.info.renderTriangles,
    toast: document.getElementById('toastWrap').innerText,
  }));
  if (s.now !== before) throw new Error('失败导入不应改变当前展品: ' + s.now);
  if (s.drawn < 1000) throw new Error('舞台被清空了');
  if (!s.toast || !/glTF|GLB|损坏|有效/.test(s.toast)) throw new Error('缺少可读的错误提示: ' + s.toast.slice(0, 120));
});

t('导入: 不支持的类型被拒绝并提示', async (ctx) => {
  const txt = stage('notes.txt', Buffer.from('hello'));
  await upload(ctx.page, [txt]);
  await sleep(1200);
  const toast = await ctx.page.evaluate(() => document.getElementById('toastWrap').innerText);
  if (!/不支持/.test(toast)) throw new Error('缺少不支持提示: ' + toast.slice(0, 120));
});

t('导入: FBX 静态网格（自产 ASCII FBX 样例）', async (ctx) => {
  const fbx = path.join(ROOT, 'test-assets', 'ascii-cube.fbx');
  if (!fs.existsSync(fbx)) throw new Error('样例缺失，先运行 node tools/make-fbx-sample.mjs');
  await upload(ctx.page, [fbx]);
  await waitImported(ctx.page);
  const s = await ctx.page.evaluate(() => ({
    format: window.__FORMA.info.format,
    tris: window.__FORMA.info.modelTris,
    anims: window.__FORMA.info.animations,
  }));
  if (s.format !== 'fbx') throw new Error('format=' + s.format);
  if (s.tris !== 12) throw new Error('立方体应为 12 三角形，实际 ' + s.tris);
  const toast = await ctx.page.evaluate(() => document.getElementById('toastWrap').innerText);
  if (!/不含动画/.test(toast)) throw new Error('应提示无动画剪辑');
});

t('导入: FBX 错误路径提示明确', async (ctx) => {
  const before = await ctx.page.evaluate(() => window.__FORMA.current.id);
  const bad = stage('fake.fbx', Buffer.from('Kaydara FBX Binary  \x00\x1a\x00\x00' + 'x'.repeat(256)));
  await upload(ctx.page, [bad]);
  await sleep(2500);
  const s = await ctx.page.evaluate(() => ({
    now: window.__FORMA.current.id,
    drawn: window.__FORMA.info.renderTriangles,
    toast: document.getElementById('toastWrap').innerText,
  }));
  if (s.now !== before) throw new Error('失败导入不应改变当前展品');
  if (!s.toast) throw new Error('没有错误提示');
});

t('导入: 拖放路径与对话框路径等价', async (ctx) => {
  // DataTransfer can't be synthesised with real File objects cross-process, so
  // this exercises the same importFiles() entry point the drop handler calls.
  const glb = path.join(ROOT, 'assets', 'models', 'jing-red.glb');
  await ctx.page.evaluate(async (b64, name) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], name, { type: 'model/gltf-binary' });
    await window.__FORMA.actions.importFiles([file]);
  }, fs.readFileSync(glb).toString('base64'), 'jing-red.glb');
  await waitImported(ctx.page);
  const fmt = await ctx.page.evaluate(() => window.__FORMA.info.format);
  if (fmt !== 'imported-gltf') throw new Error('format=' + fmt);
});

t('导入: 返回目录展品并恢复其参数', async (ctx) => {
  await ctx.page.evaluate(() => window.__FORMA.select('sheng'));
  await ctx.page.waitForFunction(() => window.__FORMA.current && window.__FORMA.current.id === 'sheng', { timeout: 60000 });
  const drawn = await ctx.page.evaluate(() => window.__FORMA.info.renderTriangles);
  if (drawn < 10000) throw new Error('回到目录展品后未渲染: ' + drawn);
});

t('收尾: 全程无页面异常', async (ctx) => {
  if (ctx.pageErrors.length) throw new Error(ctx.pageErrors.slice(0, 3).join(' | '));
});

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSERS, headless: true, acceptInsecureCerts: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await page.on('dialog', (d) => d.dismiss().catch(() => {}));

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 90000 });
  await page.evaluate(() => window.__FORMA.ready);
  await sleep(400);

  const ctx = { page, consoleErrors, pageErrors };
  let failed = 0;
  for (const { name, fn } of results) {
    try {
      await fn(ctx);
      console.log(`[PASS] ${name}`);
    } catch (e) {
      failed++;
      console.log(`[FAIL] ${name}\n       ${e.message}`);
    }
  }
  console.log(`\n导入测试: ${results.length - failed}/${results.length} 通过`);
  if (consoleErrors.length) console.log('（控制台错误 ' + consoleErrors.length + ' 条，导入场景中 4xx 资源与解析报错属预期，详见报告）');
  fs.writeFileSync(path.join(ROOT, 'test-out', 'import-report.json'),
    JSON.stringify({ passed: results.length - failed, total: results.length, consoleErrors, pageErrors }, null, 2));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
