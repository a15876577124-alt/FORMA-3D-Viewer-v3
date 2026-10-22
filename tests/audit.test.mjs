// Regressions found during Codex takeover; all writes use private test fixtures.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { runAgent } from '../backend/agent/agent.mjs';
import { dispatchTool } from '../backend/agent/tools.mjs';
import { makeFakeLlm } from '../backend/agent/fakeLlm.mjs';

const call = (name, args) => ({ toolCalls: [{ id: name, name, arguments: args, argumentsRaw: JSON.stringify(args) }] });
await test('async tool results and rejections are awaited', async () => {
  const good = await dispatchTool({ runOp: async () => ({ version: 9 }) }, 'run_op', { assetId: 'fixture', op: 'weld' });
  assert.equal(good.result.version, 9);
  const bad = await dispatchTool({ runOp: async () => { throw new Error('operation failed'); } }, 'run_op', { assetId: 'fixture', op: 'weld' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /operation failed/);
});
await test('dryRun suppresses wired mutations including export', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forma-agent-audit-'));
  let writes = 0;
  try {
    const log = await runAgent({ assetId: 'fixture', goal: 'dry run', dryRun: true,
      ctx: { assetsDir: temp, runOp: async () => { writes++; return {}; }, exportAsset: async () => { writes++; return {}; } },
      llmFn: makeFakeLlm([call('run_op', { assetId: 'fixture', op: 'weld' }), call('export_asset', { assetId: 'fixture', to: 'glb' }), call('finish', { summary: 'done' })]),
    });
    assert.equal(writes, 0);
    assert.equal(log.rounds[0].toolCalls[0].ok, true);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
await test('agent rejects path traversal in tool asset IDs', async () => {
  const result = await dispatchTool({ assetsDir: os.tmpdir() }, 'analyze_asset', { assetId: '../outside' });
  assert.equal(result.ok, false);
});
await test('tool failures are returned to the next LLM round', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forma-agent-error-'));
  let round = 0;
  try {
    await runAgent({ assetId: 'fixture', goal: 'test recovery', dryRun: false, ctx: { assetsDir: temp }, llmFn: async ({ messages }) => {
      if (round++ === 0) return call('unknown_tool', {});
      const result = JSON.parse(messages.at(-1).content);
      assert.match(result.error, /未知工具/);
      return call('finish', { summary: 'error handled' });
    } });
    assert.equal(round, 2);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

async function server(script, env) {
  const child = spawn(process.execPath, [script], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('startup timeout')); }, 12000);
    child.stdout.on('data', b => { log += b; const m = log.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    child.once('error', e => { clearTimeout(timer); reject(e); });
  });
  return { base, stop: () => { child.kill(); } };
}
await test('static server refuses private backend and dependency files', async () => {
  const s = await server('serve.mjs', { PORT: '0' });
  try {
    for (const target of ['/backend/publicConfig.json', '/backend/.env', '/.git/config', '/node_modules/three/package.json']) {
      const response = await fetch(s.base + target);
      assert.equal(response.status, 403, target);
    }
    assert.equal((await fetch(s.base + '/src/main.js')).status, 200);
  } finally { s.stop(); }
});
await test('malformed backend URL returns 400 and keeps server alive', async () => {
  const s = await server('backend/server.mjs', { FORMA_BACKEND_PORT: '0' });
  try {
    const status = await new Promise((resolve, reject) => {
      const req = request(s.base + '/%E0%A4%A', res => { res.resume(); resolve(res.statusCode); });
      req.once('error', reject); req.end();
    });
    assert.equal(status, 400);
    assert.equal((await fetch(s.base + '/api/health')).status, 200);
  } finally { s.stop(); }
});

await test('glTF and FBX external references cannot read outside their asset directory', async () => {
  const { analyzeBuffer } = await import('../backend/analyze.mjs');
  const { detectFbxTextures } = await import('../backend/fbxTextures.mjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forma-uri-audit-'));
  const inside = path.join(temp, 'asset');
  fs.mkdirSync(inside);
  const png = fs.readFileSync(new URL('../test-assets/fbx-textures/shipped.png', import.meta.url));
  fs.writeFileSync(path.join(temp, 'outside.png'), png);
  fs.writeFileSync(path.join(inside, 'inside.png'), png);
  try {
    const gltf = { asset: { version: '2.0' }, images: [{ uri: '../outside.png' }, { uri: 'inside.png' }], textures: [{ source: 0 }, { source: 1 }] };
    const report = await analyzeBuffer(path.join(inside, 'model.gltf'), Buffer.from(JSON.stringify(gltf)), 'gltf');
    assert.equal(report.textures[0].bytes, null);
    assert.equal(report.textures[1].bytes, png.length);
    const ascii = fs.readFileSync(new URL('../test-assets/fbx-textures/textured-ascii.fbx', import.meta.url), 'utf8');
    const escaped = detectFbxTextures(Buffer.from(ascii.replaceAll('shipped.png', '../outside.png')), { baseDir: inside });
    assert.equal(escaped.find(t => t.uri === '../outside.png').source, 'missing');
    const valid = detectFbxTextures(Buffer.from(ascii.replaceAll('shipped.png', 'inside.png')), { baseDir: inside });
    assert.equal(valid.find(t => t.uri === 'inside.png').source, 'external');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
