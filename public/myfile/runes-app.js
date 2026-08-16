/* Browser-local, multi-pass witch-rune OCR using the custom Madoka models. */
(function (global) {
  'use strict';

  const Tools = global.MagiTools;
  if (!Tools) return;

  const nodes = {};
  const OCR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.-!?';
  const MAX_IMAGE_SIDE = 2800;
  const TARGET_MIN_SIDE = 1100;
  let file = null;
  let objectUrl = '';
  let worker = null;
  let workerModel = '';
  let recognizeSerial = 0;
  let loggerBase = 0;
  let loggerSpan = 1;

  function cacheNodes() {
    for (const id of [
      'runesDrop', 'runesFile', 'runesModel', 'runesPreprocess', 'runesLayout', 'runesRecognize',
      'runesClear', 'runesStatus', 'runesProgress', 'runesPreviewEmpty', 'runesPreview',
      'runesCanvas', 'runesOutput', 'runesCopy', 'runesDiagnostics'
    ]) nodes[id] = document.getElementById(id);
  }

  function setProgress(value, statusText, kind) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && nodes.runesProgress) {
      nodes.runesProgress.hidden = false;
      nodes.runesProgress.value = Math.min(1, numeric);
    }
    if (statusText) Tools.setStatus(nodes.runesStatus, statusText, kind);
  }

  function logger(message) {
    const map = {
      'loading tesseract core': '正在加载 OCR 核心…',
      'initializing tesseract': '正在初始化 OCR…',
      'loading language traineddata': '正在加载魔女文字模型…',
      'initializing api': '正在初始化识别模型…',
      'recognizing text': '正在识别魔女文字…'
    };
    const label = map[message.status] || message.status || '处理中…';
    const local = Number.isFinite(message.progress) ? message.progress : 0;
    const overall = loggerBase + local * loggerSpan;
    setProgress(overall, `${label}${Number.isFinite(message.progress) ? ` ${Math.round(overall * 100)}%` : ''}`);
  }

  async function terminateWorker() {
    const current = worker;
    worker = null;
    workerModel = '';
    if (current) {
      try { await current.terminate(); } catch { /* ignore shutdown failure */ }
    }
  }

  async function getWorker(model) {
    if (worker && workerModel === model) return worker;
    await terminateWorker();
    if (!global.Tesseract?.createWorker) throw new Error('Tesseract.js 未能加载，请检查网络连接后重试。');
    const langPath = new URL('./mdkOCR', global.location.href).href.replace(/\/$/, '');
    worker = await global.Tesseract.createWorker(model, global.Tesseract.OEM?.TESSERACT_ONLY ?? 0, {
      langPath,
      gzip: false,
      logger
    });
    workerModel = model;
    await setWorkerParameters({
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: OCR_WHITELIST,
      load_system_dawg: '0',
      load_freq_dawg: '0'
    });
    return worker;
  }

  async function setWorkerParameters(parameters) {
    if (!worker) return;
    try { await worker.setParameters(parameters); }
    catch (error) { console.warn('OCR 参数设置失败，将继续使用模型可接受的参数。', error); }
  }

  function resetPreview() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    file = null;
    nodes.runesFile.value = '';
    nodes.runesPreview.hidden = true;
    nodes.runesPreview.removeAttribute('src');
    nodes.runesPreviewEmpty.hidden = false;
    nodes.runesCanvas.hidden = true;
    nodes.runesRecognize.disabled = true;
    nodes.runesOutput.value = '';
    if (nodes.runesDiagnostics) nodes.runesDiagnostics.textContent = '';
    nodes.runesProgress.hidden = true;
    nodes.runesProgress.value = 0;
    Tools.setStatus(nodes.runesStatus, '请选择一张图片。');
  }

  function acceptFile(next) {
    if (!next) return;
    if (!/^image\//i.test(next.type || '')) {
      Tools.setStatus(nodes.runesStatus, '请选择 PNG、JPEG、WebP、GIF 或 BMP 图片。', 'error');
      return;
    }
    if (next.size > 25 * 1024 * 1024) {
      Tools.setStatus(nodes.runesStatus, '图片超过 25 MB，请先裁切或压缩。', 'error');
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    file = next;
    objectUrl = URL.createObjectURL(next);
    nodes.runesPreview.src = objectUrl;
    nodes.runesPreview.hidden = false;
    nodes.runesPreviewEmpty.hidden = true;
    nodes.runesRecognize.disabled = false;
    nodes.runesOutput.value = '';
    if (nodes.runesDiagnostics) nodes.runesDiagnostics.textContent = '';
    Tools.setStatus(nodes.runesStatus, `已选择：${Tools.escapeHtml(next.name)}（${Math.max(1, Math.round(next.size / 1024))} KB）`, 'success');
  }

  async function loadImage(blob) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(blob); } catch { /* fallback below */ }
    }
    return await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      img.src = url;
    });
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  async function sourceCanvasFromBlob(blob) {
    const image = await loadImage(blob);
    const naturalWidth = image.width || image.naturalWidth;
    const naturalHeight = image.height || image.naturalHeight;
    const longest = Math.max(naturalWidth, naturalHeight);
    const upscale = longest < TARGET_MIN_SIDE ? Math.min(3, TARGET_MIN_SIDE / Math.max(1, longest)) : 1;
    const ratio = Math.min(upscale, MAX_IMAGE_SIDE / Math.max(1, longest));
    const canvas = makeCanvas(naturalWidth * ratio, naturalHeight * ratio);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (typeof image.close === 'function') image.close();
    return canvas;
  }

  function grayscaleData(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Uint8Array(canvas.width * canvas.height);
    const histogram = new Uint32Array(256);
    for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 4) {
      const value = Math.max(0, Math.min(255, Math.round(
        image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722
      )));
      gray[pixel] = value;
      histogram[value] += 1;
    }
    return { gray, histogram };
  }

  function otsuThreshold(histogram, total) {
    let sum = 0;
    for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
    let sumBackground = 0;
    let weightBackground = 0;
    let best = 127;
    let maximum = -1;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      weightBackground += histogram[threshold];
      if (!weightBackground) continue;
      const weightForeground = total - weightBackground;
      if (!weightForeground) break;
      sumBackground += threshold * histogram[threshold];
      const meanBackground = sumBackground / weightBackground;
      const meanForeground = (sum - sumBackground) / weightForeground;
      const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
      if (between > maximum) { maximum = between; best = threshold; }
    }
    return best;
  }

  function edgeMedian(gray, width, height) {
    const values = [];
    const stride = Math.max(1, Math.floor(Math.max(width, height) / 600));
    for (let x = 0; x < width; x += stride) {
      values.push(gray[x], gray[(height - 1) * width + x]);
    }
    for (let y = 0; y < height; y += stride) {
      values.push(gray[y * width], gray[y * width + width - 1]);
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  }

  function buildMask(gray, width, height, threshold, lightForeground) {
    const mask = new Uint8Array(width * height);
    let count = 0;
    for (let index = 0; index < gray.length; index += 1) {
      const foreground = lightForeground ? gray[index] >= threshold : gray[index] <= threshold;
      if (foreground) { mask[index] = 1; count += 1; }
    }
    return { mask, count };
  }

  function clearLongBorders(mask, width, height) {
    const rowLimit = Math.max(10, Math.floor(width * .72));
    const columnLimit = Math.max(10, Math.floor(height * .72));
    const rows = [];
    const columns = [];
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      const start = y * width;
      for (let x = 0; x < width; x += 1) count += mask[start + x];
      if (count >= rowLimit) rows.push(y);
    }
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let y = 0; y < height; y += 1) count += mask[y * width + x];
      if (count >= columnLimit) columns.push(x);
    }
    const radius = Math.max(1, Math.round(Math.min(width, height) * .004));
    for (const row of rows) {
      for (let y = Math.max(0, row - radius); y <= Math.min(height - 1, row + radius); y += 1) {
        mask.fill(0, y * width, (y + 1) * width);
      }
    }
    for (const column of columns) {
      for (let x = Math.max(0, column - radius); x <= Math.min(width - 1, column + radius); x += 1) {
        for (let y = 0; y < height; y += 1) mask[y * width + x] = 0;
      }
    }
    return { rows: rows.length, columns: columns.length };
  }

  function maskBounds(mask, width, height) {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      const start = y * width;
      for (let x = 0; x < width; x += 1) {
        if (!mask[start + x]) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < left || bottom < top ? null : { left, top, right, bottom };
  }

  function binaryCanvas(mask, width, height, bounds = null, paddingRatio = .055) {
    const box = bounds || { left: 0, top: 0, right: width - 1, bottom: height - 1 };
    const contentWidth = box.right - box.left + 1;
    const contentHeight = box.bottom - box.top + 1;
    const pad = Math.max(8, Math.round(Math.max(contentWidth, contentHeight) * paddingRatio));
    const canvas = makeCanvas(contentWidth + pad * 2, contentHeight + pad * 2);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.fill(255);
    for (let y = 0; y < contentHeight; y += 1) {
      for (let x = 0; x < contentWidth; x += 1) {
        if (!mask[(box.top + y) * width + box.left + x]) continue;
        const offset = ((y + pad) * canvas.width + x + pad) * 4;
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  function contrastCanvas(source, invert = false) {
    const canvas = makeCanvas(source.width, source.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      let value = pixels.data[offset] * .2126 + pixels.data[offset + 1] * .7152 + pixels.data[offset + 2] * .0722;
      value = Math.max(0, Math.min(255, (value - 128) * 2.15 + 128));
      if (invert) value = 255 - value;
      pixels.data[offset] = value;
      pixels.data[offset + 1] = value;
      pixels.data[offset + 2] = value;
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  function rowBands(mask, width, height) {
    const projection = new Uint32Array(height);
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      const start = y * width;
      for (let x = 0; x < width; x += 1) count += mask[start + x];
      projection[y] = count;
    }
    const activeThreshold = Math.max(2, Math.round(width * .002));
    const raw = [];
    let start = -1;
    for (let y = 0; y <= height; y += 1) {
      const active = y < height && projection[y] >= activeThreshold;
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
    const height = band.bottom - band.top + 1;
    const projection = new Uint32Array(width);
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let y = band.top; y <= band.bottom; y += 1) count += mask[y * width + x];
      projection[x] = count;
    }
    const threshold = Math.max(1, Math.round(height * .015));
    const raw = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const active = x < width && projection[x] >= threshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { raw.push({ left: start, right: x - 1 }); start = -1; }
    }
    if (raw.length < 2) return raw;
    const widths = raw.map((part) => part.right - part.left + 1).sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)] || 1;
    const mergeGap = Math.max(2, Math.round(median * .18));
    const merged = [];
    for (const part of raw) {
      const previous = merged[merged.length - 1];
      if (previous && part.left - previous.right - 1 <= mergeGap && (part.right - previous.left + 1) <= median * 1.8) {
        previous.right = part.right;
      } else merged.push({ ...part });
    }
    return merged;
  }

  function cropMask(mask, width, height, box, targetHeight = 150) {
    const padSource = Math.max(3, Math.round(Math.max(box.right - box.left + 1, box.bottom - box.top + 1) * .12));
    const left = Math.max(0, box.left - padSource);
    const right = Math.min(width - 1, box.right + padSource);
    const top = Math.max(0, box.top - padSource);
    const bottom = Math.min(height - 1, box.bottom + padSource);
    const sourceWidth = right - left + 1;
    const sourceHeight = bottom - top + 1;
    const scale = Math.max(1, targetHeight / Math.max(1, sourceHeight));
    const canvas = makeCanvas(sourceWidth * scale + 24, sourceHeight * scale + 24);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const image = context.createImageData(sourceWidth, sourceHeight);
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
    const raw = makeCanvas(sourceWidth, sourceHeight);
    raw.getContext('2d').putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(raw, 12, 12, sourceWidth * scale, sourceHeight * scale);
    return canvas;
  }

  function cleanText(value, preserveLines = false) {
    let text = String(value || '')
      .replace(/[|¦]/g, 'I')
      .replace(/[^A-Za-z0-9,\.\-!?\s]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n+ */g, '\n')
      .trim();
    if (!preserveLines) text = text.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
  }

  function scoreCandidate(candidate, expectedGlyphs = 0) {
    const compact = candidate.text.replace(/[^A-Za-z0-9]/g, '');
    const unique = new Set(compact.toUpperCase()).size;
    const longestRun = Math.max(0, ...(compact.match(/(.)\1*/g) || []).map((part) => part.length));
    let score = Number(candidate.confidence || 0) * .38;
    score += Math.min(compact.length, 80) * 1.45;
    score += Math.min(unique, 32) * 2.1;
    if (candidate.segmented) score += 7;
    if (candidate.text.includes('\n')) score += 2;
    if (expectedGlyphs >= 4 && compact.length <= 1) score -= 80;
    if (expectedGlyphs >= 8 && compact.length < expectedGlyphs * .45) score -= 30;
    if (longestRun >= 4) score -= (longestRun - 3) * 5;
    if (!compact.length) score -= 100;
    return score;
  }

  async function recognizePass(current, canvas, psm, label, index, count, preserveLines = false) {
    loggerBase = .16 + index / Math.max(1, count) * .78;
    loggerSpan = .78 / Math.max(1, count);
    await setWorkerParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: OCR_WHITELIST
    });
    const result = await current.recognize(canvas);
    return {
      label,
      text: cleanText(result?.data?.text || '', preserveLines),
      confidence: Number(result?.data?.confidence || 0),
      segmented: false
    };
  }

  async function segmentedRecognition(current, analysis, layout, passOffset, passCount) {
    const { mask, width, height } = analysis;
    const bands = rowBands(mask, width, height);
    if (!bands.length || bands.length > 20) return null;
    const rowResults = [];
    let confidenceTotal = 0;
    let expectedTotal = 0;
    for (let rowIndex = 0; rowIndex < bands.length; rowIndex += 1) {
      const band = bands[rowIndex];
      const segments = columnSegments(mask, width, band);
      expectedTotal += segments.length;
      const rowBounds = {
        left: segments.length ? segments[0].left : 0,
        right: segments.length ? segments[segments.length - 1].right : width - 1,
        top: band.top,
        bottom: band.bottom
      };
      const rowCanvas = cropMask(mask, width, height, rowBounds, 170);
      loggerBase = .16 + (passOffset + rowIndex / Math.max(1, bands.length)) / Math.max(1, passCount) * .78;
      loggerSpan = .78 / Math.max(1, passCount * bands.length);
      await setWorkerParameters({
        tessedit_pageseg_mode: global.Tesseract.PSM?.SINGLE_LINE ?? '7',
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: OCR_WHITELIST
      });
      const result = await current.recognize(rowCanvas);
      let rowText = cleanText(result?.data?.text || '');
      let rowConfidence = Number(result?.data?.confidence || 0);

      const compactLength = rowText.replace(/[^A-Za-z0-9]/g, '').length;
      const shouldSplit = segments.length >= 2 && segments.length <= 36
        && (layout === 'chart' || compactLength < Math.max(1, segments.length * .62));
      if (shouldSplit) {
        const letters = [];
        let splitConfidence = 0;
        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index];
          const glyphCanvas = cropMask(mask, width, height, {
            left: segment.left,
            right: segment.right,
            top: band.top,
            bottom: band.bottom
          }, 190);
          await setWorkerParameters({
            tessedit_pageseg_mode: global.Tesseract.PSM?.SINGLE_CHAR ?? '10',
            tessedit_char_whitelist: OCR_WHITELIST
          });
          const glyph = await current.recognize(glyphCanvas);
          const character = cleanText(glyph?.data?.text || '').replace(/[^A-Za-z0-9]/g, '').charAt(0);
          if (character) letters.push(character);
          splitConfidence += Number(glyph?.data?.confidence || 0);
        }
        if (letters.length >= compactLength) {
          rowText = letters.join('');
          rowConfidence = segments.length ? splitConfidence / segments.length : rowConfidence;
        }
      }
      if (rowText) rowResults.push(rowText);
      confidenceTotal += rowConfidence;
    }
    if (!rowResults.length) return null;
    return {
      label: '分行／逐字高精度识别',
      text: rowResults.join('\n'),
      confidence: confidenceTotal / Math.max(1, bands.length),
      segmented: true,
      expectedGlyphs: expectedTotal,
      bands: bands.length
    };
  }

  async function prepareAnalyses(source, mode) {
    const { gray, histogram } = grayscaleData(source);
    const width = source.width;
    const height = source.height;
    const threshold = otsuThreshold(histogram, gray.length);
    const background = edgeMedian(gray, width, height);
    const primaryLight = background < threshold;
    const analyses = [];

    function add(name, lightForeground, removeBorders) {
      const built = buildMask(gray, width, height, threshold, lightForeground);
      const border = removeBorders ? clearLongBorders(built.mask, width, height) : { rows: 0, columns: 0 };
      const bounds = maskBounds(built.mask, width, height);
      if (!bounds) return;
      const canvas = binaryCanvas(built.mask, width, height, bounds, .065);
      analyses.push({ name, mask: built.mask, width, height, bounds, canvas, border, lightForeground });
    }

    if (mode === 'original') {
      analyses.push({ name: '保持原图', canvas: source, mask: null, width, height, bounds: null, border: { rows: 0, columns: 0 } });
      return analyses;
    }
    if (mode === 'contrast') {
      analyses.push({ name: '灰度高对比', canvas: contrastCanvas(source, false), mask: null, width, height, bounds: null, border: { rows: 0, columns: 0 } });
      add('二值高对比', false, false);
      return analyses;
    }
    if (mode === 'invert') {
      analyses.push({ name: '反色高对比', canvas: contrastCanvas(source, true), mask: null, width, height, bounds: null, border: { rows: 0, columns: 0 } });
      add('反色二值', true, false);
      return analyses;
    }
    if (mode === 'border') {
      add('自动去边框与背景', primaryLight, true);
      add('去边框备用极性', !primaryLight, true);
      return analyses;
    }

    // Smart mode intentionally includes complementary foreground polarity and the
    // original image.  Dark panels with white runes, pale screenshots, borders and
    // reference charts therefore do not depend on one fixed threshold assumption.
    add('智能去边框', primaryLight, true);
    add('智能备用极性', !primaryLight, true);
    analyses.push({ name: '原图补充', canvas: source, mask: null, width, height, bounds: null, border: { rows: 0, columns: 0 } });
    return analyses;
  }

  function layoutPsms(layout, canvas, analysis) {
    if (layout === 'character') return [global.Tesseract.PSM?.SINGLE_CHAR ?? '10'];
    if (layout === 'line') return [global.Tesseract.PSM?.SINGLE_LINE ?? '7'];
    if (layout === 'block' || layout === 'chart') {
      return [global.Tesseract.PSM?.SINGLE_BLOCK ?? '6', global.Tesseract.PSM?.SPARSE_TEXT ?? '11'];
    }
    const aspect = canvas.width / Math.max(1, canvas.height);
    const bands = analysis?.mask ? rowBands(analysis.mask, analysis.width, analysis.height).length : 0;
    if (bands === 1 || aspect >= 2.2) return [global.Tesseract.PSM?.SINGLE_LINE ?? '7', global.Tesseract.PSM?.SPARSE_TEXT ?? '11'];
    return [global.Tesseract.PSM?.SINGLE_BLOCK ?? '6', global.Tesseract.PSM?.SPARSE_TEXT ?? '11'];
  }

  async function runEnsemble(blob, model, preprocessMode, layout, serial) {
    const source = await sourceCanvasFromBlob(blob);
    const analyses = await prepareAnalyses(source, preprocessMode);
    if (!analyses.length) throw new Error('预处理后没有检测到可识别的前景。');
    const current = await getWorker(model);
    if (serial !== recognizeSerial) return null;

    const passPlan = [];
    for (const analysis of analyses) {
      for (const psm of layoutPsms(layout, analysis.canvas, analysis)) {
        passPlan.push({ analysis, psm });
      }
    }
    const segmentationAnalyses = analyses.filter((analysis) => analysis.mask);
    const totalPasses = passPlan.length + segmentationAnalyses.length;
    const candidates = [];

    for (let index = 0; index < passPlan.length; index += 1) {
      if (serial !== recognizeSerial) return null;
      const { analysis, psm } = passPlan[index];
      const candidate = await recognizePass(current, analysis.canvas, psm, `${analysis.name} / PSM ${psm}`, index, totalPasses, layout === 'block' || layout === 'chart');
      candidate.expectedGlyphs = analysis.mask
        ? rowBands(analysis.mask, analysis.width, analysis.height)
          .reduce((sum, band) => sum + columnSegments(analysis.mask, analysis.width, band).length, 0)
        : 0;
      candidates.push(candidate);
    }

    for (let index = 0; index < segmentationAnalyses.length; index += 1) {
      if (serial !== recognizeSerial) return null;
      const candidate = await segmentedRecognition(current, segmentationAnalyses[index], layout, passPlan.length + index, totalPasses);
      if (candidate) candidates.push(candidate);
    }

    for (const candidate of candidates) candidate.score = scoreCandidate(candidate, candidate.expectedGlyphs || 0);
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || { text: '', confidence: 0, label: '无结果', score: -Infinity };

    // Present the strongest binary candidate in the processing canvas, so users can
    // see whether borders/backgrounds were actually removed.
    const displayAnalysis = analyses.find((analysis) => analysis.mask) || analyses[0];
    const display = nodes.runesCanvas;
    display.width = displayAnalysis.canvas.width;
    display.height = displayAnalysis.canvas.height;
    display.getContext('2d').drawImage(displayAnalysis.canvas, 0, 0);
    display.hidden = false;

    return { best, candidates, analyses, source };
  }

  async function recognize() {
    const recognitionFile = global.__RUNE_INPUT_OVERRIDE_V9__ || file;
    if (!recognitionFile) return;
    const serial = ++recognizeSerial;
    nodes.runesRecognize.disabled = true;
    nodes.runesClear.disabled = true;
    nodes.runesOutput.value = '';
    if (nodes.runesDiagnostics) nodes.runesDiagnostics.textContent = '';
    nodes.runesProgress.hidden = false;
    nodes.runesProgress.value = 0;
    Tools.setStatus(nodes.runesStatus, Tools.loadingMarkup('正在分析背景、边框和文字布局…'));
    try {
      loggerBase = 0;
      loggerSpan = .15;
      const result = await runEnsemble(
        recognitionFile,
        nodes.runesModel.value,
        nodes.runesPreprocess.value,
        nodes.runesLayout?.value || 'auto',
        serial
      );
      if (!result || serial !== recognizeSerial) return;
      const text = result.best.text;
      const confidence = Number(result.best.confidence || 0);
      nodes.runesOutput.value = text;
      nodes.runesProgress.value = 1;
      const diagnostics = result.candidates.slice(0, 6).map((candidate) =>
        `${candidate.label}: ${Math.round(candidate.confidence || 0)}%，${candidate.text.replace(/\n/g, ' / ').slice(0, 80) || '无文字'}`
      );
      if (nodes.runesDiagnostics) nodes.runesDiagnostics.textContent = diagnostics.join('\n');
      Tools.setStatus(
        nodes.runesStatus,
        text
          ? `识别完成：采用“${Tools.escapeHtml(result.best.label)}”，模型置信度约 ${Math.round(confidence)}%。`
          : '多方案识别完成，但没有得到文字。可指定“单行”“多行／字母表”或改用另一文字体系。',
        text ? 'success' : 'error'
      );
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.runesStatus, `识别失败：${Tools.escapeHtml(error.message || error)}`, 'error');
    } finally {
      if (serial === recognizeSerial) {
        nodes.runesRecognize.disabled = !file;
        nodes.runesClear.disabled = false;
      }
    }
  }

  async function copyOutput() {
    const text = nodes.runesOutput.value.trim();
    if (!text) {
      Tools.setStatus(nodes.runesStatus, '当前没有可复制的识别结果。', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      Tools.setStatus(nodes.runesStatus, '识别结果已复制。', 'success');
    } catch {
      nodes.runesOutput.focus();
      nodes.runesOutput.select();
      document.execCommand('copy');
      Tools.setStatus(nodes.runesStatus, '识别结果已复制。', 'success');
    }
  }

  function bindDragDrop() {
    for (const type of ['dragenter', 'dragover']) {
      nodes.runesDrop.addEventListener(type, (event) => {
        event.preventDefault();
        nodes.runesDrop.dataset.drag = 'true';
      });
    }
    for (const type of ['dragleave', 'drop']) {
      nodes.runesDrop.addEventListener(type, (event) => {
        event.preventDefault();
        nodes.runesDrop.dataset.drag = 'false';
      });
    }
    nodes.runesDrop.addEventListener('drop', (event) => acceptFile(event.dataTransfer?.files?.[0]));
  }

  function init() {
    cacheNodes();
    Tools.renderNav('runes');
    nodes.runesFile.addEventListener('change', () => acceptFile(nodes.runesFile.files?.[0]));
    nodes.runesRecognize.addEventListener('click', recognize);
    nodes.runesClear.addEventListener('click', () => {
      ++recognizeSerial;
      resetPreview();
    });
    nodes.runesCopy.addEventListener('click', copyOutput);
    nodes.runesModel.addEventListener('change', () => {
      terminateWorker();
      Tools.setStatus(nodes.runesStatus, file ? '文字体系已切换；请重新开始识别。' : '请选择一张图片。');
    });
    bindDragDrop();
  }

  global.__RUNE_OCR_V6__ = Object.freeze({
    sourceCanvasFromBlob,
    grayscaleData,
    otsuThreshold,
    clearLongBorders,
    rowBands,
    columnSegments,
    runEnsemble,
    cleanText,
    scoreCandidate
  });
  global.addEventListener('beforeunload', terminateWorker);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
