// FORMA 3D Viewer V3 - extract the five original GLBs from the V2 Base64 bundles.
// Wrapper so `npm run assets:extract` keeps working; logic lives in glbkit.mjs.
import { extract } from './glbkit.mjs';
await extract();
