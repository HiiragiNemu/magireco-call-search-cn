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

MISSING_SCHOOLS = [
    ("春方此花学園", "春方此花学园"),
    ("湯国市立岩切山高等学校", "汤国市立岩切山高等学校"),
    ("湯国市立湯国学園", "汤国市立汤国学园"),
    ("湯国青波学園", "汤国青波学园"),
]

EXPECTED_ATTRIBUTE_LABELS = {
    "まどマギ": "魔法少女小圆",
    "マギレコ": "魔法纪录",
    "まどドラ": "Magia Exedra",
    "神浜市立大附属": "神滨市立大学附属学校",
    "水名女学園": "水名女子学园",
    "参京院教育学園": "参京院教育学园",
    "栄総合学園": "荣综合学园",
    "中央学園": "中央学园",
    "南凪自由学園": "南凪自由学园",
    "工匠学舎": "工匠学舍",
    "大東学院": "大东学院",
    "聖リリアンナ学園": "圣莉莉安娜学园",
    "神浜未来アカデミー": "神滨未来学院",
    "湯の花国際中学・高等学校": "汤之花国际中学・高等学校",
    "松宮市立第一中学校": "松宫市立第一中学",
    "霧峰村立霧峰中学校": "雾峰村立雾峰中学",
    "虎屋町学園": "虎屋町学园",
    "竜ケ崎学院": "龙崎学院",
    "蛇の宮中学・高等学校": "蛇之宫中学・高等学校",
    "宝崎順心学園": "宝崎顺心学园",
    "宝崎市立光塚中等教育学校": "宝崎市立光冢中等教育学校",
    "見滝原中学校": "见泷原中学",
    "白羽女学院": "白羽女学院",
    "あすなろ市立南部中学校": "翌桧市立南部中学",
    "茜ヶ咲中学校": "茜咲中学",
    "聖乙女学園": "圣乙女学园",
    **dict(MISSING_SCHOOLS),
}


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0 and new in text:
        return text
    if count != 1:
        raise SystemExit(f"{label}: expected one source occurrence, found {count}")
    return text.replace(old, new, 1)


def school_checkbox(japanese: str, chinese: str) -> str:
    return f"""
				<label class="at">
					<input type="checkbox" class="at_attribute" name="at_attribute"
						   onchange="magicalGirlAttributeSearch('call'); if (document.querySelector('input[name=xAxisMode]:checked')?.value === 'attribute') {{ displayHeightChart(document.querySelector('.MagicalChk:checked') ? 'selected' : 'global'); }}"
						   value="{japanese}">{chinese}
				</label>
"""


def add_missing_school_filters(text: str) -> str:
    missing = [(jp, zh) for jp, zh in MISSING_SCHOOLS if f'value="{jp}"' not in text]
    if not missing:
        return text
    organization_value = 'value="マギアユニオン"'
    value_index = text.find(organization_value)
    if value_index < 0:
        raise SystemExit("organization insertion anchor was not found")
    label_index = text.rfind('\n\t\t\t\t<label class="at">', 0, value_index)
    if label_index < 0:
        raise SystemExit("organization label start was not found")
    block = ''.join(school_checkbox(jp, zh) for jp, zh in missing)
    return text[:label_index] + block + text[label_index:]


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
    text = add_missing_school_filters(text)

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
    for japanese, chinese in MISSING_SCHOOLS:
        if text.count(f'value="{japanese}"') != 1 or chinese not in text:
            raise SystemExit(f"school filter was not integrated correctly: {japanese} -> {chinese}")
    if "ondblclick=" in text:
        raise SystemExit("inline double-click handlers remain in production index")
    if "三击图标可以筛选称呼/被称呼的对象" not in text:
        raise SystemExit("triple-tap production instruction is missing")
    if "<legend>三击筛选选项</legend>" not in text:
        raise SystemExit("triple-tap filter legend is missing")

    path.write_text(text, encoding="utf-8")


