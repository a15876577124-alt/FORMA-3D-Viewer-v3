import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../tools/browser-test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.FORMA_TEST_OUTPUT_DIR || path.join(ROOT, 'test-out', 'extended-' + Date.now()));
fs.mkdirSync(OUT, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage();
const errors = [], requests = [], results = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => requests.push({ url: request.url(), error: request.failure()?.errorText }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function check(name, fn) {
  try { const evidence = await fn(); results.push({ name, passed: true, evidence }); console.log('[PASS] ' + name); }
  catch (error) { results.push({ name, passed: false, error: error.message }); throw error; }
}
async function upload(files) {
  const before = await page.evaluate(() => window.__FORMA.current.id);
  await (await page.$('#fileInput')).uploadFile(...files);
  await page.waitForFunction((old) => window.__FORMA.current.id !== old && String(window.__FORMA.current.id).startsWith('imported:'), { timeout: 25000 }, before);
  await sleep(200);
}
try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(process.env.FORMA_BASE, { waitUntil: 'domcontentloaded' });
  // The entry module is injected dynamically, so it can finish loading after
  // DOMContentLoaded - wait for readiness instead of assuming nav timing.
  await page.waitForFunction(() => window.__FORMA && window.__FORMA.ready, { timeout: 60000 });
  assert.equal(await page.evaluate(async () => await window.__FORMA.ready), true);
  await check('外部 glTF + bin + PNG 真实导入', async () => {
    // Derive disposable external files from an existing real mesh. Original bytes stay untouched.
    const glb = fs.readFileSync(path.join(ROOT, 'assets/models/sheng.glb'));
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    const binOffset = 20 + jsonLength;
    const bin = glb.subarray(binOffset + 8, binOffset + 8 + glb.readUInt32LE(binOffset));
    const dir = path.join(OUT, 'gltf-fixture'); fs.mkdirSync(dir);
    json.buffers[0].uri = 'geometry.bin';
    const files = [];
    for (let i = 0; i < json.images.length; i++) {
      const image = json.images[i], view = json.bufferViews[image.bufferView];
      const name = 'texture-' + i + '.png';
      fs.writeFileSync(path.join(dir, name), bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
      delete image.bufferView; image.uri = 'textures/' + name;
      files.push(path.join(dir, name));
    }
    const model = path.join(dir, 'external.gltf'), buffer = path.join(dir, 'geometry.bin');
    fs.writeFileSync(model, JSON.stringify(json)); fs.writeFileSync(buffer, bin);
    await upload([model, buffer, ...files]);
    const evidence = await page.evaluate(() => ({ info: window.__FORMA.info, material: window.__FORMA.viewer.readMaterial() }));
    assert.equal(evidence.info.format, 'imported-gltf'); assert.ok(evidence.info.modelTris > 40000);
    assert.ok(evidence.info.renderTriangles > 40000); assert.ok(evidence.material.hasMap);
    return evidence;
  });
  await check('Maya FBX 蒙皮与动画真实播放', async () => {
    await upload([path.join(ROOT, 'test-assets/animated-skin.fbx')]);
    const evidence = await page.evaluate(() => {
      const v = window.__FORMA.viewer;
      let skinned = 0, bones = 0; v.modelRoot.traverse((o) => { if (o.isSkinnedMesh) { skinned++; bones += o.skeleton.bones.length; } });
      const sample = (time) => { v.mixer.setTime(time); v.modelRoot.updateMatrixWorld(true); const values = []; v.modelRoot.traverse((o) => { if (o.isBone) values.push(...o.quaternion.toArray()); }); return values; };
      const a = sample(0.04), b = sample(0.4); window.__FORMA.renderNow();
      return { info: window.__FORMA.info, skinned, bones, quaternionDelta: b.reduce((sum, value, i) => sum + Math.abs(value - a[i]), 0) };
    });
    assert.equal(evidence.info.format, 'fbx'); assert.ok(evidence.skinned > 0); assert.ok(evidence.bones >= 3);
    assert.ok(evidence.info.animations.length > 0); assert.ok(evidence.quaternionDelta > 0.01); assert.ok(evidence.info.renderTriangles > 0);
    return evidence;
  });
  await check('单动画剪辑可通过面板暂停和继续', async () => {
    await page.$eval('#animationPanel', (panel) => { const details = panel.closest('details'); if (!details.open) details.querySelector('summary').click(); });
    const button = await page.$('#animationPanel button:last-child');
    assert.ok(button); assert.match(await button.evaluate((node) => node.textContent), /暂停/);
    await button.click(); assert.equal(await page.evaluate(() => window.__FORMA.viewer.action.paused), true);
    await button.click(); assert.equal(await page.evaluate(() => window.__FORMA.viewer.action.paused), false);
  });
  await page.evaluate(async () => { await window.__FORMA.select('dan'); window.__FORMA.viewer.controls.autoRotate = false; window.__FORMA.actions.resetView(); });
  await sleep(400);
  await check('鼠标拖动改变透视相机', async () => {
    const before = await page.evaluate(() => window.__FORMA.viewer.camera.position.toArray());
    const rect = await (await page.$('#stage')).boundingBox();
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
    await page.mouse.down(); await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.55, { steps: 12 }); await page.mouse.up();
    await sleep(400);
    const after = await page.evaluate(() => window.__FORMA.viewer.camera.position.toArray());
    assert.ok(after.some((value, i) => Math.abs(value - before[i]) > 0.05)); return { before, after };
  });
  await page.evaluate(() => window.__FORMA.actions.resetView()); await sleep(300);
  await sleep(6500); // Let the app's transient notifications expire naturally.
  await page.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: true });
  const image = await page.evaluate(() => window.__FORMA.viewer.capturePNG(1));
  fs.writeFileSync(path.join(OUT, 'model-render.png'), Buffer.from(image.split(',')[1], 'base64'));
  await page.setViewport({ width: 420, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  // Changing touch/mobile emulation can reload Chromium; await the new app instance.
  await page.waitForFunction(() => window.__FORMA && window.__FORMA.ready, { timeout: 60000 });
  await page.evaluate(async () => { await window.__FORMA.ready; await window.__FORMA.select('dan'); });
  await page.evaluate(() => window.__FORMA.actions.resetView()); await sleep(400);
  await check('移动端模型取景、深度、材质与等比变换', async () => {
    const evidence = await page.evaluate(async () => {
      const THREE = await import('three'); const v = window.__FORMA.viewer;
      v.camera.updateMatrixWorld(true); const corners = [];
      for (const x of [v.box.min.x, v.box.max.x]) for (const y of [v.box.min.y, v.box.max.y]) for (const z of [v.box.min.z, v.box.max.z]) corners.push(new THREE.Vector3(x, y, z).project(v.camera).toArray());
      const materials = []; v.modelRoot.traverse((o) => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) materials.push({ depthTest: m.depthTest, roughness: m.roughness, metalness: m.metalness, hasMap: !!m.map }); });
      return { perspective: v.camera.isPerspectiveCamera, near: v.camera.near, far: v.camera.far, scale: v.modelRoot.scale.toArray(), corners, materials, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    assert.ok(evidence.perspective && evidence.near > 0 && evidence.far > evidence.near);
    assert.ok(evidence.scale.every((value) => Math.abs(value - evidence.scale[0]) < 1e-6));
    assert.ok(evidence.corners.every((p) => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1 && p[2] >= -1 && p[2] <= 1));
    assert.ok(evidence.materials.every((m) => m.depthTest)); assert.ok(evidence.materials.some((m) => m.hasMap));
    assert.ok(evidence.scrollWidth <= evidence.viewportWidth); return evidence;
  });
  await page.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
  await check('扩展流程无页面异常和失败请求', async () => { assert.deepEqual(errors, []); assert.deepEqual(requests, []); });
} catch (error) {
  console.error(error.stack); process.exitCode = 1;
  await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'extended-report.json'), JSON.stringify({ results, errors, requests, passed: !process.exitCode }, null, 2));
}
