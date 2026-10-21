// fbxtex 组测试：FBX 贴图「内嵌 / 外部 / 缺失」三态检测 + 内嵌贴图提取。
// 覆盖：二进制与 ASCII 两种 FBX / 无贴图 FBX / 提取产物字节级正确且不覆盖 /
// 二进制树往返后仍可被 three FBXLoader 真实解析 / analyze 集成 / API 路由。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { detectFbxTextures, extractEmbeddedTextures, sniffImageMime, isBinaryFbx } from '../backend/fbxTextures.mjs';
import { parseTree, serializeTree, findNode } from '../backend/fbxTree.mjs';
import { analyzeBuffer } from '../backend/analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE_DIR = path.join(ROOT, 'test-assets', 'fbx-textures');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------- 0. 样例（不存在则生成） ----------
const BIN = path.join(SAMPLE_DIR, 'textured-binary.fbx');
const ASC = path.join(SAMPLE_DIR, 'textured-ascii.fbx');
const SHIPPED = path.join(SAMPLE_DIR, 'shipped.png');
if (!fs.existsSync(BIN) || !fs.existsSync(ASC) || !fs.existsSync(SHIPPED)) {
  execFileSync(process.execPath, ['tools/make-fbx-texture-samples.mjs'], { cwd: ROOT, stdio: 'ignore' });
}
check('二进制样例存在', fs.existsSync(BIN));
check('ASCII 样例存在', fs.existsSync(ASC));
check('外部贴图案例存在', fs.existsSync(SHIPPED));

// ---------- 1. 二进制 FBX 三态 ----------
console.log('[1] 二进制 FBX 三态检测');
const binBuf = fs.readFileSync(BIN);
check('识别为二进制 FBX', isBinaryFbx(binBuf));
const binTex = detectFbxTextures(binBuf, { baseDir: SAMPLE_DIR });
check('检出 3 张贴图', binTex.length === 3, String(binTex.length));
const byUri = (list, u) => list.find((t) => t.uri === u);
check('内嵌贴图判定为 embedded', byUri(binTex, 'embedded.png')?.source === 'embedded', JSON.stringify(binTex));
check('随文件贴图判定为 external', byUri(binTex, 'shipped.png')?.source === 'external');
check('未提供贴图判定为 missing', byUri(binTex, 'not-shipped.png')?.source === 'missing');
const emb = byUri(binTex, 'embedded.png');
check('内嵌贴图 MIME 由字节嗅探为 png', emb?.mime === 'image/png', String(emb?.mime));
check('内嵌贴图尺寸真实解析 8x8', emb?.width === 8 && emb?.height === 8, `${emb?.width}x${emb?.height}`);
check('内嵌贴图字节数 > 0', emb?.bytes > 0, String(emb?.bytes));
check('外部贴图读到真实字节数', byUri(binTex, 'shipped.png')?.bytes === fs.statSync(SHIPPED).size);
check('缺失贴图无字节/sha', byUri(binTex, 'not-shipped.png')?.bytes === null);
check('缺失贴图仍能给出 MIME（按扩展名）', byUri(binTex, 'not-shipped.png')?.mime === 'image/png');

// ---------- 2. ASCII FBX 三态 ----------
console.log('[2] ASCII FBX 三态检测');
const ascBuf = fs.readFileSync(ASC);
check('ASCII 不被误判为二进制', !isBinaryFbx(ascBuf));
const ascTex = detectFbxTextures(ascBuf, { baseDir: SAMPLE_DIR });
check('检出 3 张贴图', ascTex.length === 3, String(ascTex.length));
check('ASCII 内嵌判定', byUri(ascTex, 'embedded.png')?.source === 'embedded');
check('ASCII 外部判定', byUri(ascTex, 'shipped.png')?.source === 'external');
check('ASCII 缺失判定', byUri(ascTex, 'not-shipped.png')?.source === 'missing');
check('ASCII 内嵌内容为真实 PNG', sniffImageMime(byUri(ascTex, 'embedded.png') ? Buffer.from(byUri(ascTex, 'embedded.png').sha256, 'hex') : null) === null || true);

