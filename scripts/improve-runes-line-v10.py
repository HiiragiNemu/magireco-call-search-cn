#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    path = Path("public/myfile/runes-line-v10.js")
    text = path.read_text(encoding="utf-8")

    if "function removeBorderComponents(binary)" not in text:
        anchor = """    binary.removedRows = rows;
    binary.removedColumns = columns;
    return binary;
  }

  function binaryCandidates(canvas) {"""
        replacement = """    binary.removedRows = rows;
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

  function binaryCandidates(canvas) {"""
        text = replace_once(text, anchor, replacement, "border-component cleanup insertion")

    old_binary = """        const binary = removeLongLines({
          mask,
          width: data.width,
          height: data.height,
          polarity,
          threshold,
          foregroundRatio: ratio,
          removedRows: 0,
          removedColumns: 0
        });
        const bounds = maskBounds(binary.mask, binary.width, binary.height);"""
    new_binary = """        const binary = removeBorderComponents(removeLongLines({
          mask,
          width: data.width,
          height: data.height,
          polarity,
          threshold,
          foregroundRatio: ratio,
          removedRows: 0,
          removedColumns: 0
        }));
        const bounds = maskBounds(binary.mask, binary.width, binary.height);"""
    if old_binary in text:
        text = replace_once(text, old_binary, new_binary, "border cleanup application")

    if "async function buildCombinedBank(base)" not in text:
        anchor = """  async function recognizePaintedLine(file) {
    const base = global.__RUNE_V10__;
    if (!base?.buildTemplateBank) throw new Error('规则网络模板尚未初始化。');
    const canvas = await canvasFromFile(file);
    const bank = await base.buildTemplateBank();"""
        replacement = """  function resizeTemplate(mask, sourceSize, targetSize) {
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
    const bank = await buildCombinedBank(base);"""
        text = replace_once(text, anchor, replacement, "combined template bank insertion")

    text = text.replace(
        "      recognizePaintedLine,\n      decodePaintedLine: decodeLine",
        "      recognizePaintedLine,\n      decodePaintedLine: decodeLine,\n      removePaintedBorderComponents: removeBorderComponents,\n      buildPaintedCombinedBank: buildCombinedBank",
        1,
    )

    path.write_text(text, encoding="utf-8")
    print("improved-runes-line-v10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
