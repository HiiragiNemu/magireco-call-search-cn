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
    text = replace_once(
        text,
        "      const skipCost = (speckle ? 13 : 43) + bestCost[index + 1];",
        "      const skipCost = (speckle ? 18 : 110) + bestCost[index + 1];",
        "painted-line skip cost",
    )
    text = replace_once(
        text,
        "      for (let end = index; end < Math.min(count, index + 9); end += 1) {",
        "      for (let end = index; end < Math.min(count, index + 13); end += 1) {",
        "painted-line merge span",
    )
    text = replace_once(
        text,
        "        let cost = match.distance * 112 + 5.5;",
        "        let cost = match.distance * 86 + 3.5;",
        "painted-line glyph cost",
    )
    text = replace_once(
        text,
        "      + Math.min(14, unique * 1.2) + coverage * 15 - skipped * 2.6;",
        "      + Math.min(14, unique * 1.2) + coverage * 20 - skipped * 7.5;",
        "painted-line coverage score",
    )
    text = text.replace(
        "/* V10.2: paint-to-keep OCR line segmentation with template dynamic programming. */",
        "/* V10.3: coverage-first paint-guided line segmentation with template dynamic programming. */",
        1,
    )
    path.write_text(text, encoding="utf-8")
    print("tuned-runes-line-v10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
