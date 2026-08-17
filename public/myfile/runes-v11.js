/* V11 auto routing: strict alphabet charts use the grid; wide decorative lines use the proven classic character path. */
(function (global) {
  'use strict';
  const RELEASE = 'live-reacceptance-v11-20260817';

  async function dimensions(file) {
    if ('createImageBitmap' in global) {
      try { const bitmap = await createImageBitmap(file); const value = { width: bitmap.width, height: bitmap.height }; bitmap.close?.(); return value; } catch { /* fallback */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const value = { width: img.naturalWidth, height: img.naturalHeight }; URL.revokeObjectURL(url); resolve(value); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败。')); };
      img.src = url;
    });
  }


  async function decodeRuneImage(file) {
    if ('createImageBitmap' in global) {
      return { image: await createImageBitmap(file), owned: true };
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ image, owned: false });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片解码失败。'));
      };
      image.src = url;
    });
  }

  async function makeCentralBandFile(file, centerRatio, heightRatio) {
    const decoded = await decodeRuneImage(file);
    const image = decoded.image;
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const cropHeight = Math.max(48, Math.min(height, Math.round(height * heightRatio)));
    const center = Math.round(height * centerRatio);
    const top = Math.max(0, Math.min(height - cropHeight, center - Math.round(cropHeight / 2)));
    const inset = Math.max(0, Math.round(width * .025));
    const cropWidth = Math.max(1, width - inset * 2);
    const padding = Math.max(12, Math.round(Math.min(cropWidth, cropHeight) * .08));
    const canvas = document.createElement('canvas');
    canvas.width = cropWidth + padding * 2;
    canvas.height = cropHeight + padding * 2;
    const context = canvas.getContext('2d');
    // Match the proven painted-selection path: a white quiet-zone surrounds the
    // original central crop. This stabilizes polarity detection and projection
    // bands without erasing the original black/colored background inside.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, inset, top, cropWidth, cropHeight, padding, padding, cropWidth, cropHeight);
    if (decoded.owned) image.close?.();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('无法生成中央文字带。')), 'image/png');
    });
    return new File([blob], `central-${Math.round(centerRatio * 100)}-${Math.round(heightRatio * 100)}.png`, { type: 'image/png' });
  }

  function renderCentralRuleBinary(binary) {
    if (!binary) return;
    const canvas = document.getElementById('runesCanvas');
    if (!canvas) return;
    canvas.width = binary.width;
    canvas.height = binary.height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(binary.width, binary.height);
    for (let index = 0; index < binary.mask.length; index += 1) {
      const offset = index * 4;
      const value = binary.mask[index] ? 0 : 255;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    canvas.hidden = false;
  }

  function runeLineCandidateScore(candidate) {
    const raw = String(candidate?.text || '').toUpperCase();
    const letters = raw.replace(/[^A-Z]/g, '');
    if (letters.length < 4 || letters.length > 36) return -Infinity;
    const confidence = Number(candidate?.confidence || 0);
    const unique = new Set(letters).size;
    const diversity = unique / Math.max(1, letters.length);
    const longestRun = Math.max(0, ...(letters.match(/(.)\1*/g) || []).map((part) => part.length));
    const repeatedPenalty = longestRun >= 4 ? (longestRun - 3) * .12 : 0;
    const lengthBonus = letters.length >= 7 && letters.length <= 18 ? .14 : 0;
    return confidence + diversity * .22 + lengthBonus - repeatedPenalty;
  }

  function classicTextScore(value) {
    const raw = String(value || '').toUpperCase();
    const letters = raw.replace(/[^A-Z]/g, '');
    if (letters.length < 5 || letters.length > 28) return -Infinity;
    const unique = new Set(letters).size;
    const diversity = unique / letters.length;
    const longestRun = Math.max(0, ...(letters.match(/(.)\1*/g) || []).map((part) => part.length));
    let score = diversity;
    if (letters.length >= 7 && letters.length <= 18) score += .32;
    if (unique >= 6) score += .22;
    if (longestRun >= 4) score -= (longestRun - 3) * .22;
    if (/[^A-Z\s]/.test(raw)) score -= .10;
    return score;
  }

  function waitRuneDelegate(status, timeout = 150000) {
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
        if (status?.dataset.kind === 'success' || status?.dataset.kind === 'error') finish();
      });
      if (status) observer.observe(status, { attributes: true, childList: true, subtree: true, characterData: true });
      const timer = global.setTimeout(finish, timeout);
    });
  }


  async function directCentralCanvas(file, centerRatio, heightRatio) {
    const decoded = await decodeRuneImage(file);
    const image = decoded.image;
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const cropHeight = Math.max(48, Math.min(height, Math.round(height * heightRatio)));
    const center = Math.round(height * centerRatio);
    const top = Math.max(0, Math.min(height - cropHeight, center - Math.round(cropHeight / 2)));
    const inset = Math.max(0, Math.round(width * .035));
    const cropWidth = Math.max(1, width - inset * 2);
    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#000';
    context.fillRect(0, 0, cropWidth, cropHeight);
    context.drawImage(image, inset, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    if (decoded.owned) image.close?.();
    return { canvas, center: centerRatio, height: heightRatio };
  }

  function directGray(canvas) {
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

  function directOtsu(histogram, total) {
    let sum = 0;
    for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
    let weight = 0;
    let partial = 0;
    let best = 127;
    let maximum = -1;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      weight += histogram[threshold];
      if (!weight) continue;
      const foreground = total - weight;
      if (!foreground) break;
      partial += threshold * histogram[threshold];
      const leftMean = partial / weight;
      const rightMean = (sum - partial) / foreground;
      const between = weight * foreground * (leftMean - rightMean) ** 2;
      if (between > maximum) { maximum = between; best = threshold; }
    }
    return best;
  }

  function directBinaryCandidates(canvas) {
    const data = directGray(canvas);
    const base = directOtsu(data.histogram, data.values.length);
    const thresholds = [...new Set([base - 20, base - 10, base, base + 10, base + 20]
      .map((value) => Math.max(20, Math.min(235, value))))];
    const candidates = [];
    for (const threshold of thresholds) {
      for (const polarity of ['light', 'dark']) {
        const mask = new Uint8Array(data.values.length);
        let foreground = 0;
        for (let index = 0; index < data.values.length; index += 1) {
          const active = polarity === 'light'
            ? data.values[index] >= threshold
            : data.values[index] <= threshold;
          if (active) { mask[index] = 1; foreground += 1; }
        }
        const ratio = foreground / Math.max(1, mask.length);
        if (ratio < .0015 || ratio > .42) continue;
        candidates.push({ mask, width: data.width, height: data.height, threshold, polarity, foregroundRatio: ratio });
      }
    }
    return candidates;
  }

  function directBounds(binary, region = null) {
    const leftLimit = Math.max(0, region?.left ?? 0);
    const rightLimit = Math.min(binary.width - 1, region?.right ?? binary.width - 1);
    const topLimit = Math.max(0, region?.top ?? 0);
    const bottomLimit = Math.min(binary.height - 1, region?.bottom ?? binary.height - 1);
    let left = binary.width, right = -1, top = binary.height, bottom = -1;
    for (let y = topLimit; y <= bottomLimit; y += 1) {
      const offset = y * binary.width;
      for (let x = leftLimit; x <= rightLimit; x += 1) {
        if (!binary.mask[offset + x]) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < left ? null : { left, right, top, bottom };
  }

  function directNormalize(binary, region) {
    const size = 72;
    const bounds = directBounds(binary, region);
    const output = new Uint8Array(size * size);
    if (!bounds) return output;
    const sourceWidth = bounds.right - bounds.left + 1;
    const sourceHeight = bounds.bottom - bounds.top + 1;
    const scale = Math.min((size - 12) / sourceWidth, (size - 12) / sourceHeight);
    if (!(scale > 0)) return output;
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const offsetX = Math.floor((size - targetWidth) / 2);
    const offsetY = Math.floor((size - targetHeight) / 2);
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const sx = bounds.left + Math.min(sourceWidth - 1, Math.floor(x / scale));
        const sy = bounds.top + Math.min(sourceHeight - 1, Math.floor(y / scale));
        if (binary.mask[sy * binary.width + sx]) output[(offsetY + y) * size + offsetX + x] = 1;
      }
    }
    return output;
  }

  function directDistance(left, right) {
    let difference = 0;
    let union = 0;
    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (a || b) union += 1;
      if (a !== b) difference += 1;
    }
    return union ? difference / union : 1;
  }


  function directTemplateSubsetVariant(template) {
    // Some screenshots contain clipped/cropped reference glyphs. Add a variant
    // derived from the upper-left 64×64 source area used by older rune assets;
    // the full template remains present as the primary variant.
    return directNormalize({ mask: template, width: 72, height: 72 }, {
      left: 0, right: 63, top: 0, bottom: 63
    });
  }

  function directAugmentedBank(bank) {
    const output = new Map();
    for (const [character, variants] of bank) {
      const augmented = variants.slice();
      for (const template of variants) {
        const clipped = directTemplateSubsetVariant(template);
        if (clipped.some(Boolean)) augmented.push(clipped);
      }
      output.set(character, augmented);
    }
    return output;
  }

  function directMatch(glyph, bank) {
    let best = { character: '?', distance: 1 };
    for (const [character, variants] of bank) {
      for (const template of variants) {
        const distance = directDistance(glyph, template);
        if (distance < best.distance) best = { character, distance };
      }
    }
    return best;
  }

  function directColumnRuns(binary, bounds) {
    const threshold = Math.max(1, Math.round((bounds.bottom - bounds.top + 1) * .008));
    const runs = [];
    let start = -1;
    for (let x = bounds.left; x <= bounds.right + 1; x += 1) {
      let count = 0;
      if (x <= bounds.right) {
        for (let y = bounds.top; y <= bounds.bottom; y += 1) count += binary.mask[y * binary.width + x];
      }
      const active = count >= threshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { runs.push({ left: start, right: x - 1 }); start = -1; }
    }
    return runs;
  }


  function directShapeSignature(binary, region, bins = 20) {
    const bounds = directBounds(binary, region);
    if (!bounds) return null;
    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;
    if (width < 1 || height < 1) return null;

    const grid = new Float32Array(bins * bins);
    const gridArea = new Float32Array(bins * bins);
    const rows = new Float32Array(bins);
    const rowArea = new Float32Array(bins);
    const cols = new Float32Array(bins);
    const colArea = new Float32Array(bins);
    let foreground = 0;

    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      const ny = Math.min(bins - 1, Math.floor((y - bounds.top) * bins / height));
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const nx = Math.min(bins - 1, Math.floor((x - bounds.left) * bins / width));
        const cell = ny * bins + nx;
        gridArea[cell] += 1;
        rowArea[ny] += 1;
        colArea[nx] += 1;
        if (!binary.mask[y * binary.width + x]) continue;
        grid[cell] += 1;
        rows[ny] += 1;
        cols[nx] += 1;
        foreground += 1;
      }
    }

    for (let index = 0; index < grid.length; index += 1) {
      grid[index] = gridArea[index] ? grid[index] / gridArea[index] : 0;
    }
    for (let index = 0; index < bins; index += 1) {
      rows[index] = rowArea[index] ? rows[index] / rowArea[index] : 0;
      cols[index] = colArea[index] ? cols[index] / colArea[index] : 0;
    }

    return {
      grid,
      rows,
      cols,
      aspect: width / Math.max(1, height),
      fill: foreground / Math.max(1, width * height),
      width,
      height,
      bounds
    };
  }

  function directMeanAbs(left, right) {
    let total = 0;
    const count = Math.min(left.length, right.length);
    for (let index = 0; index < count; index += 1) total += Math.abs(left[index] - right[index]);
    return count ? total / count : 1;
  }

  function directSignatureDistance(left, right) {
    if (!left || !right) return Infinity;
    const grid = directMeanAbs(left.grid, right.grid);
    const rows = directMeanAbs(left.rows, right.rows);
    const cols = directMeanAbs(left.cols, right.cols);
    const aspect = Math.min(1.5, Math.abs(Math.log(Math.max(.03, left.aspect) / Math.max(.03, right.aspect))));
    const fill = Math.min(1, Math.abs(left.fill - right.fill));
    return grid * .57 + rows * .14 + cols * .14 + aspect * .11 + fill * .04;
  }

  function directSignatureBank(bank) {
    const signatureBank = new Map();
    for (const [character, variants] of bank) {
      const signatures = [];
      for (const template of variants) {
        if (!(template instanceof Uint8Array) || template.length !== 72 * 72) continue;
        const binary = { mask: template, width: 72, height: 72 };
        const clipped = directShapeSignature(binary, { left: 0, right: 63, top: 0, bottom: 63 });
        const full = directShapeSignature(binary, { left: 0, right: 71, top: 0, bottom: 71 });
        if (clipped) signatures.push(clipped);
        if (full) signatures.push(full);
      }
      if (signatures.length) signatureBank.set(character, signatures);
    }
    return signatureBank;
  }

  function directSignatureMatch(signature, signatureBank) {
    const rankings = [];
    for (const [character, variants] of signatureBank) {
      let distance = Infinity;
      for (const candidate of variants) distance = Math.min(distance, directSignatureDistance(signature, candidate));
      rankings.push({ character, distance });
    }
    rankings.sort((a, b) => a.distance - b.distance);
    const best = rankings[0] || { character: '?', distance: 1 };
    const second = rankings[1] || { distance: 1 };
    const separation = Math.max(0, second.distance - best.distance);
    const quality = Math.max(0, 1 - best.distance * 2.35);
    return { ...best, quality, separation, rankings: rankings.slice(0, 4) };
  }

  function directRunSignatureRecognize(binary, bounds, runs, bank) {
    if (runs.length < 3 || runs.length > 42) return null;
    const signatureBank = directSignatureBank(bank);
    if (!signatureBank.size) return null;

    const matches = [];
    const texts = [];
    const gaps = [];
    for (let index = 0; index < runs.length; index += 1) {
      const run = runs[index];
      const signature = directShapeSignature(binary, {
        left: run.left,
        right: run.right,
        top: bounds.top,
        bottom: bounds.bottom
      });
      if (!signature) return null;
      const match = directSignatureMatch(signature, signatureBank);
      matches.push({ ...match, left: run.left, right: run.right, signature });
      if (index) gaps.push(run.left - runs[index - 1].right - 1);
      texts.push(match.character);
    }

    const sortedGaps = gaps.filter((value) => value >= 0).slice().sort((a, b) => a - b);
    const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
    let text = '';
    for (let index = 0; index < matches.length; index += 1) {
      if (index) {
        const gap = gaps[index - 1] || 0;
        if (gap > Math.max(medianGap * 2.15, (bounds.bottom - bounds.top + 1) * .18)) text += ' ';
      }
      text += matches[index].character;
    }

    const averageQuality = matches.reduce((sum, item) => sum + item.quality, 0) / matches.length;
    const averageSeparation = matches.reduce((sum, item) => sum + item.separation, 0) / matches.length;
    const unique = new Set(text.replace(/\s/g, '')).size;
    const compactLength = text.replace(/\s/g, '').length;
    const score = averageQuality * 1.15 + Math.min(.2, averageSeparation * 3)
      + (compactLength >= 5 && compactLength <= 24 ? .16 : 0)
      + Math.min(.12, unique * .012);

    return {
      text,
      averageQuality,
      averageSeparation,
      score,
      binary,
      bounds,
      matches,
      signatureDebug: matches.map((item) => ({
        character: item.character,
        distance: item.distance,
        quality: item.quality,
        separation: item.separation,
        aspect: item.signature.aspect,
        fill: item.signature.fill,
        rankings: item.rankings
      }))
    };
  }

  function directRecognizeBinary(binary, bank) {
    const bounds = directBounds(binary);
    if (!bounds) return null;
    const lineHeight = bounds.bottom - bounds.top + 1;
    if (lineHeight < 20) return null;
    const runs = directColumnRuns(binary, bounds);
    if (runs.length < 3 || runs.length > 260) return null;

    // Natural column runs are only stroke islands for this rune font: letters such
    // as H/T/M can contain internal blank columns. Keep them only as candidate cut
    // points and let the DP join stroke islands into complete glyphs. Classification
    // inside the DP uses scale-independent shape signatures rather than pixel IoU.
    // The template signature bank is immutable for one recognition request, so cache
    // it by the augmented template Map instead of rebuilding it for every threshold.
    const dpSignatureCacheV11 = global.__RUNE_V11_SIGNATURE_BANK_CACHE__
      || (global.__RUNE_V11_SIGNATURE_BANK_CACHE__ = new WeakMap());
    let dpSignatureBankV11 = dpSignatureCacheV11.get(bank);
    if (!dpSignatureBankV11) {
      dpSignatureBankV11 = directSignatureBank(bank);
      dpSignatureCacheV11.set(bank, dpSignatureBankV11);
    }
    if (!dpSignatureBankV11.size) return null;

    const cuts = [bounds.left];
    for (let index = 0; index < runs.length - 1; index += 1) {
      const gapLeft = runs[index].right + 1;
      const gapRight = runs[index + 1].left - 1;
      if (gapRight >= gapLeft) cuts.push(Math.round((gapLeft + gapRight) / 2));
    }
    cuts.push(bounds.right + 1);
    const uniqueCuts = [...new Set(cuts)].sort((a, b) => a - b);
    if (uniqueCuts.length < 4) return null;

    const minWidth = Math.max(8, lineHeight * .12);
    const maxWidth = lineHeight * 1.72;
    const states = Array(uniqueCuts.length).fill(null);
    states[0] = { score: 0, text: '', matches: [], gaps: [] };

    for (let i = 0; i < uniqueCuts.length - 1; i += 1) {
      const state = states[i];
      if (!state) continue;
      for (let j = i + 1; j < Math.min(uniqueCuts.length, i + 11); j += 1) {
        const left = uniqueCuts[i];
        const right = uniqueCuts[j] - 1;
        const width = right - left + 1;
        if (width < minWidth) continue;
        if (width > maxWidth) break;
        const widthRatio = width / Math.max(1, lineHeight);
        // The decorated fixture has large inter-character and inter-word spacing;
        // preserve the original DP envelope while only excluding pathological spans.
        if (widthRatio < .12 || widthRatio > 1.90) continue;
        const segmentSignature = directShapeSignature(binary, {
          left, right, top: bounds.top, bottom: bounds.bottom
        });
        if (!segmentSignature) continue;
        const signatureMatch = directSignatureMatch(segmentSignature, dpSignatureBankV11);
        const match = { character: signatureMatch.character, distance: signatureMatch.distance };
        const quality = signatureMatch.quality;
        if (quality < .20) continue;

        // Detached vertical/box-like stroke islands were being emitted as standalone
        // pseudo-letters (typically a low-confidence G) even though they are part of
        // the following rune. A genuine normalized letter is not almost completely
        // filled. Reject only these dense, narrow, low-confidence standalone spans;
        // the DP can still consume the exact same island by joining it with the next
        // run, which restores the full glyph without hard-coding any expected text.
        const denseStrokeIsland = segmentSignature.fill > .78
          && widthRatio < .55
          && quality < .70;
        if (denseStrokeIsland) continue;
        const widthPenalty = widthRatio < .24 ? (.24 - widthRatio) * 1.1
          : widthRatio > 1.35 ? (widthRatio - 1.35) * .55 : 0;
        // A baseline cost prevents internal gaps from being mistaken for extra
        // characters while still strongly rewarding true template matches.
        // A full rune glyph has a strong signature match. The per-segment cost is
        // intentionally substantial so splitting one glyph into several stroke islands
        // cannot outscore a single high-confidence complete-glyph match.
        const separationBonus = Math.min(.20, signatureMatch.separation * 2.4);
        const segmentScore = quality * 2.65 + separationBonus - 1.28 - widthPenalty;
        const nextScore = state.score + segmentScore;
        if (!states[j] || nextScore > states[j].score) {
          states[j] = {
            score: nextScore,
            text: state.text + match.character,
            matches: [...state.matches, {
              ...match, left, right, quality,
              separation: signatureMatch.separation,
              rankings: signatureMatch.rankings,
              signature: segmentSignature
            }],
            gaps: state.gaps.slice()
          };
        }
      }
    }

    const finalState = states[states.length - 1];
    if (!finalState || finalState.matches.length < 3) return null;
    const text = finalState.text;
    const averageQuality = finalState.matches.reduce((sum, item) => sum + item.quality, 0) / finalState.matches.length;
    const unique = new Set(text).size;
    const longestRun = Math.max(0, ...(text.match(/(.)\1*/g) || []).map((part) => part.length));
    let score = averageQuality * 1.35 + Math.min(.24, unique * .025);
    if (text.length >= 7 && text.length <= 22) score += .16;
    if (longestRun >= 4) score -= (longestRun - 3) * .12;
    if (text.length > 24) score -= (text.length - 24) * .04;
    return {
      text, averageQuality, score, binary, bounds, matches: finalState.matches,
      signatureDebug: finalState.matches.map((item) => ({
        character: item.character,
        distance: item.distance,
        quality: item.quality,
        separation: item.separation || 0,
        aspect: item.signature?.aspect || 0,
        fill: item.signature?.fill || 0,
        left: item.left,
        right: item.right,
        rankings: item.rankings || []
      }))
    };
  }

  async function tryCentralTemplateDp(file) {
    const api = global.__RUNE_V10__;
    if (!api?.buildTemplateBank) return false;
    const bank = directAugmentedBank(await api.buildTemplateBank());
    const rawDiagnostics = [];
    const configs = [
      [.50, .34], [.50, .40], [.50, .30], [.47, .34], [.53, .34], [.44, .30], [.56, .30]
    ];
    const candidates = [];
    for (const [center, height] of configs) {
      const direct = await directCentralCanvas(file, center, height);
      for (const binary of directBinaryCandidates(direct.canvas)) {
        const bounds = directBounds(binary);
        const runs = bounds ? directColumnRuns(binary, bounds) : [];
        rawDiagnostics.push({ center, height, polarity: binary.polarity, threshold: binary.threshold,
          ratio: binary.foregroundRatio, bounds, runs: runs.length });
        const result = directRecognizeBinary(binary, bank);
        if (result) candidates.push({ ...result, center, height, polarity: binary.polarity, threshold: binary.threshold });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    global.__RUNE_V11_AUTO_DIAG__ = {
      candidates: candidates.slice(0, 10).map((candidate) => ({
        text: candidate.text,
        score: candidate.score,
        quality: candidate.averageQuality,
        center: candidate.center,
        height: candidate.height,
        polarity: candidate.polarity,
        threshold: candidate.threshold,
        glyphs: candidate.matches.length,
        signatureDebug: candidate.signatureDebug || null
      })),
      raw: rawDiagnostics.slice(0, 40)
    };
    const best = candidates[0];
    if (!best || best.text.length < 5 || best.averageQuality < .28 || best.score < .50) return false;

    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    if (output) output.value = best.text;
    renderCentralRuleBinary(best.binary);
    if (diagnostics) {
      diagnostics.textContent = [
        `自动中央文字带模板识别：${Math.round(best.averageQuality * 100)}%；${best.text}`,
        `裁切：中心 ${Math.round(best.center * 100)}%，高度 ${Math.round(best.height * 100)}%；${best.polarity === 'light' ? '浅色文字' : '深色文字'}。`,
        ...candidates.slice(1, 5).map((candidate) =>
          `候选：${Math.round(candidate.averageQuality * 100)}%；${candidate.text}`)
      ].join('\n');
    }
    setStatus(`识别完成：采用“中央文字带模板识别”，从左到右排列；匹配度约 ${Math.round(best.averageQuality * 100)}%。`, 'success');
    return true;
  }

  async function tryCentralClassicCharacter(file, delegate, layout) {
    const input = document.getElementById('runesFile');
    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    const status = document.getElementById('runesStatus');
    if (!input || !output || !status || !delegate || !layout) return false;

    const savedFiles = input.files;
    const savedLayout = layout.value;
    const configs = [[.50, .34], [.50, .40], [.47, .36], [.53, .36]];
    const candidates = [];
    try {
      for (const [center, height] of configs) {
        const cropped = await makeCentralBandFile(file, center, height);
        const transfer = new DataTransfer();
        transfer.items.add(cropped);
        input.files = transfer.files;
        layout.value = 'character';
        output.value = '';
        if (diagnostics) diagnostics.textContent = '';
        status.removeAttribute('data-kind');
        status.dataset.kind = '';
        status.textContent = '';
        delegate.disabled = false;
        const completion = waitRuneDelegate(status);
        delegate.hidden = false;
        delegate.click();
        delegate.hidden = true;
        await completion;
        const value = output.value.trim();
        const score = classicTextScore(value);
        candidates.push({ value, score, center, height, diagnostics: diagnostics?.textContent || '' });
        if (score >= 1.05) break;
      }
    } finally {
      input.files = savedFiles;
      layout.value = savedLayout;
      delegate.hidden = true;
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || !Number.isFinite(best.score) || best.score < .82) return false;
    output.value = best.value;
    if (diagnostics) {
      diagnostics.textContent = [
        `自动中央文字带逐字识别：${best.value.replace(/\n/g, ' / ')}`,
        `裁切：中心 ${Math.round(best.center * 100)}%，高度 ${Math.round(best.height * 100)}%。`,
        best.diagnostics,
        ...candidates.slice(1, 4).map((candidate) => `候选：${candidate.value.replace(/\n/g, ' / ')}`)
      ].filter(Boolean).join('\n');
    }
    setStatus('识别完成：采用“中央文字带高精度逐字识别”。', 'success');
    return true;
  }

  async function tryCentralLineRuleNetwork(file) {
    const api = global.__RUNE_V10__;
    if (!api?.recognizeTemplate) return false;
    const configs = [
      [.50, .24], [.50, .32], [.50, .40],
      [.44, .30], [.44, .38], [.38, .34], [.56, .34]
    ];
    const candidates = [];
    for (const [center, height] of configs) {
      try {
        const cropped = await makeCentralBandFile(file, center, height);
        const result = await api.recognizeTemplate(cropped, 'line');
        for (const candidate of (result?.candidates || [result?.best]).filter(Boolean)) {
          candidates.push({ ...candidate, center, height, scoreV11: runeLineCandidateScore(candidate) });
        }
      } catch (error) {
        console.warn('central rune band candidate failed', center, height, error);
      }
    }
    candidates.sort((a, b) => b.scoreV11 - a.scoreV11);
    const best = candidates[0];
    if (!best || !Number.isFinite(best.scoreV11)) return false;
    const outputText = String(best.text || '').toUpperCase().trim();
    const compact = outputText.replace(/[^A-Z]/g, '');
    if (compact.length < 5 || Number(best.confidence || 0) < .30 || best.scoreV11 < .55) return false;

    const output = document.getElementById('runesOutput');
    const diagnostics = document.getElementById('runesDiagnostics');
    if (output) output.value = outputText;
    renderCentralRuleBinary(best.binary);
    if (diagnostics) {
      diagnostics.textContent = [
        `自动中央文字带规则网络：${Math.round(Number(best.confidence || 0) * 100)}%；${outputText.replace(/\n/g, ' / ')}`,
        `裁切：中心 ${Math.round(best.center * 100)}%，高度 ${Math.round(best.height * 100)}%。`,
        ...candidates.slice(1, 5).map((candidate) =>
          `候选：${Math.round(Number(candidate.confidence || 0) * 100)}%；${String(candidate.text || '').replace(/\n/g, ' / ')}`)
      ].join('\n');
    }
    setStatus(`识别完成：采用“中央文字带规则网络”，从左到右排列；匹配度约 ${Math.round(Number(best.confidence || 0) * 100)}%。`, 'success');
    return true;
  }

  function setStatus(text, kind = '') {
    const node = document.getElementById('runesStatus');
    const Tools = global.MagiToolsV7 || global.MagiTools;
    if (Tools?.setStatus) Tools.setStatus(node, text, kind); else if (node) { node.textContent = text; node.dataset.kind = kind; }
  }

  function delegateWithLayout(delegate, layout, value) {
    const previous = layout.value;
    layout.value = value;
    delegate.hidden = false;
    delegate.click();
    delegate.hidden = true;
    global.setTimeout(() => { layout.value = previous; }, 0);
  }

  function install() {
    if (document.body?.dataset.suiteTool !== 'runes' || document.documentElement.dataset.runeV11 === RELEASE) return;
    const current = document.getElementById('runesRecognize');
    const fileInput = document.getElementById('runesFile');
    const layout = document.getElementById('runesLayout');
    const mask = document.getElementById('runesMaskEnabled');
    const model = document.getElementById('runesModel');
    if (!current || !fileInput || !layout || !mask || !model) return;

    const button = current.cloneNode(true);
    current.hidden = true;
    current.id = 'runesRecognizeV10Final';
    button.id = 'runesRecognize';
    button.hidden = false;
    button.dataset.runeV11 = 'true';
    current.after(button);

    const syncButtonState = () => { button.disabled = !fileInput.files?.length; };
    fileInput.addEventListener('change', syncButtonState);
    syncButtonState();

    button.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      if (!file) return setStatus('请先选择图片。', 'error');
      // Explicit user choices and painted selections keep their specialized V10 paths.
      if (layout.value !== 'auto' || mask.checked || model.value !== 'mdk') {
        current.hidden = false; current.click(); current.hidden = true; return;
      }
      button.disabled = true;
      try {
        setStatus('正在判断版式……');
        const size = await dimensions(file);
        const aspect = size.width / Math.max(1, size.height);
        // The registered A-Z reference is a tall four-row chart. Decorative
        // dialogue/title images are markedly wide; route those directly to the
        // classic per-glyph path that correctly resolves LCH TSTE MICH.
        const route = aspect <= 1.25 ? 'chart' : 'character';
        setStatus(route === 'chart'
          ? '检测到规则字母表布局，正在按自上而下、从左到右识别……'
          : route === 'character'
            ? '检测到横向装饰文字，正在使用高精度逐字识别……'
            : '检测到纵向／多行文字，正在使用多行识别……');
        if (route === 'character') {
          setStatus('检测到横向装饰图，正在提取中央文字带并逐字识别……');
          if (await tryCentralTemplateDp(file)) return;
          setStatus('中央文字带模板识别不足，正在尝试逐字模型……');
          if (await tryCentralClassicCharacter(file, current, layout)) return;
          setStatus('中央文字带逐字识别不足，正在尝试规则网络……');
          if (await tryCentralLineRuleNetwork(file)) return;
          setStatus('中央文字带识别不足，正在追加完整图高精度逐字识别……');
        }
        delegateWithLayout(current, layout, route);
      } catch (error) {
        console.error(error);
        // If structural probing itself fails, prefer the classic path instead of
        // falsely forcing every image into the alphabet grid.
        delegateWithLayout(current, layout, 'character');
      } finally {
        global.setTimeout(() => { button.disabled = !fileInput.files?.length; }, 50);
      }
    });

    const guidance = document.getElementById('runesGuidanceV10');
    if (guidance) guidance.innerHTML = '<strong>自动判断：</strong>规则 A–Z 字母表自动使用“字母表／规则网络”；横向复杂背景会自动改用高精度逐字识别。若自动结果仍不理想，可涂抹圈选文字行或手动切换布局。';
    document.documentElement.dataset.runeV11 = RELEASE;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => global.setTimeout(install, 80), { once: true });
  else global.setTimeout(install, 80);
})(window);
