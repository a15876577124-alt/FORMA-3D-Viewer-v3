# Logo integration handoff — approved runtime integration

2026-10-24: A Spatial Monogram and Spatial Construction V2 are integrated from `forma-brand/handoff-rc1-v1` only. `assets/brand/PROVENANCE.json` pins all five copied files; `.gitattributes` preserves their exact bytes. No artwork was redrawn or merged from a design branch. V3 remains for portfolio/promotional films, as authorized by the latest user request.

- Navigation/footer: `src/ui/brand.js`, approved nav SVG (132×32 in navigation, smaller in footer), text fallback on load failure. The Studio sidebar reuses the component's text-only wordmark mode to avoid repeating a large mark. `index.html` references the approved favicon.
- Optional footer presentation: `src/ui/brandMotion.js`. Native modal, user-triggered sequential imports of exact V2 geometry/player, spatial variant, 3-second single playback, static SVG for reduced motion and load failures. Route exit/close destroys the player. No model-loading dependency.
- Replacement: copy a newly approved delivery into `assets/brand/`, update provenance/config only, run `npm run release:verify` and isolated design/quality/layout/release tests. Never edit frozen path data or the delivered animation source in place.
- Verified: real Edge static fallback, reduced-motion changes, no pre-interaction V2 download, single playback, exact final SVG paths, focus return, and standalone package. Physical phone rendering remains unverified.

## Historical RC1 reservation (superseded by integration above)

Ownership: this worktree owns application integration; the independent Logo workspace owns artwork. No design file, design branch or external workspace has been accessed, modified or merged in the RC1 portfolio pass. Design direction is approved (A Spatial Monogram; motion direction Spatial Construction), but formal SVG/animation/icon files have not been integrated. Approval of a concept is distinct from delivery of runtime files. No screenshot tracing or temporary animation was added.

- Single component/config: src/ui/brand.js (`BRAND`, `createBrand`, `setBrandState`, `installBrandIcon`).
- Consumers: src/ui/shell.js (shared navigation/footer), src/main.js (Gallery/Studio sidebar). Home retains its collection title and shares navigation branding.
- `BRAND.image`: approved local SVG, transparent PNG/WebP. `lockup`: both, wordmark, symbol. Sizes: nav/small. Failed image loading restores FORMA text. Default uses the unchanged old mark plus FORMA text.
- `BRAND.favicon`: optional approved icon. No new icon generated. Future loading/welcome views should call the same component.
- Styling: styles/v5.css; reserved dimensions prevent layout shift. Preserve dark-background contrast, viewBox, transparent padding and readable 22–26px symbol exports. Do not embed executable SVG as HTML; final art loads through img.
- Animation hook: `setBrandState(element, 'loading'|'ready'|'pressed'|'idle')`, `data-brand-state` and `forma:brand-state`; animation must be optional, honor reduced motion, never await navigation/model loading. No new shape-specific animation is implemented.

After user provides final files or an approved SHA: review license/artwork, copy approved files into assets/brand/, change BRAND once, register these runtime resources with tools/static-release.mjs, run quality/layout/release tests, inspect 390px and desktop screenshots, commit integration separately. Do not auto-merge a design branch.

Potential integration conflicts: src/ui/brand.js, src/ui/shell.js, src/main.js, styles/v5.css, index.html (favicon if changed), tools/static-release.mjs, docs/STATIC-MANIFEST.json. Future assets/brand/ belongs to approved-delivery integration only; coordinate before writing. Existing main checkout docs/ARCHITECTURE.md remains owner-protected.

Current integration branch: feature/codex-v5-rc1-polish, based on verified RC1 83453aa. The RC1 portfolio pass modified shell/contact, main, home/work and v5.css, but left brand.js and all brand artwork unchanged. Coordinate edits to these consumer/layout files when formal artwork arrives; do not auto-merge the separate design branch. Contact is now a collapsed shared-footer entry with the exact existing emails retained in src/ui/contact.js; it does not occupy Gallery or Studio.
