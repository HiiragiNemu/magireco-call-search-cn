(() => {
  'use strict';

  const RELEASE = 'reader-terminal-fx-v4-20260919';
  const THEME_KEY = 'magireco-call-theme-v2';
  const LEGACY_THEME_KEY = 'magireco-call-theme-v1';
  const VISUAL_KEY = 'magireco-call-visual-v4';
  const THEME_POS_KEY = 'magireco-call-theme-widget-v4';
  const JUMP_POS_KEY = 'magireco-call-jump-widget-v4';
  const FX_POS_KEY = 'magireco-call-fx-window-v4';
  const VIEWPORT_MARGIN = 8;

  const THEMES = Object.freeze([
    { key: 'light', label: '明亮', glyph: '☀' },
    { key: 'paper', label: '纸张', glyph: '▤' },
    { key: 'green', label: '护眼', glyph: '❧' },
    { key: 'dark', label: '夜间', glyph: '☾' },
    { key: 'frost', label: '冷辉', glyph: '▦' }
  ]);
  const VALID_THEMES = new Set(THEMES.map((item) => item.key));
  const EFFECT_KEYS = Object.freeze([
    'curvature', 'scanlines', 'noise', 'registration', 'blur',
    'bloom', 'jitter', 'vignette', 'cracks', 'pixelFont'
  ]);
  const EFFECT_LABELS = Object.freeze({
    curvature: '屏幕曲率模拟',
    scanlines: '扫描线',
    noise: '自然噪点 / 胶片颗粒',
    registration: '全局色散 / 套色偏移',
    blur: '显像管低保真软焦',
    bloom: '磷光发光 / 高亮扩散',
    jitter: '屏幕轻微抖动',
    vignette: '边缘暗角 / 显像管边框',
    cracks: '冷辉玻璃裂纹',
    pixelFont: '像素终端字体'
  });
  const PRESETS = Object.freeze({
    light: Object.freeze({ curvature:false, scanlines:false, noise:false, registration:false, blur:false, bloom:false, jitter:false, vignette:false, cracks:false, pixelFont:false }),
    paper: Object.freeze({ curvature:false, scanlines:false, noise:true, registration:false, blur:false, bloom:false, jitter:false, vignette:false, cracks:false, pixelFont:false }),
    green: Object.freeze({ curvature:false, scanlines:true, noise:true, registration:false, blur:false, bloom:false, jitter:false, vignette:true, cracks:false, pixelFont:false }),
    dark: Object.freeze({ curvature:true, scanlines:true, noise:true, registration:true, blur:true, bloom:true, jitter:true, vignette:true, cracks:false, pixelFont:true }),
    frost: Object.freeze({ curvature:true, scanlines:true, noise:true, registration:true, blur:true, bloom:true, jitter:true, vignette:true, cracks:true, pixelFont:true })
  });
  const THEME_COLORS = Object.freeze({
    light: '#d8d4c6',
    paper: '#f3eacb',
    green: '#d6e9c4',
    dark: '#030702',
    frost: '#001018'
  });

  const root = document.documentElement;
  const isIOS = (() => {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  })();
  const reduceMotion = (() => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  })();

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value === '') window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      return true;
    } catch (_) { return false; }
  }
  function clonePreset(theme) {
    return { ...(PRESETS[theme] || PRESETS.paper) };
  }
  function parseVisualState() {
    const effects = {};
    for (const item of THEMES) effects[item.key] = clonePreset(item.key);
    try {
      const parsed = JSON.parse(storageGet(VISUAL_KEY) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const theme of THEMES.map((item) => item.key)) {
          const source = parsed.effects?.[theme];
          if (!source || typeof source !== 'object') continue;
          for (const key of EFFECT_KEYS) {
            if (typeof source[key] === 'boolean') effects[theme][key] = source[key];
          }
        }
        return {
          effects,
          phosphor: parsed.phosphor === 'amber' ? 'amber' : 'green',
          fxOpen: Boolean(parsed.fxOpen),
          jumpCollapsed: Boolean(parsed.jumpCollapsed)
        };
      }
    } catch (_) {}
    return { effects, phosphor: 'green', fxOpen: false, jumpCollapsed: false };
  }
  function storedTheme() {
    const current = storageGet(THEME_KEY);
    if (VALID_THEMES.has(current)) return current;
    const legacy = storageGet(LEGACY_THEME_KEY);
    if (legacy === 'dark' || legacy === 'light') return legacy;
    return null;
  }
  function systemTheme() {
    try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'paper'; }
    catch (_) { return 'paper'; }
  }

  const state = parseVisualState();
  let activeTheme = storedTheme() || systemTheme();

  function persistVisualState() {
    storageSet(VISUAL_KEY, JSON.stringify(state));
  }
  function effectValue(theme, key) {
    return Boolean(state.effects?.[theme]?.[key]);
  }
  function setBrowserChrome(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    if (meta) meta.content = THEME_COLORS[theme] || THEME_COLORS.paper;
  }
  function applyDatasets() {
    root.dataset.callTheme = activeTheme;
    root.dataset.callPhosphor = state.phosphor;
    root.dataset.callIos = String(isIOS);
    root.dataset.callReducedMotion = String(reduceMotion);
    root.dataset.callVisualLanguage = 'reader-terminal-v4';
    root.style.colorScheme = activeTheme === 'dark' || activeTheme === 'frost' ? 'dark' : 'light';
    for (const key of EFFECT_KEYS) {
      root.dataset[`callFx${key[0].toUpperCase()}${key.slice(1)}`] = String(effectValue(activeTheme, key));
    }
    setBrowserChrome(activeTheme);
  }
  function syncThemeButtons() {
    for (const button of document.querySelectorAll('[data-call-theme-option]')) {
      button.setAttribute('aria-pressed', String(button.dataset.callThemeOption === activeTheme));
    }
  }
  function syncFxPanel() {
    const panel = document.querySelector('.call-fx-window-v4');
    if (!panel) return;
    panel.dataset.theme = activeTheme;
    panel.hidden = !state.fxOpen;
    const themeName = THEMES.find((item) => item.key === activeTheme)?.label || activeTheme;
    const title = panel.querySelector('[data-fx-theme-label]');
    if (title) title.textContent = themeName;
    for (const input of panel.querySelectorAll('input[data-fx-key]')) {
      const key = input.dataset.fxKey;
      input.checked = effectValue(activeTheme, key);
      input.disabled = key === 'cracks' && activeTheme !== 'frost';
      input.closest('label')?.classList.toggle('is-disabled', input.disabled);
    }
    panel.querySelector('[data-phosphor-section]')?.toggleAttribute('hidden', activeTheme !== 'dark');
    for (const button of panel.querySelectorAll('[data-phosphor]')) {
      button.setAttribute('aria-pressed', String(button.dataset.phosphor === state.phosphor));
    }
    const note = panel.querySelector('[data-ios-note]');
    if (note) note.hidden = !isIOS;
  }
  function syncJumpState() {
    const widget = document.querySelector('.call-jump-widget-v4');
    if (!widget) return;
    widget.classList.toggle('is-collapsed', state.jumpCollapsed);
    const button = widget.querySelector('[data-jump-collapse]');
    if (button) {
      button.textContent = state.jumpCollapsed ? '＋' : '－';
      button.setAttribute('aria-label', state.jumpCollapsed ? '展开跳转工具' : '收起跳转工具');
      button.title = state.jumpCollapsed ? '展开跳转工具' : '收起跳转工具';
    }
  }
  function applyAll() {
    applyDatasets();
    syncThemeButtons();
    syncFxPanel();
    syncJumpState();
  }
  function setTheme(theme, persist = true) {
    if (!VALID_THEMES.has(theme)) return activeTheme;
    activeTheme = theme;
    if (!state.effects[theme]) state.effects[theme] = clonePreset(theme);
    if (persist) storageSet(THEME_KEY, theme);
    applyAll();
    try { window.dispatchEvent(new CustomEvent('magireco-call-theme-change', { detail: { theme } })); } catch (_) {}
    return theme;
  }
  function setPhosphor(phosphor) {
    state.phosphor = phosphor === 'amber' ? 'amber' : 'green';
    persistVisualState();
    applyAll();
  }
  function setEffect(key, enabled) {
    if (!EFFECT_KEYS.includes(key)) return;
    state.effects[activeTheme][key] = Boolean(enabled);
    persistVisualState();
    applyAll();
  }
  function resetEffects() {
    state.effects[activeTheme] = clonePreset(activeTheme);
    persistVisualState();
    applyAll();
  }

  applyDatasets();

  function makeNoiseTexture() {
    try {
      const size = isIOS ? 96 : 160;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      const image = ctx.createImageData(size, size);
      let seed = 0x7f4a7c15;
      const rand = () => {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        return ((seed >>> 0) & 0xffff) / 0xffff;
      };
      for (let i = 0; i < size * size; i++) {
        const r1 = rand();
        const r2 = rand();
        const gaussianish = (r1 + r2 + rand() + rand()) / 4;
        const value = Math.max(0, Math.min(255, Math.round(128 + (gaussianish - .5) * 120)));
        const alpha = Math.round(18 + rand() * 72);
        const p = i * 4;
        image.data[p] = value;
        image.data[p + 1] = value;
        image.data[p + 2] = value;
        image.data[p + 3] = alpha;
      }
      ctx.putImageData(image, 0, 0);
      ctx.globalAlpha = .28;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 7; i++) {
        const y = Math.floor(rand() * size);
        const x = Math.floor(rand() * size);
        const w = 5 + Math.floor(rand() * 38);
        ctx.fillRect(x, y, w, 1);
      }
      root.style.setProperty('--call-noise-image', `url("${canvas.toDataURL('image/png')}")`);
    } catch (_) {}
  }

  function makeLensMap() {
    try {
      const canvas = document.createElement('canvas');
      const size = 512;
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return null;
      const pixels = context.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const nx = x / (size - 1) * 2 - 1;
        const ny = y / (size - 1) * 2 - 1;
        const radial = nx * nx + ny * ny;
        const i = (y * size + x) * 4;
        pixels.data[i] = Math.round(128 + nx * radial * 45);
        pixels.data[i + 1] = Math.round(128 + ny * radial * 45);
        pixels.data[i + 2] = 128;
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL();
    } catch (_) { return null; }
  }

  function installOpticsDefinitions() {
    if (!document.body || document.querySelector('#call-crt-curve-v4')) return;
    const map = makeLensMap();
    if (!map) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.classList.add('call-optics-defs-v4');
    const defs = document.createElementNS(ns, 'defs');
    const filter = document.createElementNS(ns, 'filter');
    filter.id = 'call-crt-curve-v4';
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const image = document.createElementNS(ns, 'feImage');
    image.setAttribute('href', map);
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '100%');
    image.setAttribute('height', '100%');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'lens');

    const beam = document.createElementNS(ns, 'feGaussianBlur');
    beam.setAttribute('in', 'SourceGraphic');
    beam.setAttribute('stdDeviation', activeTheme === 'dark' ? '.35' : '.2');
    beam.setAttribute('result', 'beam');

    const displacement = document.createElementNS(ns, 'feDisplacementMap');
    displacement.setAttribute('in', 'beam');
    displacement.setAttribute('in2', 'lens');
    displacement.setAttribute('scale', window.matchMedia?.('(max-width: 767px)').matches ? '38' : '50');
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');
    displacement.setAttribute('result', 'curvedSignal');

    const tube = document.createElementNS(ns, 'feGaussianBlur');
    tube.setAttribute('in', 'curvedSignal');
    tube.setAttribute('stdDeviation', activeTheme === 'dark' ? '.18' : '.10');
    tube.setAttribute('result', 'tubeSignal');

    const threshold = document.createElementNS(ns, 'feColorMatrix');
    threshold.setAttribute('in', 'tubeSignal');
    threshold.setAttribute('type', 'matrix');
    threshold.setAttribute('color-interpolation-filters', 'linearRGB');
    threshold.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .29764 1.00128 .10108 0 -.55');
    threshold.setAttribute('result', 'emissionKey');

    const emission = document.createElementNS(ns, 'feComposite');
    emission.setAttribute('in', 'tubeSignal');
    emission.setAttribute('in2', 'emissionKey');
    emission.setAttribute('operator', 'in');
    emission.setAttribute('result', 'phosphorEmission');

    const near = document.createElementNS(ns, 'feGaussianBlur');
    near.setAttribute('in', 'phosphorEmission');
    near.setAttribute('stdDeviation', '3.5');
    near.setAttribute('result', 'nearScatter');

    const nearGain = document.createElementNS(ns, 'feComponentTransfer');
    nearGain.setAttribute('in', 'nearScatter');
    nearGain.setAttribute('result', 'nearBloom');
    const nearAlpha = document.createElementNS(ns, 'feFuncA');
    nearAlpha.setAttribute('type', 'linear');
    nearAlpha.setAttribute('slope', '.30');
    nearGain.appendChild(nearAlpha);

    const wide = document.createElementNS(ns, 'feGaussianBlur');
    wide.setAttribute('in', 'phosphorEmission');
    wide.setAttribute('stdDeviation', '22');
    wide.setAttribute('result', 'wideScatter');

    const wideGain = document.createElementNS(ns, 'feComponentTransfer');
    wideGain.setAttribute('in', 'wideScatter');
    wideGain.setAttribute('result', 'wideBloom');
    const wideAlpha = document.createElementNS(ns, 'feFuncA');
    wideAlpha.setAttribute('type', 'linear');
    wideAlpha.setAttribute('slope', '.30');
    wideGain.appendChild(wideAlpha);

    const blendNear = document.createElementNS(ns, 'feBlend');
    blendNear.setAttribute('in', 'tubeSignal');
    blendNear.setAttribute('in2', 'nearBloom');
    blendNear.setAttribute('mode', 'screen');
    blendNear.setAttribute('result', 'litSignal');

    const blendWide = document.createElementNS(ns, 'feBlend');
    blendWide.setAttribute('in', 'litSignal');
    blendWide.setAttribute('in2', 'wideBloom');
    blendWide.setAttribute('mode', 'screen');

    filter.append(image, beam, displacement, tube, threshold, emission, near, nearGain, wide, wideGain, blendNear, blendWide);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function installOpticalLayers() {
    if (!document.body || document.querySelector('.call-reader-screen-v4')) return;
    const surface = document.createElement('div');
    surface.className = 'call-reader-screen-v4';
    surface.setAttribute('aria-hidden', 'true');
    for (const className of [
      'call-fx-bloom-v4',
      'call-fx-scanlines-v4',
      'call-fx-noise-v4',
      'call-fx-cracks-v4',
      'call-fx-vignette-v4'
    ]) {
      const layer = document.createElement('span');
      layer.className = className;
      surface.appendChild(layer);
    }
    document.body.appendChild(surface);
  }

  function orientationKey(base) {
    const portrait = window.matchMedia?.('(orientation: portrait)').matches;
    return `${base}:${portrait ? 'portrait' : 'landscape'}`;
  }
  function parsePoint(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
      return { x: parsed.x, y: parsed.y };
    } catch (_) { return null; }
  }
  function clampPoint(node, point) {
    const rect = node.getBoundingClientRect();
    return {
      x: Math.min(Math.max(VIEWPORT_MARGIN, point.x), Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN)),
      y: Math.min(Math.max(VIEWPORT_MARGIN, point.y), Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN))
    };
  }
  function applyPoint(node, point) {
    if (!point) {
      node.classList.remove('is-positioned');
      node.style.removeProperty('left');
      node.style.removeProperty('top');
      node.style.removeProperty('right');
      node.style.removeProperty('bottom');
      node.style.removeProperty('transform');
      return;
    }
    const next = clampPoint(node, point);
    node.classList.add('is-positioned');
    node.style.left = `${next.x}px`;
    node.style.top = `${next.y}px`;
    node.style.right = 'auto';
    node.style.bottom = 'auto';
    node.style.transform = 'none';
  }
  function makeDraggable(node, handle, storageBase) {
    if (!node || !handle || node.dataset.dragReady === 'true') return;
    node.dataset.dragReady = 'true';
    let drag = null;
    let frame = 0;
    const restore = () => {
      const stored = parsePoint(storageGet(orientationKey(storageBase)));
      if (stored) requestAnimationFrame(() => applyPoint(node, stored));
    };
    const persist = () => {
      const rect = node.getBoundingClientRect();
      storageSet(orientationKey(storageBase), JSON.stringify({ x: rect.left, y: rect.top }));
    };
    const onMove = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const next = { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY };
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyPoint(node, next));
    };
    const finish = (event, save) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      node.classList.remove('is-dragging');
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
      if (save) persist();
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const rect = node.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture?.(event.pointerId);
      drag = { pointerId:event.pointerId, offsetX:event.clientX-rect.left, offsetY:event.clientY-rect.top };
      node.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', (event) => finish(event, true));
    handle.addEventListener('pointercancel', (event) => finish(event, false));
    handle.addEventListener('dblclick', () => {
      storageSet(orientationKey(storageBase), '');
      applyPoint(node, null);
    });
    window.addEventListener('resize', () => {
      if (!node.classList.contains('is-positioned')) return;
      const rect = node.getBoundingClientRect();
      applyPoint(node, { x: rect.left, y: rect.top });
      persist();
    }, { passive:true });
    restore();
  }

  function createGrip(label) {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'call-floating-grip-v4';
    grip.setAttribute('aria-label', label);
    grip.title = `${label}；双击恢复默认位置`;
    grip.innerHTML = '<span aria-hidden="true">⋮⋮</span>';
    return grip;
  }
  function createThemeButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'call-theme-option-v4';
    button.dataset.callThemeOption = item.key;
    button.title = item.label;
    button.setAttribute('aria-label', `切换为${item.label}主题`);
    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = item.glyph;
    const label = document.createElement('span');
    label.className = 'call-sr-only-v4';
    label.textContent = item.label;
    button.append(glyph, label);
    button.addEventListener('click', () => setTheme(item.key, true));
    return button;
  }

  function ensureFallbackRail() {
    let rail = document.querySelector('.call-quick-rail-v10, .suite-quick-rail-v7');
    if (rail) return rail;
    const tool = document.body?.dataset.suiteTool;
    if (tool === 'runes') {
      rail = document.createElement('aside');
      rail.className = 'suite-quick-rail-v7 call-generated-rail-v4';
      rail.setAttribute('aria-label', '页面快捷操作');
      const defs = [
        ['顶部','跳到页面顶部',() => window.scrollTo({top:0,behavior:'smooth'})],
        ['底部','跳到页面底部',() => window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'})]
      ];
      for (const [caption,label,action] of defs) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = caption;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', action);
        rail.appendChild(button);
      }
      document.body.appendChild(rail);
    }
    return rail;
  }

  function installThemeWidget() {
    if (!document.body) return null;
    document.querySelectorAll('.call-theme-dock-v2,.call-theme-toggle-v1,.call-floating-controller-v3').forEach((node) => node.remove());
    let widget = document.querySelector('.call-theme-widget-v4');
    if (widget) return widget;
    widget = document.createElement('div');
    widget.className = 'call-floating-widget-v4 call-theme-widget-v4';
    widget.setAttribute('role','group');
    widget.setAttribute('aria-label','主题与画面设置');
    const grip = createGrip('拖动主题控件');
    const themes = document.createElement('div');
    themes.className = 'call-theme-options-v4';
    for (const item of THEMES) themes.appendChild(createThemeButton(item));
    const fx = document.createElement('button');
    fx.type = 'button';
    fx.className = 'call-floating-utility-v4';
    fx.textContent = '⚙';
    fx.setAttribute('aria-label','打开画面效果设置');
    fx.title = '画面效果设置';
    fx.addEventListener('click', () => {
      state.fxOpen = !state.fxOpen;
      persistVisualState();
      syncFxPanel();
    });
    widget.append(grip,themes,fx);
    document.body.appendChild(widget);
    makeDraggable(widget,grip,THEME_POS_KEY);
    return widget;
  }

  function installJumpWidget() {
    if (!document.body) return null;
    let widget = document.querySelector('.call-jump-widget-v4');
    if (!widget) {
      widget = document.createElement('div');
      widget.className = 'call-floating-widget-v4 call-jump-widget-v4';
      widget.setAttribute('role','group');
      widget.setAttribute('aria-label','页面跳转工具');
      const grip = createGrip('拖动跳转工具');
      const host = document.createElement('div');
      host.className = 'call-jump-actions-v4';
      host.dataset.quickRailHost = 'true';
      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'call-jump-collapse-v4';
      collapse.dataset.jumpCollapse = 'true';
      collapse.addEventListener('click', () => {
        state.jumpCollapsed = !state.jumpCollapsed;
        persistVisualState();
        syncJumpState();
      });
      widget.append(grip,host,collapse);
      document.body.appendChild(widget);
      makeDraggable(widget,grip,JUMP_POS_KEY);
    }
    const rail = ensureFallbackRail();
    const host = widget.querySelector('[data-quick-rail-host]');
    if (rail && host && rail.parentElement !== host) host.appendChild(rail);
    root.dataset.callControlsReady = 'true';
    syncJumpState();
    return widget;
  }

  function checkboxRow(key) {
    const label = document.createElement('label');
    label.className = 'call-fx-toggle-row-v4';
    const text = document.createElement('span');
    text.textContent = EFFECT_LABELS[key];
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role','switch');
    input.dataset.fxKey = key;
    input.setAttribute('aria-label',EFFECT_LABELS[key]);
    input.addEventListener('change', () => setEffect(key,input.checked));
    label.append(text,input);
    return label;
  }

  function installFxWindow() {
    if (!document.body) return null;
    let panel = document.querySelector('.call-fx-window-v4');
    if (panel) return panel;
    document.querySelector('.call-fx-window-v3')?.remove();
    panel = document.createElement('section');
    panel.className = 'call-floating-widget-v4 call-fx-window-v4';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','画面与字体效果设置');

    const titlebar = document.createElement('header');
    titlebar.className = 'call-fx-titlebar-v4';
    const grip = createGrip('拖动画面设置窗口');
    grip.classList.add('call-fx-grip-v4');
    const title = document.createElement('div');
    title.className = 'call-fx-title-copy-v4';
    title.innerHTML = '<small>SYS://DISPLAY.CONFIG</small><strong>画面与字体效果</strong>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'call-fx-close-v4';
    close.textContent = '×';
    close.setAttribute('aria-label','关闭画面设置');
    close.addEventListener('click', () => {
      state.fxOpen = false;
      persistVisualState();
      syncFxPanel();
    });
    titlebar.append(grip,title,close);

    const body = document.createElement('div');
    body.className = 'call-fx-body-v4';
    const intro = document.createElement('p');
    intro.className = 'call-fx-intro-v4';
    intro.innerHTML = '当前主题：<strong data-fx-theme-label></strong>。夜间默认启用 Reader CRT 全效果；冷辉默认启用胶片磨损与裂纹。其他主题保存独立设置。';

    const phosphor = document.createElement('fieldset');
    phosphor.className = 'call-fx-phosphor-v4';
    phosphor.dataset.phosphorSection = 'true';
    phosphor.innerHTML = '<legend>夜间显像管颜色</legend>';
    const seg = document.createElement('div');
    seg.className = 'call-fx-segment-v4';
    for (const [value,label] of [['green','绿磷光'],['amber','橙磷光']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.phosphor = value;
      button.textContent = label;
      button.addEventListener('click', () => setPhosphor(value));
      seg.appendChild(button);
    }
    phosphor.appendChild(seg);

    const effects = document.createElement('fieldset');
    effects.className = 'call-fx-effects-v4';
    effects.innerHTML = '<legend>屏幕与字体效果</legend>';
    for (const key of EFFECT_KEYS) effects.appendChild(checkboxRow(key));

    const iosNote = document.createElement('p');
    iosNote.className = 'call-fx-ios-note-v4';
    iosNote.dataset.iosNote = 'true';
    iosNote.textContent = 'iOS 性能路径：保留自然噪点、扫描线、色散、发光、Frost 裂纹与轻曲面；SVG 全屏位移与连续抖动自动降级。';

    const footer = document.createElement('footer');
    footer.className = 'call-fx-footer-v4';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '恢复本主题默认效果';
    reset.addEventListener('click', resetEffects);
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = '关闭';
    done.addEventListener('click', () => {
      state.fxOpen = false;
      persistVisualState();
      syncFxPanel();
    });
    footer.append(reset,done);
    body.append(intro,phosphor,effects,iosNote,footer);
    panel.append(titlebar,body);
    document.body.appendChild(panel);
    makeDraggable(panel,grip,FX_POS_KEY);
    syncFxPanel();
    return panel;
  }

  function observeRails() {
    if (typeof MutationObserver !== 'function') return;
    new MutationObserver(() => {
      const host = document.querySelector('.call-jump-widget-v4 [data-quick-rail-host]');
      const rail = document.querySelector('body > .call-quick-rail-v10, body > .suite-quick-rail-v7');
      if (host && rail) host.appendChild(rail);
    }).observe(document.body,{childList:true});
  }

  function install() {
    makeNoiseTexture();
    installOpticsDefinitions();
    installOpticalLayers();
    installThemeWidget();
    installJumpWidget();
    installFxWindow();
    observeRails();
    applyAll();
    window.addEventListener('storage', (event) => {
      if (event.key === THEME_KEY && VALID_THEMES.has(event.newValue)) setTheme(event.newValue,false);
    });
    root.dataset.callThemeReady = 'v4';
    window.__MAGIRECO_CALL_THEME__ = Object.freeze({
      version:4,
      release:RELEASE,
      visualLanguage:'reader-terminal-v4',
      themes:THEMES.map((item)=>item.key),
      effects:EFFECT_KEYS.slice(),
      iosOptimized:isIOS,
      get theme(){ return activeTheme; },
      get phosphor(){ return state.phosphor; },
      setTheme,setPhosphor,setEffect,resetEffects
    });
  }

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded',install,{once:true});
})();