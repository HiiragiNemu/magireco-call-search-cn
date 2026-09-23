(() => {
  'use strict';

  const root = document.documentElement;
  const releasePreboot = (reason = 'ready') => {
    if(typeof window!=='undefined' && window.CallLoading){ return; }
    root.dataset.callPreboot = 'false';
    root.dataset.callMaterialReady = 'true';
    root.dataset.callPrebootRelease = reason;
  };

  // The boot layer is decorative only. Schedule the escape hatch before any
  // preference/theme work so a runtime failure can never make the site unusable.
  root.dataset.callPreboot = 'true';
  root.dataset.callMaterialReady = 'false';
  setTimeout(() => releasePreboot('watchdog'), 3600);
  addEventListener('error', () => releasePreboot('error'), { once: true });
  addEventListener('unhandledrejection', () => releasePreboot('rejection'), { once: true });
  addEventListener('pageshow', () => {
    if (root.dataset.callPreboot === 'true') {
      setTimeout(() => releasePreboot('pageshow-watchdog'), 3600);
    }
  }, { once: true });

  try {
    const valid = new Set(['light', 'paper', 'green', 'dark', 'frost']);
    const get = (key) => {
      try { return localStorage.getItem(key); }
      catch (_) { return null; }
    };

    let theme = get('magireco-call-theme-v2');
    if (!valid.has(theme)) {
      const legacy = get('magireco-call-theme-v1');
      const prefersDark = typeof matchMedia === 'function' &&
        matchMedia('(prefers-color-scheme: dark)').matches;
      theme = legacy === 'dark' || legacy === 'light'
        ? legacy
        : (prefersDark ? 'dark' : 'paper');
    }

    const defaults = {
      light:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false },
      paper:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false },
      green:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false },
      dark:{ curvature:true,scanlines:true,noise:true,pixelFont:false,registration:true,glassDamage:false },
      frost:{ curvature:false,scanlines:false,noise:false,pixelFont:false,registration:true,glassDamage:false }
    };

    let state = {};
    try {
      state = JSON.parse(get('magireco-call-visual-v7-5') || get('magireco-call-visual-v7-4') || '{}') || {};
    } catch (_) {
      state = {};
    }

    const ua = navigator.userAgent || '';
    const isIOS = /AppleWebKit/.test(ua) && (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    root.dataset.callIos = String(isIOS);
    root.dataset.callIosFlat = String(isIOS);
    defaults.dark.pixelFont = state.phosphor === 'amber';
    const effects = { ...defaults[theme], ...(state.effects?.[theme] || {}) };
    if(theme === 'dark' && typeof state.nightPixelFonts?.[state.phosphor === 'amber' ? 'amber' : 'green'] === 'boolean') {
      effects.pixelFont = state.nightPixelFonts[state.phosphor === 'amber' ? 'amber' : 'green'];
    }
    if (isIOS) effects.curvature = false;

    root.dataset.callTheme = theme;
    root.dataset.callPhosphor = state.phosphor === 'amber' ? 'amber' : 'green';
    root.dataset.callThemeBarMode = state.themeBarMode === 'floating' ? 'floating' : 'top';
    root.style.colorScheme = (theme === 'dark' || theme === 'frost') ? 'dark' : 'light';

    for (const [key, value] of Object.entries(effects)) {
      root.dataset['callFx' + key[0].toUpperCase() + key.slice(1)] = String(Boolean(value));
    }
  } catch (error) {
    console.error('[theme-preboot] preference bootstrap failed; revealing page', error);
    releasePreboot('bootstrap-error');
  }
})();
