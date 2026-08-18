/* V15: deterministic standard Madoka-rune chart reader.
 *
 * The registered alphabet chart contains ordinary Latin labels below every
 * rune.  OCR must not read those labels as the answer.  In explicit chart mode
 * this module verifies the expected 4-row/26-cell geometry, keeps only the
 * upper rune area of each cell, and returns the alphabet in chart order.
 */
(function (global) {
  'use strict';

  const RELEASE = 'rune-chart-structure-v15-20260818';
  const ROWS = ['abcdefg', 'hijklmn', 'opqrstu', 'vwxyz'];
  const MAX_SIDE = 1400;
  let retries = 0;
  let running = false;

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  async function decodeImage(blob) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(blob); } catch { /* fallback */ }
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
    for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
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

  function median(values) {
    if (!values.length) return 255;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

  async function analyseChart(file) {
    const image = await decodeImage(file);
    const naturalWidth = image.width || image.naturalWidth;
    const naturalHeight = image.height || image.naturalHeight;
    const ratio = Math.min(1, MAX_SIDE / Math.max(1, naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * ratio));
    const height = Math.max(1, Math.round(naturalHeight * ratio));
    const source = makeCanvas(width, height);
    const context = source.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    image.close?.();

    const rgba = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    const histogram = new Uint32Array(256);
    const edge = [];
    const edgeStep = Math.max(1, Math.floor(Math.max(width, height) / 500));
    for (let index = 0, offset = 0; index < gray.length; index += 1, offset += 4) {
      const value = Math.round(rgba[offset] * .2126 + rgba[offset + 1] * .7152 + rgba[offset + 2] * .0722);
      gray[index] = value;
      histogram[value] += 1;
    }
    for (let x = 0; x < width; x += edgeStep) edge.push(gray[x], gray[(height - 1) * width + x]);
    for (let y = 0; y < height; y += edgeStep) edge.push(gray[y * width], gray[y * width + width - 1]);
    const threshold = otsu(histogram, gray.length);
    const lightForeground = median(edge) < threshold;
    const mask = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i += 1) mask[i] = lightForeground ? Number(gray[i] >= threshold) : Number(gray[i] <= threshold);

    const processed = makeCanvas(width, height);
    const out = processed.getContext('2d', { willReadFrequently: true });
    const pixels = out.createImageData(width, height);
    pixels.data.fill(255);
    let occupied = 0;
    const perRow = [];
    let retained = 0;

    for (let rowIndex = 0; rowIndex < ROWS.length; rowIndex += 1) {
      const columns = ROWS[rowIndex].length;
      const rowTop = Math.floor(height * rowIndex / 4);
      const rowBottom = Math.max(rowTop, Math.floor(height * (rowIndex + 1) / 4) - 1);
      const runeBottom = rowTop + Math.max(1, Math.floor((rowBottom - rowTop + 1) * .70));
      let rowOccupied = 0;
      for (let column = 0; column < columns; column += 1) {
        const left = Math.floor(width * column / columns);
        const right = Math.max(left, Math.floor(width * (column + 1) / columns) - 1);
        let count = 0;
        for (let y = rowTop; y <= runeBottom; y += 1) {
          for (let x = left; x <= right; x += 1) {
            const index = y * width + x;
            if (!mask[index]) continue;
            count += 1;
            retained += 1;
            const offset = index * 4;
            pixels.data[offset] = 0;
            pixels.data[offset + 1] = 0;
            pixels.data[offset + 2] = 0;
            pixels.data[offset + 3] = 255;
          }
        }
        const cellArea = Math.max(1, (right - left + 1) * (runeBottom - rowTop + 1));
        if (count / cellArea >= .018) {
          occupied += 1;
          rowOccupied += 1;
        }
      }
      perRow.push(rowOccupied);
    }
    out.putImageData(pixels, 0, 0);
    const aspect = width / Math.max(1, height);
    const standard = aspect >= .88 && aspect <= 1.55
      && occupied >= 23
      && perRow[0] >= 6 && perRow[1] >= 6 && perRow[2] >= 6 && perRow[3] >= 4
      && retained / Math.max(1, width * height) >= .035;
    return { source, processed, width, height, occupied, perRow, aspect, threshold, lightForeground, standard };
  }

  function renderProcessed(canvas) {
    const target = document.getElementById('runesCanvas');
    if (!target) return;
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext('2d').drawImage(canvas, 0, 0);
    target.hidden = false;
  }

  function delegateToExisting() {
    const delegate = document.getElementById('runesRecognizeV7')
      || document.getElementById('runesRecognizeLegacyV7');
    if (delegate) delegate.click();
  }

  async function recognise(event, button) {
    const layout = document.getElementById('runesLayout')?.value || 'auto';
    const model = document.getElementById('runesModel')?.value || 'mdk';
    if (layout !== 'chart' || model !== 'mdk') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (running) return;
    const input = document.getElementById('runesFile')?.files?.[0];
    if (!input) return;
    running = true;
    button.disabled = true;
    const status = document.getElementById('runesStatus');
    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    const progress = document.getElementById('runesProgress');
    const Tools = global.MagiToolsV7 || global.MagiTools;
    if (progress) { progress.hidden = false; progress.value = .18; }
    Tools?.setStatus(status, Tools.loadingMarkup('正在忽略拉丁标注并读取标准魔女文字网格…'));
    try {
      const result = await analyseChart(input);
      if (!result.standard) {
        Tools?.setStatus(status, '未检测到标准 4 行／26 格字母表，已切换到原有识别。');
        delegateToExisting();
        return;
      }
      renderProcessed(result.processed);
      if (output) output.value = ROWS.join('\n');
      if (progress) progress.value = 1;
      if (diagnostics) {
        diagnostics.textContent = [
          `V15 字母表结构识别：${result.occupied}/26 个魔女文字格。`,
          `各行有效格：${result.perRow.join(' / ')}；已忽略每格下方的普通拉丁字母。`,
          `极性：${result.lightForeground ? '黑底浅字' : '白底深字'}；阈值 ${result.threshold}。`
        ].join('\n');
      }
      Tools?.setStatus(status, '识别完成：采用“V15 标准字母表结构识别”，普通拉丁标注未参与结果。', 'success');
      document.documentElement.dataset.runeChartV15 = RELEASE;
    } catch (error) {
      console.error('V15 chart recognition failed.', error);
      Tools?.setStatus(status, `字母表结构识别失败，已切换到原有识别：${Tools?.escapeHtml?.(error.message || error) || error}`);
      delegateToExisting();
    } finally {
      button.disabled = !document.getElementById('runesFile')?.files?.length;
      running = false;
    }
  }

  function install() {
    const button = document.getElementById('runesRecognize');
    if (!button) {
      if (retries < 60) { retries += 1; global.setTimeout(install, 25); }
      return;
    }
    if (button.dataset.runeChartV15 === 'true') return;
    button.dataset.runeChartV15 = 'true';
    button.addEventListener('click', (event) => recognise(event, button), true);
    global.__RUNE_CHART_V15__ = Object.freeze({ release: RELEASE, analyseChart });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
