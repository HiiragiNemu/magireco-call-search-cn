/* V13: repair real-image rune preprocessing and engine routing.
 *
 * Ordinary OCR is routed through the full Tesseract ensemble so the selected
 * preprocessing mode is actually honored.  The deterministic V7 template
 * recognizer remains only for the explicit standard-rune alphabet/chart mode.
 *
 * Auto/border mode also detects a compact text band surrounded by large
 * decorative bands (the common witch-card layout).  When such a band is found,
 * only that band is normalized to black-on-white before Tesseract.  Explicit
 * "original", contrast/invert, manual paint-mask input, and non-decorated images
 * are never silently cropped.
 */
(function (global) {
  'use strict';

  const RELEASE = 'rune-engine-router-v13-20260818';
  const MAX_SIDE = 2400;
  let retries = 0;
  let routing = false;

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  async function decodeImage(blob) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(blob); } catch { /* fallback below */ }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      image.src = url;
    });
  }

  function otsu(histogram, total) {
    let sum = 0;
    for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let best = 127;
    let maximum = -1;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      backgroundWeight += histogram[threshold];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += threshold * histogram[threshold];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const between = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
      if (between > maximum) { maximum = between; best = threshold; }
    }
    return best;
  }

  async function sourceData(blob) {
    const image = await decodeImage(blob);
    const naturalWidth = image.width || image.naturalWidth;
    const naturalHeight = image.height || image.naturalHeight;
    const ratio = Math.min(1, MAX_SIDE / Math.max(1, naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * ratio));
    const height = Math.max(1, Math.round(naturalHeight * ratio));
    const canvas = makeCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    image.close?.();
    const pixels = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    const histogram = new Uint32Array(256);
    for (let index = 0, offset = 0; index < gray.length; index += 1, offset += 4) {
      const value = Math.max(0, Math.min(255, Math.round(
        pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722
      )));
      gray[index] = value;
      histogram[value] += 1;
    }
    return { gray, width, height, threshold: otsu(histogram, gray.length) };
  }

  function buildMask(gray, threshold, lightForeground) {
    const mask = new Uint8Array(gray.length);
    for (let index = 0; index < gray.length; index += 1) {
      mask[index] = lightForeground ? Number(gray[index] >= threshold) : Number(gray[index] <= threshold);
    }
    return mask;
  }

  function clearLongLines(mask, width, height) {
    const output = mask.slice();
    const rowLimit = Math.max(20, Math.floor(width * .72));
    const columnLimit = Math.max(20, Math.floor(height * .72));
    const rows = [];
    const columns = [];
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      for (let x = 0; x < width; x += 1) count += output[y * width + x];
      if (count >= rowLimit) rows.push(y);
    }
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let y = 0; y < height; y += 1) count += output[y * width + x];
      if (count >= columnLimit) columns.push(x);
    }
    const radius = Math.max(1, Math.round(Math.min(width, height) * .004));
    for (const row of rows) {
      for (let y = Math.max(0, row - radius); y <= Math.min(height - 1, row + radius); y += 1) {
        output.fill(0, y * width, (y + 1) * width);
      }
    }
    for (const column of columns) {
      for (let x = Math.max(0, column - radius); x <= Math.min(width - 1, column + radius); x += 1) {
        for (let y = 0; y < height; y += 1) output[y * width + x] = 0;
      }
    }
    return output;
  }

  function rowBands(mask, width, height) {
    const threshold = Math.max(2, Math.round(width * .002));
    const raw = [];
    let start = -1;
    for (let y = 0; y <= height; y += 1) {
      let count = 0;
      if (y < height) for (let x = 0; x < width; x += 1) count += mask[y * width + x];
      const active = count >= threshold;
      if (active && start < 0) start = y;
      if (!active && start >= 0) { raw.push({ top: start, bottom: y - 1 }); start = -1; }
    }
    const gapLimit = Math.max(3, Math.round(height * .018));
    const merged = [];
    for (const band of raw) {
      const previous = merged[merged.length - 1];
      if (previous && band.top - previous.bottom - 1 <= gapLimit) previous.bottom = band.bottom;
      else merged.push({ ...band });
    }
    const minimumHeight = Math.max(8, Math.round(height * .028));
    const substantial = merged.filter((band) => band.bottom - band.top + 1 >= minimumHeight);
    return substantial.length ? substantial : merged;
  }

  function columnSegments(mask, width, band) {
    const bandHeight = band.bottom - band.top + 1;
    const threshold = Math.max(1, Math.round(bandHeight * .015));
    const raw = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      let count = 0;
      if (x < width) for (let y = band.top; y <= band.bottom; y += 1) count += mask[y * width + x];
      const active = count >= threshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { raw.push({ left: start, right: x - 1 }); start = -1; }
    }
    if (raw.length < 2) return raw;
    const widths = raw.map((segment) => segment.right - segment.left + 1).sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)] || 1;
    const gapLimit = Math.max(2, Math.round(median * .18));
    const merged = [];
    for (const segment of raw) {
      const previous = merged[merged.length - 1];
      if (previous && segment.left - previous.right - 1 <= gapLimit
          && segment.right - previous.left + 1 <= median * 1.8) previous.right = segment.right;
      else merged.push({ ...segment });
    }
    return merged;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function findFocusedBand(mask, width, height, mode) {
    const bands = rowBands(mask, width, height);
    const metrics = bands.map((band) => {
      const segments = columnSegments(mask, width, band);
      const left = segments.length ? segments[0].left : 0;
      const right = segments.length ? segments[segments.length - 1].right : width - 1;
      const spanRatio = (right - left + 1) / Math.max(1, width);
      const heightRatio = (band.bottom - band.top + 1) / Math.max(1, height);
      const medianWidthRatio = median(segments.map((segment) => segment.right - segment.left + 1)) / Math.max(1, width);
      const center = (band.top + band.bottom + 1) / (2 * Math.max(1, height));
      const candidate = segments.length >= 3 && segments.length <= 48
        && spanRatio >= .10 && spanRatio <= .86
        && heightRatio >= .012 && heightRatio <= .34
        && medianWidthRatio <= .16;
      const score = candidate
        ? segments.length * 2.2 + spanRatio * 8 + (1 - heightRatio) * 4 + (1 - Math.abs(center - .5) * 2) * 2
        : -Infinity;
      return { band, segments, left, right, spanRatio, heightRatio, center, score };
    });
    const valid = metrics.filter((item) => Number.isFinite(item.score)).sort((a, b) => b.score - a.score);
    const best = valid[0];
    if (!best) return null;

    // Auto mode is conservative: crop only when the same polarity also contains
    // clearly larger surrounding decoration/bands.  Explicit border mode opts in
    // to stronger isolation and can accept a single strong text band.
    if (mode === 'auto') {
      const hasSurroundingDecoration = metrics.some((item) => item !== best && (
        item.spanRatio > .90 || item.heightRatio > best.heightRatio * 1.65
      ));
      if (!hasSurroundingDecoration) return null;
    }
    return best;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成识别图像。')), 'image/png');
    });
  }

  async function buildFocusedInput(file, mode) {
    const { gray, width, height, threshold } = await sourceData(file);
    let selected = null;
    for (const lightForeground of [true, false]) {
      const mask = clearLongLines(buildMask(gray, threshold, lightForeground), width, height);
      const band = findFocusedBand(mask, width, height, mode);
      if (!band) continue;
      if (!selected || band.score > selected.band.score) selected = { mask, band, lightForeground };
    }
    if (!selected) return null;

    const { mask, band } = selected;
    const bandHeight = band.band.bottom - band.band.top + 1;
    const spanWidth = band.right - band.left + 1;
    const padX = Math.max(6, Math.round(spanWidth * .07));
    const padY = Math.max(6, Math.round(bandHeight * .30));
    const left = Math.max(0, band.left - padX);
    const right = Math.min(width - 1, band.right + padX);
    const top = Math.max(0, band.band.top - padY);
    const bottom = Math.min(height - 1, band.band.bottom + padY);
    const sourceWidth = right - left + 1;
    const sourceHeight = bottom - top + 1;
    const scale = Math.max(1, Math.min(4, 240 / Math.max(1, sourceHeight)));
    const raw = makeCanvas(sourceWidth, sourceHeight);
    const rawContext = raw.getContext('2d', { willReadFrequently: true });
    const image = rawContext.createImageData(sourceWidth, sourceHeight);
    image.data.fill(255);
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        if (!mask[(top + y) * width + left + x]) continue;
        const offset = (y * sourceWidth + x) * 4;
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      }
    }
    rawContext.putImageData(image, 0, 0);

    const output = makeCanvas(sourceWidth * scale + 32, sourceHeight * scale + 32);
    const context = output.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(raw, 16, 16, sourceWidth * scale, sourceHeight * scale);
    const blob = await canvasToBlob(output);
    return new File([blob], `focused-runes-${file.name.replace(/\.[^.]+$/, '') || 'image'}.png`, { type: 'image/png' });
  }

  function shouldUseTemplate() {
    const layout = document.getElementById('runesLayout')?.value || 'auto';
    const preprocess = document.getElementById('runesPreprocess')?.value || 'auto';
    const model = document.getElementById('runesModel')?.value || 'mdk';

    // Template preprocessing is intentionally isolated to explicit alphabet/chart
    // use.  It must never override "保持原图" or any other preprocessing choice.
    return layout === 'chart' && preprocess === 'auto' && model === 'mdk';
  }

  async function routeToClassic(classicButton) {
    if (routing) return;
    routing = true;
    try {
      const preprocess = document.getElementById('runesPreprocess')?.value || 'auto';
      const input = document.getElementById('runesFile')?.files?.[0] || null;
      const manualOverride = global.__RUNE_INPUT_OVERRIDE_V9__ || null;

      // A paint mask is already an explicit crop, so do not second-guess it.
      // Explicit original/contrast/invert are also passed through unchanged.
      if (!manualOverride && input && (preprocess === 'auto' || preprocess === 'border')) {
        try {
          const focused = await buildFocusedInput(input, preprocess);
          if (focused) {
            global.__RUNE_INPUT_OVERRIDE_V9__ = focused;
            document.documentElement.dataset.runeFocusedV13 = 'true';
          } else {
            delete document.documentElement.dataset.runeFocusedV13;
          }
        } catch (error) {
          console.warn('V13 rune focus preprocessing skipped.', error);
          delete document.documentElement.dataset.runeFocusedV13;
        }
      } else {
        delete document.documentElement.dataset.runeFocusedV13;
      }
      classicButton.click();
    } finally {
      routing = false;
    }
  }

  function install() {
    const templateButton = document.getElementById('runesRecognizeV7');
    const classicButton = document.getElementById('runesRecognizeLegacyV7');

    if (!templateButton || !classicButton) {
      if (retries < 20) {
        retries += 1;
        global.setTimeout(install, 25);
      }
      return;
    }
    if (templateButton.dataset.engineRouterV13 === 'true') return;

    templateButton.dataset.engineRouterV13 = 'true';
    templateButton.addEventListener('click', (event) => {
      if (shouldUseTemplate()) return;

      // Stop the V7 fast-template handler before it can emit an instant but
      // unrelated binary image/result.  The legacy button is the full Tesseract
      // ensemble and honors preprocess/layout/model/mask choices.
      event.preventDefault();
      event.stopImmediatePropagation();
      routeToClassic(classicButton);
    }, true);

    document.documentElement.dataset.runeEngineV13 = RELEASE;
    global.__RUNE_ENGINE_V13__ = Object.freeze({
      release: RELEASE,
      shouldUseTemplate,
      buildFocusedInput,
      findFocusedBand
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
