(() => {
  'use strict';

  const storageKey = 'magireco-call-theme-v1';
  const dark = 'dark';
  const light = 'light';

  function storedTheme() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === dark || value === light ? value : null;
    } catch {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? dark : light;
  }

  function apply(theme) {
    document.documentElement.dataset.callTheme = theme;
    const button = document.querySelector('.call-theme-toggle-v1');
    if (button) {
      const next = theme === dark ? '日间' : '夜间';
      button.textContent = next;
      button.title = `切换至${next}模式`;
      button.setAttribute('aria-label', `切换至${next}模式`);
      button.setAttribute('aria-pressed', String(theme === dark));
    }
  }

  function save(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // A blocked storage area must not prevent the visual preference from applying.
    }
  }

  function install() {
    apply(storedTheme() || systemTheme());
    if (!document.body || document.querySelector('.call-theme-toggle-v1')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'call-theme-toggle-v1';
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.callTheme === dark ? light : dark;
      save(next);
      apply(next);
    });
    document.body.appendChild(button);
    apply(document.documentElement.dataset.callTheme || systemTheme());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
