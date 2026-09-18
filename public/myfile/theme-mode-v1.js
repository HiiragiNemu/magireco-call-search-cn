(() => {
  'use strict';

  const RELEASE = 'reader-terminal-fx-v3-20260919';
  const THEME_KEY = 'magireco-call-theme-v2';
  const LEGACY_THEME_KEY = 'magireco-call-theme-v1';
  const VISUAL_KEY = 'magireco-call-visual-v3';
  const CONTROLLER_POS_KEY = 'magireco-call-controller-position-v3';
  const FX_WINDOW_POS_KEY = 'magireco-call-fx-window-position-v3';
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
    noise: '屏幕噪点 / 颗粒',
    registration: '色散 / 套色偏移',
    blur: '低保真软焦',
    bloom: '磷光发光',
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
    try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }
  function clonePreset(theme) {
    return { ...(PRESETS[theme] || PRESETS.paper) };
  }
  function parseVisualState() {
    try {
      const parsed = JSON.parse(storageGet(VISUAL_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad state');
      const effects = {};
      for (const theme of THEMES.map((item) => item.key)) {
        const source = parsed.effects?.[theme];
        const next = clonePreset(theme);
        if (source && typeof source === 'object') {
          for (const key of EFFECT_KEYS) {
            if (typeof source[key] === 'boolean') next[key] = source[key];
          }
        }
        effects[theme] = next;
      }
      return {
        effects,
        phosphor: parsed.phosphor === 'amber' ? 'amber' : 'green',
        fxOpen: Boolean(parsed.fxOpen),
        controllerCollapsed: Boolean(parsed.controllerCollapsed)
      };
    } catch (_) {
      const effects = {};
      for (const item of THEMES) effects[item.key] = clonePreset(item.key);
      return { effects, phosphor: 'green', fxOpen: false, controllerCollapsed: false };
    }
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
  function setBrowserChrome(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    if (meta) meta.content = THEME_COLORS[theme] || THEME_COLORS.paper;
  }
  function effectValue(theme, key) {
    return Boolean(state.effects?.[theme]?.[key]);
  }
  function applyDatasets() {
    root.dataset.callTheme = activeTheme;
    root.dataset.callPhosphor = state.phosphor;
    root.dataset.callIos = String(isIOS);
    root.dataset.callReducedMotion = String(reduceMotion);
    root.dataset.callVisualLanguage = 'reader-terminal-v3';
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
    const panel = document.querySelector('.call-fx-window-v3');
    if (!panel) return;
    panel.dataset.theme = activeTheme;
    panel.hidden = !state.fxOpen;
    const themeName = THEMES.find((item) => item.key === activeTheme)?.label || activeTheme;
    const title = panel.querySelector('[data-fx-theme-label]');
    if (title) title.textContent = themeName;
    for (const input of panel.querySelectorAll('input[data-fx-key]')) {
      const key = input.dataset.fxKey;
      input.checked = effectValue(activeTheme, key);
      const frostOnly = key === 'cracks';
      input.disabled = frostOnly && activeTheme !== 'frost';
      input.closest('label')?.classList.toggle('is-disabled', input.disabled);
    }
    panel.querySelector('[data-phosphor-section]')?.toggleAttribute('hidden', activeTheme !== 'dark');
    for (const button of panel.querySelectorAll('[data-phosphor]')) {
      button.setAttribute('aria-pressed', String(button.dataset.phosphor === state.phosphor));
    }
    const iosNote = panel.querySelector('[data-ios-note]');
    if (iosNote) iosNote.hidden = !isIOS;
  }
  function syncControllerState() {
    const widget = document.querySelector('.call-floating-controller-v3');
    if (!widget) return;
    widget.classList.toggle('is-collapsed', state.controllerCollapsed);
    const collapse = widget.querySelector('[data-controller-collapse]');
    if (collapse) {
      collapse.textContent = state.controllerCollapsed ? '＋' : '－';
      collapse.setAttribute('aria-label', state.controllerCollapsed ? '展开悬浮控件' : '收起悬浮控件');
      collapse.title = state.controllerCollapsed ? '展开悬浮控件' : '收起悬浮控件';
    }
  }
  function applyAll() {
    applyDatasets();
    syncThemeButtons();
    syncFxPanel();
    syncControllerState();
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
    if (!state.effects[activeTheme]) state.effects[activeTheme] = clonePreset(activeTheme);
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

  function installOpticalLayers() {
    if (!document.body || document.querySelector('.call-reader-screen-v3')) return;
    const surface = document.createElement('div');
    surface.className = 'call-reader-screen-v3';
    surface.setAttribute('aria-hidden', 'true');
    for (const className of [
      'call-fx-soften-v3',
      'call-fx-bloom-v3',
      'call-fx-scanlines-v3',
      'call-fx-noise-v3',
      'call-fx-cracks-v3',
      'call-fx-vignette-v3'
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
  function clampPoint(rootNode, point) {
    const rect = rootNode.getBoundingClientRect();
    return {
      x: Math.min(Math.max(VIEWPORT_MARGIN, point.x), Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN)),
      y: Math.min(Math.max(VIEWPORT_MARGIN, point.y), Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN))
    };
  }
  function applyPoint(rootNode, point) {
    if (!point) {
      rootNode.style.removeProperty('left');
      rootNode.style.removeProperty('top');
      rootNode.style.removeProperty('right');
      rootNode.style.removeProperty('bottom');
      return;
    }
    const next = clampPoint(rootNode, point);
    rootNode.style.left = `${next.x}px`;
    rootNode.style.top = `${next.y}px`;
    rootNode.style.right = 'auto';
    rootNode.style.bottom = 'auto';
  }
  function makeDraggable(rootNode, handle, storageBase) {
    if (!rootNode || !handle || rootNode.dataset.dragReady === 'true') return;
    rootNode.dataset.dragReady = 'true';
    let drag = null;
    let frame = 0;
    const restore = () => {
      const stored = parsePoint(storageGet(orientationKey(storageBase)));
      if (stored) requestAnimationFrame(() => applyPoint(rootNode, stored));
    };
    const persist = () => {
      const rect = rootNode.getBoundingClientRect();
      storageSet(orientationKey(storageBase), JSON.stringify({ x: rect.left, y: rect.top }));
    };
    const onMove = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const next = { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY };
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyPoint(rootNode, next));
    };
    const finish = (event, save) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      rootNode.classList.remove('is-dragging');
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
      if (save) persist();
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const rect = rootNode.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture?.(event.pointerId);
      drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      rootNode.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', (event) => finish(event, true));
    handle.addEventListener('pointercancel', (event) => finish(event, false));
    handle.addEventListener('dblclick', () => {
      storageSet(orientationKey(storageBase), '');
      applyPoint(rootNode, null);
    });
    window.addEventListener('resize', () => {
      const rect = rootNode.getBoundingClientRect();
      if (rect.left < VIEWPORT_MARGIN || rect.top < VIEWPORT_MARGIN || rect.right > window.innerWidth - VIEWPORT_MARGIN || rect.bottom > window.innerHeight - VIEWPORT_MARGIN) {
        applyPoint(rootNode, { x: rect.left, y: rect.top });
        persist();
      }
    }, { passive: true });
    restore();
  }

  function createThemeButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'call-theme-option-v3';
    button.dataset.callThemeOption = item.key;
    button.title = item.label;
    button.setAttribute('aria-label', `切换为${item.label}主题`);
    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = item.glyph;
    const label = document.createElement('span');
    label.className = 'call-sr-only-v3';
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
      rail.className = 'suite-quick-rail-v7 call-generated-rail-v3';
      rail.setAttribute('aria-label', '页面快捷操作');
      const defs = [
        ['顶部', '跳到页面顶部', () => window.scrollTo({ top: 0, behavior: 'smooth' })],
        ['底部', '跳到页面底部', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })]
      ];
      for (const [caption, label, action] of defs) {
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

  function installController() {
    if (!document.body) return null;
    document.querySelectorAll('.call-theme-dock-v2, .call-theme-toggle-v1').forEach((node) => node.remove());
    let widget = document.querySelector('.call-floating-controller-v3');
    if (!widget) {
      widget = document.createElement('div');
      widget.className = 'call-floating-widget-v3 call-floating-controller-v3';
      widget.dataset.defaultDock = 'bottom-right';
      widget.setAttribute('role', 'group');
      widget.setAttribute('aria-label', '页面与画面悬浮控件');

      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'call-floating-grip-v3';
      grip.setAttribute('aria-label', '拖动悬浮控件');
      grip.title = '拖动悬浮控件；双击恢复默认位置';
      grip.innerHTML = '<span aria-hidden="true">⋮⋮</span>';

      const actions = document.createElement('div');
      actions.className = 'call-floating-actions-v3';
      actions.dataset.quickRailHost = 'true';

      const themes = document.createElement('div');
      themes.className = 'call-floating-themes-v3';
      themes.setAttribute('role', 'group');
      themes.setAttribute('aria-label', '站点主题');
      for (const item of THEMES) themes.appendChild(createThemeButton(item));

      const fx = document.createElement('button');
      fx.type = 'button';
      fx.className = 'call-floating-utility-v3';
      fx.dataset.fxOpenButton = 'true';
      fx.setAttribute('aria-label', '打开画面效果设置');
      fx.title = '画面效果设置';
      fx.textContent = '⚙';
      fx.addEventListener('click', () => {
        state.fxOpen = !state.fxOpen;
        persistVisualState();
        syncFxPanel();
      });

      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'call-floating-collapse-v3';
      collapse.dataset.controllerCollapse = 'true';
      collapse.addEventListener('click', () => {
        state.controllerCollapsed = !state.controllerCollapsed;
        persistVisualState();
        syncControllerState();
      });

      widget.append(grip, actions, themes, fx, collapse);
      document.body.appendChild(widget);
      makeDraggable(widget, grip, CONTROLLER_POS_KEY);
    }

    const rail = ensureFallbackRail();
    const host = widget.querySelector('[data-quick-rail-host]');
    if (rail && host && rail.parentElement !== host) host.appendChild(rail);
    root.dataset.callControlsReady = 'true';
    syncThemeButtons();
    syncControllerState();
    return widget;
  }

  function checkboxRow(key) {
    const label = document.createElement('label');
    label.className = 'call-fx-toggle-row-v3';
    const text = document.createElement('span');
    text.textContent = EFFECT_LABELS[key];
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.dataset.fxKey = key;
    input.setAttribute('aria-label', EFFECT_LABELS[key]);
    input.addEventListener('change', () => setEffect(key, input.checked));
    label.append(text, input);
    return label;
  }

  function installFxWindow() {
    if (!document.body) return null;
    let panel = document.querySelector('.call-fx-window-v3');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.className = 'call-floating-widget-v3 call-fx-window-v3';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '画面与字体效果设置');

    const titlebar = document.createElement('header');
    titlebar.className = 'call-fx-titlebar-v3';
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'call-floating-grip-v3 call-fx-grip-v3';
    grip.setAttribute('aria-label', '拖动画面设置窗口');
    grip.title = '拖动设置窗口；双击恢复默认位置';
    grip.innerHTML = '<span aria-hidden="true">⋮⋮</span>';
    const title = document.createElement('div');
    title.className = 'call-fx-title-copy-v3';
    title.innerHTML = '<small>SYS://DISPLAY.CONFIG</small><strong>画面与字体效果</strong>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'call-fx-close-v3';
    close.setAttribute('aria-label', '关闭画面设置');
    close.textContent = '×';
    close.addEventListener('click', () => {
      state.fxOpen = false;
      persistVisualState();
      syncFxPanel();
    });
    titlebar.append(grip, title, close);

    const body = document.createElement('div');
    body.className = 'call-fx-body-v3';
    const intro = document.createElement('p');
    intro.className = 'call-fx-intro-v3';
    intro.innerHTML = '当前主题：<strong data-fx-theme-label></strong>。夜间默认启用曲率、扫描线、噪点、色散、软焦、发光与抖动；其他主题按 Reader 风格保留较轻的默认效果。';

    const phosphor = document.createElement('fieldset');
    phosphor.className = 'call-fx-phosphor-v3';
    phosphor.dataset.phosphorSection = 'true';
    phosphor.innerHTML = '<legend>夜间磷光颜色</legend>';
    const phosphorButtons = document.createElement('div');
    phosphorButtons.className = 'call-fx-segment-v3';
    for (const [value, label] of [['green','绿磷光'], ['amber','橙磷光']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.phosphor = value;
      button.textContent = label;
      button.addEventListener('click', () => setPhosphor(value));
      phosphorButtons.appendChild(button);
    }
    phosphor.appendChild(phosphorButtons);

    const effects = document.createElement('fieldset');
    effects.className = 'call-fx-effects-v3';
    effects.innerHTML = '<legend>屏幕与字体效果</legend>';
    for (const key of EFFECT_KEYS) effects.appendChild(checkboxRow(key));

    const iosNote = document.createElement('p');
    iosNote.className = 'call-fx-ios-note-v3';
    iosNote.dataset.iosNote = 'true';
    iosNote.textContent = 'iOS 性能模式：保持配色、扫描线、噪点、裂纹和文字色散；全屏软焦与连续位移抖动自动降级，避免 WebKit 长时间高合成负载。';

    const footer = document.createElement('footer');
    footer.className = 'call-fx-footer-v3';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '恢复本主题默认效果';
    reset.addEventListener('click', resetEffects);
    const closeFooter = document.createElement('button');
    closeFooter.type = 'button';
    closeFooter.textContent = '关闭';
    closeFooter.addEventListener('click', () => {
      state.fxOpen = false;
      persistVisualState();
      syncFxPanel();
    });
    footer.append(reset, closeFooter);

    body.append(intro, phosphor, effects, iosNote, footer);
    panel.append(titlebar, body);
    document.body.appendChild(panel);
    makeDraggable(panel, grip, FX_WINDOW_POS_KEY);
    syncFxPanel();
    return panel;
  }

  function observeRails() {
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(() => {
      const widget = document.querySelector('.call-floating-controller-v3');
      const host = widget?.querySelector('[data-quick-rail-host]');
      const rail = document.querySelector('body > .call-quick-rail-v10, body > .suite-quick-rail-v7');
      if (host && rail) host.appendChild(rail);
    });
    observer.observe(document.body, { childList: true });
  }

  function install() {
    installOpticalLayers();
    installController();
    installFxWindow();
    observeRails();
    applyAll();
    window.addEventListener('storage', (event) => {
      if (event.key === THEME_KEY && VALID_THEMES.has(event.newValue)) setTheme(event.newValue, false);
    });
    root.dataset.callThemeReady = 'v3';
    window.__MAGIRECO_CALL_THEME__ = Object.freeze({
      version: 3,
      release: RELEASE,
      visualLanguage: 'reader-terminal-v3',
      themes: THEMES.map((item) => item.key),
      effects: EFFECT_KEYS.slice(),
      iosOptimized: isIOS,
      get theme() { return activeTheme; },
      get phosphor() { return state.phosphor; },
      setTheme,
      setPhosphor,
      setEffect,
      resetEffects
    });
  }

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();