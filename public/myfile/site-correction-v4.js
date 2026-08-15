/* Height-guide V4: connect visible characters to the nearest visible cm ruler. */
(function (global) {
  'use strict';

  const RELEASE = 'neo11-height-guide-v4-20260816';
  const STORAGE_KEY = 'magireco-height-guide-mode-v4';
  const ALLOWED_MODES = new Set(['visible-nearest', 'all-left', 'all-right']);
  const V2 = global.__MAGIRECO_CORRECTION_V2__;
  const V3 = global.__MAGIRECO_CORRECTION_V3__;
  if (!V2 || !V3) return;

  function initialMode() {
    try {
      const value = global.localStorage.getItem(STORAGE_KEY);
      return ALLOWED_MODES.has(value) ? value : 'visible-nearest';
    } catch {
      return 'visible-nearest';
    }
  }

  const state = {
    mode: initialMode(),
    pairs: [],
    frame: 0,
    scrollSequence: 0,
    resizeObserver: null
  };

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const px = (value) => Number.parseFloat(String(value || '')) || 0;

  function persistMode() {
    try { global.localStorage.setItem(STORAGE_KEY, state.mode); } catch { /* storage is optional */ }
  }

  function modeLabel(mode) {
    if (mode === 'all-left') return '全部角色 → 统一连接左侧厘米尺';
    if (mode === 'all-right') return '全部角色 → 统一连接右侧厘米尺';
    return '视野内角色 → 自动连接最近厘米尺';
  }

  function findExistingHelp(controls) {
    return [...controls.querySelectorAll('span')].find((element) =>
      /每名角色|身高横线|厘米尺|身高线/u.test(element.textContent || '')
      && !element.matches('[data-height-scale-readout-v2], .height-guide-status-v4'));
  }

  function ensureGuideControls() {
    const controls = document.querySelector('.height-zoom-controls-v2');
    if (!controls) return;

    let wrapper = controls.querySelector('.height-guide-mode-v4');
    if (!wrapper) {
      wrapper = document.createElement('label');
      wrapper.className = 'height-guide-mode-v4';
      wrapper.append(document.createTextNode('角色身高线：'));

      const select = document.createElement('select');
      select.dataset.heightGuideModeV4 = '';
      select.setAttribute('aria-label', '角色身高线显示方式');
      for (const [value, label] of [
        ['visible-nearest', '视野内 → 最近厘米尺'],
        ['all-left', '全部角色 → 统一左尺'],
        ['all-right', '全部角色 → 统一右尺']
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
      select.value = state.mode;
      select.addEventListener('change', () => {
        state.mode = ALLOWED_MODES.has(select.value) ? select.value : 'visible-nearest';
        persistMode();
        scheduleGuideUpdate();
      });
      wrapper.appendChild(select);

      const help = findExistingHelp(controls);
      controls.insertBefore(wrapper, help || null);

      const status = document.createElement('span');
      status.className = 'height-guide-status-v4';
      status.setAttribute('role', 'status');
      controls.insertBefore(status, help || null);

      if (help) {
        help.classList.add('height-guide-help-v4');
        help.textContent = '默认只显示当前横向视野内完整可见的角色，并让每条线连接离角色最近的左/右厘米尺；可切换为所有角色统一连接左尺或右尺。';
      }
    } else {
      const select = wrapper.querySelector('select');
      if (select && select.value !== state.mode) select.value = state.mode;
    }
  }

  function makePairs(plot) {
    const guidesByName = new Map();
    for (const guide of plot.querySelectorAll('.height-point-guide-v2')) {
      const name = guide.dataset.character || '';
      const list = guidesByName.get(name) || [];
      list.push(guide);
      guidesByName.set(name, list);
    }

    const used = new Map();
    const pairs = [];
    for (const point of plot.querySelectorAll('.height-point-v2')) {
      const name = point.dataset.character || point.querySelector('img')?.alt || '';
      const list = guidesByName.get(name) || [];
      const index = used.get(name) || 0;
      const guide = list[index] || null;
      used.set(name, index + 1);
      if (!guide) continue;

      const pairId = `height-v4-${pairs.length}`;
      point.dataset.heightGuidePairV4 = pairId;
      guide.dataset.heightGuidePairV4 = pairId;
      guide.dataset.v4Visible = 'false';
      const computed = global.getComputedStyle(guide);
      const color = guide.dataset.v3GuideColor
        || point.dataset.characterColor
        || computed.borderTopColor
        || '#ce176f';
      guide.style.color = color;
      pairs.push({ point, guide, color });
    }
    return pairs;
  }

  function chartElements() {
    return {
      viewport: document.querySelector('.height-chart-viewport-v2'),
      stage: document.querySelector('.height-chart-stage-v2'),
      surface: document.querySelector('.height-chart-surface-v2'),
      plot: document.querySelector('.height-plot-v2'),
      leftAxis: document.querySelector('.height-y-axis-left-v3'),
      rightAxis: document.querySelector('.height-y-axis-right-v3')
    };
  }

  function rulerGeometry(elements) {
    const { viewport, plot, leftAxis, rightAxis } = elements;
    if (!viewport || !plot || !leftAxis || !rightAxis) return null;

    if (typeof V3.syncRulers === 'function') V3.syncRulers(viewport, leftAxis, rightAxis);

    const viewportRect = viewport.getBoundingClientRect();
    const plotRect = plot.getBoundingClientRect();
    const leftRect = leftAxis.getBoundingClientRect();
    const rightRect = rightAxis.getBoundingClientRect();
    const plotWidth = Math.max(1, plot.offsetWidth, px(plot.style.width));
    const scale = plotRect.width > 0 && plotWidth > 0
      ? plotRect.width / plotWidth
      : (V2.heightState?.scale || 1);

    let leftScreen = clamp(leftRect.right, viewportRect.left, viewportRect.right);
    let rightScreen = clamp(rightRect.left, viewportRect.left, viewportRect.right);
    if (rightScreen <= leftScreen + 12) {
      leftScreen = viewportRect.left + Math.min(leftRect.width, viewportRect.width * 0.24);
      rightScreen = viewportRect.right - Math.min(rightRect.width, viewportRect.width * 0.24);
    }

    return {
      viewportRect,
      plotRect,
      leftRect,
      rightRect,
      scale,
      plotWidth,
      leftScreen,
      rightScreen,
      leftPlotX: clamp((leftScreen - plotRect.left) / scale, 0, plotWidth),
      rightPlotX: clamp((rightScreen - plotRect.left) / scale, 0, plotWidth)
    };
  }

  function hideGuide(guide) {
    guide.dataset.v4Visible = 'false';
    guide.style.display = 'none';
    guide.style.width = '0px';
  }

  function positionGuide(pair, direction, rulerX, pointX, pointRadius, plotWidth) {
    let start;
    let end;
    if (direction === 'left') {
      start = rulerX;
      end = pointX - pointRadius;
    } else {
      start = pointX + pointRadius;
      end = rulerX;
    }

    start = clamp(start, 0, plotWidth);
    end = clamp(end, 0, plotWidth);
    const left = Math.min(start, end);
    const width = Math.abs(end - start);
    if (width < 1.5) {
      hideGuide(pair.guide);
      return false;
    }

    pair.guide.style.left = `${left}px`;
    pair.guide.style.width = `${width}px`;
    pair.guide.style.display = 'block';
    pair.guide.style.color = pair.color;
    pair.guide.dataset.v4Visible = 'true';
    pair.guide.dataset.v4Direction = direction;
    pair.guide.dataset.v4RulerX = String(rulerX);
    return true;
  }

  function updateGuidesNow() {
    state.frame = 0;
    const elements = chartElements();
    const geometry = rulerGeometry(elements);
    if (!geometry || !state.pairs.length) return;

    const { viewport, plot } = elements;
    viewport.dataset.v4GuideMode = state.mode;
    let visiblePointCount = 0;
    let displayedGuideCount = 0;

    for (const pair of state.pairs) {
      const pointRect = pair.point.getBoundingClientRect();
      const pointCenterScreen = pointRect.left + pointRect.width / 2;
      const pointX = px(pair.point.style.left);
      const pointRadius = Math.max(1, pointRect.width / (2 * geometry.scale));
      const intersectsVisiblePlot = pointRect.left >= geometry.leftScreen + 1
        && pointRect.right <= geometry.rightScreen - 1;

      let direction;
      let rulerX;
      if (state.mode === 'visible-nearest') {
        if (!intersectsVisiblePlot) {
          hideGuide(pair.guide);
          continue;
        }
        visiblePointCount += 1;
        const leftDistance = Math.abs(pointCenterScreen - geometry.leftScreen);
        const rightDistance = Math.abs(geometry.rightScreen - pointCenterScreen);
        direction = leftDistance <= rightDistance ? 'left' : 'right';
        rulerX = direction === 'left' ? geometry.leftPlotX : geometry.rightPlotX;
      } else if (state.mode === 'all-left') {
        direction = 'left';
        rulerX = 0;
      } else {
        direction = 'right';
        rulerX = geometry.plotWidth;
      }

      if (positionGuide(pair, direction, rulerX, pointX, pointRadius, geometry.plotWidth)) {
        displayedGuideCount += 1;
      }
    }

    const status = document.querySelector('.height-guide-status-v4');
    if (status) {
      if (state.mode === 'visible-nearest') {
        status.textContent = `当前横向视野：${visiblePointCount} 个完整可见角色，${displayedGuideCount} 条线连接最近厘米尺`;
      } else {
        status.textContent = `${modeLabel(state.mode)}：已显示 ${displayedGuideCount}/${state.pairs.length} 条线`;
      }
    }

    plot.dataset.v4DisplayedGuides = String(displayedGuideCount);
    plot.dataset.v4VisiblePoints = String(visiblePointCount);
  }

  function scheduleGuideUpdate() {
    if (state.frame) global.cancelAnimationFrame(state.frame);
    state.frame = global.requestAnimationFrame(updateGuidesNow);
  }

  function installHeightChartV4() {
    const elements = chartElements();
    const { viewport, surface, plot } = elements;
    if (!viewport || !surface || !plot || !elements.leftAxis || !elements.rightAxis) return;

    ensureGuideControls();
    if (surface.dataset.v4Enhanced !== 'true') {
      surface.dataset.v4Enhanced = 'true';
      state.pairs = makePairs(plot);

      viewport.addEventListener('scroll', scheduleGuideUpdate, { passive: true });
      const controls = document.querySelector('.height-zoom-controls-v2');
      controls?.addEventListener('input', () => global.requestAnimationFrame(scheduleGuideUpdate), { passive: true });
      controls?.addEventListener('click', () => global.requestAnimationFrame(scheduleGuideUpdate));

      state.resizeObserver?.disconnect();
      if (typeof global.ResizeObserver === 'function') {
        state.resizeObserver = new global.ResizeObserver(scheduleGuideUpdate);
        state.resizeObserver.observe(viewport);
        state.resizeObserver.observe(plot);
      }
    } else if (!state.pairs.length || !state.pairs[0]?.point?.isConnected) {
      state.pairs = makePairs(plot);
    }

    scheduleGuideUpdate();
  }

  function scrollTarget(target) {
    if (!target) return;
    const sequence = ++state.scrollSequence;
    const desiredTop = () => Math.max(0, global.scrollY + target.getBoundingClientRect().top - 8);

    global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
      if (sequence !== state.scrollSequence) return;
      global.scrollTo({ top: desiredTop(), behavior: 'smooth' });
      global.setTimeout(() => {
        if (sequence !== state.scrollSequence || !target.isConnected) return;
        const top = target.getBoundingClientRect().top;
        if (top < -12 || top > 84) global.scrollTo({ top: desiredTop(), behavior: 'auto' });
      }, 720);
    }));
  }

  const baseDisplayHeightChart = global.displayHeightChart;
  if (typeof baseDisplayHeightChart === 'function') {
    global.displayHeightChart = function displayHeightChartV4() {
      const shouldJump = arguments.length <= 1 || arguments[1] == null;
      const result = baseDisplayHeightChart.apply(this, arguments);
      global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
        installHeightChartV4();
        if (shouldJump) scrollTarget(document.getElementById('heightChartContainer'));
      }));
      return result;
    };
  }

  global.drawAndJump = function drawAndJumpV4() {
    if (typeof global.toggleHeightView === 'function') global.toggleHeightView(false);
    if (typeof global.drawNet_Table === 'function') global.drawNet_Table();
    global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
      scrollTarget(
        document.getElementById('callResultSection')
        || document.getElementById('canvasflame')
        || document.getElementById('mynetwork')
      );
    }));
    return false;
  };

  function rebindFloatingSearch() {
    if (!global.jQuery) return;
    global.jQuery('#pagemdl').off('click').on('click', function (event) {
      event.preventDefault();
      global.drawAndJump();
    });
  }

  global.addEventListener('resize', scheduleGuideUpdate, { passive: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rebindFloatingSearch, { once: true });
  } else {
    rebindFloatingSearch();
  }

  global.__MAGIRECO_CORRECTION_V4__ = {
    release: RELEASE,
    state,
    modeLabel,
    installHeightChartV4,
    updateGuidesNow,
    scheduleGuideUpdate,
    scrollTarget
  };
})(window);
