/* V10 height export: unscaled full chart, dual outer rulers, high-DPI PNG. */
(function (global) {
  'use strict';

  const RELEASE = 'height-export-title-call-v10-20260817';
  const MAX_CANVAS_SIDE = 30000;
  const MAX_CANVAS_AREA = 150000000;
  const MIN_EXPORT_SCALE = 1;
  const PREFERRED_EXPORT_SCALE = 3;

  function nextFrame() {
    return new Promise((resolve) => global.requestAnimationFrame(() => global.requestAnimationFrame(resolve)));
  }

  function px(value) {
    return Number.parseFloat(String(value || '')) || 0;
  }

  function naturalDimensions(surface) {
    const grid = getComputedStyle(surface);
    const width = Math.max(
      1,
      px(surface.dataset.naturalWidth),
      surface.scrollWidth,
      surface.offsetWidth,
      px(grid.width)
    );
    const height = Math.max(
      1,
      px(surface.dataset.naturalHeight),
      surface.scrollHeight,
      surface.offsetHeight,
      px(grid.height)
    );
    return { width: Math.ceil(width), height: Math.ceil(height) };
  }

  function exportScaleFor(width, height) {
    return Math.max(MIN_EXPORT_SCALE, Math.min(
      PREFERRED_EXPORT_SCALE,
      MAX_CANVAS_SIDE / Math.max(1, width),
      MAX_CANVAS_SIDE / Math.max(1, height),
      Math.sqrt(MAX_CANVAS_AREA / Math.max(1, width * height))
    ));
  }

  function keepSingle(selector, root) {
    const items = [...root.querySelectorAll(selector)];
    items.slice(1).forEach((item) => item.remove());
    return items[0] || null;
  }

  function prepareClone(source, width, height) {
    const clone = source.cloneNode(true);
    clone.dataset.v10ExportClone = 'true';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'left top';
    clone.style.willChange = 'auto';
    clone.style.margin = '0';
    clone.style.maxWidth = 'none';
    clone.style.overflow = 'visible';

    clone.querySelectorAll('.height-active-guide-v3, .height-active-y-label-v3, .height-chart-tooltip-v2')
      .forEach((element) => element.remove());
    clone.querySelectorAll('.height-point-v2').forEach((point) => point.classList.remove('is-active'));
    clone.querySelectorAll('.height-point-guide-v2').forEach((guide) => guide.classList.remove('is-active'));

    const left = keepSingle('.height-y-axis-left-v3, .height-y-axis-v2:not(.height-y-axis-right-v3)', clone);
    const right = keepSingle('.height-y-axis-right-v3', clone);
    if (left) {
      left.classList.add('height-y-axis-left-v3');
      left.style.gridColumn = '1';
      left.style.transform = 'none';
      left.style.position = 'relative';
    }
    if (right) {
      right.style.gridColumn = '3';
      right.style.transform = 'none';
      right.style.position = 'relative';
    }
    clone.querySelectorAll('.height-x-axis-spacer-right-v3').forEach((spacer, index) => {
      if (index) spacer.remove();
      else spacer.style.gridColumn = '3';
    });
    return clone;
  }

  async function waitForImages(root) {
    const images = [...root.querySelectorAll('img')];
    await Promise.all(images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      try {
        await image.decode();
      } catch {
        await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
          global.setTimeout(resolve, 5000);
        });
      }
    }));
  }

  function setExportStatus(text, kind = '') {
    let status = document.querySelector('.height-export-status-v10');
    const controls = document.querySelector('.height-zoom-controls-v2');
    if (!status && controls) {
      status = document.createElement('span');
      status.className = 'height-export-status-v10';
      controls.appendChild(status);
    }
    if (status) {
      status.textContent = text;
      status.dataset.kind = kind;
    }
  }

  async function renderExportCanvas() {
    const source = document.querySelector('.height-chart-surface-v2');
    if (!source) throw new Error('当前没有可导出的身高图。');
    if (typeof global.html2canvas !== 'function') throw new Error('图片导出组件尚未加载。');

    const dimensions = naturalDimensions(source);
    const host = document.createElement('div');
    host.className = 'height-export-host-v10';
    host.style.width = `${dimensions.width}px`;
    host.style.height = `${dimensions.height}px`;
    const clone = prepareClone(source, dimensions.width, dimensions.height);
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
      await waitForImages(clone);
      await nextFrame();
      const scale = exportScaleFor(dimensions.width, dimensions.height);
      const canvas = await global.html2canvas(clone, {
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: false,
        scale,
        width: dimensions.width,
        height: dimensions.height,
        windowWidth: dimensions.width,
        windowHeight: dimensions.height,
        scrollX: 0,
        scrollY: 0,
        removeContainer: true,
        imageTimeout: 20000
      });
      canvas.dataset.exportCssWidth = String(dimensions.width);
      canvas.dataset.exportCssHeight = String(dimensions.height);
      canvas.dataset.exportScale = String(scale);
      canvas.dataset.exportLeftAxes = String(clone.querySelectorAll('.height-y-axis-left-v3').length);
      canvas.dataset.exportRightAxes = String(clone.querySelectorAll('.height-y-axis-right-v3').length);
      return canvas;
    } finally {
      host.remove();
    }
  }

  function chartFileName() {
    const state = global.__MAGIRECO_CORRECTION_V2__?.heightState || {};
    const source = state.dataSource === 'selected' ? '已选角色' : '全体角色';
    const axis = ({ age: '年龄', grade: '学年', school: '学校', organization: '组织', attribute: '属性' })[state.xMode] || '分类';
    const view = state.viewMode === 'bar' ? '平均身高柱状图' : '身高散点图';
    return `${source}_${axis}_${view}.png`;
  }

  async function saveHeightChartV10() {
    const button = document.querySelector('[data-height-export-button-v10]')
      || [...document.querySelectorAll('button,input[type="button"]')].find((item) => /保存身高图/u.test(item.value || item.textContent || ''));
    const original = button ? (button.value || button.textContent) : '';
    if (button) {
      button.disabled = true;
      if ('value' in button) button.value = '正在生成…';
      else button.textContent = '正在生成…';
    }
    setExportStatus('正在生成完整高分辨率图片……');
    try {
      const canvas = await renderExportCanvas();
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('浏览器没有生成 PNG 数据。')), 'image/png');
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = chartFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      setExportStatus(`已生成 ${canvas.width}×${canvas.height}px PNG。`, 'success');
      return canvas;
    } catch (error) {
      console.error(error);
      setExportStatus(`生成失败：${error.message || error}`, 'error');
      if (typeof global.alert === 'function') global.alert(`生成身高图失败：${error.message || error}`);
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        if ('value' in button) button.value = original;
        else button.textContent = original;
      }
    }
  }

  function markExportButton() {
    const button = [...document.querySelectorAll('button,input[type="button"]')]
      .find((item) => /保存身高图/u.test(item.value || item.textContent || ''));
    if (!button || button.dataset.heightExportButtonV10 === 'true') return;
    button.dataset.heightExportButtonV10 = 'true';
    const replacement = button.cloneNode(true);
    replacement.dataset.heightExportButtonV10 = 'true';
    replacement.addEventListener('click', (event) => {
      event.preventDefault();
      saveHeightChartV10().catch(() => {});
    });
    button.replaceWith(replacement);
  }

  const observer = new MutationObserver(() => markExportButton());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      markExportButton();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    markExportButton();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  global.saveHeightChart = saveHeightChartV10;
  global.__MAGIRECO_HEIGHT_EXPORT_V10__ = Object.freeze({
    release: RELEASE,
    renderExportCanvas,
    saveHeightChart: saveHeightChartV10,
    naturalDimensions,
    exportScaleFor,
    prepareClone
  });
})(window);
