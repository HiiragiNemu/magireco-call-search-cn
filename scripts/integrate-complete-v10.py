#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import re

RELEASE = "height-export-title-call-rune-v10-20260817"
OLD_RELEASE = "height-export-title-call-v10-20260817"
PAGES = ["public/index.html", "public/story.html", "public/attendance.html", "public/runes.html"]
SMOKES = [
    "public/__acceptance.html",
    "scripts/smoke-neo11-v3.mjs",
    "scripts/smoke-height-guide-v4.mjs",
    "scripts/smoke-integrated-tools-v5.mjs",
    "scripts/smoke-story-ui-v7.mjs",
    "scripts/smoke-rune-v7.mjs",
    "scripts/smoke-collapsible-layout-v8.mjs",
    "scripts/smoke-rune-mask-v9.mjs",
    "scripts/smoke-complete-v10.mjs",
]


def insert_after(text: str, anchor: str, insertion: str, label: str) -> str:
    if insertion in text:
        return text
    count = text.count(anchor)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(anchor, anchor + "\n" + insertion, 1)


def patch_pages() -> None:
    for filename in PAGES:
        path = Path(filename)
        text = path.read_text(encoding="utf-8")
        text, count = re.subn(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)
        if count != 1:
            raise SystemExit(f"Missing data-build marker: {filename}")
        path.write_text(text, encoding="utf-8")

    runes_path = Path("public/runes.html")
    text = runes_path.read_text(encoding="utf-8")
    text = insert_after(
        text,
        '  <link rel="stylesheet" href="./myfile/runes-mask-v9.css">',
        '  <link rel="stylesheet" href="./myfile/runes-v10.css">',
        "runes V10 CSS",
    )
    text = insert_after(
        text,
        '  <script src="./myfile/runes-mask-v9.js"></script>',
        '  <script src="./myfile/runes-v10.js"></script>',
        "runes V10 script",
    )
    runes_path.write_text(text, encoding="utf-8")


def patch_build_info() -> None:
    path = Path("public/build-info.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    value.update({
        "release": RELEASE,
        "rollbackBeforeHeightExportTitleCallRuneV10": "rollback/pre-height-export-title-call-v10-20260817",
        "callRelationshipTableFold": True,
        "callHelpLayout": "desktop-right-column-independent-fold",
        "callQuickRail": "nine-Chinese-actions",
        "heightScaleBaseline": "display-100-equals-legacy-50",
        "heightScaleDisplayedRange": "50-250-percent",
        "heightUnknownCategories": ["无年龄信息", "无学校信息", "无从属组织信息"],
        "heightExport": "full-unscaled-dual-outer-rulers-high-dpi-png",
        "storyTitleLocalization": "complete-reader-wiki-structural-self-audited",
        "storyTitleAudit": "docs/story-title-self-translations-v10.md",
        "runeOcrV10": "auto-grid-rule-network-smart-selection-classic-fallback",
        "runeMaskMeaning": "expanded-selection-region-not-exact-pixel-clipping",
        "runeAlphabetOrder": "top-to-bottom-left-to-right-A-Z",
        "runeComplexGuidance": True,
    })
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_release_constants() -> None:
    pattern = re.compile(r"const EXPECTED_RELEASE = '[^']+';")
    for filename in SMOKES:
        path = Path(filename)
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        text, count = pattern.subn(f"const EXPECTED_RELEASE = '{RELEASE}';", text, count=1)
        if count != 1:
            raise SystemExit(f"Expected-release marker missing: {filename}")
        path.write_text(text, encoding="utf-8")

    for filename in ["scripts/build-story-titles-v10.py", "scripts/integrate-height-export-title-call-v10.py"]:
        path = Path(filename)
        text = path.read_text(encoding="utf-8")
        text = text.replace(OLD_RELEASE, RELEASE)
        path.write_text(text, encoding="utf-8")

    audit_path = Path("public/data/story-v10/title-audit.json")
    if audit_path.exists():
        value = json.loads(audit_path.read_text(encoding="utf-8"))
        value["release"] = RELEASE
        audit_path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def validate() -> None:
    required = [
        "public/myfile/runes-v10.js",
        "public/myfile/runes-v10.css",
        "public/myfile/call-ui-v10.js",
        "public/myfile/height-export-v10.js",
        "public/data/story-v7/localization.json",
        "public/data/story-v10/title-audit.json",
        "docs/story-title-self-translations-v10.md",
    ]
    missing = [filename for filename in required if not Path(filename).exists()]
    if missing:
        raise SystemExit(f"Missing final V10 artifacts: {missing}")

    runes = Path("public/runes.html").read_text(encoding="utf-8")
    if './myfile/runes-v10.js' not in runes or './myfile/runes-v10.css' not in runes:
        raise SystemExit("Runes page is not wired to V10")
    index = Path("public/index.html").read_text(encoding="utf-8")
    for marker in ("site-correction-v10.css", "call-ui-v10.js", "height-export-v10.js"):
        if marker not in index:
            raise SystemExit(f"Index page missing V10 marker: {marker}")


def main() -> int:
    patch_pages()
    patch_build_info()
    patch_release_constants()
    validate()
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
