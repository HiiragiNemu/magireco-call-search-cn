/* V7 rune recognizer: ordered chart extraction and border/decor filtering. */
(function (global) {
  'use strict';

  const Tools = global.MagiToolsV7 || global.MagiTools;
  if (!Tools) return;
  const ALPHABET_ROWS = ['abcdefg', 'hijklmn', 'opqrstu', 'vwxyz'];
  const TEMPLATE_SIZE = 64;
  let templatePromise = null;

  function canvas(width, height) {
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(width));
    output.height = Math.max(1, Math.round(height));
    return output;
  }

  async function imageFromBlob(blob) {
    if ('createImageBitmap' in global) return createImageBitmap(blob);
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = reject;
      image.src = url;
    });
  }

  async function canvasFromBlob(blob, maxSide = 2400) {
    const image = await imageFromBlob(blob);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const scale = Math.min(3, maxSide / Math.max(width, height), Math.max(width, height) < 900 ? 1.8 : 1);
    const output = canvas(width * scale, height * scale);
    const context = output.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, output.width, output.height);
    image.close?.();
    return output;
  }

  function otsu(histogram, total) {
    let sum = 0;
    for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let best = 127;
    let max = -1;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      backgroundWeight += histogram[threshold];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += threshold * histogram[threshold];
      const meanBackground = backgroundSum / backgroundWeight;
      const meanForeground = (sum - backgroundSum) / foregroundWeight;
      const between = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
      if (between > max) { max = between; best = threshold; }
    }
    return best;
  }

  function grayscale(source) {
    const context = source.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, source.width, source.height);
    const values = new Uint8Array(source.width * source.height);
    const histogram = new Uint32Array(256);
    for (let index = 0, offset = 0; index < values.length; index += 1, offset += 4) {
      const value = Math.round(pixels.data[offset] * .2126 + pixels.data[offset + 1] * .7152 + pixels.data[offset + 2] * .0722);
      values[index] = value;
      histogram[value] += 1;
    }
    return { values, histogram };
  }

  function edgeMedian(values, width, height) {
    const sample = [];
    const step = Math.max(1, Math.floor(Math.max(width, height) / 500));
    for (let x = 0; x < width; x += step) sample.push(values[x], values[(height - 1) * width + x]);
    for (let y = 0; y < height; y += step) sample.push(values[y * width], values[y * width + width - 1]);
    sample.sort((a, b) => a - b);
    return sample[Math.floor(sample.length / 2)] || 255;
  }

  function binaryFromCanvas(source, forcedLightForeground = null) {
    const { values, histogram } = grayscale(source);
    const threshold = otsu(histogram, values.length);
    const lightForeground = forcedLightForeground == null
      ? edgeMedian(values, source.width, source.height) < threshold
      : forcedLightForeground;
    const mask = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      mask[i] = lightForeground ? Number(values[i] >= threshold) : Number(values[i] <= threshold);
    }
    return { mask, width: source.width, height: source.height, threshold, lightForeground };
  }

  function removeLongLines(binary) {
    const { mask, width, height } = binary;
    const rowThreshold = Math.max(20, width * .68);
    const columnThreshold = Math.max(20, height * .68);
    const rows = [];
    const columns = [];
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      for (let x = 0; x < width; x += 1) count += mask[y * width + x];
      if (count >= rowThreshold) rows.push(y);
    }
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let y = 0; y < height; y += 1) count += mask[y * width + x];
      if (count >= columnThreshold) columns.push(x);
    }
    const radius = Math.max(1, Math.round(Math.min(width, height) * .006));
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
    return { ...binary, removedRows: rows.length, removedColumns: columns.length };
  }

  function components(binary) {
    const { mask, width, height } = binary;
    const visited = new Uint8Array(mask.length);
    const output = [];
    const queueX = new Int32Array(mask.length);
    const queueY = new Int32Array(mask.length);
    for (let y0 = 0; y0 < height; y0 += 1) {
      for (let x0 = 0; x0 < width; x0 += 1) {
        const start = y0 * width + x0;
        if (!mask[start] || visited[start]) continue;
        let head = 0, tail = 0, left = x0, right = x0, top = y0, bottom = y0, area = 0;
        queueX[tail] = x0; queueY[tail] = y0; tail += 1; visited[start] = 1;
        while (head < tail) {
          const x = queueX[head], y = queueY[head]; head += 1; area += 1;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const index = ny * width + nx;
            if (mask[index] && !visited[index]) {
              visited[index] = 1; queueX[tail] = nx; queueY[tail] = ny; tail += 1;
            }
          }
        }
        output.push({ left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, area });
      }
    }
    return output;
  }

  function boundsOfMask(mask, width, height, region = null) {
    const box = region || { left: 0, right: width - 1, top: 0, bottom: height - 1 };
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = box.top; y <= box.bottom; y += 1) for (let x = box.left; x <= box.right; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return right < left ? null : { left, right, top, bottom };
  }

  function normalizeGlyph(binary, region) {
    const bounds = boundsOfMask(binary.mask, binary.width, binary.height, region);
    const output = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
    if (!bounds) return output;
    const sourceWidth = bounds.right - bounds.left + 1;
    const sourceHeight = bounds.bottom - bounds.top + 1;
    const scale = Math.min((TEMPLATE_SIZE - 10) / sourceWidth, (TEMPLATE_SIZE - 10) / sourceHeight);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const offsetX = Math.floor((TEMPLATE_SIZE - targetWidth) / 2);
    const offsetY = Math.floor((TEMPLATE_SIZE - targetHeight) / 2);
    for (let ty = 0; ty < targetHeight; ty += 1) for (let tx = 0; tx < targetWidth; tx += 1) {
      const sx = bounds.left + Math.min(sourceWidth - 1, Math.floor(tx / scale));
      const sy = bounds.top + Math.min(sourceHeight - 1, Math.floor(ty / scale));
      if (binary.mask[sy * binary.width + sx]) output[(offsetY + ty) * TEMPLATE_SIZE + offsetX + tx] = 1;
    }
    return output;
  }

  function glyphDistance(a, b, shiftX = 0, shiftY = 0) {
    let difference = 0;
    let union = 0;
    for (let y = 0; y < TEMPLATE_SIZE; y += 1) for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
      const bx = x + shiftX, by = y + shiftY;
      const av = a[y * TEMPLATE_SIZE + x];
      const bv = bx >= 0 && by >= 0 && bx < TEMPLATE_SIZE && by < TEMPLATE_SIZE ? b[by * TEMPLATE_SIZE + bx] : 0;
      if (av || bv) union += 1;
      if (av !== bv) difference += 1;
    }
    return union ? difference / union : 1;
  }

  function matchGlyph(glyph, templates) {
    let best = { character: '?', distance: 1 };
    for (const template of templates) {
      let distance = 1;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        distance = Math.min(distance, glyphDistance(glyph, template.mask, dx, dy));
      }
      if (distance < best.distance) best = { character: template.character, distance };
    }
    return best;
  }

  function referenceCells(binary) {
    const full = boundsOfMask(binary.mask, binary.width, binary.height) || { left: 0, right: binary.width - 1, top: 0, bottom: binary.height - 1 };
    const width = full.right - full.left + 1;
    const height = full.bottom - full.top + 1;
    const cells = [];
    ALPHABET_ROWS.forEach((letters, rowIndex) => {
      const rowTop = full.top + Math.floor(height * rowIndex / 4);
      const rowBottom = full.top + Math.floor(height * (rowIndex + 1) / 4) - 1;
      const columns = letters.length;
      for (let col = 0; col < columns; col += 1) {
        const left = full.left + Math.floor(width * col / columns);
        const right = full.left + Math.floor(width * (col + 1) / columns) - 1;
        // Latin labels occupy the lower part of each reference cell.
        const bottom = rowTop + Math.floor((rowBottom - rowTop + 1) * .76);
        cells.push({ character: letters[col], region: { left, right, top: rowTop, bottom } });
      }
    });
    return cells;
  }

  async function buildTemplates() {
    if (templatePromise) return templatePromise;
    templatePromise = (async () => {
      const response = await fetch('./mdkOCR/madokarunes.jpg', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`魔女文字对照表加载失败：HTTP ${response.status}`);
      const source = await canvasFromBlob(await response.blob());
      const binary = removeLongLines(binaryFromCanvas(source, false));
      return referenceCells(binary).map((cell) => ({ character: cell.character, mask: normalizeGlyph(binary, cell.region) }));
    })();
    return templatePromise;
  }

  function projectionBands(binary) {
    const rows = [];
    const threshold = Math.max(2, Math.round(binary.width * .0015));
    let start = -1;
    for (let y = 0; y <= binary.height; y += 1) {
      let count = 0;
      if (y < binary.height) for (let x = 0; x < binary.width; x += 1) count += binary.mask[y * binary.width + x];
      const active = count >= threshold;
      if (active && start < 0) start = y;
      if (!active && start >= 0) { rows.push({ top: start, bottom: y - 1 }); start = -1; }
    }
    const merged = [];
    const gap = Math.max(3, Math.round(binary.height * .012));
    for (const row of rows) {
      const previous = merged[merged.length - 1];
      if (previous && row.top - previous.bottom <= gap) previous.bottom = row.bottom;
      else merged.push({ ...row });
    }
    return merged.filter((row) => row.bottom - row.top + 1 >= Math.max(8, binary.height * .018));
  }

  function verticalSegments(binary, band) {
    const columns = [];
    const bandHeight = band.bottom - band.top + 1;
    const threshold = Math.max(1, Math.round(bandHeight * .018));
    let start = -1;
    for (let x = 0; x <= binary.width; x += 1) {
      let count = 0;
      if (x < binary.width) for (let y = band.top; y <= band.bottom; y += 1) count += binary.mask[y * binary.width + x];
      const active = count >= threshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { columns.push({ left: start, right: x - 1 }); start = -1; }
    }
    if (columns.length < 2) return columns;
    const widths = columns.map((item) => item.right - item.left + 1).sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)] || 1;
    const gapLimit = Math.max(2, median * .16);
    const merged = [];
    for (const item of columns) {
      const previous = merged[merged.length - 1];
      const combinedWidth = previous ? item.right - previous.left + 1 : 0;
      if (previous && item.left - previous.right - 1 <= gapLimit && combinedWidth <= median * 1.75) previous.right = item.right;
      else merged.push({ ...item });
    }
    return merged;
  }

  function chooseTextBands(binary, layout) {
    const rawBands = projectionBands(binary);
    const imageCenter = binary.height / 2;
    const candidates = rawBands.map((band) => {
      const segments = verticalSegments(binary, band);
      const height = band.bottom - band.top + 1;
      const center = (band.top + band.bottom) / 2;
      const coverage = segments.length ? (segments[segments.length - 1].right - segments[0].left + 1) / binary.width : 0;
      const componentPenalty = segments.some((item) => item.right - item.left > binary.width * .35) ? 30 : 0;
      const score = segments.length * 8 + coverage * 35 + height / binary.height * 18
        - Math.abs(center - imageCenter) / binary.height * 12 - componentPenalty;
      return { band, segments, score };
    }).filter((item) => item.segments.length >= 2 && item.segments.length <= 40);
    if (layout === 'chart' || layout === 'block') return candidates.sort((a, b) => a.band.top - b.band.top);
    return candidates.sort((a, b) => b.score - a.score).slice(0, 1);
  }

  function renderBinary(binary) {
    const output = document.getElementById('runesCanvas');
    if (!output) return;
    output.width = binary.width;
    output.height = binary.height;
    const context = output.getContext('2d');
    const image = context.createImageData(binary.width, binary.height);
    image.data.fill(255);
    for (let i = 0; i < binary.mask.length; i += 1) {
      if (!binary.mask[i]) continue;
      const offset = i * 4;
      image.data[offset] = 0; image.data[offset + 1] = 0; image.data[offset + 2] = 0; image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    output.hidden = false;
  }

  function chartRecognition(binary, templates) {
    const cells = referenceCells(binary);
    const rows = [];
    let index = 0;
    let distanceTotal = 0;
    for (const expectedRow of ALPHABET_ROWS) {
      let text = '';
      for (let col = 0; col < expectedRow.length; col += 1) {
        const glyph = normalizeGlyph(binary, cells[index].region);
        const match = matchGlyph(glyph, templates);
        text += match.character;
        distanceTotal += match.distance;
        index += 1;
      }
      rows.push(text);
    }
    return { text: rows.join('\n'), confidence: Math.max(0, 1 - distanceTotal / 26), glyphs: 26, mode: 'row-major-chart' };
  }

  function bandRecognition(binary, templates, layout) {
    const selected = chooseTextBands(binary, layout);
    if (!selected.length) return { text: '', confidence: 0, glyphs: 0, mode: 'no-band' };
    const lines = [];
    let distanceTotal = 0;
    let glyphCount = 0;
    for (const { band, segments } of selected) {
      const widths = segments.map((segment) => segment.right - segment.left + 1).sort((a, b) => a - b);
      const medianWidth = widths[Math.floor(widths.length / 2)] || 1;
      const gaps = segments.slice(1).map((segment, index) => segment.left - segments[index].right - 1).filter((gap) => gap > 0);
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || medianWidth * .25;
      let line = '';
      segments.forEach((segment, segmentIndex) => {
        if (segmentIndex) {
          const gap = segment.left - segments[segmentIndex - 1].right - 1;
          if (gap > Math.max(medianWidth * .75, medianGap * 2.2)) line += ' ';
        }
        const glyph = normalizeGlyph(binary, { left: segment.left, right: segment.right, top: band.top, bottom: band.bottom });
        const match = matchGlyph(glyph, templates);
        line += match.character;
        distanceTotal += match.distance;
        glyphCount += 1;
      });
      if (line.trim()) lines.push(line.trim());
    }
    const text = lines.join('\n');
    const confidence = glyphCount ? Math.max(0, 1 - distanceTotal / glyphCount) : 0;
    return { text, confidence, glyphs: glyphCount, mode: 'segmented-template' };
  }

  async function recognizeTemplate(file, layout) {
    const source = await canvasFromBlob(file);
    const templates = await buildTemplates();
    const candidates = [];
    for (const lightForeground of [null, false, true]) {
      const binary = removeLongLines(binaryFromCanvas(source, lightForeground));
      const result = layout === 'chart' ? chartRecognition(binary, templates) : bandRecognition(binary, templates, layout);
      const letterCount = result.text.replace(/[^A-Za-z]/g, '').length;
      const unique = new Set(result.text.replace(/[^A-Za-z]/g, '').toLowerCase()).size;
      const removedLines = binary.removedRows + binary.removedColumns;
    const borderBonus = removedLines > 0 ? .11 : 0;
    result.letterCount = letterCount;
    result.uniqueCount = unique;
    result.removedLines = removedLines;
    result.score = result.confidence
      + Math.min(.18, letterCount / 150)
      + Math.min(.08, unique / 150)
      + borderBonus;
    result.binary = binary;
    result.removedRows = binary.removedRows;
    result.removedColumns = binary.removedColumns;
    candidates.push(result);
  }
  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];
  if (layout !== 'chart') {
    const borderCandidates = candidates
      .filter((candidate) => candidate.removedLines > 0
        && candidate.letterCount >= 3
        && candidate.uniqueCount >= 3)
      .sort((a, b) => b.score - a.score);
    const borderBest = borderCandidates[0];
    if (borderBest && (borderBest.score >= best.score - .28
      || best.letterCount < 5
      || best.uniqueCount < 3)) {
      best = borderBest;
    }
  }
  return { best, candidates };
  }

  function install() {
    const oldButton = document.getElementById('runesRecognize');
    const fileInput = document.getElementById('runesFile');
    const layout = document.getElementById('runesLayout');
    const output = document.getElementById('runesOutput');
    const status = document.getElementById('runesStatus');
    const diagnostics = document.getElementById('runesDiagnostics');
    const progress = document.getElementById('runesProgress');
    if (!oldButton || !fileInput || !layout || !output || !status) return;

    const button = oldButton.cloneNode(true);
    oldButton.hidden = true;
    oldButton.id = 'runesRecognizeLegacyV7';
    button.id = 'runesRecognize';
    oldButton.after(button);

    button.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      if (!file) return Tools.setStatus(status, '请先选择图片。', 'error');
      const mode = layout.value || 'auto';
      button.disabled = true;
      if (progress) { progress.hidden = false; progress.value = .08; }
      Tools.setStatus(status, Tools.loadingMarkup('正在分离边框、装饰和文字…'));
      try {
        const effective = mode === 'auto' ? (file.name.toLowerCase().includes('alphabet') ? 'chart' : 'line') : mode;
        if (effective === 'character') {
          oldButton.hidden = false;
          oldButton.click();
          oldButton.hidden = true;
          return;
        }
        const result = await recognizeTemplate(file, effective);
        const best = result.best;
        const letters = best.text.replace(/[^A-Za-z]/g, '');
    const uniqueLetters = new Set(letters.toLowerCase()).size;
    const minimum = effective === 'chart' ? 18 : 3;
    const borderAwareUsable = effective !== 'chart'
      && best.removedLines > 0
      && letters.length >= minimum
      && uniqueLetters >= 3;
    if (letters.length < minimum || (best.confidence < .18 && !borderAwareUsable)) {
      // Fall back only when the ordered template result is weak and did
      // not become usable after detected frame lines were removed.
      oldButton.hidden = false;
      oldButton.click();
      oldButton.hidden = true;
      Tools.setStatus(status, '模板分割置信度不足，已切换到经典模型。');
      return;
    }
        output.value = effective === 'line' ? best.text.toUpperCase() : best.text;
        renderBinary(best.binary);
        if (progress) progress.value = 1;
        if (diagnostics) {
          diagnostics.textContent = [
            `V7 ${best.mode}：${Math.round(best.confidence * 100)}%`,
            `检测字符：${best.glyphs}；移除长横线：${best.removedRows}；移除长竖线：${best.removedColumns}`,
            ...result.candidates.slice(0, 3).map((candidate, index) =>
              `候选${index + 1}：${Math.round(candidate.confidence * 100)}% · ${candidate.text.replace(/\n/g, ' / ')}`)
          ].join('\n');
        }
        Tools.setStatus(status, `识别完成：按${effective === 'chart' ? '自上而下、从左到右' : '文字行'}排列。`, 'success');
      } catch (error) {
        console.error(error);
        Tools.setStatus(status, `识别失败：${Tools.escapeHtml(error.message || error)}`, 'error');
      } finally {
        button.disabled = !fileInput.files?.length;
      }
    });

    fileInput.addEventListener('change', () => { button.disabled = !fileInput.files?.length; });
    global.__RUNE_TEMPLATE_V7__ = Object.freeze({ recognizeTemplate, buildTemplates, binaryFromCanvas, removeLongLines });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