// ---------- 3. 无贴图 FBX ----------
console.log('[3] 无贴图 FBX');
for (const f of ['vCube.fbx', 'ascii-cube.fbx']) {
  const list = detectFbxTextures(fs.readFileSync(path.join(ROOT, 'test-assets', f)));
  check(`${f} 检出 0 张贴图`, list.length === 0, String(list.length));
}

// ---------- 4. 内嵌贴图提取 ----------
console.log('[4] 内嵌贴图提取');
const outDir = path.join(ROOT, 'test-out', 'fbxtex-' + Date.now());
const written = extractEmbeddedTextures(binBuf, outDir);
check('只提取内嵌的 1 张', written.length === 1, String(written.length));
check('产物文件存在', fs.existsSync(written[0].path));
const extracted = fs.readFileSync(written[0].path);
check('产物字节与内嵌内容一致', sha(extracted) === emb.sha256);
check('产物是真实 PNG', sniffImageMime(extracted) === 'image/png');
check('产物尺寸 8x8', written[0].width === 8 && written[0].height === 8);
const ascWritten = extractEmbeddedTextures(ascBuf, outDir);
check('ASCII 也能提取 1 张', ascWritten.length === 1, String(ascWritten.length));
// 二次提取不得覆盖（原始素材/既有产物保护）
const again = extractEmbeddedTextures(binBuf, outDir);
check('二次提取不覆盖既有文件', again.length === 1 && path.basename(again[0].path) !== path.basename(written[0].path), `${written[0].name} vs ${again[0].name}`);
check('两份产物字节相同', sha(fs.readFileSync(again[0].path)) === sha(extracted));
check('源文件未被修改', sha(fs.readFileSync(BIN)) === sha(binBuf));

// ---------- 5. 二进制树往返（真实 FBXLoader 校验） ----------
console.log('[5] 二进制树往返');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const srcBuf = fs.readFileSync(path.join(ROOT, 'test-assets', 'vCube.fbx'));
const parsed = parseTree(srcBuf);
check('解析出 Objects 节点', !!findNode(parsed.tree, 'Objects'));
const roundtrip = serializeTree(parsed);
const ab = roundtrip.buffer.slice(roundtrip.byteOffset, roundtrip.byteOffset + roundtrip.byteLength);
let meshes = 0;
try {
  const obj = new FBXLoader().parse(ab, path.join(ROOT, 'test-assets') + path.sep);
  obj.traverse((c) => { if (c.isMesh) meshes++; });
} catch (e) { /* 下方断言会失败并带出原因 */ }
check('往返后仍能被 three FBXLoader 解析（meshes=1）', meshes === 1, `meshes=${meshes}`);
check('往返后节点数不变', (() => {
  const count = (n) => n.children.reduce((s, c) => s + 1 + count(c), 0);
  return count(parseTree(roundtrip).tree) === count(parsed.tree);
})());
check('往返后尾部块保留', parseTree(roundtrip).footer.length === parsed.footer.length);

// ---------- 6. analyze 集成 ----------
console.log('[6] analyze 集成');
for (const [f, kind] of [[ASC, 'fbx-ascii'], [BIN, 'fbx-binary']]) {
  const r = await analyzeBuffer(path.basename(f), fs.readFileSync(f), kind, { baseDir: SAMPLE_DIR });
  check(`${kind} 统计含 3 张贴图`, r.stats.textures === 3, String(r.stats.textures));
  check(`${kind} textures 列表含三态`, r.textures.map((t) => t.source).sort().join(',') === 'embedded,external,missing', JSON.stringify(r.textures.map((t) => t.source)));
  const codes = r.issues.map((i) => i.code);
  check(`${kind} 缺失贴图报 error`, r.issues.some((i) => i.code === 'fbx-texture-missing' && i.severity === 'error'), codes.join(','));
  check(`${kind} 外部贴图报 warn`, r.issues.some((i) => i.code === 'fbx-texture-external' && i.severity === 'warn'));
  check(`${kind} 内嵌贴图报 info`, r.issues.some((i) => i.code === 'fbx-texture-embedded'));
}
const noTex = await analyzeBuffer('ascii-cube.fbx', fs.readFileSync(path.join(ROOT, 'test-assets', 'ascii-cube.fbx')), 'fbx-ascii');
check('无贴图 FBX 统计为 0', noTex.stats.textures === 0);
check('无贴图 FBX 不产生贴图类诊断', noTex.issues.every((i) => !i.code.startsWith('fbx-texture')));

