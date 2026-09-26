(() => {
  'use strict';

  const root = document.documentElement;
  // Slow CSS/scripts and unrelated errors never expose an uninitialized page.
  // A timed-out boot offers explicit recovery instead of automatically revealing.
  const reportPrebootFailure = (reason) => {
    if (typeof window !== 'undefined' && window.CallLoading) {
      window.CallLoading.fail(reason);
      return;
    }
    if (root.dataset.callBootReleased === 'true') return;
    root.dataset.callLoadingState = 'error';
    root.dataset.callLoadingError = reason;
    const showRecovery = () => {
      const cover = document.getElementById('call-loading-screen');
      if (!cover) return;
      cover.querySelector('.call-loading-error').hidden = false;
      cover.querySelector('[data-loading-retry]').addEventListener('click', () => location.reload(), { once:true });
      cover.querySelector('[data-loading-continue]').addEventListener('click', () => {
        root.dataset.callBootReleased = 'true';
        root.dataset.callPreboot = 'false';
        root.dataset.callPrebootRelease = 'user-continue';
      }, { once:true });
    };
    if (document.body) showRecovery();
    else document.addEventListener('DOMContentLoaded', showRecovery, { once:true });
  };
  root.dataset.callPreboot = 'true';
  root.dataset.callBootReleased = 'false';
  root.dataset.callMaterialReady = 'false';
  setTimeout(() => reportPrebootFailure('bootstrap-timeout'), 15000);
  addEventListener('error', () => { root.dataset.callPrebootDiagnostic = 'error'; }, { once:true });
  addEventListener('unhandledrejection', () => { root.dataset.callPrebootDiagnostic = 'rejection'; }, { once:true });

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
    console.error('[theme-preboot] preference bootstrap failed', error);
    reportPrebootFailure('bootstrap-error');
  }
})();
