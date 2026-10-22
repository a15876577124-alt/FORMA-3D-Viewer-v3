// 静态发布清单：证明「公开展厅」只依赖仓库内已跟踪的文件，并给出可复现的打包命令。
//
// 背景：`assets/library/` 与 `pipeline-out/` 是后端运行期产物（用户上传处理后得到），
// 已被 .gitignore 排除。公开页面一旦引用这类本地路径，GitHub Pages 上就会出现
// 404 却仍「看起来能打开」的半死状态。本工具把「页面到底需要哪些文件」变成
// 可执行的事实，而不是文档里的口头承诺。
//
// 用法：
//   node tools/static-release.mjs                # 校验依赖闭包，写 docs/STATIC-MANIFEST.json
//   node tools/static-release.mjs --pack=dist    # 校验通过后把闭包复制到指定目录（可上传 Pages）
//   node tools/static-release.mjs --quiet        # 只报错
//
// 校验项：
//   1. index.html 引用的样式 / 图标 / 导入映射目标真实存在
//   2. 从 ./src/main.js 出发的 ES Module 依赖闭包完整（含动态 import 与 new URL）
//   3. 运行时按需加载的资产（catalog 里的 ./assets/*.glb、缩略图）存在
//   4. 闭包内每个文件都被 git 跟踪——未被跟踪说明它不会出现在远程仓库和 Pages 上
//   5. 闭包内不含 assets/library/、pipeline-out/、backend/workspace/ 等运行期目录

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const PACK = args.find((a) => a.startsWith('--pack='))?.slice(7) || null;

const problems = [];
const entries = new Map(); // absPath -> kind
const seen = new Set();
const queue = [];

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const say = (msg) => { if (!QUIET) console.log(msg); };

// 运行期产物目录：任何一项出现在闭包里都说明公开页面依赖了本地状态。
const FORBIDDEN = ['assets/library/', 'pipeline-out/', 'backend/', 'test-out/', 'assets/variants/', 'test-assets/'];

function readText(abs) {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

function addFile(abs, kind) {
  if (!entries.has(abs)) entries.set(abs, kind);
}

// ---------- 1. index.html ----------

const htmlPath = path.join(ROOT, 'index.html');
const html = readText(htmlPath);
if (html == null) {
  console.error('找不到 index.html');
  process.exit(1);
}
addFile(htmlPath, 'entry');

// 导入映射：裸说明符 -> 仓库内路径。目标相对文档基准解析（不是相对引用模块）。
const importMap = (() => {
  const m = html.match(/<script[^>]+type="importmap"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) { problems.push('index.html 缺少 importmap —— 离线包无法解析 three / postprocessing'); return {}; }
  try { return JSON.parse(m[1]).imports || {}; } catch (e) { problems.push('importmap 不是合法 JSON：' + e.message); return {}; }
})();

function fromImportMap(spec) {
  const keys = Object.keys(importMap).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (spec === key) return path.resolve(ROOT, importMap[key]);
    if (key.endsWith('/') && spec.startsWith(key)) {
      return path.resolve(ROOT, importMap[key] + spec.slice(key.length));
    }
  }
  return null;
}

for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/gi)) {
  const href = m[1];
  if (/^(https?:|data:|#|mailto:)/i.test(href)) continue;
  const abs = path.resolve(ROOT, href.replace(/^\.\//, ''));
  addFile(abs, 'html-link');
  if (abs.endsWith('.css')) queue.push(abs);
}
for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
  const src = m[1];
  if (/^(https?:|data:)/i.test(src)) continue;
  const abs = path.resolve(ROOT, src.replace(/^\.\//, ''));
  addFile(abs, 'html-script');
  if (/\.m?js$/.test(abs)) queue.push(abs);
}

// 入口是动态注入的（这是 file:// 下静默失败的防御），所以要从内联脚本里捞出 ./src/main.js
let sawEntry = false;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="importmap")[^>]*>([\s\S]*?)<\/script>/gi)) {
  for (const q of m[1].matchAll(/['"](\.\/[^'"$]+\.m?js)['"]/g)) {
    const abs = path.resolve(ROOT, q[1].slice(2));
    addFile(abs, 'entry');
    queue.push(abs);
    sawEntry = true;
  }
}
if (!sawEntry) problems.push('index.html 里找不到动态注入的入口模块（期望 ./src/main.js）');

// ---------- 2. 依赖闭包 ----------

const JS_PATTERNS = [
  // import x from '…' / import {a, b} from '…' / import '…'（含跨行）
  /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  // export … from '…'
  /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
  // import('…')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // new URL('…', import.meta.url)
  /new\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
];
const CSS_PATTERNS = [
  /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g,
  /url\(\s*['"]?([^'")]+?)['"]?\s*\)/g,
];

function resolveSpec(spec, fromAbs) {
  if (/^(https?:|data:|blob:|#)/i.test(spec)) return null;
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromAbs), spec);
  if (spec.startsWith('/')) return path.resolve(ROOT, spec.slice(1));
  const mapped = fromImportMap(spec);
  if (mapped) return mapped;
  problems.push(`无法解析的裸说明符 "${spec}"（来自 ${rel(fromAbs)}）——importmap 里没有对应条目`);
  return null;
}

function walk(abs, kind) {
  if (seen.has(abs)) return;
  seen.add(abs);
  const text = readText(abs);
  if (text == null) return;
  const patterns = kind === 'css' ? CSS_PATTERNS : JS_PATTERNS;
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const spec = m[1].trim();
      if (!spec || spec.startsWith('data:') || spec.startsWith('#')) continue;
      const target = resolveSpec(spec, abs);
      if (!target) continue;
      addFile(target, kind === 'css' ? 'css-ref' : 'module');
      if (target.endsWith('.css')) queue.push(target);
      else if (/\.m?js$/.test(target)) queue.push(target);
    }
  }
}

