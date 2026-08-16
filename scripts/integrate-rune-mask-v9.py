#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

RELEASE = "rune-mask-v9-20260816"


def insert_after(text: str, anchor: str, value: str, label: str) -> str:
    if value in text:
        return text
    if text.count(anchor) != 1:
        raise SystemExit(f"{label}: expected one anchor, found {text.count(anchor)}")
    return text.replace(anchor, anchor + "\n" + value, 1)


def update_body_release(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)
    if count != 1:
        raise SystemExit(f"{path}: body release marker missing")
    path.write_text(text, encoding="utf-8")


def patch_runes_page() -> None:
    path = Path("public/runes.html")
    text = path.read_text(encoding="utf-8")
    text = insert_after(
        text,
        '  <link rel="stylesheet" href="./myfile/layout-v8.css">',
        '  <link rel="stylesheet" href="./myfile/runes-mask-v9.css">',
        "V9 CSS",
    )
    text = insert_after(
        text,
        '  <script src="./myfile/layout-v8.js"></script>',
        '  <script src="./myfile/runes-mask-v9.js"></script>',
        "V9 JavaScript",
    )
    path.write_text(text, encoding="utf-8")


def patch_build_info() -> None:
    path = Path("public/build-info.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    value.update({
        "release": RELEASE,
        "rollbackBeforeRuneMaskV9": "rollback/pre-rune-mask-v9-20260816",
        "runeMaskMode": "paint-to-keep",
        "runeMaskPipeline": "masked-crop-binary-normalization",
        "runeMaskEngines": ["ordered-template", "classic-tesseract-fallback"],
        "runePreviewLayout": "side-by-side-desktop-stacked-mobile",
        "runeReferenceLayout": "collapsed-size-capped",
        "runeVisitorGuidance": "concise-mask-guidance",
    })
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_release_constants() -> None:
    files = [
        "public/__acceptance.html",
        "scripts/smoke-neo11-v3.mjs",
        "scripts/smoke-height-guide-v4.mjs",
        "scripts/smoke-integrated-tools-v5.mjs",
        "scripts/smoke-story-layout-v6.mjs",
        "scripts/smoke-ocr-v6.mjs",
        "scripts/smoke-story-ui-v7.mjs",
        "scripts/smoke-rune-v7.mjs",
        "scripts/smoke-collapsible-layout-v8.mjs",
    ]
    pattern = re.compile(r"const EXPECTED_RELEASE = '[^']+';")
    for filename in files:
        path = Path(filename)
        text = path.read_text(encoding="utf-8")
        text, count = pattern.subn(f"const EXPECTED_RELEASE = '{RELEASE}';", text, count=1)
        if count != 1:
            raise SystemExit(f"release constant missing: {filename}")
        path.write_text(text, encoding="utf-8")


def patch_validator() -> None:
    path = Path("scripts/validate-site.js")
    text = path.read_text(encoding="utf-8")
    if "V9: 'rune-mask-v9-20260816'" not in text:
        text = text.replace(
            "  V8: 'collapsible-layout-v8-20260816'\n});",
            "  V8: 'collapsible-layout-v8-20260816',\n  V9: 'rune-mask-v9-20260816'\n});",
            1,
        )
    if "const isV9 = release === RELEASES.V9;" not in text:
        text = text.replace(
            "const isV8 = release === RELEASES.V8;",
            "const isV9 = release === RELEASES.V9;\nconst isV8 = release === RELEASES.V8 || isV9;",
            1,
        )

    block = r'''
if (isV9) {
  for (const file of [
    'public/myfile/runes-mask-v9.css', 'public/myfile/runes-mask-v9.js',
    'scripts/integrate-rune-mask-v9.py', 'scripts/smoke-rune-mask-v9.mjs'
  ]) requireFile(file);
  const runes = read('public/runes.html');
  for (const marker of ['./myfile/runes-mask-v9.css', './myfile/runes-mask-v9.js']) {
    if (!runes.includes(marker)) fail(`V9 runes page missing ${marker}`);
  }
  const mask = read('public/myfile/runes-mask-v9.js');
  for (const marker of [
    'runesMaskEnabled', 'runesMaskCanvas', 'buildMaskedFile', 'maskMetrics',
    '__RUNE_INPUT_OVERRIDE_V9__', 'runes-preview-pair-v9', 'runesReferenceDetailsV9'
  ]) if (!mask.includes(marker)) fail(`V9 mask marker missing: ${marker}`);
  const maskCss = read('public/myfile/runes-mask-v9.css');
  for (const marker of ['grid-template-columns: repeat(2', 'touch-action: none', 'max-width: min(100%, 860px)', '@media (max-width: 720px)']) {
    if (!maskCss.includes(marker)) fail(`V9 mask CSS marker missing: ${marker}`);
  }
  const template = read('public/myfile/runes-template-v7.js');
  const classic = read('public/myfile/runes-app.js');
  if (!template.includes('global.__RUNE_INPUT_OVERRIDE_V9__ || fileInput.files?.[0]')) fail('V9 template OCR bridge missing.');
  if (!classic.includes('const recognitionFile = global.__RUNE_INPUT_OVERRIDE_V9__ || file;')) fail('V9 classic OCR bridge missing.');
  if (buildInfo.rollbackBeforeRuneMaskV9 !== 'rollback/pre-rune-mask-v9-20260816') fail('V9 rollback pointer missing.');
  if (buildInfo.runeMaskMode !== 'paint-to-keep') fail('V9 paint-to-keep mode missing.');
  if (buildInfo.runeReferenceLayout !== 'collapsed-size-capped') fail('V9 reference layout marker missing.');
}
'''
    anchor = "\nif (failed) process.exit(1);"
    if "if (isV9) {" not in text:
        if anchor not in text:
            raise SystemExit("validator final anchor missing")
        text = text.replace(anchor, "\n" + block + anchor, 1)
    path.write_text(text, encoding="utf-8")


def main() -> int:
    for filename in ["public/index.html", "public/story.html", "public/attendance.html", "public/runes.html"]:
        update_body_release(Path(filename))
    patch_runes_page()
    patch_build_info()
    patch_release_constants()
    patch_validator()
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
