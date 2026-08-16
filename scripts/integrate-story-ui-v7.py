#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

RELEASE = "story-ui-translation-ocr-v7-20260816"


def insert_after(text: str, anchor: str, value: str, label: str) -> str:
    if value in text:
        return text
    if text.count(anchor) != 1:
        raise SystemExit(f"{label}: expected one anchor, found {text.count(anchor)}")
    return text.replace(anchor, anchor + "\n" + value, 1)


def update_release(text: str) -> str:
    text, count = re.subn(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)
    if count != 1:
        raise SystemExit("body data-build marker missing")
    return text


def compact_hero(text: str, title: str) -> str:
    pattern = re.compile(r'(?s)<header class="suite-hero">.*?</header>')
    replacement = f'<header class="suite-hero"><h1>{title}</h1></header>'
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"suite hero missing for {title}")
    return text


def patch_root() -> None:
    path = Path("public/index.html")
    text = update_release(path.read_text(encoding="utf-8"))
    for indent in ("\t", "  "):
        anchor = f'{indent}<link rel="stylesheet" href="./myfile/layout-v6.css">'
        if anchor in text:
            text = insert_after(text, anchor, f'{indent}<link rel="stylesheet" href="./myfile/suite-v7.css">', "root V7 CSS")
            break
    else:
        raise SystemExit("root layout-v6 CSS anchor missing")
    # The original call/height page already has its proven pink top/search/bottom
    # controls. Do not add the suite rail a second time.
    path.write_text(text, encoding="utf-8")


def patch_story() -> None:
    path = Path("public/story.html")
    text = update_release(path.read_text(encoding="utf-8"))
    text = compact_hero(text, "角色故事搜索")
    text = insert_after(text, '  <link rel="stylesheet" href="./myfile/layout-v6.css">', '  <link rel="stylesheet" href="./myfile/suite-v7.css">', "story V7 CSS")
    text = text.replace('  <script src="./myfile/story-app.js"></script>', '  <script src="./myfile/charaAt.js"></script>\n  <script src="./myfile/suite-v7.js"></script>\n  <script src="./myfile/story-app-v7.js"></script>', 1)
    if 'story-app-v7.js' not in text:
        raise SystemExit("story V7 app replacement failed")
    text = re.sub(r'\n\s*<!-- V5 integration[^\n]*-->', '', text)
    text = re.sub(r'\n\s*<footer class="suite-footer">.*?</footer>', '', text, flags=re.S)
    path.write_text(text, encoding="utf-8")


def patch_attendance() -> None:
    path = Path("public/attendance.html")
    text = update_release(path.read_text(encoding="utf-8"))
    text = compact_hero(text, "共同出场次数排行")
    text = insert_after(text, '  <link rel="stylesheet" href="./myfile/layout-v6.css">', '  <link rel="stylesheet" href="./myfile/suite-v7.css">', "attendance V7 CSS")
    text = text.replace('  <script src="./myfile/attendance-app.js"></script>', '  <script src="./myfile/charaAt.js"></script>\n  <script src="./myfile/suite-v7.js"></script>\n  <script src="./myfile/attendance-app-v7.js"></script>', 1)
    if 'attendance-app-v7.js' not in text:
        raise SystemExit("attendance V7 app replacement failed")
    text = re.sub(r'\n\s*<footer class="suite-footer">.*?</footer>', '', text, flags=re.S)
    path.write_text(text, encoding="utf-8")


def patch_runes() -> None:
    path = Path("public/runes.html")
    text = update_release(path.read_text(encoding="utf-8"))
    text = compact_hero(text, "魔女文字解读")
    text = insert_after(text, '  <link rel="stylesheet" href="./myfile/layout-v6.css">', '  <link rel="stylesheet" href="./myfile/suite-v7.css">', "runes V7 CSS")
    text = insert_after(text, '  <script src="./myfile/runes-app.js"></script>', '  <script src="./myfile/runes-template-v7.js"></script>', "runes V7 template")
    text = re.sub(r'\n\s*<footer class="suite-footer">.*?</footer>', '', text, flags=re.S)
    path.write_text(text, encoding="utf-8")


def patch_build_info() -> None:
    path = Path("public/build-info.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    value.update({
        "release": RELEASE,
        "rollbackBeforeStoryUiTranslationOcrV7": "rollback/pre-story-ui-translation-ocr-v7-20260816",
        "visitorCopyPolicy": "no-internal-project-instructions",
        "storyCategoryOrder": "original-upstream-order-then-static-extras",
        "storyCategoryHistoriaLabel": "魔法少女历史篇",
        "storyResultsLayout": "responsive-title-and-cast-cards",
        "storyLocalization": "reader-grounded-no-guessed-title-translation",
        "storyCharacterAttributes": True,
        "attendanceCharacterAttributes": True,
        "quickRail": "existing-root-plus-story-and-attendance",
        "runeOcrV7": "ordered-template-plus-classic-fallback",
    })
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_expected_release() -> None:
    files = [
        "public/__acceptance.html", "scripts/smoke-neo11-v3.mjs", "scripts/smoke-height-guide-v4.mjs",
        "scripts/smoke-integrated-tools-v5.mjs", "scripts/smoke-story-layout-v6.mjs", "scripts/smoke-ocr-v6.mjs",
    ]
    pattern = re.compile(r"const EXPECTED_RELEASE = '[^']+';")
    for filename in files:
        path = Path(filename)
        text = path.read_text(encoding="utf-8")
        text, count = pattern.subn(f"const EXPECTED_RELEASE = '{RELEASE}';", text, count=1)
        if count != 1:
            raise SystemExit(f"release constant missing: {filename}")
        path.write_text(text, encoding="utf-8")


def main() -> int:
    patch_root()
    patch_story()
    patch_attendance()
    patch_runes()
    patch_build_info()
    patch_expected_release()
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
