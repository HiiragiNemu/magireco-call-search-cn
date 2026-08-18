/* V12/V15 real-device regression repair and call-page menu integration. */
(function (global) {
  'use strict';
  const RELEASE = 'live-regression-repair-v12-20260818';
  const FEATURE_RELEASE = 'story-title-rune-v16-20260818';
  let heightFrame = 0;

  function isCallPage() {
    return !document.body.classList.contains('suite-page')
      && Boolean(document.querySelector('form[name="magicalgirl"]'));
  }

  function hideLegacyCallRail() {
    if (!isCallPage()) return;
    for (const id of ['pagetop', 'pagemdl', 'pagebtm']) {
      const node = document.getElementById(id);
      if (!node) continue;
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('opacity', '0', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  function ensureCallMenuLinks() {
    if (!isCallPage()) return;
    const menu = document.querySelector('.header .menu');
    if (!menu) return;
    const runes = [...menu.querySelectorAll('a')].find((link) => /(?:^|\/)runes\.html(?:$|[?#])/i.test(link.getAttribute('href') || ''));
    if (runes && runes.textContent.trim() !== '魔女文翻译') runes.textContent = '魔女文翻译';

    let editor = [...menu.querySelectorAll('a')].find((link) => /story-title-editor\.html(?:$|[?#])/i.test(link.getAttribute('href') || ''));
    if (!editor) {
      const item = document.createElement('li');
      editor = document.createElement('a');
      editor.href = './story-title-editor.html';
      editor.textContent = '母故事标题翻译清单（管理员）';
      item.appendChild(editor);
      const story = [...menu.querySelectorAll('a')].find((link) => /(?:^|\/)story\.html(?:$|[?#])/i.test(link.getAttribute('href') || ''));
      const anchorItem = runes?.closest('li') || story?.closest('li');
      if (anchorItem) anchorItem.insertAdjacentElement('afterend', item);
      else menu.appendChild(item);
    }

    for (const link of document.querySelectorAll('.suite-nav a')) {
      if (!/runes\.html(?:$|[?#])/i.test(link.getAttribute('href') || '')) continue;
      const spans = link.querySelectorAll('span');
      const target = spans[spans.length - 1] || link;
      if (target.textContent !== '魔女文翻译') target.textContent = '魔女文翻译';
    }
    document.documentElement.dataset.callMenuV15 = 'true';
  }

  function promoteCallSuiteNav() {
    if (!isCallPage()) return;
    const nav = document.querySelector('.suite-nav');
    if (!nav) return;
    const wrapper = document.getElementById('wrapper');
    let spacer = document.querySelector('.call-suite-nav-spacer-v12');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.className = 'call-suite-nav-spacer-v12';
      spacer.setAttribute('aria-hidden', 'true');
    }
    if (nav.parentElement !== document.body) document.body.insertBefore(nav, wrapper || document.body.firstChild);
    if (spacer.parentElement !== document.body) document.body.insertBefore(spacer, wrapper || nav.nextSibling);
    else if (wrapper && spacer.nextSibling !== wrapper) document.body.insertBefore(spacer, wrapper);
    nav.classList.add('call-suite-nav-fixed-v12');
    nav.dataset.v12DocumentFixed = 'true';
    nav.style.setProperty('position', 'fixed', 'important');
    nav.style.setProperty('top', '0', 'important');
    nav.style.setProperty('left', '50%', 'important');
    nav.style.setProperty('transform', 'translateX(-50%)', 'important');
    nav.style.setProperty('z-index', '1950', 'important');
    const height = Math.max(1, Math.ceil(nav.getBoundingClientRect().height || nav.offsetHeight || 0));
    spacer.style.height = `${height}px`;
  }

  function setImportantIfDifferent(node, property, value) {
    if (node.style.getPropertyValue(property) === value
        && node.style.getPropertyPriority(property) === 'important') return;
    node.style.setProperty(property, value, 'important');
  }

  function fitOneHeightViewport(viewport) {
    const stage = viewport.querySelector('.height-chart-stage-v2');
    if (!stage) return;
    const stageHeight = Math.max(1, Math.ceil(stage.getBoundingClientRect().height || stage.offsetHeight || parseFloat(stage.style.height) || 0));
    const borderAndScrollbar = Math.max(2, viewport.offsetHeight - viewport.clientHeight);
    const wanted = Math.ceil(stageHeight + borderAndScrollbar);
    const current = parseFloat(viewport.style.height) || 0;
    viewport.dataset.v12AutoHeight = 'true';
    setImportantIfDifferent(viewport, 'min-height', '0px');
    setImportantIfDifferent(viewport, 'max-height', 'none');
    setImportantIfDifferent(viewport, 'resize', 'none');
    setImportantIfDifferent(viewport, 'overflow-y', 'hidden');
    if (Math.abs(current - wanted) > 1) viewport.style.setProperty('height', `${wanted}px`, 'important');
  }

  function fitHeightViewports() {
    heightFrame = 0;
    for (const viewport of document.querySelectorAll('.height-chart-viewport-v2')) fitOneHeightViewport(viewport);
  }

  function scheduleHeightFit() {
    if (heightFrame) return;
    heightFrame = global.requestAnimationFrame(() => {
      fitHeightViewports();
      global.setTimeout(fitHeightViewports, 80);
    });
  }

  function wrapHeightRenderer() {
    const original = global.displayHeightChart;
    if (typeof original !== 'function' || original.__v12Wrapped) return;
    function displayHeightChartV12(...args) {
      const result = original.apply(this, args);
      scheduleHeightFit();
      return result;
    }
    displayHeightChartV12.__v12Wrapped = true;
    displayHeightChartV12.__v12Original = original;
    global.displayHeightChart = displayHeightChartV12;
  }

  function observeHeightChart() {
    const host = document.getElementById('heightChartContainer');
    if (!host) return;
    new MutationObserver(scheduleHeightFit).observe(host, { childList: true, subtree: true });
    if ('ResizeObserver' in global) new ResizeObserver(scheduleHeightFit).observe(host);
  }

  function enforceCallChrome() {
    promoteCallSuiteNav();
    hideLegacyCallRail();
    ensureCallMenuLinks();
  }

  function init() {
    enforceCallChrome();
    wrapHeightRenderer();
    observeHeightChart();
    scheduleHeightFit();
    new MutationObserver(() => {
      enforceCallChrome();
      scheduleHeightFit();
    }).observe(document.body, { childList: true, subtree: true });
    global.addEventListener('resize', () => {
      enforceCallChrome();
      scheduleHeightFit();
    }, { passive: true });
    global.addEventListener('load', () => {
      enforceCallChrome();
      scheduleHeightFit();
    }, { once: true });
    document.documentElement.dataset.liveV12 = RELEASE;
    document.documentElement.dataset.liveFeatureV16 = FEATURE_RELEASE;
    global.__MAGIRECO_LIVE_V12__ = Object.freeze({
      release: RELEASE,
      featureRelease: FEATURE_RELEASE,
      promoteCallSuiteNav,
      hideLegacyCallRail,
      ensureCallMenuLinks,
      fitHeightViewports
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
