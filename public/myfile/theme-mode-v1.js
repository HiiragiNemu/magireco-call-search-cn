(() => {
  'use strict';

  const RELEASE = 'reader-terminal-fx-v5-20260919';
  const THEME_KEY = 'magireco-call-theme-v2';
  const LEGACY_THEME_KEY = 'magireco-call-theme-v1';
  const VISUAL_KEY = 'magireco-call-visual-v5';
  const THEME_POS_KEY = 'magireco-call-theme-widget-v5';
  const JUMP_POS_KEY = 'magireco-call-jump-widget-v5';
  const FX_POS_KEY = 'magireco-call-fx-window-v5';
  const VIEWPORT_MARGIN = 12;

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

  const root = document.documentElement;
  const isIOS = (() => {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  })();
  const reduceMotion = (() => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
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

  function persistVisual(){ storageSet(VISUAL_KEY,JSON.stringify(state)); }
  function effectValue(key){ return Boolean(state.effects?.[activeTheme]?.[key]); }
  function setBrowserChrome(){
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta && document.head){ meta=document.createElement('meta'); meta.name='theme-color'; document.head.appendChild(meta); }
    if(meta) meta.content=THEME_COLORS[activeTheme] || THEME_COLORS.paper;
  }
  function applyDatasets(){
    root.dataset.callTheme=activeTheme;
    root.dataset.callPhosphor=state.phosphor;
    root.dataset.callIos=String(isIOS);
    root.dataset.callReducedMotion=String(reduceMotion);
    root.dataset.callVisualLanguage='reader-terminal-v5';
    root.style.colorScheme=(activeTheme === 'dark' || activeTheme === 'frost') ? 'dark' : 'light';
    for(const key of EFFECT_KEYS){
      root.dataset[`callFx${key[0].toUpperCase()}${key.slice(1)}`]=String(effectValue(key));
    }
    setBrowserChrome();
  }
  function syncThemeButtons(){
    for(const button of document.querySelectorAll('[data-call-theme-option]')){
      button.setAttribute('aria-pressed',String(button.dataset.callThemeOption === activeTheme));
    }
  }
  function syncFxPanel(){
    const panel=document.querySelector('.call-fx-window-v5');
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
    const widget=document.querySelector('.call-jump-widget-v5');
    if(!widget) return;
    widget.classList.toggle('is-collapsed',state.jumpCollapsed);
    const button=widget.querySelector('[data-jump-collapse]');
    if(button){
      button.textContent=state.jumpCollapsed ? '＋' : '－';
      button.title=state.jumpCollapsed ? '展开跳转工具' : '收起跳转工具';
      button.setAttribute('aria-label',button.title);
    }
  }
  function applyAll(){ applyDatasets(); syncThemeButtons(); syncFxPanel(); syncJump(); updateOpticalScrollbar(); }

  function setTheme(theme,persist=true){
    if(!VALID_THEMES.has(theme)) return activeTheme;
    activeTheme=theme;
    if(!state.effects[theme]) state.effects[theme]=clonePreset(theme);
    if(persist) storageSet(THEME_KEY,theme);
    applyAll();
    try { dispatchEvent(new CustomEvent('magireco-call-theme-change',{detail:{theme}})); } catch(_) {}
    return theme;
  }
  function setPhosphor(value){ state.phosphor=value === 'amber' ? 'amber' : 'green'; persistVisual(); applyAll(); }
  function setEffect(key,enabled){
    if(!EFFECT_KEYS.includes(key)) return;
    state.effects[activeTheme][key]=Boolean(enabled);
    persistVisual();
    applyAll();
  }
  function resetEffects(){ state.effects[activeTheme]=clonePreset(activeTheme); persistVisual(); applyAll(); }

  applyDatasets();

  function installOpticalLayers(){
    if(!document.body || document.querySelector('.call-reader-screen-v5')) return;
    const surface=document.createElement('div');
    surface.className='call-reader-screen-v5';
    surface.setAttribute('aria-hidden','true');
    const layers=[
      'call-fx-night-phosphor-v5',
      'call-fx-night-grain-v5',
      'call-fx-film-grain-v5',
      'call-fx-film-smudges-v5',
      'call-fx-film-glass-v5',
      'call-fx-film-wear-v5',
      'call-fx-scanlines-v5',
      'call-fx-vignette-v5',
      'call-fx-bezel-v5'
    ];
    for(const cls of layers){
      const span=document.createElement('span');
      span.className=cls;
      surface.appendChild(span);
    }
    document.body.appendChild(surface);
  }

  function orientationKey(base){ return `${base}:${matchMedia?.('(orientation: portrait)').matches ? 'portrait' : 'landscape'}`; }
  function parsePoint(value){
    if(!value) return null;
    try {
      const p=JSON.parse(value);
      if(p && Number.isFinite(p.x) && Number.isFinite(p.y)) return {x:p.x,y:p.y};
    } catch(_) {}
    return null;
  }
  function clampPoint(node,point){
    const r=node.getBoundingClientRect();
    return {
      x:Math.min(Math.max(VIEWPORT_MARGIN,point.x),Math.max(VIEWPORT_MARGIN,innerWidth-r.width-VIEWPORT_MARGIN)),
      y:Math.min(Math.max(VIEWPORT_MARGIN,point.y),Math.max(VIEWPORT_MARGIN,innerHeight-r.height-VIEWPORT_MARGIN))
    };
  }
  function applyPoint(node,point){
    if(!point){
      node.classList.remove('is-positioned');
      for(const prop of ['left','top','right','bottom','transform']) node.style.removeProperty(prop);
      return;
    }
    const next=clampPoint(node,point);
    node.classList.add('is-positioned');
    node.style.left=`${next.x}px`;
    node.style.top=`${next.y}px`;
    node.style.right='auto';
    node.style.bottom='auto';
    node.style.transform='none';
  }
  function makeDraggable(node,handle,key){
    if(!node || !handle || node.dataset.dragReady === 'true') return;
    node.dataset.dragReady='true';
    let drag=null,frame=0;
    requestAnimationFrame(()=>{ const p=parsePoint(storageGet(orientationKey(key))); if(p) applyPoint(node,p); });
    const persist=()=>{ const r=node.getBoundingClientRect(); storageSet(orientationKey(key),JSON.stringify({x:r.left,y:r.top})); };
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
      try { handle.releasePointerCapture(event.pointerId); } catch(_) {}
      if(save) persist();
    };
    handle.addEventListener('pointerup',event=>end(event,true));
    handle.addEventListener('pointercancel',event=>end(event,false));
    handle.addEventListener('dblclick',()=>{ storageSet(orientationKey(key),''); applyPoint(node,null); });
    addEventListener('resize',()=>{
      if(!node.classList.contains('is-positioned')) return;
      const r=node.getBoundingClientRect();
      applyPoint(node,{x:r.left,y:r.top});
      persist();
    },{passive:true});
  }
  function createGrip(label){
    const b=document.createElement('button');
    b.type='button';
    b.className='call-floating-grip-v5';
    b.title=`${label}；双击恢复默认位置`;
    b.setAttribute('aria-label',label);
    b.innerHTML='<span aria-hidden="true">⋮⋮</span>';
    return b;
  }
  function createThemeButton(item){
    const b=document.createElement('button');
    b.type='button';
    b.className='call-theme-option-v5';
    b.dataset.callThemeOption=item.key;
    b.title=item.label;
    b.setAttribute('aria-label',`切换为${item.label}主题`);
    b.innerHTML=`<span aria-hidden="true">${item.glyph}</span><span class="call-sr-only-v5">${item.label}</span>`;
    b.addEventListener('click',()=>setTheme(item.key,true));
    return b;
  }
  function ensureFallbackRail(){
    let rail=document.querySelector('.call-quick-rail-v10,.suite-quick-rail-v7');
    if(rail) return rail;
    if(document.body?.dataset.suiteTool === 'runes'){
      rail=document.createElement('aside');
      rail.className='suite-quick-rail-v7 call-generated-rail-v5';
      rail.setAttribute('aria-label','页面快捷操作');
      for(const [caption,label,action] of [
        ['顶部','跳到页面顶部',()=>scrollTo({top:0,behavior:'smooth'})],
        ['底部','跳到页面底部',()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'})]
      ]){
        const b=document.createElement('button'); b.type='button'; b.textContent=caption; b.title=label; b.setAttribute('aria-label',label); b.addEventListener('click',action); rail.appendChild(b);
      }
      document.body.appendChild(rail);
    }
    return rail;
  }
  function installThemeWidget(){
    document.querySelectorAll('.call-theme-dock-v2,.call-theme-toggle-v1,.call-floating-controller-v3,.call-theme-widget-v4').forEach(n=>n.remove());
    let widget=document.querySelector('.call-theme-widget-v5');
    if(widget) return widget;
    widget=document.createElement('div');
    widget.className='call-floating-widget-v5 call-theme-widget-v5';
    widget.setAttribute('role','group');
    widget.setAttribute('aria-label','主题与画面设置');
    const grip=createGrip('拖动主题控件');
    const themes=document.createElement('div');
    themes.className='call-theme-options-v5';
    for(const item of THEMES) themes.appendChild(createThemeButton(item));
    const fx=document.createElement('button');
    fx.type='button'; fx.className='call-floating-utility-v5'; fx.textContent='⚙'; fx.title='画面效果设置'; fx.setAttribute('aria-label',fx.title);
    fx.addEventListener('click',()=>{ state.fxOpen=!state.fxOpen; persistVisual(); syncFxPanel(); });
    widget.append(grip,themes,fx);
    document.body.appendChild(widget);
    makeDraggable(widget,grip,THEME_POS_KEY);
    return widget;
  }
  function installJumpWidget(){
    document.querySelector('.call-jump-widget-v4')?.remove();
    let widget=document.querySelector('.call-jump-widget-v5');
    if(!widget){
      widget=document.createElement('div');
      widget.className='call-floating-widget-v5 call-jump-widget-v5';
      widget.setAttribute('role','group');
      widget.setAttribute('aria-label','页面跳转工具');
      const grip=createGrip('拖动跳转工具');
      const host=document.createElement('div'); host.className='call-jump-actions-v5'; host.dataset.quickRailHost='true';
      const collapse=document.createElement('button'); collapse.type='button'; collapse.className='call-jump-collapse-v5'; collapse.dataset.jumpCollapse='true';
      collapse.addEventListener('click',()=>{ state.jumpCollapsed=!state.jumpCollapsed; persistVisual(); syncJump(); });
      widget.append(grip,host,collapse);
      document.body.appendChild(widget);
      makeDraggable(widget,grip,JUMP_POS_KEY);
    }
    const rail=ensureFallbackRail();
    const host=widget.querySelector('[data-quick-rail-host]');
    if(rail && host && rail.parentElement !== host) host.appendChild(rail);
    root.dataset.callControlsReady='true';
    syncJump();
    return widget;
  }
  function checkboxRow(key){
    const label=document.createElement('label'); label.className='call-fx-toggle-row-v5';
    const text=document.createElement('span'); text.textContent=EFFECT_LABELS[key];
    const input=document.createElement('input'); input.type='checkbox'; input.setAttribute('role','switch'); input.dataset.fxKey=key; input.setAttribute('aria-label',EFFECT_LABELS[key]);
    input.addEventListener('change',()=>setEffect(key,input.checked));
    label.append(text,input); return label;
  }
  function installFxWindow(){
    document.querySelector('.call-fx-window-v4')?.remove();
    let panel=document.querySelector('.call-fx-window-v5');
    if(panel) return panel;
    panel=document.createElement('section');
    panel.className='call-floating-widget-v5 call-fx-window-v5';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','画面与字体效果设置');

    const titlebar=document.createElement('header'); titlebar.className='call-fx-titlebar-v5';
    const grip=createGrip('拖动画面设置窗口'); grip.classList.add('call-fx-grip-v5');
    const title=document.createElement('div'); title.className='call-fx-title-copy-v5'; title.innerHTML='<small>SYS://DISPLAY.CONFIG</small><strong>画面与字体效果</strong>';
    const close=document.createElement('button'); close.type='button'; close.className='call-fx-close-v5'; close.textContent='×'; close.setAttribute('aria-label','关闭画面设置');
    close.addEventListener('click',()=>{ state.fxOpen=false; persistVisual(); syncFxPanel(); });
    titlebar.append(grip,title,close);

    const body=document.createElement('div'); body.className='call-fx-body-v5';
    const intro=document.createElement('p'); intro.className='call-fx-intro-v5';
    intro.innerHTML='当前主题：<strong data-fx-theme-label></strong>。夜间直接使用 Reader 的 CRT 栅格、噪点纹理与 phosphor 配色；冷辉直接使用 Reader 的胶片颗粒、污渍、玻璃与裂纹素材。';
    const phosphor=document.createElement('fieldset'); phosphor.className='call-fx-phosphor-v5'; phosphor.dataset.phosphorSection='true'; phosphor.innerHTML='<legend>夜间显像管颜色</legend>';
    const segment=document.createElement('div'); segment.className='call-fx-segment-v5';
    for(const [value,label] of [['green','绿磷光'],['amber','橙磷光']]){
      const b=document.createElement('button'); b.type='button'; b.dataset.phosphor=value; b.textContent=label; b.addEventListener('click',()=>setPhosphor(value)); segment.appendChild(b);
    }
    phosphor.appendChild(segment);
    const effects=document.createElement('fieldset'); effects.className='call-fx-effects-v5'; effects.innerHTML='<legend>屏幕与字体效果</legend>';
    for(const key of EFFECT_KEYS) effects.appendChild(checkboxRow(key));
    const iosNote=document.createElement('p'); iosNote.className='call-fx-ios-note-v5'; iosNote.dataset.iosNote='true';
    iosNote.textContent='iOS 性能路径：保留 Reader 原始纹理、扫描线、色散、发光、污渍和裂纹；暂停持续位移，只保留静态 CRT 玻璃与边缘曲面。';
    const footer=document.createElement('footer'); footer.className='call-fx-footer-v5';
    const reset=document.createElement('button'); reset.type='button'; reset.textContent='恢复本主题默认效果'; reset.addEventListener('click',resetEffects);
    const done=document.createElement('button'); done.type='button'; done.textContent='关闭'; done.addEventListener('click',()=>{ state.fxOpen=false; persistVisual(); syncFxPanel(); });
    footer.append(reset,done);
    body.append(intro,phosphor,effects,iosNote,footer);
    panel.append(titlebar,body);
    document.body.appendChild(panel);
    makeDraggable(panel,grip,FX_POS_KEY);
    syncFxPanel();
    return panel;
  }

  let scrollbarFrame=0;
  function installOpticalScrollbar(){
    if(document.querySelector('.call-optical-scroll-v5')) return;
    const rail=document.createElement('div');
    rail.className='call-optical-scroll-v5';
    rail.setAttribute('role','scrollbar');
    rail.setAttribute('aria-orientation','vertical');
    rail.setAttribute('aria-label','页面滚动条');
    rail.tabIndex=0;
    const track=document.createElement('div'); track.className='call-optical-scroll-track-v5';
    const thumb=document.createElement('div'); thumb.className='call-optical-scroll-thumb-v5';
    track.appendChild(thumb); rail.appendChild(track); document.body.appendChild(rail);
    let drag=null;
    const setFromPointer=(clientY)=>{
      const r=track.getBoundingClientRect();
      const h=thumb.getBoundingClientRect().height;
      const travel=Math.max(1,r.height-h);
      const ratio=Math.min(1,Math.max(0,(clientY-r.top-h/2)/travel));
      const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
      scrollTo({top:ratio*max,behavior:'auto'});
    };
    rail.addEventListener('pointerdown',e=>{
      if(e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      rail.setPointerCapture?.(e.pointerId);
      drag=e.pointerId; setFromPointer(e.clientY);
    });
    rail.addEventListener('pointermove',e=>{ if(drag === e.pointerId) setFromPointer(e.clientY); });
    const end=e=>{ if(drag !== e.pointerId) return; drag=null; try{rail.releasePointerCapture(e.pointerId);}catch(_){} };
    rail.addEventListener('pointerup',end); rail.addEventListener('pointercancel',end);
    rail.addEventListener('keydown',e=>{
      const delta={ArrowDown:64,ArrowUp:-64,PageDown:innerHeight*.85,PageUp:-innerHeight*.85,Home:-1e9,End:1e9}[e.key];
      if(delta == null) return; e.preventDefault(); scrollBy({top:delta,behavior:'smooth'});
    });
    addEventListener('scroll',scheduleOpticalScrollbar,{passive:true});
    addEventListener('resize',scheduleOpticalScrollbar,{passive:true});
    updateOpticalScrollbar();
  }
  function scheduleOpticalScrollbar(){
    if(scrollbarFrame) return;
    scrollbarFrame=requestAnimationFrame(()=>{ scrollbarFrame=0; updateOpticalScrollbar(); });
  }
  function updateOpticalScrollbar(){
    const rail=document.querySelector('.call-optical-scroll-v5');
    const thumb=rail?.querySelector('.call-optical-scroll-thumb-v5');
    const track=rail?.querySelector('.call-optical-scroll-track-v5');
    if(!rail || !thumb || !track) return;
    const scrollHeight=Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight || 0);
    const max=Math.max(0,scrollHeight-innerHeight);
    rail.hidden=max < 2;
    if(rail.hidden) return;
    const trackHeight=track.clientHeight || Math.max(1,innerHeight-52);
    const thumbHeight=Math.max(46,Math.min(trackHeight,trackHeight*(innerHeight/scrollHeight)));
    const travel=Math.max(0,trackHeight-thumbHeight);
    const ratio=max ? Math.min(1,Math.max(0,scrollY/max)) : 0;
    thumb.style.height=`${thumbHeight}px`;
    thumb.style.transform=`translateY(${travel*ratio}px)`;
    rail.setAttribute('aria-valuemax',String(Math.round(max)));
    rail.setAttribute('aria-valuenow',String(Math.round(scrollY)));
  }

  function observeRails(){
    if(typeof MutationObserver !== 'function') return;
    new MutationObserver(()=>{
      const host=document.querySelector('.call-jump-widget-v5 [data-quick-rail-host]');
      const rail=document.querySelector('body>.call-quick-rail-v10,body>.suite-quick-rail-v7');
      if(host && rail) host.appendChild(rail);
    }).observe(document.body,{childList:true});
  }

  function install(){
    installOpticalLayers();
    installThemeWidget();
    installJumpWidget();
    installFxWindow();
    installOpticalScrollbar();
    observeRails();
    applyAll();
    addEventListener('storage',event=>{ if(event.key === THEME_KEY && VALID_THEMES.has(event.newValue)) setTheme(event.newValue,false); });
    root.dataset.callThemeReady='v5';
    window.__MAGIRECO_CALL_THEME__=Object.freeze({
      version:5, release:RELEASE, visualLanguage:'reader-terminal-v5',
      themes:THEMES.map(x=>x.key), effects:EFFECT_KEYS.slice(), iosOptimized:isIOS,
      get theme(){return activeTheme;}, get phosphor(){return state.phosphor;},
      setTheme,setPhosphor,setEffect,resetEffects
    });
  }

  if(document.body) install();
  else document.addEventListener('DOMContentLoaded',install,{once:true});
})();