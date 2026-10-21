// compare 组测试：Before/After 真实双模型对比所需的「产物可服务」能力。
// 覆盖：run 返回 beforePath/afterPath → /api/file/<rel> 真实字节（sha256 逐一对齐）
// → 目录穿越/越权扩展名被拒 → 内容类型正确 → 前端 fileUrl 编码可用。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function start(cmd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (c) => { log += c; });
    child.stderr.on('data', (c) => { log += c; });
    const timer = setTimeout(() => reject(new Error('启动超时\n' + log)), 15000);
    const int = setInterval(() => {
      const m = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearInterval(int); clearTimeout(timer); resolve({ child, port: Number(m[1]), log }); }
    }, 100);
  });
}

const backend = await start(['backend/server.mjs'], { FORMA_BACKEND_PORT: '0' });
const base = `http://127.0.0.1:${backend.port}`;

// ---------- 1. 导入一个非琼剧资产（避免确认门，专注对比链路） ----------
console.log('[1] 导入资产');
const rawPath = path.join(ROOT, 'assets', 'raw', 'sheng.glb');
const rawBuf = fs.readFileSync(rawPath);
const importRes = await fetch(base + '/api/assets/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'compare-probe.glb', dataBase64: rawBuf.toString('base64') }),
}).then((r) => r.json());
const assetId = importRes?.asset?.id;
check('导入成功', !!assetId, JSON.stringify(importRes).slice(0, 200));
check('原始字节 sha256 未被改写', importRes?.asset?.sha256 === sha(rawBuf));

// ---------- 2. 真实执行 → 拿到 before/after 路径 ----------
console.log('[2] 执行处理并取回对比路径');
const runRes = await fetch(base + `/api/assets/${assetId}/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ops: [{ op: 'weld', params: { epsilon: 1e-5 } }, { op: 'dedup', params: {} }] }),
}).then((r) => r.json());
check('返回 beforePath', typeof runRes?.beforePath === 'string' && runRes.beforePath.length > 0, JSON.stringify(runRes).slice(0, 200));
check('返回 afterPath', typeof runRes?.afterPath === 'string' && runRes.afterPath.length > 0);
check('beforePath 指向 workspace 原文', runRes.beforePath.includes('workspace') || runRes.beforePath.includes('original'), runRes.beforePath);
check('before/after 不是同一文件', runRes.beforePath !== runRes.afterPath);
check('路径分隔符已统一为 /', !runRes.beforePath.includes('\\') && !runRes.afterPath.includes('\\'));

// ---------- 3. /api/file 真实服务两端文件 ----------
console.log('[3] /api/file 服务真实字节');
const beforeRes = await fetch(`${base}/api/file/${runRes.beforePath}`);
check('before 文件 200', beforeRes.status === 200, String(beforeRes.status));
const beforeBuf = Buffer.from(await beforeRes.arrayBuffer());
check('before 字节与原始素材一致', sha(beforeBuf) === sha(rawBuf));
check('before sha256 与 run.before 一致', sha(beforeBuf) === runRes.before.sha256);
check('before 内容类型正确', (beforeRes.headers.get('content-type') || '').includes('gltf-binary'), beforeRes.headers.get('content-type'));

const afterRes = await fetch(`${base}/api/file/${runRes.afterPath}`);
check('after 文件 200', afterRes.status === 200, String(afterRes.status));
const afterBuf = Buffer.from(await afterRes.arrayBuffer());
check('after sha256 与 run.after 一致', sha(afterBuf) === runRes.after.sha256);
check('after 与 before 内容不同（产物真实产出）', sha(afterBuf) !== sha(beforeBuf));
check('after 字节数与 run.after.bytes 一致', afterBuf.length === runRes.after.bytes, `${afterBuf.length} vs ${runRes.after.bytes}`);

// ---------- 4. 安全：目录穿越与越权扩展名 ----------
console.log('[4] 安全边界');
const trav = await fetch(`${base}/api/file/backend%2f..%2f..%2f..%2fWindows%2fwin.ini`);
check('编码穿越被拒', trav.status >= 400, String(trav.status));
const trav2 = await fetch(`${base}/api/file/pipeline-out%2f..%2f..%2fpackage.json`);
check('越出白名单目录被拒', trav2.status >= 400, String(trav2.status));
const jsRes = await fetch(`${base}/api/file/backend/server.mjs`);
check('非白名单扩展名被拒', jsRes.status >= 400, String(jsRes.status));
const envRes = await fetch(`${base}/api/file/backend%2f.env`);
check('.env 被拒', envRes.status >= 400, String(envRes.status));
const noFile = await fetch(`${base}/api/file/pipeline-out/nope-v99/model.glb`);
check('不存在文件 4xx', noFile.status >= 400, String(noFile.status));
const notFile = await fetch(`${base}/api/file/pipeline-out`);
check('目录不可服务', notFile.status >= 400, String(notFile.status));

// ---------- 5. 前端 URL 编码可用（含空格/中文目录场景） ----------
console.log('[5] 前端 fileUrl 编码一致性');
const enc = runRes.afterPath.split('/').map(encodeURIComponent).join('/');
const encRes = await fetch(`${base}/api/file/${enc}`);
check('逐段编码后仍可访问', encRes.status === 200, String(encRes.status));

// ---------- 6. 确认门（409）必须回传 needConfirm/token，否则前端二次确认拿不到凭证 ----------
console.log('[6] 确认门回传凭证');
const gate1 = await fetch(base + `/api/assets/${assetId}/run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ops: [{ op: 'simplify', params: { ratio: 0.4 } }] }),
});
const gateBody = await gate1.json();
check('外观算子首个请求 409', gate1.status === 409, String(gate1.status));
check('响应体顶层带回 needConfirm', gateBody?.needConfirm === true, JSON.stringify(gateBody).slice(0, 160));
check('响应体顶层带回 token', typeof gateBody?.token === 'string' && gateBody.token.length > 0);
check('响应体带回触发原因', Array.isArray(gateBody?.reasons) && gateBody.reasons.length > 0);

const gate2 = await fetch(base + `/api/assets/${assetId}/run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ops: [{ op: 'simplify', params: { ratio: 0.4 } }], confirmToken: gateBody.token }),
}).then((r) => r.json());
check('携带 token 后真实执行成功', typeof gate2?.version === 'number', JSON.stringify(gate2).slice(0, 160));
check('确认执行后同样返回对比路径', !!gate2?.beforePath && !!gate2?.afterPath);
check('确认执行后三角面真实下降', gate2?.after?.tris < gate2?.before?.tris, `${gate2?.before?.tris}->${gate2?.after?.tris}`);

backend.child.kill();
await new Promise((r) => backend.child.once('exit', r));

console.log(`\n=== compare: ${pass} passed, ${fail} failed ===`);
if (fail > 0) console.log('失败项：' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
