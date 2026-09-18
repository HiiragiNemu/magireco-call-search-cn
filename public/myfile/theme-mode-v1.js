(() => {
  'use strict';

  const STORAGE_KEY = 'magireco-call-theme-v2';
  const LEGACY_KEY = 'magireco-call-theme-v1';
  const THEMES = Object.freeze([
    { key: 'light', label: '明亮', glyph: '☀' },
    { key: 'paper', label: '纸张', glyph: '▤' },
    { key: 'green', label: '护眼', glyph: '❧' },
    { key: 'dark', label: '深色', glyph: '☾' },
    { key: 'frost', label: '冷辉', glyph: '▦' }
  ]);
  const VALID = new Set(THEMES.map((item) => item.key));
  const THEME_COLORS = Object.freeze({
    light: '#f4f5f6',
    paper: '#eadfbd',
    green: '#dce9d3',
    dark: '#0d1512',
    frost: '#08151b'
  });

  function readStorage(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function writeStorage(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function storedTheme() {
    const current = readStorage(STORAGE_KEY);
    if (VALID.has(current)) return current;
    const legacy = readStorage(LEGACY_KEY);
    if (legacy === 'dark' || legacy === 'light') return legacy;
    return null;
  }

  function systemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'paper';
    } catch (_) {
      return 'paper';
    }
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

  function syncDock(theme) {
    const dock = document.querySelector('.call-theme-dock-v2');
    if (!dock) return;
    for (const button of dock.querySelectorAll('[data-theme-option]')) {
      const active = button.dataset.themeOption === theme;
      button.setAttribute('aria-pressed', String(active));
      if (active) button.setAttribute('data-active', 'true');
      else button.removeAttribute('data-active');
    }
  }

  function apply(theme, persist) {
    const next = VALID.has(theme) ? theme : 'paper';
    document.documentElement.dataset.callTheme = next;
    document.documentElement.style.colorScheme =
      next === 'dark' || next === 'frost' ? 'dark' : 'light';
    setBrowserChrome(next);
    syncDock(next);

    if (persist) {
      writeStorage(STORAGE_KEY, next);
      try {
        window.dispatchEvent(new CustomEvent('magireco-call-theme-change', {
          detail: { theme: next }
        }));
      } catch (_) {}
    }
    return next;
  }

  const initialTheme = apply(storedTheme() || systemTheme(), false);

  function createThemeButton(option) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'call-theme-option-v2';
    button.dataset.themeOption = option.key;
    button.title = option.label;
    button.setAttribute('aria-label', `切换为${option.label}主题`);
    button.setAttribute('aria-pressed', 'false');

    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = option.glyph;

    const label = document.createElement('span');
    label.className = 'call-theme-label-v2';
    label.textContent = option.label;

    button.append(glyph, label);
    button.addEventListener('click', () => apply(option.key, true));
    return button;
  }

  function installDock() {
    if (!document.body) return;
    document.querySelectorAll('.call-theme-toggle-v1').forEach((node) => node.remove());

    let dock = document.querySelector('.call-theme-dock-v2');
    if (!dock) {
      dock = document.createElement('nav');
      dock.className = 'call-theme-dock-v2';
      dock.setAttribute('aria-label', '站点主题');
      dock.setAttribute('role', 'toolbar');
      for (const option of THEMES) dock.appendChild(createThemeButton(option));
      document.body.appendChild(dock);

      dock.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const buttons = Array.from(dock.querySelectorAll('.call-theme-option-v2'));
        const currentIndex = buttons.indexOf(document.activeElement);
        if (currentIndex < 0) return;
        event.preventDefault();
        const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
        const nextIndex = (currentIndex + (backwards ? -1 : 1) + buttons.length) % buttons.length;
        buttons[nextIndex].focus();
      });
    }
    syncDock(document.documentElement.dataset.callTheme || initialTheme);
  }

  function install() {
    installDock();
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY && VALID.has(event.newValue)) apply(event.newValue, false);
    });
    document.documentElement.dataset.callThemeReady = 'v2';
    window.__MAGIRECO_CALL_THEME__ = Object.freeze({
      version: 2,
      themes: THEMES.map((item) => item.key),
      get theme() { return document.documentElement.dataset.callTheme || initialTheme; },
      setTheme(theme) { return apply(theme, true); }
    });
  }

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();