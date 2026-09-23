/* Reader 48b9d706 ReaderFilmSurface, adapted to the single Call viewport.
   Only the static mask is cached on Android. The scene is always live. */
(() => {
  'use strict';
  const root = document.documentElement;
  const scene = document.querySelector('.call-display-root-v7');
  if (!scene) return;
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.setAttribute('aria-hidden', 'true'); defs.classList.add('call-optics-defs-v7');
  defs.innerHTML = `<defs><filter id="call-glass-refraction-v12" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage href="./myfile/reader-textures/frost-glass-scratches.png" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="scratchMap"/>
    <feColorMatrix in="scratchMap" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 0" result="scratchMask"/>
    <feMorphology in="scratchMask" operator="dilate" radius=".6" result="crackZone"/>
    <feOffset in="SourceGraphic" dx="1.5" dy="-.6" result="refracted"/>
    <feComposite in="refracted" in2="crackZone" operator="in" result="crackImage"/>
    <feComposite in="SourceGraphic" in2="crackZone" operator="out" result="clearImage"/>
    <feMerge><feMergeNode in="clearImage"/><feMergeNode in="crackImage"/></feMerge>
  </filter></defs>`;
  document.body.appendChild(defs);
  const filter = defs.querySelector('filter');
  const oldWear = scene.querySelector('.call-fx-frost-wear-v7');
  const wear = document.createElement('img');
  wear.className = 'call-fx-frost-wear-v7'; wear.alt = '';
  wear.src = './myfile/reader-textures/frost-glass-scratches.png';
  oldWear?.replaceWith(wear);
  const refraction = document.createElement('div');
  refraction.className = 'call-glass-refraction-v12'; refraction.setAttribute('aria-hidden', 'true');
  scene.appendChild(refraction);
  scene.style.setProperty('--call-glass-filter-v12', 'url(#call-glass-refraction-v12)');

  let selected = null, generation = 0, cleanup = () => {}, ready = Promise.resolve();
  function sync() {
    const on = root.dataset.callTheme === 'frost' && root.dataset.callFxGlassDamage === 'true';
    if (selected === on) return ready;
    selected = on;
    const token = ++generation;
    cleanup(); cleanup = () => {};
    scene.dataset.filmReady = String(!on);
    root.dataset.callGlassActive = 'false';
    if (!on) { ready = Promise.resolve(); return ready; }
    ready = (async () => {
      // Decode the actual mounted wear image, not a second preload.
      await wear.decode();
      if (token !== generation) return;
      await new Promise(resolve => {
        cleanup = window.CallGlassCache.startCachedGlassMask(scene, filter, resolve);
      });
      if (token !== generation) return;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (token !== generation) return;
      scene.dataset.filmReady = 'true';
      root.dataset.callGlassActive = 'true';
      scene.dispatchEvent(new Event('call-film-ready'));
    })();
    // First-load failures retain the recovery UI; a later live toggle leaves
    // the previous page usable and exposes the error rather than blanking it.
    ready.catch(() => { scene.dataset.glassError = 'decode'; window.CallLoading?.fail('glass-decode'); });
    return ready;
  }
  window.CallGlass = Object.freeze({ sync });
  sync();
})();