while (queue.length) {
  const abs = queue.shift();
  walk(abs, abs.endsWith('.css') ? 'css' : 'js');
}

// ---------- 3. 运行时按需加载的资产 ----------

// catalog.js / home3d.js / work.js 里的 './assets/…' 字面量：模块加载时不 import，
// 但展厅真正渲染时一定会请求。漏掉它们，Pages 上就是一片黑。
const ASSET_RE = /['"](\.\/assets\/[^'"$]+\.[a-z0-9]{2,5})['"]/gi;
for (const abs of [...seen]) {
  if (!/\.m?js$/.test(abs)) continue;
  const text = readText(abs) || '';
  for (const m of text.matchAll(ASSET_RE)) {
    addFile(path.resolve(ROOT, m[1].slice(2)), 'runtime-asset');
  }
}

// ---------- 4. 校验 ----------

let tracked = null;
try {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  tracked = new Set(out.split('\0').filter(Boolean));
} catch {
  problems.push('无法执行 git ls-files —— 无法确认文件是否已进入版本控制（请在仓库根目录运行）');
}

const rows = [];
let totalBytes = 0;
for (const [abs, kind] of [...entries].sort((a, b) => rel(a[0]).localeCompare(rel(b[0])))) {
  const relPath = rel(abs);
  if (relPath.startsWith('..')) { problems.push(`闭包文件跑到仓库外：${relPath}`); continue; }
  if (!fs.existsSync(abs)) { problems.push(`缺失文件（${kind}）：${relPath}`); continue; }
  const st = fs.statSync(abs);
  const buf = fs.readFileSync(abs);
  totalBytes += st.size;
  rows.push({ path: relPath, kind, bytes: st.size, sha256: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) });
  if (tracked && !tracked.has(relPath)) {
    problems.push(`未纳入版本控制：${relPath} —— 它不会出现在远程仓库 / Pages 上`);
  }
  for (const bad of FORBIDDEN) {
    if (relPath.startsWith(bad)) problems.push(`公开页面依赖了运行期目录：${relPath}（${bad}）`);
  }
}

// ---------- 5. 报告 ----------

const byKind = rows.reduce((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc; }, {});
const summary = {
  files: rows.length,
  bytes: totalBytes,
  byKind,
};

if (problems.length) {
  console.error('\n静态发布清单校验失败：');
  for (const p of problems) console.error('  ✗ ' + p);
  process.exitCode = 1;
} else {
  say(`✓ 静态依赖闭包完整：${summary.files} 个文件，共 ${(totalBytes / 1048576).toFixed(1)} MB`);
  say('  ' + Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' / '));
}

if (!problems.length) {
  const manifest = {
    note: 'FORMA 公开展厅静态发布清单。由 tools/static-release.mjs 生成，勿手工编辑。',
    entry: 'index.html',
    totals: summary,
    files: rows,
  };
  fs.mkdirSync(path.dirname(path.join(ROOT, 'docs', 'STATIC-MANIFEST.json')), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'STATIC-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  say(`  清单已写入 docs/STATIC-MANIFEST.json`);
}

if (PACK && !problems.length) {
  const dest = path.resolve(ROOT, PACK);
  if (dest === ROOT) {
    console.error('--pack 目标不能是仓库根目录');
    process.exit(1);
  }
  const packRel = path.relative(ROOT, dest);
  const inTestOutput = packRel.startsWith('test-out' + path.sep);
  if (packRel !== 'dist' && !inTestOutput) throw new Error('--pack 只允许 dist 或 test-out 内的目录');
  if (fs.existsSync(dest)) throw new Error('打包目录已存在，请选择一个新目录；不会删除已有文件');
  for (const r of rows) {
    const to = path.join(dest, r.path);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, r.path), to);
  }
  // 后端不在静态包里：明确写出边界，避免把「本地完整版」和「静态版」混为一谈。
  fs.writeFileSync(path.join(dest, 'STATIC-BUILD.json'), JSON.stringify({
    builtFrom: 'tools/static-release.mjs',
    files: rows.length,
    bytes: totalBytes,
    offlineOnly: ['后端 AI 管线（/api/*）不包含在静态包内'],
    note: '本目录可直接作为 GitHub Pages 站点根目录；不需要 assets/library 或 pipeline-out。',
  }, null, 2) + '\n');
  say(`  已打包到 ${rel(dest)}/（${rows.length} 个文件）`);
}
