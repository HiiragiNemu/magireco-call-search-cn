(() => {
  'use strict';

  const RELEASE = 'reader-terminal-fx-v6-20260919';
  const THEME_KEY = 'magireco-call-theme-v2';
  const LEGACY_THEME_KEY = 'magireco-call-theme-v1';
  const VISUAL_KEY = 'magireco-call-visual-v6';
  const THEME_POS_KEY = 'magireco-call-theme-widget-v6';
  const JUMP_POS_KEY = 'magireco-call-jump-widget-v6';
  const FX_POS_KEY = 'magireco-call-fx-window-v6';
  const VIEWPORT_MARGIN = 10;

  const THEMES = Object.freeze([
    { key:'light', label:'明亮', glyph:'☀' },
    { key:'paper', label:'纸张', glyph:'▤' },
    { key:'green', label:'护眼', glyph:'❧' },
    { key:'dark', label:'夜间', glyph:'☾' },
    { key:'frost', label:'冷辉', glyph:'▦' }
  ]);
  const VALID_THEMES = new Set(THEMES.map(item => item.key));
  const EFFECT_KEYS = Object.freeze([
    'curvature','scanlines','noise','registration','blur',
    'bloom','jitter','vignette','cracks','pixelFont'
  ]);
  const EFFECT_LABELS = Object.freeze({
    curvature:'CRT 屏幕曲面与黑边',
    scanlines:'扫描线 / 磷光栅格',
    noise:'自然胶片噪点 / 颗粒',
    registration:'全局色散 / 套色偏移',
    blur:'显像管低保真软焦',
    bloom:'磷光高亮扩散',
    jitter:'玻璃与信号轻微抖动',
    vignette:'边缘暗角 / 显像管玻璃',
    cracks:'冷辉玻璃裂纹',
    pixelFont:'Reader 像素终端字体'
  });
  const PRESETS = Object.freeze({
    light:{ curvature:false,scanlines:false,noise:false,registration:false,blur:false,bloom:false,jitter:false,vignette:false,cracks:false,pixelFont:false },
    paper:{ curvature:false,scanlines:false,noise:true,registration:false,blur:false,bloom:false,jitter:false,vignette:false,cracks:false,pixelFont:false },
    green:{ curvature:false,scanlines:true,noise:true,registration:false,blur:false,bloom:false,jitter:false,vignette:true,cracks:false,pixelFont:false },
    dark:{ curvature:true,scanlines:true,noise:true,registration:true,blur:true,bloom:true,jitter:true,vignette:true,cracks:false,pixelFont:true },
    frost:{ curvature:true,scanlines:true,noise:true,registration:true,blur:true,bloom:true,jitter:true,vignette:true,cracks:true,pixelFont:true }
  });
  const THEME_COLORS = Object.freeze({
    light:'#d8d4c6', paper:'#f3eacb', green:'#d6e9c4', dark:'#030702', frost:'#001018'
  });
  const PROFILES = Object.freeze({
    green:{ distance:.8, vertical:.18, mix:.86, pale:'#e3fff4', dark:'#a0eedf', paleGain:.8, darkGain:.34 },
    amber:{ distance:.8, vertical:.18, mix:.86, pale:'#fffcec', dark:'#e85c2c', paleGain:.8, darkGain:.58 },
    day:{ distance:.8, vertical:.18, mix:.76, pale:'#fffcec', dark:'#355c9a', paleGain:.24, darkGain:.14 }
  });

  const root = document.documentElement;
  const isIOS = (() => {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  })();
  const reduceMotion = (() => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch(_) { return false; }
  })();

  function storageGet(key){ try { return localStorage.getItem(key); } catch(_) { return null; } }
  function storageSet(key,value){
    try {
      if(value === '' || value == null) localStorage.removeItem(key);
      else localStorage.setItem(key,value);
      return true;
    } catch(_) { return false; }
  }
  function clonePreset(theme){ return { ...(PRESETS[theme] || PRESETS.paper) }; }
  function storedTheme(){
    const current=storageGet(THEME_KEY);
    if(VALID_THEMES.has(current)) return current;
    const legacy=storageGet(LEGACY_THEME_KEY);
    if(legacy === 'dark' || legacy === 'light') return legacy;
    return null;
  }
  function systemTheme(){
    try { return matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'paper'; }
    catch(_) { return 'paper'; }
  }
  function parseVisualState(){
    const effects={};
    for(const item of THEMES) effects[item.key]=clonePreset(item.key);
    try {
      const parsed=JSON.parse(storageGet(VISUAL_KEY) || '{}');
      if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
        for(const item of THEMES){
          const source=parsed.effects?.[item.key];
          if(!source || typeof source !== 'object') continue;
          for(const key of EFFECT_KEYS) if(typeof source[key] === 'boolean') effects[item.key][key]=source[key];
        }
        return {
          effects,
          phosphor:parsed.phosphor === 'amber' ? 'amber' : 'green',
          fxOpen:Boolean(parsed.fxOpen),
          jumpCollapsed:Boolean(parsed.jumpCollapsed)
        };
      }
    } catch(_) {}
    return { effects, phosphor:'green', fxOpen:false, jumpCollapsed:false };
  }

  const state=parseVisualState();
  let activeTheme=storedTheme() || systemTheme();
  let displayRoot=null;
  let scrollRoot=null;
  let opticalRefs=null;
  let scrollbarFrame=0;

  function persistVisual(){ storageSet(VISUAL_KEY,JSON.stringify(state)); }
  function effectValue(key){ return Boolean(state.effects?.[activeTheme]?.[key]); }
  function setBrowserChrome(){
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta && document.head){ meta=document.createElement('meta'); meta.name='theme-color'; document.head.appendChild(meta); }
    if(meta) meta.content=THEME_COLORS[activeTheme] || THEME_COLORS.paper;
  }
  function currentProfile(){
    if(activeTheme === 'dark') return PROFILES[state.phosphor === 'amber' ? 'amber' : 'green'];
    return PROFILES.day;
  }
  function rootScrollTop(){ return scrollRoot ? scrollRoot.scrollTop : window.scrollY; }
  function rootScrollHeight(){ return scrollRoot ? scrollRoot.scrollHeight : document.documentElement.scrollHeight; }
  function rootClientHeight(){ return scrollRoot ? scrollRoot.clientHeight : innerHeight; }
  function scrollToRoot(options){
    if(scrollRoot){
      if(typeof options === 'number') scrollRoot.scrollTo({top:options,behavior:'auto'});
      else scrollRoot.scrollTo(options || {});
      return;
    }
    window.scrollTo(options || {});
  }
  function scrollByRoot(options){
    if(scrollRoot){ scrollRoot.scrollBy(options || {}); return; }
    window.scrollBy(options || {});
  }
  function scrollElementIntoView(element, behavior='smooth'){
    if(!element) return;
    if(scrollRoot){
      const rr=scrollRoot.getBoundingClientRect();
      const er=element.getBoundingClientRect();
      const top=scrollRoot.scrollTop + er.top - rr.top - 8;
      scrollRoot.scrollTo({top:Math.max(0,top),behavior});
    }else{
      element.scrollIntoView({behavior,block:'start'});
    }
  }

  function installDisplayRoot(){
    if(!document.body) return null;
    displayRoot=document.querySelector('.call-display-root-v6');
    scrollRoot=document.querySelector('.call-display-scroll-v6');
    if(displayRoot && scrollRoot) return displayRoot;

    displayRoot=document.createElement('div');
    displayRoot.className='call-display-root-v6';
    displayRoot.setAttribute('data-call-screen-root','true');

    scrollRoot=document.createElement('div');
    scrollRoot.className='call-display-scroll-v6';
    scrollRoot.setAttribute('data-call-scroll-root','true');

    const children=Array.from(document.body.childNodes);
    for(const node of children){
      if(node.nodeType === 1 && node.matches?.('.call-optics-defs-v6')) continue;
      scrollRoot.appendChild(node);
    }
    displayRoot.appendChild(scrollRoot);
    document.body.appendChild(displayRoot);
    document.body.classList.add('call-screen-host-v6');

    window.__MAGIRECO_SCROLL__=Object.freeze({
      root:scrollRoot,
      to:scrollToRoot,
      by:scrollByRoot,
      element:scrollElementIntoView,
      get top(){ return rootScrollTop(); },
      get height(){ return rootScrollHeight(); },
      get clientHeight(){ return rootClientHeight(); }
    });

    scrollRoot.addEventListener('scroll',scheduleOpticalScrollbar,{passive:true});
    return displayRoot;
  }

  function applyDatasets(){
    root.dataset.callTheme=activeTheme;
    root.dataset.callPhosphor=state.phosphor;
    root.dataset.callIos=String(isIOS);
    root.dataset.callReducedMotion=String(reduceMotion);
    root.dataset.callVisualLanguage='reader-terminal-v6';
    root.style.colorScheme=(activeTheme === 'dark' || activeTheme === 'frost') ? 'dark' : 'light';
    for(const key of EFFECT_KEYS){
      root.dataset[`callFx${key[0].toUpperCase()}${key.slice(1)}`]=String(effectValue(key));
    }
    const filterWanted=!isIOS && ['curvature','registration','blur','bloom'].some(effectValue);
    root.dataset.callOpticsActive=String(filterWanted);
    setBrowserChrome();
    updateOpticalFilter();
  }
  function syncThemeButtons(){
    for(const button of document.querySelectorAll('[data-call-theme-option]')){
      button.setAttribute('aria-pressed',String(button.dataset.callThemeOption === activeTheme));
    }
  }
  function syncFxPanel(){
    const panel=document.querySelector('.call-fx-window-v6');
    if(!panel) return;
    panel.hidden=!state.fxOpen;
    panel.dataset.theme=activeTheme;
    const themeLabel=panel.querySelector('[data-fx-theme-label]');
    if(themeLabel) themeLabel.textContent=THEMES.find(item=>item.key===activeTheme)?.label || activeTheme;
    for(const input of panel.querySelectorAll('input[data-fx-key]')){
      const key=input.dataset.fxKey;
      input.checked=effectValue(key);
      input.disabled=key === 'cracks' && activeTheme !== 'frost';
      input.closest('label')?.classList.toggle('is-disabled',input.disabled);
    }
    panel.querySelector('[data-phosphor-section]')?.toggleAttribute('hidden',activeTheme !== 'dark');
    for(const button of panel.querySelectorAll('[data-phosphor]')){
      button.setAttribute('aria-pressed',String(button.dataset.phosphor === state.phosphor));
    }
    const note=panel.querySelector('[data-ios-note]');
    if(note) note.hidden=!isIOS;
  }
  function syncJump(){
    const widget=document.querySelector('.call-jump-widget-v6');
    if(!widget) return;
    widget.classList.toggle('is-collapsed',state.jumpCollapsed);
    const button=widget.querySelector('[data-jump-collapse]');
    if(button){
      button.textContent=state.jumpCollapsed ? '＋' : '－';
      button.title=state.jumpCollapsed ? '展开跳转工具' : '收起跳转工具';
      button.setAttribute('aria-label',button.title);
    }
  }
  function applyAll(){
    applyDatasets();
    syncThemeButtons();
    syncFxPanel();
    syncJump();
    updateOpticalScrollbar();
  }
  function setTheme(theme,persist=true){
    if(!VALID_THEMES.has(theme)) return activeTheme;
    activeTheme=theme;
    if(!state.effects[theme]) state.effects[theme]=clonePreset(theme);
    if(persist) storageSet(THEME_KEY,theme);
    applyAll();
    try{ dispatchEvent(new CustomEvent('magireco-call-theme-change',{detail:{theme}})); }catch(_){}
    return theme;
  }
  function setPhosphor(value){ state.phosphor=value === 'amber' ? 'amber' : 'green'; persistVisual(); applyAll(); }
  function setEffect(key,enabled){
    if(!EFFECT_KEYS.includes(key)) return;
    state.effects[activeTheme][key]=Boolean(enabled);
    persistVisual(); applyAll();
  }
  function resetEffects(){ state.effects[activeTheme]=clonePreset(activeTheme); persistVisual(); applyAll(); }

  function svgEl(name,attrs={}){
    const el=document.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
    return el;
  }
  function makeLensMap(){
    try{
      const canvas=document.createElement('canvas');
      const size=512;
      canvas.width=canvas.height=size;
      const ctx=canvas.getContext('2d');
      if(!ctx) return null;
      const pixels=ctx.createImageData(size,size);
      for(let y=0;y<size;y++) for(let x=0;x<size;x++){
        const nx=x/(size-1)*2-1, ny=y/(size-1)*2-1;
        const radial=nx*nx+ny*ny;
        const i=(y*size+x)*4;
        pixels.data[i]=Math.round(128+nx*radial*45);
        pixels.data[i+1]=Math.round(128+ny*radial*45);
        pixels.data[i+2]=128;
        pixels.data[i+3]=255;
      }
      ctx.putImageData(pixels,0,0);
      return canvas.toDataURL();
    }catch(_){ return null; }
  }
  function appendComponentLinear(parent, slope, intercept, result){
    const transfer=svgEl('feComponentTransfer',{in:parent,result});
    const fn=svgEl('feFuncA',{type:'linear',slope,intercept});
    transfer.appendChild(fn);
    return {transfer,fn};
  }

  function installOpticalFilter(){
    if(document.querySelector('.call-optics-defs-v6')) return;
    const map=makeLensMap();
    if(!map) return;

    const svg=svgEl('svg',{width:0,height:0,'aria-hidden':'true'});
    svg.classList.add('call-optics-defs-v6');
    svg.style.position='absolute';
    svg.style.pointerEvents='none';

    const defs=svgEl('defs');
    const filter=svgEl('filter',{
      id:'call-screen-optics-v6',x:'-3%',y:'-3%',width:'106%',height:'106%','color-interpolation-filters':'sRGB'
    });

    const image=svgEl('feImage',{href:map,x:0,y:0,width:'100%',height:'100%',preserveAspectRatio:'none',result:'lens'});

    const red=svgEl('feColorMatrix',{in:'SourceGraphic',values:'1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1',result:'reg-red'});
    const redShift=svgEl('feOffset',{in:'reg-red',dx:'-.52',dy:'-.18',result:'reg-red-shift'});
    const green=svgEl('feColorMatrix',{in:'SourceGraphic',values:'0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1',result:'reg-green'});
    const blue=svgEl('feColorMatrix',{in:'SourceGraphic',values:'0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1',result:'reg-blue'});
    const blueShift=svgEl('feOffset',{in:'reg-blue',dx:'.8',dy:'.18',result:'reg-blue-shift'});
    const rg=svgEl('feComposite',{in:'reg-red-shift',in2:'reg-green',operator:'arithmetic',k2:'1',k3:'1',result:'reg-rg'});
    const rgb=svgEl('feComposite',{in:'reg-rg',in2:'reg-blue-shift',operator:'arithmetic',k2:'1',k3:'1',result:'reg-rgb'});
    const rgbAlpha=svgEl('feComposite',{in:'reg-rgb',in2:'SourceGraphic',operator:'in',result:'reg-rgb-alpha'});
    const registered=svgEl('feComposite',{in:'reg-rgb-alpha',in2:'SourceGraphic',operator:'arithmetic',k2:'.86',k3:'.14',result:'reg-registered'});

    const warmKey=svgEl('feColorMatrix',{in:'SourceGraphic',values:'0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .5 .5 -1 0 0',result:'reg-warm-key'});
    const warmShift=svgEl('feOffset',{in:'reg-warm-key',dx:'-.8',result:'reg-warm-shift'});
    const paleEdge=svgEl('feComposite',{in:'reg-warm-key',in2:'reg-warm-shift',operator:'arithmetic',k2:'1',k3:'-1',result:'reg-pale-edge'});
    const paleEcho=svgEl('feOffset',{in:'reg-pale-edge',dx:'.8',result:'reg-pale-echo'});
    const paleMask=svgEl('feComponentTransfer',{in:'reg-pale-echo',result:'reg-pale-mask'});
    const paleMaskFn=svgEl('feFuncA',{type:'linear',slope:'2'}); paleMask.appendChild(paleMaskFn);
    const inverseEdge=svgEl('feComposite',{in:'reg-warm-shift',in2:'reg-warm-key',operator:'arithmetic',k2:'1',k3:'-1',result:'reg-inverse-edge'});
    const paleFlood=svgEl('feFlood',{'flood-color':'#e3fff4','flood-opacity':'.8',result:'reg-pale'});
    const paleRim=svgEl('feComposite',{in:'reg-pale',in2:'reg-pale-mask',operator:'in',result:'reg-pale-rim'});
    const inverseFlood=svgEl('feFlood',{'flood-color':'#a0eedf','flood-opacity':'.34',result:'reg-inverse'});
    const inverseRim=svgEl('feComposite',{in:'reg-inverse',in2:'reg-inverse-edge',operator:'in',result:'reg-inverse-rim'});
    const fringed=svgEl('feMerge',{result:'reg-fringed'});
    fringed.append(svgEl('feMergeNode',{in:'reg-registered'}),svgEl('feMergeNode',{in:'reg-pale-rim'}),svgEl('feMergeNode',{in:'reg-inverse-rim'}));

    const luma=svgEl('feColorMatrix',{in:'SourceGraphic',values:'0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 0',result:'reg-luma'});
    const surround=svgEl('feGaussianBlur',{in:'reg-luma',stdDeviation:'5',result:'reg-surround'});
    const plate=svgEl('feComponentTransfer',{in:'reg-surround',result:'reg-plate'});
    plate.appendChild(svgEl('feFuncA',{type:'linear',slope:'5',intercept:'-2'}));
    const darkInk=svgEl('feComponentTransfer',{in:'reg-luma',result:'reg-dark-ink'});
    darkInk.appendChild(svgEl('feFuncA',{type:'linear',slope:'-5',intercept:'1.5'}));
    const coreMask=svgEl('feComposite',{in:'reg-dark-ink',in2:'reg-plate',operator:'in',result:'reg-core-mask'});
    const coreSignal=svgEl('feComposite',{in:'SourceGraphic',in2:'reg-core-mask',operator:'in',result:'reg-core-signal'});
    const originalCore=svgEl('feComponentTransfer',{in:'reg-core-signal',result:'reg-original-core'});
    originalCore.appendChild(svgEl('feFuncA',{type:'linear',slope:'.88'}));
    const registeredScene=svgEl('feMerge',{result:'registeredScene'});
    registeredScene.append(svgEl('feMergeNode',{in:'reg-fringed'}),svgEl('feMergeNode',{in:'reg-original-core'}));

    const beam=svgEl('feGaussianBlur',{in:'registeredScene',stdDeviation:'.35',result:'beam'});
    const displacement=svgEl('feDisplacementMap',{in:'beam',in2:'lens',scale:'50',xChannelSelector:'R',yChannelSelector:'G',result:'curvedSignal'});
    const tube=svgEl('feGaussianBlur',{in:'curvedSignal',stdDeviation:'.18',result:'tubeSignal'});
    const threshold=svgEl('feColorMatrix',{
      in:'tubeSignal',type:'matrix','color-interpolation-filters':'linearRGB',
      values:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .29764 1.00128 .10108 0 -.55',result:'emissionKey'
    });
    const emission=svgEl('feComposite',{in:'tubeSignal',in2:'emissionKey',operator:'in',result:'phosphorEmission'});
    const near=svgEl('feGaussianBlur',{in:'phosphorEmission',stdDeviation:'3.5',result:'nearScatter','color-interpolation-filters':'linearRGB'});
    const nearGain=svgEl('feComponentTransfer',{in:'nearScatter',result:'nearBloom','color-interpolation-filters':'linearRGB'});
    const nearFn=svgEl('feFuncA',{type:'linear',slope:'.32'}); nearGain.appendChild(nearFn);
    const wide=svgEl('feGaussianBlur',{in:'phosphorEmission',stdDeviation:'22',result:'wideScatter','color-interpolation-filters':'linearRGB'});
    const wideGain=svgEl('feComponentTransfer',{in:'wideScatter',result:'wideBloom','color-interpolation-filters':'linearRGB'});
    const wideFn=svgEl('feFuncA',{type:'linear',slope:'.36'}); wideGain.appendChild(wideFn);
    const nearMerge=svgEl('feBlend',{in:'tubeSignal',in2:'nearBloom',mode:'screen',result:'litSignal'});
    const wideMerge=svgEl('feBlend',{in:'litSignal',in2:'wideBloom',mode:'screen',result:'wideLit'});
    const panel=svgEl('feGaussianBlur',{in:'phosphorEmission',stdDeviation:'48',result:'panelScatter','color-interpolation-filters':'linearRGB'});
    const panelGain=svgEl('feComponentTransfer',{in:'panelScatter',result:'panelBloom','color-interpolation-filters':'linearRGB'});
    const panelFn=svgEl('feFuncA',{type:'linear',slope:'.38'}); panelGain.appendChild(panelFn);
    const finalBlend=svgEl('feBlend',{in:'wideLit',in2:'panelBloom',mode:'screen'});

    filter.append(
      image,red,redShift,green,blue,blueShift,rg,rgb,rgbAlpha,registered,
      warmKey,warmShift,paleEdge,paleEcho,paleMask,inverseEdge,paleFlood,paleRim,inverseFlood,inverseRim,fringed,
      luma,surround,plate,darkInk,coreMask,coreSignal,originalCore,registeredScene,
      beam,displacement,tube,threshold,emission,near,nearGain,wide,wideGain,nearMerge,wideMerge,panel,panelGain,finalBlend
    );
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);

    opticalRefs={redShift,blueShift,registered,warmShift,paleEcho,paleFlood,inverseFlood,beam,displacement,tube,nearFn,wideFn,panelFn};
  }

  function updateOpticalFilter(){
    if(!opticalRefs) return;
    const profile=currentProfile();
    const registration=effectValue('registration') && !isIOS;
    const distance=registration ? profile.distance : 0;
    const vertical=registration ? profile.vertical : 0;
    const mix=registration ? profile.mix : 0;
    const paleGain=registration ? profile.paleGain : 0;
    const darkGain=registration ? profile.darkGain : 0;

    opticalRefs.redShift.setAttribute('dx',String(-distance*.65));
    opticalRefs.redShift.setAttribute('dy',String(-vertical));
    opticalRefs.blueShift.setAttribute('dx',String(distance));
    opticalRefs.blueShift.setAttribute('dy',String(vertical));
    opticalRefs.registered.setAttribute('k2',String(mix));
    opticalRefs.registered.setAttribute('k3',String(1-mix));
    opticalRefs.warmShift.setAttribute('dx',String(-distance));
    opticalRefs.paleEcho.setAttribute('dx',String(distance));
    opticalRefs.paleFlood.setAttribute('flood-color',profile.pale);
    opticalRefs.paleFlood.setAttribute('flood-opacity',String(paleGain));
    opticalRefs.inverseFlood.setAttribute('flood-color',profile.dark);
    opticalRefs.inverseFlood.setAttribute('flood-opacity',String(darkGain));

    const blur=effectValue('blur') && !isIOS;
    const curve=effectValue('curvature') && !isIOS;
    const bloom=effectValue('bloom') && !isIOS;
    const mobile=matchMedia?.('(max-width: 767px)').matches;
    const baseBlur=activeTheme === 'dark' ? .48 : activeTheme === 'frost' ? .30 : .12;
    const tubeBlur=activeTheme === 'dark' ? .24 : activeTheme === 'frost' ? .14 : .06;
    opticalRefs.beam.setAttribute('stdDeviation',String(blur ? baseBlur : 0));
    opticalRefs.displacement.setAttribute('scale',String(curve ? (mobile ? 38 : 50) : 0));
    opticalRefs.tube.setAttribute('stdDeviation',String(curve ? tubeBlur : 0));

    let near=0,wide=0,panel=0;
    if(bloom){
      if(activeTheme === 'dark'){ near=.42; wide=.44; panel=.48; }
      else if(activeTheme === 'frost'){ near=.20; wide=.17; panel=.12; }
      else { near=.04; wide=.02; panel=.015; }
    }
    opticalRefs.nearFn.setAttribute('slope',String(near));
    opticalRefs.wideFn.setAttribute('slope',String(wide));
    opticalRefs.panelFn.setAttribute('slope',String(panel));
  }

  function installOpticalLayers(){
    if(!displayRoot || displayRoot.querySelector('.call-reader-screen-v6')) return;
    const surface=document.createElement('div');
    surface.className='call-reader-screen-v6';
    surface.setAttribute('aria-hidden','true');
    for(const cls of [
      'call-fx-night-phosphor-v6','call-fx-night-grain-v6',
      'call-fx-film-grain-v6','call-fx-film-smudges-v6','call-fx-film-glass-v6','call-fx-film-wear-v6',
      'call-fx-scanlines-v6','call-fx-vignette-v6','call-fx-bezel-v6'
    ]){
      const span=document.createElement('span'); span.className=cls; surface.appendChild(span);
    }
    displayRoot.appendChild(surface);
  }

  function orientationKey(base){ return `${base}:${matchMedia?.('(orientation: portrait)').matches ? 'portrait' : 'landscape'}`; }
  function parsePoint(value){
    if(!value) return null;
    try{ const p=JSON.parse(value); if(p && Number.isFinite(p.x) && Number.isFinite(p.y)) return {x:p.x,y:p.y}; }catch(_){}
    return null;
  }
  function clampPoint(node,point){
    const r=node.getBoundingClientRect();
    const host=displayRoot?.getBoundingClientRect() || {left:0,top:0,width:innerWidth,height:innerHeight};
    return {
      x:Math.min(Math.max(host.left+VIEWPORT_MARGIN,point.x),Math.max(host.left+VIEWPORT_MARGIN,host.right-r.width-VIEWPORT_MARGIN)),
      y:Math.min(Math.max(host.top+VIEWPORT_MARGIN,point.y),Math.max(host.top+VIEWPORT_MARGIN,host.bottom-r.height-VIEWPORT_MARGIN))
    };
  }
  function applyPoint(node,point){
    if(!point){
      node.classList.remove('is-positioned');
      for(const prop of ['left','top','right','bottom','transform']) node.style.removeProperty(prop);
      return;
    }
    const next=clampPoint(node,point);
    const host=displayRoot?.getBoundingClientRect() || {left:0,top:0};
    node.classList.add('is-positioned');
    node.style.left=`${next.x-host.left}px`;
    node.style.top=`${next.y-host.top}px`;
    node.style.right='auto'; node.style.bottom='auto'; node.style.transform='none';
  }
  function makeDraggable(node,handle,key){
    if(!node || !handle || node.dataset.dragReady === 'true') return;
    node.dataset.dragReady='true';
    let drag=null,frame=0;
    requestAnimationFrame(()=>{ const p=parsePoint(storageGet(orientationKey(key))); if(p) applyPoint(node,p); });
    const persist=()=>{
      const r=node.getBoundingClientRect();
      storageSet(orientationKey(key),JSON.stringify({x:r.left,y:r.top}));
    };
    handle.addEventListener('pointerdown',event=>{
      if(event.pointerType === 'mouse' && event.button !== 0) return;
      const r=node.getBoundingClientRect();
      event.preventDefault(); event.stopPropagation();
      handle.setPointerCapture?.(event.pointerId);
      drag={id:event.pointerId,dx:event.clientX-r.left,dy:event.clientY-r.top};
      node.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove',event=>{
      if(!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      if(frame) cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>applyPoint(node,{x:event.clientX-drag.dx,y:event.clientY-drag.dy}));
    });
    const end=(event,save)=>{
      if(!drag || drag.id !== event.pointerId) return;
      drag=null; node.classList.remove('is-dragging');
      try{handle.releasePointerCapture(event.pointerId);}catch(_){}
      if(save) persist();
    };
    handle.addEventListener('pointerup',event=>end(event,true));
    handle.addEventListener('pointercancel',event=>end(event,false));
    handle.addEventListener('dblclick',()=>{ storageSet(orientationKey(key),''); applyPoint(node,null); });
    addEventListener('resize',()=>{ if(node.classList.contains('is-positioned')){ const r=node.getBoundingClientRect(); applyPoint(node,{x:r.left,y:r.top}); persist(); } },{passive:true});
  }
  function createGrip(label){
    const b=document.createElement('button'); b.type='button'; b.className='call-floating-grip-v6';
    b.title=`${label}；双击恢复默认位置`; b.setAttribute('aria-label',label); b.innerHTML='<span aria-hidden="true">⋮⋮</span>';
    return b;
  }
  function createThemeButton(item){
    const b=document.createElement('button'); b.type='button'; b.className='call-theme-option-v6'; b.dataset.callThemeOption=item.key;
    b.title=item.label; b.setAttribute('aria-label',`切换为${item.label}主题`);
    b.innerHTML=`<span aria-hidden="true">${item.glyph}</span><span class="call-sr-only-v6">${item.label}</span>`;
    b.addEventListener('click',()=>setTheme(item.key,true)); return b;
  }
  function ensureFallbackRail(){
    let rail=scrollRoot?.querySelector('.call-quick-rail-v10,.suite-quick-rail-v7') || document.querySelector('.call-quick-rail-v10,.suite-quick-rail-v7');
    if(rail) return rail;
    if(document.body?.dataset.suiteTool === 'runes'){
      rail=document.createElement('aside');
      rail.className='suite-quick-rail-v7 call-generated-rail-v6';
      rail.setAttribute('aria-label','页面快捷操作');
      for(const [caption,label,action,actionName] of [
        ['顶部','跳到页面顶部',()=>scrollToRoot({top:0,behavior:'smooth'}),'top'],
        ['底部','跳到页面底部',()=>scrollToRoot({top:rootScrollHeight(),behavior:'smooth'}),'bottom']
      ]){
        const b=document.createElement('button');
        b.type='button'; b.textContent=caption; b.title=label; b.dataset.action=actionName;
        b.setAttribute('aria-label',label); b.addEventListener('click',action); rail.appendChild(b);
      }
      scrollRoot.appendChild(rail);
    }
    return rail;
  }

  function adoptAndDedupeQuickRail(){
    const host=displayRoot?.querySelector('.call-jump-widget-v6 [data-quick-rail-host]');
    if(!host) return null;
    const rails=Array.from(document.querySelectorAll('.call-quick-rail-v10,.suite-quick-rail-v7'));
    let canonical=host.querySelector('.call-quick-rail-v10,.suite-quick-rail-v7') || rails[0] || ensureFallbackRail();
    if(canonical && canonical.parentElement !== host) host.appendChild(canonical);
    for(const rail of Array.from(document.querySelectorAll('.call-quick-rail-v10,.suite-quick-rail-v7'))){
      if(rail !== canonical) rail.remove();
    }
    return canonical;
  }
  function installThemeWidget(){
    displayRoot.querySelectorAll('.call-theme-widget-v5,.call-theme-dock-v2,.call-floating-controller-v3').forEach(n=>n.remove());
    const widget=document.createElement('div'); widget.className='call-floating-widget-v6 call-theme-widget-v6'; widget.setAttribute('role','group'); widget.setAttribute('aria-label','主题与画面设置');
    const grip=createGrip('拖动主题控件');
    const themes=document.createElement('div'); themes.className='call-theme-options-v6'; for(const item of THEMES) themes.appendChild(createThemeButton(item));
    const fx=document.createElement('button'); fx.type='button'; fx.className='call-floating-utility-v6'; fx.textContent='⚙'; fx.title='画面效果设置'; fx.setAttribute('aria-label',fx.title);
    fx.addEventListener('click',()=>{ state.fxOpen=!state.fxOpen; persistVisual(); syncFxPanel(); });
    widget.append(grip,themes,fx); displayRoot.appendChild(widget); makeDraggable(widget,grip,THEME_POS_KEY); return widget;
  }
  function installJumpWidget(){
    displayRoot.querySelector('.call-jump-widget-v5')?.remove();
    const widget=document.createElement('div'); widget.className='call-floating-widget-v6 call-jump-widget-v6'; widget.setAttribute('role','group'); widget.setAttribute('aria-label','页面跳转工具');
    const grip=createGrip('拖动跳转工具');
    const host=document.createElement('div'); host.className='call-jump-actions-v6'; host.dataset.quickRailHost='true';
    const collapse=document.createElement('button'); collapse.type='button'; collapse.className='call-jump-collapse-v6'; collapse.dataset.jumpCollapse='true';
    collapse.addEventListener('click',()=>{ state.jumpCollapsed=!state.jumpCollapsed; persistVisual(); syncJump(); });
    widget.append(grip,host,collapse); displayRoot.appendChild(widget); makeDraggable(widget,grip,JUMP_POS_KEY);
    const rail=ensureFallbackRail(); if(rail) host.appendChild(rail);
    adoptAndDedupeQuickRail();
    root.dataset.callControlsReady='true'; syncJump(); return widget;
  }
  function checkboxRow(key){
    const label=document.createElement('label'); label.className='call-fx-toggle-row-v6';
    const text=document.createElement('span'); text.textContent=EFFECT_LABELS[key];
    const input=document.createElement('input'); input.type='checkbox'; input.setAttribute('role','switch'); input.dataset.fxKey=key; input.setAttribute('aria-label',EFFECT_LABELS[key]);
    input.addEventListener('change',()=>setEffect(key,input.checked));
    label.append(text,input); return label;
  }
  function installFxWindow(){
    displayRoot.querySelector('.call-fx-window-v5')?.remove();
    const panel=document.createElement('section'); panel.className='call-floating-widget-v6 call-fx-window-v6'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','画面与字体效果设置');
    const titlebar=document.createElement('header'); titlebar.className='call-fx-titlebar-v6';
    const grip=createGrip('拖动画面设置窗口'); grip.classList.add('call-fx-grip-v6');
    const title=document.createElement('div'); title.className='call-fx-title-copy-v6'; title.innerHTML='<small>SYS://DISPLAY.CONFIG</small><strong>画面与字体效果</strong>';
    const close=document.createElement('button'); close.type='button'; close.className='call-fx-close-v6'; close.textContent='×'; close.setAttribute('aria-label','关闭画面设置');
    close.addEventListener('click',()=>{ state.fxOpen=false; persistVisual(); syncFxPanel(); });
    titlebar.append(grip,title,close);
    const body=document.createElement('div'); body.className='call-fx-body-v6';
    const intro=document.createElement('p'); intro.className='call-fx-intro-v6';
    intro.innerHTML='当前主题：<strong data-fx-theme-label></strong>。所有页面、菜单和悬浮控件现在统一位于同一块显示器根节点内；曲面、色散和发光只处理这一个屏幕信号。';
    const phosphor=document.createElement('fieldset'); phosphor.className='call-fx-phosphor-v6'; phosphor.dataset.phosphorSection='true'; phosphor.innerHTML='<legend>夜间显像管颜色</legend>';
    const segment=document.createElement('div'); segment.className='call-fx-segment-v6';
    for(const [value,label] of [['green','绿磷光'],['amber','橙磷光']]){
      const b=document.createElement('button'); b.type='button'; b.dataset.phosphor=value; b.textContent=label; b.addEventListener('click',()=>setPhosphor(value)); segment.appendChild(b);
    }
    phosphor.appendChild(segment);
    const effects=document.createElement('fieldset'); effects.className='call-fx-effects-v6'; effects.innerHTML='<legend>屏幕与字体效果</legend>';
    for(const key of EFFECT_KEYS) effects.appendChild(checkboxRow(key));
    const iosNote=document.createElement('p'); iosNote.className='call-fx-ios-note-v6'; iosNote.dataset.iosNote='true';
    iosNote.textContent='iOS 性能路径：保持 Reader 原始纹理、扫描线、污渍、裂纹和静态套色；停用全屏 SVG 位移/高斯扩散，防止 WebKit 持续重合成。';
    const footer=document.createElement('footer'); footer.className='call-fx-footer-v6';
    const reset=document.createElement('button'); reset.type='button'; reset.textContent='恢复本主题默认效果'; reset.addEventListener('click',resetEffects);
    const done=document.createElement('button'); done.type='button'; done.textContent='关闭'; done.addEventListener('click',()=>{ state.fxOpen=false; persistVisual(); syncFxPanel(); });
    footer.append(reset,done); body.append(intro,phosphor,effects,iosNote,footer); panel.append(titlebar,body);
    displayRoot.appendChild(panel); makeDraggable(panel,grip,FX_POS_KEY); syncFxPanel(); return panel;
  }

  function installOpticalScrollbar(){
    if(displayRoot.querySelector('.call-optical-scroll-v6')) return;
    const rail=document.createElement('div'); rail.className='call-optical-scroll-v6'; rail.setAttribute('role','scrollbar'); rail.setAttribute('aria-orientation','vertical'); rail.setAttribute('aria-label','页面滚动条'); rail.tabIndex=0;
    const track=document.createElement('div'); track.className='call-optical-scroll-track-v6';
    const thumb=document.createElement('div'); thumb.className='call-optical-scroll-thumb-v6';
    track.appendChild(thumb); rail.appendChild(track); displayRoot.appendChild(rail);
    let drag=null;
    const setFromPointer=clientY=>{
      const r=track.getBoundingClientRect(); const h=thumb.getBoundingClientRect().height; const travel=Math.max(1,r.height-h);
      const ratio=Math.min(1,Math.max(0,(clientY-r.top-h/2)/travel)); const max=Math.max(0,rootScrollHeight()-rootClientHeight());
      scrollToRoot({top:ratio*max,behavior:'auto'});
    };
    rail.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse' && e.button!==0) return; e.preventDefault(); rail.setPointerCapture?.(e.pointerId); drag=e.pointerId; setFromPointer(e.clientY); });
    rail.addEventListener('pointermove',e=>{ if(drag===e.pointerId) setFromPointer(e.clientY); });
    const end=e=>{ if(drag!==e.pointerId) return; drag=null; try{rail.releasePointerCapture(e.pointerId);}catch(_){} };
    rail.addEventListener('pointerup',end); rail.addEventListener('pointercancel',end);
    rail.addEventListener('keydown',e=>{
      const delta={ArrowDown:64,ArrowUp:-64,PageDown:rootClientHeight()*.85,PageUp:-rootClientHeight()*.85,Home:-1e9,End:1e9}[e.key];
      if(delta==null) return; e.preventDefault(); scrollByRoot({top:delta,behavior:'smooth'});
    });
    updateOpticalScrollbar();
  }
  function scheduleOpticalScrollbar(){
    if(scrollbarFrame) return;
    scrollbarFrame=requestAnimationFrame(()=>{ scrollbarFrame=0; updateOpticalScrollbar(); });
  }
  function updateOpticalScrollbar(){
    const rail=displayRoot?.querySelector('.call-optical-scroll-v6');
    const thumb=rail?.querySelector('.call-optical-scroll-thumb-v6');
    const track=rail?.querySelector('.call-optical-scroll-track-v6');
    if(!rail || !thumb || !track) return;
    const height=rootScrollHeight(), client=rootClientHeight(), max=Math.max(0,height-client);
    rail.hidden=max<2; if(rail.hidden) return;
    const trackHeight=track.clientHeight || Math.max(1,client-48);
    const thumbHeight=Math.max(42,Math.min(trackHeight,trackHeight*(client/height)));
    const travel=Math.max(0,trackHeight-thumbHeight);
    const ratio=max ? Math.min(1,Math.max(0,rootScrollTop()/max)) : 0;
    thumb.style.height=`${thumbHeight}px`; thumb.style.transform=`translateY(${travel*ratio}px)`;
    rail.setAttribute('aria-valuemax',String(Math.round(max))); rail.setAttribute('aria-valuenow',String(Math.round(rootScrollTop())));
  }

  function patchLegacyScrolling(){
    if(typeof window.drawAndJump === 'function'){
      const old=window.drawAndJump;
      window.drawAndJump=function(){
        try{
          if(typeof window.drawNet_Table === 'function') window.drawNet_Table();
          else old.apply(this,arguments);
        }catch(_){ try{old.apply(this,arguments);}catch(__){} }
        requestAnimationFrame(()=>scrollElementIntoView(document.getElementById('mynetwork')));
        return false;
      };
    }
  }
  function observeRails(){
    if(typeof MutationObserver !== 'function') return;
    let queued=false;
    new MutationObserver(()=>{
      if(queued) return;
      queued=true;
      queueMicrotask(()=>{ queued=false; adoptAndDedupeQuickRail(); });
    }).observe(scrollRoot,{childList:true,subtree:false});
  }

  function install(){
    installDisplayRoot();
    installOpticalFilter();
    installOpticalLayers();
    installThemeWidget();
    installJumpWidget();
    installFxWindow();
    installOpticalScrollbar();
    patchLegacyScrolling();
    observeRails();
    applyAll();
    addEventListener('resize',()=>{ updateOpticalFilter(); scheduleOpticalScrollbar(); },{passive:true});
    addEventListener('storage',event=>{ if(event.key===THEME_KEY && VALID_THEMES.has(event.newValue)) setTheme(event.newValue,false); });
    root.dataset.callThemeReady='v6';
    window.__MAGIRECO_CALL_THEME__=Object.freeze({
      version:6,release:RELEASE,visualLanguage:'reader-terminal-v6',
      themes:THEMES.map(x=>x.key),effects:EFFECT_KEYS.slice(),iosOptimized:isIOS,
      get theme(){return activeTheme;},get phosphor(){return state.phosphor;},
      setTheme,setPhosphor,setEffect,resetEffects
    });
  }

  if(document.body) install();
  else document.addEventListener('DOMContentLoaded',install,{once:true});
})();