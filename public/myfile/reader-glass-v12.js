/* Reader 2026-09-27 ReaderFilmSurface, adapted to Call's shared live/loading root.
   Mount only enabled glass; dispose cache, viewport graph and image on disable. */
(() => {
  'use strict';
  const root=document.documentElement,scene=document.querySelector('.call-display-root-v7');
  if(!scene)return;
  const ns='http://www.w3.org/2000/svg',property='--call-glass-filter-v12';
  // Retire the old always-mounted CSS wear texture. Other film materials stay.
  scene.querySelectorAll('.call-fx-frost-wear-v7').forEach(node=>node.remove());
  let selected=null,generation=0,cleanup=()=>{},cancelPending=()=>{},ready=Promise.resolve();
  let prepared=false,activateWhenReady=false,activate=()=>{};
  function sync(on=root.dataset.callTheme==='frost'&&root.dataset.callFxGlassDamage==='true',deferActivation=false){
    activateWhenReady=on&&!deferActivation;
    if(selected===on){if(prepared&&activateWhenReady)activate();return ready;}
    selected=on;const token=++generation;
    cancelPending();cancelPending=()=>{};cleanup();cleanup=()=>{};
    prepared=false;activate=()=>{};
    root.dataset.callGlassActive='false';scene.dataset.filmReady=String(!on);
    delete scene.dataset.glassError;
    if(!on){
      scene.style.removeProperty(property);ready=Promise.resolve();
      scene.dispatchEvent(new Event('call-film-ready'));return ready;
    }
    const defs=document.createElementNS(ns,'svg');
    defs.setAttribute('width','0');defs.setAttribute('height','0');defs.setAttribute('aria-hidden','true');
    defs.classList.add('call-optics-defs-v7','call-glass-definitions-v19');
    defs.innerHTML=`<defs><filter id="call-glass-refraction-v12" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feImage href="./myfile/reader-textures/frost-glass-scratches.png" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="scratchMap"/>
      <feColorMatrix in="scratchMap" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 0" result="scratchMask"/>
      <feMorphology in="scratchMask" operator="dilate" radius=".6" result="crackZone"/>
      <feColorMatrix in="crackZone" type="matrix" values="${window.CallGlassCache.GLASS_REFRACTION_MATRIX}" result="refractionMap"/>
      <feDisplacementMap in="SourceGraphic" in2="refractionMap" scale="${window.CallGlassCache.GLASS_REFRACTION_SCALE}" xChannelSelector="R" yChannelSelector="G"/>
    </filter></defs>`;
    document.body.appendChild(defs);
    const viewport=window.CallGlassCache.mountViewportFilter(scene,defs.querySelector('filter'),property);
    const wear=document.createElement('img');wear.className='call-fx-frost-wear-v7';wear.alt='';
    wear.src='./myfile/reader-textures/frost-glass-scratches.png';scene.appendChild(wear);
    const refraction=document.createElement('div');refraction.className='call-glass-refraction-v12';
    refraction.setAttribute('aria-hidden','true');scene.appendChild(refraction);
    wear.style.visibility='hidden';refraction.style.visibility='hidden';
    activate=()=>{
      wear.style.removeProperty('visibility');refraction.style.removeProperty('visibility');
      root.dataset.callGlassActive='true';
    };
    let stopCache=()=>{},frame=0;
    cleanup=()=>{cancelAnimationFrame(frame);stopCache();viewport.dispose();defs.remove();wear.remove();refraction.remove();scene.style.removeProperty(property);};
    ready=new Promise((resolve,reject)=>{
      cancelPending=resolve;
      const publish=()=>{frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
        if(token!==generation)return;
        prepared=true;scene.dataset.filmReady='true';
        if(activateWhenReady)activate();
        scene.dispatchEvent(new Event('call-film-ready'));cancelPending=()=>{};resolve();
      });});};
      // Decode the mounted image before cache publication, matching Reader.
      (async()=>{
        await wear.decode();if(token!==generation)return;
        stopCache=window.CallGlassCache.startCachedGlassMask(scene,viewport.filter,publish);
      })().catch(error=>{if(token!==generation)return;selected=null;cleanup();cleanup=()=>{};scene.dataset.glassError='decode';window.CallLoading?.fail('glass-decode');reject(error);});
    });
    // Startup awaits the same promise. Live toggles report an error without an
    // unhandled rejection or replacing the published page with a startup cover.
    ready.catch(()=>{});return ready;
  }
  window.CallGlass=Object.freeze({sync,prepare:()=>sync(true,true)});sync();
})();
