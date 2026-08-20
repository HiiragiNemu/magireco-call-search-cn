#!/usr/bin/env python3
"""V22 authoritative localization and final static-site audit.

Authority order:
  1. Official simplified-Chinese client tables in magireco-cn-patch/libs
  2. Existing explicitly reviewed/human-audited mappings in this repository
  3. MagiReader structured title data
  4. magireco-wiki-data structured fallback seed
  5. Conservative structural translation / existing low-authority fallback

The script is deliberately schema-tolerant. The historical data files have used
several field names and container shapes, so extraction is based on paired
Japanese/Chinese fields, stable IDs and narrowly scoped title files rather than
one fragile hard-coded schema.
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
REPORTS = ROOT / "reports"
BUILD_ID = "v22-authority-20260820"
OBSOLETE_SITE_TITLE = "魔法纪录·Magia Exedra 魔法少女称呼搜索"

KANA_RE = re.compile(r"[ぁ-ゖァ-ヺー]", re.UNICODE)
HAN_RE = re.compile(r"[一-龯々〆ヶ]", re.UNICODE)
NO_RE = re.compile(r"^\s*No\.\s*(\d+)\b", re.IGNORECASE)
MOJIBAKE_RE = re.compile(r"(?:�|\?{3,}|Ã.|Â.|æ\w|ç\w|ã\w)")
ID_RE = re.compile(r"(?<!\d)(\d{3,8})(?!\d)")

JP_KEYS = {
    "ja", "jp", "japanese", "titleja", "titlejp", "title_jp", "title_ja",
    "nameja", "namejp", "name_ja", "name_jp", "originaltitle",
    "original_title", "japanesetitle", "source_title", "sourcetitle",
    "titleoriginal", "title_original", "labelja", "label_ja",
}
ZH_KEYS = {
    "zh", "cn", "zhcn", "chinese", "titlezh", "titlecn", "title_zh",
    "title_cn", "namezh", "namecn", "name_zh", "name_cn",
    "translatedtitle", "translated_title", "translation", "localizedtitle",
    "localized_title", "chinesetitle", "labelzh", "label_zh",
}
TITLE_KEYS = {
    "title", "name", "label", "displayname", "display_name", "dispname",
    "sectionname", "section_name", "chaptername", "chapter_name",
    "eventname", "event_name", "storytitle", "story_title", "piecename",
    "piece_name", "charaname", "chara_name",
}
ID_KEYS = {
    "id", "key", "storyid", "story_id", "sectionid", "section_id",
    "chapterid", "chapter_id", "eventid", "event_id", "charavid",
    "charaid", "chara_id", "pieceid", "piece_id", "questid", "quest_id",
}
CONTEXT_KEYS = {
    "category", "type", "kind", "group", "groupname", "group_name",
    "parent", "parenttitle", "parent_title", "section", "source",
}

RANK = {
    "official-cn-client": 1000,
    "reviewed-human": 900,
    "magi-reader": 700,
    "wiki-fallback": 500,
    "structured-rule": 300,
    "existing-fallback": 180,
    "identity-preserved": 120,
    "assistant-fallback": 100,
}

OFFICIAL_FILES = {
    "piece": "pieceList.json",
    "chara": "charaList.json",
    "event": "eventList.json",
    "event_story": "eventStoryList.json",
    "chapter": "chapterList.json",
    "section": "sectionList.json",
}

OFFICIAL_NAME_KEYS = {
    "piece": ["name", "pieceName", "title", "description"],
    "chara": ["name", "charaName", "displayName", "title"],
    "event": ["name", "eventName", "title"],
    "event_story": ["title", "name", "storyTitle", "sectionName"],
    "chapter": ["title", "name", "chapterName"],
    "section": ["title", "name", "sectionName", "storyTitle"],
}

COMMON_RULES = [
    ("ハロウィン", "万圣节"),
    ("クリスマス", "圣诞节"),
    ("バレンタイン", "情人节"),
    ("ホワイトデー", "白色情人节"),
    ("アニバーサリー", "周年纪念"),
    ("ウワサ", "传闻"),
    ("ドッペル", "魔女化身"),
    ("魔法少女ストーリー", "魔法少女个人故事"),
    ("キャラストーリー", "角色故事"),
    ("水着ver.", "泳装ver."),
    ("水着ver", "泳装ver"),
    ("花嫁ver.", "新娘ver."),
    ("花嫁ver", "新娘ver"),
    ("人魚ver.", "人鱼ver."),
    ("人魚ver", "人鱼ver"),
    ("始まりver.", "起始ver."),
    ("始まりver", "起始ver"),
    ("アニメver.", "动画ver."),
    ("アニメver", "动画ver"),
    ("晴着ver.", "晴装ver."),
    ("晴着ver", "晴装ver"),
    ("童話ver.", "童话ver."),
    ("童話ver", "童话ver"),
    ("歴史ver.", "历史ver."),
    ("歴史ver", "历史ver"),
    ("ヴァンパイア", "吸血鬼"),
    ("先輩", "前辈"),
    ("ようこそ", "欢迎来到"),
    ("おかえり", "欢迎回来"),
    ("物語", "故事"),
    ("約束", "约定"),
    ("思い出", "回忆"),
    ("未来", "未来"),
    ("夢", "梦"),
    ("夏", "夏日"),
    ("冬", "冬日"),
    ("春", "春日"),
    ("秋", "秋日"),
    ("小さな", "小小的"),
    ("私たち", "我们"),
    ("ふたり", "两人"),
    ("二人", "两人"),
    ("最後", "最后"),
    ("始まり", "开始"),
    ("終わり", "终结"),
    ("秘密", "秘密"),
    ("願い", "愿望"),
    ("希望", "希望"),
    ("奇跡", "奇迹"),
    ("時間", "时间"),
    ("世界", "世界"),
    ("少女", "少女"),
    ("魔女", "魔女"),
    ("神様", "神明"),
]


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def key_name(key: Any) -> str:
    return re.sub(r"[^a-z0-9_]", "", str(key).strip().lower())


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\u00a0", " ").replace("\u3000", " ")
    text = text.replace("〜", "~").replace("～", "~")
    text = re.sub(r"[「」『』【】\[\]()（）〈〉《》“”‘’\"'`]+", "", text)
    text = re.sub(r"\s+", "", text)
    return text.casefold().strip()


def compact_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\u00a0", " ").replace("\u3000", " ")
    return re.sub(r"\s+", " ", text).strip()


def contains_kana(value: Any) -> bool:
    return bool(KANA_RE.search(str(value or "")))


def contains_han(value: Any) -> bool:
    return bool(HAN_RE.search(str(value or "")))


def is_reasonable_translation(value: Any) -> bool:
    text = compact_text(value)
    if not text or len(text) > 500 or MOJIBAKE_RE.search(text):
        return False
    if contains_kana(text):
        return False
    return contains_han(text) or bool(re.search(r"[A-Za-z0-9]", text))


def preserve_identity(value: str) -> bool:
    text = compact_text(value)
    if not text or contains_kana(text):
        return False
    return contains_han(text) or bool(re.search(r"[A-Za-z]", text))


def json_load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def iter_records(payload: Any) -> Iterator[dict[str, Any]]:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield item
    elif isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(value, dict):
                item = dict(value)
                item.setdefault("_key", key)
                yield item
            elif isinstance(value, str):
                yield {"_key": key, "name": value}


def extract_ids(node: dict[str, Any], path_hint: str = "") -> list[str]:
    result: list[str] = []
    for key, value in node.items():
        if key_name(key) in ID_KEYS or key_name(key).endswith("id"):
            if isinstance(value, (str, int)):
                result.extend(ID_RE.findall(str(value)))
    if "_key" in node:
        result.extend(ID_RE.findall(str(node["_key"])))
    for key, value in node.items():
        if isinstance(value, str) and key_name(key) in {"path", "file", "filename", "url", "slug"}:
            result.extend(ID_RE.findall(value))
    if path_hint:
        result.extend(ID_RE.findall(path_hint))
    return list(dict.fromkeys(result))


def pick_name(record: dict[str, Any], kind: str) -> str | None:
    requested = [key_name(k) for k in OFFICIAL_NAME_KEYS.get(kind, [])]
    values: list[tuple[int, str]] = []
    for raw_key, raw_value in record.items():
        if not isinstance(raw_value, str):
            continue
        value = compact_text(raw_value)
        if not value or len(value) > 160 or MOJIBAKE_RE.search(value):
            continue
        normalized_key = key_name(raw_key)
        score = 0
        if normalized_key in requested:
            score += 100 - requested.index(normalized_key)
        if normalized_key in TITLE_KEYS:
            score += 40
        if contains_han(value):
            score += 20
        if contains_kana(value):
            score -= 80
        if normalized_key in {"description", "detail", "comment", "summary"}:
            score -= 30
        values.append((score, value))
    if not values:
        return None
    values.sort(key=lambda item: (item[0], -len(item[1])), reverse=True)
    return values[0][1] if values[0][0] > 0 else None


@dataclasses.dataclass(frozen=True)
class Translation:
    ja: str
    zh: str
    source: str
    rank: int
    evidence: str = ""


class Registry:
    def __init__(self) -> None:
        self._items: dict[str, list[Translation]] = collections.defaultdict(list)
        self.conflicts: list[dict[str, Any]] = []

    def add(self, ja: Any, zh: Any, source: str, evidence: str = "", rank: int | None = None) -> None:
        ja_text = compact_text(ja)
        zh_text = compact_text(zh)
        if not ja_text or not zh_text or len(ja_text) > 500 or len(zh_text) > 500:
            return
        if MOJIBAKE_RE.search(ja_text) or MOJIBAKE_RE.search(zh_text):
            return
        if contains_kana(zh_text):
            return
        normalized = normalize_text(ja_text)
        if not normalized:
            return
        candidate = Translation(ja_text, zh_text, source, rank if rank is not None else RANK[source], evidence)
        existing = self._items[normalized]
        if any(item.zh == candidate.zh and item.source == candidate.source for item in existing):
            return
        existing.append(candidate)
        existing.sort(key=lambda item: (item.rank, len(item.zh)), reverse=True)
        best = existing[0]
        alternatives = sorted({item.zh for item in existing[1:] if item.zh != best.zh})
        if alternatives:
            self.conflicts.append({
                "ja": best.ja,
                "selected": best.zh,
                "selectedSource": best.source,
                "alternatives": alternatives,
            })

    def best(self, ja: Any) -> Translation | None:
        items = self._items.get(normalize_text(ja))
        return items[0] if items else None

    def __len__(self) -> int:
        return len(self._items)


def paired_strings(node: dict[str, Any]) -> tuple[list[str], list[str]]:
    jp_values: list[str] = []
    zh_values: list[str] = []
    for raw_key, raw_value in node.items():
        if not isinstance(raw_value, str):
            continue
        normalized_key = key_name(raw_key)
        text = compact_text(raw_value)
        if normalized_key in JP_KEYS or (contains_kana(text) and normalized_key in TITLE_KEYS):
            jp_values.append(text)
        if normalized_key in ZH_KEYS and is_reasonable_translation(text):
            zh_values.append(text)
    return list(dict.fromkeys(jp_values)), list(dict.fromkeys(zh_values))


def walk_nodes(payload: Any, path: tuple[Any, ...] = ()) -> Iterator[tuple[tuple[Any, ...], Any]]:
    yield path, payload
    if isinstance(payload, dict):
        for key, value in payload.items():
            yield from walk_nodes(value, path + (key,))
    elif isinstance(payload, list):
        for index, value in enumerate(payload):
            yield from walk_nodes(value, path + (index,))


def source_rank_from_node(path: Path, node: dict[str, Any]) -> tuple[str, int]:
    labels = " ".join(str(node.get(key, "")) for key in node if key_name(key) in {"source", "authority", "status", "review"}).lower()
    path_text = path.as_posix().lower()
    if any(token in labels for token in ("human", "manual", "reviewed", "official", "人工", "审校")):
        return "reviewed-human", RANK["reviewed-human"]
    if "translation-audit" in path_text and "assistant" not in labels:
        return "reviewed-human", RANK["reviewed-human"]
    if "reader" in labels:
        return "magi-reader", RANK["magi-reader"]
    if "wiki" in labels:
        return "wiki-fallback", RANK["wiki-fallback"]
    return "existing-fallback", RANK["existing-fallback"]


def collect_existing_pairs(registry: Registry) -> None:
    roots = [PUBLIC / "data", PUBLIC / "downloads", ROOT / "data"]
    seen: set[Path] = set()
    for base in roots:
        if not base.exists():
            continue
        for path in base.rglob("*.json"):
            if path in seen or path.name.startswith("story-title-authority-v22") or path.stat().st_size > 40_000_000:
                continue
            seen.add(path)
            try:
                payload = json_load(path)
            except Exception:
                continue
            for _, node in walk_nodes(payload):
                if isinstance(node, dict):
                    jp_values, zh_values = paired_strings(node)
                    if jp_values and zh_values:
                        source, rank = source_rank_from_node(path, node)
                        for ja in jp_values:
                            for zh in zh_values:
                                registry.add(ja, zh, source, path.as_posix(), rank)
                    for key, value in node.items():
                        if isinstance(key, str) and isinstance(value, str) and contains_kana(key) and is_reasonable_translation(value):
                            source, rank = source_rank_from_node(path, node)
                            registry.add(key, value, source, path.as_posix(), rank)


def collect_reader(reader_root: Path, registry: Registry) -> dict[str, set[str]]:
    jp_to_ids: dict[str, set[str]] = collections.defaultdict(set)
    if not reader_root.exists():
        return jp_to_ids
    candidates: list[Path] = []
    for path in reader_root.rglob("*.json"):
        lower = path.name.lower()
        rel = path.relative_to(reader_root).as_posix().lower()
        if path.stat().st_size > 45_000_000:
            continue
        if any(token in lower for token in ("title", "story_index", "manifest")) or any(
            token in rel for token in ("story_index", "titles.json", "title_catalog", "title_coverage")
        ):
            candidates.append(path)
    for path in sorted(set(candidates)):
        try:
            payload = json_load(path)
        except Exception:
            continue
        for node_path, node in walk_nodes(payload):
            if not isinstance(node, dict):
                continue
            jp_values, zh_values = paired_strings(node)
            ids = extract_ids(node, "/".join(map(str, node_path)))
            for ja in jp_values:
                for item_id in ids:
                    jp_to_ids[normalize_text(ja)].add(item_id)
                for zh in zh_values:
                    registry.add(ja, zh, "magi-reader", path.relative_to(reader_root).as_posix())
            for key, value in node.items():
                if isinstance(key, str) and isinstance(value, str) and contains_kana(key) and is_reasonable_translation(value):
                    registry.add(key, value, "magi-reader", path.relative_to(reader_root).as_posix())
    return jp_to_ids


def collect_wiki_seed(registry: Registry) -> None:
    path = ROOT / "data" / "wiki-authority-seed-v22.json"
    if not path.exists():
        return
    payload = json_load(path)
    for entry in payload.get("entries", []):
        if isinstance(entry, dict):
            registry.add(entry.get("ja"), entry.get("zh"), "wiki-fallback", str(payload.get("source", path)))


def collect_official(libs_root: Path) -> dict[str, dict[str, str]]:
    maps: dict[str, dict[str, str]] = {kind: {} for kind in OFFICIAL_FILES}
    for kind, filename in OFFICIAL_FILES.items():
        path = libs_root / filename
        if not path.exists():
            continue
        try:
            payload = json_load(path)
        except Exception as exc:
            raise RuntimeError(f"Cannot parse official source {path}: {exc}") from exc
        for record in iter_records(payload):
            name = pick_name(record, kind)
            if not name:
                continue
            for item_id in extract_ids(record):
                maps[kind].setdefault(item_id, name)
    return maps


def infer_kind(context: str) -> list[str]:
    text = context.casefold()
    kinds: list[str] = []
    if any(token in text for token in ("记忆结晶", "メモリア", "memoria", "piece")):
        kinds.append("piece")
    if any(token in text for token in ("魔法少女个人故事", "角色故事", "キャラ", "chara", "character")):
        kinds.append("chara")
    if any(token in text for token in ("活动", "イベント", "event")):
        kinds.extend(["event_story", "event"])
    if any(token in text for token in ("章节", "章", "chapter")):
        kinds.append("chapter")
    if any(token in text for token in ("主线", "支线", "小节", "section", "story")):
        kinds.append("section")
    return list(dict.fromkeys(kinds + ["section", "event_story", "chara", "event", "chapter"]))


def strip_variant(title: str) -> str:
    text = compact_text(title)
    text = re.sub(r"[（(][^）)]*(?:ver\.?|衣装|水着|花嫁|人魚|ハロウィン|アニメ|晴着|童話|歴史)[^）)]*[）)]\s*$", "", text, flags=re.IGNORECASE)
    return text.strip()


def conservative_translation(ja: str, registry: Registry) -> Translation | None:
    text = compact_text(ja)
    if preserve_identity(text):
        return Translation(text, text, "identity-preserved", RANK["identity-preserved"], "No required localization")
    transformed = text
    for source, target in sorted(COMMON_RULES, key=lambda item: len(item[0]), reverse=True):
        transformed = transformed.replace(source, target)
    # Translate known name tokens inside compounds after exact lookup failed.
    tokens = re.split(r"([・·／/＆&、,＋+×xX]|\s+)", transformed)
    rebuilt: list[str] = []
    for token in tokens:
        exact = registry.best(token)
        rebuilt.append(exact.zh if exact and exact.rank >= RANK["wiki-fallback"] else token)
    transformed = "".join(rebuilt)
    transformed = re.sub(r"\s+", " ", transformed).strip()
    if transformed != text and not contains_kana(transformed):
        return Translation(text, transformed, "structured-rule", RANK["structured-rule"], "lexical rules")
    return None


@dataclasses.dataclass
class ApplyStats:
    files: int = 0
    nodes: int = 0
    changed: int = 0
    observed_titles: set[str] = dataclasses.field(default_factory=set)
    sources: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    unresolved: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    changes: list[dict[str, Any]] = dataclasses.field(default_factory=list)


def node_context(node: dict[str, Any], inherited: str) -> str:
    parts = [inherited]
    for key, value in node.items():
        if key_name(key) in CONTEXT_KEYS and isinstance(value, (str, int)):
            parts.append(str(value))
    return " | ".join(part for part in parts if part)


def title_fields(node: dict[str, Any]) -> tuple[list[str], list[str]]:
    jp: list[str] = []
    zh: list[str] = []
    for key, value in node.items():
        if not isinstance(value, str):
            continue
        normalized_key = key_name(key)
        if normalized_key in JP_KEYS:
            jp.append(key)
        elif normalized_key in ZH_KEYS:
            zh.append(key)
    if not jp:
        for key, value in node.items():
            if not isinstance(value, str):
                continue
            normalized_key = key_name(key)
            if normalized_key in TITLE_KEYS and (contains_kana(value) or NO_RE.match(value)):
                jp.append(key)
                break
    return jp, zh


def resolve_title(
    ja: str,
    current: str,
    node: dict[str, Any],
    context: str,
    registry: Registry,
    official: dict[str, dict[str, str]],
    jp_to_ids: dict[str, set[str]],
) -> Translation | None:
    no_match = NO_RE.match(ja)
    if no_match:
        number = int(no_match.group(1))
        official_name = official.get("piece", {}).get(str(1000 + number))
        if official_name:
            return Translation(ja, f"No.{number} {official_name}", "official-cn-client", RANK["official-cn-client"], f"pieceList:{1000 + number}")

    ids = extract_ids(node)
    ids.extend(sorted(jp_to_ids.get(normalize_text(ja), set())))
    base = strip_variant(ja)
    ids.extend(sorted(jp_to_ids.get(normalize_text(base), set())))
    ids = list(dict.fromkeys(ids))
    for kind in infer_kind(context):
        for item_id in ids:
            name = official.get(kind, {}).get(item_id)
            if name:
                prefix = f"No.{int(no_match.group(1))} " if no_match else ""
                return Translation(ja, prefix + name, "official-cn-client", RANK["official-cn-client"], f"{OFFICIAL_FILES[kind]}:{item_id}")

    exact = registry.best(ja)
    if exact:
        return exact
    if base != ja:
        base_match = registry.best(base)
        if base_match:
            suffix = ja[len(base):].strip()
            translated_suffix = conservative_translation(suffix, registry)
            suffix_zh = translated_suffix.zh if translated_suffix else suffix
            candidate = f"{base_match.zh}{suffix_zh}"
            if not contains_kana(candidate):
                return Translation(ja, candidate, base_match.source, base_match.rank, f"base:{base_match.evidence}")

    if is_reasonable_translation(current):
        return Translation(ja, compact_text(current), "existing-fallback", RANK["existing-fallback"], "existing target value")
    return conservative_translation(ja, registry)


def json_path_string(path: tuple[Any, ...]) -> str:
    return "$" + "".join(f"[{item}]" if isinstance(item, int) else f".{item}" for item in path)


def patch_payload(
    payload: Any,
    file_path: Path,
    registry: Registry,
    official: dict[str, dict[str, str]],
    jp_to_ids: dict[str, set[str]],
    stats: ApplyStats,
    path: tuple[Any, ...] = (),
    context: str = "",
) -> Any:
    if isinstance(payload, dict):
        local_context = node_context(payload, context)

        # Common localization dictionaries use Japanese titles as keys.
        for key, value in list(payload.items()):
            if isinstance(key, str) and isinstance(value, str) and (contains_kana(key) or NO_RE.match(key)):
                stats.nodes += 1
                stats.observed_titles.add(key)
                selected = resolve_title(key, value, payload, local_context, registry, official, jp_to_ids)
                if selected:
                    stats.sources[selected.source] += 1
                    if value != selected.zh:
                        payload[key] = selected.zh
                        stats.changed += 1
                        if len(stats.changes) < 5000:
                            stats.changes.append({
                                "file": file_path.relative_to(ROOT).as_posix(),
                                "path": json_path_string(path + (key,)),
                                "ja": key,
                                "before": value,
                                "after": selected.zh,
                                "source": selected.source,
                                "evidence": selected.evidence,
                            })
                    registry.add(key, selected.zh, selected.source, selected.evidence, selected.rank)
                elif len(stats.unresolved) < 10000:
                    stats.unresolved.append({
                        "file": file_path.relative_to(ROOT).as_posix(),
                        "path": json_path_string(path + (key,)),
                        "ja": key,
                        "currentZh": value,
                    })

        jp_keys, zh_keys = title_fields(payload)
        for jp_key in jp_keys:
            ja = payload.get(jp_key)
            if not isinstance(ja, str) or not ja.strip():
                continue
            stats.nodes += 1
            stats.observed_titles.add(ja)
            current = ""
            if zh_keys:
                raw_current = payload.get(zh_keys[0], "")
                current = raw_current if isinstance(raw_current, str) else ""
            selected = resolve_title(ja, current, payload, local_context, registry, official, jp_to_ids)
            if selected:
                stats.sources[selected.source] += 1
                if not zh_keys:
                    normalized_jp_key = key_name(jp_key)
                    new_key = "nameZh" if normalized_jp_key.startswith("name") else "titleZh"
                    payload[new_key] = selected.zh
                    zh_keys = [new_key]
                    stats.changed += 1
                for zh_key in zh_keys:
                    before = payload.get(zh_key)
                    if before != selected.zh:
                        payload[zh_key] = selected.zh
                        stats.changed += 1
                        if len(stats.changes) < 5000:
                            stats.changes.append({
                                "file": file_path.relative_to(ROOT).as_posix(),
                                "path": json_path_string(path + (zh_key,)),
                                "ja": ja,
                                "before": before,
                                "after": selected.zh,
                                "source": selected.source,
                                "evidence": selected.evidence,
                            })
                registry.add(ja, selected.zh, selected.source, selected.evidence, selected.rank)
            elif len(stats.unresolved) < 10000:
                stats.unresolved.append({
                    "file": file_path.relative_to(ROOT).as_posix(),
                    "path": json_path_string(path),
                    "ja": ja,
                    "currentZh": current,
                })

        for key, value in list(payload.items()):
            payload[key] = patch_payload(value, file_path, registry, official, jp_to_ids, stats, path + (key,), local_context)
        return payload

    if isinstance(payload, list):
        for index, value in enumerate(list(payload)):
            payload[index] = patch_payload(value, file_path, registry, official, jp_to_ids, stats, path + (index,), context)

        # Fix the historical lexicographic No.74 / No.739 ordering defect.
        def no_number(item: Any) -> int | None:
            if isinstance(item, str):
                match = NO_RE.match(item)
                return int(match.group(1)) if match else None
            if isinstance(item, dict):
                for key in ("titleJa", "titleJP", "title", "name", "ja", "jp"):
                    value = item.get(key)
                    if isinstance(value, str):
                        match = NO_RE.match(value)
                        if match:
                            return int(match.group(1))
            return None

        numbers = [no_number(item) for item in payload]
        present = [number for number in numbers if number is not None]
        if len(present) >= 2 and len(present) >= len(payload) * 0.7:
            indexed = list(enumerate(payload))
            indexed.sort(key=lambda pair: (
                no_number(pair[1]) is None,
                no_number(pair[1]) if no_number(pair[1]) is not None else pair[0],
                pair[0],
            ))
            payload[:] = [item for _, item in indexed]
        return payload

    return payload


def candidate_title_json_files() -> list[Path]:
    candidates: set[Path] = set()
    if not PUBLIC.exists():
        return []
    for path in PUBLIC.rglob("*.json"):
        rel = path.relative_to(PUBLIC).as_posix().lower()
        name = path.name.lower()
        if path.stat().st_size > 50_000_000:
            continue
        if any(token in name for token in ("story-title", "story_title", "localization", "translation", "titles")):
            candidates.add(path)
        elif "story" in rel and any(token in name for token in ("manifest", "index", "group")):
            candidates.add(path)
    explicit = [
        PUBLIC / "downloads" / "story-title-groups.json",
        PUBLIC / "data" / "story-title-groups-v1.json",
        PUBLIC / "data" / "story-v7" / "localization.json",
    ]
    candidates.update(path for path in explicit if path.exists())
    return sorted(candidates)


def patch_html_assets() -> dict[str, int]:
    stats = {"files": 0, "headingsRemoved": 0, "stylesInjected": 0, "scriptsInjected": 0, "markersInjected": 0}
    if not PUBLIC.exists():
        return stats
    nav_pattern = re.compile(
        r"<(?P<tag>div|span|p|header|section)(?P<attrs>[^>]*)class=(?P<q>[\"'])[^\"']*navtext-container[^\"']*(?P=q)(?P<tail>[^>]*)>.*?</(?P=tag)>",
        re.IGNORECASE | re.DOTALL,
    )
    exact_element = re.compile(
        r"<(?P<tag>div|span|p|h1|h2|header)(?P<attrs>[^>]*)>\s*魔法纪录\s*[·・]\s*Magia\s+Exedra\s+魔法少女称呼搜索\s*</(?P=tag)>",
        re.IGNORECASE | re.DOTALL,
    )
    for path in sorted(PUBLIC.rglob("*.html")):
        text = path.read_text(encoding="utf-8-sig")
        original = text
        text, removed_a = nav_pattern.subn("", text)
        text, removed_b = exact_element.subn("", text)
        stats["headingsRemoved"] += removed_a + removed_b
        if 'name="magireco-v22-build"' not in text:
            marker = f'<meta name="magireco-v22-build" content="{BUILD_ID}">\n'
            text = re.sub(r"</head>", marker + "</head>", text, count=1, flags=re.IGNORECASE)
            stats["markersInjected"] += 1
        if "myfile/v22-final.css" not in text:
            tag = f'<link rel="stylesheet" href="/myfile/v22-final.css?build={BUILD_ID}">\n'
            text = re.sub(r"</head>", tag + "</head>", text, count=1, flags=re.IGNORECASE)
            stats["stylesInjected"] += 1
        if "myfile/v22-final.js" not in text:
            tag = f'<script defer src="/myfile/v22-final.js?build={BUILD_ID}"></script>\n'
            text = re.sub(r"</head>", tag + "</head>", text, count=1, flags=re.IGNORECASE)
            stats["scriptsInjected"] += 1
        if text != original:
            path.write_text(text, encoding="utf-8", newline="\n")
            stats["files"] += 1
    return stats


def update_repository_hygiene() -> None:
    gitignore = ROOT / ".gitignore"
    existing = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    additions = [
        "node_modules/", ".cache/", ".pytest_cache/", "coverage/", "dist/",
        "_sources/", "*.log", ".v22-finalize-trigger",
    ]
    lines = existing.splitlines()
    known = set(lines)
    for item in additions:
        if item not in known:
            lines.append(item)
    gitignore.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")

    readme = ROOT / "README.md"
    if readme.exists():
        text = readme.read_text(encoding="utf-8-sig")
        marker = "<!-- v22-authoritative-localization -->"
        if marker not in text:
            text += f"\n\n{marker}\n## V22 权威译名与构建规则\n\n"
            text += "剧情标题按 `国服 libs → 人工审校 → MagiReader → magireco-wiki-data → 保守回退` 的顺序生成。"
            text += "拉丁语、英文专名以及无需改写的日文汉字不会为了统计数字被强行替换。"
            text += "网站生产版本只以 `main` 为准；维护验收见 `.github/workflows/v22-maintenance.yml`。\n"
            readme.write_text(text, encoding="utf-8", newline="\n")


def build_authority_entries(stats: ApplyStats, registry: Registry) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for ja in sorted(stats.observed_titles, key=lambda value: (normalize_text(value), value)):
        selected = registry.best(ja)
        if not selected:
            continue
        entries.append({
            "ja": compact_text(ja),
            "zh": selected.zh,
            "source": selected.source,
            "rank": selected.rank,
            "evidence": selected.evidence,
        })
    return entries


def apply(args: argparse.Namespace) -> int:
    libs_root = Path(args.libs).resolve()
    reader_root = Path(args.reader).resolve()
    registry = Registry()
    collect_existing_pairs(registry)
    jp_to_ids = collect_reader(reader_root, registry)
    collect_wiki_seed(registry)
    official = collect_official(libs_root)

    stats = ApplyStats()
    for path in candidate_title_json_files():
        try:
            payload = json_load(path)
        except Exception as exc:
            raise RuntimeError(f"Cannot parse target title JSON {path}: {exc}") from exc
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        payload = patch_payload(payload, path, registry, official, jp_to_ids, stats)
        encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        after = hashlib.sha256(encoded).hexdigest()
        if before != after:
            path.write_bytes(encoded)
        stats.files += 1

    entries = build_authority_entries(stats, registry)
    authority_payload = {
        "schemaVersion": 1,
        "build": BUILD_ID,
        "generatedAt": now_iso(),
        "authorityOrder": [
            "official-cn-client", "reviewed-human", "magi-reader",
            "wiki-fallback", "structured-rule", "existing-fallback",
            "identity-preserved", "assistant-fallback",
        ],
        "entries": entries,
    }
    json_write(PUBLIC / "data" / "story-title-authority-v22.json", authority_payload)
    json_write(PUBLIC / "downloads" / "story-title-authority-v22.json", authority_payload)

    html_stats = patch_html_assets()
    update_repository_hygiene()

    unresolved_unique: dict[str, dict[str, Any]] = {}
    for item in stats.unresolved:
        unresolved_unique.setdefault(normalize_text(item.get("ja", "")), item)
    unresolved = sorted(unresolved_unique.values(), key=lambda item: normalize_text(item.get("ja", "")))

    report = {
        "schemaVersion": 1,
        "build": BUILD_ID,
        "generatedAt": now_iso(),
        "sourceRoots": {"libs": str(libs_root), "reader": str(reader_root)},
        "officialTableCounts": {kind: len(values) for kind, values in official.items()},
        "readerIdBridgeTitles": len(jp_to_ids),
        "registryTitles": len(registry),
        "targetFilesScanned": stats.files,
        "titleNodesScanned": stats.nodes,
        "changedFields": stats.changed,
        "authorityEntries": len(entries),
        "sourceCounts": dict(stats.sources.most_common()),
        "unresolvedCount": len(unresolved),
        "unresolved": unresolved,
        "conflictCount": len(registry.conflicts),
        "conflicts": registry.conflicts[:5000],
        "html": html_stats,
        "sampleChanges": stats.changes[:1000],
        "policy": {
            "latinAndEnglishMayRemain": True,
            "unchangedJapaneseHanMayRemain": True,
            "kanaInChineseTranslationIsUnresolved": True,
        },
    }
    json_write(REPORTS / "v22-translation-report.json", report)
    json_write(PUBLIC / "data" / "v22-translation-report.json", report)

    tsv = REPORTS / "v22-unresolved-titles.tsv"
    tsv.parent.mkdir(parents=True, exist_ok=True)
    with tsv.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("ja\tcurrentZh\tfile\tpath\n")
        for item in unresolved:
            fields = [str(item.get(key, "")).replace("\t", " ").replace("\n", " ") for key in ("ja", "currentZh", "file", "path")]
            handle.write("\t".join(fields) + "\n")

    print(json.dumps({
        "build": BUILD_ID,
        "authorityEntries": len(entries),
        "changedFields": stats.changed,
        "unresolvedCount": len(unresolved),
        "sourceCounts": dict(stats.sources.most_common()),
        "html": html_stats,
    }, ensure_ascii=False, indent=2))
    return 0


class AuditHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        for key in ("src", "href"):
            value = values.get(key)
            if value:
                self.refs.append((key, value))


def resolve_static_ref(html_path: Path, ref: str) -> Path | None:
    ref = html.unescape(ref).strip()
    if not ref or ref.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
        return None
    split = urlsplit(ref)
    if split.scheme or split.netloc or ref.startswith("//"):
        return None
    clean = unquote(split.path)
    if not clean or clean == "/":
        return PUBLIC / "index.html"
    return (PUBLIC / clean.lstrip("/")) if clean.startswith("/") else (html_path.parent / clean)


def audit(args: argparse.Namespace) -> int:
    critical: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    json_count = 0
    for path in ROOT.rglob("*.json"):
        if any(part in {".git", "node_modules", "_sources"} for part in path.parts):
            continue
        try:
            json_load(path)
            json_count += 1
        except Exception as exc:
            critical.append({"type": "invalid-json", "file": path.relative_to(ROOT).as_posix(), "error": str(exc)})

    html_count = 0
    missing_refs: list[dict[str, str]] = []
    duplicate_ids: list[dict[str, Any]] = []
    obsolete_visible: list[str] = []
    for path in PUBLIC.rglob("*.html"):
        html_count += 1
        text = path.read_text(encoding="utf-8-sig")
        parser = AuditHTMLParser()
        parser.feed(text)
        duplicates = sorted(key for key, count in collections.Counter(parser.ids).items() if key and count > 1)
        if duplicates:
            duplicate_ids.append({"file": path.relative_to(ROOT).as_posix(), "ids": duplicates})
        body_without_title = re.sub(r"<title\b[^>]*>.*?</title>", "", text, flags=re.IGNORECASE | re.DOTALL)
        if OBSOLETE_SITE_TITLE in re.sub(r"<[^>]+>", "", body_without_title):
            obsolete_visible.append(path.relative_to(ROOT).as_posix())
        for _, ref in parser.refs:
            target = resolve_static_ref(path, ref)
            if target is None:
                continue
            if not target.exists() and not target.with_name("index.html").exists():
                missing_refs.append({"file": path.relative_to(ROOT).as_posix(), "ref": ref})

    if obsolete_visible:
        critical.append({"type": "obsolete-visible-heading", "files": obsolete_visible})
    if missing_refs:
        warnings.append({"type": "missing-static-references", "count": len(missing_refs), "items": missing_refs[:500]})
    if duplicate_ids:
        warnings.append({"type": "duplicate-html-ids", "count": len(duplicate_ids), "items": duplicate_ids[:200]})

    authority_path = PUBLIC / "data" / "story-title-authority-v22.json"
    authority_entries = 0
    kana_zh = []
    if authority_path.exists():
        payload = json_load(authority_path)
        entries = payload.get("entries", []) if isinstance(payload, dict) else []
        authority_entries = len(entries)
        kana_zh = [entry for entry in entries if isinstance(entry, dict) and contains_kana(entry.get("zh", ""))]
        if kana_zh:
            critical.append({"type": "kana-in-chinese-authority-map", "count": len(kana_zh), "items": kana_zh[:100]})
    else:
        critical.append({"type": "missing-authority-map", "file": authority_path.relative_to(ROOT).as_posix()})

    index = PUBLIC / "index.html"
    index_text = index.read_text(encoding="utf-8-sig") if index.exists() else ""
    for required in (BUILD_ID, "myfile/v22-final.css", "myfile/v22-final.js"):
        if required not in index_text:
            critical.append({"type": "missing-index-marker", "value": required})

    css_path = PUBLIC / "myfile" / "v22-final.css"
    css_text = css_path.read_text(encoding="utf-8-sig") if css_path.exists() else ""
    for required in ("width: max-content", "overflow-y: auto", "navtext-container"):
        if required not in css_text:
            critical.append({"type": "missing-menu-safeguard", "value": required})

    workflow_refs: list[dict[str, str]] = []
    workflows = ROOT / ".github" / "workflows"
    if workflows.exists():
        for path in workflows.glob("*.y*ml"):
            text = path.read_text(encoding="utf-8-sig")
            for branch in ("safe-v18-production-fix", "safe-v20-production-fix", "v16-delivery-source-final"):
                if branch in text:
                    workflow_refs.append({"file": path.relative_to(ROOT).as_posix(), "branch": branch})
    if workflow_refs:
        critical.append({"type": "obsolete-branch-workflow-reference", "items": workflow_refs})

    node_modules_tracked = (ROOT / "node_modules").exists()
    if node_modules_tracked:
        warnings.append({"type": "node-modules-present", "path": "node_modules"})

    translation_report = {}
    translation_report_path = REPORTS / "v22-translation-report.json"
    if translation_report_path.exists():
        translation_report = json_load(translation_report_path)

    report = {
        "schemaVersion": 1,
        "build": BUILD_ID,
        "generatedAt": now_iso(),
        "state": "pass" if not critical else "fail",
        "criticalCount": len(critical),
        "warningCount": len(warnings),
        "critical": critical,
        "warnings": warnings,
        "metrics": {
            "jsonFilesParsed": json_count,
            "htmlFilesParsed": html_count,
            "authorityEntries": authority_entries,
            "authorityKanaTranslations": len(kana_zh),
            "missingStaticReferences": len(missing_refs),
            "duplicateIdFiles": len(duplicate_ids),
            "translationUnresolvedCount": translation_report.get("unresolvedCount"),
            "translationChangedFields": translation_report.get("changedFields"),
        },
        "knownNonCriticalLimitations": [
            "Latin-script canonical names are preserved when that is the established form.",
            "Japanese titles consisting only of shared Han characters may remain unchanged when no wording change is needed.",
            "The unresolved-title TSV is retained for future human review; it is not silently filled with fabricated names.",
        ],
    }
    json_write(REPORTS / "v22-site-audit.json", report)
    json_write(PUBLIC / "data" / "v22-site-audit.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if args.strict and critical else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--libs", required=True)
    apply_parser.add_argument("--reader", required=True)
    audit_parser = subparsers.add_parser("audit")
    audit_parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "apply":
        return apply(args)
    if args.command == "audit":
        return audit(args)
    raise AssertionError(args.command)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"V22 failure: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
