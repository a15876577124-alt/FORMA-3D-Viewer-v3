# Phase 3 quality — scope, evidence and progress

Base: 7f133b9885466a1a1f528ce06c787775da096122. Worktree: FORMA-3D-Viewer-v3-quality; branch feature/codex-v5-quality. Main checkout and its ARCHITECTURE formatting are untouched. No final Logo artwork is imported or designed.

| Priority | Evidence / opportunity | Change / benefit | Risk / acceptance |
|---|---|---|---|
| Q1 | Existing contact is reused; small mobile copy targets, footer does not locate contact; baseline screenshots in suite-2026-10-23T10-19-54-052Z | Compact readable contact, real clipboard, direct link; single brand component | Responsive/clipboard/route/fallback tests |
| Q1 | Hero side view under reduced motion, model behind actions, undefined text tokens | Correct stable framing, separation and legible existing palette | Before/after Edge, no original asset edits |
| Q1 | Studio with no selected asset shows previous Gallery model | Explicit empty state | Enter/select/return regression |
| Q2 | Material previews have no dirty/undo scope; version metadata hard to scan | Scoped editing history and explicit saved version | Save/reload/export and asset-switch tests |
| Q3 | FBX sample has 5 input images, 2 mapped output images | Map actual channels, report unsupported semantics | Binding/data/render/round-trip evidence |
| Q3 | Agent stream depends directly on WorkBuddy client | Server-only providers, compatible streaming and diagnostics | Contract/failure/live existing-provider tests; no new credentials |
| Q4 | Origin/Host not enforced; proxy buffers unbounded; world bounds incomplete | Request controls, budgets, scene semantic checks | Adversarial requests, complex fixtures, full regressions |
| Q5 | Need repeatable release candidate | Screenshots, metrics, isolated pack | Full suite, static Gallery + local Studio separately |

Browser plugin not available; repository Puppeteer/Edge acceptance is retained. Mobile evidence is desktop emulation. WorkBuddy process state and external service qualification must be recorded, never simulated as live evidence.
