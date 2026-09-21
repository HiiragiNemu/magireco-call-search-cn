(() => {
  'use strict';
  const root=document.documentElement;
  const cover=document.getElementById('call-loading-screen');
  if(!cover) return;
  const pending=new Set(['dom','theme']);
  const notePending=()=>{root.dataset.callLoadingPending=[...pending].map(String).join(',');};
  let active=true, failed=false, generation=0;
  const content=()=>document.querySelector('.call-display-scroll-v7');
  function reveal(reason='ready'){
    active=false; generation++; clearTimeout(watchdog);
    root.dataset.callPreboot='false'; root.dataset.callPrebootRelease=reason;
    root.dataset.callLoadingState='ready'; cover.setAttribute('aria-busy','false');
    if(content()) content().inert=false;
  }
  function fail(reason){
    if(!active) return;
    failed=true; root.dataset.callLoadingState='error'; root.dataset.callLoadingError=reason;
    cover.querySelector('.call-loading-error').hidden=false;
    cover.setAttribute('aria-busy','false');
  }
  function settle(){
    notePending();
    if(!active || failed || pending.size) return;
    const ticket=++generation;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(ticket===generation && !pending.size && !failed) reveal();
    }));
  }
  function hold(label){
    if(!active) return ()=>{};
    const token=Symbol(label);pending.add(token);generation++;notePending();
    let done=false;
    return ()=>{if(done)return;done=true;pending.delete(token);settle();};
  }
  function release(label){pending.delete(label);settle();}
  function showNavigation(){
    generation++;active=true;failed=false;pending.add('navigation');
    root.dataset.callPreboot='true';root.dataset.callLoadingState='navigation';
    cover.setAttribute('aria-busy','true');cover.querySelector('.call-loading-error').hidden=true;
    if(content()) content().inert=true;
    clearTimeout(watchdog);watchdog=setTimeout(()=>fail('navigation-timeout'),15000);
  }
  let watchdog=setTimeout(()=>fail('readiness-timeout'),15000);
  root.dataset.callLoadingState='loading';
  notePending();
  cover.querySelector('[data-loading-retry]').addEventListener('click',()=>location.reload());
  cover.querySelector('[data-loading-continue]').addEventListener('click',()=>reveal('user-continue'));
  window.CallLoading=Object.freeze({hold,release,fail,get active(){return active;}});

  // The loader and the eventual page use the SAME root, filter and material nodes.
  // Parser-time preferences already selected the theme; no loader-only defaults.
  const filter=document.getElementById('call-screen-optics-v7');
  if(root.dataset.callIosFlat==='true'){
    filter?.closest('svg')?.remove();
  }else if(filter){
    const width=document.documentElement.clientWidth, height=innerHeight;
    for(const el of [filter,filter.querySelector('feImage')]){
      el.setAttribute('width',width);el.setAttribute('height',height);
    }
    filter.querySelector('feDisplacementMap').setAttribute('scale',root.dataset.callFxCurvature==='true'?Math.round(Math.max(24,Math.min(50,Math.min(width,height)*.075))):0);
    filter.querySelector('feGaussianBlur').setAttribute('stdDeviation',root.dataset.callTheme==='dark'?'.38 .22':root.dataset.callTheme==='frost'?'.28 .18':'.08 .06');
  }
  root.dataset.callCrtEngine=root.dataset.callIosFlat==='true'?'native-flat':'static-svg';
  root.dataset.callOpticsActive=root.dataset.callFxCurvature;
  const imageReady=url=>new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error('Display asset failed: '+url));img.src=url;
  });
  async function displayReady(){
    const done=hold('display-assets');
    try{
      const urls=new Set();
      for(const el of document.querySelectorAll('.call-reader-screen-v7 span')){
        const s=getComputedStyle(el);
        if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)continue;
        for(const match of s.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g))urls.add(match[1]);
      }
      const waits=[...urls].map(imageReady);
      if(root.dataset.callTheme==='frost')waits.push(imageReady('./myfile/reader-textures/frost-phosphor-ink-mask.svg'));
      if(root.dataset.callIosFlat!=='true')waits.push(imageReady('./myfile/call-lens-v10.png'));
      if(root.dataset.callFxPixelFont==='true'&&document.fonts)waits.push(document.fonts.load('16px MagiCallPixelSC'));
      await Promise.all(waits);
      root.dataset.callLoadingAssets='ready';
    }catch(error){console.warn('[call-loading]',error);fail('display-asset');}
    finally{done();}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(content()) content().inert=true;
    displayReady();release('dom');
  },{once:true});
  const routes=new Set(['','index','index_png','story','attendance','runes','call_png','cnt','gachasim','json_open','story-title-editor']);
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const a=event.target.closest?.('a[href]');
    if(!a||a.hasAttribute('download')||(a.target&&a.target!=='_self'&&a.target!=='_top'))return;
    const url=new URL(a.href,location.href);
    if(url.origin!==location.origin||url.pathname===location.pathname)return;
    if(routes.has(url.pathname.split('/').pop().replace(/\.html$/,'')))showNavigation();
  });
  addEventListener('pageshow',event=>{if(event.persisted)reveal('bfcache');});
})();
