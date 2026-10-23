# Approved design integration

Implementation branch: `feature/codex-v5-design-integration`. Baseline verified locally and remotely: `253a1abfe92681f4c093118eace55e6b899be339`, clean working tree on `feature/codex-v5-rc1-polish`. Original checkout and historical packages remain separate.

## Source and approval boundary

The user's 2026-10-24 integration request authorizes the delivered UX design and A · Spatial Monogram / Spatial Construction V2. V3 is reserved for portfolio/promotional film use. No React migration or original model replacement is authorized.

- UX delivery: `forma-ux-study-20261023/delivery`, 62 manifest entries checked, zero SHA-256 mismatches. Audit IDs and contracts in `03-CODEX-HANDOFF.md` govern implementation; the six exceptions in `04-FIGMA-STATUS.md` take precedence over draft screenshots.
- [Figma](https://www.figma.com/design/zQLY428emAatAhKX6kHx5m): local exported specification/screenshots available. Live metadata, design context and screenshot requests returned Starter-plan call-limit errors. This is not a current pixel-for-pixel Figma certification.
- [Gallery MagicPath](https://designs.magicpath.ai/v1/coolly-village-5093): component `464398530090504192`, verified revision `464409791289262080`.
- [Studio MagicPath](https://designs.magicpath.ai/v1/sparkling-door-6083): component `464398539863261184`, verified revision `464415968974741504`.
- Brand handoff: `forma-brand/handoff-rc1-v1`, its integrity checker passed all 99 files. Only handoff files are read; the design workspace is not modified. No logo is redrawn.

MagicPath state timers, mock versions and image-based viewports are reference interactions only. Production retains the existing native DOM, Three.js Viewer and backend workflow.

## Baseline evidence

- Portfolio: `test-out/suite-2026-10-23T16-30-55-664Z`, 43 checks passed, real Edge screenshots.
- Performance: `test-out/suite-2026-10-23T16-40-24-664Z/performance`. Home ready 1578 ms, 80 requests / 9,764,833 transferred bytes; Gallery median 4.2 ms / p95 4.3 ms; hidden/reduced-motion Hero produced zero additional draws. Measurements are single-machine observations, not mobile results.
- Corrected the performance harness to wait for the actual lazy Hero, rather than the intentionally unmounted Gallery Viewer. The initial selector correction failed before measurements; the successful run above is the baseline.

## Increment 1: G01 / S01

- Gallery settings now use a named native modal, explicit Tab wrapping, Escape, backdrop dismissal, trigger focus restoration and route cleanup. Existing material/postprocessing nodes are reused.
- Material confirmation binds a frozen asset/version/parameter request and its server token. A separate confirm/cancel action replaces the misleading generic execution instruction. Cancellation retains the draft; edits invalidate earlier consent; a busy guard prevents duplicate writes; failures do not auto-replay.
- `tools/design-ui-test.mjs` exercises real Edge focus and real isolated backend version creation, plus an explicitly injected network failure. Licensed Avocado is the only edited test model.

## Implemented design contracts

| Audit ID | Implementation | Validation |
|---|---|---|
| H01/H02 | Collection-first homepage, one Gallery primary action, five equal cards linking to their actual detail IDs; Works navigation opens the collection. Existing live Hero and deferred main Viewer remain. | Actual Hero/GLB requests, five detail/Gallery identities, route round trips. |
| A01 | Shared 14px body / 12px effective helper typography, stronger secondary text and control borders. No new font or UI framework. | Real desktop / 390 / 768 screenshots; not a claim of full WCAG certification. |
| G01/G02/G03 | Native settings dialog; actual five-model selection strip; caption and three main viewing actions; additional controls and compact-screen information move into settings with their original handlers. | Focus/Tab/Escape/return, camera aspect, mouse selection and renderer controls. |
| S01 | Confirmation freezes asset ID, base version, parameters, selection ticket and token. Cancel preserves the draft; edits invalidate consent; network failure does not replay. | Real isolated backend versions plus explicitly injected network failure and double-click tests. |
| S02/S03 | Visible Before/After labels, same-version guard, readable material aliases and original-name disclosure, exact numeric inputs alongside sliders. | Actual versions and material values; no rounding write-back. |
| S04 | Persistent asset/version/save identity, actual saving/failure states, primary save, low-frequency commands under More, mutually exclusive mobile asset/property panels. | Real save/confirmation, original import/prepare/AI/batch/export controls and resizable layout regression. |
| D01 | Shared Neutral/exposure 1/environment 0.85, common studio light implementation, identical normalization and catalogue framing. Texture capability queries now precede context disposal. | Five fixed-camera comparisons and actual detail-page screenshots. |

### Desktop scrolling

The global fixed-workspace `body` rule also locked long public pages. Public Home/Work routes now use document scrolling; Gallery/Studio retain their workspace layout. Tests use real wheel events to reach the footer, including after leaving Studio and on a 1366×768 desktop. Full-page screenshots alone are not accepted as scrolling evidence.

### Brand and contact

- `src/ui/brand.js` loads the approved A nav lockup and favicon; resource failure restores the FORMA text. Five delivered SVG/script files are preserved byte-for-byte, listed in `assets/brand/PROVENANCE.json`.
- `src/ui/brandMotion.js` lazily loads the exact V2 geometry/player only after opening the quiet footer entry. It plays once, can pause/replay, stops on close/route changes and respects reduced motion. The finished paths equal the approved static lockup. V3 is not bundled.
- Existing contact stays as one collapsed footer disclosure with the two real mailto/copy actions. Gallery/Studio have no contact overlay. No new contact module or invented identity is introduced.
- Integration ownership: `src/ui/brand.js`, `src/ui/brandMotion.js`, `src/ui/shell.js`, `styles/v5.css`, `index.html`, `assets/brand/`, `.gitattributes`, `docs/LOGO-INTEGRATION.md`. Future brand work should deliver files through a handoff; do not concurrently edit these integration files or auto-merge a design branch.

## Rendering and remaining face artifacts

Calibration uses actual Viewer and miniViewer implementations, 512×512 / DPR 1 / MSAA, identical normalized geometry, camera matrices, authored materials and texture sampling, black background, no stage/bloom/shadows. Gallery is left, Detail right in paired images. Controls are frozen; no framing or exposure adjustment is used to conceal an artifact. The page layouts have different canvas shapes and user-adjustable Gallery settings, so ordinary page screenshots are not pixel-identical comparisons.

`tools/render-calibration-test.mjs` records material/light facts, RGB differences and diagnostics. The grayscale diagnostic changes only a temporary display material; it never writes an asset. Order: authored lit / unlit base color / matte gray / interpolated normal.

- Both affected models: metalness 0, roughness 0.9036020036098448, no normal map, smooth material flag, unit-length normals. White-face forehead/eye ridges and Dan cheek/eyelid surface irregularities remain visible in gray and normal views, proving a geometry/normal-field contribution. Some patch boundaries remain in unlit base color, so the appearance is not solely lighting.
- This does **not** establish that every visible boundary is defective or that an automatic smoother can safely remove it. Facial markings have intended raised structure; indiscriminate welding/decimation risks changing the art.
- P1-05 stays partially open. No new geometry derivative was warranted by a safe, demonstrated repair in this round; all five existing portfolio GLBs and Originals remain unchanged. Next work should use region-specific artist review, topology/normal edits in a new derivative, with texture/UV preservation and the same captures.

## Acceptance boundaries

Windows Edge / NVIDIA RTX 4060 Laptop is a real desktop WebGL run. 390px/768px are desktop viewport simulations, **not phone tests**. Real iOS/Android touch, thermal behavior, long-running GPU pressure and assistive-reader testing remain open. The manual phone checklist in `RC1-PORTFOLIO-ACCEPTANCE.md` remains applicable; also verify mobile settings and reduced-motion brand behavior.

The full suite retains actual licensed GLB/FBX import, material/version processing, confirmation, export/re-import and Agent safety tests. No external AI-provider live call was made for this design round. Earlier WorkBuddy-disconnected success is historical evidence only. Complex FBX/multi-UV, worker isolation and batch recovery remain later work.

Legacy `tools/home-deck-test.mjs` describes the retired four-card home deck and is not part of `npm test`. Its current replacement is the isolated `design` group, which tests the approved five-work collection and real Studio import/save flow; it is not reported as passing.

## Final acceptance — 2026-10-24

Runtime commit: `0febd7648377f93a1fcff808270190cb97cb8b06`, pushed to `feature/codex-v5-design-integration`. The later evidence/documentation commit does not change runtime files. [Machine results and complete changed-file list](audit/design-integration-results.json); [61 screenshots with exact source hashes](evidence/design-integration/README.md).

| Check | Result |
|---|---|
| `npm test` | **35/35 groups passed**, `test-out/suite-2026-10-23T18-35-25-579Z` |
| Portfolio / quality / design / layout | **43 / 34 / 76 / 47** checks passed |
| Real licensed GLB/FBX workflow | **38** checks passed; actual processing, validation, export and re-import |
| Production visual / reference render | **13** / **61** checks passed; 5/5 actual figurines |
| `npm run release:verify` | **96 files, 30.5 MiB**, complete static closure |
| ZIP extracted and independently started | **25/25**, `test-out/suite-2026-10-23T18-39-12-490Z`; exact candidate reused, not rebuilt |

Windows / Node 24.22.0 / npm 11.19.1 / Edge 155.0.4283.62 / ANGLE NVIDIA RTX 4060 Laptop. No additional dependency or framework was installed. Full-suite provider checks are protocol/fault regressions, not a newly verified external AI connection.

### Calibration and performance

| Model | Mean RGB delta before | After |
|---|---:|---:|
| sheng | 27.5961 | 1.0269 |
| dan | 28.4407 | 0.8041 |
| jing-red | 25.2190 | 0.5216 |
| jing-yellow | 24.1050 | 1.4293 |
| jing-white | 24.7367 | 1.0753 |

Channel range is 0–255, measured over foreground pixels. Both capture rounds use MSAA; the final before run reuses the preserved pre-calibration snapshot with observation-only hooks. This supersedes the early exploratory before run with mismatched MSAA. After assertions also require matching actual light positions/intensities and authored material/texture settings; tolerance remains <1.5, not relaxed to obtain a pass.

Exact duplicated-position normals have max angular difference 0° for Dan (5,304 repeated vertices) and white-face (3,252); lengths differ from 1 by <5e-8. This is evidence that the old duplicate-normal bug is fixed, not proof that all local topology is artistically smooth.

| Same-machine measurement | Before | After |
|---|---:|---:|
| Home model ready | 1578 ms | 1626 ms |
| Home transferred bytes | 9,764,833 | 9,788,335 |
| Home requests | 80 | 84 |
| Gallery frame interval median / p95 | 4.2 / 4.3 ms | 4.2 / 4.3 ms |
| Hidden / reduced-motion Hero additional draws | 0 / 0 | 0 / 0 |

One sample per state; UI viewport areas differ and caches/system scheduling vary. The 48 ms homepage difference is not a demonstrated regression or improvement. No claim of faster backend processing is made from the incidental warm-cache analysis timings. V2 is absent from initial-page requests.

### Failures found and corrected during acceptance

- Modal tests initially clicked the retired Gallery side-panel trigger; they now use the real settings modal and wait for its visible geometry after animation. Animation controls, lights and display toggles retain their assertions through the new accessible path.
- Screenshot review found a real 768px overlap: a legacy absolute-positioned `studioTree` covered Import/Analyze. The tree now stays in sidebar flow; pointer hit-testing is asserted at every target width.
- Display/grid/plinth/speed controls initially lost their visible entry when quick controls were hidden. The original controls and Reset are now in settings, not deleted or reimplemented.
- The old whole-frame color thresholds failed when the production canvas changed from 768×718 to 856×509. The renderer test now fixes the original reference size, retains every original threshold and adds a size assertion. Actual new-layout framing/cropping remains separately tested and photographed.
- Browser media-change events are asynchronous; reduced-motion checks now wait up to 3 seconds for the actual static result before asserting. No arbitrary success delay or fake state is injected.
- Workspace smoke now expects the approved five-work collection instead of the removed four-card launcher. The real route/model assertions remain. No test group is skipped.

### Candidate and launch

New file: `test-out/FORMA-Design-RC-0febd76.zip`, **26,572,686 bytes**.

SHA256: `476418385b2e6f0f68f6aa1090ec889b5759cadcd99444c1876932e9807daba6`.

The package includes `SOURCE.json`, a binding to the source static manifest, local preview server and third-party notices. Extract, run `node serve.mjs`, then open `http://127.0.0.1:5173/#/`. It contains Home/Work/Gallery and truthful offline Studio UI; it does **not** contain the asset/AI backend. For the full local production workflow, use this source checkout and `npm start` (fresh checkout: `npm ci` first).

Old RC1/RC2 packages, Originals, `assets/raw/`, `assets/models/`, `assets/portfolio-v1/`, backend code, dependency lockfile and credentials were not changed. Original checkout remains on `feature/codex-v5-audit`; its uncommitted architecture formatting SHA256 is still `177ce7069926dae58fa57fde4ca2caad0c775c0c5198ac4f0a8c06318f21aa42`. Nothing was force-pushed, merged to main or publicly deployed.

Next high-value work is the region-specific Dan/white-face art review and physical phone/assistive-technology acceptance. Keep complex FBX/multi-UV, workers and batch recovery as separate, tested iterations rather than expanding this candidate's claims.
