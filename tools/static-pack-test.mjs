// 静态发布包验收：证明「上传到 GitHub Pages 的那一份」真的能独立启动。
//
// 做法不是读文件清单，而是真的打包 → 真的起服务器 → 真的用浏览器加载 →
// 真的加载五件手办之一并读取三角形数。清单完整但打包后跑不起来，这里会失败。
//
// 覆盖：
//   1. tools/static-release.mjs --pack 产出的目录不含运行期目录（assets/library、pipeline-out…）
//   2. 静态包内每个请求都 200（/api/* 除外：后端本来就不在静态包里）
//   3. #/gallery?work=jing-red 能选中并渲染到 49,178 三角形（与 ground truth 一致）
//   4. 切到 #/studio 时后端状态如实显示「后端未运行」，不假装在线
//   5. 全程零 pageerror、零未捕获控制台错误
import { launchBrowser } from './browser-test.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'static-pack-' + Date.now()));
const CANDIDATE = process.env.FORMA_STATIC_CANDIDATE;
const PACK = CANDIDATE ? path.resolve(CANDIDATE) : path.join(ROOT, 'test-out', 'static-site-' + Date.now());
const PORT = Number(process.env.FORMA_STATIC_PACK_PORT || 0);
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); } else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd: ROOT, stdio: 'inherit', ...opts });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.join(' ')} 退出码 ${code}`))));
  });
}

// ---------------------------------------------------------------- 1. 打包
console.log(CANDIDATE ? '[A] 验收指定候选包（不重建）' : '[A] 生成静态发布包');
if (!CANDIDATE) await run(process.execPath, ['tools/static-release.mjs', `--pack=${PACK}`, '--quiet']);
ok('静态包已生成', fs.existsSync(path.join(PACK, 'index.html')));
for(const license of ['vendor/three/LICENSE','vendor/fflate/LICENSE','vendor/postprocessing/LICENSE.md'])ok('保留第三方许可 '+license,fs.existsSync(path.join(PACK,license)));

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'STATIC-MANIFEST.json'), 'utf8'));
ok('清单文件数与实际一致', manifest.files.every((f) => fs.existsSync(path.join(PACK, f.path))), `${manifest.totals.files} 项`);
ok('候选文件哈希与清单一致', manifest.files.every(f => {
  const p=path.join(PACK,f.path);
  return fs.existsSync(p)&&crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').startsWith(f.sha256);
}));

const forbiddenPresent = ['assets/library', 'pipeline-out', 'backend', 'test-assets']
  .filter((d) => fs.existsSync(path.join(PACK, d)));
ok('静态包不含运行期/后端目录', forbiddenPresent.length === 0, forbiddenPresent.join(','));

const glbs = fs.readdirSync(path.join(PACK, 'assets', 'portfolio-v1')).filter((f) => f.endsWith('.glb'));
ok('五个手办模型都在静态包里', glbs.length === 5, glbs.join(','));

// Run the preview server delivered in the manifest itself; no post-pack repair/copy.
const served = spawn(process.execPath, ['serve.mjs'], {
  cwd: PACK,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', FORMA_BACKEND: 'http://127.0.0.1:65530' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.on('exit', () => { try { served.kill(); } catch { /* 已退出 */ } });
let BASE;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('静态包服务器启动超时')), 15000);
  served.stdout.on('data', (b) => { const match=String(b).match(/http:\/\/127\.0\.0\.1:(\d+)/); if(match) {BASE=match[0];clearTimeout(timer);resolve();} });
  served.once('exit', (c) => { clearTimeout(timer); if (c) reject(new Error('静态包服务器退出 ' + c)); });
});

// ---------------------------------------------------------------- 2. 真实浏览器
console.log('[B] 浏览器加载静态包');
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const pageErrors = [];
  const failed = [];
  page.on('pageerror', (e) => { pageErrors.push(String(e.message)); console.error('PAGE ERROR',e.message); });
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.v5-hero-3d[data-model-state="ready"]');
  ok('候选包首页真实 Hero 和五件缩略图可用', await page.$$eval('.v5-series-thumb',es=>es.length===5&&es.every(e=>e.complete&&e.naturalWidth>0)));
  ok('候选包正式品牌 SVG 可用',await page.$eval('.v5-brand[data-brand-size="nav"] img',e=>e.complete&&e.naturalWidth>0));
  await page.mouse.move(700,500);await page.mouse.wheel({deltaY:6000});
  await page.waitForFunction(()=>document.querySelector('.v5-footer').getBoundingClientRect().bottom<=innerHeight+2);
  ok('候选包首页可滚动到页脚',await page.evaluate(()=>scrollY>0));
  await page.click('.v5-brand-presentation');
  await page.waitForFunction(()=>Number(document.querySelector('.v5-brand-motion-host')?.dataset.time)===3);
  ok('候选包按需载入正式 V2 并停止',await page.$eval('.v5-brand-motion-host',e=>e.dataset.playing==='false'&&!!e.querySelector('svg')));
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/#/work/dan`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(()=>document.querySelector('#v5Tech-dan')?.textContent.includes('46,828'));
  ok('候选包详情加载真实旦角',await page.$eval('.v5-work-stage canvas',e=>e.width>100&&e.height>100));
  await page.goto(`${BASE}/#/gallery?work=jing-red`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 }).catch(async e=>{console.error(await page.evaluate(()=>document.body.innerText.slice(0,1200)));throw e;});
  await page.waitForFunction('window.__FORMA.info && window.__FORMA.info.modelTris > 0', { timeout: 120000 });
  await sleep(600);

  const info = await page.evaluate(() => ({
    tris: window.__FORMA.info.modelTris,
    verts: window.__FORMA.info.modelVerts,
    canvas: (() => { const c = document.querySelector('#app canvas'); return c ? [c.width, c.height] : null; })(),
    gl: !!document.querySelector('#app canvas')?.getContext?.('webgl2'),
  }));
  ok('净角·红谱真实渲染（49,178 三角形）', info.tris === 49178, String(info.tris));
  ok('顶点数与 ground truth 一致（28,472）', info.verts === 28472, String(info.verts));
  ok('canvas 已铺满视口（非 1×1）', Array.isArray(info.canvas) && info.canvas[0] > 800 && info.canvas[1] > 500, JSON.stringify(info.canvas));

  // 五件展品逐个切换：任何一件的模型/缩略图没进包，这里都会暴露 404
  console.log('[C] 五件手办逐个加载');
  for (const id of ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white']) {
    const got = await page.evaluate(async (workId) => {
      location.hash = '#/gallery?work=' + workId;
      await new Promise((r) => setTimeout(r, 300));
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        const cur = window.__FORMA?.current?.id;
        const info = window.__FORMA?.info;
        if (cur === workId && info?.modelTris > 0) return { id: cur, tris: info.modelTris };
        await new Promise((r) => setTimeout(r, 250));
      }
      return { id: window.__FORMA?.current?.id ?? null, tris: window.__FORMA?.info?.modelTris ?? 0 };
    }, id);
    ok(`静态包内加载 ${id}`, got.id === id && got.tris > 40000, JSON.stringify(got));
  }

  console.log('[D] Studio 在纯静态环境下如实降级');
  await page.evaluate(() => { location.hash = '#/studio'; });
  await sleep(1500);
  const studioState = await page.evaluate(() => ({
    mode: document.body.className,
    status: document.getElementById('stConnText')?.textContent || '',
    toolbar: !!document.getElementById('studioToolbar'),
    viewportVisible: (() => { const v = document.querySelector('.viewport'); if (!v) return false; const r = v.getBoundingClientRect(); return r.width > 300 && r.height > 200; })(),
  }));
  ok('Studio 图层已挂载', studioState.toolbar && /mode-studio/.test(studioState.mode), JSON.stringify(studioState));
  ok('后端状态如实显示未运行（不伪装在线）', /未运行|未检测|连接中/.test(studioState.status), studioState.status);

  await page.screenshot({ path: path.join(OUT, 'static-pack-studio.png') });
  await page.evaluate(() => { location.hash = '#/gallery?work=sheng'; });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'static-pack-gallery.png') });

  // 失败请求：/api/* 允许（静态包本来就没有后端），其余一律不允许
  const badRequests = failed.filter((f) => !/\/api\//.test(f));
  ok('静态包无 404 / 断链请求', badRequests.length === 0, badRequests.slice(0, 6).join(' | '));
  ok('零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));
} finally {
  await browser.close();
  try { served.kill(); } catch { /* 已退出 */ }
}

console.log(`\n静态包验收：${pass} 通过 / ${fail} 失败`);
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({pack:PACK,reusedCandidate:!!CANDIDATE,pass,fail,failures},null,2)+'\n');
if (fail) { console.log('失败项：' + failures.join('、')); process.exitCode = 1; }
