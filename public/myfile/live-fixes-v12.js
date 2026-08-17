/* V12 real-device regression repair. */
(function (global) {
  'use strict';
  const RELEASE = 'live-regression-repair-v12-20260818';
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

  function promoteCallSuiteNav() {
    if (!isCallPage()) return;
    const nav = document.querySelector('.suite-nav');
    if (!nav) return;
    if (nav.parentElement !== document.body) {
      const wrapper = document.getElementById('wrapper');
      document.body.insertBefore(nav, wrapper || document.body.firstChild);
    }
    nav.dataset.v12DocumentSticky = 'true';
    nav.style.setProperty('position', 'sticky', 'important');
    nav.style.setProperty('top', '0', 'important');
    nav.style.setProperty('z-index', '1950', 'important');
  }

  function fitOneHeightViewport(viewport) {
    const stage = viewport.querySelector('.height-chart-stage-v2');
    if (!stage) return;

    // site-correction-v2 already writes the scaled natural dimensions onto the
    // stage. Use that exact in-flow height instead of the historical 72/76vh box.
    const stageHeight = Math.max(
      1,
      Math.ceil(stage.getBoundingClientRect().height || stage.offsetHeight || parseFloat(stage.style.height) || 0)
    );
    const borderAndScrollbar = Math.max(2, viewport.offsetHeight - viewport.clientHeight);
    const wanted = Math.ceil(stageHeight + borderAndScrollbar);
    const current = parseFloat(viewport.style.height) || 0;

    viewport.dataset.v12AutoHeight = 'true';
    viewport.style.setProperty('min-height', '0', 'important');
    viewport.style.setProperty('max-height', 'none', 'important');
    viewport.style.setProperty('resize', 'none', 'important');
    viewport.style.setProperty('overflow-y', 'hidden', 'important');
    if (Math.abs(current - wanted) > 1) {
      viewport.style.setProperty('height', `${wanted}px`, 'important');
    }
  }

  function fitHeightViewports() {
    heightFrame = 0;
    for (const viewport of document.querySelectorAll('.height-chart-viewport-v2')) {
      fitOneHeightViewport(viewport);
    }
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
    new MutationObserver(scheduleHeightFit).observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    if ('ResizeObserver' in global) {
      const resize = new ResizeObserver(scheduleHeightFit);
      resize.observe(host);
    }
  }

  function enforceCallChrome() {
    promoteCallSuiteNav();
    hideLegacyCallRail();
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

    global.addEventListener('resize', scheduleHeightFit, { passive: true });
    global.addEventListener('load', () => {
      enforceCallChrome();
      scheduleHeightFit();
    }, { once: true });

    document.documentElement.dataset.liveV12 = RELEASE;
    global.__MAGIRECO_LIVE_V12__ = Object.freeze({
      release: RELEASE,
      promoteCallSuiteNav,
      hideLegacyCallRail,
      fitHeightViewports
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
