// Pipeline 组测试（M1+）：不依赖浏览器。
// 覆盖：分析器真实解析（GLB ground truth / GLTF / OBJ / FBX）、后端 HTTP 端到端、安全约束。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { analyzeFile } from '../backend/analyze.mjs';
import { EXPECTED } from '../tools/glbkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

// ---------- 1. 分析器：5 个手办 GLB 必须与 ground truth 一致 ----------
console.log('[1] 分析器 ground truth（GLB）');
for (const [name, exp] of Object.entries(EXPECTED)) {
  const r = await analyzeFile(path.join(ROOT, 'assets', 'raw', name + '.glb'));
  check(`${name} verts`, r.stats.verts === exp.verts, `${r.stats.verts} != ${exp.verts}`);
  check(`${name} tris`, r.stats.tris === exp.tris, `${r.stats.tris} != ${exp.tris}`);
  check(`${name} 无 error 级问题`, r.issues.every((i) => i.severity !== 'error'));
  check(`${name} 贴图尺寸真实`, r.textures.length > 0 && r.textures[0].width === 2048 && r.textures[0].height === 2048);
}

// ---------- 2. 分析器：GLTF / OBJ / FBX 真实解析 ----------
console.log('[2] 分析器多格式');
const objSample = path.join(ROOT, 'test-out', 'pipeline-cube.obj');
fs.mkdirSync(path.dirname(objSample), { recursive: true });
fs.writeFileSync(objSample, 'o cube\nv -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 2 3\nf 1 3 4\nf 5 6 7\nf 5 7 8\nf 1 5 8\nf 1 8 4\nf 2 6 7\nf 2 7 3\nf 1 2 6\nf 1 6 5\nf 4 3 7\nf 4 7 8\n');
// three.js loaders 输出非索引化几何体（每面独立顶点）：12 tris = 36 verts
const formatCases = [
  { file: 'test-assets/gltf-package/sheng.gltf', format: 'gltf', tris: 47512, verts: 26951 },
  { file: 'test-out/pipeline-cube.obj', format: 'obj', tris: 12, verts: 36 },
  { file: 'test-assets/ascii-cube.fbx', format: 'fbx-ascii', tris: 12, verts: 36 },
  { file: 'test-assets/vCube.fbx', format: 'fbx-binary', tris: 12, verts: 36 },
];
for (const c of formatCases) {
  try {
    const r = await analyzeFile(path.join(ROOT, c.file));
    check(`${path.basename(c.file)} 格式`, r.file.format === c.format, r.file.format);
    check(`${path.basename(c.file)} tris`, r.stats.tris === c.tris, `${r.stats.tris} != ${c.tris}`);
    check(`${path.basename(c.file)} verts`, r.stats.verts === c.verts, `${r.stats.verts} != ${c.verts}`);
  } catch (e) {
    check(`${path.basename(c.file)} 解析`, false, e.message);
  }
}

// ---------- 3. 后端 HTTP 端到端 + 安全 ----------
console.log('[3] 后端 HTTP 端到端与安全');
const backend = spawn(process.execPath, ['backend/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, FORMA_BACKEND_PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let base = '';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('后端启动超时')), 15000);
  let log = '';
  backend.stdout.on('data', (chunk) => {
    log += chunk;
    const m = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (m) { clearTimeout(timer); base = m[0]; resolve(); }
  });
  backend.stderr.on('data', (c) => { log += c; });
  backend.once('error', reject);
  backend.once('exit', (code) => { clearTimeout(timer); reject(new Error('后端提前退出 ' + code + '\n' + log)); });
});
console.log('  后端地址：' + base);

const j = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, headers: res.headers };
};

const health = await j('GET', '/api/health');
check('health', health.status === 200 && health.json?.ok === true);
check('health 仅本机监听', health.json?.host === '127.0.0.1');

const models = await j('GET', '/api/models');
check('models 非空', models.status === 200 && models.json.models.length > 0);

const glb = fs.readFileSync(path.join(ROOT, 'assets', 'raw', 'sheng.glb'));
const imp = await j('POST', '/api/assets/import', { name: 'sheng.glb', dataBase64: glb.toString('base64') });
check('import 200', imp.status === 200, JSON.stringify(imp.json).slice(0, 150));
check('import verts 真实', imp.json?.report?.stats?.verts === 26951);
check('import tris 真实', imp.json?.report?.stats?.tris === 47512);
check('import 幂等不破坏原始文件', fs.existsSync(path.join(ROOT, 'assets', 'raw', 'sheng.glb')));
const assetId = imp.json?.asset?.id;

const list = await j('GET', '/api/assets');
check('assets 列表', list.json.assets.some((a) => a.id === assetId));
const rep = await j('GET', `/api/assets/${assetId}/report`);
check('report 读取', rep.status === 200 && rep.json.report.stats.verts === 26951);
const re = await j('POST', `/api/assets/${assetId}/analyze`);
check('重新分析', re.status === 200 && re.json.report.stats.verts === 26951);

// 安全
const fake = await j('POST', '/api/assets/import', { name: 'evil.glb', dataBase64: Buffer.from('not a glb').toString('base64') });
check('伪造魔数 415', fake.status === 415, `got ${fake.status}`);
const trav = await j('POST', '/api/assets/import', { name: '../../etc/passwd.glb', dataBase64: glb.toString('base64') });
check('穿越文件名被清洗', trav.status === 200 && trav.json?.asset?.name === 'passwd.glb', `got ${trav.status}`);
check('workspace 外无写入', !fs.existsSync(path.join(ROOT, 'etc')));
const exe = await j('POST', '/api/assets/import', { name: 'x.exe', dataBase64: 'TVo=' });
check('危险扩展名 415', exe.status === 415, `got ${exe.status}`);
const empty = await j('POST', '/api/assets/import', { name: 'empty.glb', dataBase64: '' });
check('空文件 415', empty.status === 415, `got ${empty.status}`);
const badId = await j('GET', '/api/assets/..%2F..%2Fetc/report');
check('恶意 id 403/404', badId.status === 403 || badId.status === 404, `got ${badId.status}`);
const cors = await fetch(base + '/api/health', { headers: { Origin: 'http://evil.example.com' } });
check('陌生 Origin 无 CORS 头', cors.headers.get('access-control-allow-origin') === null);
const nf = await j('GET', '/api/nope');
check('未知路由 404', nf.status === 404);

backend.kill();
await new Promise((r) => backend.once('exit', r));

console.log(`\n=== pipeline: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
