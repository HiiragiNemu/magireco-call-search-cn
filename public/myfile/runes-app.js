/* Browser-local witch-rune OCR using custom Madoka traineddata. */
(function (global) {
  'use strict';

  const Tools = global.MagiTools;
  if (!Tools) return;

  const nodes = {};
  let file = null;
  let objectUrl = '';
  let worker = null;
  let workerModel = '';
  let recognizeSerial = 0;

  function cacheNodes() {
    for (const id of [
      'runesDrop', 'runesFile', 'runesModel', 'runesPreprocess', 'runesRecognize',
      'runesClear', 'runesStatus', 'runesProgress', 'runesPreviewEmpty', 'runesPreview',
      'runesCanvas', 'runesOutput', 'runesCopy'
    ]) nodes[id] = document.getElementById(id);
  }

  function setProgress(value, statusText) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      nodes.runesProgress.hidden = false;
      nodes.runesProgress.value = Math.min(1, numeric);
    }
    if (statusText) Tools.setStatus(nodes.runesStatus, statusText);
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
    setProgress(message.progress ?? 0, `${label}${Number.isFinite(message.progress) ? ` ${Math.round(message.progress * 100)}%` : ''}`);
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
    worker = await global.Tesseract.createWorker(model, 1, {
      langPath,
      gzip: false,
      logger
    });
    workerModel = model;
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: global.Tesseract.PSM?.SINGLE_LINE ?? '7',
        preserve_interword_spaces: '1'
      });
    } catch (error) {
      console.warn('OCR 参数设置失败，将使用模型默认值。', error);
    }
    return worker;
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

  function averageLightness(data) {
    let total = 0;
    const step = Math.max(4, Math.floor(data.length / 50000 / 4) * 4);
    for (let index = 0; index < data.length; index += step) {
      total += data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
    }
    return total / Math.ceil(data.length / step);
  }

  async function processedCanvas() {
    const image = await loadImage(file);
    const maxSide = 2400;
    const naturalWidth = image.width || image.naturalWidth;
    const naturalHeight = image.height || image.naturalHeight;
    const ratio = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * ratio));
    const height = Math.max(1, Math.round(naturalHeight * ratio));
    const canvas = nodes.runesCanvas;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    if (typeof image.close === 'function') image.close();

    const mode = nodes.runesPreprocess.value;
    if (mode === 'original') return canvas;
    const pixels = context.getImageData(0, 0, width, height);
    const lightness = averageLightness(pixels.data);
    const invert = mode === 'invert' || (mode === 'auto' && lightness < 128);
    for (let index = 0; index < pixels.data.length; index += 4) {
      let gray = pixels.data[index] * .2126 + pixels.data[index + 1] * .7152 + pixels.data[index + 2] * .0722;
      gray = (gray - 128) * 1.75 + 128;
      gray = Math.max(0, Math.min(255, invert ? 255 - gray : gray));
      const thresholded = gray > 142 ? 255 : gray < 108 ? 0 : gray;
      pixels.data[index] = thresholded;
      pixels.data[index + 1] = thresholded;
      pixels.data[index + 2] = thresholded;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/[|¦]/g, 'I')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function recognize() {
    if (!file) return;
    const serial = ++recognizeSerial;
    nodes.runesRecognize.disabled = true;
    nodes.runesClear.disabled = true;
    nodes.runesOutput.value = '';
    nodes.runesProgress.hidden = false;
    nodes.runesProgress.value = 0;
    Tools.setStatus(nodes.runesStatus, Tools.loadingMarkup('正在准备图片…'));
    try {
      const canvas = await processedCanvas();
      if (serial !== recognizeSerial) return;
      const current = await getWorker(nodes.runesModel.value);
      if (serial !== recognizeSerial) return;
      const result = await current.recognize(canvas);
      if (serial !== recognizeSerial) return;
      const text = cleanText(result?.data?.text || '');
      const confidence = Number(result?.data?.confidence || 0);
      nodes.runesOutput.value = text;
      nodes.runesProgress.value = 1;
      Tools.setStatus(
        nodes.runesStatus,
        text
          ? `识别完成${confidence ? `，模型置信度约 ${Math.round(confidence)}%` : ''}。`
          : '识别完成，但没有得到文字。请尝试重新裁切或切换预处理方式。',
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

  global.addEventListener('beforeunload', terminateWorker);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
