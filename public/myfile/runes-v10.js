/* V10 rune OCR: smart mask crop, robust rule-network recognition and alphabet-grid extraction. */
(function (global) {
  'use strict';

  const Tools = global.MagiToolsV7 || global.MagiTools;
  if (!Tools) return;

  const RELEASE = 'height-export-title-call-rune-v10-20260817';
  const ALPHABET_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];
  const TEMPLATE_SIZE = 72;
  const MAX_SIDE = 2600;
  const nodes = {};
  let templatePromise = null;
  let runSerial = 0;

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function canvasToBlob(canvas, type = 'image/png', quality = .98) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成识别图片。')), type, quality);
    });
  }

  async function decodeImage(blob) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(blob); } catch { /* use Image fallback */ }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      image.src = url;
    });
  }

  async function canvasFromBlob(blob, maxSide = MAX_SIDE) {
    const image = await decodeImage(blob);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const longest = Math.max(width, height);
    const upscale = longest < 950 ? Math.min(2.6, 1350 / Math.max(1, longest)) : 1;
    const scale = Math.min(upscale, maxSide / Math.max(1, longest));
    const canvas = makeCanvas(width * scale, height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    return canvas;
  }

  function grayscale(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const values = new Uint8Array(canvas.width * canvas.height);
    const histogram = new Uint32Array(256);
    for (let index = 0, offset = 0; index < values.length; index += 1, offset += 4) {
      const value = Math.max(0, Math.min(255, Math.round(
        pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722
      )));
      values[index] = value;
      histogram[value] += 1;
    }
    return { values, histogram, width: canvas.width, height: canvas.height };
  }

  function otsu(histogram, total) {
    let sum = 0;
    for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let maximum = -1;
    let best = 127;
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

  function percentile(histogram, total, fraction) {
    const target = Math.max(1, Math.round(total * fraction));
    let cumulative = 0;
    for (let value = 0; value < 256; value += 1) {
      cumulative += histogram[value];
      if (cumulative >= target) return value;
    }
    return 127;
  }

  function removeLongLines(binary) {
    const { mask, width, height } = binary;
    const rowLimit = Math.max(20, Math.round(width * .70));
    const columnLimit = Math.max(20, Math.round(height * .70));
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
    const radius = Math.max(1, Math.round(Math.min(width, height) * .0045));
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
    binary.removedRows = rows.length;
    binary.removedColumns = columns.length;
    return binary;
  }

  function binaryCandidates(canvas) {
    const data = grayscale(canvas);
    const base = otsu(data.histogram, data.values.length);
    const q22 = percentile(data.histogram, data.values.length, .22);
    const q35 = percentile(data.histogram, data.values.length, .35);
    const thresholds = [...new Set([
      base - 24, base - 12, base, base + 12,
      q22, Math.round((q22 + q35) / 2), q35
    ].map((value) => Math.max(24, Math.min(232, value))))];
    const output = [];
    for (const threshold of thresholds) {
      for (const polarity of ['dark', 'light']) {
        const mask = new Uint8Array(data.values.length);
        let foreground = 0;
        for (let index = 0; index < data.values.length; index += 1) {
          const active = polarity === 'dark'
            ? data.values[index] <= threshold
            : data.values[index] >= threshold;
          if (active) { mask[index] = 1; foreground += 1; }
        }
        const ratio = foreground / Math.max(1, mask.length);
        if (ratio < .001 || ratio > .64) continue;
        output.push(removeLongLines({
          mask,
          width: data.width,
          height: data.height,
          threshold,
          polarity,
          foregroundRatio: ratio,
          removedRows: 0,
          removedColumns: 0
        }));
      }
    }
    return output;
  }

  function projectionBands(binary) {
    const { mask, width, height } = binary;
    const threshold = Math.max(2, Math.round(width * .0018));
    const raw = [];
    let start = -1;
    for (let y = 0; y <= height; y += 1) {
      let count = 0;
      if (y < height) {
        const offset = y * width;
        for (let x = 0; x < width; x += 1) count += mask[offset + x];
      }
      const active = count >= threshold;
      if (active && start < 0) start = y;
      if (!active && start >= 0) { raw.push({ top: start, bottom: y - 1 }); start = -1; }
    }
    const gapLimit = Math.max(2, Math.round(height * .008));
    const merged = [];
    for (const band of raw) {
      const previous = merged[merged.length - 1];
      if (previous && band.top - previous.bottom - 1 <= gapLimit) previous.bottom = band.bottom;
      else merged.push({ ...band });
    }
    return merged.filter((band) => band.bottom - band.top + 1 >= Math.max(5, height * .012));
  }

  function verticalSegments(binary, band) {
    const { mask, width } = binary;
    const bandHeight = band.bottom - band.top + 1;
    const threshold = Math.max(1, Math.round(bandHeight * .014));
    const raw = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      let count = 0;
      if (x < width) {
        for (let y = band.top; y <= band.bottom; y += 1) count += mask[y * width + x];
      }
      const active = count >= threshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { raw.push({ left: start, right: x - 1 }); start = -1; }
    }
    if (raw.length < 2) return raw;
    const widths = raw.map((part) => part.right - part.left + 1).sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)] || 1;
    const gapLimit = Math.max(2, Math.round(median * .24));
    const merged = [];
    for (const part of raw) {
      const previous = merged[merged.length - 1];
      const combined = previous ? part.right - previous.left + 1 : 0;
      if (previous && part.left - previous.right - 1 <= gapLimit && combined <= median * 2.35) {
        previous.right = part.right;
      } else {
        merged.push({ ...part });
      }
    }
    return merged;
  }

  function bandHorizontalBounds(binary, band) {
    const { mask, width } = binary;
    let left = width;
    let right = -1;
    for (let y = band.top; y <= band.bottom; y += 1) {
      const offset = y * width;
      for (let x = 0; x < width; x += 1) {
        if (!mask[offset + x]) continue;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    return right < left ? null : { left, right };
  }

  function combinations(items, count, start = 0, prefix = [], result = []) {
    if (prefix.length === count) { result.push(prefix.slice()); return result; }
    for (let index = start; index <= items.length - (count - prefix.length); index += 1) {
      prefix.push(items[index]);
      combinations(items, count, index + 1, prefix, result);
      prefix.pop();
    }
    return result;
  }

  function detectAlphabetGrid(binary) {
    const expected = [7, 7, 7, 5];
    const candidates = projectionBands(binary).map((band) => {
      const height = band.bottom - band.top + 1;
      const segments = verticalSegments(binary, band);
      const bounds = bandHorizontalBounds(binary, band);
      const coverage = bounds ? (bounds.right - bounds.left + 1) / binary.width : 0;
      return { band, height, segments, bounds, coverage };
    }).filter((item) => item.segments.length >= 3 && item.segments.length <= 15
      && item.height >= Math.max(10, binary.height * .025));
    if (candidates.length < 4) return null;

    let best = null;
    for (const group of combinations(candidates.slice(0, 12), 4)) {
      let score = 0;
      const heights = [];
      const centers = [];
      let valid = true;
      group.forEach((item, index) => {
        const countError = Math.abs(item.segments.length - expected[index]);
        if (countError > 5) valid = false;
        score += 46 - countError * 9;
        score += Math.min(32, item.height / binary.height * 145);
        score += Math.min(14, item.coverage * 14);
        heights.push(item.height);
        centers.push((item.band.top + item.band.bottom) / 2);
      });
      if (!valid) continue;
      for (let index = 1; index < centers.length; index += 1) {
        if (centers[index] <= centers[index - 1]) valid = false;
        const gap = centers[index] - centers[index - 1];
        if (gap < Math.max(12, Math.min(heights[index], heights[index - 1]) * .72)) valid = false;
      }
      if (!valid) continue;
      const average = heights.reduce((sum, value) => sum + value, 0) / heights.length;
      const variance = heights.reduce((sum, value) => sum + Math.abs(value - average), 0) / heights.length;
      score -= variance / Math.max(1, average) * 22;
      const gaps = centers.slice(1).map((value, index) => value - centers[index]);
      const gapAverage = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
      score -= gaps.reduce((sum, value) => sum + Math.abs(value - gapAverage), 0) / gaps.length
        / Math.max(1, gapAverage) * 16;
      if (!best || score > best.score) best = { rows: group, score };
    }
    if (!best || best.score < 125) return null;
    return best;
  }

  function cellRegionsForGrid(grid) {
    const regions = [];
    grid.rows.forEach((item, rowIndex) => {
      const count = ALPHABET_ROWS[rowIndex].length;
      const bounds = item.bounds || { left: 0, right: Number.MAX_SAFE_INTEGER };
      const left = Math.max(0, bounds.left);
      const right = bounds.right;
      const span = Math.max(count, right - left + 1);
      for (let column = 0; column < count; column += 1) {
        const cellLeft = Math.floor(left + span * column / count);
        const cellRight = Math.floor(left + span * (column + 1) / count) - 1;
        regions.push({
          character: ALPHABET_ROWS[rowIndex][column],
          row: rowIndex,
          column,
          region: { left: cellLeft, right: cellRight, top: item.band.top, bottom: item.band.bottom }
        });
      }
    });
    return regions;
  }

  function boundsInRegion(binary, region) {
    const { mask, width, height } = binary;
    const leftLimit = Math.max(0, Math.min(width - 1, region.left));
    const rightLimit = Math.max(leftLimit, Math.min(width - 1, region.right));
    const topLimit = Math.max(0, Math.min(height - 1, region.top));
    const bottomLimit = Math.max(topLimit, Math.min(height - 1, region.bottom));
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = topLimit; y <= bottomLimit; y += 1) {
      for (let x = leftLimit; x <= rightLimit; x += 1) {
        if (!mask[y * width + x]) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < left ? null : { left, right, top, bottom };
  }

  function normalizeGlyph(binary, region) {
    const bounds = boundsInRegion(binary, region);
    const output = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
    if (!bounds) return output;
    const sourceWidth = bounds.right - bounds.left + 1;
    const sourceHeight = bounds.bottom - bounds.top + 1;
    const scale = Math.min((TEMPLATE_SIZE - 12) / sourceWidth, (TEMPLATE_SIZE - 12) / sourceHeight);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const offsetX = Math.floor((TEMPLATE_SIZE - targetWidth) / 2);
    const offsetY = Math.floor((TEMPLATE_SIZE - targetHeight) / 2);
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const sourceX = bounds.left + Math.min(sourceWidth - 1, Math.floor(x / scale));
        const sourceY = bounds.top + Math.min(sourceHeight - 1, Math.floor(y / scale));
        if (binary.mask[sourceY * binary.width + sourceX]) {
          output[(offsetY + y) * TEMPLATE_SIZE + offsetX + x] = 1;
        }
      }
    }
    return output;
  }

  function glyphDistance(left, right, shiftX = 0, shiftY = 0) {
    let difference = 0;
    let union = 0;
    for (let y = 0; y < TEMPLATE_SIZE; y += 1) {
      for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
        const rightX = x + shiftX;
        const rightY = y + shiftY;
        const a = left[y * TEMPLATE_SIZE + x];
        const b = rightX >= 0 && rightY >= 0 && rightX < TEMPLATE_SIZE && rightY < TEMPLATE_SIZE
          ? right[rightY * TEMPLATE_SIZE + rightX]
          : 0;
        if (a || b) union += 1;
        if (a !== b) difference += 1;
      }
    }
    return union ? difference / union : 1;
  }

  function matchGlyph(glyph, bank) {
    let best = { character: '?', distance: 1 };
    for (const [character, variants] of bank) {
      for (const template of variants) {
        let distance = 1;
        for (let shiftY = -2; shiftY <= 2; shiftY += 1) {
          for (let shiftX = -2; shiftX <= 2; shiftX += 1) {
            distance = Math.min(distance, glyphDistance(glyph, template, shiftX, shiftY));
          }
        }
        if (distance < best.distance) best = { character, distance };
      }
    }
    return best;
  }

  async function buildTemplateBank() {
    if (templatePromise) return templatePromise;
    templatePromise = (async () => {
      const response = await fetch('./mdkOCR/madokarunes.jpg', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`魔女文字对照表加载失败：HTTP ${response.status}`);
      const canvas = await canvasFromBlob(await response.blob(), 2400);
      const ranked = binaryCandidates(canvas)
        .map((binary) => ({ binary, grid: detectAlphabetGrid(binary) }))
        .filter((item) => item.grid)
        .sort((a, b) => b.grid.score - a.grid.score)
        .slice(0, 4);
      if (!ranked.length) throw new Error('无法从本地对照表提取字母模板。');
      const bank = new Map(ALPHABET_ROWS.join('').split('').map((character) => [character, []]));
      for (const item of ranked) {
        for (const cell of cellRegionsForGrid(item.grid)) {
          const glyph = normalizeGlyph(item.binary, cell.region);
          if (glyph.some(Boolean)) bank.get(cell.character).push(glyph);
        }
      }
      if ([...bank.values()].some((variants) => !variants.length)) {
        throw new Error('本地对照表模板不完整。');
      }
      return bank;
    })();
    return templatePromise;
  }

  function renderBinary(binary) {
    const canvas = nodes.processed;
    if (!canvas || !binary) return;
    canvas.width = binary.width;
    canvas.height = binary.height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(binary.width, binary.height);
    image.data.fill(255);
    for (let index = 0; index < binary.mask.length; index += 1) {
      if (!binary.mask[index]) continue;
      const offset = index * 4;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    canvas.hidden = false;
  }

  function recognizeAlphabet(binary, grid, bank) {
    const rows = ['', '', '', ''];
    let distanceTotal = 0;
    let glyphs = 0;
    for (const cell of cellRegionsForGrid(grid)) {
      const match = matchGlyph(normalizeGlyph(binary, cell.region), bank);
      rows[cell.row] += match.character;
      distanceTotal += match.distance;
      glyphs += 1;
    }
    const confidence = glyphs ? Math.max(0, 1 - distanceTotal / glyphs) : 0;
    return {
      text: rows.join('\n'),
      normalized: rows.join(''),
      confidence,
      glyphs,
      mode: 'alphabet-grid',
      binary,
      structureScore: grid.score,
      score: confidence * 110 + grid.score * .16 + glyphs * 1.2
    };
  }

  function textBands(binary, layout) {
    const center = binary.height / 2;
    const candidates = projectionBands(binary).map((band) => {
      const segments = verticalSegments(binary, band);
      const bounds = bandHorizontalBounds(binary, band);
      const height = band.bottom - band.top + 1;
      const coverage = bounds ? (bounds.right - bounds.left + 1) / binary.width : 0;
      const bandCenter = (band.top + band.bottom) / 2;
      const score = segments.length * 8 + height / binary.height * 95 + coverage * 22
        - Math.abs(bandCenter - center) / binary.height * 10;
      return { band, segments, height, coverage, score };
    }).filter((item) => item.segments.length >= 2 && item.segments.length <= 48
      && item.height >= Math.max(8, binary.height * .02));
    if (!candidates.length) return [];
    if (layout === 'line') return candidates.sort((a, b) => b.score - a.score).slice(0, 1);
    const heightMedian = candidates.map((item) => item.height).sort((a, b) => a - b)[Math.floor(candidates.length / 2)] || 1;
    return candidates
      .filter((item) => item.height >= heightMedian * .62)
      .sort((a, b) => a.band.top - b.band.top)
      .slice(0, 14);
  }

  function recognizeBands(binary, bank, layout) {
    const bands = textBands(binary, layout);
    if (!bands.length) return null;
    const lines = [];
    let distanceTotal = 0;
    let glyphCount = 0;
    for (const item of bands) {
      const segments = item.segments;
      const widths = segments.map((segment) => segment.right - segment.left + 1).sort((a, b) => a - b);
      const medianWidth = widths[Math.floor(widths.length / 2)] || 1;
      const gaps = segments.slice(1)
        .map((segment, index) => segment.left - segments[index].right - 1)
        .filter((gap) => gap > 0)
        .sort((a, b) => a - b);
      const medianGap = gaps[Math.floor(gaps.length / 2)] || medianWidth * .25;
      let line = '';
      segments.forEach((segment, index) => {
        if (index) {
          const gap = segment.left - segments[index - 1].right - 1;
          if (gap > Math.max(medianWidth * .72, medianGap * 2.15)) line += ' ';
        }
        const glyph = normalizeGlyph(binary, {
          left: segment.left,
          right: segment.right,
          top: item.band.top,
          bottom: item.band.bottom
        });
        const match = matchGlyph(glyph, bank);
        line += match.character;
        distanceTotal += match.distance;
        glyphCount += 1;
      });
      if (line.trim()) lines.push(line.trim());
    }
    if (!lines.length) return null;
    const text = lines.join('\n');
    const confidence = glyphCount ? Math.max(0, 1 - distanceTotal / glyphCount) : 0;
    const compact = text.replace(/[^A-Z]/gi, '');
    const unique = new Set(compact).size;
    const longestRun = Math.max(0, ...(compact.match(/(.)\1*/g) || []).map((part) => part.length));
    let score = confidence * 112 + Math.min(38, compact.length * 2.1) + Math.min(18, unique * 1.4);
    if (longestRun >= 4) score -= (longestRun - 3) * 7;
    if (compact.length < 3) score -= 70;
    return { text, normalized: compact, confidence, glyphs: glyphCount, mode: 'rule-network', binary, score };
  }

  async function recognizeTemplate(file, requestedLayout = 'auto') {
    const canvas = await canvasFromBlob(file);
    const bank = await buildTemplateBank();
    const candidates = [];
    for (const binary of binaryCandidates(canvas)) {
      const grid = detectAlphabetGrid(binary);
      if (grid) candidates.push(recognizeAlphabet(binary, grid, bank));
      const genericLayout = requestedLayout === 'line' ? 'line' : 'block';
      const bands = recognizeBands(binary, bank, genericLayout);
      if (bands) candidates.push(bands);
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || { text: '', normalized: '', confidence: 0, glyphs: 0, mode: 'none', score: -Infinity, binary: null };
    return { best, candidates };
  }

  function paintedStrokeSize() {
    const state = global.__RUNE_MASK_V9__?.state;
    const values = (state?.commands || [])
      .filter((command) => command.type === 'stroke' && command.mode !== 'erase')
      .map((command) => Number(command.size) || 0);
    return Math.max(0, ...values);
  }

  async function buildSmartMaskedFile(original) {
    const maskApi = global.__RUNE_MASK_V9__;
    const state = maskApi?.state;
    const overlay = document.getElementById('runesMaskCanvas');
    const metrics = maskApi?.maskMetrics?.();
    if (!state?.enabled || !overlay || !metrics) throw new Error('蒙版为空，请先横向圈选要识别的文字行。');

    let bitmap = state.sourceBitmap;
    let owned = false;
    if (!bitmap) { bitmap = await decodeImage(original); owned = true; }
    const sourceWidth = state.sourceWidth || bitmap.width || bitmap.naturalWidth;
    const sourceHeight = state.sourceHeight || bitmap.height || bitmap.naturalHeight;
    const source = makeCanvas(sourceWidth, sourceHeight);
    source.getContext('2d').drawImage(bitmap, 0, 0, sourceWidth, sourceHeight);
    if (owned) bitmap.close?.();

    const stroke = paintedStrokeSize();
    const padX = Math.max(12, Math.round(metrics.width * .025), Math.round(stroke * .42));
    const padY = Math.max(12, Math.round(metrics.height * .46), Math.round(stroke * .55));
    const left = Math.max(0, metrics.left - padX);
    const right = Math.min(sourceWidth - 1, metrics.right + padX);
    const top = Math.max(0, metrics.top - padY);
    const bottom = Math.min(sourceHeight - 1, metrics.bottom + padY);
    const width = right - left + 1;
    const height = bottom - top + 1;
    const output = makeCanvas(width, height);
    const context = output.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, left, top, width, height, 0, 0, width, height);
    const blob = await canvasToBlob(output);
    return {
      file: new File([blob], `smart-mask-${original.name.replace(/\.[^.]+$/, '') || 'runes'}.png`, { type: 'image/png' }),
      width,
      height,
      metrics,
      strategy: 'expanded-rectangular-selection',
      padX,
      padY,
      canvas: output
    };
  }

  function waitForStatus(timeout = 420000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (nodes.status.dataset.kind === 'success' || nodes.status.dataset.kind === 'error') finish();
      });
      observer.observe(nodes.status, { attributes: true, childList: true, subtree: true, characterData: true });
      const timer = global.setTimeout(finish, timeout);
    });
  }

  async function classicFallback(file, layout) {
    const legacy = document.getElementById('runesRecognizeLegacyV7');
    if (!legacy) return false;
    const savedLayout = nodes.layout.value;
    global.__RUNE_INPUT_OVERRIDE_V9__ = file;
    nodes.layout.value = layout === 'character' ? 'character' : (layout === 'line' ? 'line' : 'chart');
    nodes.status.removeAttribute('data-kind');
    legacy.disabled = false;
    const completion = waitForStatus();
    legacy.click();
    await completion;
    delete global.__RUNE_INPUT_OVERRIDE_V9__;
    nodes.layout.value = savedLayout;
    return Boolean(nodes.output.value.trim());
  }

  function diagnosticsText(result, mask) {
    const lines = [];
    if (mask) lines.push(`智能蒙版：${mask.width}×${mask.height}px；已扩展到完整文字高度。`);
    for (const candidate of result.candidates.slice(0, 5)) {
      const label = candidate.mode === 'alphabet-grid' ? '字母表网格' : '规则网络';
      lines.push(`${label}：${Math.round(candidate.confidence * 100)}%；${candidate.text.replace(/\n/g, ' / ').slice(0, 100) || '无文字'}`);
    }
    return lines.join('\n');
  }

  async function recognize() {
    const original = nodes.file.files?.[0];
    if (!original) return Tools.setStatus(nodes.status, '请先选择图片。', 'error');
    const serial = ++runSerial;
    nodes.button.disabled = true;
    nodes.clear.disabled = true;
    nodes.output.value = '';
    nodes.diagnostics.textContent = '';
    nodes.progress.hidden = false;
    nodes.progress.value = .05;

    let mask = null;
    let input = original;
    try {
      const maskState = global.__RUNE_MASK_V9__?.state;
      if (maskState?.enabled) {
        Tools.setStatus(nodes.status, Tools.loadingMarkup('正在扩展涂抹选区并保留完整字形…'));
        mask = await buildSmartMaskedFile(original);
        input = mask.file;
        const maskStatus = document.getElementById('runesMaskStatus');
        if (maskStatus) {
          maskStatus.textContent = `已智能扩展选区：${mask.width}×${mask.height}px。涂抹只用于圈选文字，不会再截断字形。`;
          maskStatus.dataset.kind = 'success';
        }
      }
      if (serial !== runSerial) return;

      const requested = nodes.layout.value || 'auto';
      const standardModel = nodes.model.value === 'mdk';
      const effective = requested === 'auto' && mask ? 'chart' : requested;
      if (!standardModel || effective === 'character') {
        Tools.setStatus(nodes.status, Tools.loadingMarkup('正在使用经典模型识别…'));
        await classicFallback(input, effective);
        return;
      }

      Tools.setStatus(
        nodes.status,
        Tools.loadingMarkup(effective === 'chart'
          ? '正在使用字母表／规则网络高精度识别…'
          : '正在分析文字行；必要时自动切换规则网络…')
      );
      nodes.progress.value = .18;
      const result = await recognizeTemplate(input, effective);
      if (serial !== runSerial) return;
      const best = result.best;
      const minimumLetters = best.mode === 'alphabet-grid' ? 20 : 3;
      const usable = best.normalized.length >= minimumLetters
        && best.confidence >= (best.mode === 'alphabet-grid' ? .38 : .34);

      if (!usable) {
        Tools.setStatus(nodes.status, Tools.loadingMarkup('规则网络结果不足，正在追加经典模型复核…'));
        const fallback = await classicFallback(input, effective === 'line' ? 'line' : 'chart');
        if (!fallback && best.text) nodes.output.value = best.text.toUpperCase();
        if (nodes.diagnostics) nodes.diagnostics.textContent = diagnosticsText(result, mask);
        return;
      }

      nodes.output.value = best.text.toUpperCase();
      renderBinary(best.binary);
      nodes.progress.value = 1;
      nodes.diagnostics.textContent = diagnosticsText(result, mask);
      const method = best.mode === 'alphabet-grid' ? '字母表网格' : '规则网络';
      Tools.setStatus(
        nodes.status,
        `识别完成：采用“${method}”，按自上而下、从左到右排列；匹配度约 ${Math.round(best.confidence * 100)}%。`,
        'success'
      );
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.status, `识别失败：${Tools.escapeHtml(error.message || error)}`, 'error');
    } finally {
      delete global.__RUNE_INPUT_OVERRIDE_V9__;
      if (serial === runSerial) {
        nodes.button.disabled = !nodes.file.files?.length;
        nodes.clear.disabled = false;
      }
    }
  }

  function installGuidance() {
    const option = nodes.layout.querySelector('option[value="chart"]');
    if (option) option.textContent = '字母表／规则网络（较慢但更准确）';
    if (document.getElementById('runesGuidanceV10')) return;
    const guidance = document.createElement('div');
    guidance.id = 'runesGuidanceV10';
    guidance.className = 'runes-guidance-v10';
    guidance.innerHTML = '<strong>复杂背景或边框：</strong>请切换“字母表／规则网络（较慢但更准确）”。启用涂抹选区时，自动模式会直接使用该高精度路径；只需横向圈住文字行，不必描出每个字形。';
    nodes.layout.closest('.suite-field')?.insertAdjacentElement('afterend', guidance);

    const legend = document.querySelector('#runesMaskControlsV9 > legend');
    if (legend) legend.textContent = '涂抹选区（圈选文字行，不必描字形）';
    const enable = document.querySelector('.runes-mask-enable-v9');
    if (enable) {
      const textNode = [...enable.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = '只识别涂抹选区';
    }
  }

  function installButton() {
    const previous = document.getElementById('runesRecognize');
    if (!previous || previous.dataset.runeV10Delegate === 'true') return;
    previous.id = 'runesRecognizeV9';
    previous.hidden = true;
    previous.dataset.runeV10Delegate = 'true';

    const button = previous.cloneNode(true);
    button.id = 'runesRecognize';
    button.hidden = false;
    button.disabled = !nodes.file.files?.length;
    button.removeAttribute('data-mask-bridge-v9');
    button.dataset.runeV10 = 'true';
    previous.after(button);
    nodes.button = button;

    button.addEventListener('click', recognize);
    nodes.file.addEventListener('change', () => {
      button.disabled = !nodes.file.files?.length;
      nodes.output.value = '';
      if (nodes.diagnostics) nodes.diagnostics.textContent = '';
    });
  }

  function install() {
    if (document.body?.dataset.suiteTool !== 'runes') return;
    Object.assign(nodes, {
      file: document.getElementById('runesFile'),
      model: document.getElementById('runesModel'),
      layout: document.getElementById('runesLayout'),
      status: document.getElementById('runesStatus'),
      progress: document.getElementById('runesProgress'),
      output: document.getElementById('runesOutput'),
      diagnostics: document.getElementById('runesDiagnostics'),
      clear: document.getElementById('runesClear'),
      canvas: document.getElementById('runesCanvas')
    });
    if (!nodes.file || !nodes.model || !nodes.layout || !nodes.status || !nodes.progress
      || !nodes.output || !nodes.diagnostics || !nodes.clear || !nodes.canvas) return;

    installGuidance();
    installButton();
    nodes.clear.addEventListener('click', () => { runSerial += 1; });
    global.__RUNE_V10__ = Object.freeze({
      release: RELEASE,
      recognize,
      recognizeTemplate,
      buildTemplateBank,
      detectAlphabetGrid,
      recognizeAlphabet,
      recognizeBands,
      buildSmartMaskedFile,
      binaryCandidates
    });
    document.documentElement.dataset.runeV10 = RELEASE;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
/* V10.1: preserve complete glyph height for thin painted selections. */
(function (global) {
  'use strict';

  const RELEASE = 'height-export-title-call-rune-v10-20260817';

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  async function decodeFile(file) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(file); } catch { /* fallback below */ }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      image.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成智能蒙版图片。')), 'image/png');
    });
  }

  async function buildExpandedSelectionFile(file) {
    const maskApi = global.__RUNE_MASK_V9__;
    const metrics = maskApi?.maskMetrics?.();
    const overlay = document.getElementById('runesMaskCanvas');
    if (!metrics || !overlay?.width || !overlay.height) {
      throw new Error('蒙版为空，请先横向圈住需要识别的完整文字行。');
    }

    const bitmap = await decodeFile(file);
    const width = overlay.width;
    const height = overlay.height;
    const source = makeCanvas(width, height);
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.fillStyle = '#fff';
    sourceContext.fillRect(0, 0, width, height);
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.imageSmoothingQuality = 'high';
    sourceContext.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // A painted stroke indicates the text region, not the exact glyph pixels.
    // Expand aggressively in the vertical direction so ascenders/descenders and
    // decorative rune strokes are never clipped by a thin horizontal swipe.
    const verticalPad = Math.max(
      34,
      Math.round(metrics.height * 2.45),
      Math.round(height * .135)
    );
    const horizontalPad = Math.max(
      18,
      Math.round(metrics.height * 1.15),
      Math.round(width * .018)
    );
    const left = Math.max(0, metrics.left - horizontalPad);
    const right = Math.min(width - 1, metrics.right + horizontalPad);
    const top = Math.max(0, metrics.top - verticalPad);
    const bottom = Math.min(height - 1, metrics.bottom + verticalPad);
    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;

    const padding = Math.max(12, Math.round(Math.min(cropWidth, cropHeight) * .08));
    const output = makeCanvas(cropWidth + padding * 2, cropHeight + padding * 2);
    const context = output.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(source, left, top, cropWidth, cropHeight, padding, padding, cropWidth, cropHeight);

    const blob = await canvasToBlob(output);
    return {
      file: new File([blob], `smart-mask-${file.name.replace(/\.[^.]+$/, '') || 'runes'}.png`, { type: 'image/png' }),
      width: output.width,
      height: output.height,
      metrics,
      bounds: { left, right, top, bottom },
      strategy: 'expanded-rectangular-selection',
      verticalPad,
      horizontalPad
    };
  }

  async function renderProcessed(file) {
    const canvas = document.getElementById('runesCanvas');
    if (!canvas) return;
    const bitmap = await decodeFile(file);
    canvas.width = bitmap.width || bitmap.naturalWidth;
    canvas.height = bitmap.ght || bitmap.naturalHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    canvas.hidden = false;
  }

  function setStatus(node, text, kind = '') {
    const Tools = global.MagiToolsV7 || global.MagiTools;
    if (Tools?.setStatus) Tools.setStatus(node, text, kind);
    else {
      node.textContent = text;
      node.dataset.kind = kind;
    }
  }

  function install() {
    const base = global.__RUNE_V10__;
    const maskApi = global.__RUNE_MASK_V9__;
    if (!base || !maskApi) {
      global.setTimeout(install, 50);
      return;
    }
    if (document.documentElement.dataset.runeExpandedV10 === RELEASE) return;

    const current = document.getElementById('runesRecognize');
    const fileInput = document.getElementById('runesFile');
    const layout = document.getElementById('runesLayout');
    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    const status = document.getElementById('runesStatus');
    const progress = document.getElementById('runesProgress');
    const maskEnabled = document.getElementById('runesMaskEnabled');
    if (!current || !fileInput || !layout || !output || !status || !maskEnabled) return;

    global.__RUNE_V10__ = Object.freeze({
      ...base,
      buildSmartMaskedFile: buildExpandedSelectionFile
    });

    // Keep the tested base recognizer for unmasked images. A separate visible
    // button handles painted selections so the expanded crop is used end-to-end.
    const button = current.cloneNode(true);
    current.hidden = true;
    current.id = 'runesRecognizeV10Base';
    button.id = 'runesRecognize';
    button.hidden = false;
    button.dataset.runeV10 = 'true';
    button.dataset.runeExpandedSelectionV10 = 'true';
    current.after(button);

    button.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        setStatus(status, '请先选择图片。', 'error');
        return;
      }
      if (!maskEnabled.checked) {
        current.hidden = false;
        current.click();
        current.hidden = true;
        return;
      }

      button.disabled = true;
      if (progress) {
        progress.hidden = false;
        progress.value = .08;
      }
      output.value = '';
      if (diagnostics) diagnostics.textContent = '';
      setStatus(status, '正在扩展涂抹范围并使用规则网络识别完整文字行……');

      try {
        const masked = await buildExpandedSelectionFile(file);
        const selectedLayout = layout.value || 'auto';
        const effective = selectedLayout === 'character'
          ? 'character'
          : (selectedLayout === 'chart' ? 'chart' : (selectedLayout === 'block' ? 'block' : 'line'));
        const result = await base.recognizeTemplate(masked.file, effective);
        const best = result?.best || { text: '', confidence: 0, mode: 'no-result', glyphs: 0 };
        const text = String(best.text || '').trim();
        output.value = effective === 'line' ? text.toUpperCase() : text;
        await renderProcessed(masked.file);
        if (progress) progress.value = 1;

        if (diagnostics) {
          diagnostics.textContent = [
            `智能蒙版：${masked.width}×${masked.height}px；向上／下扩展 ${masked.verticalPad}px，保留完整字形。`,
            `规则网络：${Math.round(Number(best.confidence || 0) * 100)}%；${text.replace(/\n/g, ' / ') || '无文字'}`,
            ...(result?.candidates || []).slice(1, 5).map((candidate) =>
              `候选：${Math.round(Number(candidate.confidence || 0) * 100)}%；${String(candidate.text || '').replace(/\n/g, ' / ') || '无文字'}`
            )
          ].join('\n');
        }
        setStatus(
          status,
          text
            ? `识别完成：采用“规则网络”，按自上而下、从左到右排列；匹配度约 ${Math.round(Number(best.confidence || 0) * 100)}%。`
            : '规则网络没有得到文字。请让涂抹线穿过整行文字中部，或扩大画笔后重试。',
          text ? 'success' : 'error'
        );
      } catch (error) {
        console.error(error);
        setStatus(status, `智能蒙版识别失败：${error.message || error}`, 'error');
      } finally {
        button.disabled = !fileInput.files?.length;
      }
    });

    fileInput.addEventListener('change', () => {
      button.disabled = !fileInput.files?.length;
    });

    document.documentElement.dataset.runeExpandedV10 = RELEASE;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