def update_height_school_definitions() -> None:
    path = PUBLIC / "myfile" / "site-correction-v2.js"
    text = path.read_text(encoding="utf-8")
    anchor = "    ['その他学校', '其他学校']"
    if anchor not in text:
        raise SystemExit("height-chart school-definition anchor was not found")
    additions = []
    for japanese, chinese in MISSING_SCHOOLS:
        row = f"    ['{japanese}', '{chinese}']"
        if row not in text:
            additions.append(row)
    if additions:
        text = text.replace(anchor, ",\n".join(additions) + ",\n" + anchor, 1)
    path.write_text(text, encoding="utf-8")


def update_call_table_translations() -> None:
    path = PUBLIC / "myfile" / "callTable.js"
    text = path.read_text(encoding="utf-8")
    replacements = {
        '栗栖亚历山德ラ': '栗栖亚历山德拉',
        'ベテラン (beteran / Veteran)': 'ベテラン (beteran / 老手)',
        'なぎたん (Nagitan / なぎたん)': 'なぎたん (Nagitan / 小十七夜)',
        'なぎたん先輩 (Nagitan-senpai / なぎたん前辈)': 'なぎたん先輩 (Nagitan-senpai / 小十七夜前辈)',
        'なぎたんさん (Nagitan-san / 小なぎ小姐【昵称】)': 'なぎたんさん (Nagitan-san / 小十七夜小姐【昵称】)',
        'なぎたん (Nagitan / 十七炭)': 'なぎたん (Nagitan / 小十七夜)',
        'なぎたん (Nagitan / 七夜碳)': 'なぎたん (Nagitan / 小十七夜)',
        'ちゃる (Charu / ちはる)': 'ちゃる (Charu / 千春)',
        'みたま (Mitama)': 'みたま (Mitama / 御魂)',
        'エミリー (Emily)': 'エミリー (Emily / 衣美里)',
        'ささら (Sasara)': 'ささら (Sasara / 纱纱罗)',
        'まどか (Madoka)': 'まどか (Madoka / 圆)',
        'ほむら (Homura)': 'ほむら (Homura / 焰)',
        'さやか (Sayaka)': 'さやか (Sayaka / 沙耶香)',
        'ひみか (Himika)': 'ひみか (Himika / 日美香)',
        'せいら (Seira)': 'せいら (Seira / 星罗)',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def update_audit_source() -> None:
    path = ROOT / "scripts" / "audit-translations-v5.py"
    text = path.read_text(encoding="utf-8")
    mapping = "EXPECTED_ATTRIBUTE_LABELS: dict[str, str] = " + json.dumps(
        EXPECTED_ATTRIBUTE_LABELS, ensure_ascii=False, indent=4
    )
    start = text.find("EXPECTED_ATTRIBUTE_LABELS: dict[str, str] = {")
    end = text.find("\n\nIMAGE_ALIASES", start)
    if start < 0 or end < 0:
        raise SystemExit("audit attribute mapping block was not found")
    text = text[:start] + mapping + text[end:]

    old_condition = (
        '                if target and target not in {"第一人称", "第二人称"}:\n'
        '                    canonical_target = canonical_display(target)'
    )
    new_condition = (
        '                if target and target not in {"年龄", "学年", "身高", "称呼倾向", "第一人称", "第二人称"}:\n'
        '                    canonical_target = canonical_display(target)'
    )
    if old_condition in text:
        text = text.replace(old_condition, new_condition, 1)
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
    update_height_school_definitions()
    update_call_table_translations()
    update_audit_source()
    write_redirects()
    update_build_info()
    update_release_marker(PUBLIC / "__acceptance.html")
    update_release_marker(ROOT / "scripts" / "smoke-neo11-v3.mjs")
    update_release_marker(ROOT / "scripts" / "smoke-height-guide-v4.mjs")
    update_call_filter_comment()
    print(json.dumps({"release": RELEASE, "state": "integrated"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
