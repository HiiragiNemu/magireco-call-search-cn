#!/usr/bin/env python3
"""Build conservative Call title -> MagiReader route evidence.

Only exact identities are emitted.  The generator deliberately leaves a title
unlinked when a rerun, shard, section number, or Reader target is ambiguous.
It does not use summary text, cast overlap, edit distance, or fuzzy matching.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = ROOT / "public" / "data" / "story-v6"
CATALOG_PATH = CATALOG_ROOT / "manifest.json"
GROUPS_PATH = ROOT / "public" / "data" / "story-title-groups-v1.json"
PROVENANCE_PATH = ROOT / "data" / "titles" / "authority-provenance.json"
LOCALIZATION_PATH = ROOT / "public" / "data" / "story-v7" / "localization.json"

NON_STORY_SLUGS = {"memoria", "sticker", "ed-1", "ed-2"}
OUTSIDE_READER_SLUGS = {"anime-1", "anime-2", "anime-final"}
BASE_AIO_SLUGS = {"character", "main-1", "main-2", "another-1", "another-2"}

PUELLA_EVENT_PREFIXES = {
    "神浜の戦神子編": "5183",
    "アレクサンドリアの蜃気楼編": "5186",
    "ヴィークのワルキューレ編": "5190",
    "チベットのラクシャーシー編": "5191",
    "邪馬台国の跡目編": "5194",
    "パクス・ロマーナの恋人編": "5196",
}

# These are exact story identities, not translated-title guesses.  The numeric
# prefix is the Reader folder/source identity and is stable across its shards.
SPECIAL_PARENT_PREFIXES = {
    "主役はいつだって私！": "6017",
    "みかづき荘の平和な1日": "6019",
    "女神様と不思議なレコード": "6023",
    "愉快なハロウィンへご招待！": "6039",
    "双子サンタのイリュージョン": "6046",
    "新春ラッキードリーム": "6049",
    "行かないでバレンタイン": "6051",
    "ホリデーにゃぷらいず！": "6061",
    "イチカレーと10辛級のクライシス": "6062",
    "環になって神浜": "6063",
    "笑顔の？ハロウィンライブショー！": "6084",
    "筆染め掲げる今年の抱負！": "6091",
    "素直になれない14日": "6107",
    "ウォーミングバレンタイン": "6112",
    "楽しい手作りひな祭り": "6117",
    "ミラーズインタビュー": "6132",
    "ことし1番のあったかい日": "6157",
    "センチメンタルを見つめて": "6168",
    "笑顔をお届け!トナカイサンタ!": "6175",
    "それぞれの福袋ドリーム": "6184",
    "神浜チョコレートガールズ": "6189",
    "神浜KAWAIIコレクション": "6190",
    "海は時をつないで": "6236",
    "女神様と見守るレコード": "6244",
    "お月見はゆらねむパジャマパーティー": "6251",
    "正直になりたい神楽燦": "6264",
    "メリークリスマスはみんなの手に": "6266",
    "新春！もちもちお餅大会！": "6275",
    "想いを包んでバレンタイン！": "6281",
    "極彩色のキセキ": "6319",
    "サンタクロースには涙を見せない": "6341",
    "新たな年の風を感じて": "6347",
    "ドキドキ!パレンタインデイズ": "6354",
    "レジストする者たちに祝福を": "6412",
    "大凶は雪解けの予感": "6418",
    "ちょこっと伝える「ありがとう」": "6426",
    "心は一年一万年": "6463",
}

SPECIAL_FULL_TITLE_PREFIXES = {
    "未来への装関関係 1話 お姉さまとの現在地": "6444",
    "未来への装関関係 1話 楽しい夕べに": "6452",
    "未来への装関関係 1話 絵から物語る": "6460",
}


class EvidenceBuildError(RuntimeError):
    pass


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def plain_title(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return html.unescape(re.sub(r"<[^>]*>", "", value)).strip()


def exact_key(value: Any) -> str:
    return unicodedata.normalize("NFKC", plain_title(value)).strip()


def identity(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.replace("話", "话").replace("臺", "台").replace("黃", "黄")
    return "".join(char for char in text if char.isalnum())


def folder_prefix(folder: str) -> str:
    match = re.match(r"^(\d+)", folder)
    return match.group(1) if match else ""


def folder_title(folder: str) -> str:
    return re.sub(r"^\s*\d+(?:-\d+)?\s*-\s*", "", folder).strip()


def source_part(section: str) -> str:
    return section.split(" Section ", 1)[0]


def section_number(section: str) -> int | None:
    match = re.search(r"\sSection\s+(\d+)\b", section, re.IGNORECASE)
    return int(match.group(1)) if match else None


def section_label(section: str) -> str:
    return section.split(" : ", 1)[1].strip() if " : " in section else ""


def git_revision(path: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout.strip()


def nested_equivalent(entries: Iterable[dict[str, Any]]) -> dict[str, Any] | None:
    values = list(entries)
    if not values:
        return None
    if len({entry["category"] for entry in values}) != 1:
        return None
    if len({entry["folder"] for entry in values}) != 1:
        return None
    selected = max(values, key=lambda entry: len(entry["sections"]))
    selected_sections = set(selected["sections"])
    if any(not set(entry["sections"]).issubset(selected_sections) for entry in values):
        return None
    return selected


class ReaderCatalog:
    def __init__(self, entries: list[dict[str, Any]]) -> None:
        self.entries = [entry for entry in entries if entry.get("sections")]
        self.by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.by_folder: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.by_raw: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for entry in self.entries:
            self.by_category[str(entry.get("category"))].append(entry)
            self.by_folder[str(entry.get("folder"))].append(entry)
            self.by_raw[str(entry.get("raw_id"))].append(entry)
            self.by_id[str(entry.get("id"))].append(entry)

    def route_id(self, entry: dict[str, Any]) -> str:
        entry_id = str(entry["id"])
        raw_id = str(entry.get("raw_id") or "")
        if entry_id == raw_id:
            return entry_id
        collapsed = nested_equivalent(self.by_raw.get(raw_id, ()))
        if collapsed is not None:
            return raw_id
        return entry_id

    def canonical_raw_entries(self, entries: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for entry in entries:
            groups[str(entry.get("raw_id"))].append(entry)
        result = []
        for raw_id, shards in groups.items():
            selected = nested_equivalent(shards)
            if selected is None:
                continue
            result.append(selected)
        return sorted(result, key=lambda entry: str(entry.get("raw_id")))

    def folders(self, category: str, prefix: str | None = None) -> list[str]:
        result = {entry["folder"] for entry in self.by_category.get(category, ())}
        if prefix is not None:
            result = {folder for folder in result if folder_prefix(folder) == prefix}
        return sorted(result)

    def one_folder(self, category: str, prefix: str) -> str | None:
        values = self.folders(category, prefix)
        return values[0] if len(values) == 1 else None


@dataclass(frozen=True)
class Route:
    slug: str
    source_title: str
    reader_id: str
    section: str | None
    evidence: str

    def json(self) -> dict[str, Any]:
        value: dict[str, Any] = {
            "slug": self.slug,
            "sourceTitle": self.source_title,
            "readerId": self.reader_id,
            "evidence": self.evidence,
        }
        if self.section is not None:
            value["section"] = self.section
        return value


class RouteSet:
    def __init__(self, actual_titles: dict[str, list[str]]) -> None:
        self.routes: dict[tuple[str, str], Route] = {}
        self.actual_titles: dict[str, dict[str, list[str]]] = {}
        for slug, titles in actual_titles.items():
            by_identity: dict[str, list[str]] = defaultdict(list)
            for title in titles:
                by_identity[identity(title)].append(title)
            self.actual_titles[slug] = by_identity

    def add(
        self,
        slug: str,
        source_title: str,
        reader_id: str,
        section: str | None,
        evidence: str,
    ) -> None:
        title = exact_key(source_title)
        if not title:
            return
        candidates = self.actual_titles.get(slug, {}).get(identity(title), ())
        for actual_title in candidates:
            key = (slug, actual_title)
            route = Route(slug, actual_title, reader_id, section, evidence)
            previous = self.routes.get(key)
            if previous is not None and previous != route:
                raise EvidenceBuildError(
                    f"conflicting route evidence for {slug}/{actual_title}"
                )
            self.routes[key] = route


def title_groups() -> dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]]:
    document = read_json(GROUPS_PATH)
    result = {}
    for group in document["groups"]:
        for child in group.get("children", ()):
            result[(group["category"], exact_key(child["source_title"]))] = (group, child)
    return result


def event_story_map(
    official_rows: list[dict[str, Any]],
    reader: ReaderCatalog,
) -> dict[tuple[str, str], list[list[str]]]:
    result: dict[tuple[str, str], list[list[str]]] = defaultdict(list)
    folders = reader.folders("event_story")
    prefixes = {folder_prefix(folder) for folder in folders}
    for row in official_rows:
        ids = [value.strip() for value in str(row.get("storyIds") or "").split(",") if value.strip()]
        if not ids:
            continue
        candidates = [prefix for prefix in prefixes if all(value.startswith(prefix) for value in ids)]
        if len(candidates) != 1:
            continue
        key = (candidates[0], identity(row.get("storyTitle")))
        if ids not in result[key]:
            result[key].append(ids)
    return result


def aggregate_entry(reader: ReaderCatalog, folder: str) -> dict[str, Any] | None:
    entries = reader.by_folder[folder]
    union = {source_part(section) for entry in entries for section in entry["sections"]}
    candidates = [
        entry
        for entry in entries
        if {source_part(section) for section in entry["sections"]} == union
    ]
    return sorted(candidates, key=lambda entry: str(entry["id"]))[0] if candidates else None


def entry_for_sources(
    reader: ReaderCatalog,
    folder: str,
    sources: list[str],
) -> tuple[dict[str, Any], str] | None:
    required = list(dict.fromkeys(sources))
    candidates = []
    for entry in reader.by_folder[folder]:
        by_source = {source_part(section): section for section in entry["sections"]}
        if all(source in by_source for source in required):
            candidates.append((len(entry["sections"]), str(entry["id"]), entry, by_source[required[0]]))
    if not candidates:
        return None
    candidates.sort(key=lambda value: (value[0], value[1]))
    return candidates[0][2], candidates[0][3]


def event_folder_for_group(
    group: dict[str, Any],
    provenance: dict[tuple[str, str], dict[str, Any]],
    reader: ReaderCatalog,
    prefixes: list[tuple[str, str]],
) -> tuple[str | None, str]:
    first_title = exact_key(group["children"][0]["source_title"])
    entry = provenance.get((group["category"], first_title), {})
    official = [
        value.split(":", 1)[1]
        for value in entry.get("officialIds", ())
        if value.startswith("eventList:")
    ]
    if len(set(official)) == 1:
        event_id = next(iter(official))
        candidates = []
        for prefix in (str(int(event_id) + 4000), "5" + event_id):
            candidates.extend(reader.folders("event_story", prefix))
        candidates = list(dict.fromkeys(candidates))
        if len(candidates) == 1:
            return candidates[0], "official-event-id"

    for japanese, chinese in prefixes:
        base = str(group["source_base"])
        if base == japanese or base.startswith(japanese + " ") or base.startswith(japanese + "　"):
            candidates = [
                folder
                for folder in reader.folders("event_story")
                if identity(folder_title(folder)) == identity(chinese)
            ]
            if len(candidates) == 1:
                return candidates[0], "reader-audited-title-prefix"

    keys = [identity(group.get("approved_translation")), identity(group.get("source_base"))]
    keys = [key for key in keys if len(key) >= 3]
    exact = [
        folder
        for folder in reader.folders("event_story")
        if any(key == identity(folder_title(folder)) for key in keys)
    ]
    if len(exact) == 1:
        return exact[0], "reader-exact-parent-title"
    contained = [
        folder
        for folder in reader.folders("event_story")
        if any(
            key in identity(folder_title(folder)) or identity(folder_title(folder)) in key
            for key in keys
        )
    ]
    contained = list(dict.fromkeys(contained))
    if len(contained) == 1:
        return contained[0], "reader-unique-contained-parent-title"
    return None, "parent-unresolved"


def map_events(
    routes: RouteSet,
    groups: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]],
    provenance: dict[tuple[str, str], dict[str, Any]],
    localization: dict[str, Any],
    official_story_map: dict[tuple[str, str], list[list[str]]],
    reader: ReaderCatalog,
) -> None:
    prefixes = [
        (str(value["jp"]), str(value["zh"]))
        for value in localization.get("titlePrefixes", ())
        if isinstance(value, dict) and value.get("jp") and value.get("zh")
    ]
    seen_groups: set[str] = set()
    for (category, _), (group, child) in groups.items():
        if category != "イベント":
            continue
        group_id = str(group["group_id"])
        if group_id in seen_groups:
            continue
        seen_groups.add(group_id)
        folder, parent_evidence = event_folder_for_group(group, provenance, reader, prefixes)
        if folder is None:
            continue
        prefix = folder_prefix(folder)
        aggregate = aggregate_entry(reader, folder)
        for child in group["children"]:
            title = child["source_title"]
            suffix = str(child.get("source_suffix") or "").strip()
            sources: list[str] = []
            source_evidence = ""
            official = official_story_map.get((prefix, identity(suffix)), ())
            if len(official) == 1:
                sources = official[0]
                source_evidence = "official-cn-eventStoryList"
            if not sources and suffix:
                labels = list(dict.fromkeys(
                    source_part(section)
                    for entry in reader.by_folder[folder]
                    for section in entry["sections"]
                    if section_label(section) and identity(section_label(section)) == identity(suffix)
                ))
                if len(labels) == 1:
                    sources = labels
                    source_evidence = "reader-exact-section-label"
            if not sources:
                number = re.fullmatch(r"第?(\d+)[話话]?", suffix)
                if number:
                    target = int(number.group(1))
                    numbered = list(dict.fromkeys(
                        source_part(section)
                        for entry in reader.by_folder[folder]
                        for section in entry["sections"]
                        if section_number(section) == target
                    ))
                    if len(numbered) == 1:
                        sources = numbered
                        source_evidence = "reader-unique-section-number"
                elif suffix in {"序", "序章", "Prologue", "プロローグ"}:
                    numbered = list(dict.fromkeys(
                        source_part(section)
                        for entry in reader.by_folder[folder]
                        for section in entry["sections"]
                        if section_number(section) == 0
                    ))
                    if len(numbered) == 1:
                        sources = numbered
                        source_evidence = "reader-unique-prologue"
            selected = entry_for_sources(reader, folder, sources) if sources else None
            if selected is not None:
                entry, section = selected
                routes.add(
                    "event",
                    title,
                    reader.route_id(entry),
                    section,
                    f"{parent_evidence}+{source_evidence}",
                )
            elif aggregate is not None:
                routes.add(
                    "event",
                    title,
                    reader.route_id(aggregate),
                    None,
                    f"{parent_evidence}+reader-exact-folder-aggregate",
                )


def reader_character_names(folder: str) -> tuple[str, str]:
    value = re.sub(r"^\s*\d+\s*-\s*", "", folder).strip()
    if "）（" in value and value.endswith("）"):
        chinese, japanese = value.rsplit("）（", 1)
        return chinese.strip(), japanese[:-1].strip()
    start = value.rfind("（")
    if start > 0 and value.endswith("）"):
        return value[:start].strip(), value[start + 1 : -1].strip()
    return value, ""


def map_costumes(
    routes: RouteSet,
    rows: list[list[Any]],
    reader: ReaderCatalog,
) -> None:
    reader_by_name: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for entry in reader.by_category.get("costume_story", ()):
        _, japanese = reader_character_names(entry["folder"])
        raw_id = str(entry["raw_id"])
        previous = reader_by_name[japanese].get(raw_id)
        if previous is None or len(entry["sections"]) > len(previous["sections"]):
            reader_by_name[japanese][raw_id] = entry

    titles_by_name: dict[str, list[str]] = defaultdict(list)
    summaries: dict[str, list[str]] = defaultdict(list)
    names = sorted(reader_by_name, key=lambda value: len(identity(value)), reverse=True)
    for row in rows:
        title = exact_key(row[0])
        matches = [name for name in names if identity(title).startswith(identity(name))]
        if not matches:
            continue
        name = matches[0]
        if title not in titles_by_name[name]:
            titles_by_name[name].append(title)
        summaries[title].append(str(row[2] or ""))
    no_story = {
        title
        for title, values in summaries.items()
        if values and all("ストーリーなし" in value for value in values)
    }

    mapped = 0
    for name, raw_entries in reader_by_name.items():
        source_titles = [title for title in titles_by_name.get(name, ()) if title not in no_story]
        reader_entries = [raw_entries[key] for key in sorted(raw_entries)]
        if len(source_titles) != len(reader_entries):
            continue
        for source_title, entry in zip(source_titles, reader_entries):
            routes.add(
                "costume",
                source_title,
                reader.route_id(entry),
                None,
                "same-character exact story count and release order",
            )
            mapped += 1
    if mapped != 178 or no_story != {"アリナ・グレイ アトリエ着"}:
        raise EvidenceBuildError(
            f"costume structural contract changed: mapped={mapped}, noStory={sorted(no_story)}"
        )


def map_mirrors(routes: RouteSet, titles: Iterable[str], reader: ReaderCatalog) -> None:
    for title in titles:
        match = re.fullmatch(r"第(\d+)鏡層", title)
        if match is None:
            continue
        raw_id = f"4000{int(match.group(1)):02d}"
        entry = nested_equivalent(reader.by_raw.get(raw_id, ()))
        if entry is None:
            continue
        routes.add("mirrors", title, raw_id, entry["sections"][0], "exact mirror layer id")


def map_battle_museum(
    routes: RouteSet,
    groups: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]],
    reader: ReaderCatalog,
) -> None:
    folder_tokens = {
        "五十鈴れんの「記憶」": "五十铃怜",
        "佐和月出里の「記憶」": "佐和月出里",
        "和泉十七夜の「記憶」": "和泉十七夜",
        "常盤ななかの「記憶」": "常盘七香",
        "篠目ヨヅルの「記憶」": "篠目夜鹤",
    }
    seen: set[str] = set()
    for (category, _), (group, child) in groups.items():
        if category != "バトルミュージアム" or group["group_id"] in seen:
            continue
        seen.add(group["group_id"])
        if group["source_base"] == "プロローグ":
            candidates = [
                entry
                for entry in reader.by_category.get("mirror_story", ())
                if "420131-0" in entry["folder"]
            ]
        else:
            token = folder_tokens.get(group["source_base"])
            candidates = [
                entry
                for entry in reader.by_category.get("mirror_story", ())
                if token and token in entry["folder"]
            ]
        if len(candidates) != 1:
            continue
        entry = candidates[0]
        for child in group["children"]:
            number = re.search(r"(\d+)話", str(child.get("source_suffix") or ""))
            if number:
                target = int(number.group(1))
                sections = [section for section in entry["sections"] if section_number(section) == target]
                if len(sections) != 1:
                    continue
                section = sections[0]
            else:
                section = entry["sections"][0] if len(entry["sections"]) == 1 else None
            routes.add(
                "battle-museum",
                child["source_title"],
                reader.route_id(entry),
                section,
                "exact battle-museum character and episode",
            )


def map_scene0(
    routes: RouteSet,
    titles: Iterable[str],
    reader: ReaderCatalog,
) -> None:
    main_by_film: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for entry in reader.by_category.get("scene0_main", ()):
        raw_id = str(entry.get("raw_id") or "")
        if re.fullmatch(r"\d{6}", raw_id):
            previous = main_by_film[entry["folder"]].get(raw_id)
            if previous is None or len(entry["sections"]) > len(previous["sections"]):
                main_by_film[entry["folder"]][raw_id] = entry
    for title in titles:
        match = re.fullmatch(r"Film\.(\d+)\s+DAY\.(\d+)", title)
        if match is None:
            continue
        folder = "film" + match.group(1)
        day = int(match.group(2))
        candidates = [
            entry
            for raw_id, entry in main_by_film.get(folder, {}).items()
            if int(raw_id[-2:]) == day
        ]
        if len(candidates) == 1:
            entry = candidates[0]
            routes.add(
                "scene0",
                title,
                reader.route_id(entry),
                None,
                "exact Scene0 film/day raw id",
            )

    color_by_suffix = {
        "homura": "紫",
        "mami": "黄",
        "madoka": "桃",
        "sayaka": "青",
        "kyoko": "赤",
    }
    side_titles: dict[int, dict[int, tuple[str, str]]] = defaultdict(dict)
    for title in titles:
        match = re.fullmatch(r"サイドストーリー Film\.(\d+) (\d+) \(([^)]*)\)", title)
        if match:
            side_titles[int(match.group(1))][int(match.group(2))] = (title, match.group(3))
    for film, numbered_titles in side_titles.items():
        by_raw: dict[str, dict[str, Any]] = {}
        for entry in reader.by_category.get("scene0_sub", ()):
            raw_id = str(entry.get("raw_id") or "")
            if entry["folder"] != f"film{film}" or re.fullmatch(r"\d{6}", raw_id) is None:
                continue
            previous = by_raw.get(raw_id)
            if previous is None or len(entry["sections"]) > len(previous["sections"]):
                by_raw[raw_id] = entry
        flattened: list[tuple[dict[str, Any], str, str]] = []
        for raw_id in sorted(by_raw):
            entry = by_raw[raw_id]
            sections = sorted(
                entry["sections"],
                key=lambda value: (section_number(value) or -1, value),
            )
            for section in sections:
                raw_source = source_part(section)
                suffix = raw_source.rsplit("_", 1)[1] if "_" in raw_source else ""
                flattened.append((entry, section, color_by_suffix.get(suffix, "")))
        if len(flattened) != len(numbered_titles) or set(numbered_titles) != set(range(1, len(flattened) + 1)):
            continue
        for number, (entry, section, color) in enumerate(flattened, 1):
            title, expected_color = numbered_titles[number]
            if identity(expected_color) not in {identity(color), ""}:
                raise EvidenceBuildError(f"Scene0 color contract changed: {title} -> {section}")
            routes.add(
                "scene0",
                title,
                reader.route_id(entry),
                section,
                "exact Scene0 side ordinal and color identity",
            )


def map_puella(
    routes: RouteSet,
    titles: Iterable[str],
    reader: ReaderCatalog,
    reader_titles: dict[str, str],
) -> None:
    title_set = set(titles)
    modern = {"現代神浜編 Prologue": "103401"}
    modern.update({f"現代神浜編 {number}話": f"10340{number + 1}" for number in range(1, 7)})
    for title, raw_id in modern.items():
        if title not in title_set:
            continue
        entry = nested_equivalent(reader.by_raw.get(raw_id, ()))
        if entry is not None:
            routes.add("puella-historia", title, raw_id, entry["sections"][0], "exact Puella main chapter id")

    for base, prefix in PUELLA_EVENT_PREFIXES.items():
        folder = reader.one_folder("event_story", prefix)
        if folder is None:
            continue
        entries = [
            entry
            for entry in reader.canonical_raw_entries(reader.by_folder[folder])
            if re.fullmatch(r"\d+", str(entry.get("raw_id") or ""))
        ]
        episodes = []
        for entry in entries:
            for section in entry["sections"]:
                number = section_number(section)
                if number not in (None, 0):
                    episodes.append((entry, section))
        source_episodes = {
            int(match.group(1)): title
            for title in title_set
            if title.startswith(base + " ")
            if (match := re.fullmatch(re.escape(base) + r" (\d+)話", title))
        }
        if source_episodes and set(source_episodes) == set(range(1, len(episodes) + 1)):
            for number, (entry, section) in enumerate(episodes, 1):
                routes.add(
                    "puella-historia",
                    source_episodes[number],
                    reader.route_id(entry),
                    section,
                    "exact Puella arc ordinal across Reader source ids",
                )
        prologues = [
            (entry, section)
            for entry in entries
            for section in entry["sections"]
            if section_number(section) == 0
        ]
        for label in ("序", "Prologue", "プロローグ"):
            title = f"{base} {label}"
            if title in title_set and len(prologues) == 1:
                entry, section = prologues[0]
                routes.add(
                    "puella-historia",
                    title,
                    reader.route_id(entry),
                    section,
                    "exact Puella prologue section",
                )

    pillar_entry = nested_equivalent(reader.by_raw.get("519810", ()))
    if pillar_entry is not None:
        title_to_section = {}
        for section in pillar_entry["sections"]:
            source = source_part(section)
            label = reader_titles.get(source)
            if label:
                title_to_section[identity(label)] = section
        for title in title_set:
            if not title.startswith("Pillar of Tomorrow "):
                continue
            suffix = title.removeprefix("Pillar of Tomorrow ")
            section = title_to_section.get(identity(suffix))
            if section is not None:
                routes.add(
                    "puella-historia",
                    title,
                    reader.route_id(pillar_entry),
                    section,
                    "exact Reader Pillar character section title",
                )


def one_prefix_entry(reader: ReaderCatalog, category: str, prefix: str) -> dict[str, Any] | None:
    folder = reader.one_folder(category, prefix)
    if folder is None:
        return None
    entries = reader.canonical_raw_entries(reader.by_folder[folder])
    return entries[0] if len(entries) == 1 else None


def map_special(
    routes: RouteSet,
    groups: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]],
    reader: ReaderCatalog,
) -> None:
    parent_prefixes = {
        identity(title): prefix
        for title, prefix in SPECIAL_PARENT_PREFIXES.items()
    }
    full_title_prefixes = {
        identity(title): prefix
        for title, prefix in SPECIAL_FULL_TITLE_PREFIXES.items()
    }
    seen: set[str] = set()
    for (category, _), (group, child) in groups.items():
        if category != "スペシャル" or group["group_id"] in seen:
            continue
        seen.add(group["group_id"])
        base = str(group["source_base"])
        prefix = parent_prefixes.get(identity(base))
        entry = one_prefix_entry(reader, "login_story", prefix) if prefix else None
        for child in group["children"]:
            title = exact_key(child["source_title"])
            full_prefix = full_title_prefixes.get(identity(title))
            target = one_prefix_entry(reader, "login_story", full_prefix) if full_prefix else entry
            if target is None:
                continue
            number = re.search(r"(\d+)話", str(child.get("source_suffix") or ""))
            section = None
            if number:
                candidates = [
                    value
                    for value in target["sections"]
                    if section_number(value) == int(number.group(1))
                ]
                if len(candidates) != 1:
                    continue
                section = candidates[0]
            routes.add(
                "special",
                title,
                reader.route_id(target),
                section,
                "curated exact login-story source identity",
            )


def build(reader_root: Path, official_libs: Path) -> dict[str, Any]:
    catalog = read_json(CATALOG_PATH)
    group_index = title_groups()
    provenance_document = read_json(PROVENANCE_PATH)
    provenance = {
        (entry["category"], exact_key(entry["sourceTitleJa"])): entry
        for entry in provenance_document["entries"]
    }
    localization = read_json(LOCALIZATION_PATH)
    reader_entries = read_json(reader_root / "website" / "public" / "story_index.json")
    reader_titles = read_json(reader_root / "titles.json")
    reader = ReaderCatalog(reader_entries)
    official_rows = read_json(official_libs / "eventStoryList.json")
    official_map = event_story_map(official_rows, reader)

    rows_by_slug: dict[str, list[list[Any]]] = {}
    titles_by_slug: dict[str, list[str]] = {}
    for category in catalog["categories"]:
        document = read_json(CATALOG_ROOT / category["file"])
        rows = document["rows"]
        rows_by_slug[category["slug"]] = rows
        titles_by_slug[category["slug"]] = list(dict.fromkeys(
            exact_key(row[0]) for row in rows if isinstance(row, list) and row
        ))

    routes = RouteSet(titles_by_slug)
    map_events(routes, group_index, provenance, localization, official_map, reader)
    map_costumes(routes, rows_by_slug["costume"], reader)
    map_mirrors(routes, titles_by_slug["mirrors"], reader)
    map_battle_museum(routes, group_index, reader)
    map_scene0(routes, titles_by_slug["scene0"], reader)
    map_puella(routes, titles_by_slug["puella-historia"], reader, reader_titles)
    map_special(routes, group_index, reader)

    route_keys = set(routes.routes)
    category_summary = []
    for category in catalog["categories"]:
        slug = category["slug"]
        rows = rows_by_slug[slug]
        unique_titles = titles_by_slug[slug]
        mapped_rows = sum((slug, exact_key(row[0])) in route_keys for row in rows if row)
        if slug in NON_STORY_SLUGS:
            classification = "non-story"
        elif slug in OUTSIDE_READER_SLUGS:
            classification = "outside-reader-catalog"
        elif slug in BASE_AIO_SLUGS:
            classification = "existing-aio-base-router"
        else:
            classification = "exact-title-evidence"
        category_summary.append({
            "slug": slug,
            "rows": len(rows),
            "uniqueTitles": len(unique_titles),
            "evidenceMappedRows": mapped_rows,
            "evidenceMappedTitles": sum((slug, title) in route_keys for title in unique_titles),
            "classification": classification,
        })

    total_rows = sum(len(rows) for rows in rows_by_slug.values())
    non_story_rows = sum(len(rows_by_slug[slug]) for slug in NON_STORY_SLUGS)
    outside_rows = sum(len(rows_by_slug[slug]) for slug in OUTSIDE_READER_SLUGS)
    exact_rows = sum(item["evidenceMappedRows"] for item in category_summary)
    return {
        "version": 1,
        "release": "call-reader-exact-route-evidence-v1",
        "sourceCatalog": "story-v6",
        "catalogGeneratedAt": catalog.get("generatedAt"),
        "reader": {
            "repository": "HiiragiNemu/magi-reader",
            "revision": git_revision(reader_root),
            "indexPath": "website/public/story_index.json",
            "indexEntries": len(reader_entries),
        },
        "officialCn": {
            "repository": "HiiragiNemu/magireco-cn-patch",
            "revision": git_revision(official_libs.parents[2]),
            "eventStoryListPath": "magica/js/libs/eventStoryList.json",
        },
        "policy": {
            "matching": "exact identity only; no cast, summary, edit-distance, or fuzzy-title matching",
            "nonStorySlugs": sorted(NON_STORY_SLUGS),
            "outsideReaderSlugs": sorted(OUTSIDE_READER_SLUGS),
            "baseAioSlugs": sorted(BASE_AIO_SLUGS),
        },
        "summary": {
            "catalogRows": total_rows,
            "nonStoryRows": non_story_rows,
            "storyRowsExcludingNonStory": total_rows - non_story_rows,
            "outsideReaderCatalogRows": outside_rows,
            "exactEvidenceRoutes": len(routes.routes),
            "exactEvidenceMappedRows": exact_rows,
            "categories": category_summary,
        },
        "routes": [
            route.json()
            for _, route in sorted(routes.routes.items(), key=lambda item: item[0])
        ],
    }


def semantic(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: semantic(item) for key, item in value.items()}
    if isinstance(value, list):
        return [semantic(item) for item in value]
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reader-root", required=True, type=Path)
    parser.add_argument("--official-libs", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--public-output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = build(args.reader_root.resolve(), args.official_libs.resolve())
    outputs = [args.output.resolve()]
    if args.public_output:
        outputs.append(args.public_output.resolve())
    if args.check:
        stale = [path for path in outputs if not path.exists() or semantic(read_json(path)) != document]
        if stale:
            for path in stale:
                print(f"stale: {path}")
            return 1
    else:
        for path in outputs:
            write_json(path, document)
    print(json.dumps(document["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (EvidenceBuildError, KeyError, ValueError) as error:
        print(f"reader route evidence build failed: {error}")
        raise SystemExit(1)
