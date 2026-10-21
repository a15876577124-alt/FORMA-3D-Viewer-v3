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
import { launchBrowser } from './browser-test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const get = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const BASE = String(get('base', process.env.FORMA_BASE || 'http://127.0.0.1:5173'));

// 原始 OBJ 素材不在仓库内（体积大且不入库），路径可用 --objDir= / FORMA_OBJ_DIR 覆盖。
// 目录不可用时，依赖它的两条用例按 SKIP 处理并在报告里写明，而不是误报为回归。
const OBJ_DIR = String(get('objDir', process.env.FORMA_OBJ_DIR
  || 'D:\\琼韵新生\\_Coze_Drive_3D模型生成项目_琼剧Q版玩偶_琼剧Q版玩偶_OBJ模型\\3D模型v5_OBJ\\01_生角'));
let objAssets = null;
try {
  const files = fs.readdirSync(OBJ_DIR);
  const obj = files.find((f) => /\.obj$/i.test(f));
  const png = files.find((f) => /\.png$/i.test(f));
  if (obj && png) {
    const mtl = files.find((f) => /\.mtl$/i.test(f));
    objAssets = { obj: path.join(OBJ_DIR, obj), mtl: mtl ? path.join(OBJ_DIR, mtl) : null, png: path.join(OBJ_DIR, png) };
  }
} catch { /* 素材目录不可用 */ }
const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'import-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(OUT, { recursive: true });
const scratch = [];
process.once('exit', () => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true }); });

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
  scratch.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.concat(sources.map((s) => (Buffer.isBuffer(s) ? s : fs.readFileSync(s)))));
  return file;
}

const results = [];
// needsObj: true 的用例依赖仓库外的原始 OBJ 素材；素材不可用时跳过（不计失败）。
const t = (name, fn, opts = {}) => results.push({ name, fn, ...opts });

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
  const obj = objAssets.obj;
  const files = [obj, objAssets.png];
  if (objAssets.mtl) files.push(objAssets.mtl);
  await upload(ctx.page, files);
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
}, { needsObj: true });

t('导入: OBJ 缺少 MTL 时给出明确警告且仍显示几何', async (ctx) => {
  await upload(ctx.page, [objAssets.obj, objAssets.png]);
  await waitImported(ctx.page);
  const toast = await ctx.page.evaluate(() => document.getElementById('toastWrap').innerText);
  if (!/\.mtl|MTL/i.test(toast)) throw new Error('缺少 MTL 警告，实际 toast: ' + toast.slice(0, 120));
}, { needsObj: true });

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

t('导入: 真实 FBX（二进制、带骨骼动画剪辑）', async (ctx) => {
  const fbx = path.join(ROOT, 'test-assets', 'RotationTest.fbx');
  if (!fs.existsSync(fbx)) throw new Error('样例缺失：test-assets/RotationTest.fbx');
  await upload(ctx.page, [fbx]);
  await waitImported(ctx.page);
  const s = await ctx.page.evaluate(() => ({
    format: window.__FORMA.info.format,
    tris: window.__FORMA.info.modelTris,
    anims: window.__FORMA.info.animations,
    hasMap: window.__FORMA.viewer.readMaterial()?.hasMap,
  }));
  if (s.format !== 'fbx') throw new Error('format=' + s.format);
  if (s.tris < 10) throw new Error('几何未解析: ' + s.tris);
  if (!s.anims) throw new Error('FBX 未解析出动画剪辑');
  // The clip must be drivable: play it and confirm the mixer actually advances.
  const moved = await ctx.page.evaluate(async () => {
    const v = window.__FORMA.viewer;
    v.playClip(0);
    const before = v.mixer ? v.mixer.time : -1;
    await new Promise((r) => setTimeout(r, 500));
    return { before, after: v.mixer ? v.mixer.time : -1, playing: !!(v.action && v.action.isRunning()) };
  });
  if (moved.after <= moved.before) throw new Error(`动画剪辑未推进: ${moved.before} -> ${moved.after}`);
  await ctx.page.evaluate(() => window.__FORMA.viewer.toggleAnimation());
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

t('导入: 非嵌入式 .gltf + .bin + 贴图 三件套', async (ctx) => {
  const PKG = path.join(ROOT, 'test-assets', 'gltf-package');
  const gltf = path.join(PKG, 'sheng.gltf');
  const bin = path.join(PKG, 'sheng.bin');
  const png = path.join(PKG, 'sheng.png');
  for (const f of [gltf, bin, png]) {
    if (!fs.existsSync(f)) throw new Error('样例缺失: ' + path.basename(f) + '（先跑 node tools/make-gltf-sample.mjs）');
  }
  // The dependency files are passed alongside the main file, exactly like a
  // user multi-selecting a whole export folder in the dialog.
  await upload(ctx.page, [gltf, bin, png]);
  await waitImported(ctx.page);
  const s = await ctx.page.evaluate(() => ({
    format: window.__FORMA.info.format,
    tris: window.__FORMA.info.modelTris,
    drawn: window.__FORMA.info.renderTriangles,
    hasMap: window.__FORMA.viewer.readMaterial()?.hasMap,
  }));
  if (s.format !== 'imported-gltf') throw new Error('format=' + s.format);
  if (s.tris !== 47512) throw new Error('.bin 未正确解析，三角形数 ' + s.tris);
  if (s.drawn < 10000) throw new Error('未实际绘制: ' + s.drawn);
  if (!s.hasMap) throw new Error('外部贴图未挂载');
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
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await page.on('dialog', (d) => d.dismiss().catch(() => {}));

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

  // 导入验收需要 3D 图层可见（V5 路由图层化：仅 #/gallery 激活时才显示 #app）
  await page.goto(BASE + '/index.html#/gallery', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const a = document.getElementById('app');
    return !!a && !a.hidden && a.offsetParent !== null;
  }, { timeout: 30000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 90000 });
  await page.evaluate(() => window.__FORMA.ready);
  await sleep(400);

  const ctx = { page, consoleErrors, pageErrors };
  let failed = 0;
  const skipped = [];
  for (const { name, fn, needsObj } of results) {
    if (needsObj && !objAssets) {
      skipped.push(name);
      console.log(`[SKIP] ${name}\n       原始 OBJ 素材不可用：${OBJ_DIR}`);
      continue;
    }
    try {
      await fn(ctx);
      console.log(`[PASS] ${name}`);
    } catch (e) {
      failed++;
      console.log(`[FAIL] ${name}\n       ${e.message}`);
    }
  }
  console.log(`\n导入测试: ${results.length - failed - skipped.length}/${results.length} 通过${skipped.length ? `，${skipped.length} 条跳过（缺原始 OBJ 素材）` : ''}`);
  if (consoleErrors.length) console.log('（控制台错误 ' + consoleErrors.length + ' 条，导入场景中 4xx 资源与解析报错属预期，详见报告）');
  fs.writeFileSync(path.join(OUT, 'import-report.json'),
    JSON.stringify({ passed: results.length - failed - skipped.length, total: results.length, skipped, objDir: OBJ_DIR, objDirAvailable: !!objAssets, consoleErrors, pageErrors }, null, 2));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
