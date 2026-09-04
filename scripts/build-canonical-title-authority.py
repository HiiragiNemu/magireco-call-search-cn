#!/usr/bin/env python3
"""Build one traceable Call/Reader title authority catalogue.

Field authority is fixed and intentionally explicit:

1. Simplified-Chinese game client tables (magireco-cn-patch);
2. MagiReader's title for the same story;
3. magireco-wiki-data;
4. the existing Call title as the LLM/rule fallback.

The script never guesses a stable story ID from a translated title.  Reader
links are emitted only when a Reader source identity or an exact structural
chapter/character key proves the relationship.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import unicodedata
from typing import Any, Iterable

from cn_terminology import canonicalize_cn_visible


ROOT = Path(__file__).resolve().parents[1]
AUTHORITY_PATH = ROOT / "data" / "titles" / "authority.json"
PROVENANCE_PATH = ROOT / "data" / "titles" / "authority-provenance.json"
READER_LINKS_PATH = ROOT / "data" / "titles" / "reader-links.json"
GROUPS_PATH = ROOT / "public" / "data" / "story-title-groups-v1.json"
LOCALIZATION_PATH = ROOT / "public" / "data" / "story-v7" / "localization.json"

SOURCE_PRIORITY = [
    "magireco-cn-patch/magica/js/libs",
    "MagiReader",
    "magireco-wiki-data",
    "LLM/rule fallback",
]
FIELD_AUTHORITY = {
    "titleZh": SOURCE_PRIORITY,
    "titleJa": ["MagiReader", "original Japanese source"],
    "titleRomaji": ["MagiReader"],
    "compositionRule": (
        "magireco-cn-patch only decides the Chinese field; Reader Japanese, "
        "romanized and other trailing title components are preserved"
    ),
}
RANK = {
    "official-cn": 400,
    "reader": 300,
    "wiki": 200,
    "llm-fallback": 100,
}

KANA_RE = re.compile(r"[\u3040-\u30ff]")
SPACE_RE = re.compile(r"[\s\u3000]+")
EPISODE_CN_RE = re.compile(r"^(?P<prefix>第\s*\d+\s*话)\s*(?P<title>.*)$")
CHARACTER_STORY_RE = re.compile(
    r"^(?P<name>.+?)\s+(?P<episode>\d+)話(?P<english>\(英語版\))?$"
)
MAIN_STORY_RE = re.compile(r"^(?P<chapter>\d+)章(?P<episode>\d+)話$")
MAIN_PROLOGUE_RE = re.compile(r"^序章(?P<episode>\d+)話$")
MEMORIA_RE = re.compile(r"^No\.(?P<number>\d+)\s+", re.IGNORECASE)

# Explicit user-approved canonical character names.  The dynamically discovered
# Reader-over-Wiki aliases below extend this list for the same JP character,
# but these spellings are hard invariants for every fallback title.
EXPLICIT_NAME_ALIASES = {
    "小圆前辈·小伊吕波": "小圆前辈·小彩羽",
    "无限大小伊吕波": "无限大小彩羽",
    "伊吕波·黑江": "彩羽·黑江",
    "圆·伊吕波": "圆·彩羽",
    "∞伊吕波": "∞彩羽",
    "万年樱之谣": "万年樱的传闻",
    "常盘七夏": "常盘七香",
    "环伊吕波": "环彩羽",
    "小伊吕波": "小彩羽",
    "毬子彩花": "毬子亚弥华",
    "伊萨博": "伊莎贝拉",
    "八云美玉": "八云御魂",
    "环羽衣": "环忧",
    "谣莎奈": "传闻莎奈",
    "谣鹤乃": "传闻鹤乃",
}


@dataclass(frozen=True)
class Candidate:
    value: str
    source: str
    detail: str
    rank: int
    specificity: int = 1
    reader_ids: tuple[str, ...] = ()
    reader_source_identities: tuple[str, ...] = ()
    official_ids: tuple[str, ...] = ()
    wiki_keys: tuple[str, ...] = ()


@dataclass
class ReaderData:
    exact: dict[str, Candidate] = field(default_factory=dict)
    names: dict[str, Candidate] = field(default_factory=dict)
    main: dict[tuple[str, int, int], Candidate] = field(default_factory=dict)
    character: dict[tuple[str, int], Candidate] = field(default_factory=dict)
    catalog_entries: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class WikiData:
    names: dict[str, Candidate] = field(default_factory=dict)
    memoria_by_number: dict[int, Candidate] = field(default_factory=dict)
    memoria_by_name: dict[str, Candidate] = field(default_factory=dict)
    main: dict[tuple[str, int, int], Candidate] = field(default_factory=dict)
    event_chapters_by_zh: dict[str, tuple[str, ...]] = field(default_factory=dict)


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(encode_json(value), encoding="utf-8", newline="\n")


def clean(value: Any) -> str:
    # NFKC expands the single ellipsis glyph into three ASCII periods; protect
    # it so Reader's authored punctuation survives Chinese-field replacement.
    raw = str(value or "").replace("…", "\ue000")
    text = unicodedata.normalize("NFKC", raw).replace("\ue000", "…")
    text = text.replace("〜", "～").replace("~", "～").replace("・", "·")
    return SPACE_RE.sub(" ", text).strip()


def literal(value: Any) -> str:
    """Trim an opaque identifier without Unicode or punctuation rewriting."""

    return str(value or "").strip()


def key(value: Any) -> str:
    return SPACE_RE.sub("", clean(value)).replace("～", "~").casefold()


def cn_key(value: Any) -> str:
    return re.sub(r"[\s\u3000·・,，。.!！?？~～—－-]+", "", clean(value)).casefold()


def has_kana(value: Any) -> bool:
    return bool(KANA_RE.search(str(value or "")))


def usable_chinese(value: Any) -> bool:
    text = clean(value)
    return bool(text) and not has_kana(text)


def title_identity_key(value: Any) -> str:
    """Compare title text while ignoring spacing and punctuation variants."""

    return re.sub(r"[\W_]+", "", clean(value), flags=re.UNICODE).casefold()


def official_field_is_localized(
    official_value: Any,
    japanese_value: Any = "",
    lower_chinese_value: Any = "",
) -> bool:
    """Reject a JP value copied unchanged into an otherwise CN client table.

    Identical JP/CN wording remains valid when the lower source agrees.  A
    field is treated as an untranslated JP carry-over only when the official
    value equals the same-story JP title and Reader/Wiki already supplies a
    distinct Chinese title.
    """

    official = clean(official_value)
    japanese = clean(japanese_value)
    lower_chinese = clean(lower_chinese_value)
    if not usable_chinese(official):
        return False
    if not japanese or not lower_chinese:
        return True
    official_key = title_identity_key(official)
    japanese_key = title_identity_key(japanese)
    lower_key = title_identity_key(lower_chinese)
    return not (
        official_key
        and official_key == japanese_key
        and lower_key
        and lower_key != japanese_key
    )


def split_bilingual(
    value: Any,
    japanese_hint: Any = "",
) -> tuple[str, str] | None:
    """Return (Japanese, Chinese) for Reader's combined display title."""

    text = literal(value)
    hint = literal(japanese_hint)
    if hint:
        if has_kana(hint):
            # An untranslated JP carry-over is a direct suffix anchor.
            hint_index = text.rfind(hint)
            if hint_index > 0:
                chinese = clean(text[:hint_index].strip(" /|｜"))
                if chinese and not has_kana(chinese):
                    return literal(text[hint_index:]), chinese
        else:
            # A localized official title anchors the end of the Chinese field,
            # never the start of titleJa.  This also handles all-kanji JP
            # suffixes that contain no kana and therefore need an exact field
            # boundary rather than a script heuristic.
            hint_index = text.find(hint)
            if hint_index >= 0:
                prefix = text[:hint_index].strip(" /|｜")
                suffix = text[hint_index + len(hint):].strip(" /|｜")
                # Remove one prior generated duplicate only when a real
                # Japanese remainder follows it ("中文 中文 日本語").
                duplicate_prefix = f"{hint} "
                if suffix.startswith(duplicate_prefix):
                    remainder = suffix[len(duplicate_prefix):].strip()
                    if remainder and has_kana(remainder):
                        suffix = remainder
                chinese = clean(f"{prefix} {hint}".strip())
                if chinese and suffix and not has_kana(chinese):
                    return literal(suffix), chinese

    match = KANA_RE.search(text)
    if not match:
        return None
    start = match.start()
    while start > 0 and text[start - 1] not in " \t\n/|｜":
        start -= 1
    chinese = clean(text[:start].strip(" /|｜"))
    japanese = literal(text[start:])
    if not chinese or not japanese or has_kana(chinese):
        return None
    return japanese, chinese


