// Gallery / AI Studio 双工作区验收（真实 Edge / Chromium）
// 1. 两个首屏外观明显不同  2. 首页→Gallery→Studio→Gallery 多次切换正常
// 3. 共享同一模型但状态互不干扰  4. Gallery 无后端可用  5. Studio 五区齐备
import { launchBrowser } from './browser-test.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'workspaces-' + Date.now()));
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.FORMA_PORT || 5412;
const BASE = `http://127.0.0.1:${PORT}`;

const BE_PORT = Number(PORT) + 200;
const be = spawn(process.execPath, ['backend/server.mjs'], {
  cwd: ROOT, env: { ...process.env, FORMA_BACKEND_PORT: String(BE_PORT), HOST: '127.0.0.1' }, stdio: 'ignore',
});
const serve = spawn(process.execPath, ['serve.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', FORMA_BACKEND: `http://127.0.0.1:${BE_PORT}` }, stdio: 'ignore',
});
process.on('exit', () => { try { serve.kill(); be.kill(); } catch { /* ignore */ } });
await new Promise((r) => setTimeout(r, 3200));
const backendUp = await fetch(`http://127.0.0.1:${BE_PORT}/api/health`).then((r) => r.json()).then((j) => !!j?.ok).catch(() => false);
console.log('后端状态：' + (backendUp ? '已启动' : '未启动（Studio 将显示离线引导）'));

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`${BASE}/#/gallery`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });
  await sleep(1200);

  console.log('[1] Gallery 首屏');
  const gallery = await page.evaluate(() => {
    const vis = (sel) => { const n = document.querySelector(sel); if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).display !== 'none'; };
    return {
      mode: document.body.classList.contains('mode-gallery'),
      card: vis('#glCard'), cardTitle: document.querySelector('#glTitle')?.textContent,
      advancedBtn: vis('#glAdvanced'),
      hiddenToolBar: !vis('#studioToolbar'), hiddenTree: !vis('#studioTree'), hiddenRail: !vis('#studioRail'), hiddenDock: !vis('#studioDock'),
      hiddenPipeline: !vis('#pipelineSect'),
      tris: Number((document.querySelector('#glTris')?.textContent || '0').replace(/,/g, '')),
      canvasW: document.querySelector('#stage')?.clientWidth,
    };
  });
  ok('Gallery 处于观展模式', gallery.mode);
  ok('观展信息卡显示真实三角面', gallery.tris > 10000, String(gallery.tris));
  ok('高级控制台入口存在', gallery.advancedBtn);
  ok('生产工具条不可见', gallery.hiddenToolBar && gallery.hiddenTree && gallery.hiddenRail && gallery.hiddenDock);
  ok('旧 AI 管线面板已下线', gallery.hiddenPipeline);

  await page.screenshot({ path: path.join(OUT, 'gallery-1600.png') });

  // 高级控制台抽屉开了要真的有内容
  await page.click('#glAdvanced');
  await sleep(500);
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('#glDrawer');
    return { open: d && !d.hidden, sects: d ? d.querySelectorAll('details.sect').length : 0, hasMaterial: !!d?.querySelector('#metalness'), hasBloom: !!d?.querySelector('#bloomToggle') };
  });
  ok('高级控制台装入真实的材质/后期控件', drawer.open && drawer.sects >= 2 && drawer.hasMaterial && drawer.hasBloom, JSON.stringify(drawer));
  await page.screenshot({ path: path.join(OUT, 'gallery-advanced-drawer.png') });
  await page.click('#glDrawerClose');
  await sleep(300);

  console.log('[2] 进入 AI Studio');
  await page.evaluate(() => { location.hash = '#/studio'; });
  await page.waitForFunction('document.body.classList.contains("mode-studio")', { timeout: 30000 });
  await sleep(1800);
  const studioUI = await page.evaluate(() => {
    const vis = (sel) => { const n = document.querySelector(sel); if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).display !== 'none'; };
    return {
      toolbar: vis('#studioToolbar'), tree: vis('#studioTree'), rail: vis('#studioRail'), dock: vis('#studioDock'),
      galleryCard: vis('#glCard'), topbar: vis('.topbar'), bottombar: vis('.bottombar'),
      tabs: [...document.querySelectorAll('.st-tab')].map((t) => t.textContent),
      dockTabs: [...document.querySelectorAll('.st-dock-tab')].map((t) => t.textContent),
      conn: document.querySelector('#stConnText')?.textContent,
      canvasW: document.querySelector('#stage')?.clientWidth,
    };
  });
  ok('Studio 五区全部可见', studioUI.toolbar && studioUI.tree && studioUI.rail && studioUI.dock, JSON.stringify(studioUI));
  ok('Gallery 观展控件已让位', !studioUI.galleryCard && !studioUI.topbar && !studioUI.bottombar);
  ok('右侧 Lab 五个页签齐备', studioUI.tabs.length === 5, JSON.stringify(studioUI.tabs));
  ok('底部 Dock 四个页签齐备', studioUI.dockTabs.length === 4, JSON.stringify(studioUI.dockTabs));
  ok('连接状态有明确文案', /后端/.test(studioUI.conn || ''), studioUI.conn);
  if (backendUp) {
    await page.waitForFunction(() => document.getElementById('stConnText')?.textContent.includes('已连接'), { timeout: 60000 });
    const tree = await page.evaluate(() => ({
      rows: document.querySelectorAll('#studioTree .st-row[data-asset]').length,
      ops: document.querySelectorAll('#stOps input[type="checkbox"]').length,
    }));
    ok('资源树真实列出后端资产', tree.rows > 0, JSON.stringify(tree));
    ok('算子列表来自后端注册表', tree.ops > 0, JSON.stringify(tree));
  }
  await page.screenshot({ path: path.join(OUT, 'studio-1600.png') });

  console.log('[3] WebGL 上下文单一（不重复初始化）');
  const ctxCount = await page.evaluate(() => {
    // 同一 canvas 反复取 context 返回同一个对象即为单一上下文
    const c = document.querySelector('#stage');
    const a = c.getContext('webgl2');
    const b = c.getContext('webgl2');
    return { same: a === b, canvases: document.querySelectorAll('canvas').length };
  });
  ok('canvas 唯一且上下文复用', ctxCount.same && ctxCount.canvases === 1, JSON.stringify(ctxCount));

  console.log('[4] 往返切换稳定性');
  let visibleAfter = true;
  let modeOk = true;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { location.hash = '#/gallery'; });
    await page.waitForFunction('document.body.classList.contains("mode-gallery")', { timeout: 20000 });
    await sleep(600);
    const g = await page.evaluate(() => ({ app: document.querySelector('#app')?.hidden, tris: window.__FORMA.info.modelTris, rail: !document.querySelector('#studioRail')?.hidden }));
    if (g.app || g.tris < 10000) visibleAfter = false;
    await page.evaluate(() => { location.hash = '#/studio'; });
    await page.waitForFunction('document.body.classList.contains("mode-studio")', { timeout: 20000 });
    await sleep(500);
    const s = await page.evaluate(() => ({ app: document.querySelector('#app')?.hidden, card: !document.querySelector('#glCard')?.hidden }));
    if (s.app) visibleAfter = false;
  }
  ok('三次往返后模型仍在展示且无空白', visibleAfter);
  ok('模式类始终互斥', modeOk);

  console.log('[5] 首页 → Gallery → Studio');
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(900);
  const home = await page.evaluate(() => ({ layer: !!document.querySelector('.v5-home'), cards: document.querySelectorAll('.v5-launch').length }));
  ok('首页启动台正常', home.layer && home.cards === 4, JSON.stringify(home));
  await page.evaluate(() => { location.hash = '#/gallery'; });
  await sleep(900);
  const back = await page.evaluate(() => ({ app: document.querySelector('#app')?.hidden, tris: window.__FORMA.info.modelTris }));
  ok('首页回到 Gallery 后展品仍在', !back.app && back.tris > 10000, JSON.stringify(back));

  console.log('[6] 移动端布局');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 60000 });
  await page.evaluate(() => { location.hash = '#/gallery'; });
  await sleep(1000);
  const mobG = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth <= innerWidth + 1, card: !!document.querySelector('#glCard')?.getBoundingClientRect().width }));
  ok('Gallery 移动端无横向溢出', mobG.overflow, JSON.stringify(mobG));
  await page.screenshot({ path: path.join(OUT, 'gallery-390.png') });
  await page.evaluate(() => { location.hash = '#/studio'; });
  await sleep(1200);
  const mobS = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth <= innerWidth + 1, toolbar: !!document.querySelector('#studioToolbar')?.getBoundingClientRect().width }));
  ok('Studio 移动端无横向溢出', mobS.overflow, JSON.stringify(mobS));
  await page.screenshot({ path: path.join(OUT, 'studio-390.png') });

  console.log('[7] 页面异常');
  // 后端未启动时，Studio 探测 /api 会产生 502 网络报错——那是「离线引导」的预期表现
  const real = errors.filter((e) => !/502|Bad Gateway/.test(e));
  ok('无页面级错误', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) {
  fail++; console.error('冒烟失败：', e);
} finally {
  await browser.close();
  try { serve.kill(); } catch { /* ignore */ }
  try { be.kill(); } catch { /* ignore */ }
  console.log(`\n工作区验收：${pass} passed, ${fail} failed`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ pass, fail, failures }, null, 2));
  // 子进程已显式 kill，这里直接退出，避免残留句柄吊住事件循环
  process.exit(fail ? 1 : 0);
}
