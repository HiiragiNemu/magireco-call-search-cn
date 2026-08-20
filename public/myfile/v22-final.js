(() => {
  'use strict';

  const BUILD = 'v22-authority-20260820';
  const OBSOLETE_TITLE = '魔法纪录·Magia Exedra 魔法少女称呼搜索';
  const MAP_URLS = [
    '/data/story-title-authority-v22.json',
    './data/story-title-authority-v22.json',
    '/downloads/story-title-authority-v22.json'
  ];
  const KANA_RE = /[ぁ-ゖァ-ヺー]/u;
  const NO_RE = /^\s*No\.\s*(\d+)\b/i;
  let authority = new Map();
  let scheduled = false;

  const normalize = (value) => String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u3000]/g, ' ')
    .replace(/[「」『』【】\[\]()（）]/g, '')
    .replace(/[～〜]/g, '~')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();

  function removeObsoleteHeading(root = document) {
    const candidates = root.querySelectorAll?.(
      '.navtext-container, header, h1, h2, .site-title, .site-title-bar, [class*="navtext"]'
    ) ?? [];
    for (const element of candidates) {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === OBSOLETE_TITLE || (
        text.includes('魔法纪录') &&
        text.includes('Magia Exedra') &&
        text.includes('魔法少女称呼搜索')
      )) {
        element.dataset.v22ObsoleteSiteTitle = 'true';
        element.remove();
      }
    }
  }

  function unlockDocument() {
    document.documentElement.classList.remove('menu-open', 'nav-open', 'is-menu-open');
    document.body?.classList.remove('menu-open', 'nav-open', 'is-menu-open');
    if (document.body) {
      const style = getComputedStyle(document.body);
      if (style.overflowY === 'hidden' || style.overflow === 'hidden') {
        document.body.style.setProperty('overflow-y', 'auto', 'important');
      }
    }
  }

  function scoreMenu(element) {
    if (!(element instanceof HTMLElement)) return -1;
    const links = element.querySelectorAll('a, button').length;
    const text = (element.textContent || '').trim();
    if (!links || !text) return -1;
    const rect = element.getBoundingClientRect();
    let score = links * 4;
    if (/称呼搜索|运营时间表|共同出场|魔女文翻译|角色故事/.test(text)) score += 30;
    if (/menu|drawer|hamburger|nav/i.test(element.className || '')) score += 10;
    if (rect.width >= innerWidth * 0.85) score += 6;
    return score;
  }

  function markMenuPanel() {
    const selectors = [
      '.hamburger-menu .menu', '.menu-panel', '.drawer-menu', 'nav.menu',
      '#menu', '.menu'
    ];
    const candidates = [...new Set(selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
    ))];
    candidates.sort((a, b) => scoreMenu(b) - scoreMenu(a));
    const panel = candidates.find((item) => scoreMenu(item) >= 10);
    if (!panel) return;
    panel.dataset.v22MenuPanel = 'true';
    panel.style.setProperty('width', 'max-content', 'important');
    panel.style.setProperty('max-width', 'min(92vw, 42rem)', 'important');
    panel.style.setProperty('height', 'auto', 'important');
    panel.style.setProperty('max-height', 'calc(100dvh - 16px)', 'important');
  }

  function closeLegacyMenu() {
    const checks = document.querySelectorAll(
      'input[type="checkbox"].menu-btn, #menu-btn, input[type="checkbox"][id*="menu"]'
    );
    for (const input of checks) {
      if (input.checked) {
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    unlockDocument();
  }

  function installMenuAccessibility() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeLegacyMenu();
    }, { passive: true });

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches('.menu-btn, #menu-btn, [id*="menu"]')) return;
      queueMicrotask(() => {
        markMenuPanel();
        unlockDocument();
      });
    });
  }

  function readOriginalFromRow(input) {
    const row = input.closest('tr, li, .row, .result-row, .story-row, [data-row]') || input.parentElement;
    if (!row) return '';
    const explicit = row.querySelector(
      '[data-title-ja], [data-japanese-title], .title-ja, .jp-title, .original-title, .story-title-original'
    );
    if (explicit && explicit !== input) return explicit.textContent?.trim() || '';

    const strings = [...row.querySelectorAll('th, td, div, span, strong, b, a')]
      .filter((node) => !node.contains(input) && node !== input)
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return strings.find((text) => KANA_RE.test(text) || NO_RE.test(text)) || '';
  }

  function applyAuthorityToInputs(root = document) {
    if (!authority.size) return;
    const inputs = root.querySelectorAll?.('input[type="text"], textarea, [contenteditable="true"]') ?? [];
    for (const input of inputs) {
      if (!(input instanceof HTMLElement)) continue;
      const original = input.dataset.titleJa || input.dataset.japaneseTitle || readOriginalFromRow(input);
      if (!original) continue;
      const entry = authority.get(normalize(original));
      if (!entry?.zh) continue;

      const current = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
        ? input.value
        : input.textContent || '';
      const shouldReplace = !current.trim() || KANA_RE.test(current) || normalize(current) === normalize(original);
      if (!shouldReplace) continue;

      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.value = entry.zh;
      } else {
        input.textContent = entry.zh;
      }
      input.dataset.v22Authority = entry.source || 'authority-map';
      input.title = input.title || `译名来源：${entry.source || '权威映射'}`;
    }
  }

  function naturalNo(value) {
    const match = String(value || '').match(NO_RE);
    return match ? Number(match[1]) : null;
  }

  function reorderNumericNoRows(root = document) {
    const containers = root.querySelectorAll?.(
      'tbody, ul, ol, .results, .result-list, .story-list, [data-results]'
    ) ?? [];
    for (const container of containers) {
      const children = [...container.children];
      if (children.length < 3 || children.length > 5000) continue;
      const numbered = children.map((child, index) => ({
        child,
        index,
        number: naturalNo((child.textContent || '').trim())
      })).filter((item) => item.number !== null);
      if (numbered.length < 2 || numbered.length < children.length * 0.7) continue;

      const sorted = [...children].sort((a, b) => {
        const an = naturalNo((a.textContent || '').trim());
        const bn = naturalNo((b.textContent || '').trim());
        if (an === null && bn === null) return 0;
        if (an === null) return 1;
        if (bn === null) return -1;
        return an - bn;
      });
      if (sorted.every((child, index) => child === children[index])) continue;
      const fragment = document.createDocumentFragment();
      sorted.forEach((child) => fragment.appendChild(child));
      container.appendChild(fragment);
    }
  }

  function applyAll(root = document) {
    removeObsoleteHeading(root);
    markMenuPanel();
    unlockDocument();
    applyAuthorityToInputs(root);
    reorderNumericNoRows(root);
    document.documentElement.dataset.v22Build = BUILD;
  }

  function scheduleApply(root = document) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyAll(root);
    });
  }

  async function loadAuthority() {
    for (const url of MAP_URLS) {
      try {
        const response = await fetch(`${url}?build=${encodeURIComponent(BUILD)}`, {
          cache: 'no-store',
          credentials: 'same-origin'
        });
        if (!response.ok) continue;
        const payload = await response.json();
        const entries = Array.isArray(payload) ? payload : payload.entries;
        if (!Array.isArray(entries)) continue;
        authority = new Map(entries
          .filter((item) => item && item.ja && item.zh)
          .map((item) => [normalize(item.ja), item]));
        applyAll(document);
        return;
      } catch (_) {
        // Try the next relative location. The static site can be served from
        // both domain root and a local directory during validation.
      }
    }
  }

  function boot() {
    installMenuAccessibility();
    applyAll(document);
    loadAuthority();
    const observer = new MutationObserver((mutations) => {
      const root = mutations.find((mutation) => mutation.addedNodes.length)?.target || document;
      scheduleApply(root instanceof Element ? root : document);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