def split_reader_folder(value: Any) -> tuple[str, str, str] | None:
    text = clean(value)
    match = re.match(r"^(?P<id>\d{4})\s*-\s*(?P<cn>.+)[（(](?P<jp>.+)[）)]$", text)
    if not match:
        return None
    return match.group("id"), clean(match.group("jp")), clean(match.group("cn"))


def cn_episode_parts(value: str) -> tuple[str, str]:
    match = EPISODE_CN_RE.match(clean(value))
    if not match:
        return "", clean(value)
    prefix = re.sub(r"\s+", "", match.group("prefix"))
    return prefix, clean(match.group("title"))


def compose_episode(owner: str, episode: int, actual: str, *, english: bool = False) -> str:
    result = f"{owner} 第{episode}话"
    if actual:
        result += f"｜{actual}"
    if english:
        result += "（英语版）"
    return result


def compose_main(chapter: int, episode: int, actual: str, *, prologue: bool = False) -> str:
    prefix = f"序章 第{episode}话" if prologue else f"第{chapter}章 第{episode}话"
    return prefix + (f"｜{actual}" if actual else "")


def better(left: Candidate | None, right: Candidate) -> Candidate:
    if left is None:
        return right
    return max(
        (left, right),
        key=lambda item: (item.rank, item.specificity, item.source, item.detail),
    )


def git_state(path: Path) -> dict[str, Any]:
    def run(*args: str) -> str:
        try:
            return subprocess.check_output(
                ["git", "-C", str(path), *args],
                text=True,
                encoding="utf-8",
                errors="replace",
                stderr=subprocess.DEVNULL,
            ).strip()
        except (OSError, subprocess.CalledProcessError):
            return ""

    return {
        "path": str(path),
        "head": run("rev-parse", "HEAD"),
        "branch": run("branch", "--show-current"),
        "dirty": bool(run("status", "--porcelain")),
    }


def load_official(libs: Path) -> dict[str, Any]:
    def indexed(filename: str, id_field: str, value_field: str) -> dict[str, str]:
        result: dict[str, str] = {}
        for record in load_json(libs / filename):
            identifier = str(record.get(id_field) or "").strip()
            value = clean(record.get(value_field))
            if identifier and usable_chinese(value):
                result[identifier] = value
        return result

    raw_pieces = load_json(libs / "pieceList.json")
    raw_sections = load_json(libs / "sectionList.json")
    raw_characters = load_json(libs / "charaList.json")
    return {
        "pieces": indexed("pieceList.json", "pieceId", "pieceName"),
        # Call's No.N is the displayed ordinal, not pieceId - 1000.  The CN
        # client list and Call snapshot contain the same 1,038 ordered rows.
        "pieceSequence": [
            (str(record.get("pieceId") or ""), clean(record.get("pieceName")))
            for record in raw_pieces
        ],
        "sectionRaw": {
            str(record.get("sectionId") or ""): literal(record.get("title"))
            for record in raw_sections
            if str(record.get("sectionId") or "").strip()
        },
        "characterRaw": {
            str(record.get("id") or ""): literal(record.get("name"))
            for record in raw_characters
            if str(record.get("id") or "").strip()
        },
        "tableRows": {
            "pieceList": len(raw_pieces),
            "charaList": len(raw_characters),
            "sectionList": len(raw_sections),
            "eventList": len(load_json(libs / "eventList.json")),
            "chapterList": len(load_json(libs / "chapterList.json")),
        },
        "characters": indexed("charaList.json", "id", "name"),
        "sections": indexed("sectionList.json", "sectionId", "title"),
        "events": indexed("eventList.json", "eventId", "eventName"),
        "chapters": indexed("chapterList.json", "chapterId", "title"),
    }


