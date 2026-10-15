import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';

const base = process.env.FORMA_BASE;
assert.ok(base, 'Run through npm test so the local server is started and cleaned up.');
function get(path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(10000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject); req.end();
  });
}
const checks = [
  ['index and module MIME', async () => { const r = await get('/'); assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/html/); const m = await get('/src/core/viewer.js'); assert.equal(m.status, 200); assert.match(m.headers['content-type'], /javascript/); }],
  ['GLB and HEAD metadata', async () => { const r = await get('/assets/models/sheng.glb', {}, 'HEAD'); assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'model/gltf-binary'); assert.ok(Number(r.headers['content-length']) > 1000); assert.equal(r.body.length, 0); }],
  ['GLB byte range', async () => { const r = await get('/assets/models/sheng.glb', { Range: 'bytes=0-11' }); assert.equal(r.status, 206); assert.equal(r.body.length, 12); assert.equal(r.body.subarray(0, 4).toString(), 'glTF'); assert.match(r.headers['content-range'], /^bytes 0-11\/\d+$/); }],
  ['suffix range', async () => { const r = await get('/assets/models/sheng.glb', { Range: 'bytes=-4' }); assert.equal(r.status, 206); assert.equal(r.body.length, 4); }],
  ['out of bounds range', async () => { const r = await get('/assets/models/sheng.glb', { Range: 'bytes=999999999-' }); assert.equal(r.status, 416); }],
  ['missing file and malformed URL', async () => { assert.equal((await get('/does-not-exist')).status, 404); assert.equal((await get('/%E0%A4%A')).status, 400); }],
  ['sibling path traversal is blocked', async () => { assert.equal((await get('/..%2fFORMA-3D-Viewer-v3-other%2fprivate.txt')).status, 403); }],
];
for (const [name, check] of checks) await test(name, check);
