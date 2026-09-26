(() => {
  'use strict';

  const RELEASE = 'call-ui-r12-reader-controls-20260924';
  const THEME_KEY = 'magireco-call-theme-v2';
  const LEGACY_THEME_KEY = 'magireco-call-theme-v1';
  const VISUAL_KEY = 'magireco-call-visual-v7-5';
  const THEME_POS_KEY = 'magireco-call-theme-widget-v7-5';
  const JUMP_POS_KEY = 'magireco-call-jump-widget-v7-5';
  const FX_POS_KEY = 'magireco-call-fx-window-v7-5';
  const VIEWPORT_MARGIN = 10;

  const THEMES = Object.freeze([
    { key:'light', label:'明亮' },
    { key:'paper', label:'纸张' },
    { key:'green', label:'护眼' },
    { key:'dark', label:'夜间' },
    { key:'frost', label:'冷辉' }
  ]);
  const VALID_THEMES = new Set(THEMES.map(item => item.key));

  // Static Reader materials: the scene and its grain never animate or jitter.
  const EFFECT_KEYS = Object.freeze(['curvature','scanlines','noise','pixelFont','registration','glassDamage']);
  const EFFECT_LABELS = Object.freeze({
    curvature:'屏幕曲率模拟',
    scanlines:'扫描线',
    noise:'屏幕噪点',
    pixelFont:'像素字体',
    registration:'静态色散与荧光描边',
    glassDamage:'玻璃裂纹与划痕'
  });
  const DEFAULTS = Object.freeze({
    light:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false },
    paper:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false },
    green:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false },
    dark:{ curvature:true,scanlines:true,noise:true,pixelFont:false,registration:true,glassDamage:false },
    frost:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false }
  });
  const THEME_COLORS = Object.freeze({
    light:'#d8d4c6', paper:'#f3eacb', green:'#d6e9c4', dark:'#030702', frost:'#001018'
  });

  const root = document.documentElement;
  const mobileQuery = matchMedia('(max-width: 760px)');
  const isIOS = (() => {
    const ua=navigator.userAgent || '';
    return /AppleWebKit/.test(ua) && (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  })();
  const reducedMotion = (() => {
    try { return Boolean(matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch(_) { return false; }
  })();

  let displayRoot=null;
  let scrollRoot=null;
  let opticalRefs=null;
  let scrollbarFrame=0;

  function storageGet(key){ try{return localStorage.getItem(key);}catch(_){return null;} }
  function storageSet(key,value){
    try{
      if(value == null || value === '') localStorage.removeItem(key);
      else localStorage.setItem(key,value);
      return true;
    }catch(_){return false;}
  }
  function cloneDefaults(theme){ return { ...(DEFAULTS[theme] || DEFAULTS.paper) }; }
  function storedTheme(){
    const current=storageGet(THEME_KEY);
    if(VALID_THEMES.has(current)) return current;
    const legacy=storageGet(LEGACY_THEME_KEY);
    if(legacy === 'dark' || legacy === 'light') return legacy;
    return null;
  }
  function systemTheme(){
    try{return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'paper';}
    catch(_){return 'paper';}
  }
  function loadState(){
    const effects={};
    for(const item of THEMES) effects[item.key]=cloneDefaults(item.key);
    try{
      const parsed=JSON.parse(storageGet(VISUAL_KEY) || '{}');
      if(parsed && typeof parsed === 'object'){
        effects.dark.pixelFont=parsed.phosphor === 'amber';
        for(const item of THEMES){
          const src=parsed.effects?.[item.key];
          if(!src || typeof src !== 'object') continue;
          for(const key of EFFECT_KEYS) if(typeof src[key] === 'boolean') effects[item.key][key]=src[key];
        }
        const phosphor=parsed.phosphor === 'amber' ? 'amber' : 'green';
        const nightPixelFonts={green:false,amber:true};
        for(const key of ['green','amber']){
          if(typeof parsed.nightPixelFonts?.[key] === 'boolean') nightPixelFonts[key]=parsed.nightPixelFonts[key];
        }
        if(!parsed.nightPixelFonts && typeof parsed.effects?.dark?.pixelFont === 'boolean') nightPixelFonts[phosphor]=parsed.effects.dark.pixelFont;
        effects.dark.pixelFont=nightPixelFonts[phosphor];
        return {
          effects,
          phosphor,nightPixelFonts,
          themeBarMode:parsed.themeBarMode === 'floating' ? 'floating' : 'top',
          fxOpen:Boolean(parsed.fxOpen),
          jumpCollapsed:Boolean(parsed.jumpCollapsed)
        };
      }
    }catch(_){}
    return {effects,phosphor:'green',nightPixelFonts:{green:false,amber:true},themeBarMode:'top',fxOpen:false,jumpCollapsed:false};
  }

  const state=loadState();
  let activeTheme=storedTheme() || systemTheme();

  // First-paint state: prevent the legacy pink/white page from flashing before
  // the CRT shell is installed. The stylesheet can render the Magius boot layer
  // immediately while the body is still being parsed.
  normalizeThemeState(activeTheme);
  root.dataset.callIos=String(isIOS);
  root.dataset.callIosFlat=String(isIOS);
  root.dataset.callTheme=activeTheme;
  root.dataset.callPhosphor=state.phosphor;
  root.dataset.callThemeBarMode=state.themeBarMode;
  if(!root.dataset.callPreboot) root.dataset.callPreboot='true';
  root.style.colorScheme=(activeTheme === 'dark' || activeTheme === 'frost') ? 'dark' : 'light';
  for(const key of EFFECT_KEYS){
    root.dataset[`callFx${key[0].toUpperCase()}${key.slice(1)}`]=String(effectValue(key));
  }

  function normalizeThemeState(theme){
    const effects=state.effects[theme] || (state.effects[theme]=cloneDefaults(theme));
    return effects;
  }
  function persist(){ storageSet(VISUAL_KEY,JSON.stringify(state)); }
  // Platform policy affects rendering only; retain the user preference for other devices.
  function effectValue(key){ return key === 'curvature' && isIOS ? false : Boolean(normalizeThemeState(activeTheme)[key]); }
  function setBrowserChrome(){
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta && document.head){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta);}
    if(meta) meta.content=THEME_COLORS[activeTheme] || THEME_COLORS.paper;
  }

  function rootTop(){ return scrollRoot ? scrollRoot.scrollTop : scrollY; }
  function rootHeight(){ return scrollRoot ? scrollRoot.scrollHeight : document.documentElement.scrollHeight; }
  function rootClient(){ return scrollRoot ? scrollRoot.clientHeight : innerHeight; }
  function scrollToRoot(options){ scrollRoot ? scrollRoot.scrollTo(options||{}) : scrollTo(options||{}); }
  function scrollByRoot(options){ scrollRoot ? scrollRoot.scrollBy(options||{}) : scrollBy(options||{}); }
  function scrollElement(element,behavior='smooth'){
    if(!element) return;
    if(!scrollRoot){ element.scrollIntoView({behavior,block:'start'}); return; }
    const sr=scrollRoot.getBoundingClientRect(), er=element.getBoundingClientRect();
    const stickyHeight=displayRoot.querySelector('.call-suite-nav-fixed-v12')?.getBoundingClientRect().height || 0;
    scrollRoot.scrollTo({top:Math.max(0,scrollRoot.scrollTop + er.top - sr.top - stickyHeight - 14),behavior});
  }

  function ensureBrandWatermark(){
    if(!displayRoot) return null;
    let brand=displayRoot.querySelector('.call-brand-watermark-v8');
    if(brand) return brand;
    brand=document.createElement('div');
    brand.className='call-brand-watermark-v8';
    brand.setAttribute('aria-hidden','true');

    const emblem=document.createElement('img');
    emblem.className='call-brand-emblem-v8';
    emblem.src='./myfile/magius-mark.svg?v=ui-r12-reader-controls';
    emblem.alt='';

    const wordmark=document.createElement('img');
    wordmark.className='call-brand-wordmark-v8';
    wordmark.src='./myfile/magius-link-wordmark.svg';
    wordmark.alt='';

    brand.append(emblem,wordmark);
    displayRoot.insertBefore(brand,displayRoot.firstChild);
    return brand;
  }

  function installDisplayRoot(){
    if(!document.body) return;
    displayRoot=document.querySelector('.call-display-root-v7');
    scrollRoot=document.querySelector('.call-display-scroll-v7');
    if(displayRoot && scrollRoot){ensureBrandWatermark();return;}

    displayRoot=displayRoot || document.createElement('div');
    displayRoot.className='call-display-root-v7';
    displayRoot.setAttribute('data-call-screen-root','true');

    scrollRoot=document.createElement('div');
    scrollRoot.className='call-display-scroll-v7';
    scrollRoot.setAttribute('data-call-scroll-root','true');

    for(const node of Array.from(document.body.childNodes)){
      if(node===displayRoot || node.nodeType===1 && node.matches('.call-optics-defs-v7'))continue;
      scrollRoot.appendChild(node);
    }
    displayRoot.insertBefore(scrollRoot,displayRoot.firstChild);
    scrollRoot.inert=root.dataset.callPreboot==='true';
    document.body.appendChild(displayRoot);
    ensureBrandWatermark();
    document.body.classList.add('call-screen-host-v7');

    window.__MAGIRECO_SCROLL__=Object.freeze({
      root:scrollRoot,to:scrollToRoot,by:scrollByRoot,element:scrollElement,
      get top(){return rootTop();},get height(){return rootHeight();},get clientHeight(){return rootClient();}
    });
    scrollRoot.addEventListener('scroll',scheduleScrollbar,{passive:true});
  }

  function svgEl(name,attrs={}){
    const el=document.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
    return el;
  }
  function installOpticalFilter(){
    // Shared materials apply on iOS too; only the SVG signal graph is excluded.
    opticalRefs=isIOS ? window.CallReaderOpticsV14.mountMaterials(displayRoot)
      : window.CallReaderOpticsV14.mount(displayRoot);
  }
  function updateOpticalFilter(){
    opticalRefs?.sync();
  }

  function applyDatasets(){
    normalizeThemeState(activeTheme);
    root.dataset.callTheme=activeTheme;
    root.dataset.callPhosphor=state.phosphor;
    root.dataset.callThemeBarMode=state.themeBarMode;
    root.dataset.callIos=String(isIOS);
    root.dataset.callMobile=String(mobileQuery.matches);
    root.dataset.callVisualLanguage='reader-terminal-v7';
    root.style.colorScheme=(activeTheme === 'dark' || activeTheme === 'frost') ? 'dark' : 'light';
    for(const key of EFFECT_KEYS){
      root.dataset[`callFx${key[0].toUpperCase()}${key.slice(1)}`]=String(effectValue(key));
    }
    root.dataset.callCrtEngine=isIOS ? 'native-flat' : 'static-svg';
    root.dataset.callOpticsActive=String(effectValue('curvature'));
    if(!opticalRefs) installOpticalFilter();
    setBrowserChrome();
    updateOpticalFilter();
    window.CallGlass?.sync();
  }
  function syncThemeButtons(){
    for(const b of document.querySelectorAll('[data-call-theme-option]')) b.setAttribute('aria-pressed',String(b.dataset.callThemeOption === activeTheme));
  }
  function syncSettings(){
    const panel=displayRoot?.querySelector('.call-fx-window-v7'); if(!panel) return;
    panel.hidden=!state.fxOpen;
    const name=panel.querySelector('[data-fx-theme-label]'); if(name) name.textContent=THEMES.find(x=>x.key===activeTheme)?.label || activeTheme;
    for(const input of panel.querySelectorAll('input[data-fx-key]')){
      const key=input.dataset.fxKey;
      input.checked=effectValue(key);
      const platformDisabled=isIOS && key === 'curvature';
      input.disabled=platformDisabled;
      input.closest('label')?.classList.toggle('is-fixed',platformDisabled);
      input.closest('label')?.setAttribute('data-platform-disabled',String(platformDisabled));
      if(platformDisabled) input.setAttribute('aria-describedby','call-ios-flat-note');
      input.closest('label')?.toggleAttribute('hidden',key === 'glassDamage' && activeTheme !== 'frost');
    }
    panel.querySelector('[data-phosphor-section]')?.toggleAttribute('hidden',activeTheme !== 'dark');
    for(const b of panel.querySelectorAll('[data-phosphor]')) b.setAttribute('aria-pressed',String(b.dataset.phosphor === state.phosphor));
    for(const b of panel.querySelectorAll('[data-themebar-mode]')) b.setAttribute('aria-pressed',String(b.dataset.themebarMode === state.themeBarMode));
    for(const b of document.querySelectorAll('[data-call-settings-toggle]')) b.setAttribute('aria-expanded',String(state.fxOpen));
  }
  function setSettingsOpen(open){
    state.fxOpen=Boolean(open);
    persist();
    syncSettings();
    if(open) displayRoot.querySelector('.call-fx-close-v7')?.focus({preventScroll:true});
    else document.querySelector('[data-call-settings-toggle]')?.focus({preventScroll:true});
  }
  function syncJump(){
    const widget=displayRoot?.querySelector('.call-jump-widget-v7');
    if(!widget) return;
    widget.classList.toggle('is-collapsed',Boolean(state.jumpCollapsed));
    const collapse=widget.querySelector('.call-jump-collapse-v7');
    if(collapse){
      collapse.setAttribute('aria-expanded',String(!state.jumpCollapsed));
      collapse.setAttribute('aria-label',state.jumpCollapsed?'展开页面工具':'收起页面工具');
      collapse.title=state.jumpCollapsed?'展开页面工具':'收起页面工具';
      collapse.dataset.state=state.jumpCollapsed?'collapsed':'expanded';
    }
  }
  function applyAll(){applyDatasets();placeThemeBar();syncThemeButtons();syncSettings();syncJump();updateScrollbar();}

  function setTheme(theme,persistTheme=true){
    if(!VALID_THEMES.has(theme)) return activeTheme;
    activeTheme=theme;normalizeThemeState(theme);
    if(persistTheme) storageSet(THEME_KEY,theme);
    applyAll();
    scheduleTrackingSweep();
    try{dispatchEvent(new CustomEvent('magireco-call-theme-change',{detail:{theme}}));}catch(_){}
    return theme;
  }
  function setPhosphor(value){state.phosphor=value==='amber'?'amber':'green';state.effects.dark.pixelFont=state.nightPixelFonts[state.phosphor];persist();applyAll();}
  function setEffect(key,enabled){
    if(!EFFECT_KEYS.includes(key) || (isIOS && key === 'curvature')) return;
    state.effects[activeTheme][key]=Boolean(enabled);
    if(activeTheme==='dark' && key==='pixelFont')state.nightPixelFonts[state.phosphor]=Boolean(enabled);
    persist();applyAll();scheduleTrackingSweep();
  }
  function placeThemeBar(){
    const widget=document.querySelector('.call-theme-widget-v7');
    if(!widget || !displayRoot || !scrollRoot) return;
    if(state.themeBarMode === 'floating'){
      if(widget.parentElement !== displayRoot) displayRoot.appendChild(widget);
    }else{
      storageSet(THEME_POS_KEY+':portrait','');
      storageSet(THEME_POS_KEY+':landscape','');
      widget.classList.remove('is-positioned');
      for(const p of ['left','top','right','bottom','transform']) widget.style.removeProperty(p);
      if(widget.parentElement !== scrollRoot) scrollRoot.insertBefore(widget,scrollRoot.firstChild);
    }
  }
  function setThemeBarMode(mode){
    state.themeBarMode=mode === 'floating' ? 'floating' : 'top';
    persist();
    placeThemeBar();
    applyAll();
  }
  function resetEffects(){state.effects[activeTheme]=cloneDefaults(activeTheme);if(activeTheme==='dark'){state.effects.dark.pixelFont=state.phosphor==='amber';state.nightPixelFonts[state.phosphor]=state.effects.dark.pixelFont;}normalizeThemeState(activeTheme);persist();applyAll();}

  function installMaterialLayers(){
    if(displayRoot.querySelector('.call-reader-screen-v7')) return;
    const surface=document.createElement('div');surface.className='call-reader-screen-v7';surface.setAttribute('aria-hidden','true');
    for(const cls of [
      'call-fx-day-grain-v7','call-fx-night-phosphor-v7','call-fx-night-grain-v7',
      'call-fx-frost-grain-v7','call-fx-frost-smudges-v7','call-fx-frost-glass-v7','call-fx-frost-wear-v7',
      'call-fx-scanlines-v7','call-fx-vignette-v7','call-fx-bezel-v7'
    ]){
      const span=document.createElement('span');span.className=cls;
      const direct=['call-fx-day-grain-v7','call-fx-night-phosphor-v7','call-fx-night-grain-v7','call-fx-scanlines-v7'].includes(cls);
      if(direct)span.classList.add('call-material-direct-v11');
      (direct || cls==='call-fx-bezel-v7'?displayRoot:surface).appendChild(span);
    }
    displayRoot.appendChild(surface);
  }

  function orientationKey(base){return `${base}:${matchMedia('(orientation: portrait)').matches?'portrait':'landscape'}`;}
  function parsePoint(v){
    try{
      const p=JSON.parse(v||'null');
      return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;
    }catch(_){return null;}
  }
  function clampPoint(node,point){
    const r=node.getBoundingClientRect();
    const host=displayRoot.getBoundingClientRect();
    return {
      x:Math.min(Math.max(host.left+VIEWPORT_MARGIN,point.x),Math.max(host.left+VIEWPORT_MARGIN,host.right-r.width-VIEWPORT_MARGIN)),
      y:Math.min(Math.max(host.top+VIEWPORT_MARGIN,point.y),Math.max(host.top+VIEWPORT_MARGIN,host.bottom-r.height-VIEWPORT_MARGIN))
    };
  }
  function applyPoint(node,point){
    if(!point){
      node.classList.remove('is-positioned');
      for(const p of ['left','top','right','bottom','transform']) node.style.removeProperty(p);
      return;
    }
    const p=clampPoint(node,point),host=displayRoot.getBoundingClientRect();
    node.classList.add('is-positioned');
    node.style.setProperty('left',`${p.x-host.left}px`,'important');
    node.style.setProperty('top',`${p.y-host.top}px`,'important');
    node.style.setProperty('right','auto','important');
    node.style.setProperty('bottom','auto','important');
    node.style.setProperty('transform','none','important');
  }
  function makeDraggable(node,handle,key,enabled=()=>true){
    let drag=null;
    let frame=0;
    let currentPoint=null;

    const setPoint=(point)=>{
      currentPoint=clampPoint(node,point);
      applyPoint(node,currentPoint);
    };
    const persistPoint=(point)=>{
      if(point) storageSet(orientationKey(key),JSON.stringify(point));
      else storageSet(orientationKey(key),'');
    };
    requestAnimationFrame(()=>{
      const restored=parsePoint(storageGet(orientationKey(key)));
      if(restored) setPoint(restored);
    });

    const keepInside=()=>{
      if(!currentPoint) return;
      const next=clampPoint(node,currentPoint);
      if(next.x!==currentPoint.x || next.y!==currentPoint.y){
        currentPoint=next;
        applyPoint(node,next);
        persistPoint(next);
      }
    };
    addEventListener('resize',keepInside,{passive:true});
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(keepInside);
      observer.observe(node);
    }

    const begin=(event)=>{
      if(!enabled()) return;
      if(event.pointerType==='mouse' && event.button!==0) return;
      const interactive=event.target?.closest?.('button,a,input,select,textarea,label,summary');
       if(interactive && interactive !== handle) return;
      const rect=node.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture?.(event.pointerId);
      drag={
        pointerId:event.pointerId,
        offsetX:event.clientX-rect.left,
        offsetY:event.clientY-rect.top
      };
      node.classList.add('is-dragging');
      root.dataset.callDragging='true';
    };
    const move=(event)=>{
      if(!drag || drag.pointerId!==event.pointerId) return;
      event.preventDefault();
      if(frame) cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        setPoint({
          x:event.clientX-drag.offsetX,
          y:event.clientY-drag.offsetY
        });
      });
    };
    const finish=(event,save)=>{
      if(!drag || drag.pointerId!==event.pointerId) return;
      if(frame){
        cancelAnimationFrame(frame);
        frame=0;
        if(save) setPoint({x:event.clientX-drag.offsetX,y:event.clientY-drag.offsetY});
      }
      drag=null;
      node.classList.remove('is-dragging');
      root.dataset.callDragging='false';
      try{node.releasePointerCapture(event.pointerId);}catch(_){}
      if(save) persistPoint(currentPoint);
    };

    handle.style.touchAction='none';
    handle.addEventListener('pointerdown',begin);
    node.addEventListener('pointerdown',event=>{
      if(event.target===node || event.target?.classList?.contains('call-jump-head-v7')) begin(event);
    });
    node.addEventListener('pointermove',move);
    node.addEventListener('pointerup',event=>finish(event,true));
    node.addEventListener('pointercancel',event=>finish(event,false));
    handle.addEventListener('dblclick',event=>{
      if(!enabled()) return;
      event.preventDefault();
      event.stopPropagation();
      currentPoint=null;
      persistPoint(null);
      applyPoint(node,null);
    });
  }
  function grip(label){
    const b=document.createElement('button');
    b.type='button';
    b.className='call-floating-grip-v7';
    b.title=`${label}；双击恢复默认位置`;
    b.setAttribute('aria-label',label);
    b.innerHTML='<span aria-hidden="true">⋮⋮</span>';
    return b;
  }
  function icon(key){
    const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    if(key==='light')return `<svg ${common}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>`;
    if(key==='paper')return `<svg ${common}><path d="M3.5 5.5c3.3-.8 5.8-.1 8.5 1.5v11c-2.7-1.6-5.2-2.3-8.5-1.5zM20.5 5.5c-3.3-.8-5.8-.1-8.5 1.5v11c2.7-1.6 5.2-2.3 8.5-1.5z"/></svg>`;
    if(key==='green')return `<svg ${common}><path d="M19.5 4.5C12.7 4.5 7.2 7 5.4 12.2c-1 2.9.8 5.8 3.7 5.8 5.4 0 9.1-5.7 10.4-13.5Z"/><path d="M5 20c2.1-4.3 5.4-7.4 10.2-9.4"/></svg>`;
    if(key==='dark')return `<svg ${common}><path d="M18.5 15.7A7.8 7.8 0 0 1 8.3 5.5 8 8 0 1 0 18.5 15.7Z"/></svg>`;
    return `<svg ${common}><path d="M7 3H3v4M17 3h4v4M3 17v4h4M21 17v4h-4"/><path d="M8 8h8v8H8z"/></svg>`;
  }
  const settingsIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h10M18 18h2"/><rect x="11" y="4.5" width="4" height="3"/><rect x="7" y="10.5" width="4" height="3"/><rect x="14" y="16.5" width="4" height="3"/></svg>';

  function installThemeBar(){
    displayRoot.querySelectorAll('.call-theme-widget-v6,.call-theme-widget-v5,.call-theme-dock-v2').forEach(n=>n.remove());
    const widget=document.createElement('div');
    widget.className='call-floating-widget-v7 call-theme-widget-v7';
    widget.setAttribute('role','toolbar');
    widget.setAttribute('aria-label','主题');
    const dragGrip=grip('拖动主题栏');
    dragGrip.classList.add('call-theme-grip-v7');
    const options=document.createElement('div');
    options.className='call-theme-options-v7';
    for(const item of THEMES){
      const b=document.createElement('button');
      b.type='button';
      b.className='call-theme-option-v7';
      b.dataset.callThemeOption=item.key;
      b.title=item.label;
      b.setAttribute('aria-label',`切换为${item.label}主题`);
      b.innerHTML=icon(item.key);
      b.addEventListener('click',()=>setTheme(item.key,true));
      options.appendChild(b);
    }
    const fx=document.createElement('button');
    fx.type='button';
    fx.className='call-floating-utility-v7';
    fx.innerHTML=settingsIcon;
    fx.title='画面设置';
    fx.setAttribute('aria-label',fx.title);
    fx.dataset.callSettingsToggle='true';
    fx.setAttribute('aria-controls','call-display-settings');
    fx.setAttribute('aria-expanded','false');
    fx.addEventListener('click',()=>setSettingsOpen(!state.fxOpen));
    widget.append(dragGrip,options,fx);
    displayRoot.appendChild(widget);
    placeThemeBar();
    makeDraggable(widget,dragGrip,THEME_POS_KEY,()=>state.themeBarMode==='floating');
  }

  function railIcon(action){
    const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    const icons={
      top:'<span class="call-rail-arrow" aria-hidden="true">↑</span>',
      bottom:'<span class="call-rail-arrow" aria-hidden="true">↓</span>',
      characters:`<svg ${common}><circle cx="12" cy="8" r="3"/><path d="M6 19c.8-3.5 3-5.2 6-5.2s5.2 1.7 6 5.2"/></svg>`,
      filter:`<svg ${common}><path d="M4 6h16M7 12h10M10 18h4"/></svg>`,
      attributes:`<svg ${common}><path d="M5 6h8M17 6h2M5 12h2M11 12h8M5 18h10M19 18h0"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>`,
      search:`<svg ${common}><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></svg>`,
      cancel:`<svg ${common}><path d="M6 6l12 12M18 6 6 18"/></svg>`,
      height:`<svg ${common}><path d="M8 4h8M8 20h8M12 5v14"/><path d="m9 8 3-3 3 3M9 16l3 3 3-3"/></svg>`,
      results:`<svg ${common}><path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5"/></svg>`
    };
    return icons[action] || `<svg ${common}><circle cx="12" cy="12" r="3"/></svg>`;
  }
  function normalizeRailButtons(rail){
    if(!rail) return;
    for(const button of rail.querySelectorAll('button')){
      let action=button.dataset.action || '';
      const label=(button.getAttribute('aria-label') || button.title || button.textContent || '').trim();
      if(!action){
        if(/顶部|top/i.test(label)) action='top';
        else if(/底部|bottom/i.test(label)) action='bottom';
        else if(/角色|选人/.test(label)) action='characters';
        else if(/筛选|条件/.test(label)) action='filter';
        else if(/属性/.test(label)) action='attributes';
        else if(/搜索/.test(label)) action='search';
        else if(/取消|清空/.test(label)) action='cancel';
        else if(/身高/.test(label)) action='height';
        else if(/结果/.test(label)) action='results';
      }
      if(action) button.dataset.action=action;
      if(action && button.dataset.callIconized!=='true'){
        button.innerHTML=railIcon(action);
        button.dataset.callIconized='true';
      }
    }
  }

  function ensureRail(){
    let rail=scrollRoot.querySelector('.call-quick-rail-v10,.suite-quick-rail-v7');
    if(rail)return rail;
    if(document.body.dataset.suiteTool==='runes'){
      rail=document.createElement('aside');rail.className='suite-quick-rail-v7 call-generated-rail-v7';rail.setAttribute('aria-label','页面快捷操作');
      for(const [caption,label,action,actionName] of [
        ['↑','跳到页面顶部',()=>scrollToRoot({top:0,behavior:'smooth'}),'top'],
        ['↓','跳到页面底部',()=>scrollToRoot({top:rootHeight(),behavior:'smooth'}),'bottom']
      ]){
        const b=document.createElement('button');b.type='button';b.textContent=caption;b.title=label;b.dataset.action=actionName;b.setAttribute('aria-label',label);b.addEventListener('click',action);rail.appendChild(b);
      }
      scrollRoot.appendChild(rail);
    }
    return rail;
  }
  function adoptRail(){
    const host=displayRoot.querySelector('.call-jump-widget-v7 [data-quick-rail-host]');if(!host)return;
    const rails=Array.from(document.querySelectorAll('.call-quick-rail-v10,.suite-quick-rail-v7'));
    const canonical=rails.find(rail=>rail.matches('.call-quick-rail-v10')) || host.querySelector('.suite-quick-rail-v7') || rails[0] || ensureRail();
    if(canonical&&canonical.parentElement!==host)host.appendChild(canonical);
    normalizeRailButtons(canonical);
    for(const r of Array.from(document.querySelectorAll('.call-quick-rail-v10,.suite-quick-rail-v7')))if(r!==canonical)r.remove();
  }
  function installJump(){
    displayRoot.querySelectorAll('.call-jump-widget-v6,.call-jump-widget-v5,.call-jump-widget-v7').forEach(n=>n.remove());
    const widget=document.createElement('div');
    widget.className='call-floating-widget-v7 call-jump-widget-v7';
    widget.setAttribute('role','group');
    widget.setAttribute('aria-label','页面跳转工具');

    const head=document.createElement('div');
    head.className='call-jump-head-v7';
    const dragGrip=grip('拖动页面跳转工具');
    dragGrip.classList.add('call-jump-grip-v7');

    const collapse=document.createElement('button');
    collapse.type='button';
    collapse.className='call-jump-collapse-v7';
    collapse.innerHTML='<span class="call-collapse-expanded-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M10.5 3.25 5.75 8l4.75 4.75"/></svg></span><span class="call-collapse-collapsed-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 3.5h10v9H3zM6 3.5v9M8.5 6h2.5M8.5 8h2.5M8.5 10h2.5"/></svg></span>';
    collapse.addEventListener('click',event=>{
      event.stopPropagation();
      state.jumpCollapsed=!state.jumpCollapsed;
      persist();
      syncJump();
    });
    head.append(dragGrip,collapse);

    const host=document.createElement('div');
    host.className='call-jump-actions-v7';
    host.dataset.quickRailHost='true';
    widget.append(head,host);
    displayRoot.appendChild(widget);
    makeDraggable(widget,dragGrip,JUMP_POS_KEY,()=>true);
    const rail=ensureRail();
    if(rail) host.appendChild(rail);
    adoptRail();
    syncJump();
    root.dataset.callControlsReady='true';
  }

  function toggleRow(key){
    const label=document.createElement('label');label.className='call-fx-toggle-row-v7';
    const span=document.createElement('span');span.textContent=EFFECT_LABELS[key];
    const input=document.createElement('input');input.type='checkbox';input.role='switch';input.dataset.fxKey=key;input.setAttribute('aria-label',EFFECT_LABELS[key]);
    input.addEventListener('change',()=>setEffect(key,input.checked));label.append(span,input);return label;
  }
  function installNameFilterHints(){
    for(const input of document.querySelectorAll('input.ndownword')){
      input.placeholder='输入名字或假名';
      input.setAttribute('aria-label',input.id === 'ndownword2' ? '角色名称筛选（列表下方）' : '角色名称筛选');
      const id=input.id+'-help';
      if(document.getElementById(id)) continue;
      const help=document.createElement('p');help.id=id;help.className='call-name-filter-help';
      help.textContent='支持汉字、平假名和片假名。多个关键词用空格分隔（满足任一项）；清空输入可恢复角色列表。';
      input.setAttribute('aria-describedby',id);
      input.insertAdjacentElement('afterend',help);
      input.addEventListener('input',()=>requestAnimationFrame(()=>{
        if(document.activeElement !== input) return;
        const nav=scrollRoot?.querySelector('.suite-nav');
        const visibleTop=(nav?.getBoundingClientRect().bottom || 0)+14;
        // Filtering can shorten hundreds of cards above the lower input. Keep
        // that focused input visible without scrolling any optical ancestor.
        if(input.getBoundingClientRect().top < visibleTop) scrollElement(input,'auto');
      }));
      if(input.id === 'ndownword2'){
        const group=document.createElement('section');group.className='call-name-filter-tools';group.setAttribute('aria-label','角色筛选快捷操作');
        const actions=document.createElement('div');actions.className='call-name-filter-actions';
        let node=input.previousElementSibling;const buttons=[];
        while(node?.matches('input[type="button"]')){buttons.unshift(node);node=node.previousElementSibling;}
        input.before(group);group.append(actions);actions.append(...buttons);group.append(input,help);
      }
    }
  }

  function installSettings(){
    displayRoot.querySelectorAll('.call-fx-window-v6,.call-fx-window-v5').forEach(n=>n.remove());
    const panel=document.createElement('section');panel.className='call-floating-widget-v7 call-fx-window-v7';panel.id='call-display-settings';panel.hidden=true;panel.role='dialog';panel.setAttribute('aria-label','画面与字体设置');
    const titlebar=document.createElement('header');titlebar.className='call-fx-titlebar-v7';titlebar.title='拖动设置窗口';
    const copy=document.createElement('div');copy.className='call-fx-title-copy-v7';copy.innerHTML='<small>SYS://DISPLAY.CONFIG</small><strong>画面与字体效果</strong>';
    const close=document.createElement('button');close.type='button';close.className='call-fx-close-v7';close.textContent='×';close.setAttribute('aria-label','关闭设置');close.addEventListener('click',()=>setSettingsOpen(false));
    titlebar.append(copy,close);

    const body=document.createElement('div');body.className='call-fx-body-v7';
    const intro=document.createElement('p');intro.className='call-fx-intro-v7';intro.innerHTML='当前主题：<strong data-fx-theme-label></strong>。保留静态玻璃质感；无画面抖动、滚动扫描或动态噪点。设置按主题保存。';

    const phosphor=document.createElement('fieldset');phosphor.dataset.phosphorSection='true';phosphor.innerHTML='<legend>夜间磷光</legend>';
    const pseg=document.createElement('div');pseg.className='call-fx-segment-v7';
    for(const [value,label] of [['green','绿磷光'],['amber','橙磷光']]){
      const b=document.createElement('button');b.type='button';b.dataset.phosphor=value;b.textContent=label;b.addEventListener('click',()=>setPhosphor(value));pseg.appendChild(b);
    }
    phosphor.appendChild(pseg);

    const effects=document.createElement('fieldset');effects.innerHTML='<legend>屏幕与字体效果</legend>';
    for(const key of EFFECT_KEYS)effects.appendChild(toggleRow(key));
    if(isIOS){
      const note=document.createElement('p');note.id='call-ios-flat-note';note.className='call-platform-note';
      note.textContent='iOS 已停用屏幕曲率，使用原生滚动；保留噪点、扫描线、像素字体与静态辉光。';
      effects.appendChild(note);
    }

    const placement=document.createElement('fieldset');placement.innerHTML='<legend>主题栏位置</legend>';
    const placeSeg=document.createElement('div');placeSeg.className='call-fx-segment-v7';
    for(const [value,label] of [['top','顶部随页面滚动'],['floating','可拖拽悬浮']]){
      const b=document.createElement('button');b.type='button';b.dataset.themebarMode=value;b.textContent=label;b.addEventListener('click',()=>setThemeBarMode(value));placeSeg.appendChild(b);
    }
    placement.appendChild(placeSeg);

    const footer=document.createElement('footer');footer.className='call-fx-footer-v7';
    const reset=document.createElement('button');reset.type='button';reset.textContent='恢复本主题默认';reset.addEventListener('click',resetEffects);
    const done=document.createElement('button');done.type='button';done.textContent='关闭';done.addEventListener('click',()=>setSettingsOpen(false));
    footer.append(reset,done);
    body.append(intro,phosphor,effects,placement,footer);panel.append(titlebar,body);displayRoot.appendChild(panel);makeDraggable(panel,titlebar,FX_POS_KEY,()=>true,false);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape' && state.fxOpen){event.preventDefault();setSettingsOpen(false);}
    });
  }

  function installScrollbar(){
    const rail=document.createElement('div');rail.className='call-optical-scroll-v7';rail.role='scrollbar';rail.setAttribute('aria-orientation','vertical');rail.setAttribute('aria-label','页面滚动条');rail.tabIndex=0;
    const track=document.createElement('div');track.className='call-optical-scroll-track-v7';
    const thumb=document.createElement('div');thumb.className='call-optical-scroll-thumb-v7';track.appendChild(thumb);rail.appendChild(track);displayRoot.appendChild(rail);
    let drag=null;
    const setY=y=>{const r=track.getBoundingClientRect(),h=thumb.getBoundingClientRect().height,travel=Math.max(1,r.height-h),ratio=Math.min(1,Math.max(0,(y-r.top-h/2)/travel)),max=Math.max(0,rootHeight()-rootClient());scrollToRoot({top:ratio*max,behavior:'auto'});};
    rail.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();rail.setPointerCapture?.(e.pointerId);drag=e.pointerId;setY(e.clientY);});
    rail.addEventListener('pointermove',e=>{if(drag===e.pointerId)setY(e.clientY);});
    const end=e=>{if(drag!==e.pointerId)return;drag=null;try{rail.releasePointerCapture(e.pointerId);}catch(_){}};
    rail.addEventListener('pointerup',end);rail.addEventListener('pointercancel',end);
    rail.addEventListener('keydown',e=>{const delta={ArrowDown:64,ArrowUp:-64,PageDown:rootClient()*.85,PageUp:-rootClient()*.85,Home:-1e9,End:1e9}[e.key];if(delta==null)return;e.preventDefault();scrollByRoot({top:delta,behavior:'smooth'});});
    updateScrollbar();
  }
  function scheduleScrollbar(){if(scrollbarFrame)return;scrollbarFrame=requestAnimationFrame(()=>{scrollbarFrame=0;updateScrollbar();});}
  function updateScrollbar(){
    const rail=displayRoot?.querySelector('.call-optical-scroll-v7'),thumb=rail?.querySelector('.call-optical-scroll-thumb-v7'),track=rail?.querySelector('.call-optical-scroll-track-v7');
    if(!rail||!thumb||!track)return;
    const height=rootHeight(),client=rootClient(),max=Math.max(0,height-client);rail.hidden=max<2;if(rail.hidden)return;
    const th=track.clientHeight||Math.max(1,client-44),hh=Math.max(40,Math.min(th,th*(client/height))),travel=Math.max(0,th-hh),ratio=max?Math.min(1,Math.max(0,rootTop()/max)):0;
    const h=`${hh}px`, y=`translateY(${travel*ratio}px)`;
    if(thumb.style.height!==h)thumb.style.height=h;
    if(thumb.style.transform!==y)thumb.style.transform=y;
  }

  function patchLegacyScroll(){
    // V4 owns height/relation switching, folded sections and latest-click order.
    // Replacing it here would draw into a hidden network after a height search.
    if(window.__MAGIRECO_CORRECTION_V4__?.scrollTarget) return;
    if(typeof window.drawAndJump==='function'){
      window.drawAndJump=function(){
        if(typeof window.toggleHeightView==='function')window.toggleHeightView(false);
        if(typeof window.drawNet_Table==='function')window.drawNet_Table();
        requestAnimationFrame(()=>scrollElement(document.getElementById('mynetwork')));
        return false;
      };
    }
  }
  let trackingTimer=0;
  let trackingOffTimer=0;
  function scheduleTrackingSweep(){
    clearTimeout(trackingTimer);
    clearTimeout(trackingOffTimer);
    root.dataset.callTracking='false';
    root.dataset.callTrackingMode='off';
  }

  function observeRails(){
    let queued=false;
    const queueAdopt=()=>{
      if(queued)return;
      queued=true;
      queueMicrotask(()=>{queued=false;adoptRail();});
    };
    const observer=new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node?.nodeType!==1) continue;
          if(node.matches?.('.call-quick-rail-v10,.suite-quick-rail-v7') ||
             node.querySelector?.('.call-quick-rail-v10,.suite-quick-rail-v7')){
            queueAdopt();
            return;
          }
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',queueAdopt,{once:true});
    }else{
      queueAdopt();
    }
    setTimeout(queueAdopt,0);
    setTimeout(queueAdopt,250);
  }

  function releaseBoot(reason='ready'){
    root.dataset.callBootReleased='true';
    root.dataset.callPreboot='false';root.dataset.callMaterialReady='true';
    root.dataset.callPrebootRelease=reason;
    try{sessionStorage.setItem('magireco-call-magius-boot-v1','1');}catch(_){}
  }

  function finishBoot(){
    if(window.CallLoading) window.CallLoading.release('theme');
    else releaseBoot('theme-ready');
  }

  function runInstallStep(name,fn){
    try{fn();return true;}
    catch(error){
      console.error('[theme-mode] '+name+' failed; continuing with usable page',error);
      root.dataset.callThemeError=name;
      return false;
    }
  }

  function install(){

    if(!runInstallStep('display-root',installDisplayRoot)){
      window.CallLoading?.fail('display-root-error');
      return;
    }

    runInstallStep('optical-filter',installOpticalFilter);
    runInstallStep('material-layers',installMaterialLayers);
    runInstallStep('theme-bar',installThemeBar);
    runInstallStep('jump-rail',installJump);
    runInstallStep('settings',installSettings);
    runInstallStep('name-filter-hints',installNameFilterHints);
    runInstallStep('scrollbar',installScrollbar);
    runInstallStep('legacy-scroll-patch',patchLegacyScroll);
    runInstallStep('rail-observer',observeRails);
    runInstallStep('normalize-theme',()=>normalizeThemeState(activeTheme));
    runInstallStep('apply-theme',applyAll);
    runInstallStep('tracking',scheduleTrackingSweep);

    try{
      mobileQuery.addEventListener?.('change',()=>{applyAll();scheduleScrollbar();});
      addEventListener('resize',()=>{applyAll();scheduleScrollbar();},{passive:true});
    }catch(error){
      console.error('[theme-mode] responsive listeners failed',error);
    }

    root.dataset.callThemeReady='ui-r12-reader-controls';
    finishBoot();
    window.__MAGIRECO_CALL_THEME__=Object.freeze({
      version:'ui-r12-reader-controls',release:RELEASE,themes:THEMES.map(x=>x.key),effects:EFFECT_KEYS.slice(),
      get theme(){return activeTheme;},get phosphor(){return state.phosphor;},get themeBarMode(){return state.themeBarMode;},
      setTheme,setPhosphor,setEffect,setThemeBarMode,resetEffects
    });
  }

  // Let the legacy page builders finish before moving their nodes into the
  // unified screen. This avoids body-relative inserts into an already moved tree.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
