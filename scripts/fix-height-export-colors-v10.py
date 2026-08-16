#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    path = Path("public/myfile/height-export-v10.js")
    text = path.read_text(encoding="utf-8")

    if "function sanitizeCloneColors" not in text:
        anchor = """  async function waitForImages(root) {
    const images = [...root.querySelectorAll('img')];
    await Promise.all(images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      try {
        await image.decode();
      } catch {
        await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
          global.setTimeout(resolve, 5000);
        });
      }
    }));
  }

  function setExportStatus(text, kind = '') {"""
        replacement = """  async function waitForImages(root) {
    const images = [...root.querySelectorAll('img')];
    await Promise.all(images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      try {
        await image.decode();
      } catch {
        await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
          global.setTimeout(resolve, 5000);
        });
      }
    }));
  }

  const MODERN_COLOR_RE = /(?:^|[\\s,(])(?:color|color-mix|lab|lch|oklab|oklch)\\(/iu;

  function legacyColor(value, fallback) {
    const text = String(value || '').trim();
    if (!MODERN_COLOR_RE.test(text)) return text || fallback;
    const match = text.match(/^color\\(\\s*(?:srgb|display-p3)\\s+([+-]?(?:\\d*\\.)?\\d+)\\s+([+-]?(?:\\d*\\.)?\\d+)\\s+([+-]?(?:\\d*\\.)?\\d+)(?:\\s*\\/\\s*([+-]?(?:\\d*\\.)?\\d+%?))?\\s*\\)$/iu);
    if (!match) return fallback;
    const channel = (value) => Math.round(Math.max(0, Math.min(1, Number(value))) * 255);
    const alphaText = match[4] || '1';
    const alpha = alphaText.endsWith('%')
      ? Math.max(0, Math.min(1, Number(alphaText.slice(0, -1)) / 100))
      : Math.max(0, Math.min(1, Number(alphaText)));
    return `rgba(${channel(match[1])}, ${channel(match[2])}, ${channel(match[3])}, ${alpha})`;
  }

  function sanitizeCloneColors(cloneDocument, root) {
    if (!cloneDocument || !root) return;
    const view = cloneDocument.defaultView;
    if (!view?.getComputedStyle) return;
    const colorProperties = [
      ['color', 'rgb(30, 20, 27)'],
      ['backgroundColor', 'rgba(255, 255, 255, 0)'],
      ['borderTopColor', 'rgb(213, 179, 197)'],
      ['borderRightColor', 'rgb(213, 179, 197)'],
      ['borderBottomColor', 'rgb(213, 179, 197)'],
      ['borderLeftColor', 'rgb(213, 179, 197)'],
      ['outlineColor', 'rgb(30, 20, 27)'],
      ['textDecorationColor', 'rgb(30, 20, 27)'],
      ['columnRuleColor', 'rgb(213, 179, 197)'],
      ['caretColor', 'rgb(30, 20, 27)'],
      ['fill', 'rgb(30, 20, 27)'],
      ['stroke', 'rgb(30, 20, 27)']
    ];
    const nodes = [root, ...root.querySelectorAll('*')];
    for (const node of nodes) {
      const computed = view.getComputedStyle(node);
      for (const [property, fallback] of colorProperties) {
        const value = computed[property];
        if (MODERN_COLOR_RE.test(String(value || ''))) node.style[property] = legacyColor(value, fallback);
      }
      for (const property of ['boxShadow', 'textShadow', 'backgroundImage']) {
        if (MODERN_COLOR_RE.test(String(computed[property] || ''))) node.style[property] = 'none';
      }
      if (MODERN_COLOR_RE.test(String(computed.filter || ''))) node.style.filter = 'none';
    }
  }

  function setExportStatus(text, kind = '') {"""
        text = replace_once(text, anchor, replacement, "height-export color sanitizer insertion")

    old_options = """        imageTimeout: 20000
      });"""
    new_options = """        imageTimeout: 20000,
        onclone(cloneDocument) {
          const clonedRoot = cloneDocument.querySelector('[data-v10-export-clone="true"]');
          sanitizeCloneColors(cloneDocument, clonedRoot);
        }
      });"""
    text = replace_once(text, old_options, new_options, "html2canvas onclone sanitizer")

    text = replace_once(
        text,
        "    prepareClone\n  });",
        "    prepareClone,\n    sanitizeCloneColors,\n    legacyColor\n  });",
        "height-export public test hooks",
    )

    path.write_text(text, encoding="utf-8")
    print("fixed-height-export-colors-v10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
