/* V14: color-aware rune isolation for decorated screenshots and title rename.
 *
 * V13 fixed routing, but its global grayscale threshold still treats pale rune
 * glyphs and a colorful illustration as one foreground.  V14 analyses color in
 * CIELAB, finds a horizontal cluster of glyph-sized components, grows each glyph
 * only inside its own column, and sends the resulting black-on-white line to the
 * existing custom Tesseract ensemble.  The chart/template and manual paint-mask
 * paths remain unchanged.
 */
(function (global) {
  'use strict';

  const RELEASE = 'rune-color-isolation-v14.1-20260818';
  const MAX_ANALYSIS_SIDE = 1200;
  const MAX_QUEUE_PIXELS = MAX_ANALYSIS_SIDE * MAX_ANALYSIS_SIDE;
  const TARGET_LINE_HEIGHT = 220;
  const NEW_TITLE = '魔女文翻译';
  let installing = false;
  let running = false;
  let retries = 0;

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function setUiTitle() {
    document.title = NEW_TITLE;
    const heading = document.querySelector('.suite-hero h1');
    if (heading) heading.textContent = NEW_TITLE;
    for (const link of document.querySelectorAll('[data-suite-nav] a')) {
      if (/runes\.html(?:$|[?#])/i.test(link.getAttribute('href') || '')) {
        const spans = link.querySelectorAll('span');
        const label = spans[spans.length - 1];
        if (label) label.textContent = NEW_TITLE;
        else link.textContent = NEW_TITLE;
      }
    }
  }

  function ensureDecoratedOption() {
    const select = document.getElementById('runesPreprocess');
    if (!select || select.querySelector('option[value="decorated"]')) return;
    const option = document.createElement('option');
    option.value = 'decorated';
    option.textContent = '复杂背景（彩色／黑底白字自动取文字行）';
    const original = select.querySelector('option[value="original"]');
    select.insertBefore(option, original || null);
  }

  async function decodeImage(blob) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(blob); } catch { /* image fallback */ }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片解码失败。'));
      };
      image.src = url;
    });
  }

  function srgbLinearLut() {
    const lut = new Float32Array(256);
    for (let value = 0; value < 256; value += 1) {
      const normalized = value / 255;
      lut[value] = normalized <= .04045
        ? normalized / 12.92
        : ((normalized + .055) / 1.055) ** 2.4;
    }
    return lut;
  }

  const LINEAR = srgbLinearLut();

  function labPivot(value) {
    return value > .008856451679
      ? Math.cbrt(value)
      : 7.787037037 * value + 16 / 116;
  }

  async function analyseSource(file) {
    const image = await decodeImage(file);
    const naturalWidth = image.width || image.naturalWidth;
    const naturalHeight = image.height || image.naturalHeight;
    const ratio = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(1, naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * ratio));
    const height = Math.max(1, Math.round(naturalHeight * ratio));
    if (width * height > MAX_QUEUE_PIXELS) throw new Error('图片分析尺寸过大。');

    const canvas = makeCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    image.close?.();
    const rgba = context.getImageData(0, 0, width, height).data;
    const seed = new Uint8Array(width * height);
    const grow = new Uint8Array(width * height);

    for (let index = 0, offset = 0; index < seed.length; index += 1, offset += 4) {
      const red = LINEAR[rgba[offset]];
      const green = LINEAR[rgba[offset + 1]];
      const blue = LINEAR[rgba[offset + 2]];
      const x = (red * .4124564 + green * .3575761 + blue * .1804375) / .95047;
      const y = red * .2126729 + green * .7151522 + blue * .072175;
      const z = (red * .0193339 + green * .119192 + blue * .9503041) / 1.08883;
      const fx = labPivot(x);
      const fy = labPivot(y);
      const fz = labPivot(z);
      const lightness = 116 * fy - 16;
      const a = 500 * (fx - fy);
      const b = 200 * (fy - fz);
      const chroma = Math.hypot(a, b);

      // The strict seed separates pale/cream runes from pink, red and purple
      // decorations.  The looser grow mask restores shaded portions of a glyph,
      // but is traversed only from a strict seed and inside one glyph column.
      if (lightness >= 79 && a <= 22 && (chroma <= 55 || a <= 12)) seed[index] = 1;
      if (lightness >= 56 && a <= 20 && (chroma <= 64 || a <= 10)) grow[index] = 1;
    }
    return { canvas, width, height, seed, grow };
  }

  function connectedComponentStats(mask, width, height) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    const output = [];
    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      let left = start % width;
      let right = left;
      let top = Math.floor(start / width);
      let bottom = top;
      let area = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        area += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const next = ny * width + nx;
            if (!mask[next] || visited[next]) continue;
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      output.push({
        left, right, top, bottom, area,
        width: right - left + 1,
        height: bottom - top + 1,
        cx: (left + right) / 2,
        cy: (top + bottom) / 2
      });
    }
    return output;
  }

  function median(values) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function findGlyphCluster(seed, width, height, force = false) {
    const imageArea = width * height;
    const minimumArea = Math.max(8, Math.round(imageArea * .00016));
    const components = connectedComponentStats(seed, width, height).filter((item) => (
      item.area >= minimumArea
      && item.width >= Math.max(3, width * .006)
      && item.width <= width * .32
      && item.height >= Math.max(6, height * .035)
      && item.height <= height * .34
    ));
    if (components.length < 3) return null;

    const candidates = [];
    for (const pivot of components) {
      const tolerance = Math.max(height * .075, pivot.height * .82, 10);
      let group = components.filter((item) => Math.abs(item.cy - pivot.cy) <= Math.max(tolerance, item.height * .62));
      if (group.length < 3) continue;
      const center = median(group.map((item) => item.cy));
      const medianHeight = median(group.map((item) => item.height));
      group = group.filter((item) => Math.abs(item.cy - center) <= Math.max(height * .065, medianHeight * .72));
      if (group.length < 3) continue;

      const left = Math.min(...group.map((item) => item.left));
      const right = Math.max(...group.map((item) => item.right));
      const top = Math.min(...group.map((item) => item.top));
      const bottom = Math.max(...group.map((item) => item.bottom));
      const spanRatio = (right - left + 1) / width;
      const heightRatio = (bottom - top + 1) / height;
      const widths = group.map((item) => item.width);
      const heights = group.map((item) => item.height);
      const medianWidth = Math.max(1, median(widths));
      const medianGroupHeight = Math.max(1, median(heights));
      const widthMad = median(widths.map((value) => Math.abs(value - medianWidth))) / medianWidth;
      const heightMad = median(heights.map((value) => Math.abs(value - medianGroupHeight))) / medianGroupHeight;
      const largestWidthRatio = Math.max(...widths) / medianWidth;
      const regularity = Math.max(0, 1 - Math.min(1, (widthMad + heightMad) / 1.25));
      const verticalCenter = (top + bottom + 1) / (2 * Math.max(1, height));
      const centrality = Math.max(0, 1 - Math.abs(verticalCenter - .5) * 2);
      // Text rows are normally compact and near the visual centre.  Large
      // decorative rings/heads often span almost the full width near the top or
      // bottom, so cap the span reward and penalise extreme edge bands.
      const score = group.length * 1.8
        + Math.min(spanRatio, .78) * 8
        + regularity * 5
        + centrality * 20
        - heightRatio * 12
        - Math.max(0, spanRatio - .86) * 40
        - Math.max(0, largestWidthRatio - 3) * 2.5;
      if (spanRatio >= .12 && spanRatio <= .99 && heightRatio <= .34) {
        candidates.push({ group, left, right, top, bottom, spanRatio, heightRatio, centrality, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    if (!best) return null;
    const minimumScore = force ? 13 : 18;
    return best.score >= minimumScore ? best : null;
  }

  function columnSegments(mask, width, band) {
    const bandHeight = band.bottom - band.top + 1;
    const activeThreshold = Math.max(2, Math.round(bandHeight * .022));
    const raw = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      let count = 0;
      if (x < width) {
        for (let y = band.top; y <= band.bottom; y += 1) count += mask[y * width + x];
      }
      const active = count >= activeThreshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) {
        raw.push({ left: start, right: x - 1 });
        start = -1;
      }
    }
    const minimumWidth = Math.max(2, Math.round(width * .004));
    let segments = raw.filter((item) => item.right - item.left + 1 >= minimumWidth);
    if (segments.length < 2) return segments;

    // Merge tiny detached accents with the nearest glyph, but keep the ordinary
    // inter-glyph whitespace intact.
    for (let index = 0; index < segments.length;) {
      const segment = segments[index];
      const segmentWidth = segment.right - segment.left + 1;
      if (segmentWidth > minimumWidth * 1.35) {
        index += 1;
        continue;
      }
      const previousGap = index > 0 ? segment.left - segments[index - 1].right - 1 : Infinity;
      const nextGap = index + 1 < segments.length ? segments[index + 1].left - segment.right - 1 : Infinity;
      const gapLimit = Math.max(4, Math.round(width * .014));
      if (previousGap <= nextGap && previousGap <= gapLimit) {
        segments[index - 1].right = segment.right;
        segments.splice(index, 1);
      } else if (nextGap <= gapLimit) {
        segments[index + 1].left = segment.left;
        segments.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return segments;
  }

  function floodGrowGlyph(seed, grow, output, width, height, bounds) {
    const left = Math.max(0, bounds.left);
    const right = Math.min(width - 1, bounds.right);
    const top = Math.max(0, bounds.top);
    const bottom = Math.min(height - 1, bounds.bottom);
    const queue = new Int32Array((right - left + 1) * (bottom - top + 1));
    let head = 0;
    let tail = 0;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = y * width + x;
        if (!seed[index] || output[index]) continue;
        output[index] = 1;
        queue[tail++] = index;
      }
    }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < top || ny > bottom) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          if (nx < left || nx > right) continue;
          const next = ny * width + nx;
          if (output[next] || !grow[next]) continue;
          output[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }

  function closeMask(mask, width, height, bounds) {
    const dilated = mask.slice();
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const index = y * width + x;
        if (mask[index]) continue;
        let nearby = false;
        for (let dy = -1; dy <= 1 && !nearby; dy += 1) {
          const ny = y + dy;
          if (ny < bounds.top || ny > bounds.bottom) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < bounds.left || nx > bounds.right) continue;
            if (mask[ny * width + nx]) { nearby = true; break; }
          }
        }
        if (nearby) dilated[index] = 1;
      }
    }
    const closed = dilated.slice();
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const index = y * width + x;
        if (!dilated[index]) continue;
        let complete = true;
        for (let dy = -1; dy <= 1 && complete; dy += 1) {
          const ny = y + dy;
          if (ny < bounds.top || ny > bounds.bottom) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < bounds.left || nx > bounds.right) continue;
            if (!dilated[ny * width + nx]) { complete = false; break; }
          }
        }
        if (!complete) closed[index] = 0;
      }
    }
    return closed;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成识别图像。')), 'image/png');
    });
  }

  async function buildColorFocusedInput(file, force = false) {
    const analysis = await analyseSource(file);
    const cluster = findGlyphCluster(analysis.seed, analysis.width, analysis.height, force);
    if (!cluster) return null;

    const bandPad = Math.max(4, Math.round((cluster.bottom - cluster.top + 1) * .18));
    const band = {
      top: Math.max(0, cluster.top - bandPad),
      bottom: Math.min(analysis.height - 1, cluster.bottom + bandPad)
    };
    const segments = columnSegments(analysis.seed, analysis.width, band);
    if (segments.length < 3 || segments.length > 48) return null;

    const output = new Uint8Array(analysis.width * analysis.height);
    const medianWidth = Math.max(1, median(segments.map((item) => item.right - item.left + 1)));
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const previous = segments[index - 1];
      const next = segments[index + 1];
      // Preserve a real white separator between adjacent glyph columns.  Without
      // this guard the loose grow mask can bridge two distressed letters (the
      // CHARLOTTE sample previously merged H+A into one component).
      const separator = Math.max(1, Math.round(medianWidth * .045));
      const leftBoundary = previous
        ? Math.floor((previous.right + segment.left) / 2) + 1 + separator
        : Math.max(0, segment.left - Math.round(medianWidth * .25));
      const rightBoundary = next
        ? Math.floor((segment.right + next.left) / 2) - separator
        : Math.min(analysis.width - 1, segment.right + Math.round(medianWidth * .25));
      floodGrowGlyph(analysis.seed, analysis.grow, output, analysis.width, analysis.height, {
        left: leftBoundary,
        right: rightBoundary,
        top: band.top,
        bottom: band.bottom
      });
    }

    const first = segments[0];
    const last = segments[segments.length - 1];
    const contentWidth = last.right - first.left + 1;
    const contentHeight = band.bottom - band.top + 1;
    const padX = Math.max(6, Math.round(contentWidth * .035));
    const padY = Math.max(6, Math.round(contentHeight * .15));
    const bounds = {
      left: Math.max(0, first.left - padX),
      right: Math.min(analysis.width - 1, last.right + padX),
      top: Math.max(0, band.top - padY),
      bottom: Math.min(analysis.height - 1, band.bottom + padY)
    };
    const closed = closeMask(output, analysis.width, analysis.height, bounds);
    const cropWidth = bounds.right - bounds.left + 1;
    const cropHeight = bounds.bottom - bounds.top + 1;
    const scale = Math.max(1, Math.min(5, TARGET_LINE_HEIGHT / Math.max(1, cropHeight)));
    const raw = makeCanvas(cropWidth, cropHeight);
    const rawContext = raw.getContext('2d', { willReadFrequently: true });
    const pixels = rawContext.createImageData(cropWidth, cropHeight);
    pixels.data.fill(255);
    let foreground = 0;
    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        if (!closed[(bounds.top + y) * analysis.width + bounds.left + x]) continue;
        const offset = (y * cropWidth + x) * 4;
        pixels.data[offset] = 0;
        pixels.data[offset + 1] = 0;
        pixels.data[offset + 2] = 0;
        pixels.data[offset + 3] = 255;
        foreground += 1;
      }
    }
    rawContext.putImageData(pixels, 0, 0);
    const foregroundRatio = foreground / Math.max(1, cropWidth * cropHeight);
    if (foregroundRatio < .006 || foregroundRatio > .68) return null;

    const rendered = makeCanvas(cropWidth * scale + 32, cropHeight * scale + 32);
    const context = rendered.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rendered.width, rendered.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(raw, 16, 16, cropWidth * scale, cropHeight * scale);
    const blob = await canvasToBlob(rendered);
    const focused = new File(
      [blob],
      `color-focused-${String(file.name || 'runes').replace(/\.[^.]+$/, '')}.png`,
      { type: 'image/png' }
    );
    return {
      file: focused,
      canvas: rendered,
      segments: segments.length,
      score: cluster.score,
      foregroundRatio,
      bounds,
      sourceWidth: analysis.width,
      sourceHeight: analysis.height
    };
  }

  function renderFocusedPreview(result) {
    const canvas = document.getElementById('runesCanvas');
    if (!canvas || !result?.canvas) return;
    canvas.width = result.canvas.width;
    canvas.height = result.canvas.height;
    canvas.getContext('2d').drawImage(result.canvas, 0, 0);
    canvas.hidden = false;
  }

  function waitForRecognition(status, timeout = 420000) {
    return new Promise((resolve) => {
      let complete = false;
      const finish = () => {
        if (complete) return;
        complete = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (status.dataset.kind === 'success' || status.dataset.kind === 'error') finish();
      });
      observer.observe(status, { childList: true, subtree: true, characterData: true, attributes: true });
      const timer = global.setTimeout(finish, timeout);
    });
  }

  async function runColorRoute(event, nodes) {
    if (running) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const mode = nodes.preprocess.value || 'auto';
    const layout = nodes.layout.value || 'auto';
    const model = nodes.model.value || 'mdk';
    const maskEnabled = Boolean(global.__RUNE_MASK_V9__?.state?.enabled);
    const chartTemplate = layout === 'chart' && mode === 'auto' && model === 'mdk';
    if (maskEnabled || chartTemplate || !['auto', 'border', 'decorated'].includes(mode)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const original = nodes.file.files?.[0];
    if (!original) return;
    running = true;
    nodes.button.disabled = true;
    nodes.status.removeAttribute('data-kind');
    const Tools = global.MagiToolsV7 || global.MagiTools;
    Tools?.setStatus(nodes.status, Tools.loadingMarkup('正在按颜色分离复杂背景与魔女文…'));
    let focused = null;
    try {
      focused = await buildColorFocusedInput(original, mode === 'decorated');
      if (focused) {
        global.__RUNE_INPUT_OVERRIDE_V9__ = focused.file;
        document.documentElement.dataset.runeColorFocusedV14 = 'true';
        renderFocusedPreview(focused);

        // V16 classifies the already-isolated glyphs deterministically against
        // the registered MadokaRunes templates.  This avoids sending clean rune
        // shapes back through a general OCR model that is easily confused by
        // distressed outlines.  Weak/unknown lines still fall through to the
        // existing Tesseract ensemble, so this is not a closed vocabulary gate.
        const glyphEngine = model === 'mdk' ? global.__RUNE_GLYPH_V16__ : null;
        const glyphResult = glyphEngine?.recognizeCanvas?.(focused.canvas, {
          expectedGlyphs: focused.segments
        }) || null;
        if (glyphResult?.accepted && glyphResult.text) {
          const output = document.getElementById('runesOutput');
          const diagnostics = document.getElementById('runesDiagnostics');
          const progress = document.getElementById('runesProgress');
          if (output) output.value = glyphResult.text.toUpperCase();
          if (progress) { progress.hidden = false; progress.value = 1; }
          const lines = [
            `V16 字形模板识别：${glyphResult.glyphs} 个字形；结果 ${glyphResult.text.toUpperCase()}。`,
            `原始逐字候选：${glyphResult.raw.toUpperCase()}；平均距离 ${glyphResult.averageScore.toFixed(3)}；平均判别间隔 ${glyphResult.averageMargin.toFixed(3)}。`,
            `V14 复杂背景分离：检测到 ${focused.segments} 个字形候选；前景 ${(focused.foregroundRatio * 100).toFixed(1)}%。`
          ];
          if (glyphResult.corrected) lines.splice(1, 0, `词级纠错：${glyphResult.raw.toUpperCase()} → ${glyphResult.text.toUpperCase()}（${glyphResult.correction?.changes || 0} 处）。`);
          if (diagnostics) diagnostics.textContent = lines.join('\n');
          Tools?.setStatus(nodes.status, `识别完成：采用“V16 字形模板 + V14 复杂背景分离”，结果 ${Tools.escapeHtml(glyphResult.text.toUpperCase())}。`, 'success');
          document.documentElement.dataset.runeGlyphAcceptedV16 = 'true';
        } else {
          delete document.documentElement.dataset.runeGlyphAcceptedV16;
          const previousLayout = nodes.layout.value;
          if (focused.segments >= 3 && previousLayout !== 'chart') nodes.layout.value = 'line';
          const completion = waitForRecognition(nodes.status);
          nodes.delegate.click();
          await completion;
          nodes.layout.value = previousLayout;
          const diagnostics = document.getElementById('runesDiagnostics');
          const line = `V14 复杂背景分离：检测到 ${focused.segments} 个字形候选；前景 ${(focused.foregroundRatio * 100).toFixed(1)}%。`;
          if (diagnostics) diagnostics.textContent = `${line}${diagnostics.textContent ? `\n${diagnostics.textContent}` : ''}`;
        }
      } else {
        delete document.documentElement.dataset.runeColorFocusedV14;
        if (mode === 'decorated') {
          Tools?.setStatus(nodes.status, '没有稳定检测到浅色文字行，已切换到原有多方案识别。');
        }
        const completion = waitForRecognition(nodes.status);
        nodes.delegate.click();
        await completion;
      }
    } catch (error) {
      console.error('V14 color isolation failed.', error);
      delete document.documentElement.dataset.runeColorFocusedV14;
      Tools?.setStatus(nodes.status, `彩色背景分离失败，已切换到原有识别：${Tools.escapeHtml(error.message || error)}`);
      try {
        const completion = waitForRecognition(nodes.status);
        nodes.delegate.click();
        await completion;
      } catch { /* classic path reports its own error */ }
    } finally {
      if (global.__RUNE_INPUT_OVERRIDE_V9__ === focused?.file) delete global.__RUNE_INPUT_OVERRIDE_V9__;
      nodes.button.disabled = !nodes.file.files?.length;
      running = false;
    }
  }

  function install() {
    if (installing || document.body?.dataset.suiteTool !== 'runes') return;
    installing = true;
    try {
      setUiTitle();
      ensureDecoratedOption();
      const button = document.getElementById('runesRecognize');
      const delegate = document.getElementById('runesRecognizeV7');
      const file = document.getElementById('runesFile');
      const preprocess = document.getElementById('runesPreprocess');
      const layout = document.getElementById('runesLayout');
      const model = document.getElementById('runesModel');
      const status = document.getElementById('runesStatus');
      if (!button || !delegate || !file || !preprocess || !layout || !model || !status) {
        if (retries < 40) {
          retries += 1;
          global.setTimeout(install, 25);
        }
        return;
      }
      if (button.dataset.runeColorV14 === 'true') return;
      button.dataset.runeColorV14 = 'true';
      const nodes = { button, delegate, file, preprocess, layout, model, status };
      button.addEventListener('click', (event) => runColorRoute(event, nodes), true);
      document.documentElement.dataset.runeColorEngineV14 = RELEASE;
      global.__RUNE_COLOR_V14__ = Object.freeze({
        release: RELEASE,
        analyseSource,
        connectedComponentStats,
        findGlyphCluster,
        columnSegments,
        buildColorFocusedInput
      });
    } finally {
      installing = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  global.addEventListener('load', setUiTitle, { once: true });
})(window);
