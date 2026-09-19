(() => {
  'use strict';

  const RELEASE = 'reader-terminal-v7.4-20260919';
  const THEME_KEY = 'magireco-call-theme-v2';
  const LEGACY_THEME_KEY = 'magireco-call-theme-v1';
  const VISUAL_KEY = 'magireco-call-visual-v7-4';
  const THEME_POS_KEY = 'magireco-call-theme-widget-v7-3';
  const JUMP_POS_KEY = 'magireco-call-jump-widget-v7-3';
  const FX_POS_KEY = 'magireco-call-fx-window-v7-3';
  const VIEWPORT_MARGIN = 10;

  const THEMES = Object.freeze([
    { key:'light', label:'明亮' },
    { key:'paper', label:'纸张' },
    { key:'green', label:'护眼' },
    { key:'dark', label:'夜间' },
    { key:'frost', label:'冷辉' }
  ]);
  const VALID_THEMES = new Set(THEMES.map(item => item.key));

  // Match MagiReader's public screen-effects model. Soft focus, bloom, jitter,
  // glass wear and frost dirt are theme material, not separate user switches.
  const EFFECT_KEYS = Object.freeze(['curvature','scanlines','noise','pixelFont','registration']);
  const EFFECT_LABELS = Object.freeze({
    curvature:'屏幕曲率模拟',
    scanlines:'扫描线',
    noise:'屏幕噪点',
    pixelFont:'像素字体',
    registration:'全局色彩偏移（文字、图标、边框）'
  });
  const DEFAULTS = Object.freeze({
    light:{ curvature:false,scanlines:false,noise:true,pixelFont:false,registration:false },
    paper:{ curvature:false,scanlines:false,noise:true,pixelFont:false,registration:false },
    green:{ curvature:false,scanlines:true,noise:true,pixelFont:false,registration:false },
    dark:{ curvature:true,scanlines:true,noise:true,pixelFont:true,registration:true },
    frost:{ curvature:true,scanlines:true,noise:true,pixelFont:true,registration:false }
  });
  const THEME_COLORS = Object.freeze({
    light:'#d8d4c6', paper:'#f3eacb', green:'#d6e9c4', dark:'#030702', frost:'#001018'
  });
  const REGISTRATION = Object.freeze({
    green:{ distance:.8, vertical:.18, mix:.86, pale:'#e3fff4', dark:'#a0eedf', paleGain:.8, darkGain:.34 },
    amber:{ distance:.8, vertical:.18, mix:.86, pale:'#fffcec', dark:'#e85c2c', paleGain:.8, darkGain:.58 },
    day:{ distance:.8, vertical:.18, mix:.76, pale:'#fffcec', dark:'#355c9a', paleGain:.24, darkGain:.14 }
  });

  const root = document.documentElement;
  const mobileQuery = matchMedia('(max-width: 760px)');
  const isIOS = (() => {
    const ua=navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
        for(const item of THEMES){
          const src=parsed.effects?.[item.key];
          if(!src || typeof src !== 'object') continue;
          for(const key of EFFECT_KEYS) if(typeof src[key] === 'boolean') effects[item.key][key]=src[key];
        }
        return {
          effects,
          phosphor:parsed.phosphor === 'amber' ? 'amber' : 'green',
          themeBarMode:parsed.themeBarMode === 'floating' ? 'floating' : 'top',
          fxOpen:Boolean(parsed.fxOpen),
          jumpCollapsed:Boolean(parsed.jumpCollapsed)
        };
      }
    }catch(_){}
    return {effects,phosphor:'green',themeBarMode:'top',fxOpen:false,jumpCollapsed:false};
  }

  const state=loadState();
  let activeTheme=storedTheme() || systemTheme();

  // First-paint state: prevent the legacy pink/white page from flashing before
  // the CRT shell is installed. The stylesheet can render the Magius boot layer
  // immediately while the body is still being parsed.
  normalizeThemeState(activeTheme);
  root.dataset.callTheme=activeTheme;
  root.dataset.callPhosphor=state.phosphor;
  root.dataset.callThemeBarMode=state.themeBarMode;
  root.dataset.callPreboot='true';
  root.style.colorScheme=(activeTheme === 'dark' || activeTheme === 'frost') ? 'dark' : 'light';
  for(const key of EFFECT_KEYS){
    root.dataset[`callFx${key[0].toUpperCase()}${key.slice(1)}`]=String(Boolean(state.effects[activeTheme]?.[key]));
  }

  function normalizeThemeState(theme){
    const effects=state.effects[theme] || (state.effects[theme]=cloneDefaults(theme));
    if(theme === 'dark'){
      effects.curvature=true;
      effects.scanlines=true;
      effects.noise=true;
      effects.registration=true;
    }
    if(theme === 'frost') effects.registration=false;
    return effects;
  }
  function persist(){ storageSet(VISUAL_KEY,JSON.stringify(state)); }
  function effectValue(key){ return Boolean(normalizeThemeState(activeTheme)[key]); }
  function setBrowserChrome(){
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta && document.head){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta);}
    if(meta) meta.content=THEME_COLORS[activeTheme] || THEME_COLORS.paper;
  }
  function currentRegistrationProfile(){
    if(activeTheme === 'dark') return REGISTRATION[state.phosphor === 'amber' ? 'amber' : 'green'];
    return REGISTRATION.day;
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
    scrollRoot.scrollTo({top:Math.max(0,scrollRoot.scrollTop + er.top - sr.top - 10),behavior});
  }

  function installDisplayRoot(){
    if(!document.body) return;
    displayRoot=document.querySelector('.call-display-root-v7');
    scrollRoot=document.querySelector('.call-display-scroll-v7');
    if(displayRoot && scrollRoot) return;

    displayRoot=document.createElement('div');
    displayRoot.className='call-display-root-v7';
    displayRoot.setAttribute('data-call-screen-root','true');

    scrollRoot=document.createElement('div');
    scrollRoot.className='call-display-scroll-v7';
    scrollRoot.setAttribute('data-call-scroll-root','true');

    for(const node of Array.from(document.body.childNodes)) scrollRoot.appendChild(node);
    displayRoot.appendChild(scrollRoot);
    document.body.appendChild(displayRoot);
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
  function makeLensMap(){
    const canvas=document.createElement('canvas'), size=512;
    canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');
    if(!ctx) return null;
    const pixels=ctx.createImageData(size,size);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const nx=x/(size-1)*2-1, ny=y/(size-1)*2-1, radial=nx*nx+ny*ny, i=(y*size+x)*4;
      pixels.data[i]=Math.round(128+nx*radial*45);
      pixels.data[i+1]=Math.round(128+ny*radial*45);
      pixels.data[i+2]=128; pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    return canvas.toDataURL('image/png');
  }
  function installOpticalFilter(){
    if(document.querySelector('.call-optics-defs-v7')) return;
    const map=makeLensMap(); if(!map) return;
    const svg=svgEl('svg',{width:0,height:0,'aria-hidden':'true'});
    svg.classList.add('call-optics-defs-v7');
    const defs=svgEl('defs');
    const filter=svgEl('filter',{id:'call-screen-optics-v7',x:'-2%',y:'-2%',width:'104%',height:'104%','color-interpolation-filters':'sRGB'});
    const image=svgEl('feImage',{href:map,x:0,y:0,width:'100%',height:'100%',preserveAspectRatio:'none',result:'lens'});

    // Scene registration copied from MagiReader.
    const red=svgEl('feColorMatrix',{in:'SourceGraphic',values:'1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1',result:'reg-red'});
    const redShift=svgEl('feOffset',{in:'reg-red',dx:'-.52',dy:'-.18',result:'reg-red-shift'});
    const green=svgEl('feColorMatrix',{in:'SourceGraphic',values:'0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1',result:'reg-green'});
    const blue=svgEl('feColorMatrix',{in:'SourceGraphic',values:'0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1',result:'reg-blue'});
    const blueShift=svgEl('feOffset',{in:'reg-blue',dx:'.8',dy:'.18',result:'reg-blue-shift'});
    const rg=svgEl('feComposite',{in:'reg-red-shift',in2:'reg-green',operator:'arithmetic',k2:1,k3:1,result:'reg-rg'});
    const rgb=svgEl('feComposite',{in:'reg-rg',in2:'reg-blue-shift',operator:'arithmetic',k2:1,k3:1,result:'reg-rgb'});
    const rgba=svgEl('feComposite',{in:'reg-rgb',in2:'SourceGraphic',operator:'in',result:'reg-rgb-alpha'});
    const registered=svgEl('feComposite',{in:'reg-rgb-alpha',in2:'SourceGraphic',operator:'arithmetic',k2:'.86',k3:'.14',result:'registeredScene'});

    const beam=svgEl('feGaussianBlur',{in:'registeredScene',stdDeviation:'.35',result:'beam'});
    const curve=svgEl('feDisplacementMap',{in:'beam',in2:'lens',scale:'50',xChannelSelector:'R',yChannelSelector:'G',result:'curvedSignal'});
    const tube=svgEl('feGaussianBlur',{in:'curvedSignal',stdDeviation:'.18',result:'tubeSignal'});
    const key=svgEl('feColorMatrix',{in:'tubeSignal',type:'matrix','color-interpolation-filters':'linearRGB',
      values:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .29764 1.00128 .10108 0 -.55',result:'emissionKey'});
    const emission=svgEl('feComposite',{in:'tubeSignal',in2:'emissionKey',operator:'in',result:'phosphorEmission','color-interpolation-filters':'linearRGB'});
    const near=svgEl('feGaussianBlur',{in:'phosphorEmission',stdDeviation:'3.5',result:'nearScatter','color-interpolation-filters':'linearRGB'});
    const nearGain=svgEl('feComponentTransfer',{in:'nearScatter',result:'nearBloom','color-interpolation-filters':'linearRGB'});
    const nearFn=svgEl('feFuncA',{type:'linear',slope:'.32'}); nearGain.appendChild(nearFn);
    const wide=svgEl('feGaussianBlur',{in:'phosphorEmission',stdDeviation:'22',result:'wideScatter','color-interpolation-filters':'linearRGB'});
    const wideGain=svgEl('feComponentTransfer',{in:'wideScatter',result:'wideBloom','color-interpolation-filters':'linearRGB'});
    const wideFn=svgEl('feFuncA',{type:'linear',slope:'.36'}); wideGain.appendChild(wideFn);
    const merge1=svgEl('feBlend',{in:'tubeSignal',in2:'nearBloom',mode:'screen',result:'litSignal'});
    const merge2=svgEl('feBlend',{in:'litSignal',in2:'wideBloom',mode:'screen',result:'originalOptics'});
    const panel=svgEl('feGaussianBlur',{in:'phosphorEmission',stdDeviation:'48',result:'panelScatter','color-interpolation-filters':'linearRGB'});
    const panelGain=svgEl('feComponentTransfer',{in:'panelScatter',result:'panelBloom','color-interpolation-filters':'linearRGB'});
    const panelFn=svgEl('feFuncA',{type:'linear',slope:'.38'}); panelGain.appendChild(panelFn);
    const finalBlend=svgEl('feBlend',{in:'originalOptics',in2:'panelBloom',mode:'screen'});

    filter.append(image,red,redShift,green,blue,blueShift,rg,rgb,rgba,registered,beam,curve,tube,key,emission,near,nearGain,wide,wideGain,merge1,merge2,panel,panelGain,finalBlend);
    defs.appendChild(filter);svg.appendChild(defs);document.body.appendChild(svg);
    opticalRefs={redShift,blueShift,registered,beam,curve,tube,nearFn,wideFn,panelFn};
  }
  function updateOpticalFilter(){
    if(!opticalRefs) return;
    const p=currentRegistrationProfile();
    const mobile=mobileQuery.matches;
    const filterCapable=!isIOS && !mobile;
    const registration=filterCapable && effectValue('registration');
    const curveOn=filterCapable && effectValue('curvature');
    const night=activeTheme === 'dark';

    opticalRefs.redShift.setAttribute('dx',String(registration ? -p.distance*.65 : 0));
    opticalRefs.redShift.setAttribute('dy',String(registration ? -p.vertical : 0));
    opticalRefs.blueShift.setAttribute('dx',String(registration ? p.distance : 0));
    opticalRefs.blueShift.setAttribute('dy',String(registration ? p.vertical : 0));
    opticalRefs.registered.setAttribute('k2',String(registration ? p.mix : 0));
    opticalRefs.registered.setAttribute('k3',String(registration ? 1-p.mix : 1));

    opticalRefs.beam.setAttribute('stdDeviation',String(curveOn ? (night ? .35 : activeTheme === 'frost' ? .2 : .12) : 0));
    opticalRefs.curve.setAttribute('scale',String(curveOn ? (mobile ? 38 : 50) : 0));
    opticalRefs.tube.setAttribute('stdDeviation',String(curveOn ? (night ? .18 : activeTheme === 'frost' ? .1 : .06) : 0));

    let near=0,wide=0,panel=0;
    if(curveOn){
      if(night){
        near=mobile ? .18 : .32;
        wide=mobile ? .14 : .36;
        panel=mobile ? .10 : .38;
      }else if(activeTheme === 'frost'){
        near=mobile ? .08 : .14;
        wide=mobile ? .06 : .12;
        panel=mobile ? .04 : .08;
      }else{
        near=mobile ? .025 : .04;
        wide=mobile ? .012 : .02;
        panel=0;
      }
    }
    opticalRefs.nearFn.setAttribute('slope',String(near));
    opticalRefs.wideFn.setAttribute('slope',String(wide));
    opticalRefs.panelFn.setAttribute('slope',String(panel));
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
    root.dataset.callOpticsActive=String(!isIOS && !mobileQuery.matches && (effectValue('curvature') || effectValue('registration')));
    setBrowserChrome();
    updateOpticalFilter();
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
      const fixed=activeTheme === 'dark' && ['curvature','scanlines','noise','registration'].includes(key);
      const hidden=activeTheme === 'frost' && key === 'registration';
      input.disabled=fixed;
      input.closest('label')?.classList.toggle('is-fixed',fixed);
      input.closest('label')?.toggleAttribute('hidden',hidden);
    }
    panel.querySelector('[data-phosphor-section]')?.toggleAttribute('hidden',activeTheme !== 'dark');
    for(const b of panel.querySelectorAll('[data-phosphor]')) b.setAttribute('aria-pressed',String(b.dataset.phosphor === state.phosphor));
    for(const b of panel.querySelectorAll('[data-themebar-mode]')) b.setAttribute('aria-pressed',String(b.dataset.themebarMode === state.themeBarMode));
  }
  function syncJump(){
    const widget=displayRoot?.querySelector('.call-jump-widget-v7');
    if(widget) widget.classList.remove('is-collapsed');
  }
  function applyAll(){applyDatasets();placeThemeBar();syncThemeButtons();syncSettings();syncJump();updateScrollbar();}

  function setTheme(theme,persistTheme=true){
    if(!VALID_THEMES.has(theme)) return activeTheme;
    activeTheme=theme;normalizeThemeState(theme);
    if(persistTheme) storageSet(THEME_KEY,theme);
    applyAll();
    try{dispatchEvent(new CustomEvent('magireco-call-theme-change',{detail:{theme}}));}catch(_){}
    return theme;
  }
  function setPhosphor(value){state.phosphor=value==='amber'?'amber':'green';persist();applyAll();}
  function setEffect(key,enabled){
    if(!EFFECT_KEYS.includes(key)) return;
    if(activeTheme === 'dark' && ['curvature','scanlines','noise','registration'].includes(key)) return;
    if(activeTheme === 'frost' && key === 'registration') return;
    state.effects[activeTheme][key]=Boolean(enabled);persist();applyAll();
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
  function resetEffects(){state.effects[activeTheme]=cloneDefaults(activeTheme);normalizeThemeState(activeTheme);persist();applyAll();}

  function installMaterialLayers(){
    if(displayRoot.querySelector('.call-reader-screen-v7')) return;
    const surface=document.createElement('div');surface.className='call-reader-screen-v7';surface.setAttribute('aria-hidden','true');
    for(const cls of [
      'call-fx-film-focus-v7','call-fx-day-grain-v7','call-fx-night-phosphor-v7','call-fx-night-grain-v7',
      'call-fx-frost-grain-v7','call-fx-frost-smudges-v7','call-fx-frost-glass-v7','call-fx-frost-wear-v7',
      'call-fx-scanlines-v7','call-fx-vignette-v7','call-fx-bezel-v7'
    ]){
      const span=document.createElement('span');span.className=cls;surface.appendChild(span);
    }
    displayRoot.appendChild(surface);
  }

  function orientationKey(base){return `${base}:${matchMedia('(orientation: portrait)').matches?'portrait':'landscape'}`;}
  function parsePoint(v){try{const p=JSON.parse(v||'null');return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}catch(_){return null;}}
  function clampPoint(node,point){
    const r=node.getBoundingClientRect(),host=displayRoot.getBoundingClientRect();
    return {
      x:Math.min(Math.max(host.left+VIEWPORT_MARGIN,point.x),Math.max(host.left+VIEWPORT_MARGIN,host.right-r.width-VIEWPORT_MARGIN)),
      y:Math.min(Math.max(host.top+VIEWPORT_MARGIN,point.y),Math.max(host.top+VIEWPORT_MARGIN,host.bottom-r.height-VIEWPORT_MARGIN))
    };
  }
  function applyPoint(node,point){
    if(!point){node.classList.remove('is-positioned');for(const p of ['left','top','right','bottom','transform']) node.style.removeProperty(p);return;}
    const p=clampPoint(node,point),host=displayRoot.getBoundingClientRect();
    node.classList.add('is-positioned');node.style.left=`${p.x-host.left}px`;node.style.top=`${p.y-host.top}px`;node.style.right='auto';node.style.bottom='auto';node.style.transform='none';
  }
  function makeDraggable(node,handle,key,enabled=()=>true,backgroundOnly=false){
    let drag=null,frame=0;
    const restore=()=>{const p=parsePoint(storageGet(orientationKey(key)));if(p)requestAnimationFrame(()=>applyPoint(node,p));};
    restore();
    handle.addEventListener('pointerdown',e=>{
      if(!enabled()) return;
      if(e.target.closest?.('button,a,input,select,textarea,summary')) return;
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const r=node.getBoundingClientRect();e.preventDefault();handle.setPointerCapture?.(e.pointerId);
      drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};node.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;e.preventDefault();
      if(frame)cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>applyPoint(node,{x:e.clientX-drag.dx,y:e.clientY-drag.dy}));
    });
    const end=(e,save)=>{
      if(!drag||drag.id!==e.pointerId)return;drag=null;node.classList.remove('is-dragging');try{handle.releasePointerCapture(e.pointerId);}catch(_){}
      if(save){const r=node.getBoundingClientRect();storageSet(orientationKey(key),JSON.stringify({x:r.left,y:r.top}));}
    };
    handle.addEventListener('pointerup',e=>end(e,true));handle.addEventListener('pointercancel',e=>end(e,false));
    handle.addEventListener('dblclick',e=>{
      if(!enabled() || e.target.closest?.('button,a,input,select,textarea,summary')) return;
      storageSet(orientationKey(key),'');applyPoint(node,null);
    });
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
    displayRoot.querySelectorAll('.call-theme-widget-v6,.call-theme-widget-v5,.call-dock-v2').forEach(n=>n.remove());
    const widget=document.createElement('div');
    widget.className='call-floating-widget-v7 call-theme-widget-v7';
    widget.setAttribute('role','toolbar');
    widget.setAttribute('aria-label','主题');
    widget.title='悬浮模式下可从控件边框空白处拖动；双击空白处恢复位置';
    const options=document.createElement('div');options.className='call-theme-options-v7';
    for(const item of THEMES){
      const b=document.createElement('button');b.type='button';b.className='call-theme-option-v7';b.dataset.callThemeOption=item.key;b.title=item.label;b.setAttribute('aria-label',`切换为${item.label}主题`);
      b.innerHTML=icon(item.key);b.addEventListener('click',()=>setTheme(item.key,true));options.appendChild(b);
    }
    const fx=document.createElement('button');fx.type='button';fx.className='call-floating-utility-v7';fx.innerHTML=settingsIcon;fx.title='画面设置';fx.setAttribute('aria-label',fx.title);
    fx.addEventListener('click',()=>{state.fxOpen=!state.fxOpen;persist();syncSettings();});
    widget.append(options,fx);
    displayRoot.appendChild(widget);
    placeThemeBar();
    makeDraggable(widget,widget,THEME_POS_KEY,()=>state.themeBarMode==='floating',true);
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
    const canonical=host.querySelector('.call-quick-rail-v10,.suite-quick-rail-v7') || rails[0] || ensureRail();
    if(canonical&&canonical.parentElement!==host)host.appendChild(canonical);
    for(const r of Array.from(document.querySelectorAll('.call-quick-rail-v10,.suite-quick-rail-v7')))if(r!==canonical)r.remove();
  }
  function installJump(){
    displayRoot.querySelectorAll('.call-jump-widget-v6,.call-jump-widget-v5').forEach(n=>n.remove());
    const widget=document.createElement('div');
    widget.className='call-floating-widget-v7 call-jump-widget-v7';
    widget.setAttribute('role','group');
    widget.setAttribute('aria-label','页面跳转工具');
    widget.title='从边框空白处拖动；双击空白处恢复位置';
    const host=document.createElement('div');host.className='call-jump-actions-v7';host.dataset.quickRailHost='true';
    widget.append(host);displayRoot.appendChild(widget);makeDraggable(widget,widget,JUMP_POS_KEY,()=>true,true);
    const rail=ensureRail();if(rail)host.appendChild(rail);adoptRail();root.dataset.callControlsReady='true';
  }

  const GLOBAL_MENU_ITEMS = Object.freeze([
    {type:'label',label:'通用'},
    {label:'称呼搜索',href:'./index.html'},
    {type:'label',label:'Magia Exedra'},
    {label:'运营时间表',href:'https://app.the-timeline.jp/2PACX-1vQSTMVQlcv7SnwCc8NZgGTKry8U5ZehODwgI-F_GPx0FWjJF0M41L_j2N3asfgtdt58NRxoIjc4NJcN'},
    {type:'label',label:'魔法纪录'},
    {label:'运营时间表',href:'https://app.the-timeline.jp/2PACX-1vTYF8Mj66tnTEhK2jPwzJzwKWJgtC0Y2-PQGIUwVbkO9csvt1IofUzv0LO0X_bjVpVgKCDyel4_jEry'},
    {label:'角色故事搜索',href:'./story.html'},
    {label:'母故事标题翻译清单（管理员）',href:'./story-title-editor.html'},
    {label:'共同出场次数排行',href:'./attendance.html'},
    {label:'魔女文翻译',href:'./runes.html'},
    {label:'称呼数据',href:'https://docs.google.com/spreadsheets/d/1V0QTP3YZsoc7h5wOC8oqg7NKJpA6ZPyck9yCYfbJGlk/'},
    {type:'label',label:'我的其他工具与动态'},
    {label:'MagiReader 中日双语剧情存档与翻译平台',href:'https://magireader.pages.dev/'},
    {label:'MAGIA EXEDRA Live2D Viewer',href:'https://magiaexedralive2dviewer.pages.dev/'},
    {label:'Exedra3D 浏览器',href:'https://magius3dviewer.pages.dev/?runtimeDelivery=release'},
    {label:'MadeInMagius / MAGIUS LINK',href:'https://hiiraginemu.github.io/madeinmagius-site/#about/profile'},
    {label:'加入QQ交流群（928098518）',href:'https://pd.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=2oaXZG3lL1g&attaContentID=e5616861ea2047e3820bf63bb854aa8e&businessType=9&from=181074&biz=ka&mainSourceId=share&subSourceId=others&b=9'},
    {label:'源文件（GitHub）',href:'https://github.com/HiiragiNemu/magireco-call-search-cn'}
  ]);
  const menuGlyph='<svg class="call-menu-glyph call-menu-glyph-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><svg class="call-menu-glyph call-menu-glyph-close" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';
  function installFloatingMenu(){
    scrollRoot.querySelectorAll('.header').forEach(node=>node.classList.add('call-legacy-menu-hidden-v8'));
    const shell=document.createElement('div');
    shell.className='call-global-menu-v8';
    const button=document.createElement('button');
    button.type='button';
    button.className='call-global-menu-button-v8';
    button.setAttribute('aria-label','打开导航菜单');
    button.setAttribute('aria-expanded','false');
    button.innerHTML=menuGlyph;
    const panel=document.createElement('nav');
    panel.className='call-global-menu-panel-v8';
    panel.setAttribute('aria-label','全站导航');
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    for(const item of GLOBAL_MENU_ITEMS){
      if(item.type === 'label'){
        const label=document.createElement('div');
        label.className='call-global-menu-label-v8';
        label.textContent='■ '+item.label;
        panel.appendChild(label);
        continue;
      }
      const a=document.createElement('a');
      a.href=item.href;
      a.textContent=item.label;
      const local=/^\.\//.test(item.href);
      if(local){
        const target=item.href.replace('./','').split('?')[0].toLowerCase();
        if(target === path || (path === '' && target === 'index.html')) a.setAttribute('aria-current','page');
      }else{
        a.target='_blank'; a.rel='noopener noreferrer';
      }
      panel.appendChild(a);
    }
    const close=()=>{
      shell.dataset.open='false';
      button.setAttribute('aria-expanded','false');
      button.setAttribute('aria-label','打开导航菜单');
    };
    button.addEventListener('click',()=>{
      const open=shell.dataset.open !== 'true';
      shell.dataset.open=String(open);
      button.setAttribute('aria-expanded',String(open));
      button.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');
    });
    panel.addEventListener('click',event=>{
      const link=event.target.closest('a');
      if(link && /^\.\//.test(link.getAttribute('href')||'')){
        root.dataset.callPreboot='true';
      }
      if(link) close();
    });
    shell.append(button,panel);
    displayRoot.appendChild(shell);
  }

  function toggleRow(key){
    const label=document.createElement('label');label.className='call-fx-toggle-row-v7';
    const span=document.createElement('span');span.textContent=EFFECT_LABELS[key];
    const input=document.createElement('input');input.type='checkbox';input.role='switch';input.dataset.fxKey=key;input.setAttribute('aria-label',EFFECT_LABELS[key]);
    input.addEventListener('change',()=>setEffect(key,input.checked));label.append(span,input);return label;
  }
  function installSettings(){
    displayRoot.querySelectorAll('.call-fx-window-v6,.call-fx-window-v5').forEach(n=>n.remove());
    const panel=document.createElement('section');panel.className='call-floating-widget-v7 call-fx-window-v7';panel.role='dialog';panel.setAttribute('aria-label','画面与字体设置');
    const titlebar=document.createElement('header');titlebar.className='call-fx-titlebar-v7';titlebar.title='拖动设置窗口';
    const copy=document.createElement('div');copy.className='call-fx-title-copy-v7';copy.innerHTML='<small>SYS://DISPLAY.CONFIG</small><strong>画面与字体效果</strong>';
    const close=document.createElement('button');close.type='button';close.className='call-fx-close-v7';close.textContent='×';close.setAttribute('aria-label','关闭设置');close.addEventListener('click',()=>{state.fxOpen=false;persist();syncSettings();});
    titlebar.append(copy,close);

    const body=document.createElement('div');body.className='call-fx-body-v7';
    const intro=document.createElement('p');intro.className='call-fx-intro-v7';intro.innerHTML='当前主题：<strong data-fx-theme-label></strong>。设置项与 MagiReader 对齐；夜间的曲率、扫描线、噪点与全局色散固定开启。';

    const phosphor=document.createElement('fieldset');phosphor.dataset.phosphorSection='true';phosphor.innerHTML='<legend>夜间磷光</legend>';
    const pseg=document.createElement('div');pseg.className='call-fx-segment-v7';
    for(const [value,label] of [['green','绿磷光'],['amber','橙磷光']]){
      const b=document.createElement('button');b.type='button';b.dataset.phosphor=value;b.textContent=label;b.addEventListener('click',()=>setPhosphor(value));pseg.appendChild(b);
    }
    phosphor.appendChild(pseg);

    const effects=document.createElement('fieldset');effects.innerHTML='<legend>屏幕与字体效果</legend>';
    for(const key of EFFECT_KEYS)effects.appendChild(toggleRow(key));

    const placement=document.createElement('fieldset');placement.innerHTML='<legend>主题栏位置</legend>';
    const placeSeg=document.createElement('div');placeSeg.className='call-fx-segment-v7';
    for(const [value,label] of [['top','顶部随页面滚动'],['floating','可拖拽悬浮']]){
      const b=document.createElement('button');b.type='button';b.dataset.themebarMode=value;b.textContent=label;b.addEventListener('click',()=>setThemeBarMode(value));placeSeg.appendChild(b);
    }
    placement.appendChild(placeSeg);

    const footer=document.createElement('footer');footer.className='call-fx-footer-v7';
    const reset=document.createElement('button');reset.type='button';reset.textContent='恢复本主题默认';reset.addEventListener('click',resetEffects);
    const done=document.createElement('button');done.type='button';done.textContent='关闭';done.addEventListener('click',()=>{state.fxOpen=false;persist();syncSettings();});
    footer.append(reset,done);
    body.append(intro,phosphor,effects,placement,footer);panel.append(titlebar,body);displayRoot.appendChild(panel);makeDraggable(panel,titlebar,FX_POS_KEY,()=>true,false);
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
    thumb.style.height=`${hh}px`;thumb.style.transform=`translateY(${travel*ratio}px)`;
  }

  function patchLegacyScroll(){
    if(typeof window.drawAndJump==='function'){
      window.drawAndJump=function(){
        if(typeof window.drawNet_Table==='function')window.drawNet_Table();
        requestAnimationFrame(()=>scrollElement(document.getElementById('mynetwork')));
        return false;
      };
    }
  }
  function observeRails(){
    let queued=false;
    new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;adoptRail();});}).observe(scrollRoot,{childList:true,subtree:false});
  }

  function finishBoot(){
    let seen=false;
    try{ seen=sessionStorage.getItem('magireco-call-magius-boot-v1') === '1'; }catch(_){}
    const delay=reducedMotion ? 80 : (seen ? 260 : 820);
    setTimeout(()=>{
      root.dataset.callPreboot='false';
      try{sessionStorage.setItem('magireco-call-magius-boot-v1','1');}catch(_){}
    },delay);
  }

  function install(){
    installDisplayRoot();
    installOpticalFilter();
    installMaterialLayers();
    installThemeBar();
    installJump();
    installFloatingMenu();
    installSettings();
    installScrollbar();
    patchLegacyScroll();
    observeRails();
    normalizeThemeState(activeTheme);
    applyAll();
    mobileQuery.addEventListener?.('change',()=>{applyAll();scheduleScrollbar();});
    addEventListener('resize',()=>{applyAll();scheduleScrollbar();},{passive:true});
    root.dataset.callThemeReady='v7.4';
    finishBoot();
    window.__MAGIRECO_CALL_THEME__=Object.freeze({
      version:'7.4',release:RELEASE,themes:THEMES.map(x=>x.key),effects:EFFECT_KEYS.slice(),
      get theme(){return activeTheme;},get phosphor(){return state.phosphor;},get themeBarMode(){return state.themeBarMode;},
      setTheme,setPhosphor,setEffect,setThemeBarMode,resetEffects
    });
  }

  if(document.body)install();
  else document.addEventListener('DOMContentLoaded',install,{once:true});
})();