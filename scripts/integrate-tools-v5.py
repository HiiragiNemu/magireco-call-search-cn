#!/usr/bin/env python3
"""Integrate the Chinese tool suite into the static production tree.

This script is intentionally idempotent and is executed only by the one-time
release workflow. It does not perform recurring upstream synchronization.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
RELEASE = "integrated-tools-v5-20260816"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0 and new in text:
        return text
    if count != 1:
        raise SystemExit(f"{label}: expected one source occurrence, found {count}")
    return text.replace(old, new, 1)


def update_root_index() -> None:
    path = PUBLIC / "index.html"
    text = path.read_text(encoding="utf-8")

    css_anchor = '\t<link rel="stylesheet" href="./myfile/site-correction-v4.css">'
    css_ref = '\t<link rel="stylesheet" href="./myfile/tools-suite.css">'
    if css_ref not in text:
        text = replace_once(text, css_anchor, css_anchor + "\n" + css_ref, "V5 CSS anchor")

    text, replaced = re.subn(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)
    if replaced != 1:
        raise SystemExit("production build marker was not updated exactly once")

    text = re.sub(r'\s+ondblclick="mgirlCallNarrow\(this\)"', "", text)
    text = text.replace(
        "双击图标可以筛选称呼/被称呼的对象。",
        "三击图标可以筛选称呼/被称呼的对象。单击仍用于选择角色。",
    )
    text = text.replace("<legend>双击选项</legend>", "<legend>三击筛选选项</legend>")

    old_ocr = '<li><a href="https://magireco-chara-search.vercel.app/mdkOCR/index.html">魔女文字解读工具</a></li>'
    new_tools = (
        '<li><a href="./story.html">角色故事搜索</a></li>\n'
        '\t\t\t\t<li><a href="./attendance.html">共同出场次数排行</a></li>\n'
        '\t\t\t\t<li><a href="./runes.html">魔女文字解读工具</a></li>'
    )
    if old_ocr in text:
        text = text.replace(old_ocr, new_tools, 1)
    elif './story.html' not in text or './attendance.html' not in text or './runes.html' not in text:
        raise SystemExit("external OCR menu entry was not found and internal tools are incomplete")

    script_block = (
        '\n<script src="./myfile/tools-suite.js"></script>\n'
        '<script>\n'
        "  if (window.MagiTools) window.MagiTools.renderNav('calls');\n"
        '</script>\n'
        '<script src="./myfile/triple-tap-filter.js"></script>\n'
    )
    if 'triple-tap-filter.js' not in text:
        text = replace_once(text, "</body>", script_block + "</body>", "closing body")

    required_once = [
        './myfile/tools-suite.css',
        './myfile/tools-suite.js',
        './myfile/triple-tap-filter.js',
        './story.html',
        './attendance.html',
        './runes.html',
    ]
    for ref in required_once:
        if text.count(ref) != 1:
            raise SystemExit(f"expected exactly one production reference for {ref}, found {text.count(ref)}")
    if "ondblclick=" in text:
        raise SystemExit("inline double-click handlers remain in production index")
    if "三击图标可以筛选称呼/被称呼的对象" not in text:
        raise SystemExit("triple-tap production instruction is missing")
    if "<legend>三击筛选选项</legend>" not in text:
        raise SystemExit("triple-tap filter legend is missing")

    path.write_text(text, encoding="utf-8")


def write_redirects() -> None:
    redirects = {
        PUBLIC / "cnt.html": ("共同出场次数排行", "./attendance.html"),
        PUBLIC / "index_png.html": ("角色故事搜索", "./story.html"),
        PUBLIC / "mdkOCR" / "index.html": ("魔女文字解读", "../runes.html"),
    }
    for path, (title, target) in redirects.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        target_json = json.dumps(target, ensure_ascii=False)
        path.write_text(
            "<!DOCTYPE html>\n"
            '<html lang="zh-CN"><head><meta charset="UTF-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            f"<title>{title}</title>"
            f'<meta http-equiv="refresh" content="0;url={target}">\n'
            f'<link rel="canonical" href="{target}"></head>\n'
            f'<body><p>正在前往<a href="{target}">{title}</a>…</p>'
            f"<script>location.replace({target_json});</script></body></html>\n",
            encoding="utf-8",
        )


def update_build_info() -> None:
    path = PUBLIC / "build-info.json"
    info = json.loads(path.read_text(encoding="utf-8"))
    info.update(
        {
            "release": RELEASE,
            "rollbackBeforeIntegratedToolsV5": "rollback/pre-integrated-tools-v5-20260816",
            "integratedTools": [
                "calls-height",
                "story-search",
                "attendance-ranking",
                "witch-rune-ocr",
            ],
            "interactionFilterGesture": "triple-tap-or-triple-click",
            "updateMode": "manual-static-only",
            "ocrDataMode": "local-traineddata-browser-only",
            "translationAudit": "public/data/translation-audit-v5.json",
        }
    )
    path.write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_release_marker(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(
        r"const EXPECTED_RELEASE = '[^']+';",
        f"const EXPECTED_RELEASE = '{RELEASE}';",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit(f"release marker was not updated in {path}")
    path.write_text(text, encoding="utf-8")


def update_call_filter_comment() -> None:
    path = PUBLIC / "myfile" / "mgirlCallNarrow.js"
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "// Double-click filtering based on outgoing and incoming call relationships.",
        "// Triple-tap/click filtering based on outgoing and incoming call relationships.",
        1,
    )
    path.write_text(text, encoding="utf-8")


def main() -> None:
    update_root_index()
    write_redirects()
    update_build_info()
    update_release_marker(PUBLIC / "__acceptance.html")
    update_release_marker(ROOT / "scripts" / "smoke-neo11-v3.mjs")
    update_release_marker(ROOT / "scripts" / "smoke-height-guide-v4.mjs")
    update_call_filter_comment()
    print(json.dumps({"release": RELEASE, "state": "integrated"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