def reader_main_key(raw_id: str, folder: str) -> tuple[str, int, int] | None:
    if not raw_id.isdigit() or len(raw_id) < 6:
        return None
    folder = clean(folder)
    category = ""
    chapter_text = ""
    side_match = re.search(r"支线剧情\(AS\)\s*第(?P<part>[IⅡV]+)部\s*第(?P<chapter>\d+)章", folder)
    if side_match:
        category = (
            "アナザー【第1部】"
            if side_match.group("part") in {"I", "Ⅰ"}
            else "アナザー【第2部】"
        )
        chapter_text = side_match.group("chapter")
    elif "Puella Historia" in folder:
        return None
    elif re.search(r"第II部\s*序章", folder):
        category = "メイン【第2部】"
        chapter_text = "0"
    else:
        main_match = re.search(
            r"第(?P<part>I|II)部\s*第(?P<chapter>\d+)章", folder
        )
        if main_match:
            category = (
                "メイン【第1部】"
                if main_match.group("part") == "I"
                else "メイン【第2部】"
            )
            chapter_text = main_match.group("chapter")
    episode_text = raw_id[-2:]
    if not category or not chapter_text.isdigit() or not episode_text.isdigit():
        return None
    return category, int(chapter_text), int(episode_text)


def pick_reader_entry(existing: Candidate | None, candidate: Candidate) -> Candidate:
    """Prefer official-backed, titled and stable Reader entries over aliases."""

    if existing is None:
        return candidate
    return max(
        (existing, candidate),
        key=lambda item: (
            item.rank,
            bool(item.value.partition("｜")[2]),
            not item.reader_source_identities[0].endswith("_1-3")
            if item.reader_source_identities
            else False,
            item.reader_source_identities,
        ),
    )


def load_reader(
    reader_root: Path,
    official: dict[str, Any],
    localization: dict[str, Any],
) -> ReaderData:
    index_path = reader_root / "website" / "public" / "story_index.json"
    titles_path = reader_root / "titles.json"
    index = load_json(index_path)
    titles = load_json(titles_path)
    result = ReaderData()
    official_sections: dict[str, str] = official["sections"]
    official_characters: dict[str, str] = official["characters"]

    # Stable Reader folders establish the JP name -> CN name relationship and,
    # when IDs agree, the higher official-client character name.
    for item in index:
        if item.get("category") not in {"character_story", "costume_story"}:
            continue
        folder_parts = split_reader_folder(item.get("folder"))
        if not folder_parts:
            continue
        character_id, japanese, reader_chinese = folder_parts
        reader_candidate = Candidate(
            reader_chinese,
            "reader",
            f"story_index folder:{character_id}",
            RANK["reader"],
            specificity=2,
        )
        result.names[key(japanese)] = better(result.names.get(key(japanese)), reader_candidate)
        official_name = official_characters.get(character_id)
        if official_name and not official_field_is_localized(
            official_name, japanese, reader_chinese
        ):
            official_name = ""
        if official_name:
            official_candidate = Candidate(
                official_name,
                "official-cn",
                f"charaList:{character_id}",
                RANK["official-cn"],
                specificity=2,
                official_ids=(f"charaList:{character_id}",),
            )
            result.names[key(japanese)] = better(
                result.names.get(key(japanese)), official_candidate
            )

    # Exact bilingual cells remain a Reader source.  They are deliberately
    # loaded before structural story links; structural links carry stable IDs.
    for title_key, value in titles.items():
        raw_id_match = re.match(r"^(\d{6})", clean(title_key))
        raw_id = raw_id_match.group(1) if raw_id_match else ""
        pair = split_bilingual(
            value,
            official["sections"].get(
                raw_id,
                official["sectionRaw"].get(raw_id, ""),
            ),
        )
        if not pair:
            continue
        japanese, chinese = pair
        result.exact[key(japanese)] = better(
            result.exact.get(key(japanese)),
            Candidate(
                chinese,
                "reader",
                f"titles.json:{title_key}",
                RANK["reader"],
            ),
        )

    for item in index:
        title = literal(item.get("title"))
        raw_id = clean(item.get("raw_id"))
        section_title_hint = official["sections"].get(
            raw_id,
            official["sectionRaw"].get(raw_id, ""),
        )
        pair = split_bilingual(title, section_title_hint)
        if not pair:
            # Already-materialized Reader fields are an exact, non-fuzzy
            # fallback for all-kanji or Latin JP suffixes that have no kana.
            explicit_cn = literal(item.get("title_cn"))
            explicit_jp = literal(item.get("title_jp"))
            if explicit_cn and explicit_jp:
                pair = (explicit_jp, explicit_cn)
        if pair:
            japanese, chinese = pair
            result.exact[key(japanese)] = better(
                result.exact.get(key(japanese)),
                Candidate(
                    chinese,
                    "reader",
                    f"story_index:{item.get('source_identity') or item.get('id')}",
                    RANK["reader"],
                ),
            )

        # source_identity is an opaque Reader join key.  Preserve its exact
        # Unicode spelling (full-width brackets and Japanese middle dots
        # included) so the generated catalogue joins without fuzzy matching.
        source_identity = literal(item.get("source_identity"))
        file_stem = clean(item.get("file_stem")) or (
            source_identity.rsplit("/", 1)[-1] if source_identity else ""
        )
        reader_id = clean(item.get("id"))
        cn_title = pair[1] if pair else ""
        jp_title = pair[0] if pair else ""
        episode_prefix, reader_actual = cn_episode_parts(cn_title)
        official_actual = official_sections.get(raw_id)
        if official_actual and not official_field_is_localized(
            official_actual, jp_title or section_title_hint, reader_actual
        ):
            official_actual = ""
        chosen_actual = official_actual or reader_actual
        chosen_source = "official-cn" if official_actual else "reader"
        chosen_detail = (
            f"sectionList:{raw_id} via Reader {source_identity}"
            if official_actual
            else f"Reader {source_identity}"
        )
        canonical_cn = (
            f"{episode_prefix} {chosen_actual}".strip()
            if episode_prefix
            else (chosen_actual or cn_title)
        )
        display_title = (
            f"{canonical_cn} {jp_title}".strip() if jp_title else canonical_cn
        )

        if source_identity and display_title and pair:
            result.catalog_entries[source_identity] = {
                "readerId": reader_id,
                "rawId": raw_id,
                "fileStem": file_stem,
                "titleZh": canonical_cn,
                "titleJa": jp_title,
                "titleSuffix": jp_title,
                "displayTitle": display_title,
                "source": chosen_source,
                "detail": chosen_detail,
                "officialId": f"sectionList:{raw_id}" if official_actual else "",
            }

        links = {
            "reader_ids": (reader_id,) if reader_id else (),
            "reader_source_identities": (source_identity,) if source_identity else (),
            "official_ids": (f"sectionList:{raw_id}",) if official_actual else (),
        }
        main_key = reader_main_key(raw_id, clean(item.get("folder")))
        if item.get("category") == "main_story" and main_key:
            _, chapter, episode = main_key
            actual = official_actual or reader_actual
            candidate = Candidate(
                compose_main(chapter, episode, actual, prologue=chapter == 0),
                chosen_source,
                chosen_detail,
                RANK[chosen_source],
                specificity=4,
                **links,
            )
            result.main[main_key] = pick_reader_entry(result.main.get(main_key), candidate)

        if item.get("category") == "character_story":
            folder_parts = split_reader_folder(item.get("folder"))
            episode_match = EPISODE_CN_RE.match(cn_title)
            episode = int(re.sub(r"\D", "", episode_match.group("prefix"))) if episode_match else 0
            if not episode and raw_id.isdigit():
                episode = int(raw_id[-1])
            if folder_parts and episode:
                character_id, japanese_name, reader_name = folder_parts
                official_name = official_characters.get(character_id)
                if official_name and not official_field_is_localized(
                    official_name, japanese_name, reader_name
                ):
                    official_name = ""
                owner = official_name or reader_name
                actual = official_actual or reader_actual
                source = "official-cn" if official_name or official_actual else "reader"
                detail = ", ".join(
                    part
                    for part in (
                        f"charaList:{character_id}" if official_name else "",
                        f"sectionList:{raw_id}" if official_actual else "",
                        f"Reader {source_identity}",
                    )
                    if part
                )
                official_ids = tuple(
                    part
                    for part in (
                        f"charaList:{character_id}" if official_name else "",
                        f"sectionList:{raw_id}" if official_actual else "",
                    )
                    if part
                )
                candidate = Candidate(
                    compose_episode(owner, episode, actual),
                    source,
                    detail,
                    RANK[source],
                    specificity=5,
                    reader_ids=links["reader_ids"],
                    reader_source_identities=links["reader_source_identities"],
                    official_ids=official_ids,
                )
                map_key = (key(japanese_name), episode)
                result.character[map_key] = pick_reader_entry(
                    result.character.get(map_key), candidate
                )

    # The 34 event prefixes were derived from Reader folders.  Their source is
    # Reader, not an independent human-signoff tier.
    for item in localization.get("titlePrefixes", []):
        if not isinstance(item, dict):
            continue
        japanese = clean(item.get("jp"))
        chinese = clean(item.get("zh"))
        if japanese and chinese:
            result.exact[key(japanese)] = better(
                result.exact.get(key(japanese)),
                Candidate(
                    chinese,
                    "reader",
                    f"localization.titlePrefixes:{item.get('source') or 'Reader folder'}",
                    RANK["reader"],
                    specificity=3,
                ),
            )
    return result


