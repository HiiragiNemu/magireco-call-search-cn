/* Keep the public navigation label consistent without fighting V8's observer. */
(function (global) {
  'use strict';
  const RELEASE = 'nav-label-v14-20260818';
  const LABEL = '魔女文翻译';

  function patchRuntimeItems() {
    const items = global.MagiTools?.NAV_ITEMS;
    const item = Array.isArray(items) ? items.find((entry) => entry?.id === 'runes') : null;
    if (item) item.label = LABEL;
  }

  function writeTextNode(target, value) {
    if (!target) return;
    if (target.firstChild?.nodeType === Node.TEXT_NODE) target.firstChild.nodeValue = value;
    else target.appendChild(document.createTextNode(value));
  }

  function patchDom() {
    patchRuntimeItems();
    for (const link of document.querySelectorAll('.suite-nav a')) {
      const href = link.getAttribute('href') || '';
      if (!href.includes('runes.html')) continue;
      const spans = link.querySelectorAll('span');
      writeTextNode(spans[spans.length - 1] || link, LABEL);
    }
    document.documentElement.dataset.navLabelV14 = RELEASE;
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; patchDom(); });
  }

  patchRuntimeItems();
  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(schedule)
    : null;
  if (document.documentElement) observer?.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patchDom, { once: true });
  else patchDom();
})(window);
