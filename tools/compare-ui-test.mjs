// 交互验证（真实浏览器）：执行处理 → 前端真实载入 before/after 两个模型 →
// CompareRig 同场景挂载 → 裁剪面滑动生效 → 统计行显示真实前后差值 → 退出对比清理干净。
import { launchBrowser } from './browser-test.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'compare-ui-' + Date.now());
fs.mkdirSync(OUT, { recursive: true });
const BE_PORT = 5398;
const FE_PORT = 5402;

const kids = [];
function start(cmd, env) {
  const child = spawn(process.execPath, cmd, {
    cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => { /* 静默 */ });
  kids.push(child);
  return child;
}
const shutdown = () => { for (const k of kids) { try { k.kill(); } catch { /* ignore */ } } };
process.on('exit', shutdown);

// 后端与前端都自带启动，避免依赖外部进程
const be = start(['backend/server.mjs'], { FORMA_BACKEND_PORT: String(BE_PORT), HOST: '127.0.0.1' });
start(['serve.mjs'], { PORT: String(FE_PORT), HOST: '127.0.0.1', FORMA_BACKEND: `http://127.0.0.1:${BE_PORT}` });
await new Promise((r) => setTimeout(r, 3000));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};
const failures = [];

// 确保至少有一个资产（后端 workspace 为空时导入一个）
const rawPath = path.join(ROOT, 'assets', 'raw', 'sheng.glb');
const health = await fetch(`http://127.0.0.1:${BE_PORT}/api/health`).then((r) => r.json()).catch(() => null);
if (!health?.ok) { console.error('后端未启动'); process.exit(1); }
// 必须挑一个 GLB：本组要走 glTF 算子链（FBX 不支持减面），workspace 里可能还有别
// 的测试留下的 FBX/其他格式资产，不能随手取第一个。
const glbName = 'compare-probe.glb';
let assets = await fetch(`http://127.0.0.1:${BE_PORT}/api/assets`).then((r) => r.json()).catch(() => ({ assets: [] }));
if (!assets.assets?.some((a) => a.name === glbName)) {
  await fetch(`http://127.0.0.1:${BE_PORT}/api/assets/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: glbName, dataBase64: fs.readFileSync(rawPath).toString('base64') }),
  });
  assets = await fetch(`http://127.0.0.1:${BE_PORT}/api/assets`).then((r) => r.json());
}
const glbAsset = assets.assets.find((a) => a.name === glbName);

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${FE_PORT}/#/studio`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });
  // AI Studio：进入路由即自动探测后端，这里等状态条变为「已连接」
  await page.waitForFunction(() => document.getElementById('stConnText')?.textContent.includes('已连接'), { timeout: 60000 });
  ok('Studio 自动连接后端', true);

  // 1. 选资产 + 只勾选 simplify（会真实减面，保证前后模型可区分）
  await page.evaluate(async (id) => {
    const core = window.__FORMA.studio.core;
    await core.selectAsset(id);
    for (const op of core.state.ops) core.setOpEnabled(op.name, op.name === 'simplify');
    const ratio = document.querySelector('[data-op="simplify"] #op-ratio');
    ratio.value = '0.4';
    ratio.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('stDryRun').checked = false;
    document.getElementById('stRunBtn').click();
  }, glbAsset.id);
  await new Promise((r) => setTimeout(r, 2500));

  // 2. 执行（simplify 属外观算子：首次点击走确认门，第二次真实执行）
  // simplify 属外观算子：首次点击走确认门，第二次点击才真实执行
  await page.evaluate(() => document.getElementById('stRunBtn').click());
  await page.waitForFunction(
    () => document.getElementById('stCompareBar')?.hidden === false,
    { timeout: 60000 },
  );
  ok('执行后视口对比条自动出现', true);

  // 3. 等待真实载入完成（统计行从「正在载入」变为真实数值）
  await page.waitForFunction(
    () => {
      const r = window.__FORMA.studio.lastRun;
      return !!(r && r.before && r.after && r.after.tris > 0 && window.__FORMA.studio.rig?.groupA && window.__FORMA.studio.rig?.groupB);
    },
    { timeout: 90000 },
  );
  const statsText = await page.evaluate(() => JSON.stringify(window.__FORMA.studio.lastRun?.after || {}));
  ok('后端返回真实的前后指标', /tris/.test(statsText), statsText.slice(0, 160));

  ok('界面参数 0.4 真实进入算子执行结果', await page.evaluate(() => window.__FORMA.studio.lastRun.results.find(r => r.op === 'simplify')?.params.ratio === 0.4));

  // 4. 两个模型真的都在场景里，且几何不同（证明不是同一个模型画两次）
  const rig = await page.evaluate(() => {
    const r = window.__FORMA.studio.rig;
    if (!r || !r.groupA || !r.groupB) return null;
    const tris = (g) => {
      let t = 0;
      g.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        t += o.geometry.index ? o.geometry.index.count / 3 : (o.geometry.attributes.position?.count || 0) / 3;
      });
      return Math.round(t);
    };
    let clipped = 0;
    r.groupA.traverse((o) => { if (o.isMesh && o.material?.clippingPlanes?.length) clipped++; });
    r.groupB.traverse((o) => { if (o.isMesh && o.material?.clippingPlanes?.length) clipped++; });
    return { trisA: tris(r.groupA), trisB: tris(r.groupB), clipped, split: r.split };
  });
  ok('Before/After 两个模型均已挂载', !!rig && rig.trisA > 0 && rig.trisB > 0, JSON.stringify(rig));
  ok('两个模型几何确实不同（减面生效）', !!rig && rig.trisB !== rig.trisA, JSON.stringify(rig));
  ok('裁剪面已应用到两侧材质', !!rig && rig.clipped >= 2, JSON.stringify(rig));

  // 5. 滑条真实改变裁剪位置
  const moved = await page.evaluate(async () => {
    const r0 = window.__FORMA.studio.rig;
    const before = r0.planeA.constant;
    const s = document.getElementById('stSplit');
    s.value = '0.15';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const r = window.__FORMA.studio.rig;
    return { split: r.split, before, after: r.planeA.constant, cB: r.planeB.constant };
  });
  ok('滑条改变裁剪面位置', Math.abs(moved.split - 0.15) < 1e-6 && moved.after !== moved.before, JSON.stringify(moved));
  ok('两侧裁剪面互为反向', Math.abs(moved.after + moved.cB) < 1e-6, JSON.stringify(moved));

  await page.screenshot({ path: path.join(OUT, 'compare.png') });

  // 6. 退出对比：清理干净，恢复原模型显示
  const cleaned = await page.evaluate(async () => {
    document.getElementById('stCompareClose').click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      rig: !!window.__FORMA.studio.rig,
      hidden: document.getElementById('stCompareBar')?.hidden,
      clipping: window.__FORMA.viewer.renderer.localClippingEnabled,
      modelVisible: window.__FORMA.viewer.modelRoot?.visible,
    };
  });
  ok('退出对比后 rig 已释放', cleaned.rig === false, JSON.stringify(cleaned));
  ok('退出后对比区隐藏且裁剪已关闭', cleaned.hidden === true && cleaned.clipping === false, JSON.stringify(cleaned));
  ok('退出后原模型恢复显示', cleaned.modelVisible !== false, JSON.stringify(cleaned));

  ok('无页面级错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  shutdown();
}
console.log(`\ncompare-ui: ${pass} passed, ${fail} failed`);
if (fail) console.log('失败项：' + failures.join(', '));
process.exit(fail ? 1 : 0);