def wiki_title(value: dict[str, Any], fallback: str = "") -> str:
    for field_name in ("name_sc", "name_zh", "nameZh", "name_tw"):
        candidate = clean(value.get(field_name))
        if candidate:
            return candidate
    return clean(fallback)


def load_wiki(wiki_root: Path) -> WikiData:
    data_root = wiki_root / "data" if (wiki_root / "data").is_dir() else wiki_root
    result = WikiData()

    characters = load_json(data_root / "characters.json")
    for wiki_key, item in characters.items():
        if not isinstance(item, dict):
            continue
        japanese = clean(item.get("nameJa") or item.get("dataTable"))
        chinese = wiki_title(item, str(wiki_key))
        if japanese and chinese:
            result.names[key(japanese)] = Candidate(
                chinese,
                "wiki",
                f"characters.json:{wiki_key}",
                RANK["wiki"],
                specificity=2,
                wiki_keys=(f"characters:{wiki_key}",),
            )

    memoria = load_json(data_root / "memoria.json")
    for wiki_key, item in memoria.items():
        if not isinstance(item, dict):
            continue
        japanese = clean(item.get("name_ja") or wiki_key)
        chinese = wiki_title(item)
        if not japanese or not chinese:
            continue
        candidate = Candidate(
            chinese,
            "wiki",
            f"memoria.json:{wiki_key}",
            RANK["wiki"],
            specificity=3,
            wiki_keys=(f"memoria:{wiki_key}",),
        )
        result.memoria_by_name[key(japanese)] = candidate
        number = item.get("number")
        try:
            numeric = int(number)
        except (TypeError, ValueError):
            numeric = 0
        if numeric:
            result.memoria_by_number[numeric] = candidate

    event_chapters: dict[str, set[str]] = defaultdict(set)
    stories = load_json(data_root / "story.json")
    for wiki_key, item in stories.items():
        if not isinstance(item, dict):
            continue
        category = clean(item.get("category"))
        chapter_text = clean(item.get("chapter"))
        episode_text = clean(item.get("episode"))
        headings = item.get("headings") or []
        heading = clean(headings[0].get("text")) if headings and isinstance(headings[0], dict) else ""
        actual = re.sub(r"^\d+\s*话\s*", "", heading).strip()
        episode_match = re.search(r"(\d+)\s*话", episode_text)
        if category in {"主线剧情", "支线剧情"} and episode_match:
            second_part = "第2部" in chapter_text
            chapter_matches = re.findall(r"第(\d+)章", chapter_text)
            if chapter_matches:
                chapter = int(chapter_matches[-1])
                episode = int(episode_match.group(1))
                call_category = (
                    "メイン【第2部】"
                    if category == "主线剧情" and second_part
                    else "メイン【第1部】"
                    if category == "主线剧情"
                    else "アナザー【第2部】"
                    if second_part
                    else "アナザー【第1部】"
                )
                result.main[(call_category, chapter, episode)] = Candidate(
                    compose_main(chapter, episode, actual),
                    "wiki",
                    f"story.json:{wiki_key}",
                    RANK["wiki"],
                    specificity=4,
                    wiki_keys=(f"story:{wiki_key}",),
                )
        if category == "活动剧情" and chapter_text:
            event_chapters[cn_key(chapter_text)].add(str(wiki_key))
    result.event_chapters_by_zh = {
        normalized: tuple(sorted(keys))
        for normalized, keys in event_chapters.items()
        if normalized
    }
    return result


