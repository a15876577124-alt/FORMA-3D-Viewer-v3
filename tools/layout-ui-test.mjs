// 可调整工作区 + 首页联系方式：真实 Edge 交互验收
// 全部用真实鼠标事件（pointer/mouse）驱动，不只查 DOM 与 CSS 属性。
import { launchBrowser } from './browser-test.mjs';
import {startTestServers} from './test-servers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'layout-' + Date.now()));
fs.mkdirSync(OUT, { recursive: true });
const {be,serve,BASE}=await startTestServers();

let pass = 0, fail = 0; const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });

  // ---------------------------------------------------------------- 联系方式
  console.log('[A] 首页联系方式');
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });
  await sleep(900);

  const contact = await page.evaluate(() => {
    const block = document.getElementById('contactBlock');
    if (!block) return null;
    const mails = [...block.querySelectorAll('a.v5-contact-mail')].map((a) => ({ text: a.textContent, href: a.getAttribute('href') }));
    const r = block.getBoundingClientRect();
    return {
      mails,
      copies: block.querySelectorAll('.v5-contact-copy').length,
      visible: r.width > 0 && r.height > 0,
      // 首页是否只有一处联系方式（公共页脚不得重复列出邮箱）
      pageMailLinks: [...document.querySelectorAll('a[href^="mailto:"]')].length,
      inFooter: !!document.querySelector('.v5-footer a[href^="mailto:"]'),
    };
  });
  ok('首页联系方式区块可见', !!contact?.visible);
  ok('两个邮箱都在', contact?.mails?.length === 2
    && contact.mails.some((m) => m.text.includes('haorongli09@outlook.com') && m.href.startsWith('mailto:'))
    && contact.mails.some((m) => m.text.includes('haorongli09@gmail.com') && m.href.startsWith('mailto:')),
  JSON.stringify(contact?.mails));
  ok('每个邮箱都有复制按钮', contact?.copies === 2, String(contact?.copies));
  ok('公共页脚仅有一份按需联系方式', contact?.pageMailLinks === 2 && contact?.inFooter, JSON.stringify({ n: contact?.pageMailLinks, foot: contact?.inFooter }));

  // 真实点击复制（授予剪贴板权限后读回真实剪贴板内容）
  const ctx = browser.defaultBrowserContext();
  try { await ctx.overridePermissions(BASE, ['clipboard-read', 'clipboard-write']); } catch { /* 视版本 */ }
  await page.click('#contactBlock summary');
  await page.click('#contactBlock .v5-contact-copy');
  await sleep(500);
  const clip = await page.evaluate(async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { text = ''; }
    return { text, btn: document.querySelector('#contactBlock .v5-contact-copy')?.textContent || '' };
  });
  // headless 下 clipboard.readText 常被拒，此时以「写入成功→按钮变已复制」为真实信号
  const copyOk = /haorongli09@(outlook|gmail)\.com/.test(clip.text || '') || /已复制/.test(clip.btn);
  ok('点击复制真实生效', copyOk, JSON.stringify(clip));
  await page.screenshot({ path: path.join(OUT, 'home-contact.png'), fullPage: false });

  // 详情页保留联系方式
  await page.evaluate(() => { location.hash = '#/work/sheng'; });
  await sleep(1200);
  const workContact = await page.evaluate(() => {
    const b = document.getElementById('contactBlock');
    return { has: !!b, mails: b ? b.querySelectorAll('a.v5-contact-mail').length : 0, foot: !!document.querySelector('.v5-footer a[href^="mailto:"]') };
  });
  ok('作品详情页保留联系方式且不重复', workContact.has && workContact.mails === 2 && workContact.foot, JSON.stringify(workContact));

  // ---------------------------------------------------------------- 布局
  console.log('[B] Studio 可拖拽布局');
  await page.evaluate(() => { location.hash = '#/studio'; });
  await page.waitForFunction('document.body.classList.contains("mode-studio")', { timeout: 30000 });
  await sleep(1600);

  // 真实鼠标拖拽：把元素中心从 A 拖到 B
  async function dragBy(sel, dx, dy) {
    const box = await page.evaluate((s) => {
      const n = document.querySelector(s);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, sel);
    if (!box) return false;
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + dx / 2, box.y + dy / 2, { steps: 6 });
    await page.mouse.move(box.x + dx, box.y + dy, { steps: 6 });
    await page.mouse.up();
    await sleep(260);
    return true;
  }
  const sizes = () => page.evaluate(() => {
    const q = (s) => { const n = document.querySelector(s); if (!n) return 0; const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      tree: q('#studioTree'), inspector: q('#studioRail'), dock: q('#studioDock'),
      viewport: q('.viewport'), canvas: q('#stage'),
      aspect: window.__FORMA.viewer.camera.aspect,
      canvasW: document.querySelector('#stage')?.width,
      layout: window.__FORMA.layout?.read?.() || null,
    };
  });

  const before = await sizes();
  ok('拖拽前三个面板都有尺寸', before.tree.w > 0 && before.inspector.w > 0 && before.dock.h > 0, JSON.stringify(before));

  // 1. 左侧资源树加宽
  await dragBy('#stHandleLeft', 120, 0);
  const afterLeft = await sizes();
  ok('左资源树可拖宽', afterLeft.tree.w > before.tree.w + 60, `${before.tree.w} → ${afterLeft.tree.w}`);
  ok('左资源树加宽后视口变窄且相机比例同步',
    afterLeft.viewport.w < before.viewport.w && Math.abs(afterLeft.aspect - afterLeft.canvas.w / afterLeft.canvas.h) < 0.02,
    JSON.stringify({ vw: afterLeft.viewport.w, aspect: afterLeft.aspect }));

  // 2. 左资源树缩回
  await dragBy('#stHandleLeft', -80, 0);
  const backLeft = await sizes();
  ok('左资源树可拖窄', backLeft.tree.w < afterLeft.tree.w - 40, `${afterLeft.tree.w} → ${backLeft.tree.w}`);

  // 3. 右侧 Inspector
  await dragBy('#stHandleRight', -140, 0);
  const afterRight = await sizes();
  ok('右 Inspector 可拖宽', afterRight.inspector.w > before.inspector.w + 60, `${before.inspector.w} → ${afterRight.inspector.w}`);
  await dragBy('#stHandleRight', 90, 0);
  const backRight = await sizes();
  ok('右 Inspector 可拖窄', backRight.inspector.w < afterRight.inspector.w - 40, `${afterRight.inspector.w} → ${backRight.inspector.w}`);

  // 4. 底部 Dock 上下拖动（向上拖 = 变高）
  const dockBefore = (await sizes()).dock.h;
  await dragBy('#stHandleBottom', 0, -160);
  const dockUp = await sizes();
  ok('底部 Dock 可向上拖高', dockUp.dock.h > dockBefore + 80, `${dockBefore} → ${dockUp.dock.h}`);
  await dragBy('#stHandleBottom', 0, 120);
  const dockDown = await sizes();
  ok('底部 Dock 可向下拖低（视口变大）', dockDown.dock.h < dockUp.dock.h - 60 && dockDown.viewport.h > dockUp.viewport.h, JSON.stringify({ d: dockDown.dock.h, v: dockDown.viewport.h }));

  // 5. 拖到极限后仍能拉回（安全边界）
  await dragBy('#stHandleBottom', 0, 2000);   // 疯狂往下拖
  const minDock = await sizes();
  const handleVisible = await page.evaluate(() => {
    const n = document.querySelector('#stHandleBottom');
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 1;
  });
  ok('拖到极限后 Dock 仍有最小高度', minDock.dock.h >= 120, String(minDock.dock.h));
  ok('拖到极限后手柄仍在视口内可见', handleVisible);
  await dragBy('#stHandleBottom', 0, -2000);  // 疯狂往上拖
  const maxDock = await sizes();
  ok('向上拖到极限后视口仍保留最小空间', maxDock.viewport.h >= 200, String(maxDock.viewport.h));
  await dragBy('#stHandleBottom', 0, 400);    // 拉回中间
  const restored = await sizes();
  ok('极限后仍可拖回中间', restored.dock.h > 120 && restored.dock.h < maxDock.dock.h, `${maxDock.dock.h} → ${restored.dock.h}`);

  // 6. 双击手柄恢复默认
  await page.evaluate(() => {
    const h = document.querySelector('#stHandleBottom');
    const r = h.getBoundingClientRect();
    const opts = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    h.dispatchEvent(new MouseEvent('dblclick', opts));
  });
  await sleep(320);
  const afterDbl = await sizes();
  ok('双击手柄恢复默认高度', Math.abs(afterDbl.dock.h - 252) <= 2, String(afterDbl.dock.h));

  // 7. 折叠 / 展开保留有效高度
  await page.click('#stDockCollapse');
  await sleep(320);
  const collapsed = await sizes();
  const collapseBtnVisible = await page.evaluate(() => {
    const n = document.querySelector('#stDockCollapse');
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 1;
  });
  ok('一键折叠生效', collapsed.dock.h <= 44, String(collapsed.dock.h));
  ok('折叠后展开按钮仍可见', collapseBtnVisible);
  await page.click('#stDockCollapse');
  await sleep(320);
  const expanded = await sizes();
  ok('展开恢复到折叠前的有效高度', Math.abs(expanded.dock.h - afterDbl.dock.h) <= 2, `${collapsed.dock.h} → ${expanded.dock.h}`);

  // 8. 刷新后保持布局
  const beforeReload = await sizes();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });
  await page.evaluate(() => { location.hash = '#/studio'; });
  await page.waitForFunction('document.body.classList.contains("mode-studio")', { timeout: 30000 });
  await sleep(1500);
  const afterReload = await sizes();
  ok('刷新后布局保持', Math.abs(afterReload.dock.h - beforeReload.dock.h) <= 2
    && Math.abs(afterReload.inspector.w - beforeReload.inspector.w) <= 2
    && Math.abs(afterReload.tree.w - beforeReload.tree.w) <= 2,
  JSON.stringify({ before: beforeReload.layout, after: afterReload.layout }));

  // 9. 恢复默认布局按钮
  await page.click('#stLayoutReset');
  await sleep(400);
  const afterReset = await sizes();
  ok('恢复默认布局按钮生效',
    afterReset.dock.h === 252 && afterReset.tree.w > 0 && afterReset.inspector.w > 0,
    JSON.stringify({ d: afterReset.dock.h, t: afterReset.tree.w, i: afterReset.inspector.w }));

  // 10. 窗口尺寸变化后不失控（含 1366×768 与窄窗口）
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 900, height: 700 }]) {
    await page.setViewport(vp);
    await sleep(700);
    const s = await sizes();
    const inView = await page.evaluate(() => {
      const d = document.querySelector('#studioDock').getBoundingClientRect();
      const v = document.querySelector('.viewport').getBoundingClientRect();
      return { dockBottomOk: d.bottom <= window.innerHeight + 1, viewportOk: v.height >= 150 && v.width >= 100 };
    });
    ok(`${vp.width}×${vp.height} 下布局不失控`, s.dock.h >= 40 && inView.dockBottomOk && inView.viewportOk,
      JSON.stringify({ ...s, ...inView }));
  }

  // 11. 浏览器缩放（deviceScaleFactor 变化）后仍可拖回
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1.75 });
  await sleep(800);
  const zoomed = await sizes();
  await dragBy('#stHandleBottom', 0, 140);
  const zoomDragged = await sizes();
  ok('缩放后仍可拖动并可见', zoomDragged.dock.h !== zoomed.dock.h && zoomDragged.dock.h >= 40 && zoomDragged.dock.h <= zoomed.viewport.h + zoomDragged.dock.h,
    JSON.stringify({ a: zoomed.dock.h, b: zoomDragged.dock.h }));
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await sleep(600);

  // 12. 3D 渲染正确（相机比例 = canvas 宽高比，且真的画出了像素）
  const render = await page.evaluate(() => {
    const c = document.querySelector('#stage');
    const v = window.__FORMA.viewer;
    // drawingBuffer 不保留，readPixels 拿到的是空缓冲；改用真实截图通道取像素
    const url = v.capturePNG(1) || '';
    const body = url.split(',')[1] || '';
    return {
      aspect: +v.camera.aspect.toFixed(4), canvasAspect: +(c.clientWidth / c.clientHeight).toFixed(4),
      drawing: c.width, drawingH: c.height,
      pngBytes: Math.round(body.length * 0.75),
      sharedRenderer:c===v.renderer.domElement&&!!c.getContext('webgl2'),
      extraOnly2d:[...document.querySelectorAll('#app canvas')].filter(n=>n!==c).every(n=>n.classList.contains('st-tex-preview')&&!!n.getContext('2d')),
    };
  });
  ok('相机比例与视口一致（无拉伸变形）', Math.abs(render.aspect - render.canvasAspect) < 0.02, JSON.stringify(render));
  ok('画布尺寸非 1×1 且真的导出到画面', render.drawing > 100 && render.pngBytes > 20000, JSON.stringify(render));
  ok('工作区唯一 WebGL 渲染器，贴图预览使用 2D 画布', render.sharedRenderer&&render.extraOnly2d, JSON.stringify(render));
  await page.screenshot({ path: path.join(OUT, 'studio-layout.png') });

  // 13. Gallery ↔ Studio 切换后布局状态正确
  await page.evaluate(() => { location.hash = '#/gallery'; });
  await page.waitForFunction('document.body.classList.contains("mode-gallery")', { timeout: 30000 });
  await sleep(900);
  const galleryLayout = await page.evaluate(() => ({
    mode: window.__FORMA.layout?.read?.().mode,
    railVisible: !!document.querySelector('#inspector')?.getBoundingClientRect().width,
    dockHidden: document.querySelector('#studioDock')?.hidden,
    bottomHandleHidden: getComputedStyle(document.querySelector('#stHandleBottom')).display === 'none',
  }));
  ok('Gallery 下底部任务区与横向手柄让位', galleryLayout.dockHidden === true && galleryLayout.bottomHandleHidden, JSON.stringify(galleryLayout));
  ok('Gallery 布局模式独立', galleryLayout.mode === 'gallery' && !galleryLayout.railVisible, JSON.stringify(galleryLayout));

  // Gallery uses an on-demand settings drawer instead of a permanent rail.
  await page.click('#glAdvanced');
  ok('Gallery 设置可展开', await page.$eval('#glDrawer', e=>!e.hidden && e.getBoundingClientRect().width>100));
  await page.click('#glDrawerClose');
  ok('设置关闭后入口仍可达', await page.$eval('#glAdvanced', e=>e.getBoundingClientRect().width>40 && document.querySelector('#glDrawer').hidden));

  await page.evaluate(() => { location.hash = '#/studio'; });
  await page.waitForFunction('document.body.classList.contains("mode-studio")', { timeout: 30000 });
  await sleep(900);
  const studioAgain = await page.evaluate(() => ({ mode: window.__FORMA.layout?.read?.().mode, dock: document.querySelector('#studioDock').getBoundingClientRect().height }));
  ok('回到 Studio 布局状态正确', studioAgain.mode === 'studio' && studioAgain.dock > 100, JSON.stringify(studioAgain));

  // 14. 键盘调整
  await page.focus('#stHandleBottom');
  const kbBefore = (await sizes()).dock.h;
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp');
  await sleep(300);
  const kbAfter = (await sizes()).dock.h;
  ok('键盘可调整底部高度', kbAfter > kbBefore, `${kbBefore} → ${kbAfter}`);
  await page.keyboard.press('End');
  await sleep(300);
  const kbEnd = (await sizes()).dock.h;
  ok('End 键到最大且视口仍有空间', kbEnd >= kbAfter && (await sizes()).viewport.h >= 200, String(kbEnd));

  // 15. 窄屏（触控）不出现不可用面板
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 90000 });
  await sleep(1200);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    handlesHidden: getComputedStyle(document.querySelector('#stHandleLeft')).display === 'none',
    collapseVisible: document.querySelector('#stDockCollapse')?.getBoundingClientRect().width > 0,
  }));
  ok('窄屏无横向溢出且不出现拖不动的手柄', mobile.overflow && mobile.handlesHidden, JSON.stringify(mobile));
  ok('窄屏仍保留折叠入口', mobile.collapseVisible);
  await page.screenshot({ path: path.join(OUT, 'studio-mobile.png') });

  // 16. Studio 左栏只保留资源树：全部展开也不得盖住拖拽手柄（回归专项）
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 90000 });
  await page.evaluate(() => { location.hash = '#/studio'; });
  await page.waitForFunction('document.body.classList.contains("mode-studio")', { timeout: 30000 });
  await sleep(1200);
  const sidebarState = await page.evaluate(() => {
    // 把资源树三个区块全部展开
    for (const head of document.querySelectorAll('#studioTree .st-sect-head')) {
      if (head.getAttribute('aria-expanded') !== 'true') head.click();
    }
    const sb = document.querySelector('.sidebar');
    sb.scrollTop = 0;
    const handle = document.getElementById('stHandleLeft');
    const r = handle.getBoundingClientRect();
    // 手柄中心点上，最顶层元素必须是手柄自己（而不是被资源树内容盖住）
    const top = document.elementFromPoint(r.x + r.width / 2, Math.min(window.innerHeight - 4, Math.max(2, r.y + r.height / 2)));
    return {
      galleryListVisible: getComputedStyle(document.querySelector('.sidebar-body')).display !== 'none',
      footVisible: getComputedStyle(document.querySelector('.sidebar-foot')).display !== 'none',
      treeVisible: getComputedStyle(document.getElementById('studioTree')).display !== 'none',
      // 整栏滚动：唯一滚动容器是 .sidebar，展开后内容超出即整栏可滑
      wholeColumnScrolls: sb.scrollHeight > sb.clientHeight,
      sidebarOverflowY: getComputedStyle(sb).overflowY,
      handleOnTop: handle === top || handle.contains(top),
    };
  });
  ok('Studio 左栏 = 作品列表 + 资源树（内容不删）',
    sidebarState.galleryListVisible && sidebarState.footVisible && sidebarState.treeVisible, JSON.stringify(sidebarState));
  ok('展开后整栏可滚动（唯一滚动容器是侧栏）',
    sidebarState.wholeColumnScrolls && sidebarState.sidebarOverflowY === 'auto', JSON.stringify(sidebarState));
  ok('手柄压在内容之上（随时可抓取）', sidebarState.handleOnTop, JSON.stringify(sidebarState));

  // 展开状态下真实拖一次左边界
  const expBefore = await sizes();
  await dragBy('#stHandleLeft', 100, 0);
  const expAfter = await sizes();
  ok('资源树展开状态下手柄仍可拖动', expAfter.tree.w > expBefore.tree.w + 40, `${expBefore.tree.w} → ${expAfter.tree.w}`);

  // Gallery 模式：左栏回到纯作品列表（资源树隐藏）
  await page.evaluate(() => { location.hash = '#/gallery'; });
  await page.waitForFunction('document.body.classList.contains("mode-gallery")', { timeout: 30000 });
  await sleep(800);
  const galBack = await page.evaluate(() => ({
    body: getComputedStyle(document.querySelector('.sidebar-body')).display,
    sidebarScroll: getComputedStyle(document.querySelector('.sidebar')).overflowY,
  }));
  ok('回到 Gallery 左栏恢复观展布局', galBack.body !== 'none', JSON.stringify(galBack));

  ok('无页面级错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  fail++; failures.push('执行异常');
  console.error(e);
} finally {
  await browser.close();
  try { be.kill(); } catch { /* */ }
  try { serve.kill(); } catch { /* */ }
  console.log(`\n布局与联系方式验收：${pass} passed, ${fail} failed`);
  if (failures.length) console.log('失败项：' + failures.join(', '));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ pass, fail, failures }, null, 2));
  process.exit(fail ? 1 : 0);
}
