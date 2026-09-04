#!/usr/bin/env python3
"""Build the editable parent-story checklist and override-only exact title map.

The static story snapshot remains the source of complete title keys. Human
editors change one parent title. Every child keeps its own episode/branch/end
suffix and spacing, then expands to an exact category + complete Japanese-title
mapping. Existing site localization is not replaced unless a parent override is
actually approved.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from cn_terminology import canonicalize_cn_visible

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "public/data/story-v6/manifest.json"
LOCALIZATION_PATH = ROOT / "public/data/story-v7/localization.json"
OVERRIDES_PATH = ROOT / "data/story-title-overrides.json"
GROUPS_PATH = ROOT / "public/data/story-title-groups-v1.json"
MAP_PATH = ROOT / "public/data/story-title-map.generated.json"
REPORT_PATH = ROOT / "public/data/story-title-build-report-v1.json"
DOWNLOAD_DIR = ROOT / "public/downloads"
DOWNLOAD_JSON = DOWNLOAD_DIR / "story-title-groups.json"
DOWNLOAD_CSV = DOWNLOAD_DIR / "story-title-groups.csv"
DOWNLOAD_OVERRIDES = DOWNLOAD_DIR / "story-title-overrides-template.json"
SUMMARY_MD = ROOT / "docs/story-title-groups-v1.md"

HTML_TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"[\s\u3000]+")
CATEGORY_PREFIX_RE = re.compile(
    r"^(?:活动|故事|特别故事|魔法少女历史篇|记忆结晶|主线|支线)\s*[:：]\s*",
    re.IGNORECASE,
)
EPISODE_RE_SOURCE = re.compile(r"(?:第\s*)?\d+\s*話", re.IGNORECASE)
EPISODE_RE_LOCAL = re.compile(r"(?:第\s*)?\d+\s*(?:话|話)", re.IGNORECASE)


# Additional trailing counters that represent episodes/chapters but do not use 話.
TRAILING_COUNTER_SOURCE_RE = re.compile(
    r"(?:"
    r"(?:DAY|NIGHT|SCENE|STAGE|SECTION|PHASE|PART|CHAPTER|EPISODE|ACT)\s*[.:#_-]?\s*(?:\d+(?:\.\d+)*|[IVXLC]+)"
    r"|第\s*\d+\s*(?:日目?|章|幕|部)"
    r"|\d+\s*(?:日目|章|幕)"
    r")\s*$",
    re.IGNORECASE,
)
TRAILING_COUNTER_LOCAL_RE = re.compile(
    r"(?:"
    r"(?:DAY|NIGHT|SCENE|STAGE|SECTION|PHASE|PART|CHAPTER|EPISODE|ACT)\s*[.:#_-]?\s*(?:\d+(?:\.\d+)*|[IVXLC]+)"
    r"|第\s*\d+\s*(?:天|日|章|幕|部)"
    r"|\d+\s*(?:天|日|章|幕)"
    r")\s*$",
    re.IGNORECASE,
)

STRUCTURAL_SOURCE = [
    r"百禍チャレンジクエスト", r"百禍チャレンジ", r"EXチャレンジクエスト",
    r"EXチャレンジ", r"チャレンジクエスト", r"チャレンジ",
    r"TRUE\s*END", r"BAD\s*END", r"END\s*No\.?\s*\d+",
    r"Record\s+[IVXLC]+(?:-\d+)?", r"Intermission", r"INTERMIS+ION",
    r"インターミッション", r"Epilogue", r"EPILOGUE", r"エピローグ",
    r"Prologue", r"PROLOGUE", r"プロローグ", r"終章", r"序章", r"序",
]
STRUCTURAL_LOCAL = [
    r"百禍挑战任务", r"百禍挑战", r"EX挑战任务", r"EX挑战", r"挑战任务", r"挑战",
    r"TRUE\s*END", r"BAD\s*END", r"END\s*No\.?\s*\d+",
    r"Record\s+[IVXLC]+(?:-\d+)?", r"Intermission", r"INTERMIS+ION", r"幕间",
    r"Epilogue", r"EPILOGUE", r"尾声", r"终章", r"Prologue", r"PROLOGUE",
    r"序章", r"序",
]
STRUCTURAL_SOURCE_RE = re.compile(r"(?:" + "|".join(STRUCTURAL_SOURCE) + r")\s*$", re.IGNORECASE)
STRUCTURAL_LOCAL_RE = re.compile(r"(?:" + "|".join(STRUCTURAL_LOCAL) + r")\s*$", re.IGNORECASE)
BARE_NUMBER_RE = re.compile(r"^(?P<base>.+?)(?P<joiner>[\s\u3000]+)(?P<number>\d+(?:\s*[（(][^()（）]*[)）])?)$")
STATUS_OPTIONS = {"待校对", "校对中", "已校对", "保留现状"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def text_from_markup(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<BR\s*/?>", " ", text, flags=re.IGNORECASE)
    text = HTML_TAG_RE.sub("", text)
    return SPACE_RE.sub(" ", html.unescape(text)).strip()


def strip_category_prefix(value: str) -> str:
    return CATEGORY_PREFIX_RE.sub("", value).strip()


def normalize_joiner(value: str) -> str:
    return " " if value else ""


@dataclass(frozen=True)
class SplitTitle:
    base: str
    suffix: str
    joiner: str
    rule: str


def split_title(value: str, localized: bool = False) -> SplitTitle:
    text = text_from_markup(value)
    if not text:
        return SplitTitle("", "", "", "empty")
    episode_re = EPISODE_RE_LOCAL if localized else EPISODE_RE_SOURCE
    for match in episode_re.finditer(text):
        raw_prefix = text[: match.start()]
        base = raw_prefix.rstrip()
        if base:
            joiner = normalize_joiner(raw_prefix[len(base):])
            return SplitTitle(base, text[match.start():].strip(), joiner, "episode")
    counter_re = TRAILING_COUNTER_LOCAL_RE if localized else TRAILING_COUNTER_SOURCE_RE
    match = counter_re.search(text)
    if match:
        raw_prefix = text[: match.start()]
        base = raw_prefix.rstrip()
        if base:
            joiner = normalize_joiner(raw_prefix[len(base):])
            return SplitTitle(base, text[match.start():].strip(), joiner, "counter")
    structural_re = STRUCTURAL_LOCAL_RE if localized else STRUCTURAL_SOURCE_RE
    match = structural_re.search(text)
    if match:
        raw_prefix = text[: match.start()]
        base = raw_prefix.rstrip()
        if base:
            joiner = normalize_joiner(raw_prefix[len(base):])
            return SplitTitle(base, text[match.start():].strip(), joiner, "structure")
    return SplitTitle(text, "", "", "singleton")


def localize_suffix(source_suffix: str) -> str:
    value = source_suffix.strip()
    replacements = [
        (r"話", "话"), (r"編", "篇"), (r"プロローグ", "序章"),
        (r"エピローグ", "尾声"), (r"インターミッション", "幕间"),
        (r"EXチャレンジクエスト", "EX挑战任务"),
        (r"百禍チャレンジクエスト", "百禍挑战任务"),
        (r"チャレンジクエスト", "挑战任务"), (r"EXチャレンジ", "EX挑战"),
        (r"百禍チャレンジ", "百禍挑战"), (r"チャレンジ", "挑战"),
    ]
    for old, new in replacements:
        value = re.sub(old, new, value, flags=re.IGNORECASE)
    return value


def category_slug(category: str, manifest_entry: dict[str, Any] | None) -> str:
    if manifest_entry and manifest_entry.get("slug"):
        return str(manifest_entry["slug"])
    return "category-" + hashlib.sha1(category.encode("utf-8")).hexdigest()[:8]


def stable_group_hash(category: str, source_base: str) -> str:
    payload = json.dumps(
        {"category": category, "source_base": source_base},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def child_set_hash(children: Iterable[dict[str, Any]]) -> str:
    payload = sorted((str(c["source_title"]), str(c.get("source_suffix", ""))) for c in children)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def longest_common_prefix(values: list[str]) -> str:
    if not values:
        return ""
    prefix = values[0]
    for value in values[1:]:
        limit = min(len(prefix), len(value))
        index = 0
        while index < limit and prefix[index] == value[index]:
            index += 1
        prefix = prefix[:index]
        if not prefix:
            break
    return prefix.rstrip()


def choose_localized_base(children: list[dict[str, Any]], source_base: str) -> str:
    candidates: list[str] = []
    for child in children:
        parsed = split_title(child["current_full_translation"], localized=True)
        candidate = strip_category_prefix(parsed.base)
        if candidate:
            candidates.append(candidate)
    counts = Counter(candidates)
    if counts:
        return max(counts.items(), key=lambda item: (item[1], len(item[0]), item[0]))[0]
    common = strip_category_prefix(longest_common_prefix([c["current_full_translation"] for c in children]))
    return common or source_base


def derive_localized_suffix(child: dict[str, Any], localized_base: str) -> tuple[str, str]:
    translated = child["current_full_translation"].strip()
    for candidate in (translated, strip_category_prefix(translated)):
        if localized_base and candidate.startswith(localized_base):
            remainder = candidate[len(localized_base):]
            return remainder.strip(), normalize_joiner(remainder[: len(remainder) - len(remainder.lstrip())])
    parsed = split_title(translated, localized=True)
    if parsed.suffix:
        return parsed.suffix, parsed.joiner
    return localize_suffix(child.get("source_suffix", "")), child.get("source_joiner", " ")


def compose(base: str, child: dict[str, Any]) -> str:
    suffix = str(child.get("localized_suffix", "")).strip()
    joiner = str(child.get("localized_joiner", " ")) if suffix else ""
    return f"{base}{joiner}{suffix}".strip()


def load_story_titles(manifest: dict[str, Any]) -> tuple[dict[str, Counter[str]], int]:
    titles: dict[str, Counter[str]] = defaultdict(Counter)
    total_rows = 0
    for entry in manifest.get("categories", []):
        category = str(entry.get("key", ""))
        path = ROOT / "public/data/story-v6" / str(entry.get("file", ""))
        data = load_json(path)
        rows = data.get("rows", [])
        if data.get("key") != category or not isinstance(rows, list):
            raise RuntimeError(f"Invalid story file: {path}")
        total_rows += len(rows)
        for row in rows:
            if isinstance(row, list) and row:
                title = text_from_markup(row[0])
                if title:
                    titles[category][title] += 1
    return titles, total_rows


def apply_bare_number_grouping(items: list[dict[str, Any]]) -> None:
    candidates: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        if item["source_suffix"]:
            continue
        match = BARE_NUMBER_RE.match(item["source_title"])
        if match:
            candidates[match.group("base").strip()].append(item)
    for base, matches in candidates.items():
        numbers = {BARE_NUMBER_RE.match(item["source_title"]).group("number") for item in matches}  # type: ignore[union-attr]
        if len(matches) < 2 or len(numbers) < 2:
            continue
        for item in matches:
            match = BARE_NUMBER_RE.match(item["source_title"])
            item["source_base"] = base
            item["source_suffix"] = match.group("number")  # type: ignore[union-attr]
            item["source_joiner"] = normalize_joiner(match.group("joiner"))  # type: ignore[union-attr]
            item["grouping_rule"] = "bare-number"


def build_groups() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    manifest = load_json(MANIFEST_PATH)
    localization = load_json(LOCALIZATION_PATH)
    story_titles, total_rows = load_story_titles(manifest)
    category_map = localization.get("titleByCategoryV10") or {}
    title_exact = localization.get("titleExact") or {}
    category_labels = localization.get("categoryLabels") or {}
    manifest_by_key = {entry["key"]: entry for entry in manifest.get("categories", [])}

    flat_items: list[dict[str, Any]] = []
    missing_localization: list[dict[str, str]] = []
    for category, counter in story_titles.items():
        pairs = category_map.get(category) if isinstance(category_map, dict) else None
        pairs = pairs if isinstance(pairs, dict) else {}
        for source_title, occurrences in sorted(counter.items()):
            translated = pairs.get(source_title) or title_exact.get(source_title) or source_title
            parsed = split_title(source_title, localized=False)
            if translated == source_title:
                missing_localization.append({"category": category, "source_title": source_title})
            flat_items.append({
                "category": category,
                "category_label": category_labels.get(category)
                or manifest_by_key.get(category, {}).get("label") or category,
                "source_title": source_title,
                "source_base": parsed.base,
                "source_suffix": parsed.suffix,
                "source_joiner": parsed.joiner,
                "grouping_rule": parsed.rule,
                "current_full_translation": canonicalize_cn_visible(text_from_markup(translated)),
                "occurrences": occurrences,
            })

    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in flat_items:
        by_category[item["category"]].append(item)
    for items in by_category.values():
        apply_bare_number_grouping(items)

    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for item in flat_items:
        grouped[(item["category"], item["source_base"])].append(item)

    overrides_data = load_json(OVERRIDES_PATH) if OVERRIDES_PATH.exists() else {"version": 1, "overrides": []}
    overrides_raw = overrides_data.get("overrides", []) if isinstance(overrides_data, dict) else []
    overrides_by_id: dict[str, dict[str, Any]] = {}
    for item in overrides_raw:
        if not isinstance(item, dict):
            continue
        group_id = str(item.get("group_id", "")).strip()
        if not group_id:
            continue
        if group_id in overrides_by_id:
            raise RuntimeError(f"Duplicate override group_id: {group_id}")
        overrides_by_id[group_id] = item

    groups: list[dict[str, Any]] = []
    seen_full_keys: set[tuple[str, str]] = set()
    for (category, source_base), items in sorted(grouped.items(), key=lambda pair: (pair[0][0], pair[0][1])):
        items.sort(key=lambda item: item["source_title"])
        localized_base = canonicalize_cn_visible(choose_localized_base(items, source_base))
        source_sha256 = stable_group_hash(category, source_base)
        slug = category_slug(category, manifest_by_key.get(category))
        group_id = f"{slug}:{source_sha256[:16]}"
        override = overrides_by_id.get(group_id, {})
        approved = canonicalize_cn_visible(
            str(override.get("approved_translation", "")).strip()
        )
        status = str(override.get("status", "已校对" if approved else "待校对"))
        if status not in STATUS_OPTIONS:
            status = "已校对" if approved else "待校对"

        children: list[dict[str, Any]] = []
        for item in items:
            full_key = (category, item["source_title"])
            if full_key in seen_full_keys:
                raise RuntimeError(f"Duplicate category/title key: {category} / {item['source_title']}")
            seen_full_keys.add(full_key)
            localized_suffix, localized_joiner = derive_localized_suffix(item, localized_base)
            children.append({
                "source_title": item["source_title"],
                "source_suffix": item["source_suffix"],
                "source_joiner": item["source_joiner"],
                "localized_suffix": localized_suffix,
                "localized_joiner": localized_joiner,
                "current_full_translation": item["current_full_translation"],
                "occurrences": item["occurrences"],
                "grouping_rule": item["grouping_rule"],
            })

        for key, expected in (("category", category), ("source_base", source_base), ("source_sha256", source_sha256)):
            if override.get(key) not in (None, "", expected):
                raise RuntimeError(f"Override {group_id} has stale {key}: {override.get(key)!r} != {expected!r}")

        groups.append({
            "group_id": group_id,
            "category": category,
            "category_label": items[0]["category_label"],
            "source_base": source_base,
            "current_translation": localized_base,
            "approved_translation": approved,
            "status": status,
            "note": str(override.get("note", "")),
            "source_sha256": source_sha256,
            "children_sha256": child_set_hash(children),
            "child_count": len(children),
            "occurrence_count": sum(child["occurrences"] for child in children),
            "grouping_rules": sorted({child["grouping_rule"] for child in children}),
            "children": children,
        })

    known_ids = {group["group_id"] for group in groups}
    unknown_overrides = sorted(set(overrides_by_id) - known_ids)
    if unknown_overrides:
        raise RuntimeError("Overrides reference missing groups: " + ", ".join(unknown_overrides[:20]))

    generated_at = utc_now()
    category_summary = []
    for category in [entry["key"] for entry in manifest.get("categories", [])]:
        category_groups = [group for group in groups if group["category"] == category]
        category_summary.append({
            "category": category,
            "category_label": category_labels.get(category)
            or manifest_by_key.get(category, {}).get("label") or category,
            "group_count": len(category_groups),
            "child_title_count": sum(group["child_count"] for group in category_groups),
            "row_count": sum(group["occurrence_count"] for group in category_groups),
            "approved_group_count": sum(bool(group["approved_translation"]) for group in category_groups),
        })

    groups_data = {
        "release": "story-title-groups-v1-20260818",
        "version": 1,
        "generatedAt": generated_at,
        "source": {
            "manifest": str(MANIFEST_PATH.relative_to(ROOT)),
            "localization": str(LOCALIZATION_PATH.relative_to(ROOT)),
            "overrides": str(OVERRIDES_PATH.relative_to(ROOT)),
        },
        "summary": {
            "totalRows": total_rows,
            "uniqueCategoryTitlePairs": len(flat_items),
            "groupCount": len(groups),
            "collapsedGroupCount": sum(group["child_count"] > 1 for group in groups),
            "approvedGroupCount": sum(bool(group["approved_translation"]) for group in groups),
            "missingLocalizationCount": len(missing_localization),
            "categories": category_summary,
        },
        "groups": groups,
    }

    title_by_category: dict[str, dict[str, str]] = defaultdict(dict)
    override_groups = 0
    override_children = 0
    for group in groups:
        approved = group["approved_translation"].strip()
        if not approved:
            continue
        override_groups += 1
        for child in group["children"]:
            title_by_category[group["category"]][child["source_title"]] = compose(approved, child)
            override_children += 1

    exact_map = {
        "release": "story-title-map-v1-20260818",
        "version": 1,
        "generatedAt": generated_at,
        "overrideGroupCount": override_groups,
        "overrideChildTitleCount": override_children,
        "titleByCategory": dict(title_by_category),
    }

    aquarium = next((group for group in groups if group["category"] == "イベント" and group["source_base"] == "ウワサアクアリウムへようこそ"), None)
    if not aquarium or aquarium["child_count"] < 10:
        raise RuntimeError("Acceptance group missing: イベント / ウワサアクアリウムへようこそ")

    report = {
        "release": "story-title-build-report-v1-20260818",
        "version": 1,
        "generatedAt": generated_at,
        "state": "pass",
        "checks": {
            "manifestRows": total_rows,
            "manifestExpectedRows": manifest.get("totalRows"),
            "uniqueCategoryTitlePairs": len(flat_items),
            "exactUniqueKeys": len(seen_full_keys),
            "groupCount": len(groups),
            "childCount": sum(group["child_count"] for group in groups),
            "collapsedGroupCount": groups_data["summary"]["collapsedGroupCount"],
            "approvedGroupCount": override_groups,
            "approvedChildCount": override_children,
            "missingLocalizationCount": len(missing_localization),
            "aquariumChildCount": aquarium["child_count"],
            "aquariumHasEpisode5": any(child["source_title"].endswith("5話") for child in aquarium["children"]),
        },
        "missingLocalizationSample": missing_localization[:100],
    }

    if manifest.get("totalRows") not in (None, total_rows):
        raise RuntimeError(f"Manifest row count mismatch: {total_rows} != {manifest.get('totalRows')}")
    if len(seen_full_keys) != len(flat_items):
        raise RuntimeError("Not every category/title pair was represented exactly once")
    return groups_data, exact_map, report


def write_csv(groups_data: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    headers = [
        "group_id", "分类", "分类中文", "日文母故事名", "网站显示文本",
        "子剧情数量", "出现次数", "source_sha256", "children_sha256",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=headers,
            extrasaction="ignore",
            lineterminator="\n",
        )
        writer.writeheader()
        for group in groups_data["groups"]:
            writer.writerow({
                "group_id": group["group_id"],
                "分类": group["category"],
                "分类中文": group["category_label"],
                "日文母故事名": group["source_base"],
                "网站显示文本": group["approved_translation"] or group["current_translation"],
                "子剧情数量": group["child_count"],
                "出现次数": group["occurrence_count"],
                "source_sha256": group["source_sha256"],
                "children_sha256": group["children_sha256"],
            })


def write_summary(groups_data: dict[str, Any], report: dict[str, Any]) -> None:
    summary = groups_data["summary"]
    lines = [
        "# 母故事标题翻译清单 V1", "",
        f"- 生成时间：`{groups_data['generatedAt']}`",
        f"- 底层故事记录：**{summary['totalRows']:,}**",
        f"- 分类＋完整原题：**{summary['uniqueCategoryTitlePairs']:,}**",
        f"- 母故事组：**{summary['groupCount']:,}**",
        f"- 具有多个子剧情的母故事：**{summary['collapsedGroupCount']:,}**",
        f"- 已填写永久覆盖：**{summary['approvedGroupCount']:,}**", "",
        "## 工作流", "",
        "1. 打开 `/story-title-editor.html`；公开查看与下载基准 JSON/CSV 不需要密码。",
        "2. 管理员输入密码解锁后，只修改“校对后母故事译名”“状态”“备注”。",
        "3. 可点击“生成并下载完整 XLSX”，离线校对后再导入页面实测。",
        "4. 导出覆盖 JSON，写入 `data/story-title-overrides.json`。",
        "5. 构建器只为已填写覆盖的母故事生成精确映射；未填写项继续使用网站原有本地化。", "",
        "## 分类统计", "",
        "| 分类 | 中文 | 母故事 | 子剧情标题 | 底层记录 | 已校对 |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for item in summary["categories"]:
        lines.append(
            f"| {item['category']} | {item['category_label']} | {item['group_count']} | "
            f"{item['child_title_count']} | {item['row_count']} | {item['approved_group_count']} |"
        )
    lines += ["", "## 构建校验", "", "```json", json.dumps(report["checks"], ensure_ascii=False, indent=2), "```", ""]
    SUMMARY_MD.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Build and validate without writing outputs")
    args = parser.parse_args()
    groups_data, exact_map, report = build_groups()
    print(json.dumps(report["checks"], ensure_ascii=False, indent=2))
    if args.check:
        return 0
    write_json(GROUPS_PATH, groups_data)
    write_json(MAP_PATH, exact_map)
    write_json(REPORT_PATH, report)
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(GROUPS_PATH, DOWNLOAD_JSON)
    write_csv(groups_data, DOWNLOAD_CSV)
    write_json(DOWNLOAD_OVERRIDES, load_json(OVERRIDES_PATH) if OVERRIDES_PATH.exists() else {"version": 1, "overrides": []})
    write_summary(groups_data, report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