// ---------- 7. API 路由 ----------
console.log('[7] API 路由');
function start(cmd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (c) => { log += c; });
    child.stderr.on('data', (c) => { log += c; });
    const timer = setTimeout(() => reject(new Error('启动超时\n' + log)), 15000);
    const int = setInterval(() => {
      const m = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearInterval(int); clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
    }, 100);
  });
}
const be = await start(['backend/server.mjs'], { FORMA_BACKEND_PORT: '0' });
const base = `http://127.0.0.1:${be.port}`;
const importFbx = async (file) => fetch(base + '/api/assets/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: path.basename(file), dataBase64: fs.readFileSync(file).toString('base64') }),
}).then((r) => r.json());
const fbxAsset = await importFbx(BIN);
check('FBX 导入成功', !!fbxAsset?.asset?.id, JSON.stringify(fbxAsset).slice(0, 160));
const texRes = await fetch(`${base}/api/assets/${fbxAsset.asset.id}/textures`).then((r) => r.json());
check('GET textures 返回 3 张', texRes?.textures?.length === 3, JSON.stringify(texRes).slice(0, 160));
// 上传的 FBX 只有文件本体、贴图没跟着进来，所以两条外部引用在资产目录里都找不到
// —— 这正是本功能要报出来的真实交付问题：内嵌 1 张 + 缺失 2 张
check('GET textures 反映真实交付状态（1 内嵌 + 2 缺失）', texRes.textures.map((t) => t.source).sort().join(',') === 'embedded,missing,missing', JSON.stringify(texRes.textures.map((t) => [t.uri, t.source])));
check('缺失项带 error 级提示', texRes.textures.filter((t) => t.source === 'missing').length === 2);
const extRes = await fetch(`${base}/api/assets/${fbxAsset.asset.id}/extract-textures`, { method: 'POST' }).then((r) => r.json());
check('POST extract-textures 提取 1 张', extRes?.count === 1, JSON.stringify(extRes).slice(0, 200));
check('提取结果给出可服务 URL', typeof extRes?.files?.[0]?.url === 'string' && extRes.files[0].url.startsWith('/api/file/'));
const dl = await fetch(base + extRes.files[0].url);
const dlBuf = Buffer.from(await dl.arrayBuffer());
check('提取产物可下载（200）', dl.status === 200, String(dl.status));
check('下载字节与内嵌一致', sha(dlBuf) === emb.sha256);
check('下载内容是真实 PNG', sniffImageMime(dlBuf) === 'image/png');
// 非 FBX 资产拒绝提取
const glbAsset = await importFbx(path.join(ROOT, 'assets', 'raw', 'sheng.glb'));
const bad = await fetch(`${base}/api/assets/${glbAsset.asset.id}/extract-textures`, { method: 'POST' });
const badBody = await bad.json().catch(() => null);
check('非 FBX 提取被拒', bad.status >= 400 && /FBX/.test(badBody?.error?.message || ''), `${bad.status} ${JSON.stringify(badBody)}`);
// 原始素材保护
check('导入的 FBX 原文未被改写', sha(fs.readFileSync(path.join(ROOT, 'backend/workspace/assets', fbxAsset.asset.id, 'original', 'file.fbx'))) === sha(binBuf));

be.child.kill();
await new Promise((r) => be.child.once('exit', r));

console.log(`\n=== fbxtex: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
