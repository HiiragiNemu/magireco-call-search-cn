(() => {
  'use strict';

  const install = () => {
    const button = document.getElementById('menu-btn');
    const label = document.querySelector('label[for="menu-btn"]');
    const menu = document.querySelector('.header .menu');
    const header = document.querySelector('.header');
    if (!(button instanceof HTMLInputElement) || !label || !menu || !header) return;

    menu.id ||= 'site-hamburger-menu';
    label.setAttribute('role', 'button');
    label.setAttribute('tabindex', '0');
    label.setAttribute('aria-controls', menu.id);
    label.setAttribute('aria-label', '打开网站菜单');

    const sync = () => {
      const expanded = button.checked;
      label.setAttribute('aria-expanded', String(expanded));
      label.setAttribute('aria-label', expanded ? '关闭网站菜单' : '打开网站菜单');
      menu.setAttribute('aria-hidden', String(!expanded));
    };

    const close = () => {
      if (!button.checked) return;
      button.checked = false;
      button.dispatchEvent(new Event('change', { bubbles: true }));
    };

    label.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      button.checked = !button.checked;
      button.dispatchEvent(new Event('change', { bubbles: true }));
    });
    button.addEventListener('change', sync);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    document.addEventListener('pointerdown', (event) => {
      if (button.checked && !header.contains(event.target)) close();
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });
    sync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
