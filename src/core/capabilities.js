// Device tier detection. Everything expensive keys off this object so a phone
// never asks for the same GPU budget as a workstation.
const params = new URLSearchParams(location.search);

export function detectCapabilities() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const renderer = gl ? (() => {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return String(info || '').toLowerCase();
  })() : '';

  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth <= 800;
  const touchPoints = navigator.maxTouchPoints || 0;
  const mobile = narrow || (coarse && touchPoints > 0 && window.innerWidth <= 1024);

  // Software rasterisers (CI / headless SwiftShader) need the cheapest path.
  const software = /swiftshader|llvmpipe|software|basic render|angle \(google/.test(renderer);
  const testMode = params.has('test');

  const maxTexture = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
  const maxAniso = (() => {
    if (!gl) return 1;
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    return ext ? gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
  })();

  return {
    mobile,
    software,
    testMode,
    lowPower: mobile || software || testMode,
    dprCap: testMode ? 1 : (mobile ? 1.5 : 2),
    dpr: Math.min(dpr, testMode ? 1 : (mobile ? 1.5 : 2)),
    shadowMapSize: testMode ? 512 : (mobile ? 1024 : 2048),
    antialias: !testMode,
    maxTextureSize: maxTexture || 4096,
    maxAnisotropy: Math.min(8, maxAniso || 1),
    renderer,
    params,
  };
}
