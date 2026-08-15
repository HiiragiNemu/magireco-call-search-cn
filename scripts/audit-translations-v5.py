#!/usr/bin/env python3
"""Generate the shared character catalog and audit translation/mapping consistency.

This is a static, one-time/manual build step. It does not sync upstream data.
"""
from __future__ import annotations

import html
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "index.html"
CHARA_AT = PUBLIC / "myfile" / "charaAt.js"
CALL_TABLE = PUBLIC / "myfile" / "callTable.js"
NAMELIST = PUBLIC / "myfile" / "NAMELIST.txt"
CATALOG_OUT = PUBLIC / "data" / "character-catalog.json"
AUDIT_JSON = PUBLIC / "data" / "translation-audit-v5.json"
AUDIT_MD = ROOT / "docs" / "translation-audit-v5.md"

ALIASES: dict[str, list[str]] = {
    "环彩羽": ["环伊吕波"],
    "常盘七香": ["常盘七夏"],
    "万年樱之谣": ["万年樱的传闻"],
    "早乙女和子": ["早乙女老师", "早乙女先生"],
    "名小姐": ["名字", "ナマエ"],
    "水树垒": ["水树塁", "水樹塁"],
    "晓美焰-眼镜ver": ["晓美焰(眼镜ver)", "晓美焰(眼镜ver.)"],
}

EXPECTED_ATTRIBUTE_LABELS: dict[str, str] = {
    "まどマギ": "魔法少女小圆",
    "マギレコ": "魔法纪录",
    "まどドラ": "Magia Exedra",
    "神浜市立大学附属学校": "神滨市立大学附属学校",
    "水名女子学園": "水名女子学园",
    "参京院教育学園": "参京院教育学园",
    "栄総合学園": "荣综合学园",
    "中央学園": "中央学园",
    "南凪自由学園": "南凪自由学园",
    "工匠学舎": "工匠学舍",
    "大東学院": "大东学院",
    "至聖女学院": "至圣女学院",
    "白羽女学院": "白羽女子学院",
    "松宮市立第一中学校": "松宫市立第一中学",
    "霧峰村立霧峰中学校": "雾峰村立雾峰中学",
    "虎屋町学園": "虎屋町学园",
    "竜ケ崎学院": "龙崎学院",
    "あすなろ市立南部中学校": "翌桧市立南部中学",
    "茜ヶ咲中学校": "茜咲中学",
    "聖乙女学園": "圣乙女学园",
    "蛇之宮中学・高等学校": "蛇之宫中学・高等学校",
    "宝崎順心学園": "宝崎顺心学园",
    "宝崎市立光塚中等教育学校": "宝崎市立光冢中等教育学校",
    "見滝原中学校": "见泷原中学",
}

IMAGE_ALIASES = {
    "晓美焰(眼镜ver)": "晓美焰-眼镜ver",
    "晓美焰(眼镜ver.)": "晓美焰-眼镜ver",
    "名字": "名小姐",
    "水树塁": "水树垒",
}


