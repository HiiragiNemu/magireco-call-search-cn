/* V19: color-aware user-painted mask + deterministic rune glyph recognition. */
(function (global) {
  'use strict';

  const RELEASE = 'rune-mask-color-glyph-v20-20260819';
  let running = false;
  let retries = 0;

  function Tools() {
    return global.MagiToolsV7 || global.MagiTools || null;
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成蒙版图片。')), 'image/png');
    });
  }

  async function decodeToCanvas(blob) {
    let image = null;
    if ('createImageBitmap' in global) {
      try { image = await createImageBitmap(blob); } catch { /* fallback below */ }
    }
    if (!image) {
      image = await new Promise((resolve, reject) => {
        const node = new Image();
        const url = URL.createObjectURL(blob);
        node.onload = () => { URL.revokeObjectURL(url); resolve(node); };
        node.onerror = () => { URL.revokeObjectURL(url); reject(new Error('蒙版图片解码失败。')); };
        node.src = url;
      });
    }
    const width = image.width || image.naturalWidth || 1;
    const height = image.height || image.naturalHeight || 1;
    const canvas = makeCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    image.close?.();
    return canvas;
  }

  function renderPreview(source) {
    const target = document.getElementById('runesCanvas');
    if (!target || !source) return;
    target.width = source.width;
    target.height = source.height;
    target.getContext('2d').drawImage(source, 0, 0);
    target.hidden = false;
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

  async function buildColorMaskedFile(original, maskApi) {
    const state = maskApi?.state;
    const overlay = document.getElementById('runesMaskCanvas');
    const metrics = maskApi?.maskMetrics?.();
    if (!state?.sourceWidth || !state?.sourceHeight || !overlay || !metrics) {
      throw new Error('蒙版尚未覆盖有效文字区域。');
    }

    let bitmap = state.sourceBitmap || null;
    let temporary = false;
    if (!bitmap) {
      if ('createImageBitmap' in global) {
        bitmap = await createImageBitmap(original);
        temporary = true;
      } else {
        bitmap = await new Promise((resolve, reject) => {
          const image = new Image();
          const url = URL.createObjectURL(original);
          image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
          image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('原图解码失败。')); };
          image.src = url;
        });
        temporary = true;
      }
    }

    const source = makeCanvas(state.sourceWidth, state.sourceHeight);
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(bitmap, 0, 0, state.sourceWidth, state.sourceHeight);
    if (temporary) bitmap.close?.();

    const pad = Math.max(8, Math.round(Math.max(metrics.width, metrics.height) * .06));
    const left = Math.max(0, metrics.left - pad);
    const top = Math.max(0, metrics.top - pad);
    const right = Math.min(state.sourceWidth - 1, metrics.right + pad);
    const bottom = Math.min(state.sourceHeight - 1, metrics.bottom + pad);
    const width = right - left + 1;
    const height = bottom - top + 1;

    const sourceData = sourceContext.getImageData(left, top, width, height);
    const maskData = overlay.getContext('2d', { willReadFrequently: true })
      .getImageData(left, top, width, height).data;
    const output = makeCanvas(width, height);
    const outputContext = output.getContext('2d', { willReadFrequently: true });
    const pixels = outputContext.createImageData(width, height);
    // Unpainted pixels must be dark, not white. V14 treats pale/white pixels as
    // candidate rune strokes, so an opaque white outside-mask area swamped the
    // user-selected text band and forced a slow OCR fallback.
    pixels.data.fill(0);
    for (let offset = 3; offset < pixels.data.length; offset += 4) pixels.data[offset] = 255;

    let retained = 0;
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      if (maskData[offset + 3] < 8) continue;
      pixels.data[offset] = sourceData.data[offset];
      pixels.data[offset + 1] = sourceData.data[offset + 1];
      pixels.data[offset + 2] = sourceData.data[offset + 2];
      pixels.data[offset + 3] = 255;
      retained += 1;
    }
    if (!retained) throw new Error('蒙版没有保留任何原图像素。');
    outputContext.putImageData(pixels, 0, 0);
    const blob = await canvasToBlob(output);
    return {
      file: new File([blob], `color-mask-${String(original.name || 'runes').replace(/\.[^.]+$/, '')}.png`, { type: 'image/png' }),
      canvas: output,
      width,
      height,
      metrics,
      retainedRatio: retained / Math.max(1, width * height)
    };
  }

  async function buildSeedFocusedCanvas(colorMask, colorEngine) {
    if (!colorEngine?.analyseSource || !colorEngine?.columnSegments) return null;
    const analysis = await colorEngine.analyseSource(colorMask.file);
    const band = { top: 0, bottom: analysis.height - 1 };
    const segments = colorEngine.columnSegments(analysis.seed, analysis.width, band);
    if (segments.length < 3 || segments.length > 48) return null;

    const output = new Uint8Array(analysis.width * analysis.height);
    for (const segment of segments) {
      const left = Math.max(0, segment.left);
      const right = Math.min(analysis.width - 1, segment.right);
      const queue = new Int32Array((right - left + 1) * analysis.height);
      let head = 0;
      let tail = 0;
      for (let y = 0; y < analysis.height; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const index = y * analysis.width + x;
          if (!analysis.seed[index] || output[index]) continue;
          output[index] = 1;
          queue[tail++] = index;
        }
      }
      while (head < tail) {
        const index = queue[head++];
        const x = index % analysis.width;
        const y = Math.floor(index / analysis.width);
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= analysis.height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            if (nx < left || nx > right) continue;
            const next = ny * analysis.width + nx;
            if (output[next] || !analysis.grow[next]) continue;
            output[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }

    let left = analysis.width;
    let right = -1;
    let top = analysis.height;
    let bottom = -1;
    let foreground = 0;
    for (let y = 0; y < analysis.height; y += 1) {
      for (let x = 0; x < analysis.width; x += 1) {
        if (!output[y * analysis.width + x]) continue;
        foreground += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (!foreground || right < left || bottom < top) return null;

    const padX = Math.max(5, Math.round((right - left + 1) * .025));
    const padY = Math.max(5, Math.round((bottom - top + 1) * .12));
    left = Math.max(0, left - padX);
    right = Math.min(analysis.width - 1, right + padX);
    top = Math.max(0, top - padY);
    bottom = Math.min(analysis.height - 1, bottom + padY);
    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;
    const scale = Math.max(1, Math.min(5, 220 / Math.max(1, cropHeight)));

    const raw = makeCanvas(cropWidth, cropHeight);
    const rawContext = raw.getContext('2d', { willReadFrequently: true });
    const pixels = rawContext.createImageData(cropWidth, cropHeight);
    pixels.data.fill(255);
    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        if (!output[(top + y) * analysis.width + left + x]) continue;
        const offset = (y * cropWidth + x) * 4;
        pixels.data[offset] = 0;
        pixels.data[offset + 1] = 0;
        pixels.data[offset + 2] = 0;
        pixels.data[offset + 3] = 255;
      }
    }
    rawContext.putImageData(pixels, 0, 0);

    const rendered = makeCanvas(cropWidth * scale + 32, cropHeight * scale + 32);
    const context = rendered.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rendered.width, rendered.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(raw, 16, 16, cropWidth * scale, cropHeight * scale);
    return {
      canvas: rendered,
      segments: segments.length,
      foregroundRatio: foreground / Math.max(1, analysis.width * analysis.height),
      bounds: { left, right, top, bottom },
      sourceWidth: analysis.width,
      sourceHeight: analysis.height
    };
  }

  function acceptGlyphResult(glyphResult, canvas, contextLines, nodes, tools) {
    if (!glyphResult?.accepted || !glyphResult.text) return false;
    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    const progress = document.getElementById('runesProgress');
    const text = glyphResult.text.toUpperCase();
    if (output) output.value = text;
    if (progress) { progress.hidden = false; progress.value = 1; }
    renderPreview(canvas);
    if (diagnostics) diagnostics.textContent = [
      `V19 蒙版字形识别：${glyphResult.glyphs} 个字形；结果 ${text}。`,
      `原始逐字候选：${glyphResult.raw.toUpperCase()}；平均距离 ${glyphResult.averageScore.toFixed(3)}；平均判别间隔 ${glyphResult.averageMargin.toFixed(3)}。`,
      ...contextLines
    ].join('\n');
    tools?.setStatus(nodes.status, `识别完成：采用“V19 彩色蒙版 + V16 字形模板”，结果 ${tools.escapeHtml(text)}。`, 'success');
    document.documentElement.dataset.runeMaskGlyphAcceptedV19 = 'true';
    return true;
  }

  async function recognizeMasked(event, nodes) {
    const mask = global.__RUNE_MASK_V9__;
    if (!mask?.state?.enabled || !mask.maskMetrics?.()) return;
    if (running) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const original = nodes.file.files?.[0];
    if (!original) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    running = true;
    nodes.button.disabled = true;
    nodes.status.removeAttribute('data-kind');
    const tools = Tools();
    let fallbackFile = null;
    try {
      tools?.setStatus(nodes.status, tools.loadingMarkup('正在按彩色蒙版分离文字并执行字形模板识别…'));
      const colorMask = await buildColorMaskedFile(original, mask);
      document.documentElement.dataset.runeMaskAppliedV19 = 'true';

      const colorEngine = global.__RUNE_COLOR_V14__;
      const glyphEngine = nodes.model.value === 'mdk' ? global.__RUNE_GLYPH_V16__ : null;

      // A painted mask already defines the relevant vertical band. Analyse the
      // full cropped mask instead of asking the generic row detector to choose
      // one of several accent baselines inside the glyphs.
      const seedFocused = await buildSeedFocusedCanvas(colorMask, colorEngine);
      if (seedFocused?.canvas) {
        const seedGlyph = glyphEngine?.recognizeCanvas?.(seedFocused.canvas, {
          expectedGlyphs: seedFocused.segments
        }) || null;
        if (acceptGlyphResult(seedGlyph, seedFocused.canvas, [
          `V20 蒙版全高颜色分离：检测到 ${seedFocused.segments} 个字形候选；前景 ${(seedFocused.foregroundRatio * 100).toFixed(1)}%。`,
          `蒙版裁切：${colorMask.width}×${colorMask.height}px；保留像素 ${(colorMask.retainedRatio * 100).toFixed(1)}%。`
        ], nodes, tools)) return;
      }

      const focused = colorEngine?.buildColorFocusedInput
        ? await colorEngine.buildColorFocusedInput(colorMask.file, true)
        : null;

      if (focused?.canvas) {
        const glyphResult = glyphEngine?.recognizeCanvas?.(focused.canvas, {
          expectedGlyphs: focused.segments
        }) || null;
        if (acceptGlyphResult(glyphResult, focused.canvas, [
          `V14 蒙版内颜色分离：检测到 ${focused.segments} 个字形候选；前景 ${(focused.foregroundRatio * 100).toFixed(1)}%。`,
          `蒙版裁切：${colorMask.width}×${colorMask.height}px；保留像素 ${(colorMask.retainedRatio * 100).toFixed(1)}%。`
        ], nodes, tools)) return;
        fallbackFile = focused.file;
        renderPreview(focused.canvas);
      }

      const binaryMask = await mask.buildMaskedFile(original);
      const binaryCanvas = await decodeToCanvas(binaryMask.file);
      const binaryGlyph = glyphEngine?.recognizeCanvas?.(binaryCanvas) || null;
      if (acceptGlyphResult(binaryGlyph, binaryCanvas, [
        `V9 二值蒙版：${binaryMask.width}×${binaryMask.height}px；${binaryMask.polarity === 'light-on-dark' ? '浅色字／深色底' : '深色字／浅色底'}；前景 ${(binaryMask.foregroundRatio * 100).toFixed(1)}%。`
      ], nodes, tools)) return;

      delete document.documentElement.dataset.runeMaskGlyphAcceptedV19;
      fallbackFile = fallbackFile || binaryMask.file;
      global.__RUNE_INPUT_OVERRIDE_V9__ = fallbackFile;
      const savedLayout = nodes.layout.value;
      if (savedLayout === 'auto') nodes.layout.value = 'line';
      const completion = waitForRecognition(nodes.status);
      nodes.delegate.click();
      await completion;
      nodes.layout.value = savedLayout;
      const diagnostics = document.getElementById('runesDiagnostics');
      const line = 'V19 蒙版模板置信度不足，已把裁切后的文字行交给 Madoka OCR 回退。';
      if (diagnostics) diagnostics.textContent = `${line}${diagnostics.textContent ? `\n${diagnostics.textContent}` : ''}`;
    } catch (error) {
      console.error('V19 mask glyph recognition failed.', error);
      tools?.setStatus(nodes.status, `蒙版识别失败：${tools?.escapeHtml?.(error.message || error) || String(error)}`, 'error');
    } finally {
      if (global.__RUNE_INPUT_OVERRIDE_V9__ === fallbackFile) delete global.__RUNE_INPUT_OVERRIDE_V9__;
      nodes.button.disabled = !nodes.file.files?.length;
      running = false;
    }
  }

  function install() {
    if (document.body?.dataset.suiteTool !== 'runes') return;
    const button = document.getElementById('runesRecognize');
    const delegate = document.getElementById('runesRecognizeV7');
    const file = document.getElementById('runesFile');
    const layout = document.getElementById('runesLayout');
    const model = document.getElementById('runesModel');
    const status = document.getElementById('runesStatus');
    if (!button || !delegate || !file || !layout || !model || !status
        || !global.__RUNE_MASK_V9__ || !global.__RUNE_GLYPH_V16__) {
      if (retries < 120) { retries += 1; global.setTimeout(install, 25); }
      return;
    }
    if (button.dataset.runeMaskGlyphV19 === 'true') return;
    button.dataset.runeMaskGlyphV19 = 'true';
    const nodes = { button, delegate, file, layout, model, status };
    button.addEventListener('click', (event) => recognizeMasked(event, nodes), true);
    global.__RUNE_MASK_GLYPH_V19__ = Object.freeze({
      release: RELEASE,
      recognizeMasked,
      buildColorMaskedFile,
      buildSeedFocusedCanvas
    });
    document.documentElement.dataset.runeMaskGlyphV19 = RELEASE;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