def build_name_aliases(reader: ReaderData, wiki: WikiData) -> dict[str, str]:
    """Build lower-source spellings that must follow Reader character names."""

    aliases: dict[str, str] = {}
    for japanese_key, wiki_candidate in wiki.names.items():
        reader_candidate = reader.names.get(japanese_key)
        if not reader_candidate:
            continue
        old = clean(wiki_candidate.value)
        new = clean(reader_candidate.value)
        if len(old) >= 2 and old != new:
            aliases[old] = new
    # Explicit decisions override any mechanically discovered pair.
    aliases.update(EXPLICIT_NAME_ALIASES)
    return dict(
        sorted(
            ((old, new) for old, new in aliases.items() if old and old != new),
            key=lambda item: (-len(item[0]), item[0]),
        )
    )


def canonicalize_candidate_names(
    candidate: Candidate,
    aliases: dict[str, str],
) -> Candidate:
    value = candidate.value
    applied: list[str] = []
    for old, new in aliases.items():
        if old in value:
            value = value.replace(old, new)
            applied.append(f"{old}→{new}")
    terminology_value = canonicalize_cn_visible(value)
    if terminology_value != value:
        value = terminology_value
        applied.append("Reader authority terminology")
    if value == candidate.value:
        return candidate
    return Candidate(
        clean(value),
        candidate.source,
        candidate.detail + "; canonical names " + ", ".join(applied),
        candidate.rank,
        candidate.specificity,
        candidate.reader_ids,
        candidate.reader_source_identities,
        candidate.official_ids,
        candidate.wiki_keys,
    )


def canonicalize_reader_catalog_names(
    reader: ReaderData,
    aliases: dict[str, str],
) -> int:
    """Normalize only Reader's Chinese field and retain its complete suffix."""

    changed = 0
    for record in reader.catalog_entries.values():
        title_zh = str(record.get("titleZh") or "")
        canonical = title_zh
        applied: list[str] = []
        for old, new in aliases.items():
            if old in canonical:
                canonical = canonical.replace(old, new)
                applied.append(f"{old}→{new}")
        terminology_value = canonicalize_cn_visible(canonical)
        if terminology_value != canonical:
            canonical = terminology_value
            applied.append("Reader authority terminology")
        if canonical == title_zh:
            continue
        suffix = str(record.get("titleSuffix") or record.get("titleJa") or "").strip()
        record["titleZh"] = canonical
        record["displayTitle"] = f"{canonical} {suffix}".strip()
        record["detail"] = (
            str(record.get("detail") or "")
            + "; canonical names "
            + ", ".join(applied)
        )
        changed += 1
    return changed


def longest_name_candidate(
    source: str,
    mapping: dict[str, Candidate],
) -> tuple[str, Candidate] | None:
    normalized = key(source)
    matches = [
        (candidate_key, candidate)
        for candidate_key, candidate in mapping.items()
        if candidate_key and normalized.startswith(candidate_key)
    ]
    if not matches:
        return None
    return max(matches, key=lambda item: (len(item[0]), item[1].rank, item[0]))


def canonical_parent_from_child(
    full_value: str,
    group: dict[str, Any],
    child: dict[str, Any],
) -> str:
    """Remove one child's structural suffix without leaving a bare ``第``.

    Older Call rows often stored ``10话`` while the canonical title correctly
    normalized it to ``第10话``.  Removing only the older suffix used to leave
    a bogus trailing ``第`` in parent labels.
    """

    full = clean(full_value)
    source_suffix = clean(child.get("source_suffix"))
    if not source_suffix:
        return full

    old_parent = clean(group.get("current_translation"))
    old_full = clean(child.get("current_full_translation"))
    localized_suffix = clean(child.get("localized_suffix"))
    suffixes: set[str] = {
        value for value in (source_suffix, localized_suffix) if value
    }
    if old_parent and old_full.startswith(old_parent):
        remainder = clean(old_full[len(old_parent) :])
        if remainder:
            suffixes.add(remainder)

    expanded = set(suffixes)
    for suffix in suffixes:
        # Grouping metadata is source-derived and therefore often retains
        # Japanese ``話`` even when the canonical Chinese child ends in
        # ``第N话``.  Compare both visible-script variants before stripping.
        visible_suffix = suffix.replace("話", "话")
        expanded.add(visible_suffix)
        if re.match(r"^\d+\s*(?:話|话|章|天|日|幕|部)", visible_suffix):
            expanded.add("第" + visible_suffix)

    for suffix in sorted(expanded, key=len, reverse=True):
        if suffix and full.endswith(suffix):
            return full[: -len(suffix)].rstrip()
    return full


