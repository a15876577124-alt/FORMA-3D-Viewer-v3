// Window chrome: top bar, bottom bar, help modal, mobile inspector drawer,
// fullscreen, drag & drop surface and the immersive overlay controls.
//
// Every control here calls into main through the `actions` bag; nothing reaches
// into the renderer directly, so the whole action set is one place to audit.
import { $, toast } from '../utils/dom.js';

function toggleFullscreen() {
  const target = document.getElementById('app');
  if (!document.fullscreenElement) {
    const req = target.requestFullscreen || target.webkitRequestFullscreen;
    if (req) { Promise.resolve(req.call(target)).catch(() => toast('浏览器拒绝了全屏请求', 'warn')); return true; }
    toast('当前浏览器不支持全屏', 'warn');
    return false;
  }
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit) Promise.resolve(exit.call(document)).catch(() => {});
  return false;
}

export function setupChrome(actions) {
  const on = (id, fn, ev = 'click') => { const n = $(id); if (n) n.addEventListener(ev, fn); };

  const inspectorEl = $('inspector');
  const shade = $('shade');

  function setInspector(open) {
    const narrow = window.matchMedia('(max-width: 980px)').matches;
    if (!narrow) return;
    inspectorEl.classList.toggle('open', open);
    shade.hidden = !open;
  }

  on('openInspector', () => setInspector(!inspectorEl.classList.contains('open')));
  on('closeInspector', () => setInspector(false));
  on('shade', () => setInspector(false));

  // ------------------------------------------------------------ help modal --
  on('helpBtn', () => { $('helpModal').hidden = false; });
  on('helpClose', () => { $('helpModal').hidden = true; });
  on('helpModal', (e) => { if (e.target.id === 'helpModal') $('helpModal').hidden = true; });

  // ------------------------------------------------------------- viewport --
  on('resetCamera', () => actions.resetView());
  on('resetChip', () => actions.resetView());
  on('captureTop', () => actions.capture());

  // ------------------------------------------------------------ bottom bar --
  on('captureBtn', () => actions.capture());
  on('wireframeQuick', () => actions.toggle('wireframe'));
  on('gridQuick', () => actions.toggle('grid'));
  on('plinthQuick', () => actions.toggle('plinth'));
  on('autoRotateBtn', () => actions.toggle('autoRotate'));

  // -------------------------------------------------------------- immersive --
  on('modeBtn', () => actions.toggleImmersive());
  on('immPrev', () => actions.step(-1));
  on('immNext', () => actions.step(1));
  on('immRotate', () => actions.toggle('autoRotate'));
  on('immShot', () => actions.capture());
  on('immFull', () => toggleFullscreen());
  on('immExit', () => actions.setImmersive(false));

  // Immersive chrome fades while the pointer rests, and comes straight back when
  // it moves - the model should never be competing with UI for attention.
  let idleTimer = null;
  const wake = () => {
    if (!document.body.classList.contains('mode-immersive')) return;
    document.body.classList.add('interacting');
    document.body.classList.remove('idle-chrome');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      document.body.classList.remove('interacting');
      document.body.classList.add('idle-chrome');
    }, 2400);
  };
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });

  // ------------------------------------------------------- import + dragdrop --
  const fileInput = $('fileInput');
  const openDialog = () => fileInput?.click();
  on('importZone', openDialog);
  on('importZone', (e) => { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; openDialog(); }, 'keydown');
  on('fileInput', (e) => { if (e.target.files?.length) actions.importFiles([...e.target.files]); e.target.value = ''; }, 'change');

  const overlay = $('dropOverlay');
  const view = $('viewport');
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; overlay.hidden = false; });
  window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); });
  window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    if (e.dataTransfer.files?.length) actions.importFiles([...e.dataTransfer.files]);
  });

  // ------------------------------------------------------------- feedback ----
  function syncView(state) {
    const v = state.view;
    $('wireframeQuick')?.classList.toggle('active', !!v.wireframe);
    $('gridQuick')?.classList.toggle('active', !!v.grid);
    $('plinthQuick')?.classList.toggle('active', !!v.plinth);
    $('autoRotateBtn')?.classList.toggle('active', !!v.autoRotate);
    $('immRotate')?.classList.toggle('on', !!v.autoRotate);
  }

  function setImmersiveUI(isOn) {
    if (isOn) { setInspector(false); wake(); }
    else {
      clearTimeout(idleTimer);
      document.body.classList.remove('interacting', 'idle-chrome');
    }
    $('modeBtn')?.classList.toggle('active', isOn);
  }

  document.addEventListener('fullscreenchange', () => {
    const active = !!document.fullscreenElement;
    document.body.classList.toggle('is-fullscreen', active);
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 980px)').matches) { inspectorEl.classList.remove('open'); shade.hidden = true; }
  });

  return { syncView, setImmersiveUI, toggleFullscreen, openImportDialog: openDialog };
}