def strip_tags(value: str) -> str:
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def attrs(tag: str) -> dict[str, str]:
    return {
        key.lower(): html.unescape(value)
        for key, _quote, value in re.findall(r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", tag, flags=re.S)
    }


def canonical_display(value: str) -> str:
    value = value.strip()
    for display, aliases in ALIASES.items():
        if value == display or value in aliases:
            return display
    return value


def image_name(value: str) -> str:
    value = canonical_display(value)
    return IMAGE_ALIASES.get(value, value)


def parse_catalog(index_text: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen_jp: set[str] = set()
    label_pattern = re.compile(r"<label\b(?P<attrs>[^>]*)>(?P<body>[\s\S]*?)</label>", re.I)
    for match in label_pattern.finditer(index_text):
        label_attrs = attrs("<label " + match.group("attrs") + ">")
        classes = label_attrs.get("class", "").split()
        if "girlbox" not in classes:
            continue
        body = match.group("body")
        input_match = re.search(r"<input\b[^>]*\bname=[\"']chara[\"'][^>]*>", body, flags=re.I)
        if not input_match:
            continue
        input_attrs = attrs(input_match.group(0))
        jp = input_attrs.get("id", "").strip()
        full_value = input_attrs.get("value", "").strip()
        if not jp or jp in seen_jp:
            continue
        seen_jp.add(jp)

        triple = re.match(r"^(.*?)\s*\((.*?)\s*/\s*(.*?)\)\s*$", full_value)
        if triple:
            zh, jp_from_value, roman = (part.strip() for part in triple.groups())
            if jp_from_value and jp_from_value != jp:
                jp_from_value = jp
        else:
            zh, roman = strip_tags(body).replace("★", "").strip(), ""
        zh = canonical_display(zh)
        display_text = strip_tags(body)
        star = "★" in display_text
        aliases = list(ALIASES.get(zh, []))
        output.append({
            "zh": zh,
            "jp": jp,
            "roman": roman,
            "kana": label_attrs.get("data-kana", "").strip(),
            "image": image_name(zh),
            "star": star,
            "classes": classes,
            "aliases": aliases,
        })
    return output


def parse_checkbox_labels(index_text: str) -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = defaultdict(list)
    for match in re.finditer(r"<label\b[^>]*>([\s\S]*?)</label>", index_text, flags=re.I):
        body = match.group(1)
        input_match = re.search(r"<input\b[^>]*\btype=[\"']checkbox[\"'][^>]*>", body, flags=re.I)
        if not input_match:
            continue
        input_attrs = attrs(input_match.group(0))
        value = input_attrs.get("value", "").strip()
        if not value:
            continue
        label = strip_tags(body[input_match.end():]).strip()
        if label and label not in mapping[value]:
            mapping[value].append(label)
    return mapping


def evaluate_call_table() -> list[dict[str, Any]]:
    node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const context = { Map, Set, console };
vm.createContext(context);
vm.runInContext(source + '\n;globalThis.__callTable = callTable;', context, { timeout: 10000 });
function flatten(value, path = []) {
  const out = [];
  if (value instanceof Map) {
    for (const [key, child] of value.entries()) out.push(...flatten(child, path.concat(String(key))));
  } else if (value instanceof Set) {
    for (const child of value.values()) out.push({ path, value: String(child) });
  } else if (Array.isArray(value)) {
    value.forEach((child, index) => out.push(...flatten(child, path.concat(String(index)))));
  } else if (value != null) out.push({ path, value: String(value) });
  return out;
}
const result = [];
for (const [caller, value] of context.__callTable.entries()) {
  result.push({ caller: String(caller), entries: flatten(value) });
}
process.stdout.write(JSON.stringify(result));
"""
    completed = subprocess.run(
        ["node", "-e", node_script, str(CALL_TABLE)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def main() -> None:
    index_text = INDEX.read_text(encoding="utf-8")
    catalog = parse_catalog(index_text)
    if len(catalog) < 180:
        raise SystemExit(f"角色目录解析失败：仅得到 {len(catalog)} 名角色。")

    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    hard_errors: list[str] = []
    warnings: list[str] = []
    jp_counts = Counter(item["jp"] for item in catalog)
    zh_counts = Counter(item["zh"] for item in catalog)
    duplicate_jp = sorted(key for key, count in jp_counts.items() if count > 1)
    duplicate_zh = sorted(key for key, count in zh_counts.items() if count > 1)
    if duplicate_jp:
        hard_errors.append("重复日文角色键：" + "、".join(duplicate_jp))
    if duplicate_zh:
        warnings.append("重复中文显示名（可能是不同版本或资料重复）：" + "、".join(duplicate_zh))

    by_jp = {item["jp"]: item for item in catalog}
    by_zh = {item["zh"]: item for item in catalog}
    alias_to_display = {
        alias: display
        for display, aliases in ALIASES.items()
        for alias in [display, *aliases]
    }

    for required in [
        ("環いろは", "环彩羽"),
        ("常盤ななか", "常盘七香"),
        ("万年桜のウワサ", "万年樱之谣"),
        ("早乙女和子", "早乙女和子"),
    ]:
        item = by_jp.get(required[0]) or by_zh.get(required[0])
        if not item or item["zh"] != required[1]:
            hard_errors.append(f"唯一显示名不符合要求：{required[0]} → {required[1]}")

    if "早乙女老师" in index_text or "早乙女老师" in NAMELIST.read_text(encoding="utf-8"):
        hard_errors.append("生产界面或名单仍暴露‘早乙女老师’。")
    if 'value="まどドラ">小圆前辈' in index_text:
        hard_errors.append("作品归属仍把‘まどドラ’错误显示为‘小圆前辈’。")
    if 'value="まどドラ">Magia Exedra' not in index_text:
        hard_errors.append("未找到正确的‘まどドラ → Magia Exedra’生产标签。")
    if 'attr.includes("学院")' in index_text or 'includes("学院")' in (PUBLIC / "myfile" / "grade-classification.js").read_text(encoding="utf-8"):
        hard_errors.append("仍存在‘学院名称推断高中生’的启发式规则。")

    checkbox_labels = parse_checkbox_labels(index_text)
    attribute_rows: list[dict[str, Any]] = []
    for key, expected in EXPECTED_ATTRIBUTE_LABELS.items():
        labels = checkbox_labels.get(key, [])
        status = "ok" if expected in labels else "missing-or-mismatch"
        attribute_rows.append({"key": key, "expected": expected, "actual": labels, "status": status})
        if status != "ok":
            hard_errors.append(f"属性翻译不匹配：{key} 应为 {expected}，实际 {labels or '未找到'}")

    chara_at_text = CHARA_AT.read_text(encoding="utf-8")
    school_tokens = sorted({
        token for token in re.findall(r"['\"]([^'\"]+)['\"]", chara_at_text)
        if re.search(r"学校|学園|学院|中学|高校|学舎|大学", token)
    })
    unmapped_school_tokens = [token for token in school_tokens if token not in checkbox_labels]
    if unmapped_school_tokens:
        warnings.append("属性数据中存在未作为可见筛选项展示的学校键：" + "、".join(unmapped_school_tokens))

    call_records = evaluate_call_table()
    call_caller_unmapped: list[str] = []
    relation_target_unmapped: Counter[str] = Counter()
    japanese_without_chinese: list[dict[str, str]] = []
    relation_leaf_count = 0
    known_names = set(by_zh) | set(by_jp) | set(alias_to_display)

    for record in call_records:
        caller = record["caller"]
        caller_zh = caller.split(" (", 1)[0].strip()
        if canonical_display(caller_zh) not in by_zh and caller_zh not in known_names:
            call_caller_unmapped.append(caller)
        for entry in record.get("entries", []):
            relation_leaf_count += 1
            path = [str(part) for part in entry.get("path", [])]
            if path:
                target = path[-1].split("→", 1)[0].strip()
                if target and target not in {"第一人称", "第二人称"}:
                    canonical_target = canonical_display(target)
                    if canonical_target not in by_zh and target not in known_names and not re.fullmatch(r"[A-Za-z0-9 .·・\-]+", target):
                        relation_target_unmapped[target] += 1
            value = str(entry.get("value", ""))
            if re.search(r"[ぁ-ゟ゠-ヿ]", value) and not re.search(r"[\u4e00-\u9fff]", value):
                if len(japanese_without_chinese) < 80:
                    japanese_without_chinese.append({"caller": caller, "value": value})

    if call_caller_unmapped:
        warnings.append(f"称呼表中 {len(call_caller_unmapped)} 个主键未直接映射到当前角色目录，通常是非可选配角或旧名。")
    if relation_target_unmapped:
        warnings.append(f"称呼目标中 {len(relation_target_unmapped)} 个名称未直接映射到当前可选角色目录，已列入人工复核清单。")
    if japanese_without_chinese:
        warnings.append(f"发现 {len(japanese_without_chinese)} 条候选‘仅日文、无明显中文释义’叶值；需逐条判断是否本来就是专名。")

    report = {
        "release": "integrated-tools-v5-20260816",
        "catalogCount": len(catalog),
        "uniqueJapaneseKeys": len(jp_counts),
        "uniqueChineseDisplayNames": len(zh_counts),
        "callTableCallerCount": len(call_records),
        "callTableLeafCount": relation_leaf_count,
        "hardErrors": hard_errors,
        "warnings": warnings,
        "duplicateJapaneseKeys": duplicate_jp,
        "duplicateChineseNames": duplicate_zh,
        "attributeTranslations": attribute_rows,
        "schoolAttributeKeys": school_tokens,
        "unmappedSchoolAttributeKeys": unmapped_school_tokens,
        "unmappedCallers": call_caller_unmapped[:200],
        "unmappedRelationTargets": relation_target_unmapped.most_common(200),
        "candidateJapaneseOnlyCallValues": japanese_without_chinese,
        "displayNamePolicy": {
            "環いろは": "环彩羽",
            "常盤ななか": "常盘七香",
            "万年桜のウワサ": "万年樱之谣",
            "早乙女先生": "早乙女和子",
        },
        "scopeNote": "结构审计可以证明键、标签、角色目录和关系目标是否可映射；称呼措辞的语用准确性仍需结合剧情语境进行人工逐条复核。",
    }

    AUDIT_JSON.parent.mkdir(parents=True, exist_ok=True)
    AUDIT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# 网站翻译与映射审计（V5）",
        "",
        f"- 角色目录：**{len(catalog)}** 条；日文规范键 **{len(jp_counts)}** 个；中文显示名 **{len(zh_counts)}** 个。",
        f"- 称呼表主记录：**{len(call_records)}** 个；关系叶值：**{relation_leaf_count}** 条。",
        f"- 硬错误：**{len(hard_errors)}**；需人工复核项：**{len(warnings)}**。",
        "- 显示名政策：`环彩羽`、`常盘七香`、`万年樱之谣`、`早乙女和子`为唯一界面显示名；其他译名仅作为搜索兼容别名。",
        "- 年级政策：不再根据‘学院/学园’文字推断高中；仅使用明确数据和人工覆盖表。",
        "",
        "## 属性和学校翻译",
        "",
        "| 日文键 | 预期中文 | 实际标签 | 状态 |",
        "|---|---|---|---|",
    ]
    for row in attribute_rows:
        actual = " / ".join(row["actual"]) if row["actual"] else "未找到"
        lines.append(f"| `{row['key']}` | {row['expected']} | {actual} | {row['status']} |")

    lines += ["", "## 硬错误", ""]
    lines += [f"- {item}" for item in hard_errors] or ["- 未发现。"]
    lines += ["", "## 仍需人工复核的风险", ""]
    lines += [f"- {item}" for item in warnings] or ["- 未发现。"]
    lines += [
        "",
        "## 审计边界",
        "",
        "本报告对角色键、称呼表键、称呼目标、作品/学校标签、唯一显示名和年级规则执行结构化检查。它不会把缺少剧情上下文的称呼措辞自动判定为正确；候选问题已写入 `public/data/translation-audit-v5.json`，便于后续逐条人工审校。",
        "",
    ]
    AUDIT_MD.parent.mkdir(parents=True, exist_ok=True)
    AUDIT_MD.write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps({
        "catalog": len(catalog),
        "callers": len(call_records),
        "relations": relation_leaf_count,
        "hardErrors": len(hard_errors),
        "warnings": len(warnings),
    }, ensure_ascii=False))
    if hard_errors:
        raise SystemExit("翻译审计发现硬错误：\n- " + "\n- ".join(hard_errors))


if __name__ == "__main__":
    main()
