#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'public/myfile/runes-mask-glyph-v18.js'
text = path.read_text(encoding='utf-8')

text = text.replace(
    "const RELEASE = 'rune-mask-color-glyph-v19-20260819';",
    "const RELEASE = 'rune-mask-color-glyph-v20-20260819';",
)

old_fill = '    const pixels = outputContext.createImageData(width, height);\n    pixels.data.fill(255);'
new_fill = '''    const pixels = outputContext.createImageData(width, height);
    // Unpainted pixels must be dark, not white. V14 treats pale/white pixels as
    // candidate rune strokes, so an opaque white outside-mask area swamped the
    // user-selected text band and forced a slow OCR fallback.
    pixels.data.fill(0);
    for (let offset = 3; offset < pixels.data.length; offset += 4) pixels.data[offset] = 255;'''
if new_fill not in text:
    if old_fill not in text:
        raise SystemExit('V20 mask background anchor was not found')
    text = text.replace(old_fill, new_fill, 1)

function_code = r'''
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
'''
anchor = '\n  function acceptGlyphResult(glyphResult, canvas, contextLines, nodes, tools) {'
if 'async function buildSeedFocusedCanvas' not in text:
    if anchor not in text:
        raise SystemExit('V20 seed-focused insertion anchor was not found')
    text = text.replace(anchor, function_code + anchor, 1)

old_route = '''      const colorEngine = global.__RUNE_COLOR_V14__;
      const glyphEngine = nodes.model.value === 'mdk' ? global.__RUNE_GLYPH_V16__ : null;
      const focused = colorEngine?.buildColorFocusedInput
        ? await colorEngine.buildColorFocusedInput(colorMask.file, true)
        : null;
'''
new_route = '''      const colorEngine = global.__RUNE_COLOR_V14__;
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
'''
if new_route not in text:
    if old_route not in text:
        raise SystemExit('V20 mask route replacement anchor was not found')
    text = text.replace(old_route, new_route, 1)

old_api = '''      release: RELEASE,
      recognizeMasked,
      buildColorMaskedFile
'''
new_api = '''      release: RELEASE,
      recognizeMasked,
      buildColorMaskedFile,
      buildSeedFocusedCanvas
'''
if new_api not in text:
    if old_api not in text:
        raise SystemExit('V20 public API anchor was not found')
    text = text.replace(old_api, new_api, 1)

path.write_text(text, encoding='utf-8', newline='\n')
print('Applied V20 deterministic color-mask isolation')