def compose_parent_candidate(
    group: dict[str, Any],
    child: dict[str, Any],
    current: str,
    parent: Candidate,
) -> Candidate:
    old_parent = clean(group.get("current_translation"))
    child_current = clean(child.get("current_full_translation")) or current
    current_parent = canonical_parent_from_child(current, group, child)
    if current_parent and current.startswith(current_parent):
        value = parent.value + current[len(current_parent):]
    elif old_parent and child_current.startswith(old_parent):
        value = parent.value + child_current[len(old_parent):]
    elif old_parent and current.startswith(old_parent):
        value = parent.value + current[len(old_parent):]
    else:
        suffix = clean(child.get("localized_suffix"))
        value = parent.value + (f" {suffix}" if suffix else "")
    return Candidate(
        clean(value),
        parent.source,
        parent.detail,
        parent.rank,
        specificity=parent.specificity,
        reader_ids=parent.reader_ids,
        reader_source_identities=parent.reader_source_identities,
        official_ids=parent.official_ids,
        wiki_keys=parent.wiki_keys,
    )


def compose_name_component_candidate(
    *,
    group: dict[str, Any],
    child: dict[str, Any],
    current: str,
    source_name_key: str,
    candidate: Candidate,
    known_names: Iterable[str],
) -> Candidate | None:
    source_base = clean(group.get("source_base"))
    if key(source_base) == source_name_key:
        return compose_parent_candidate(group, child, current, candidate)
    if not key(source_base).startswith(source_name_key):
        return None
    old_parent = canonical_parent_from_child(current, group, child)
    replacement_source = next(
        (
            clean(value)
            for value in sorted(set(known_names), key=lambda value: -len(clean(value)))
            if clean(value) and old_parent.startswith(clean(value))
        ),
        "",
    )
    if not replacement_source:
        return None
    new_value = candidate.value + old_parent[len(replacement_source) :]
    if current.startswith(old_parent):
        new_value += current[len(old_parent) :]
    return Candidate(
        clean(new_value),
        candidate.source,
        candidate.detail,
        candidate.rank,
        candidate.specificity,
        candidate.reader_ids,
        candidate.reader_source_identities,
        candidate.official_ids,
        candidate.wiki_keys,
    )


def source_title_candidates(
    *,
    category: str,
    source_title: str,
    group: dict[str, Any],
    child: dict[str, Any],
    current: str,
    reader: ReaderData,
    wiki: WikiData,
    official: dict[str, Any],
) -> list[Candidate]:
    candidates: list[Candidate] = [
        Candidate(
            current,
            "llm-fallback",
            "existing Call V26 title/rule result",
            RANK["llm-fallback"],
        )
    ]

    if category == "メモリア":
        match = MEMORIA_RE.match(source_title)
        if match:
            number = int(match.group("number"))
            source_name = MEMORIA_RE.sub("", source_title, count=1).strip()
            wiki_candidate = wiki.memoria_by_name.get(key(source_name))
            lower_name = (
                wiki_candidate.value
                if wiki_candidate
                else MEMORIA_RE.sub("", current, count=1).strip()
            )
            sequence = official["pieceSequence"]
            piece_id, official_name = (
                sequence[number - 1]
                if 0 < number <= len(sequence)
                else ("", "")
            )
            if piece_id and official_field_is_localized(
                official_name, source_name, lower_name
            ):
                candidates.append(
                    Candidate(
                        f"No.{number} {official_name}",
                        "official-cn",
                        f"pieceList:{piece_id}",
                        RANK["official-cn"],
                        specificity=6,
                        official_ids=(f"pieceList:{piece_id}",),
                    )
                )
            if wiki_candidate:
                candidates.append(
                    Candidate(
                        f"No.{number} {wiki_candidate.value}",
                        wiki_candidate.source,
                        wiki_candidate.detail,
                        wiki_candidate.rank,
                        specificity=5,
                        wiki_keys=wiki_candidate.wiki_keys,
                    )
                )

    main_match = MAIN_STORY_RE.match(source_title)
    prologue_match = MAIN_PROLOGUE_RE.match(source_title)
    if main_match:
        structural_key = (
            category,
            int(main_match.group("chapter")),
            int(main_match.group("episode")),
        )
        if structural_key in wiki.main:
            candidates.append(wiki.main[structural_key])
        if structural_key in reader.main:
            candidates.append(reader.main[structural_key])
    elif prologue_match:
        episode = int(prologue_match.group("episode"))
        structural_key = (category, 0, episode)
        if structural_key in wiki.main:
            candidates.append(wiki.main[structural_key])
        if structural_key in reader.main:
            candidates.append(reader.main[structural_key])

    character_match = CHARACTER_STORY_RE.match(source_title)
    if category == "魔法少女" and character_match:
        name_key = key(character_match.group("name"))
        episode = int(character_match.group("episode"))
        reader_candidate = reader.character.get((name_key, episode))
        if reader_candidate:
            if character_match.group("english"):
                reader_candidate = Candidate(
                    reader_candidate.value + "（英语版）",
                    reader_candidate.source,
                    reader_candidate.detail,
                    reader_candidate.rank,
                    reader_candidate.specificity,
                    reader_candidate.reader_ids,
                    reader_candidate.reader_source_identities,
                    reader_candidate.official_ids,
                    reader_candidate.wiki_keys,
                )
            candidates.append(reader_candidate)

    # Exact Reader cells and Reader-derived event prefixes precede Wiki.
    source_base = clean(group.get("source_base"))
    for mapping in (wiki.names, reader.exact, reader.names):
        parent = mapping.get(key(source_base))
        if parent:
            candidates.append(compose_parent_candidate(group, child, current, parent))

    # Character names can be a prefix of costume, seal and museum titles.
    if category in {"魔法少女", "衣装", "バトルミュージアム"}:
        known_name_values: dict[str, set[str]] = defaultdict(set)
        for mapping in (wiki.names, reader.names):
            for name_key, value in mapping.items():
                known_name_values[name_key].add(value.value)
        for mapping in (wiki.names, reader.names):
            name_match = longest_name_candidate(source_base, mapping)
            if name_match:
                name_key, parent = name_match
                composed = compose_name_component_candidate(
                    group=group,
                    child=child,
                    current=current,
                    source_name_key=name_key,
                    candidate=parent,
                    known_names=known_name_values[name_key],
                )
                if composed:
                    candidates.append(composed)

    # A unique exact Chinese bridge records Wiki/official event provenance
    # without pretending that a translated-title fuzzy match proves identity.
    current_parent = canonical_parent_from_child(current, group, child)
    normalized_parent = cn_key(current_parent)
    wiki_keys = wiki.event_chapters_by_zh.get(normalized_parent, ())
    if category == "イベント" and len(wiki_keys) == 1:
        candidates.append(
            Candidate(
                current,
                "wiki",
                f"exact Chinese bridge to {wiki_keys[0]}",
                RANK["wiki"],
                specificity=1,
                wiki_keys=(f"story:{wiki_keys[0]}",),
            )
        )
    official_event_matches = [
        event_id
        for event_id, value in official["events"].items()
        if cn_key(value) == normalized_parent
    ]
    if category == "イベント" and len(official_event_matches) == 1:
        event_id = official_event_matches[0]
        candidates.append(
            Candidate(
                current,
                "official-cn",
                f"exact Chinese bridge to eventList:{event_id}",
                RANK["official-cn"],
                specificity=1,
                official_ids=(f"eventList:{event_id}",),
            )
        )
    return candidates


