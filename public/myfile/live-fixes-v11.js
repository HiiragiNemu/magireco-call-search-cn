/* V11 live reacceptance: selection feedback and small UI corrections. */
(function (global) {
  'use strict';
  const RELEASE = 'live-reacceptance-v11-20260817';

  function syncCallSelections() {
    for (const label of document.querySelectorAll('label.girlbox')) {
      const input = label.querySelector('input.MagicalChk');
      label.classList.toggle('is-selected-v11', Boolean(input?.checked));
    }
  }

  function syncQuickRail() {
    const buttons = [...document.querySelectorAll('.call-quick-rail-v10 button')];
    const top = buttons.find((button) => button.getAttribute('aria-label') === '跳到页面顶部');
    const bottom = buttons.find((button) => button.getAttribute('aria-label') === '跳到页面底部');
    if (top && top.textContent !== '顶部') top.textContent = '顶部';
    if (bottom && bottom.textContent !== '底部') bottom.textContent = '底部';
    for (const id of ['pagetop', 'pagemdl', 'pagebtm']) {
      const legacy = document.getElementById(id);
      if (legacy) { legacy.hidden = true; legacy.setAttribute('aria-hidden', 'true'); }
    }
  }

  function decorateSuiteCards() {
    // Current catalog entries already carry the original girlbox color classes.
    // Older cached app code may create cards without them, so repair those cards
    // from the catalog without waiting for a full reload of the application.
    const cards = [...document.querySelectorAll('.suite-character-card:not([data-v11-decorated])')];
    if (!cards.length) return;
    fetch('./data/character-catalog.json', { cache: 'force-cache' }).then((response) => response.json()).then((catalog) => {
      const byJp = new Map(catalog.map((entry) => [entry.jp, entry]));
      for (const card of cards) {
        const entry = byJp.get(card.dataset.jp);
        for (const className of entry?.classes || []) if (className !== 'girlbox') card.classList.add(className);
        card.dataset.v11Decorated = 'true';
      }
    }).catch(() => {});
  }

  function init() {
    syncCallSelections();
    syncQuickRail();
    decorateSuiteCards();
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('input.MagicalChk')) syncCallSelections();
    });
    new MutationObserver(() => {
      syncCallSelections();
      syncQuickRail();
      decorateSuiteCards();
    }).observe(document.body, { childList: true, subtree: true });
    document.documentElement.dataset.liveV11 = RELEASE;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
