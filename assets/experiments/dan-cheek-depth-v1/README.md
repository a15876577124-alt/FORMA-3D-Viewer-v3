# Dan outer-cheek trial — not selected for exhibition

Source: `assets/portfolio-v1/dan.glb`. This independent experiment moves 34 vertices in a ray-picked outer-cheek region, only along the front/back X axis; max displacement 0.00018675625324249268 source units (0.0623% of full model height). It updates incident normals, preserves topology, UVs, original texture bytes and material definitions. No triangle reduction or exposure/material change.

Current gallery catalogue remains on portfolio-v1. Improvement is too subtle to confidently promote this candidate; eyelid/cheek ridges and painted boundaries remain. See `docs/evidence/release-closeout/face-*` for eight paired actual renders, left current/right candidate, normal viewing distance and close-up, front/oblique, authored/clay.

Reproduce in an isolated snapshot: `node tests/run.mjs --only=face-candidate`. The tool refuses non-test output paths and never overwrites a target. To inspect manually, import a copy of candidate.glb into local Studio; do not replace Original.