def build(
    *,
    reader_root: Path,
    official_libs: Path,
    wiki_root: Path,
    generated_at: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    authority = load_json(AUTHORITY_PATH)
    groups_data = load_json(GROUPS_PATH)
    localization = load_json(LOCALIZATION_PATH)
    official = load_official(official_libs)
    reader = load_reader(reader_root, official, localization)
    wiki = load_wiki(wiki_root)
    name_aliases = build_name_aliases(reader, wiki)
    reader_catalog_name_changes = canonicalize_reader_catalog_names(
        reader, name_aliases
    )
    stale_reader_aliases = [
        (identity, alias)
        for identity, record in reader.catalog_entries.items()
        for alias in EXPLICIT_NAME_ALIASES
        if alias in str(record.get("titleZh") or "")
    ]
    if stale_reader_aliases:
        raise RuntimeError(
            "explicit old character aliases remain in Reader links: "
            + json.dumps(stale_reader_aliases[:10], ensure_ascii=False)
        )

    groups_by_child: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]] = {}
    for group in groups_data.get("groups", []):
        for child in group.get("children", []):
            child_key = (clean(group.get("category")), clean(child.get("source_title")))
            if child_key in groups_by_child:
                raise RuntimeError(f"duplicate Call category/title group: {child_key}")
            groups_by_child[child_key] = (group, child)

    current_map = authority.get("titleByCategory") or {}
    chosen_map: dict[str, dict[str, str]] = defaultdict(dict)
    source_map: dict[str, dict[str, str]] = defaultdict(dict)
    detail_map: dict[str, dict[str, str]] = defaultdict(dict)
    entries: list[dict[str, Any]] = []
    source_counts: Counter[str] = Counter()
    changed_counts: Counter[str] = Counter()
    reader_wiki_conflicts = 0
    reader_over_wiki = 0

    for category, pairs in sorted(current_map.items()):
        if not isinstance(pairs, dict):
            continue
        for source_title, current_value in sorted(pairs.items()):
            group_pair = groups_by_child.get((clean(category), clean(source_title)))
            if not group_pair:
                raise RuntimeError(f"Call title has no group child: {category} / {source_title}")
            group, child = group_pair
            candidates = source_title_candidates(
                category=clean(category),
                source_title=clean(source_title),
                group=group,
                child=child,
                current=clean(current_value),
                reader=reader,
                wiki=wiki,
                official=official,
            )
            candidates = [
                canonicalize_candidate_names(candidate, name_aliases)
                for candidate in candidates
            ]
            chosen = max(
                candidates,
                key=lambda item: (
                    item.rank,
                    item.specificity,
                    item.source,
                    item.detail,
                ),
            )
            chosen_map[category][source_title] = chosen.value
            source_map[category][source_title] = chosen.source
            detail_map[category][source_title] = chosen.detail
            source_counts[chosen.source] += 1
            if chosen.value != clean(current_value):
                changed_counts[chosen.source] += 1

            distinct = {
                (candidate.source, candidate.value, candidate.detail): candidate
                for candidate in candidates
            }
            reader_values = {c.value for c in candidates if c.source == "reader"}
            wiki_values = {c.value for c in candidates if c.source == "wiki"}
            if reader_values and wiki_values and reader_values != wiki_values:
                reader_wiki_conflicts += 1
                if chosen.source == "reader":
                    reader_over_wiki += 1

            entries.append(
                {
                    "category": category,
                    "sourceTitleJa": source_title,
                    "canonicalTitleZh": chosen.value,
                    "source": chosen.source,
                    "detail": chosen.detail,
                    "readerIds": sorted(set(chosen.reader_ids)),
                    "readerSourceIdentities": sorted(
                        set(chosen.reader_source_identities)
                    ),
                    "officialIds": sorted(set(chosen.official_ids)),
                    "wikiKeys": sorted(set(chosen.wiki_keys)),
                    "changedFromPrevious": chosen.value != clean(current_value),
                    "candidates": [
                        {
                            "titleZh": candidate.value,
                            "source": candidate.source,
                            "detail": candidate.detail,
                            "rank": candidate.rank,
                        }
                        for candidate in sorted(
                            distinct.values(),
                            key=lambda item: (
                                -item.rank,
                                -item.specificity,
                                item.source,
                                item.value,
                                item.detail,
                            ),
                        )
                    ],
                }
            )

    if sum(len(pairs) for pairs in chosen_map.values()) != sum(
        len(pairs) for pairs in current_map.values() if isinstance(pairs, dict)
    ):
        raise RuntimeError("not every Call category/title pair was resolved")

    stale_explicit_aliases = [
        {
            "category": category,
            "sourceTitleJa": source_title,
            "alias": alias,
            "canonicalTitleZh": value,
        }
        for category, pairs in chosen_map.items()
        for source_title, value in pairs.items()
        for alias in EXPLICIT_NAME_ALIASES
        if alias in value
    ]
    if stale_explicit_aliases:
        raise RuntimeError(
            "explicit old character aliases remain in canonical titles: "
            + json.dumps(stale_explicit_aliases[:10], ensure_ascii=False)
        )

    parent_map = {
        category: dict(values)
        for category, values in (authority.get("parentByCategory") or {}).items()
        if isinstance(values, dict)
    }
    # Parent labels use the same chosen source order.  Exact child mappings stay
    # authoritative for rendering; this keeps the editor/group labels aligned.
    for group in groups_data.get("groups", []):
        category = clean(group.get("category"))
        source_base = clean(group.get("source_base"))
        children = group.get("children") or []
        if not category or not source_base or not children:
            continue
        first_title = clean(children[0].get("source_title"))
        entry = next(
            (
                item
                for item in entries
                if item["category"] == category
                and item["sourceTitleJa"] == first_title
            ),
            None,
        )
        if not entry:
            continue
        canonical_parent = canonical_parent_from_child(
            entry["canonicalTitleZh"], group, children[0]
        )
        if canonical_parent:
            parent_map.setdefault(category, {})[source_base] = canonical_parent

    source_states = {
        "call": git_state(ROOT),
        "reader": git_state(reader_root),
        "officialCn": git_state(official_libs.parents[2]),
        "wiki": git_state(wiki_root),
    }
    authority_out = {
        **authority,
        "schemaVersion": 2,
        "release": "canonical-title-authority-v1",
        "sourceRelease": "Call/Reader canonical title linkage v1",
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "fieldAuthority": FIELD_AUTHORITY,
        "sourceStates": source_states,
        "provenanceFile": "authority-provenance.json",
        "readerLinksFile": "reader-links.json",
        "parentByCategory": {
            category: dict(sorted(values.items()))
            for category, values in sorted(parent_map.items())
        },
        "titleByCategory": {
            category: dict(sorted(values.items()))
            for category, values in sorted(chosen_map.items())
        },
    }
    summary = {
        "callCategoryTitlePairs": len(entries),
        "sourceCounts": dict(sorted(source_counts.items())),
        "changedFromPrevious": sum(changed_counts.values()),
        "changedBySource": dict(sorted(changed_counts.items())),
        "readerWikiConflicts": reader_wiki_conflicts,
        "readerChosenOverWiki": reader_over_wiki,
        "readerLinkEntries": len(reader.catalog_entries),
        "readerLinkNameCanonicalizations": reader_catalog_name_changes,
        "canonicalNameAliases": len(name_aliases),
        "explicitOldNameAliasesRemaining": 0,
        "officialTables": {
            "rows": official["tableRows"],
            "usableWithoutKana": {
                "pieceList": len(official["pieces"]),
                "charaList": len(official["characters"]),
                "sectionList": len(official["sections"]),
                "eventList": len(official["events"]),
                "chapterList": len(official["chapters"]),
            },
        },
    }
    provenance_out = {
        "schemaVersion": 1,
        "release": authority_out["release"],
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "fieldAuthority": FIELD_AUTHORITY,
        "canonicalNameAliases": name_aliases,
        "summary": summary,
        "sourceByCategory": {
            category: dict(sorted(values.items()))
            for category, values in sorted(source_map.items())
        },
        "detailByCategory": {
            category: dict(sorted(values.items()))
            for category, values in sorted(detail_map.items())
        },
        "entries": entries,
    }
    reader_links_out = {
        "schemaVersion": 1,
        "release": authority_out["release"],
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "fieldAuthority": FIELD_AUTHORITY,
        "reader": source_states["reader"],
        "entriesBySourceIdentity": {
            identity: reader.catalog_entries[identity]
            for identity in sorted(reader.catalog_entries)
        },
        "summary": {
            "entries": len(reader.catalog_entries),
            "officialCn": sum(
                item["source"] == "official-cn"
                for item in reader.catalog_entries.values()
            ),
            "reader": sum(
                item["source"] == "reader"
                for item in reader.catalog_entries.values()
            ),
        },
    }
    return authority_out, provenance_out, reader_links_out


