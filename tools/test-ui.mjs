// Interaction test: every visible control must produce a real, observable state
// change in the renderer - or the test fails. Nothing is stubbed.
//
//   node tools/test-ui.mjs [--base=http://127.0.0.1:5173]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser-test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const get = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const BASE = String(get('base', process.env.FORMA_BASE || 'http://127.0.0.1:5173'));
const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'ui-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const t = (name, fn) => results.push({ name, fn });

// ---------------------------------------------------------------- helpers ---
async function current(page) { return page.evaluate(() => window.__FORMA.current?.id || null); }
async function click(page, sel) {
  const inSettings=await page.$eval(sel,e=>!!e.closest('#glDrawer'));
  if(inSettings){
    if(await page.$eval('#glDrawer',e=>e.hidden))await page.click('#glAdvanced');
    const closed=await page.$eval(sel,e=>{const d=e.closest('details');return d&&!d.open;});
    if(closed){const control=await page.$(sel);const summary=await control.evaluateHandle(e=>e.closest('details').querySelector('summary'));await summary.click();}
  }
  if(sel.startsWith('.asset[')&&!await page.$eval('#sidebar',e=>e.getBoundingClientRect().width>0))await page.click('#glResources');
  await page.click(sel);
}
async function waitForId(page, id, ms = 60000) {
  await page.waitForFunction((x) => window.__FORMA.current && window.__FORMA.current.id === x, { timeout: ms }, id);
}
async function setRange(page, sel, value) {
  await page.$eval(sel, (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

// ------------------------------------------------------------------ tests ---
t('boot: 页面加载且无致命错误', async (ctx) => {
  const ok = await ctx.page.evaluate(() => !!window.__FORMA && !!window.__FORMA.current);
  if (!ok) throw new Error('__FORMA 未就绪');
});

t('侧栏: 8 张展品卡片全部渲染', async (ctx) => {
  const n = await ctx.page.evaluate(() => document.querySelectorAll('.asset').length);
  if (n !== 8) throw new Error('期望 8 张卡片，实际 ' + n);
});

t('切换: 点击侧栏卡片可切换到旦角', async (ctx) => {
  await click(ctx.page, '.asset[data-id="dan"]');
  await waitForId(ctx.page, 'dan');
  const tris = await ctx.page.evaluate(() => window.__FORMA.info.modelTris);
  if (tris < 1000) throw new Error('旦角三角形数异常: ' + tris);
});

t('切换: 五个手办全部可以依次载入', async (ctx) => {
  for (const id of ['sheng', 'dan', 'jing-red', 'jing-yellow', 'jing-white']) {
    await ctx.page.evaluate((x) => window.__FORMA.select(x), id);
    await waitForId(ctx.page, id);
    const info = await ctx.page.evaluate(() => window.__FORMA.info);
    if (info.model !== id || info.renderTriangles < 1000) throw new Error(id + ' 渲染异常');
  }
});

t('切换: 第二次回到生角命中缓存（<3s）', async (ctx) => {
  const t0 = Date.now();
  await ctx.page.evaluate(() => window.__FORMA.select('sheng'));
  await waitForId(ctx.page, 'sheng');
  const dt = Date.now() - t0;
  if (dt > 3000) throw new Error('缓存切换耗时 ' + dt + 'ms');
});

// Gallery 下材质与后期属于「高级控制台」抽屉——先按真实用户路径打开它
async function openAdvanced(ctx) {
  if (await ctx.page.evaluate(() => document.getElementById('glDrawer')?.hidden !== false)) {
    await click(ctx.page, '#glAdvanced');
    await ctx.page.waitForFunction(() => document.getElementById('glDrawer')?.hidden === false, { timeout: 10000 });
    await sleep(200);
  }
}

// 抽屉是 fixed 覆盖层，会挡住右栏控件——用到右栏的用例前先收起它
async function closeAdvanced(ctx) {
  if (await ctx.page.evaluate(() => document.getElementById('glDrawer')?.hidden === false)) {
    await click(ctx.page, '#glDrawerClose');
    await ctx.page.waitForFunction(() => document.getElementById('glDrawer')?.hidden === true, { timeout: 10000 });
    await sleep(150);
  }
}

t('材质: 陶瓷预设真实生效（metalness≈0.02）', async (ctx) => {
  await openAdvanced(ctx);
  await click(ctx.page, '#materialModes button[data-mode="ceramic"]');
  await sleep(120);
  const m = await ctx.page.evaluate(() => window.__FORMA.viewer.readMaterial());
  if (Math.abs(m.metalness - 0.02) > 1e-6) throw new Error('metalness=' + m.metalness);
  const tag = await ctx.page.evaluate(() => document.getElementById('matTag').textContent);
  if (tag !== '陶瓷') throw new Error('面板标签未更新: ' + tag);
});

t('材质: 拖动金属度滑杆自动进入自定义', async (ctx) => {
  await setRange(ctx.page, '#metalness', 0.5);
  await sleep(120);
  const s = await ctx.page.evaluate(() => {
    const id = window.__FORMA.current.id;
    return window.__FORMA.viewState.get({ id }).material;
  });
  if (s.mode !== 'custom' || Math.abs(s.metalness - 0.5) > 1e-6) throw new Error(JSON.stringify(s));
  const shown = await ctx.page.$eval('#metalnessValue', (el) => el.textContent);
  if (shown !== '0.50') throw new Error('滑杆读数与实际不一致: ' + shown);
});

t('材质: 回到原始档恢复基线（metalness=0）', async (ctx) => {
  await click(ctx.page, '#materialModes button[data-mode="original"]');
  await sleep(150);
  const m = await ctx.page.evaluate(() => window.__FORMA.viewer.readMaterial());
  if (m.metalness > 0.001) throw new Error('未恢复原始 metalness: ' + m.metalness);
});

t('灯光: 冷调预设改变主光颜色', async (ctx) => {
  await closeAdvanced(ctx);
  const before = await ctx.page.evaluate(() => window.__FORMA.viewer.lighting.key.color.getHexString());
  await click(ctx.page, '#lightModes button[data-mode="cool"]');
  await sleep(120);
  const after = await ctx.page.evaluate(() => window.__FORMA.viewer.lighting.key.color.getHexString());
  if (before === after) throw new Error('主光颜色未变化');
  const slider = await ctx.page.$eval('#lightKeyValue', (el) => el.textContent);
  if (slider !== '2.40') throw new Error('主光滑杆未同步预设值: ' + slider);
  await click(ctx.page, '#lightModes button[data-mode="studio"]');
});

t('背景: 纯黑背景切换生效', async (ctx) => {
  await closeAdvanced(ctx);
  await click(ctx.page, '#envModes button[data-mode="void"]');
  await sleep(120);
  const key = await ctx.page.evaluate(() => window.__FORMA.viewer.environment.backdropKey);
  if (key !== 'void') throw new Error('backdropKey=' + key);
  await click(ctx.page, '#envModes button[data-mode="charcoal"]');
});

t('曝光: 滑杆直接改变渲染器曝光', async (ctx) => {
  await setRange(ctx.page, '#exposure', 1.6);
  await sleep(120);
  const v = await ctx.page.evaluate(() => window.__FORMA.viewer.renderer.toneMappingExposure);
  if (Math.abs(v - 1.6) > 1e-6) throw new Error('exposure=' + v);
  await setRange(ctx.page, '#exposure', 1.0);
});

t('后期: 辉光开关激活 composer', async (ctx) => {
  await openAdvanced(ctx);
  // 分区默认折叠，先展开（与真实用户操作一致）
  await ctx.page.$eval('#bloomToggle', (el) => { el.closest('details').open = true; });
  await click(ctx.page, '#bloomToggle');
  await sleep(150);
  const on = await ctx.page.evaluate(() => window.__FORMA.info.postActive);
  if (!on) throw new Error('composer 未激活');
  await click(ctx.page, '#bloomToggle');
  await sleep(150);
  const off = await ctx.page.evaluate(() => window.__FORMA.info.postActive);
  if (off) throw new Error('composer 未关闭');
});

t('色调映射: Neutral 为默认', async (ctx) => {
  // NeutralToneMapping === 7 in three r186 (NoToneMapping=0, ACESFilmic=4).
  const tm = await ctx.page.evaluate(() => window.__FORMA.viewer.renderer.toneMapping);
  if (tm !== 7) throw new Error('toneMapping=' + tm);
});

t('显示: 线框开关真实叠加线框', async (ctx) => {
  await click(ctx.page, '#wireframe');
  await sleep(150);
  let w = await ctx.page.evaluate(() => window.__FORMA.info.wireframe);
  if (!w) throw new Error('线框未开启');
  await click(ctx.page, '#wireframe');
  await sleep(150);
  w = await ctx.page.evaluate(() => window.__FORMA.info.wireframe);
  if (w) throw new Error('线框未关闭');
});

t('显示: 网格与展台开关', async (ctx) => {
  await click(ctx.page, '#gridToggle');
  await sleep(100);
  let g = await ctx.page.evaluate(() => window.__FORMA.viewer.stage.grid.visible);
  if (!g) throw new Error('网格未显示');
  await click(ctx.page, '#gridToggle');
  await click(ctx.page, '#plinthToggle');
  await sleep(100);
  const p = await ctx.page.evaluate(() => window.__FORMA.viewer.stage.plinth.visible);
  if (!p) throw new Error('展台未显示');
  await click(ctx.page, '#plinthToggle');
});

t('自动旋转: 开关与转速', async (ctx) => {
  await click(ctx.page, '#autorotate');
  await sleep(100);
  let r = await ctx.page.evaluate(() => window.__FORMA.viewer.controls.autoRotate);
  if (!r) throw new Error('自动旋转未开启');
  await click(ctx.page, '#autorotate');
  await setRange(ctx.page, '#autoRotateSpeed', 2);
  await sleep(100);
  const sp = await ctx.page.evaluate(() => window.__FORMA.viewer.controls.autoRotateSpeed);
  if (Math.abs(sp - 2.4) > 1e-6) throw new Error('speed=' + sp);   // 1.2 * 2
});

t('视角: 回到最佳视角按钮', async (ctx) => {
  // 自动旋转会持续改变 yaw，先关掉才能断言
  await ctx.page.$eval('#autorotate', (el) => { if (el.checked) el.click(); });
  await sleep(150);
  // spin the camera somewhere else first
  await ctx.page.evaluate(() => {
    const v = window.__FORMA.viewer;
    v.controls.target.x += 0.3;
    v.controls.update();
  });
  await click(ctx.page, '#glReset');
  await sleep(250);
  const cam = await ctx.page.evaluate(() => window.__FORMA.viewer.readCamera());
  const best = await ctx.page.evaluate(() => window.__FORMA.current.best);
  if (Math.abs(cam.yaw - best.yaw) > 0.02) throw new Error(`yaw ${cam.yaw} != ${best.yaw}`);
});

t('截图: 导出 PNG 返回真实像素', async (ctx) => {
  const len = await ctx.page.evaluate(() => {
    const url = window.__FORMA.viewer.capturePNG(2);
    return url.length;
  });
  if (len < 200000) throw new Error('PNG dataURL 过小: ' + len);
});

t('沉浸: 进入/退出并改变取景边距', async (ctx) => {
  await closeAdvanced(ctx);
  await click(ctx.page, '#glImmersive');
  await sleep(600);
  let s = await ctx.page.evaluate(() => ({
    immersive: window.__FORMA.info.immersive,
    padding: window.__FORMA.info.padding,
    cls: document.body.classList.contains('mode-immersive'),
  }));
  if (!s.immersive || !s.cls) throw new Error('未进入沉浸模式 ' + JSON.stringify(s));
  if (Math.abs(s.padding - 1.12) > 1e-6) throw new Error('沉浸边距错误: ' + s.padding);
  await ctx.page.keyboard.press('Escape');
  await sleep(600);
  s = await ctx.page.evaluate(() => window.__FORMA.info.immersive);
  if (s) throw new Error('Esc 未退出沉浸模式');
});

t('键盘: ←/→ 切换展品', async (ctx) => {
  const before = await current(ctx.page);
  await ctx.page.keyboard.press('ArrowRight');
  await sleep(900);
  const after = await current(ctx.page);
  if (after === before) throw new Error('→ 未切换');
  await ctx.page.keyboard.press('ArrowLeft');
  await sleep(900);
  const back = await current(ctx.page);
  if (back !== before) throw new Error('← 未切回');
});

t('键盘: Space 切换自动旋转', async (ctx) => {
  const before = await ctx.page.evaluate(() => window.__FORMA.viewer.controls.autoRotate);
  await ctx.page.keyboard.press('Space');
  await sleep(150);
  const after = await ctx.page.evaluate(() => window.__FORMA.viewer.controls.autoRotate);
  if (before === after) throw new Error('Space 无效');
  await ctx.page.keyboard.press('Space');
});

t('演示组: 程序化展品默认开启辉光', async (ctx) => {
  await ctx.page.evaluate(() => window.__FORMA.select('aether'));
  await waitForId(ctx.page, 'aether');
  await sleep(300);
  const s = await ctx.page.evaluate(() => ({
    post: window.__FORMA.info.postActive,
    format: window.__FORMA.info.format,
  }));
  if (!s.post) throw new Error('演示展品辉光未默认开启');
  if (s.format !== 'procedural') throw new Error('format=' + s.format);
});

t('持久化: 参数改动刷新后保留', async (ctx) => {
  await ctx.page.evaluate(() => window.__FORMA.select('sheng'));
  await waitForId(ctx.page, 'sheng');
  await setRange(ctx.page, '#exposure', 1.35);
  await sleep(600);                       // let the debounce flush
  await ctx.page.reload({ waitUntil: 'domcontentloaded' });
  await ctx.page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 60000 });
  await ctx.page.evaluate(() => window.__FORMA.ready);
  const v = await ctx.page.evaluate(() => window.__FORMA.viewer.renderer.toneMappingExposure);
  if (Math.abs(v - 1.35) > 1e-6) throw new Error('刷新后 exposure=' + v);
  await setRange(ctx.page, '#exposure', 1.0);
});

t('帮助: 弹窗可开关', async (ctx) => {
  await click(ctx.page, '#glHelp');
  await sleep(100);
  let hidden = await ctx.page.$eval('#helpModal', (el) => el.hidden);
  if (hidden) throw new Error('帮助未打开');
  await click(ctx.page, '#helpClose');
  await sleep(100);
  hidden = await ctx.page.$eval('#helpModal', (el) => el.hidden);
  if (!hidden) throw new Error('帮助未关闭');
});

t('移动布局: 五件展品在底栏可选', async (ctx) => {
  await closeAdvanced(ctx);
  await ctx.page.setViewport({width:420,height:800,deviceScaleFactor:1});
  await sleep(300);
  const visible=await ctx.page.$$eval('.ex-filmstrip a',es=>es.length===5&&es.every(e=>e.getBoundingClientRect().width>40));
  if(!visible)throw Error('移动端展品底栏不可用');
  await ctx.page.click('.ex-filmstrip [data-work="jing-red"]');
  await waitForId(ctx.page,'jing-red');
  await ctx.page.setViewport({width:1400,height:900,deviceScaleFactor:1});
});

t('收尾: 控制台无错误', async (ctx) => {
  if (ctx.consoleErrors.length) throw new Error(ctx.consoleErrors.slice(0, 5).join(' | '));
  if (ctx.pageErrors.length) throw new Error(ctx.pageErrors.slice(0, 5).join(' | '));
});

// ------------------------------------------------------------------- main ---
(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

  // UI 交互验收需要 3D 图层可见（V5 路由图层化：仅 #/gallery 激活时才显示 #app）
  await page.goto(BASE + '/index.html#/gallery', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const a = document.getElementById('app');
    return !!a && !a.hidden && a.offsetParent !== null;
  }, { timeout: 30000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 90000 });
  await page.evaluate(() => window.__FORMA.ready);
  await sleep(500);

  const ctx = { page, consoleErrors, pageErrors };
  let failed = 0;
  for (const { name, fn } of results) {
    try {
      await fn(ctx);
      console.log(`[PASS] ${name}`);
    } catch (e) {
      failed++;
      console.log(`[FAIL] ${name}\n       ${e.message}`);
      await page.screenshot({ path: path.join(OUT, 'fail-' + failed + '.png') }).catch(() => {});
    }
  }

  console.log(`\n交互测试: ${results.length - failed}/${results.length} 通过`);
  fs.writeFileSync(path.join(OUT, 'ui-report.json'),
    JSON.stringify({ passed: results.length - failed, total: results.length, consoleErrors, pageErrors }, null, 2));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
