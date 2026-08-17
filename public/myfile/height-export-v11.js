/* V11: high-resolution height export drawn directly to Canvas. No html2canvas/CSS parser. */
(function (global) {
  'use strict';
  const RELEASE = 'live-reacceptance-v11-20260817';
  const MAX_SIDE = 16384;
  const MAX_PIXELS = 80_000_000;
  const px = (value) => Number.parseFloat(String(value || '')) || 0;

  function setStatus(text, kind = '') {
    let node = document.querySelector('.height-export-status-v10');
    const controls = document.querySelector('.height-zoom-controls-v2');
    if (!node && controls) {
      node = document.createElement('span');
      node.className = 'height-export-status-v10';
      controls.appendChild(node);
    }
    if (node) { node.textContent = text; node.dataset.kind = kind; }
  }

  function geometry() {
    const surface = document.querySelector('.height-chart-surface-v2');
    const plot = surface?.querySelector('.height-plot-v2');
    const left = surface?.querySelector('.height-y-axis-left-v3, .height-y-axis-v2:not(.height-y-axis-right-v3)');
    const right = surface?.querySelector('.height-y-axis-right-v3');
    const xAxis = surface?.querySelector('.height-x-axis-v2');
    if (!surface || !plot || !left || !xAxis) throw new Error('当前没有可导出的身高图。');
    const axisWidth = Math.max(58, left.offsetWidth || px(left.style.width) || 80);
    const plotWidth = Math.max(280, plot.offsetWidth || px(plot.style.width));
    const plotHeight = Math.max(360, plot.offsetHeight || 720);
    const xHeight = Math.max(64, xAxis.offsetHeight || 80);
    return { surface, plot, left, right, xAxis, axisWidth, plotWidth, plotHeight, xHeight,
      width: axisWidth * 2 + plotWidth, height: plotHeight + xHeight };
  }

  function exportScale(width, height) {
    return Math.max(1, Math.min(3,
      MAX_SIDE / width,
      MAX_SIDE / height,
      Math.sqrt(MAX_PIXELS / Math.max(1, width * height))));
  }

  function line(ctx, x1, y1, x2, y2, color, width = 1, dash = []) {
    ctx.save(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.restore();
  }

  function text(ctx, value, x, y, options = {}) {
    ctx.save();
    ctx.fillStyle = options.color || '#28151f';
    ctx.font = options.font || '12px system-ui, -apple-system, "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = options.align || 'center';
    ctx.textBaseline = options.baseline || 'middle';
    const maxWidth = options.maxWidth || undefined;
    if (maxWidth) ctx.fillText(String(value), x, y, maxWidth); else ctx.fillText(String(value), x, y);
    ctx.restore();
  }

  function wrapText(ctx, value, x, y, width, lineHeight = 14) {
    const chars = [...String(value || '')];
    const lines = []; let current = '';
    for (const ch of chars) {
      const next = current + ch;
      if (current && ctx.measureText(next).width > width) { lines.push(current); current = ch; }
      else current = next;
    }
    if (current) lines.push(current);
    const total = lines.length * lineHeight;
    lines.forEach((part, index) => ctx.fillText(part, x, y - total / 2 + lineHeight * (index + .5), width));
  }

  function cssColor(element, property, fallback) {
    const value = global.getComputedStyle(element)[property];
    if (!value || /color\(|color-mix\(|oklab|oklch|lab\(|lch\(/iu.test(value)) return fallback;
    return value;
  }

  async function loadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
      if (image.complete && image.naturalWidth) resolve(image);
    });
  }

  async function renderExportCanvas() {
    const g = geometry();
    const scale = exportScale(g.width, g.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(g.width * scale));
    canvas.height = Math.max(1, Math.round(g.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, g.width, g.height);

    const plotX = g.axisWidth;
    const rightX = plotX + g.plotWidth;
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, g.axisWidth, g.plotHeight);
    ctx.fillRect(rightX, 0, g.axisWidth, g.plotHeight);
    ctx.fillRect(0, g.plotHeight, g.width, g.xHeight);
    ctx.fillStyle = '#fff'; ctx.fillRect(plotX, 0, g.plotWidth, g.plotHeight);

    // Minor 1cm lattice plus stronger 5cm rulers.
    for (let h = 120; h <= 180; h += 1) {
      const y = ((180 - h) / 60) * g.plotHeight;
      const major = h % 5 === 0;
      line(ctx, plotX, y, rightX, y, major ? '#6a294b' : '#dedede', major ? 1.15 : .45);
      if (major) {
        text(ctx, `${h}cm`, g.axisWidth - 6, y, { align: 'right', font: '12px system-ui' });
        text(ctx, `${h}cm`, rightX + 6, y, { align: 'left', font: '12px system-ui' });
      }
    }

    const labels = [...g.xAxis.querySelectorAll('.height-x-label-v2')];
    let cursor = 0;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    labels.forEach((label) => {
      const width = Math.max(1, px(label.style.width) || label.offsetWidth);
      line(ctx, plotX + cursor, 0, plotX + cursor, g.plotHeight + g.xHeight, '#c9c9c9', .8, [3, 3]);
      ctx.save(); ctx.fillStyle = '#191919'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      wrapText(ctx, label.textContent.trim(), plotX + cursor + width / 2, g.plotHeight + g.xHeight / 2, Math.max(20, width - 8), 14);
      ctx.restore();
      cursor += width;
    });
    line(ctx, plotX + cursor, 0, plotX + cursor, g.plotHeight + g.xHeight, '#c9c9c9', .8, [3, 3]);
    line(ctx, plotX, g.plotHeight, rightX, g.plotHeight, '#888', 1);

    const state = global.__MAGIRECO_CORRECTION_V2__?.heightState || {};
    if (state.viewMode === 'bar') {
      for (const bar of g.plot.querySelectorAll('.height-bar-v2')) {
        const center = px(bar.style.left);
        const width = Math.max(6, px(bar.style.width) || bar.offsetWidth);
        const pct = Math.max(0, Math.min(100, px(bar.style.height)));
        const height = g.plotHeight * pct / 100;
        const grad = ctx.createLinearGradient(0, g.plotHeight - height, 0, g.plotHeight);
        grad.addColorStop(0, '#ffd3e9'); grad.addColorStop(1, '#f28ec1');
        ctx.fillStyle = grad; ctx.fillRect(plotX + center - width / 2, g.plotHeight - height, width, height);
        ctx.strokeStyle = '#b52970'; ctx.lineWidth = 2; ctx.strokeRect(plotX + center - width / 2, g.plotHeight - height, width, height);
        text(ctx, bar.querySelector('.height-bar-label-v2')?.textContent || '', plotX + center, Math.max(12, g.plotHeight - height - 16), { font: '11px system-ui' });
      }
    } else {
      const points = [...g.plot.querySelectorAll('.height-point-v2')];
      const guideMode = document.querySelector('.height-chart-viewport-v2')?.dataset.v4GuideMode || 'visible-nearest';
      const imageCache = new Map();
      for (const point of points) {
        const x = px(point.style.left); const y = px(point.style.top);
        const radius = Math.max(18, (point.offsetWidth || 54) / 2);
        const color = point.dataset.characterColor || cssColor(point, 'borderTopColor', '#ce176f');
        let direction = guideMode === 'all-left' ? 'left' : guideMode === 'all-right' ? 'right' : (x <= g.plotWidth / 2 ? 'left' : 'right');
        const lineStart = direction === 'left' ? 0 : x + radius;
        const lineEnd = direction === 'left' ? Math.max(0, x - radius) : g.plotWidth;
        line(ctx, plotX + lineStart, y, plotX + lineEnd, y, color, 1.6, [4, 3]);

        const img = point.querySelector('img');
        const src = img?.currentSrc || img?.src || '';
        let image = imageCache.get(src);
        if (image === undefined) { image = await loadImage(src); imageCache.set(src, image); }
        ctx.save();
        ctx.beginPath(); ctx.arc(plotX + x, y, radius, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = '#fff'; ctx.fillRect(plotX + x - radius, y - radius, radius * 2, radius * 2);
        if (image?.naturalWidth) ctx.drawImage(image, plotX + x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(plotX + x, y, radius, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      }
    }

    canvas.dataset.exportScale = String(scale);
    canvas.dataset.exportCssWidth = String(g.width);
    canvas.dataset.exportCssHeight = String(g.height);
    canvas.dataset.exportLeftAxes = '1';
    canvas.dataset.exportRightAxes = '1';
    return canvas;
  }

  function fileName() {
    const state = global.__MAGIRECO_CORRECTION_V2__?.heightState || {};
    const source = state.dataSource === 'selected' ? '已选角色' : '全体角色';
    const axis = ({ age: '年龄', grade: '学年', school: '学校', organization: '组织', attribute: '属性' })[state.xMode] || '分类';
    const view = state.viewMode === 'bar' ? '平均身高柱状图' : '身高散点图';
    return `${source}_${axis}_${view}.png`;
  }

  async function saveHeightChartV11() {
    setStatus('正在生成完整高分辨率图片……');
    const canvas = await renderExportCanvas();
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('浏览器没有生成 PNG 数据。')), 'image/png'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = fileName(); document.body.appendChild(link); link.click(); link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 3000);
    setStatus(`已生成 ${canvas.width}×${canvas.height}px PNG。`, 'success');
    return canvas;
  }

  function install() {
    const old = [...document.querySelectorAll('button,input[type="button"]')].find((node) => /保存身高图/u.test(node.value || node.textContent || ''));
    if (!old || old.dataset.heightExportV11 === 'true') return;
    const button = old.cloneNode(true); button.dataset.heightExportV11 = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const original = 'value' in button ? button.value : button.textContent;
      button.disabled = true; if ('value' in button) button.value = '正在生成…'; else button.textContent = '正在生成…';
      saveHeightChartV11().catch((error) => { console.error(error); setStatus(`生成失败：${error.message || error}`, 'error'); if (global.alert) global.alert(`生成身高图失败：${error.message || error}`); })
        .finally(() => { button.disabled = false; if ('value' in button) button.value = original; else button.textContent = original; });
    });
    old.replaceWith(button);
  }

  const observer = new MutationObserver(install);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { install(); observer.observe(document.body, { childList: true, subtree: true }); }, { once: true });
  else { install(); observer.observe(document.body, { childList: true, subtree: true }); }

  global.saveHeightChart = saveHeightChartV11;
  global.__MAGIRECO_HEIGHT_EXPORT_V11__ = Object.freeze({ release: RELEASE, renderExportCanvas, saveHeightChart: saveHeightChartV11, geometry, exportScale });
})(window);
