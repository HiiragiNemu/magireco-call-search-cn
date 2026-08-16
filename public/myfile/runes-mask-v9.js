/* V9: paint-to-keep OCR mask, compact image comparison and reference table. */
(function (global) {
  'use strict';

  const Tools = global.MagiToolsV7 || global.MagiTools;
  if (!Tools) return;

  const RELEASE = 'rune-mask-v9-20260816';
  const MAX_WORK_SIDE = 2400;
  const MAX_HISTORY = 80;
  const state = {
    enabled: false,
    mode: 'paint',
    brush: 44,
    commands: [],
    activeStroke: null,
    workingFile: null,
    sourceWidth: 0,
    sourceHeight: 0,
    sourceBitmap: null,
    generation: 0
  };

  const nodes = {};

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function makeCanvas(width, height) {
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(width));
    output.height = Math.max(1, Math.round(height));
    return output;
  }

  function setMaskStatus(text, kind = '') {
    if (!nodes.maskStatus) return;
    nodes.maskStatus.textContent = text;
    nodes.maskStatus.dataset.kind = kind;
  }

  function syncModeButtons() {
    for (const button of nodes.controls?.querySelectorAll('[data-mask-mode]') || []) {
      const active = button.dataset.maskMode === state.mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
  }

  function syncEnabled() {
    if (!nodes.stage || !nodes.overlay) return;
    nodes.stage.dataset.maskEnabled = String(state.enabled);
    nodes.overlay.style.pointerEvents = state.enabled ? 'auto' : 'none';
    nodes.maskEnabled.checked = state.enabled;
    nodes.controls?.querySelectorAll('button, input[type="range"]').forEach((control) => {
      if (control === nodes.maskEnabled || control.id === 'runesMaskSelectAll') return;
      control.disabled = !state.enabled || !state.workingFile;
    });
    if (!state.workingFile) setMaskStatus('选择图片后可以涂抹要识别的文字。');
    else if (!state.enabled) setMaskStatus('蒙版未启用，将识别整张图片。');
    else updateMaskStatus();
  }

  function mapPoint(event) {
    const rect = nodes.overlay.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(nodes.overlay.width, (event.clientX - rect.left) * nodes.overlay.width / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(nodes.overlay.height, (event.clientY - rect.top) * nodes.overlay.height / Math.max(1, rect.height)))
    };
  }

  function drawStroke(context, command) {
    if (!command.points?.length) return;
    context.save();
    context.globalCompositeOperation = command.mode === 'erase' ? 'destination-out' : 'source-over';
    context.strokeStyle = '#ff2e98';
    context.fillStyle = '#ff2e98';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = command.size;
    const first = command.points[0];
    if (command.points.length === 1) {
      context.beginPath();
      context.arc(first.x, first.y, command.size / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of command.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
  }

  function redrawMask() {
    if (!nodes.overlay) return;
    const context = nodes.overlay.getContext('2d');
    context.clearRect(0, 0, nodes.overlay.width, nodes.overlay.height);
    for (const command of state.commands) {
      if (command.type === 'clear') context.clearRect(0, 0, nodes.overlay.width, nodes.overlay.height);
      else if (command.type === 'fill') {
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = '#ff2e98';
        context.fillRect(0, 0, nodes.overlay.width, nodes.overlay.height);
        context.restore();
      } else if (command.type === 'stroke') drawStroke(context, command);
    }
    if (state.activeStroke) drawStroke(context, state.activeStroke);
  }

  function maskMetrics() {
    if (!nodes.overlay?.width || !nodes.overlay.height) return null;
    const data = nodes.overlay.getContext('2d').getImageData(0, 0, nodes.overlay.width, nodes.overlay.height).data;
    let left = nodes.overlay.width;
    let right = -1;
    let top = nodes.overlay.height;
    let bottom = -1;
    let pixels = 0;
    for (let y = 0; y < nodes.overlay.height; y += 1) {
      for (let x = 0; x < nodes.overlay.width; x += 1) {
        const alpha = data[(y * nodes.overlay.width + x) * 4 + 3];
        if (alpha < 8) continue;
        pixels += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < left || bottom < top) return null;
    return {
      left, right, top, bottom, pixels,
      width: right - left + 1,
      height: bottom - top + 1,
      coverage: pixels / Math.max(1, nodes.overlay.width * nodes.overlay.height)
    };
  }

  function updateMaskStatus() {
    const metrics = maskMetrics();
    if (!metrics) {
      setMaskStatus('蒙版为空：请用“保留画笔”涂过文字本体。', 'warning');
      return;
    }
    const percentage = Math.max(.1, metrics.coverage * 100).toFixed(metrics.coverage < .01 ? 1 : 0);
    setMaskStatus(`已保留约 ${percentage}% 的图像；识别时会自动裁切到涂抹范围。`, 'success');
  }

  function pushCommand(command) {
    state.commands.push(command);
    if (state.commands.length > MAX_HISTORY) state.commands.splice(0, state.commands.length - MAX_HISTORY);
    redrawMask();
    updateMaskStatus();
  }

  function pointerDown(event) {
    if (!state.enabled || !state.workingFile || event.button > 0) return;
    event.preventDefault();
    nodes.overlay.setPointerCapture(event.pointerId);
    const scale = nodes.overlay.width / Math.max(1, nodes.overlay.getBoundingClientRect().width);
    state.activeStroke = {
      type: 'stroke',
      mode: state.mode,
      size: Math.max(2, state.brush * scale),
      points: [mapPoint(event)]
    };
    redrawMask();
  }

  function pointerMove(event) {
    if (!state.activeStroke || !state.enabled) return;
    event.preventDefault();
    const point = mapPoint(event);
    const previous = state.activeStroke.points[state.activeStroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1.2) return;
    state.activeStroke.points.push(point);
    redrawMask();
  }

  function pointerEnd(event) {
    if (!state.activeStroke) return;
    event.preventDefault();
    try { nodes.overlay.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    const command = state.activeStroke;
    state.activeStroke = null;
    pushCommand(command);
  }

  async function decodeFile(file) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(file); } catch { /* image fallback below */ }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      image.src = url;
    });
  }

  async function prepareSource(file) {
    const generation = ++state.generation;
    state.sourceBitmap?.close?.();
    state.sourceBitmap = null;
    state.workingFile = file || null;
    state.commands = [];
    state.activeStroke = null;
    if (!file) {
      nodes.overlay.width = 1;
      nodes.overlay.height = 1;
      redrawMask();
      syncEnabled();
      return;
    }
    const bitmap = await decodeFile(file);
    if (generation !== state.generation) {
      bitmap.close?.();
      return;
    }
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    const ratio = Math.min(1, MAX_WORK_SIDE / Math.max(width, height));
    state.sourceWidth = Math.max(1, Math.round(width * ratio));
    state.sourceHeight = Math.max(1, Math.round(height * ratio));
    state.sourceBitmap = bitmap;
    nodes.overlay.width = state.sourceWidth;
    nodes.overlay.height = state.sourceHeight;
    nodes.stage.style.setProperty('--mask-aspect-v9', `${state.sourceWidth} / ${state.sourceHeight}`);
    redrawMask();
    syncEnabled();
  }

  function canvasToBlob(source, type = 'image/png', quality = .96) {
    return new Promise((resolve, reject) => {
      source.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成蒙版图片。')), type, quality);
    });
  }

  function grayscaleAt(data, offset) {
    return Math.max(0, Math.min(255, Math.round(
      data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722
    )));
  }

  function otsuThreshold(histogram, total) {
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
      if (between > maximum) {
        maximum = between;
        best = threshold;
      }
    }
    return best;
  }

  async function buildMaskedFile(file) {
    const metrics = maskMetrics();
    if (!metrics) throw new Error('蒙版为空，请先涂抹需要识别的文字。');
    const bitmap = state.sourceBitmap || await decodeFile(file);
    const source = makeCanvas(state.sourceWidth, state.sourceHeight);
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(bitmap, 0, 0, state.sourceWidth, state.sourceHeight);

    const pad = Math.max(10, Math.round(Math.max(metrics.width, metrics.height) * .08));
    const left = Math.max(0, metrics.left - pad);
    const top = Math.max(0, metrics.top - pad);
    const right = Math.min(state.sourceWidth - 1, metrics.right + pad);
    const bottom = Math.min(state.sourceHeight - 1, metrics.bottom + pad);
    const width = right - left + 1;
    const height = bottom - top + 1;

    const sourcePixels = sourceContext.getImageData(0, 0, state.sourceWidth, state.sourceHeight).data;
    const maskPixels = nodes.overlay.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, nodes.overlay.width, nodes.overlay.height).data;
    const histogram = new Uint32Array(256);
    let sampled = 0;
    for (let y = metrics.top; y <= metrics.bottom; y += 1) {
      for (let x = metrics.left; x <= metrics.right; x += 1) {
        const index = y * state.sourceWidth + x;
        if (maskPixels[index * 4 + 3] < 16) continue;
        histogram[grayscaleAt(sourcePixels, index * 4)] += 1;
        sampled += 1;
      }
    }
    if (!sampled) throw new Error('蒙版没有覆盖有效像素。');
    const threshold = otsuThreshold(histogram, sampled);
    let darkSide = 0;
    for (let value = 0; value <= threshold; value += 1) darkSide += histogram[value];
    const lightSide = sampled - darkSide;
    const lightTextOnDark = darkSide >= lightSide;

    const output = makeCanvas(width, height);
    const outputContext = output.getContext('2d', { willReadFrequently: true });
    const outputPixels = outputContext.createImageData(width, height);
    outputPixels.data.fill(255);
    let foregroundPixels = 0;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const sourceIndex = y * state.sourceWidth + x;
        if (maskPixels[sourceIndex * 4 + 3] < 16) continue;
        const gray = grayscaleAt(sourcePixels, sourceIndex * 4);
        const foreground = lightTextOnDark ? gray > threshold : gray <= threshold;
        if (!foreground) continue;
        const targetIndex = ((y - top) * width + x - left) * 4;
        outputPixels.data[targetIndex] = 0;
        outputPixels.data[targetIndex + 1] = 0;
        outputPixels.data[targetIndex + 2] = 0;
        outputPixels.data[targetIndex + 3] = 255;
        foregroundPixels += 1;
      }
    }
    outputContext.putImageData(outputPixels, 0, 0);

    const foregroundRatio = foregroundPixels / Math.max(1, width * height);
    if (foregroundRatio < .001 || foregroundRatio > .72) {
      outputContext.clearRect(0, 0, width, height);
      outputContext.fillStyle = '#fff';
      outputContext.fillRect(0, 0, width, height);
      outputContext.drawImage(source, left, top, width, height, 0, 0, width, height);
      outputContext.globalCompositeOperation = 'destination-in';
      outputContext.drawImage(nodes.overlay, left, top, width, height, 0, 0, width, height);
      outputContext.globalCompositeOperation = 'destination-over';
      outputContext.fillStyle = '#fff';
      outputContext.fillRect(0, 0, width, height);
      outputContext.globalCompositeOperation = 'source-over';
    }

    const blob = await canvasToBlob(output);
    return {
      file: new File([blob], `masked-${file.name.replace(/\.[^.]+$/, '') || 'runes'}.png`, { type: 'image/png' }),
      width,
      height,
      metrics,
      threshold,
      polarity: lightTextOnDark ? 'light-on-dark' : 'dark-on-light',
      foregroundRatio
    };
  }

  function waitForRecognition(status, timeout = 420000) {
    return new Promise((resolve) => {
      let finished = false;
      const complete = () => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (status.dataset.kind === 'success' || status.dataset.kind === 'error') complete();
      });
      observer.observe(status, { childList: true, subtree: true, characterData: true, attributes: true });
      const timer = global.setTimeout(complete, timeout);
    });
  }

  async function runRecognition() {
    const original = nodes.file.files?.[0];
    if (!original) {
      Tools.setStatus(nodes.status, '请先选择图片。', 'error');
      return;
    }
    nodes.recognize.disabled = true;
    nodes.status.removeAttribute('data-kind');
    const savedLayout = nodes.layout.value;
    let masked = null;
    try {
      if (state.enabled) {
        Tools.setStatus(nodes.status, Tools.loadingMarkup('正在生成涂抹蒙版…'));
        masked = await buildMaskedFile(original);
        global.__RUNE_INPUT_OVERRIDE_V9__ = masked.file;
        if (nodes.layout.value === 'auto') {
          nodes.layout.value = masked.width / Math.max(1, masked.height) >= 1.45 ? 'line' : 'block';
        }
        nodes.stage.dataset.maskApplied = 'true';
        setMaskStatus(
          `蒙版已送入识别：${masked.width}×${masked.height}px；${masked.polarity === 'light-on-dark' ? '浅色字／深色底' : '深色字／浅色底'}。`,
          'success'
        );
      } else {
        nodes.stage.dataset.maskApplied = 'false';
        delete global.__RUNE_INPUT_OVERRIDE_V9__;
      }
      const completion = waitForRecognition(nodes.status);
      nodes.delegate.click();
      await completion;
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.status, `蒙版处理失败：${Tools.escapeHtml(error.message || error)}`, 'error');
    } finally {
      delete global.__RUNE_INPUT_OVERRIDE_V9__;
      nodes.layout.value = savedLayout;
      nodes.recognize.disabled = !nodes.file.files?.length;
    }
  }

  function buildControls() {
    const fieldset = el('fieldset', 'runes-mask-controls-v9');
    fieldset.id = 'runesMaskControlsV9';
    const legend = el('legend', '', '涂抹蒙版');
    fieldset.appendChild(legend);

    const enableLabel = el('label', 'runes-mask-enable-v9');
    nodes.maskEnabled = document.createElement('input');
    nodes.maskEnabled.type = 'checkbox';
    nodes.maskEnabled.id = 'runesMaskEnabled';
    enableLabel.append(nodes.maskEnabled, document.createTextNode('只识别涂抹区域'));
    fieldset.appendChild(enableLabel);

    const toolbar = el('div', 'runes-mask-toolbar-v9');
    for (const [mode, label] of [['paint', '保留画笔'], ['erase', '擦除画笔']]) {
      const button = el('button', 'suite-button secondary', label);
      button.type = 'button';
      button.dataset.maskMode = mode;
      button.addEventListener('click', () => {
        state.mode = mode;
        syncModeButtons();
      });
      toolbar.appendChild(button);
    }

    const brushLabel = el('label', 'runes-mask-brush-v9');
    brushLabel.appendChild(document.createTextNode('画笔'));
    nodes.brush = document.createElement('input');
    nodes.brush.id = 'runesMaskBrush';
    nodes.brush.type = 'range';
    nodes.brush.min = '8';
    nodes.brush.max = '140';
    nodes.brush.step = '2';
    nodes.brush.value = String(state.brush);
    nodes.brushValue = el('output', '', `${state.brush}px`);
    nodes.brushValue.htmlFor = 'runesMaskBrush';
    brushLabel.append(nodes.brush, nodes.brushValue);
    toolbar.appendChild(brushLabel);

    const undo = el('button', 'suite-button secondary', '撤销');
    undo.type = 'button';
    undo.id = 'runesMaskUndo';
    undo.addEventListener('click', () => {
      state.commands.pop();
      redrawMask();
      updateMaskStatus();
    });
    const clear = el('button', 'suite-button secondary', '清空蒙版');
    clear.type = 'button';
    clear.id = 'runesMaskClear';
    clear.addEventListener('click', () => pushCommand({ type: 'clear' }));
    const selectAll = el('button', 'suite-button secondary', '选择全图');
    selectAll.type = 'button';
    selectAll.id = 'runesMaskSelectAll';
    selectAll.addEventListener('click', () => {
      if (!state.workingFile) return;
      state.enabled = true;
      pushCommand({ type: 'fill' });
      syncEnabled();
    });
    toolbar.append(undo, clear, selectAll);
    fieldset.appendChild(toolbar);

    nodes.maskStatus = el('div', 'runes-mask-status-v9', '选择图片后可以涂抹要识别的文字。');
    nodes.maskStatus.id = 'runesMaskStatus';
    fieldset.appendChild(nodes.maskStatus);
    nodes.controls = fieldset;
    return fieldset;
  }

  function restructurePreview() {
    const previewColumn = nodes.preview.closest('.runes-layout > div:nth-child(2)') || nodes.preview.parentElement;
    if (!previewColumn || previewColumn.querySelector('.runes-preview-pair-v9')) return;
    previewColumn.classList.add('runes-preview-column-v9');
    const title = previewColumn.querySelector('h2');
    title?.remove();
    const processed = previewColumn.querySelector('.runes-processed-wrap-v6');
    const empty = document.getElementById('runesPreviewEmpty');

    const pair = el('div', 'runes-preview-pair-v9');
    const originalCard = el('section', 'runes-image-card-v9');
    originalCard.appendChild(el('h2', '', '原图与蒙版'));
    nodes.stage = el('div', 'runes-mask-stage-v9');
    nodes.stage.id = 'runesMaskStage';
    nodes.preview.parentNode.insertBefore(nodes.stage, nodes.preview);
    nodes.stage.appendChild(nodes.preview);
    nodes.overlay = makeCanvas(1, 1);
    nodes.overlay.id = 'runesMaskCanvas';
    nodes.overlay.className = 'runes-mask-canvas-v9';
    nodes.overlay.setAttribute('aria-label', '涂抹保留的魔女文字蒙版');
    nodes.stage.appendChild(nodes.overlay);
    if (empty) originalCard.appendChild(empty);
    originalCard.appendChild(nodes.stage);

    const processedCard = el('section', 'runes-image-card-v9 runes-processed-card-v9');
    if (processed) processedCard.appendChild(processed);
    pair.append(originalCard, processedCard);
    previewColumn.replaceChildren(pair);
  }

  function collapseReference() {
    const section = document.querySelector('[aria-labelledby="runes-reference-title"]');
    if (!section || section.matches('details') || document.getElementById('runesReferenceDetailsV9')) return;
    const details = document.createElement('details');
    details.id = 'runesReferenceDetailsV9';
    details.className = 'suite-panel runes-reference-details-v9';
    const summary = el('summary', '', '已登记魔女文字对照表');
    const body = el('div', 'runes-reference-body-v9');
    const heading = section.querySelector('#runes-reference-title');
    heading?.remove();
    while (section.firstChild) body.appendChild(section.firstChild);
    details.append(summary, body);
    section.replaceWith(details);
  }

  function removeInternalNotice() {
    const diagnostics = document.getElementById('runesDiagnostics');
    const notice = diagnostics?.nextElementSibling;
    if (notice?.matches('.suite-notice')) {
      notice.textContent = '复杂背景建议启用涂抹蒙版，只覆盖需要识别的文字。';
      notice.classList.add('runes-mask-guidance-v9');
    }
  }

  function installRecognitionBridge() {
    const delegate = document.getElementById('runesRecognize');
    if (!delegate || document.querySelector('[data-mask-bridge-v9="true"]')) return;
    nodes.delegate = delegate;
    delegate.id = 'runesRecognizeV7';
    delegate.hidden = true;
    const button = delegate.cloneNode(true);
    button.id = 'runesRecognize';
    button.hidden = false;
    button.disabled = !nodes.file.files?.length;
    delegate.after(button);
    nodes.recognize = button;
    button.addEventListener('click', runRecognition);
    nodes.file.addEventListener('change', () => {
      button.disabled = !nodes.file.files?.length;
    });
    button.dataset.maskBridgeV9 = 'true';
  }

  function bindEvents() {
    nodes.maskEnabled.addEventListener('change', () => {
      state.enabled = nodes.maskEnabled.checked;
      syncEnabled();
    });
    nodes.brush.addEventListener('input', () => {
      state.brush = Number(nodes.brush.value) || 44;
      nodes.brushValue.textContent = `${state.brush}px`;
    });
    nodes.overlay.addEventListener('pointerdown', pointerDown);
    nodes.overlay.addEventListener('pointermove', pointerMove);
    nodes.overlay.addEventListener('pointerup', pointerEnd);
    nodes.overlay.addEventListener('pointercancel', pointerEnd);
    nodes.file.addEventListener('change', () => prepareSource(nodes.file.files?.[0] || null));
    nodes.preview.addEventListener('load', () => {
      if (nodes.file.files?.[0] && !state.workingFile) prepareSource(nodes.file.files[0]);
    });
  }

  function install() {
    if (document.body?.dataset.suiteTool !== 'runes') return;
    nodes.file = document.getElementById('runesFile');
    nodes.preview = document.getElementById('runesPreview');
    nodes.layout = document.getElementById('runesLayout');
    nodes.status = document.getElementById('runesStatus');
    if (!nodes.file || !nodes.preview || !nodes.layout || !nodes.status) return;

    const controls = buildControls();
    const optionsGrid = nodes.layout.closest('.suite-grid');
    optionsGrid?.insertAdjacentElement('afterend', controls);
    restructurePreview();
    collapseReference();
    removeInternalNotice();
    installRecognitionBridge();
    bindEvents();
    syncModeButtons();
    syncEnabled();

    global.__RUNE_MASK_V9__ = Object.freeze({
      release: RELEASE,
      state,
      buildMaskedFile,
      maskMetrics,
      prepareSource,
      redrawMask,
      selectAll() { state.enabled = true; pushCommand({ type: 'fill' }); syncEnabled(); },
      clear() { pushCommand({ type: 'clear' }); },
      addStroke(points, size = state.brush, mode = 'paint') {
        pushCommand({ type: 'stroke', points, size, mode });
      }
    });
    document.documentElement.dataset.runeMaskV9 = RELEASE;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
