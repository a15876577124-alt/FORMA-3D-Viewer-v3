// Vendor a trimmed copy of three.js into ./vendor/three so the site is fully offline.
// Strategy: start from ENTRY files, then transitively resolve every *relative* import.
// Any import that is NOT relative must be the bare specifier "three" -> import map.
// A closure walk guarantees we can never forget SkeletonUtils / NURBSUtils / fflate etc.
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '..', '_tmp_three');
const TARBALL = path.join(TMP, 'three-0.186.1.tgz');
const UNPACK = path.join(TMP, 'package');
const VENDOR = path.join(ROOT, 'vendor', 'three');
const MANIFEST = path.join(VENDOR, 'VENDOR-MANIFEST.json');

export const THREE_VERSION = '0.186.1';

// Entry points we actually use in src/.
const ENTRIES = [
  'build/three.module.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/loaders/OBJLoader.js',
  'examples/jsm/loaders/MTLLoader.js',
  'examples/jsm/loaders/FBXLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
];

// Map examples/jsm/** -> vendor addons path
function jsmToVendor(rel) {
  // rel like "examples/jsm/loaders/GLTFLoader.js"
  return rel.replace(/^examples\/jsm\//, 'addons/');
}

const IMPORT_RE = /(?:^|[\s;{}()])(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

function scanSpecifiers(code) {
  const out = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(code))) {
    const s = m[1] || m[2];
    if (s) out.add(s);
  }
  return [...out];
}

async function resolveClosure(pkgRoot) {
  const visited = new Set();      // relative path inside package
  const bare = new Set();
  const queue = [...ENTRIES];
  while (queue.length) {
    const rel = queue.shift();
    if (visited.has(rel)) continue;
    const abs = path.join(pkgRoot, rel);
    let code;
    try { code = await fs.readFile(abs, 'utf8'); } catch { console.error('MISSING ENTRY/DEP: ' + rel); process.exitCode = 1; continue; }
    visited.add(rel);
    for (const spec of scanSpecifiers(code)) {
      if (spec.startsWith('.')) {
        queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
      } else {
        bare.add(spec);
      }
    }
  }
  return { visited: [...visited].sort(), bare: [...bare].sort() };
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

async function unpack() {
  if (await fs.stat(UNPACK).then(s => s.isDirectory()).catch(() => false)) return;
  await fs.mkdir(UNPACK, { recursive: true });
  // NOTE: Git-for-Windows' tar treats "D:\..." as a remote host unless --force-local.
  execFileSync('tar', ['--force-local', '-xzf', TARBALL, '-C', UNPACK, '--strip-components=1'], { stdio: 'inherit' });
}

async function install() {
  if (!(await fs.stat(TARBALL).catch(() => null))) {
    await fs.mkdir(TMP, { recursive: true });
    execFileSync('npm', ['pack', `three@${THREE_VERSION}`], { cwd: TMP, stdio: 'inherit' });
  }
  await unpack();

  const { visited, bare } = await resolveClosure(UNPACK);
  console.log(`closure: ${visited.length} files, bare specifiers: ${bare.join(', ') || '(none)'}`);

  const manifest = { version: THREE_VERSION, generator: 'tools/vendor-three.mjs', files: {} };
  for (const rel of visited) {
    const srcAbs = path.join(UNPACK, rel);
    const dstRel = rel.startsWith('build/') ? rel : jsmToVendor(rel);
    const dstAbs = path.join(VENDOR, dstRel);
    await fs.mkdir(path.dirname(dstAbs), { recursive: true });
    const buf = await fs.readFile(srcAbs);
    await fs.writeFile(dstAbs, buf);
    manifest.files[dstRel] = { bytes: buf.length, sha256: sha256(buf), from: rel };
  }
  // MIT licence text, kept for attribution compliance.
  for (const lic of ['LICENSE']) {
    const p = path.join(UNPACK, lic);
    if (await fs.stat(p).catch(() => null)) {
      const buf = await fs.readFile(p);
      const dstAbs = path.join(VENDOR, lic);
      await fs.writeFile(dstAbs, buf);
      manifest.files[lic] = { bytes: buf.length, sha256: sha256(buf), from: lic };
    }
  }
  manifest.bare = bare;
  manifest.entries = ENTRIES;
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`wrote ${Object.keys(manifest.files).length} files -> ${path.relative(ROOT, VENDOR)}`);
}

export async function check() {
  const problems = [];
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  const files = Object.keys(manifest.files);

  // 1. every manifest file exists with matching hash
  for (const rel of files) {
    const abs = path.join(VENDOR, rel);
    let buf;
    try { buf = await fs.readFile(abs); }
    catch { problems.push(`missing: vendor/three/${rel}`); continue; }
    if (sha256(buf) !== manifest.files[rel].sha256) problems.push(`hash mismatch: ${rel}`);
  }

  // 2. closure completeness inside vendor: no dangling relative imports
  const seen = new Set();
  const queue = files.filter(f => f.endsWith('.js'));
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(VENDOR, rel);
    let code;
    try { code = await fs.readFile(abs, 'utf8'); } catch { continue; }
    for (const spec of scanSpecifiers(code)) {
      if (spec.startsWith('.')) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
        if (!files.includes(target)) problems.push(`unresolved import "${spec}" in ${rel} -> expected vendor/three/${target}`);
        else queue.push(target);
      } else if (spec !== 'three' && !spec.startsWith('three/')) {
        problems.push(`forbidden bare specifier "${spec}" in ${rel}`);
      }
    }
  }

  // 3. src/ must never import anything bare except "three" / "three/addons/..."
  const SRC = path.join(ROOT, 'src');
  const walk = async (dir, acc = []) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p, acc); else if (e.name.endsWith('.js')) acc.push(p);
    }
    return acc;
  };
  let srcFiles = [];
  try { srcFiles = await walk(SRC); } catch { /* src may not exist yet */ }
  for (const f of srcFiles) {
    const code = await fs.readFile(f, 'utf8');
    for (const spec of scanSpecifiers(code)) {
      if (!spec.startsWith('.') && spec !== 'three' && !spec.startsWith('three/')) {
        problems.push(`src imports non-vendored specifier "${spec}" in ${path.relative(ROOT, f)}`);
      }
      if (spec.startsWith('three/addons/')) {
        const target = spec.slice('three/addons/'.length);
        if (!files.includes('addons/' + target)) problems.push(`src imports missing addon ${spec} in ${path.relative(ROOT, f)}`);
      }
    }
  }

  const ok = problems.length === 0;
  console.log(ok ? 'vendor check: OK' : 'vendor check: FAILED');
  problems.forEach(p => console.log('  - ' + p));
  console.log(`  files: ${files.length}, src modules scanned: ${srcFiles.length}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const SELF = path.resolve(fileURLToPath(import.meta.url));
const INVOKED = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (INVOKED === SELF) {
  const mode = process.argv[2];
  if (mode === '--check') await check();
  else await install().then(check);
}