def semantic_equal(left: Any, right: Any) -> bool:
    if isinstance(left, dict) and isinstance(right, dict):
        left = dict(left)
        right = dict(right)
        left.pop("generatedAt", None)
        right.pop("generatedAt", None)
    return left == right


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reader-root", required=True, type=Path)
    parser.add_argument("--official-libs", required=True, type=Path)
    parser.add_argument("--wiki-root", required=True, type=Path)
    parser.add_argument("--reader-catalog-output", type=Path)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write and args.check:
        parser.error("--write and --check are mutually exclusive")

    for path, label in (
        (args.reader_root, "Reader root"),
        (args.official_libs, "official CN libs"),
        (args.wiki_root, "Wiki root"),
    ):
        if not path.is_dir():
            parser.error(f"{label} does not exist: {path}")

    existing = load_json(AUTHORITY_PATH)
    generated_at = clean(existing.get("generatedAt")) or datetime.now(
        timezone.utc
    ).replace(microsecond=0).isoformat()
    if args.write:
        generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    outputs = build(
        reader_root=args.reader_root.resolve(),
        official_libs=args.official_libs.resolve(),
        wiki_root=args.wiki_root.resolve(),
        generated_at=generated_at,
    )
    authority, provenance, reader_links = outputs
    print(json.dumps(provenance["summary"], ensure_ascii=False, indent=2))

    output_pairs = [
        (AUTHORITY_PATH, authority),
        (PROVENANCE_PATH, provenance),
        (READER_LINKS_PATH, reader_links),
    ]
    if args.reader_catalog_output:
        output_pairs.append((args.reader_catalog_output.resolve(), reader_links))

    if args.check:
        stale = []
        for path, value in output_pairs:
            if not path.is_file() or not semantic_equal(load_json(path), value):
                stale.append(str(path))
        if stale:
            raise SystemExit("out of date: " + ", ".join(stale))
    elif args.write:
        for path, value in output_pairs:
            write_json(path, value)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
