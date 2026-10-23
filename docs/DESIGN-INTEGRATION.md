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

Further layout, calibration, brand and package results will be recorded as each increment is verified.
