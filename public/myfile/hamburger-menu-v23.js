(() => {
  'use strict';

  const MENU = "\n\t\t\t<input type=\"checkbox\" class=\"menu-btn\" id=\"menu-btn\">\n\t\t\t<label for=\"menu-btn\" class=\"menu-icon\"><span class=\"navicon\"></span></label>\n\t\t\t<ul class=\"menu\">\n\t\t\t\t<li class=\"call-credit-notice\">使用本工具二创，请注明工具作者以及提供工具链接。</li>\n\t\t\t\t<li><a href=\"./index.html\">称呼与身高</a></li>\n\t\t\t\t<li class=\"menulabel\">■Magia Exedra</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://app.the-timeline.jp/2PACX-1vQSTMVQlcv7SnwCc8NZgGTKry8U5ZehODwgI-F_GPx0FWjJF0M41L_j2N3asfgtdt58NRxoIjc4NJcN\">\n\t\t\t\t\t\t运营时间表\n\t\t\t\t\t</a>\n\t\t\t\t</li>\n\t\t\t\t<li class=\"menulabel\">■魔法纪录</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://app.the-timeline.jp/2PACX-1vTYF8Mj66tnTEhK2jPwzJzwKWJgtC0Y2-PQGIUwVbkO9csvt1IofUzv0LO0X_bjVpVgKCDyel4_jEry\">\n\t\t\t\t\t\t运营时间表\n\t\t\t\t\t</a>\n\t\t\t\t<li><a href=\"./story.html\">角色故事搜索</a></li>\n\t\t\t\t<li><a href=\"./story-title-editor.html\">母故事标题翻译清单（管理员）</a></li>\n\t\t\t\t<li><a href=\"./attendance.html\">共同出场次数排行</a></li>\n\t\t\t\t<li><a href=\"./runes.html\">魔女文翻译</a></li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://docs.google.com/spreadsheets/d/1V0QTP3YZsoc7h5wOC8oqg7NKJpA6ZPyck9yCYfbJGlk/\">\n\t\t\t\t\t\t称呼数据\n\t\t\t\t\t</a>\n\t\t\t\t</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://docs.google.com/spreadsheets/d/1C5fS5cHm4fFwbspdp6Eq_-GC3DnWbm4-7lbXYucoDGA/edit?usp=sharing\">\n\t\t\t\t\t\t活动·运营时间表(Exedra)\n\t\t\t\t\t</a>\n\t\t\t\t</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://docs.google.com/spreadsheets/d/1iP2_UBIvnzQs5MnqOZHDRo7C88PukW46Bcf7wZXdj7g/edit?usp=sharing\">\n\t\t\t\t\t\t活动·运营时间表(魔法纪录)\n\t\t\t\t\t</a>\n\t\t\t\t</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://docs.google.com/spreadsheets/d/1isucgeJQxlF6EkkzTq9bVJ4xc2WTKDG_K85JGNk6Ihw/edit?usp=sharing\">\n\t\t\t\t\t\t角色故事数据(魔法纪录)\n\t\t\t\t\t</a>\n\t\t\t\t</li>\n\t\t\t\t<li class=\"menulabel\">■ 我的其他工具与动态</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://magireader.pages.dev/\" target=\"_blank\">魔法纪录MAGIAEXEDRA 中日双语剧情存档与翻译平台</a>\n\t\t\t\t</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://magiaexedralive2dviewer.pages.dev/\" target=\"_blank\">magia exedra 魔法纪录l2d查看器</a>\n\t\t\t\t</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://space.bilibili.com/625821\" target=\"_blank\">B站MadeInMagius主页找教程</a>\n\t\t\t\t</li>\n\t\t\t\t<li>\n\t\t\t\t\t<a href=\"https://pd.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=2oaXZG3lL1g&attaContentID=e5616861ea2047e3820bf63bb854aa8e&businessType=9&from=181074&biz=ka&mainSourceId=share&subSourceId=others&b=9\" target=\"_blank\">加入QQ交流群 (928098518)</a>\n\t\t\t\t</li>\n\t\t\t\t<li><a href=\"https://magius3dviewer.pages.dev/\" target=\"_blank\" rel=\"noopener noreferrer\">MAGIA EXEDRA 3D网站</a></li>\n                <li><a href=\"https://madeinmagius-site.pages.dev/\" target=\"_blank\" rel=\"noopener noreferrer\">MADE IN MAGIUS下载中心和教程网站</a></li>\n                <li class=\"menulabel\">■ 赞助支持</li>\n                <li><a href=\"https://afdian.com/a/madeinmagius\" target=\"_blank\" rel=\"noopener noreferrer\">赞助支持 MADE IN MAGIUS</a></li>\n\t\t\t</ul>\n\t\t";

  const install = () => {
    const nav = document.querySelector('.suite-nav');
    if (!nav) return;
    let header = document.querySelector('.header');
    if (!header) {
      header = document.createElement('header');
      header.className = 'header';
      header.innerHTML = MENU;
    }
    nav.prepend(header);
    nav.classList.add('call-nav-with-menu');
    const button = document.getElementById('menu-btn');
    const label = document.querySelector('label[for="menu-btn"]');
    const menu = document.querySelector('.header .menu');
    if (!(button instanceof HTMLInputElement) || !label || !menu || !header) return;

    menu.id ||= 'site-hamburger-menu';
    label.setAttribute('role', 'button');
    label.setAttribute('tabindex', '0');
    label.setAttribute('aria-controls', menu.id);
    label.setAttribute('aria-label', '打开网站菜单');

    const fitMenu = () => {
      if (!button.checked) return;
      const scene = nav.closest('.call-display-root-v7');
      const bottom = Math.min(scene?.getBoundingClientRect().bottom || innerHeight,
        window.visualViewport ? visualViewport.offsetTop + visualViewport.height : innerHeight);
      const room = `${Math.max(0, Math.floor(bottom - menu.getBoundingClientRect().top - 24))}px`;
      if (menu.style.getPropertyValue('--call-menu-room') !== room) menu.style.setProperty('--call-menu-room', room);
    };
    const sync = () => {
      const expanded = button.checked;
      label.setAttribute('aria-expanded', String(expanded));
      label.setAttribute('aria-label', expanded ? '关闭网站菜单' : '打开网站菜单');
      menu.setAttribute('aria-hidden', String(!expanded));
      menu.inert = !expanded;
      fitMenu();
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
      if (event.key === 'Escape' && button.checked) { close(); label.focus(); }
    });
    document.addEventListener('pointerdown', (event) => {
      if (button.checked && !header.contains(event.target)) close();
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });
    let frame = 0;
    const scheduleFit = () => {
      if (!button.checked || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; fitMenu(); });
    };
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(nav);
    nav.closest('.call-display-scroll-v7')?.addEventListener('scroll', scheduleFit, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
    window.addEventListener('resize', scheduleFit, { passive: true });
    for (const a of menu.querySelectorAll('a[target="_blank"]')) a.rel = 'noopener noreferrer';
    sync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
