/* V10.2: paint-guided line segmentation with template dynamic programming. */
(function (global) {
  'use strict';

  const RELEASE = 'height-export-title-call-rune-v10-20260817';
  const TEMPLATE_SIZE = 72;
  const MAX_SIDE = 2600;

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  async function decodeFile(file) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(file); } catch { /* image fallback */ }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      image.src = url;
    });
  }

  async function canvasFromFile(file) {
    const image = await decodeFile(file);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const scale = Math.min(1.8, MAX_SIDE / Math.max(1, width, height), Math.max(width, height) < 900 ? 1.55 : 1);
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
    const pixels = canvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height).data;
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
    let count = 0;
    for (let value = 0; value < 256; value += 1) {
      count += histogram[value];
      if (count >= target) return value;
    }
    return 127;
  }

  function maskBounds(mask, width, height) {
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    let area = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = y * width;
      for (let x = 0; x < width; x += 1) {
        if (!mask[offset + x]) continue;
        area += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < left ? null : { left, right, top, bottom, area };
  }

  function removeLongLines(binary) {
    const { mask, width, height } = binary;
    const rowLimit = Math.max(20, Math.round(width * .73));
    const columnLimit = Math.max(20, Math.round(height * .76));
    const radius = Math.max(1, Math.round(Math.min(width, height) * .004));
    let rows = 0;
    let columns = 0;
    for (let y = 0; y < height; y += 1) {
      let count = 0;
      const offset = y * width;
      for (let x = 0; x < width; x += 1) count += mask[offset + x];
      if (count < rowLimit) continue;
      rows += 1;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
        mask.fill(0, yy * width, (yy + 1) * width);
      }
    }
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let y = 0; y < height; y += 1) count += mask[y * width + x];
      if (count < columnLimit) continue;
      columns += 1;
      for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
        for (let y = 0; y < height; y += 1) mask[y * width + xx] = 0;
      }
    }
    binary.removedRows = rows;
    binary.removedColumns = columns;
    return binary;
  }

  function removeBorderComponents(binary) {
    const { mask, width, height } = binary;
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    let removed = 0;

    function eraseFrom(start) {
      if (!mask[start] || visited[start]) return;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        mask[index] = 0;
        removed += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) {
          const next = index - 1;
          if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
        }
        if (x + 1 < width) {
          const next = index + 1;
          if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
        }
        if (y > 0) {
          const next = index - width;
          if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
        }
        if (y + 1 < height) {
          const next = index + width;
          if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
        }
      }
    }

    for (let x = 0; x < width; x += 1) {
      eraseFrom(x);
      eraseFrom((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      eraseFrom(y * width);
      eraseFrom(y * width + width - 1);
    }
    binary.removedBorderPixels = removed;
    return binary;
  }

  function binaryCandidates(canvas) {
    const data = grayscale(canvas);
    const total = data.values.length;
    const base = otsu(data.histogram, total);
    const thresholds = {
      light: [
        250, 244, 236, 226, 214, 202,
        percentile(data.histogram, total, .80),
        percentile(data.histogram, total, .88),
        percentile(data.histogram, total, .94),
        base + 18, base + 34
      ],
      dark: [
        5, 12, 22, 36, 52, 70,
        percentile(data.histogram, total, .06),
        percentile(data.histogram, total, .12),
        percentile(data.histogram, total, .20),
        base - 18, base - 34
      ]
    };
    const output = [];
    for (const polarity of ['light', 'dark']) {
      for (const rawThreshold of [...new Set(thresholds[polarity])]) {
        const threshold = Math.max(1, Math.min(254, Math.round(rawThreshold)));
        const mask = new Uint8Array(total);
        let area = 0;
        for (let index = 0; index < total; index += 1) {
          const active = polarity === 'light'
            ? data.values[index] >= threshold
            : data.values[index] <= threshold;
          if (active) { mask[index] = 1; area += 1; }
        }
        const ratio = area / Math.max(1, total);
        if (ratio < .001 || ratio > .42) continue;
        const binary = removeBorderComponents(removeLongLines({
          mask,
          width: data.width,
          height: data.height,
          polarity,
          threshold,
          foregroundRatio: ratio,
          removedRows: 0,
          removedColumns: 0
        }));
        const bounds = maskBounds(binary.mask, binary.width, binary.height);
        if (!bounds || bounds.area < 20) continue;
        binary.bounds = bounds;
        output.push(binary);
      }
    }
    return output;
  }

  function atomicSegments(binary) {
    const { mask, width } = binary;
    const bounds = binary.bounds || maskBounds(mask, width, binary.height);
    if (!bounds) return [];
    const raw = [];
    let start = -1;
    for (let x = bounds.left; x <= bounds.right + 1; x += 1) {
      let count = 0;
      if (x <= bounds.right) {
        for (let y = bounds.top; y <= bounds.bottom; y += 1) count += mask[y * width + x];
      }
      const active = count > 0;
      if (active && start < 0) start = x;
      if (!active && start >= 0) {
        raw.push({ left: start, right: x - 1 });
        start = -1;
      }
    }
    const merged = [];
    for (const part of raw) {
      const previous = merged[merged.length - 1];
      if (previous && part.left - previous.right - 1 <= 1) previous.right = part.right;
      else merged.push({ ...part });
    }
    return merged.map((part) => {
      let top = binary.height;
      let bottom = -1;
      let area = 0;
      for (let y = bounds.top; y <= bounds.bottom; y += 1) {
        for (let x = part.left; x <= part.right; x += 1) {
          if (!mask[y * width + x]) continue;
          area += 1;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      return { ...part, top, bottom, area, height: bottom >= top ? bottom - top + 1 : 0 };
    }).filter((part) => part.area > 0);
  }

  function boundsInRegion(binary, region) {
    let left = binary.width;
    let right = -1;
    let top = binary.height;
    let bottom = -1;
    let area = 0;
    for (let y = Math.max(0, region.top); y <= Math.min(binary.height - 1, region.bottom); y += 1) {
      for (let x = Math.max(0, region.left); x <= Math.min(binary.width - 1, region.right); x += 1) {
        if (!binary.mask[y * binary.width + x]) continue;
        area += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < left ? null : { left, right, top, bottom, area };
  }

  function normalizeGlyph(binary, region) {
    const bounds = boundsInRegion(binary, region);
    const output = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
    if (!bounds) return { mask: output, bounds: null };
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
    return { mask: output, bounds };
  }

  function glyphDistance(left, right, shiftX = 0, shiftY = 0) {
    let difference = 0;
    let union = 0;
    for (let y = 0; y < TEMPLATE_SIZE; y += 1) {
      for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
        const bx = x + shiftX;
        const by = y + shiftY;
        const a = left[y * TEMPLATE_SIZE + x];
        const b = bx >= 0 && by >= 0 && bx < TEMPLATE_SIZE && by < TEMPLATE_SIZE
          ? right[by * TEMPLATE_SIZE + bx]
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
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            distance = Math.min(distance, glyphDistance(glyph, template, dx, dy));
          }
        }
        if (distance < best.distance) best = { character, distance };
      }
    }
    return best;
  }

  function decodeLine(binary, bank) {
    const bounds = binary.bounds || maskBounds(binary.mask, binary.width, binary.height);
    if (!bounds) return null;
    const lineHeight = Math.max(1, bounds.bottom - bounds.top + 1);
    let atoms = atomicSegments(binary);
    if (!atoms.length || atoms.length > 90) return null;

    // Drop only unequivocal speckles. Small legitimate rune dots remain available
    // because either height or area can keep the atomic part alive.
    atoms = atoms.filter((part) => part.height >= lineHeight * .055
      || part.area >= Math.max(4, lineHeight * lineHeight * .003));
    if (!atoms.length || atoms.length > 76) return null;

    const count = atoms.length;
    const bestCost = new Float64Array(count + 1);
    const choices = new Array(count + 1);
    bestCost.fill(Number.POSITIVE_INFINITY);
    bestCost[count] = 0;

    for (let index = count - 1; index >= 0; index -= 1) {
      const atom = atoms[index];
      const speckle = atom.height < lineHeight * .22 && atom.area < lineHeight * lineHeight * .028;
      const skipCost = (speckle ? 13 : 43) + bestCost[index + 1];
      bestCost[index] = skipCost;
      choices[index] = { type: 'skip', next: index + 1 };

      for (let end = index; end < Math.min(count, index + 9); end += 1) {
        const right = atoms[end].right;
        const regionWidth = right - atom.left + 1;
        if (regionWidth > lineHeight * 1.48) break;
        const normalized = normalizeGlyph(binary, {
          left: atom.left,
          right,
          top: bounds.top,
          bottom: bounds.bottom
        });
        if (!normalized.bounds) continue;
        const actualWidth = normalized.bounds.right - normalized.bounds.left + 1;
        const actualHeight = normalized.bounds.bottom - normalized.bounds.top + 1;
        const widthRatio = actualWidth / lineHeight;
        const heightRatio = actualHeight / lineHeight;
        if (heightRatio < .13) continue;
        const match = matchGlyph(normalized.mask, bank);
        let cost = match.distance * 112 + 5.5;
        if (widthRatio < .17) cost += (.17 - widthRatio) * 125;
        if (widthRatio > 1.22) cost += (widthRatio - 1.22) * 80;
        if (heightRatio < .32) cost += (.32 - heightRatio) * 68;
        if (end > index) cost += (end - index) * .65;
        cost += bestCost[end + 1];
        if (cost < bestCost[index]) {
          bestCost[index] = cost;
          choices[index] = {
            type: 'glyph',
            next: end + 1,
            left: atom.left,
            right,
            match,
            widthRatio,
            heightRatio
          };
        }
      }
    }

    const glyphs = [];
    let skipped = 0;
    let cursor = 0;
    while (cursor < count && choices[cursor]) {
      const choice = choices[cursor];
      if (choice.type === 'glyph') glyphs.push(choice);
      else skipped += 1;
      cursor = choice.next;
    }
    if (glyphs.length < 2 || glyphs.length > 48) return null;

    const gaps = glyphs.slice(1).map((glyph, index) => glyph.left - glyphs[index].right - 1);
    const positive = gaps.filter((gap) => gap > 0).sort((a, b) => a - b);
    const medianGap = positive[Math.floor(positive.length / 2)] || lineHeight * .18;
    const wordGap = Math.max(lineHeight * .42, medianGap * 2.25);
    let text = '';
    glyphs.forEach((glyph, index) => {
      if (index && glyph.left - glyphs[index - 1].right - 1 > wordGap) text += ' ';
      text += glyph.match.character;
    });

    const meanDistance = glyphs.reduce((sum, glyph) => sum + glyph.match.distance, 0) / glyphs.length;
    const compact = text.replace(/[^A-Z]/g, '');
    const unique = new Set(compact).size;
    const longestRun = Math.max(0, ...(compact.match(/(.)\1*/g) || []).map((part) => part.length));
    const coverage = glyphs.reduce((sum, glyph) => sum + glyph.right - glyph.left + 1, 0)
      / Math.max(1, bounds.right - bounds.left + 1);
    let score = (1 - meanDistance) * 128 + Math.min(32, compact.length * 2.1)
      + Math.min(14, unique * 1.2) + coverage * 15 - skipped * 2.6;
    if (longestRun >= 4) score -= (longestRun - 3) * 8;
    if (compact.length < 3) score -= 70;
    return {
      text,
      normalized: compact,
      confidence: Math.max(0, 1 - meanDistance),
      glyphs: glyphs.length,
      mode: 'painted-line-dp',
      binary,
      score,
      skipped,
      meanDistance,
      coverage
    };
  }

  function resizeTemplate(mask, sourceSize, targetSize) {
    const output = new Uint8Array(targetSize * targetSize);
    for (let y = 0; y < targetSize; y += 1) {
      for (let x = 0; x < targetSize; x += 1) {
        const sourceX = Math.min(sourceSize - 1, Math.floor(x * sourceSize / targetSize));
        const sourceY = Math.min(sourceSize - 1, Math.floor(y * sourceSize / targetSize));
        if (mask[sourceY * sourceSize + sourceX]) output[y * targetSize + x] = 1;
      }
    }
    return output;
  }

  async function buildCombinedBank(base) {
    const source = await base.buildTemplateBank();
    const combined = new Map([...source].map(([character, variants]) => [character, [...variants]]));
    const legacyTemplates = await global.__RUNE_TEMPLATE_V7__?.buildTemplates?.();
    for (const template of legacyTemplates || []) {
      const character = String(template.character || '').toUpperCase();
      if (!combined.has(character) || !template.mask?.length) continue;
      const sourceSize = Math.round(Math.sqrt(template.mask.length));
      if (sourceSize * sourceSize !== template.mask.length) continue;
      combined.get(character).push(resizeTemplate(template.mask, sourceSize, TEMPLATE_SIZE));
    }
    return combined;
  }

  async function recognizePaintedLine(file) {
    const base = global.__RUNE_V10__;
    if (!base?.buildTemplateBank) throw new Error('规则网络模板尚未初始化。');
    const canvas = await canvasFromFile(file);
    const bank = await buildCombinedBank(base);
    const candidates = [];
    for (const binary of binaryCandidates(canvas)) {
      const candidate = decodeLine(binary, bank);
      if (candidate) candidates.push(candidate);
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || {
      text: '', normalized: '', confidence: 0, glyphs: 0,
      mode: 'painted-line-dp', binary: null, score: -Infinity
    };
    return { best, candidates };
  }

  function renderBinary(binary) {
    const canvas = document.getElementById('runesCanvas');
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
      global.setTimeout(install, 60);
      return;
    }
    if (document.documentElement.dataset.runeLineV10 === RELEASE) return;

    const current = document.getElementById('runesRecognize');
    const fileInput = document.getElementById('runesFile');
    const layout = document.getElementById('runesLayout');
    const model = document.getElementById('runesModel');
    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    const status = document.getElementById('runesStatus');
    const progress = document.getElementById('runesProgress');
    const maskEnabled = document.getElementById('runesMaskEnabled');
    if (!current || !fileInput || !layout || !model || !output || !status || !maskEnabled) return;

    global.__RUNE_V10__ = Object.freeze({
      ...base,
      recognizePaintedLine,
      decodePaintedLine: decodeLine,
      removePaintedBorderComponents: removeBorderComponents,
      buildPaintedCombinedBank: buildCombinedBank
    });

    const button = current.cloneNode(true);
    current.hidden = true;
    current.id = 'runesRecognizeV10Expanded';
    button.id = 'runesRecognize';
    button.hidden = false;
    button.dataset.runeV10 = 'true';
    button.dataset.runePaintedLineV10 = 'true';
    current.after(button);

    button.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      if (!file) return setStatus(status, '请先选择图片。', 'error');
      const standard = model.value === 'mdk';
      const requested = layout.value || 'auto';
      const lineLike = requested === 'auto' || requested === 'line';
      if (!maskEnabled.checked || !standard || !lineLike) {
        current.hidden = false;
        current.click();
        current.hidden = true;
        return;
      }

      button.disabled = true;
      output.value = '';
      if (diagnostics) diagnostics.textContent = '';
      if (progress) { progress.hidden = false; progress.value = .08; }
      try {
        setStatus(status, '正在扩展涂抹选区，并按字形动态分段识别……');
        const smart = await global.__RUNE_V10__.buildSmartMaskedFile(file);
        const direct = await recognizePaintedLine(smart.file);
        const fallback = await base.recognizeTemplate(smart.file, 'line');
        const candidates = [...direct.candidates, ...(fallback?.candidates || [])]
          .sort((left, right) => right.score - left.score);
        let best = candidates[0] || direct.best || fallback?.best;
        // Prefer the paint-guided decoder when it has a credible multi-character
        // sequence; its segmentation explicitly penalizes speckles and split glyphs.
        if (direct.best.normalized.length >= 3 && direct.best.confidence >= .43) best = direct.best;
        const text = String(best?.text || '').trim();
        output.value = text.toUpperCase();
        if (best?.binary) renderBinary(best.binary);
        if (progress) progress.value = 1;
        if (diagnostics) {
          diagnostics.textContent = [
            `智能涂抹选区：${smart.width}×${smart.height}px；按字形动态分段。`,
            ...candidates.slice(0, 6).map((candidate) =>
              `${candidate.mode === 'painted-line-dp' ? '涂抹规则网络' : '规则网络'}：${Math.round(Number(candidate.confidence || 0) * 100)}%；${String(candidate.text || '').replace(/\n/g, ' / ') || '无文字'}`)
          ].join('\n');
        }
        setStatus(
          status,
          text
            ? `识别完成：采用“涂抹规则网络”，从左到右排列；匹配度约 ${Math.round(Number(best.confidence || 0) * 100)}%。`
            : '涂抹规则网络没有得到可靠文字。请扩大涂抹区域，或切换“字母表／规则网络”。',
          text ? 'success' : 'error'
        );
      } catch (error) {
        console.error(error);
        setStatus(status, `涂抹规则网络识别失败：${error.message || error}`, 'error');
      } finally {
        button.disabled = !fileInput.files?.length;
      }
    });

    fileInput.addEventListener('change', () => {
      button.disabled = !fileInput.files?.length;
    });
    document.documentElement.dataset.runeLineV10 = RELEASE;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
