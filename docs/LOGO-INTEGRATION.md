# Logo integration handoff

Ownership: this worktree owns application integration; the independent Logo workspace owns artwork. No design file, design branch or external workspace has been modified or merged. The supplied screenshot is context, not an approved deliverable.

- Single component/config: src/ui/brand.js (`BRAND`, `createBrand`, `setBrandState`, `installBrandIcon`).
- Consumers: src/ui/shell.js (shared navigation/footer), src/main.js (Gallery/Studio sidebar). Home retains its collection title and shares navigation branding.
- `BRAND.image`: approved local SVG, transparent PNG/WebP. `lockup`: both, wordmark, symbol. Sizes: nav/small. Failed image loading restores FORMA text. Default uses the unchanged old mark plus FORMA text.
- `BRAND.favicon`: optional approved icon. No new icon generated. Future loading/welcome views should call the same component.
- Styling: styles/v5.css; reserved dimensions prevent layout shift. Preserve dark-background contrast, viewBox, transparent padding and readable 22–26px symbol exports. Do not embed executable SVG as HTML; final art loads through img.
- Animation hook: `setBrandState(element, 'loading'|'ready'|'pressed'|'idle')`, `data-brand-state` and `forma:brand-state`; animation must be optional, honor reduced motion, never await navigation/model loading. No new shape-specific animation is implemented.

After user provides final files or an approved SHA: review license/artwork, copy approved files into assets/brand/, change BRAND once, register these runtime resources with tools/static-release.mjs, run quality/layout/release tests, inspect 390px and desktop screenshots, commit integration separately. Do not auto-merge a design branch.

Potential integration conflicts: src/ui/brand.js, src/ui/shell.js, src/main.js, styles/v5.css, index.html (favicon if changed), tools/static-release.mjs, docs/STATIC-MANIFEST.json. Future assets/brand/ belongs to approved-delivery integration only; coordinate before writing. Existing main checkout docs/ARCHITECTURE.md remains owner-protected.
