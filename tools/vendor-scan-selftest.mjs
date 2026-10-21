// Self-test for the module-specifier scanner used by tools/vendor-three.mjs.
// Guards two failure modes at once:
//   1. missing a real specifier (would let a non-vendored import slip through)
//   2. inventing one out of a string literal (false positive like `key: 'import'`)
import assert from 'node:assert/strict';
import { scanSpecifiers } from './vendor-three.mjs';

const cases = [
  ['static import', "import { a } from 'bad-pkg';", ['bad-pkg']],
  ['multiline import', "import {\n  a,\n  b,\n} from './x.js';", ['./x.js']],
  ['bare import', "import './poly.js';", ['./poly.js']],
  ['dynamic import', "const { v } = await import('../ui/fb.js');", ['../ui/fb.js']],
  ['star re-export', "export * from 'three';", ['three']],
  ['named re-export', "export { a } from './y.js';", ['./y.js']],
  ['string literal "import"', "{ key: 'import', tag: 'Import' }", []],
  ['endpoint path', "request('/assets/import', { method: 'POST' })", []],
  ['three addons', "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';", ['three/addons/loaders/GLTFLoader.js']],
  ['export function then code', "export function f() { return 1; }\nconst a = 2;", []],
];

let failed = 0;
for (const [name, code, want] of cases) {
  const got = scanSpecifiers(code);
  try { assert.deepEqual(got, want); console.log('[PASS] ' + name + ' -> ' + JSON.stringify(got)); }
  catch { failed++; console.log('[FAIL] ' + name + ' -> got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
}
if (failed) process.exitCode = 1;
else console.log('vendor scanner self-test: ' + cases.length + '/' + cases.length + ' passed');
