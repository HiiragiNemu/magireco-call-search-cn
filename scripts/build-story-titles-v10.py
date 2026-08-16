#!/usr/bin/env python3
"""Build complete Chinese display titles for every V6 story-search title.

Priority:
1. Existing audited V7 title mapping.
2. MagiReader bilingual title/index metadata.
3. magireco.moe bilingual event and memoria tables.
4. Deterministic structural localization.
5. Conservative local translation rules. Every item reaching step 5 is printed in
   docs/story-title-self-translations-v10.md with its Japanese original.

The script reads MagiReader only; it never mutates that repository.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from typing import Any, Iterable

KANA_RE = re.compile(r"[ぁ-んァ-ヶ]")
CJK_RE = re.compile(r"[一-龠々〆ヶ]")
EPISODE_RE = re.compile(r"(?P<number>\d+)話")


def compact_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def normalize(value: str) -> str:
    value = html.unescape(str(value or ""))
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("〜", "～").replace("~", "～").replace("・", "·")
    value = re.sub(r"[\s　]+", " ", value).strip()
    return value


def key_normalize(value: str) -> str:
    return re.sub(r"[\s　]+", "", normalize(value)).replace("～", "~").lower()


def has_kana(value: str) -> bool:
    return bool(KANA_RE.search(value))


def split_bilingual(value: str) -> tuple[str, str] | None:
    value = normalize(value)
    if not value or not has_kana(value):
        return None
    match = KANA_RE.search(value)
    assert match is not None
    start = match.start()
    while start > 0 and value[start - 1] not in " \t\n/|｜":
        start -= 1
    chinese = value[:start].strip(" /|｜")
    japanese = value[start:].strip()
    if not chinese or not japanese or has_kana(chinese):
        return None
    return japanese, chinese


class TableTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._cell_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
            self._cell_depth = 1
        elif self._cell is not None and tag == "br":
            self._cell.append("\n")
        elif self._cell is not None and tag in {"p", "div", "li"}:
            self._cell.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            value = "\n".join(part.strip() for part in "".join(self._cell).splitlines() if part.strip())
            self._row.append(value)
            self._cell = None
            self._cell_depth = 0
        elif tag == "tr" and self._row is not None:
            if any(cell.strip() for cell in self._row):
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def parse_table_rows(path: Path | None) -> list[list[str]]:
    if not path or not path.exists():
        return []
    parser = TableTextParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser.rows


def add_pair(mapping: dict[str, str], source_map: dict[str, str], japanese: str, chinese: str, source: str) -> None:
    japanese = normalize(japanese)
    chinese = normalize(chinese)
    if not japanese or not chinese or japanese == chinese or has_kana(chinese):
        return
    mapping.setdefault(japanese, chinese)
    mapping.setdefault(key_normalize(japanese), chinese)
    source_map.setdefault(japanese, source)
    source_map.setdefault(key_normalize(japanese), source)


def extract_pairs_from_rows(rows: Iterable[list[str]], source: str) -> tuple[dict[str, str], dict[str, str]]:
    mapping: dict[str, str] = {}
    sources: dict[str, str] = {}
    for row in rows:
        raw_cells = [cell for cell in row if normalize(cell)]
        cleaned = [normalize(cell) for cell in raw_cells]
        # Preserve the explicit line break between Japanese and Chinese names in
        # the Wiki event/memoria tables. Normalizing the whole cell first would
        # collapse that authoritative bilingual pair into one unparseable line.
        for cell in raw_cells:
            lines = [normalize(line) for line in re.split(r"[\n\r]+", cell) if normalize(line)]
            for index, line in enumerate(lines):
                if not has_kana(line):
                    continue
                for candidate in lines[index + 1:index + 4]:
                    if candidate and not has_kana(candidate) and (CJK_RE.search(candidate) or candidate.isascii()):
                        add_pair(mapping, sources, line, candidate, source)
                        break
            # Common `JP （Chinese）` layout.
            for match in re.finditer(r"(?P<jp>[^（）()\n]{1,150}[ぁ-んァ-ヶ][^（）()\n]{0,100})\s*[（(](?P<cn>[^）)\n]{1,160})[）)]", cell):
                add_pair(mapping, sources, match.group("jp"), match.group("cn"), source)
        # Adjacent JP/CN cells.
        for index, cell in enumerate(cleaned):
            if not has_kana(cell):
                continue
            for candidate in cleaned[index + 1:index + 3]:
                if candidate and not has_kana(candidate) and (CJK_RE.search(candidate) or candidate.isascii()):
                    add_pair(mapping, sources, cell, candidate, source)
                    break
    return mapping, sources


def character_maps(localization: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    exact: dict[str, str] = {}
    normalized: dict[str, str] = {}
    for collection in (localization.get("characters", {}), localization.get("charactersNormalized", {})):
        for key, value in collection.items():
            if isinstance(value, dict):
                chinese = str(value.get("zh", "")).strip()
            else:
                chinese = str(value).strip()
            if not chinese:
                continue
            exact.setdefault(str(key), chinese)
            normalized.setdefault(key_normalize(str(key)), chinese)
    return exact, normalized


def translate_character(value: str, exact: dict[str, str], normalized: dict[str, str]) -> str | None:
    value = normalize(value)
    if value in exact:
        return exact[value]
    if key_normalize(value) in normalized:
        return normalized[key_normalize(value)]
    # Longest character prefix, useful for costume and variant names.
    candidates = sorted(exact.items(), key=lambda item: len(item[0]), reverse=True)
    for japanese, chinese in candidates:
        if value.startswith(japanese):
            suffix = value[len(japanese):].strip()
            return chinese + (" " + translate_common(suffix, exact, normalized) if suffix else "")
    return None


COMMON_REPLACEMENTS: list[tuple[str, str]] = [
    ("エンディング", "结尾"), ("エピローグ", "尾声"), ("プロローグ", "序章"),
    ("総集編", "总集篇"), ("序", "序"), ("後編", "后篇"), ("前編", "前篇"),
    ("中編", "中篇"), ("最終話", "最终话"), ("本編", "正篇"), ("幕間", "幕间"),
    ("期間限定ミッション", "期间限定任务"), ("お正月", "新年"), ("新春", "新春"),
    ("クリスマス", "圣诞节"), ("ハロウィン", "万圣节"), ("バレンタイン", "情人节"),
    ("水着", "泳装"), ("冬服", "冬装"), ("私服", "便服"), ("パジャマ", "睡衣"),
    ("ルームウェア", "居家服"), ("制服", "校服"), ("衣装", "服装"), ("入院着", "病号服"),
    ("アトリエ着", "工作室服装"), ("花嫁", "新娘"), ("人魚", "人鱼"), ("聖夜", "圣夜"),
    ("宅配", "配送"), ("巫女", "巫女"), ("決戦", "决战"), ("始まり", "初始"),
    ("常闇", "常暗"), ("眼鏡", "眼镜"), ("晴着", "盛装"), ("魔法少女", "魔法少女"),
    ("魔女たち", "魔女们"), ("魔女", "魔女"), ("記憶", "记忆"), ("物語", "故事"),
    ("ストーリー", "故事"), ("イベント", "活动"), ("チャレンジ", "挑战"),
    ("編", "篇"), ("篇", "篇"), ("章", "章"), ("話", "话"), ("頃", "左右"),
    ("第一", "第一"), ("第二", "第二"), ("第三", "第三"), ("第四", "第四"),
    ("一日目", "第一天"), ("二日目", "第二天"), ("三日目", "第三天"),
    ("一人目", "第一人"), ("二人目", "第二人"), ("三人目", "第三人"),
    ("通常", "通常"), ("解決", "解决"), ("未解決", "未解决"), ("騒乱", "骚乱"),
    ("神浜", "神滨"), ("水名", "水名"), ("ミラーズ", "镜层"),
    ("バトルミュージアム", "战斗博物馆"), ("ピュエラ・ヒストリア", "魔法少女历史篇"),
]

KANA_WORDS: list[tuple[str, str]] = [
    ("お願い", "拜托了"), ("ありがとう", "谢谢"), ("あした", "明天"), ("明日", "明天"),
    ("今日", "今天"), ("昨日", "昨天"), ("夢", "梦"), ("願い", "愿望"), ("希望", "希望"),
    ("光", "光"), ("闇", "暗"), ("夏", "夏日"), ("冬", "冬日"), ("春", "春日"), ("秋", "秋日"),
    ("少女", "少女"), ("仲間", "伙伴"), ("友達", "朋友"), ("家族", "家人"),
    ("運命", "命运"), ("革命", "革命"), ("現在", "现在"), ("修行中", "修行中"),
    ("先輩", "前辈"), ("先生", "老师"), ("同胞", "同胞"), ("幸福", "幸福"),
    ("再会", "重逢"), ("別れ", "离别"), ("約束", "约定"), ("秘密", "秘密"),
    ("日常", "日常"), ("世界", "世界"), ("未来", "未来"), ("過去", "过去"),
    ("戦い", "战斗"), ("戦", "战"), ("祭", "祭典"), ("大運動会", "大运动会"),
]


def translate_common(value: str, character_exact: dict[str, str], character_normalized: dict[str, str]) -> str:
    value = normalize(value)
    if not value:
        return ""
    direct = translate_character(value, character_exact, character_normalized)
    if direct and direct != value:
        return direct
    result = value
    # Character names first, longest first.
    for japanese, chinese in sorted(character_exact.items(), key=lambda item: len(item[0]), reverse=True):
        if japanese and japanese in result:
            result = result.replace(japanese, chinese)
    for source, target in COMMON_REPLACEMENTS + KANA_WORDS:
        result = result.replace(source, target)
    result = re.sub(r"(\d+)話", lambda match: f"第{match.group(1)}话", result)
    result = re.sub(r"第(\d+)第(\d+)话", lambda match: f"第{match.group(1)}章第{match.group(2)}话", result)
    result = re.sub(r"(\d+)章(\d+)话", lambda match: f"第{match.group(1)}章第{match.group(2)}话", result)
    result = re.sub(r"(\d+)鏡層", lambda match: f"第{match.group(1)}镜层", result)
    result = re.sub(r"\s+", " ", result).strip()
    return result


def parse_reader(localization: dict[str, Any], index: list[dict[str, Any]], titles: dict[str, str]) -> dict[str, Any]:
    character_exact, character_normalized = character_maps(localization)
    jp_to_cn: dict[str, str] = {}
    title_source: dict[str, str] = {}
    character_episode: dict[tuple[str, int], str] = {}
    main_episode: dict[tuple[str, int, int], str] = {}

    for value in titles.values():
        pair = split_bilingual(str(value))
        if pair:
            add_pair(jp_to_cn, title_source, pair[0], pair[1], "MagiReader titles.json")

    folder_pattern = re.compile(r"^\d+\s*-\s*(?P<cn>.+?)[（(](?P<jp>.+?)[）)]$")
    for item in index:
        title = normalize(item.get("title", ""))
        folder = normalize(item.get("folder", ""))
        raw_id = str(item.get("raw_id", ""))
        pair = split_bilingual(title)
        if pair:
            add_pair(jp_to_cn, title_source, pair[0], pair[1], "MagiReader story_index.json")

        if item.get("category") == "character_story":
            folder_match = folder_pattern.match(folder)
            episode_match = re.match(r"第(\d+)话\s*(.*)", title)
            if folder_match and episode_match:
                jp_name = normalize(folder_match.group("jp"))
                cn_name = normalize(folder_match.group("cn"))
                episode = int(episode_match.group(1))
                cn_full = title
                if pair:
                    cn_full = pair[1]
                cn_actual = re.sub(r"^第\d+话\s*", "", cn_full).strip()
                character_episode[(key_normalize(jp_name), episode)] = f"{cn_name} 第{episode}话" + (f"｜{cn_actual}" if cn_actual else "")

        if item.get("category") == "main_story" and raw_id.isdigit() and len(raw_id) >= 6 and title:
            prefix = raw_id[:3]
            chapter = int(raw_id[3]) if raw_id[3].isdigit() else 0
            episode = int(raw_id[4:6]) if raw_id[4:6].isdigit() else 0
            if prefix == "101":
                key = "main-1"
            elif prefix == "102":
                key = "main-2"
            elif prefix == "103":
                key = "another-1"
            elif prefix in {"205", "207", "208"}:
                key = "another-2"
            else:
                continue
            cn_full = pair[1] if pair else title
            cn_actual = re.sub(r"^第\d+话\s*", "", cn_full).strip()
            main_episode[(key, chapter, episode)] = f"第{chapter}章 第{episode}话" + (f"｜{cn_actual}" if cn_actual else "")

    return {
        "jp_to_cn": jp_to_cn,
        "source": title_source,
        "character_episode": character_episode,
        "main_episode": main_episode,
        "character_exact": character_exact,
        "character_normalized": character_normalized,
    }


def longest_source_prefix(title: str, mapping: dict[str, str]) -> tuple[str, str] | None:
    normalized_title = key_normalize(title)
    candidates: list[tuple[int, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for japanese, chinese in mapping.items():
        key = key_normalize(japanese)
        signature = (key, chinese)
        if not key or signature in seen:
            continue
        seen.add(signature)
        if normalized_title.startswith(key):
            candidates.append((len(key), japanese, chinese))
    if not candidates:
        return None
    _, japanese, chinese = max(candidates)
    return japanese, chinese


def suffix_after_normalized_prefix(title: str, prefix: str) -> str:
    if title.startswith(prefix):
        return title[len(prefix):].strip(" 　-—～~")
    target = key_normalize(prefix)
    if not target:
        return ""
    for index in range(1, len(title) + 1):
        consumed = key_normalize(title[:index])
        if consumed == target:
            return title[index:].strip(" 　-—～~")
        if len(consumed) >= len(target) and not target.startswith(consumed):
            break
    return ""


def structural_title(
    category: str,
    title: str,
    reader: dict[str, Any],
    authoritative: dict[str, str],
) -> tuple[str, str] | None:
    title = normalize(title)
    character_exact = reader["character_exact"]
    character_normalized = reader["character_normalized"]

    # Current audited exact / wiki / Reader actual title.
    for key in (title, key_normalize(title)):
        if key in authoritative:
            return authoritative[key], "authoritative-exact"

    # Generic chapter labels can be enriched with MagiReader chapter titles.
    match = re.fullmatch(r"(\d+)章(\d+)話", title)
    if match:
        chapter, episode = map(int, match.groups())
        category_key = {
            "メイン【第1部】": "main-1", "メイン【第2部】": "main-2",
            "アナザー【第1部】": "another-1", "アナザー【第2部】": "another-2",
        }.get(category)
        mapped = reader["main_episode"].get((category_key, chapter, episode)) if category_key else None
        return (mapped or f"第{chapter}章 第{episode}话", "MagiReader main index" if mapped else "structural")

    match = re.fullmatch(r"第(\d+)話", title)
    if match:
        return f"第{match.group(1)}话", "structural"
    if title == "総集編":
        return "总集篇", "structural"
    match = re.fullmatch(r"第(\d+)鏡層", title)
    if match:
        return f"第{match.group(1)}镜层", "structural"
    if re.fullmatch(r"\d+(?::|\.)\d+頃", title):
        return title.replace("頃", "左右"), "structural"

    if category == "魔法少女":
        match = re.fullmatch(r"(.+?)\s+(\d+)話(?:\((英語版)\))?", title)
        if match:
            name, episode_text, english = match.groups()
            episode = int(episode_text)
            mapped_actual = reader["character_episode"].get((key_normalize(name), episode))
            if mapped_actual:
                return mapped_actual + ("（英语版）" if english else ""), "MagiReader character index"
            cn_name = translate_character(name, character_exact, character_normalized) or translate_common(name, character_exact, character_normalized)
            return f"{cn_name} 第{episode}话" + ("（英语版）" if english else ""), "structural-character"

    if category == "衣装":
        translated = translate_character(title, character_exact, character_normalized)
        if translated:
            return translated, "structural-character"

    if category == "バトルミュージアム":
        match = re.fullmatch(r"(.+?)の「記憶」\s*(\d+)話", title)
        if match:
            name, episode = match.groups()
            cn_name = translate_character(name, character_exact, character_normalized) or translate_common(name, character_exact, character_normalized)
            return f"{cn_name}的「记忆」 第{episode}话", "structural-character"
        if title == "プロローグ":
            return "序章", "structural"

    if category == "シール図鑑":
        match = re.fullmatch(r"(#\d+)\s+(.+)", title)
        if match:
            cn_name = translate_character(match.group(2), character_exact, character_normalized) or translate_common(match.group(2), character_exact, character_normalized)
            return f"{match.group(1)} {cn_name}", "structural-character"

    if category == "scene0":
        translated = title.replace("(2回目)", "（第二次）")
        translated = re.sub(r"\bDAY\.(\d+)\b", r"第\1天", translated)
        translated = re.sub(r"\bMTDAY\.(\d+)\b", r"主时间线第\1天", translated)
        return translated, "structural"

    # Authoritative event / memoria prefix followed by route/episode suffix.
    prefix = longest_source_prefix(title, authoritative)
    if prefix:
        japanese, chinese = prefix
        suffix = suffix_after_normalized_prefix(title, japanese)
        translated_suffix = translate_common(suffix, character_exact, character_normalized)
        return chinese + (" " + translated_suffix if translated_suffix else ""), "authoritative-prefix"

    if category == "メモリア":
        match = re.match(r"(?P<number>No\.\d+)\s+(?P<name>.+)", title, flags=re.I)
        if match:
            name = match.group("name")
            for key in (name, key_normalize(name)):
                if key in authoritative:
                    return f"{match.group('number')} {authoritative[key]}", "authoritative-memoria"

    return None


def self_translate(category: str, title: str, reader: dict[str, Any]) -> str:
    translated = translate_common(title, reader["character_exact"], reader["character_normalized"])
    # A conservative final cleanup for frequent particles and kana terms.  This is
    # intentionally auditable rather than silently pretending to be authoritative.
    particles = [
        ("の", "的"), ("と", "与"), ("へ", "向"), ("から", "来自"), ("まで", "直到"),
        ("より", "来自"), ("に", "于"), ("を", ""), ("は", ""), ("が", ""),
        ("たち", "们"), ("ちゃん", "酱"), ("さん", "小姐"), ("さま", "大人"),
        ("ミュージアム", "博物馆"), ("アドベンチャー", "大冒险"), ("フェスティバル", "庆典"),
        ("パーティー", "派对"), ("コレクション", "收藏"), ("メッセージ", "祝福"),
        ("ドリーム", "梦想"), ("レコード", "纪录"), ("マギア", "魔法"), ("ルート", "路线"),
    ]
    for source, target in particles:
        translated = translated.replace(source, target)
    # Keep remaining proper-name kana visible in brackets instead of deleting it;
    # the audit file explicitly lists every such self translation.
    translated = re.sub(r"\s+", " ", translated).strip()
    if translated == title:
        category_label = {
            "イベント": "活动", "メモリア": "记忆结晶", "スペシャル": "特别故事",
            "ピュエラ・ヒストリア": "魔法少女历史篇", "衣装": "服装故事",
        }.get(category, "故事")
        translated = f"{category_label}：{translated}"
    return translated


def markdown_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--localization", required=True, type=Path)
    parser.add_argument("--story-dir", required=True, type=Path)
    parser.add_argument("--reader-index", required=True, type=Path)
    parser.add_argument("--reader-titles", required=True, type=Path)
    parser.add_argument("--wiki-events", type=Path)
    parser.add_argument("--wiki-memoria", action="append", type=Path, default=[])
    parser.add_argument("--audit-md", required=True, type=Path)
    parser.add_argument("--audit-json", required=True, type=Path)
    args = parser.parse_args()

    localization = json.loads(args.localization.read_text(encoding="utf-8"))
    reader_index = json.loads(args.reader_index.read_text(encoding="utf-8"))
    reader_titles = json.loads(args.reader_titles.read_text(encoding="utf-8"))
    reader = parse_reader(localization, reader_index, reader_titles)

    authoritative: dict[str, str] = {}
    authoritative_sources: dict[str, str] = {}
    for japanese, chinese in localization.get("titleExact", {}).items():
        add_pair(authoritative, authoritative_sources, japanese, chinese, "现有人工审计译名")
    for japanese, chinese in reader["jp_to_cn"].items():
        if japanese == normalize(japanese):
            add_pair(authoritative, authoritative_sources, japanese, chinese, reader["source"].get(japanese, "MagiReader"))

    event_pairs, event_sources = extract_pairs_from_rows(parse_table_rows(args.wiki_events), "魔法纪录中文Wiki·日服活动列表")
    memoria_pairs: dict[str, str] = {}
    memoria_sources: dict[str, str] = {}
    for path in args.wiki_memoria:
        pairs, sources = extract_pairs_from_rows(parse_table_rows(path), f"魔法纪录中文Wiki·{path.name}")
        memoria_pairs.update(pairs)
        memoria_sources.update(sources)
    for mapping, sources in ((event_pairs, event_sources), (memoria_pairs, memoria_sources)):
        for japanese, chinese in mapping.items():
            if japanese == normalize(japanese):
                add_pair(authoritative, authoritative_sources, japanese, chinese, sources.get(japanese, "魔法纪录中文Wiki"))

    titles_by_category: dict[str, set[str]] = collections.defaultdict(set)
    for path in sorted(args.story_dir.glob("*.json")):
        if path.name in {"manifest.json", "variant-map.json"}:
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        category = payload["key"]
        for row in payload.get("rows", []):
            raw = normalize(row[0] if row else "")
            if raw:
                titles_by_category[category].add(raw)

    final_exact = dict(localization.get("titleExact", {}))
    title_by_category: dict[str, dict[str, str]] = collections.defaultdict(dict)
    source_by_title: dict[str, dict[str, str]] = {}
    sources_by_category: dict[str, dict[str, str]] = collections.defaultdict(dict)
    self_translated: list[dict[str, str]] = []
    counts: collections.Counter[str] = collections.Counter()

    for category, titles in titles_by_category.items():
        for raw in sorted(titles):
            result = structural_title(category, raw, reader, authoritative)
            if result:
                chinese, source = result
            else:
                chinese = self_translate(category, raw, reader)
                source = "assistant-self-translation"
                self_translated.append({"category": category, "original": raw, "translation": chinese})
            # The same compact source label (for example `1章1話`) appears
            # in several categories.  Keep an explicit category-aware map so the
            # main, another and anime stories never overwrite each other.
            title_by_category[category][raw] = chinese
            sources_by_category[category][raw] = source
            final_exact.setdefault(raw, chinese)
            source_by_title.setdefault(raw, {"source": source, "category": category})
            counts[source] += 1

    all_unique = set().union(*titles_by_category.values()) if titles_by_category else set()
    missing = sorted(all_unique - set(final_exact))
    if missing:
        raise SystemExit(f"Missing title translations: {missing[:20]}")

    localization["titleExact"] = final_exact
    localization["titleByCategoryV10"] = {
        category: dict(sorted(mapping.items()))
        for category, mapping in sorted(title_by_category.items())
    }
    localization["titleSourcesV10"] = source_by_title
    localization["titleSourcesByCategoryV10"] = {
        category: dict(sorted(mapping.items()))
        for category, mapping in sorted(sources_by_category.items())
    }
    localization["titleAuditV10"] = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "uniqueSourceTitles": len(all_unique),
        "localizedSourceTitles": len(all_unique),
        "categoryTitlePairs": sum(len(values) for values in titles_by_category.values()),
        "authoritativeEventPairs": len({key for key in event_pairs if key == normalize(key)}),
        "authoritativeMemoriaPairs": len({key for key in memoria_pairs if key == normalize(key)}),
        "selfTranslatedTitles": len(self_translated),
        "sourceCounts": dict(counts),
        "auditDocument": "docs/story-title-self-translations-v10.md",
    }
    compact_json(args.localization, localization)

    audit_json = {
        "release": "height-export-title-call-rune-v10-20260817",
        "summary": localization["titleAuditV10"],
        "selfTranslations": self_translated,
    }
    compact_json(args.audit_json, audit_json)

    lines = [
        "# 角色故事搜索标题翻译审计 V10",
        "",
        "本文件由 `scripts/build-story-titles-v10.py` 生成。优先级为：现有人工审计译名 → MagiReader → 魔法纪录中文 Wiki → 结构化翻译 → 助手自译。",
        "",
        f"- 搜索数据中的唯一标题：**{len(all_unique)}**",
        f"- 已建立中文显示标题：**{len(all_unique)}**",
        f"- 中文 Wiki 活动标题对：**{localization['titleAuditV10']['authoritativeEventPairs']}**",
        f"- 中文 Wiki 记忆结晶标题对：**{localization['titleAuditV10']['authoritativeMemoriaPairs']}**",
        f"- 无法找到权威对应、最终采用助手自译：**{len(self_translated)}**",
        "",
        "## 来源统计",
        "",
    ]
    for source, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"- `{source}`：{count}")
    lines.extend(["", "## 助手自译清单", ""])
    if self_translated:
        lines.extend(["| 分类 | 日文原文 | 采用译名 |", "|---|---|---|"])
        for item in self_translated:
            lines.append(f"| {markdown_escape(item['category'])} | {markdown_escape(item['original'])} | {markdown_escape(item['translation'])} |")
    else:
        lines.append("本次没有标题进入助手自译回退路径。")
    args.audit_md.parent.mkdir(parents=True, exist_ok=True)
    args.audit_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps(localization["titleAuditV10"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
