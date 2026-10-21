// 交互验证：勾选算子 → 参数控件展开 → 值变化真实进入请求体；预设一键配置。
// 自带静态服务（避免复用外部可能指向其他目录的端口进程）。
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5399;

const serve = spawn(process.execPath, ['serve.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore',
});
const shutdown = () => { try { serve.kill(); } catch { /* ignore */ } };
process.on('exit', shutdown);
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // 拦截 fetch，记录所有带 body 的请求（挂在 window 上，供后续 evaluate 读取）
  const origFetch = `
    window.__reqBodies = [];
    window.__origFetch = window.fetch.bind(window);
    window.fetch = (...a) => {
      try { if (a[1] && a[1].body) window.__reqBodies.push({ url: String(a[0]), body: JSON.parse(a[1].body) }); } catch {}
      return window.__origFetch(...a);
    };
  `;
  await page.evaluateOnNewDocument(origFetch);
  await page.goto(`http://127.0.0.1:${PORT}/#/studio`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__FORMA && window.__FORMA.ready', { timeout: 120000 });
  // 面板是惰性连接：显式触发一次（真实用户点「连接后端」的等价操作）
  await page.evaluate(() => window.__FORMA.pipeline.connect());
  await page.waitForFunction(
    () => document.getElementById('pipelineStatus')?.textContent.includes('已连接'),
    { timeout: 60000 },
  );

  // 1. 勾选「网格简化」→ 参数控件展开
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#pipelineOps input[type="checkbox"]')];
    boxes.find((b) => b.value === 'simplify').click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const expanded = await page.evaluate(() => {
    const g = document.querySelector('#pipelineOps [data-op="simplify"]');
    const inputs = g ? [...g.querySelectorAll('input')] : [];
    return { hidden: g?.hidden, count: inputs.length, vals: inputs.map((i) => i.value) };
  });
  ok('勾选后参数控件展开', expanded.hidden === false && expanded.count >= 2, JSON.stringify(expanded));
  ok('简化参数默认值正确（0.5/0.001）', expanded.vals.includes('0.5') && expanded.vals.includes('0.001'), expanded.vals.join(','));

  // 2. 修改 ratio → 值真实进入请求体（dryRun 预览）
  await page.evaluate(() => {
    const g = document.querySelector('#pipelineOps [data-op="simplify"]');
    const num = g.querySelector('input[type="number"]');
    num.value = '0.3';
    num.dispatchEvent(new Event('input', { bubbles: true }));
    // 选择资产
    const sel = document.getElementById('pipelineAssetSel');
    sel.value = sel.options[1]?.value || '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('pipelineDry').checked = true;
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#pipelineSect button')];
    btns.find((b) => b.textContent.includes('执行处理')).click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  const runReq = await page.evaluate(() => window.__reqBodies.find((r) => r.url.includes('/run')));
  ok('请求携带真实参数 ratio=0.3', runReq?.body?.ops?.[0]?.params?.ratio === 0.3, JSON.stringify(runReq?.body));

  // 3. 应用预设「修复补全」→ 自动勾选 4 算子且参数写入
  await page.evaluate(() => {
    const sel = document.getElementById('pipelinePresetSel');
    sel.value = 'repair';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  const afterPreset = await page.evaluate(() => {
    const checked = [...document.querySelectorAll('#pipelineOps input[type="checkbox"]:checked')].map((b) => b.value);
    const weld = document.querySelector('#pipelineOps [data-op="weld"]');
    const eps = weld?.querySelector('input[type="number"]');
    return { checked, eps: eps?.value, hidden: weld?.hidden };
  });
  ok('预设勾选 4 个算子', afterPreset.checked.length === 4, afterPreset.checked.join(','));
  ok('预设参数写入（weld epsilon=1e-5）', Number(afterPreset.eps) === 1e-5, `eps=${afterPreset.eps}`);
  ok('预设算子参数区展开', afterPreset.hidden === false);

  // 4. 未知参数被后端拒绝（伪造请求直接验证）
  const rej = await page.evaluate(async () => {
    const res = await window.__origFetch('/api/assets/' + document.getElementById('pipelineAssetSel').value + '/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: [{ op: 'weld', params: { bogus: 1 } }], dryRun: true }),
    });
    return res.status;
  });
  ok('未知参数被后端 400 拒绝', rej === 400, `status=${rej}`);

  await page.screenshot({ path: 'docs/demo/frames/v51-params-interact.png' });
} finally {
  await browser.close();
}
console.log(`\nparams-ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
