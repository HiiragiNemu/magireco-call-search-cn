#!/usr/bin/env python3
"""Build the V22 authoritative Chinese title layer.

Authority order:
1. official CN client libs;
2. explicitly approved/manual target translations;
3. MagiReader;
4. magireco-wiki-data;
5. conservative machine/rule fallback.

The script deliberately leaves natural Latin/English titles unchanged and does not
rewrite kanji-only text merely to make a localization counter larger.
"""
from __future__ import annotations

import argparse
import collections
import dataclasses
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable, Iterator

RELEASE = "v22-authoritative-localization-20260820"
KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
LATIN_ONLY_RE = re.compile(r"^[\s\dA-Za-zÀ-ž'\"“”‘’.,:;!?+&/\\()\[\]{}~～—–_·・\-]+$")
NO_RE = re.compile(r"^\s*No\.\s*(\d+)\b[\s　]*(.*)$", re.I)
ID_RE = re.compile(r"(?<!\d)(\d{3,12})(?!\d)")

PRIORITY = {
    "official-cn-libs": 500,
    "manual-approved": 400,
    "magi-reader": 300,
    "magireco-wiki-data": 200,
    "rule-fallback": 100,
    "machine-fallback": 50,
    "retained-existing": 40,
    "retained-latin": 20,
    "same-kanji": 20,
    "unresolved": 0,
}

WIKI_SEED = {
    "マギウスの翼": "Magius之翼",
    "ネオマギウス": "Neo-Magius",
    "プロミストブラッド": "PROMISED BLOOD",
    "ピュエラケア": "Puella Care",
}

COMMON_NAME_SEED = {
    "まどか先輩": "小圆前辈",
    "いろはちゃん": "小彩羽",
    "まどか": "小圆",
    "いろは": "彩羽",
    "やちよ": "八千代",
    "つるの": "鹤乃",
    "フェリシア": "菲莉希亚",
    "さな": "莎奈",
    "うい": "忧",
    "くろ": "小黑",
    "黒江": "黑江",
    "アリナ": "阿莉娜",
    "かりん": "花凛",
    "レナ": "玲奈",
    "かえで": "枫",
    "ももこ": "桃子",
    "みたま": "御魂",
    "結菜": "结菜",
    "樹里": "树里",
    "万年桜のウワサ": "万年樱的传闻",
}

SUFFIX_RULES = {
    "ハロウィンver": "万圣节ver.",
    "水着ver": "泳装ver.",
    "花嫁ver": "新娘ver.",
    "始まりver": "起始ver.",
    "人魚ver": "人鱼ver.",
    "ヴァンパイアver": "吸血鬼ver.",
    "魔女ver": "魔女ver.",
    "アニメver": "动画ver.",
    "童話ver": "童话ver.",
    "晴着ver": "晴装ver.",
    "七夕ver": "七夕ver.",
    "バレンタインver": "情人节ver.",
    "クリスマスver": "圣诞ver.",
    "歴史ver": "历史ver.",
    "お正月ver": "新年ver.",
    "ドッペルver": "Doppel ver.",
}

PHRASE_RULES = {
    "約束したじゃないです": "不是约好了吗",
    "約束したじゃない": "不是约好了吗",
    "受け継ぐ意志": "传承下的意志",
    "私にしかできないこと": "只有我能做到的事",
    "鏡に映る透明な想い": "映在镜中的透明心意",
    "夢見たあとに": "梦醒之后",
    "憧れに背伸びして": "为憧憬而踮起脚尖",
    "水底に沈む涙": "沉入水底的泪",
    "最後は笑ってさようなら": "最后笑着说再见",
    "ショータイムなんよ": "现在是表演时间",
    "ふたりの未来": "两人的未来",
    "まどかのノート": "小圆的笔记本",
}

JP_FIELD_HINTS = (
    "ja", "jp", "japanese", "original", "rawtitle", "sourcetitle",
    "titleja", "nameja", "jptitle", "janame", "日本語", "日文",
)
ZH_FIELD_HINTS = (
    "zh", "cn", "chinese", "translated", "translation", "localized",
    "localised", "titlezh", "titlecn", "namezh", "中文", "译名", "翻译",
)
TEXT_KEY_HINTS = ("title", "name", "label", "text", "display")


@dataclasses.dataclass(frozen=True)
class Candidate:
    zh: str
    source: str
    detail: str
    priority: int


@dataclasses.dataclass
class Resolution:
    zh: str
    source: str
    detail: str
    authoritative: bool


class Builder:
    def __init__(self, root: Path, public: Path, libs: Path, reader: Path, wiki: Path | None):
        self.root = root
        self.public = public
        self.libs = libs
        self.reader = reader
        self.wiki = wiki if wiki and wiki.exists() else None
        self.mapping: dict[str, Candidate] = {}
        self.official_piece: dict[str, str] = {}
        self.official_chara: dict[str, str] = {}
        self.official_section: dict[str, str] = {}
        self.official_event: dict[str, str] = {}
        self.official_event_story: dict[str, str] = {}
        self.official_chapter: dict[str, str] = {}
        self.jp_name_to_cn: dict[str, str] = dict(COMMON_NAME_SEED)
        self.jp_name_norm_to_cn: dict[str, str] = {
            self.norm(k): v for k, v in COMMON_NAME_SEED.items()
        }
        self.translation_cache: dict[str, str] = {}
        self.output_map: dict[str, dict[str, Any]] = {}
        self.missing_authoritative: dict[str, dict[str, Any]] = {}
        self.unresolved_display: dict[str, dict[str, Any]] = {}
        self.counts = collections.Counter()
        self.changed_paths: set[str] = set()
        self.machine_failures = 0
        self.machine_disabled = False
        self.max_machine = int(os.environ.get("V22_MAX_MACHINE_TRANSLATIONS", "3000"))
        self.machine_used = 0
        self.cache_path = root / ".automation" / "v22-machine-translation-cache.json"
        if self.cache_path.exists():
            try:
                raw = self.load_json(self.cache_path)
                if isinstance(raw, dict):
                    self.translation_cache = {str(k): str(v) for k, v in raw.items()}
            except Exception:
                pass

    @staticmethod
    def norm(value: Any) -> str:
        text = unicodedata.normalize("NFKC", str(value or "")).strip()
        text = text.replace("〜", "～").replace("~", "～")
        text = text.replace("・", "·").replace("･", "·")
        text = re.sub(r"\s+", "", text)
        text = re.sub(r"[\[\]【】()（）{}「」『』〈〉《》:：,，.。!！?？'\"“”‘’_\-—–/\\]", "", text)
        return text.casefold()

    @staticmethod
    def clean_text(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        text = unicodedata.normalize("NFKC", value).strip()
        text = re.sub(r"[ \t]+", " ", text)
        return text

    @staticmethod
    def contains_kana(value: Any) -> bool:
        return isinstance(value, str) and bool(KANA_RE.search(value))

    @staticmethod
    def contains_cjk(value: Any) -> bool:
        return isinstance(value, str) and bool(CJK_RE.search(value))

    @staticmethod
    def is_natural_latin(value: str) -> bool:
        return bool(value) and bool(LATIN_ONLY_RE.fullmatch(value)) and bool(re.search(r"[A-Za-z]", value))

    @staticmethod
    def load_json(path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8-sig"))

    @staticmethod
    def dump_json(path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    @staticmethod
    def walk_records(data: Any, trail: tuple[str, ...] = ()) -> Iterator[tuple[tuple[str, ...], dict[str, Any]]]:
        if isinstance(data, dict):
            yield trail, data
            for key, value in data.items():
                if isinstance(value, (dict, list)):
                    yield from Builder.walk_records(value, trail + (str(key),))
        elif isinstance(data, list):
            for index, value in enumerate(data):
                if isinstance(value, (dict, list)):
                    yield from Builder.walk_records(value, trail + (str(index),))

    @staticmethod
    def flattened_strings(value: Any, limit: int = 256) -> list[str]:
        out: list[str] = []
        stack = [value]
        while stack and len(out) < limit:
            item = stack.pop()
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                for key, child in item.items():
                    out.append(str(key))
                    stack.append(child)
            elif isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, (int, float)):
                out.append(str(item))
        return out

    def add_candidate(self, ja: Any, zh: Any, source: str, detail: str, priority: int | None = None) -> None:
        ja_text = self.clean_text(ja)
        zh_text = self.clean_text(zh)
        if not ja_text or not zh_text or len(ja_text) > 500 or len(zh_text) > 500:
            return
        if ja_text == zh_text and self.contains_kana(zh_text):
            return
        if self.contains_kana(zh_text) and self.contains_kana(ja_text):
            return
        key = self.norm(ja_text)
        if not key:
            return
        candidate = Candidate(zh_text, source, detail, priority if priority is not None else PRIORITY[source])
        existing = self.mapping.get(key)
        if existing is None or candidate.priority > existing.priority:
            self.mapping[key] = candidate

    @staticmethod
    def normalized_key(key: Any) -> str:
        return re.sub(r"[^a-z0-9一-龯ぁ-んァ-ヶ]", "", unicodedata.normalize("NFKC", str(key)).casefold())

    def record_id(self, record: dict[str, Any], trail: tuple[str, ...], hints: tuple[str, ...]) -> str | None:
        normalized_hints = tuple(self.normalized_key(h) for h in hints)
        for key, value in record.items():
            nk = self.normalized_key(key)
            if any(nk == hint or nk.endswith(hint) for hint in normalized_hints):
                if isinstance(value, (int, str)):
                    match = re.search(r"\d+", str(value))
                    if match:
                        return match.group(0)
        for part in reversed(trail):
            if re.fullmatch(r"\d{3,12}", part):
                return part
        return None

    def record_text(self, record: dict[str, Any], preferred: tuple[str, ...]) -> str | None:
        normalized = {self.normalized_key(k): v for k, v in record.items()}
        for key in preferred:
            value = normalized.get(self.normalized_key(key))
            if isinstance(value, str) and 0 < len(value.strip()) <= 300:
                return self.clean_text(value)
        for key, value in record.items():
            nk = self.normalized_key(key)
            if isinstance(value, str) and 0 < len(value.strip()) <= 200:
                if any(token in nk for token in ("name", "title", "名称", "标题", "名字")):
                    return self.clean_text(value)
        return None

    def load_official_table(
        self,
        filename: str,
        id_hints: tuple[str, ...],
        text_hints: tuple[str, ...],
    ) -> dict[str, str]:
        path = self.libs / filename
        if not path.exists():
            return {}
        data = self.load_json(path)
        output: dict[str, str] = {}
        if isinstance(data, dict):
            for key, value in data.items():
                if re.fullmatch(r"\d{3,12}", str(key)) and isinstance(value, str):
                    output[str(int(str(key)))] = self.clean_text(value)
        for trail, record in self.walk_records(data):
            rid = self.record_id(record, trail, id_hints)
            text = self.record_text(record, text_hints)
            if rid and text:
                output[str(int(rid))] = text
        return output

    def load_official(self) -> None:
        self.official_piece = self.load_official_table(
            "pieceList.json", ("pieceId", "id"), ("pieceName", "name", "title")
        )
        self.official_chara = self.load_official_table(
            "charaList.json", ("charaId", "characterId", "id"), ("charaName", "name", "displayName")
        )
        self.official_section = self.load_official_table(
            "sectionList.json", ("sectionId", "storyId", "id"), ("title", "sectionName", "name")
        )
        self.official_event = self.load_official_table(
            "eventList.json", ("eventId", "id"), ("eventName", "name", "title")
        )
        self.official_event_story = self.load_official_table(
            "eventStoryList.json", ("storyId", "sectionId", "eventStoryId", "id"), ("title", "storyName", "name")
        )
        self.official_chapter = self.load_official_table(
            "chapterList.json", ("chapterId", "id"), ("chapterName", "title", "name")
        )
        sizes = {
            "pieceList": len(self.official_piece),
            "charaList": len(self.official_chara),
            "sectionList": len(self.official_section),
            "eventList": len(self.official_event),
            "eventStoryList": len(self.official_event_story),
            "chapterList": len(self.official_chapter),
        }
        self.counts.update({f"official_table_{k}": v for k, v in sizes.items()})
        if len(self.official_piece) < 900:
            raise RuntimeError(f"pieceList extraction is implausibly small: {len(self.official_piece)}")
        if len(self.official_chara) < 150:
            raise RuntimeError(f"charaList extraction is implausibly small: {len(self.official_chara)}")
        if len(self.official_section) < 900:
            raise RuntimeError(f"sectionList extraction is implausibly small: {len(self.official_section)}")

    def explicit_fields(self, record: dict[str, Any], hints: tuple[str, ...]) -> list[tuple[str, str]]:
        fields: list[tuple[str, str]] = []
        for key, value in record.items():
            if not isinstance(value, str) or not value.strip():
                continue
            nk = self.normalized_key(key)
            if any(hint in nk for hint in hints):
                fields.append((str(key), self.clean_text(value)))
        return fields

    def ids_from_context(self, record: dict[str, Any], trail: tuple[str, ...]) -> set[str]:
        ids: set[str] = set()
        for text in self.flattened_strings(record) + list(trail):
            for match in ID_RE.finditer(text):
                ids.add(str(int(match.group(1))))
        return ids

    def add_pairs_from_data(self, data: Any, source: str, detail: str) -> None:
        for trail, record in self.walk_records(data):
            ja_fields = self.explicit_fields(record, JP_FIELD_HINTS)
            zh_fields = self.explicit_fields(record, ZH_FIELD_HINTS)
            ids = self.ids_from_context(record, trail)

            if not ja_fields:
                for key, value in record.items():
                    if isinstance(value, str) and self.contains_kana(value):
                        nk = self.normalized_key(key)
                        if any(token in nk for token in TEXT_KEY_HINTS):
                            ja_fields.append((str(key), self.clean_text(value)))

            if not zh_fields and ja_fields:
                for key, value in record.items():
                    if not isinstance(value, str) or not value.strip() or self.contains_kana(value):
                        continue
                    nk = self.normalized_key(key)
                    if any(token in nk for token in TEXT_KEY_HINTS) and self.contains_cjk(value):
                        zh_fields.append((str(key), self.clean_text(value)))

            approved = True
            if source == "manual-approved":
                provenance = " ".join(self.flattened_strings(record, 64)).casefold()
                approved = any(token in provenance for token in (
                    "manual", "human", "approved", "official", "audit", "人工", "审核", "国服", "已确认"
                ))
            if approved:
                for _, ja in ja_fields[:4]:
                    for _, zh in zh_fields[:4]:
                        self.add_candidate(ja, zh, source, detail)

            for _, ja in ja_fields:
                for rid in ids:
                    if rid in self.official_chara and self.looks_like_name(ja):
                        self.add_candidate(ja, self.official_chara[rid], "official-cn-libs", f"charaList:{rid}")
                        self.jp_name_to_cn[ja] = self.official_chara[rid]
                        self.jp_name_norm_to_cn[self.norm(ja)] = self.official_chara[rid]
                    if rid in self.official_section:
                        self.add_candidate(ja, self.official_section[rid], "official-cn-libs", f"sectionList:{rid}")
                    if rid in self.official_event_story:
                        self.add_candidate(ja, self.official_event_story[rid], "official-cn-libs", f"eventStoryList:{rid}")
                    if rid in self.official_event:
                        self.add_candidate(ja, self.official_event[rid], "official-cn-libs", f"eventList:{rid}")
                    if rid in self.official_chapter:
                        self.add_candidate(ja, self.official_chapter[rid], "official-cn-libs", f"chapterList:{rid}")

            if isinstance(record, dict):
                for key, value in record.items():
                    if isinstance(key, str) and isinstance(value, str) and self.contains_kana(key):
                        if not self.contains_kana(value):
                            self.add_candidate(key, value, source, detail)

    @staticmethod
    def looks_like_name(text: str) -> bool:
        value = unicodedata.normalize("NFKC", text).strip()
        if len(value) > 50 or "\n" in value:
            return False
        if re.search(r"[！？!?。]", value):
            return False
        if re.search(r"(から|まで|だけ|なら|ので|けど|です|ます|だった|して|した|する|いる|ある)", value):
            return False
        return True

    def candidate_files(self, root: Path, source: str) -> list[Path]:
        if not root.exists():
            return []
        selected: list[tuple[int, Path]] = []
        for path in root.rglob("*.json"):
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size > 32 * 1024 * 1024:
                continue
            rel = path.relative_to(root).as_posix().casefold()
            priority = 0
            if rel.endswith("story_index.json"):
                priority = 100
            elif rel.endswith("titles.json"):
                priority = 95
            elif any(token in rel for token in ("story", "title", "character", "chara", "dictionary", "catalog", "manifest")):
                priority = 50
            elif source == "magireco-wiki-data" and path.name in {
                "characters.json", "memoria.json", "story.json", "pages_index.json"
            }:
                priority = 90
            if priority:
                selected.append((priority, path))
        selected.sort(key=lambda item: (-item[0], item[1].as_posix()))
        return [path for _, path in selected[:400]]

    def load_secondary_sources(self) -> None:
        audit_candidates = [
            self.public / "data" / "translation-audit-v5.json",
            self.public / "data" / "story-title-manual-overrides.json",
            self.public / "data" / "story-title-audit.json",
        ]
        for path in audit_candidates:
            if path.exists():
                try:
                    self.add_pairs_from_data(self.load_json(path), "manual-approved", path.relative_to(self.root).as_posix())
                except Exception as exc:
                    print(f"warning: cannot read manual source {path}: {exc}", file=sys.stderr)

        for path in self.candidate_files(self.reader, "magi-reader"):
            try:
                self.add_pairs_from_data(self.load_json(path), "magi-reader", path.relative_to(self.reader).as_posix())
                self.counts["reader_files_scanned"] += 1
            except Exception:
                self.counts["reader_files_rejected"] += 1

        if self.wiki:
            for path in self.candidate_files(self.wiki, "magireco-wiki-data"):
                try:
                    self.add_pairs_from_data(self.load_json(path), "magireco-wiki-data", path.relative_to(self.wiki).as_posix())
                    self.counts["wiki_files_scanned"] += 1
                except Exception:
                    self.counts["wiki_files_rejected"] += 1

        for ja, zh in WIKI_SEED.items():
            self.add_candidate(ja, zh, "magireco-wiki-data", "curated structured-wiki seed")

        for ja, zh in COMMON_NAME_SEED.items():
            existing = self.mapping.get(self.norm(ja))
            if existing is None:
                self.add_candidate(ja, zh, "rule-fallback", "curated name seed")

    def direct_official_from_ids(self, source: str, context: str) -> Candidate | None:
        no_match = NO_RE.match(source)
        if no_match:
            number = int(no_match.group(1))
            piece_id = str(1000 + number)
            name = self.official_piece.get(piece_id)
            if name:
                return Candidate(f"No.{number} {name}", "official-cn-libs", f"pieceList:{piece_id}", PRIORITY["official-cn-libs"])

        ids = {str(int(match.group(1))) for match in ID_RE.finditer(context)}
        for table_name, table in (
            ("sectionList", self.official_section),
            ("eventStoryList", self.official_event_story),
            ("eventList", self.official_event),
            ("chapterList", self.official_chapter),
        ):
            for rid in ids:
                if rid in table:
                    return Candidate(table[rid], "official-cn-libs", f"{table_name}:{rid}", PRIORITY["official-cn-libs"])

        if self.looks_like_name(source):
            for rid in ids:
                if rid in self.official_chara:
                    return Candidate(self.official_chara[rid], "official-cn-libs", f"charaList:{rid}", PRIORITY["official-cn-libs"])
        return None

    def translate_composite_name(self, source: str) -> str | None:
        original = source
        suffix = ""
        body = source
        match = re.search(r"[（(]([^()（）]+)[）)]\s*$", source)
        if match:
            raw_suffix = match.group(1)
            converted = raw_suffix
            for ja, zh in SUFFIX_RULES.items():
                converted = converted.replace(ja, zh)
            converted = converted.replace("ver.", "ver.").replace("ver", "ver.")
            suffix = f"（{converted}）"
            body = source[:match.start()].strip()

        exact = self.jp_name_norm_to_cn.get(self.norm(body))
        if exact:
            return exact + suffix

        parts = re.split(r"[・·＆&＋+]", body)
        if len(parts) <= 1:
            return None
        translated: list[str] = []
        for part in parts:
            part = part.strip()
            cn = self.jp_name_norm_to_cn.get(self.norm(part))
            if not cn:
                candidate = self.mapping.get(self.norm(part))
                if candidate and candidate.priority >= PRIORITY["magi-reader"]:
                    cn = candidate.zh
            if not cn:
                return None
            translated.append(cn)
        result = "·".join(translated) + suffix
        return result if result != original else None

    def rule_translate(self, source: str) -> str | None:
        if source in PHRASE_RULES:
            return PHRASE_RULES[source]
        result = source
        changed = False
        for ja in sorted(self.jp_name_to_cn, key=len, reverse=True):
            if ja and ja in result:
                result = result.replace(ja, self.jp_name_to_cn[ja])
                changed = True
        for ja, zh in sorted(SUFFIX_RULES.items(), key=lambda item: len(item[0]), reverse=True):
            if ja in result:
                result = result.replace(ja, zh)
                changed = True
        for ja, zh in sorted(PHRASE_RULES.items(), key=lambda item: len(item[0]), reverse=True):
            if ja in result:
                result = result.replace(ja, zh)
                changed = True
        return result if changed and not self.contains_kana(result) else None

    def machine_translate(self, source: str) -> str | None:
        if source in self.translation_cache:
            cached = self.translation_cache[source]
            return cached or None
        if self.machine_disabled or self.machine_used >= self.max_machine:
            return None
        if not self.contains_kana(source) or len(source) > 220:
            return None

        masked = source
        placeholders: dict[str, str] = {}
        index = 0
        for ja in sorted(self.jp_name_to_cn, key=len, reverse=True):
            if len(ja) < 2 or ja not in masked:
                continue
            token = f"ZXQNAME{index}ZXQ"
            masked = masked.replace(ja, token)
            placeholders[token] = self.jp_name_to_cn[ja]
            index += 1
            if index >= 20:
                break
        for latin in sorted(set(re.findall(r"[A-Za-z][A-Za-z0-9 _.'+&/\-]{2,}", masked)), key=len, reverse=True):
            token = f"ZXQLATIN{index}ZXQ"
            masked = masked.replace(latin, token)
            placeholders[token] = latin
            index += 1

        query = urllib.parse.urlencode({
            "client": "gtx", "sl": "ja", "tl": "zh-CN", "dt": "t", "q": masked
        })
        url = "https://translate.googleapis.com/translate_a/single?" + query
        result: str | None = None
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 V22 title builder"})
                with urllib.request.urlopen(request, timeout=20) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                translated = "".join(part[0] for part in payload[0] if part and part[0])
                for token, replacement in placeholders.items():
                    translated = re.sub(re.escape(token), replacement, translated, flags=re.I)
                translated = self.clean_text(translated)
                if translated and translated != source and not self.contains_kana(translated):
                    result = translated
                    break
            except Exception:
                time.sleep(0.4 * (attempt + 1))
        self.machine_used += 1
        if result is None:
            self.machine_failures += 1
            if self.machine_failures >= 30 and self.machine_failures > self.machine_used * 0.6:
                self.machine_disabled = True
        self.translation_cache[source] = result or ""
        time.sleep(0.04)
        return result

    def resolve(self, source: str, current: str, context: str) -> Resolution:
        source = self.clean_text(source)
        current = self.clean_text(current)
        if not source:
            return Resolution(current, "unresolved", "empty source", False)

        official = self.direct_official_from_ids(source, context)
        if official:
            return Resolution(official.zh, official.source, official.detail, True)

        candidate = self.mapping.get(self.norm(source))
        if candidate:
            return Resolution(candidate.zh, candidate.source, candidate.detail, candidate.priority >= PRIORITY["magireco-wiki-data"])

        composite = self.translate_composite_name(source)
        if composite:
            return Resolution(composite, "rule-fallback", "official-name composition", False)

        if self.is_natural_latin(source):
            return Resolution(source, "retained-latin", "natural Latin/English title retained", False)

        if not self.contains_kana(source):
            return Resolution(source, "same-kanji", "kanji-only title retained when no authoritative different form exists", False)

        ruled = self.rule_translate(source)
        if ruled:
            return Resolution(ruled, "rule-fallback", "conservative phrase/name rules", False)

        if current and current != source and not self.contains_kana(current):
            return Resolution(current, "retained-existing", "existing complete Chinese localization retained", False)

        machine = self.machine_translate(source)
        if machine:
            return Resolution(machine, "machine-fallback", "lowest-priority ja→zh-CN fallback", False)

        return Resolution(current or source, "unresolved", "no usable source or fallback", False)

    def source_fields(self, record: dict[str, Any]) -> list[str]:
        explicit: list[str] = []
        for key, value in record.items():
            if not isinstance(value, str) or not value.strip():
                continue
            nk = self.normalized_key(key)
            if any(hint in nk for hint in JP_FIELD_HINTS):
                explicit.append(str(key))
        if explicit:
            return explicit
        title_like = [
            str(key) for key, value in record.items()
            if isinstance(value, str) and self.contains_kana(value)
            and any(token in self.normalized_key(key) for token in TEXT_KEY_HINTS)
            and not any(hint in self.normalized_key(key) for hint in ZH_FIELD_HINTS)
        ]
        return title_like[:1]

    def target_fields(self, record: dict[str, Any], source_keys: list[str]) -> list[str]:
        targets: list[str] = []
        for key, value in record.items():
            if not isinstance(value, str):
                continue
            nk = self.normalized_key(key)
            if any(hint in nk for hint in ZH_FIELD_HINTS):
                targets.append(str(key))
        if source_keys and "title" in record and "title" not in source_keys and isinstance(record["title"], str):
            targets.append("title")
        if source_keys and "displayTitle" in record and isinstance(record["displayTitle"], str):
            targets.append("displayTitle")
        return list(dict.fromkeys(targets))

    def record_translation(self, source: str, result: Resolution, path: tuple[str, ...], current: str) -> None:
        key = hashlib.sha1(("/".join(path) + "\0" + source).encode("utf-8")).hexdigest()[:16]
        entry = {
            "id": key,
            "path": "/".join(path),
            "ja": source,
            "zh": result.zh,
            "source": result.source,
            "detail": result.detail,
            "authoritative": result.authoritative,
            "previous": current,
        }
        old = self.output_map.get(source)
        if old is None or PRIORITY.get(result.source, 0) > PRIORITY.get(str(old.get("source")), 0):
            self.output_map[source] = entry
        self.counts[f"resolved_{result.source}"] += 1
        if result.zh != current:
            self.counts["changed_fields"] += 1
        if not result.authoritative and result.source not in {"retained-latin", "same-kanji"}:
            self.missing_authoritative.setdefault(source, entry)
        if self.contains_kana(result.zh):
            self.unresolved_display.setdefault(source, entry)

    def patch_node(self, node: Any, trail: tuple[str, ...], file_hint: str) -> Any:
        if isinstance(node, dict):
            context = " ".join(self.flattened_strings(node, 128) + list(trail))

            for key in list(node.keys()):
                value = node[key]
                if isinstance(key, str) and isinstance(value, str) and self.contains_kana(key):
                    result = self.resolve(key, value, context)
                    self.record_translation(key, result, trail + (key,), value)
                    node[key] = result.zh

            sources = self.source_fields(node)
            targets = self.target_fields(node, sources)
            for source_key in sources[:2]:
                source = node.get(source_key)
                if not isinstance(source, str):
                    continue
                if targets:
                    for target_key in targets:
                        current = node.get(target_key)
                        if not isinstance(current, str):
                            continue
                        result = self.resolve(source, current, context)
                        self.record_translation(source, result, trail + (target_key,), current)
                        node[target_key] = result.zh
                elif "story-title-groups" in file_hint and source_key == "title" and self.contains_kana(source):
                    result = self.resolve(source, "", context)
                    self.record_translation(source, result, trail + (source_key,), source)
                    if result.zh != source:
                        node.setdefault("titleJa", source)
                        node[source_key] = result.zh
                elif "story-title-groups" in file_hint and source_key != "title":
                    result = self.resolve(source, "", context)
                    self.record_translation(source, result, trail + ("titleZh",), "")
                    node.setdefault("titleZh", result.zh)

            for key, value in list(node.items()):
                if isinstance(value, (dict, list)):
                    node[key] = self.patch_node(value, trail + (str(key),), file_hint)
            return node

        if isinstance(node, list):
            if len(node) == 2 and all(isinstance(item, str) for item in node) and self.contains_kana(node[0]):
                result = self.resolve(node[0], node[1], " ".join(trail))
                self.record_translation(node[0], result, trail + ("1",), node[1])
                node[1] = result.zh
            for index, value in enumerate(list(node)):
                if isinstance(value, (dict, list)):
                    node[index] = self.patch_node(value, trail + (str(index),), file_hint)
            self.natural_sort(node)
            return node
        return node

    @staticmethod
    def title_from_item(item: Any) -> str:
        if not isinstance(item, dict):
            return ""
        for key in ("titleZh", "titleCn", "translation", "translatedTitle", "title", "name"):
            value = item.get(key)
            if isinstance(value, str):
                return value
        return ""

    def natural_sort(self, values: list[Any]) -> None:
        numbered: list[tuple[int, int]] = []
        for index, item in enumerate(values):
            title = self.title_from_item(item)
            match = NO_RE.match(title)
            if match:
                numbered.append((index, int(match.group(1))))
        if len(numbered) >= 3 and len(numbered) / max(len(values), 1) >= 0.6:
            values.sort(key=lambda item: (
                int(NO_RE.match(self.title_from_item(item)).group(1))
                if NO_RE.match(self.title_from_item(item)) else 10**9,
                self.title_from_item(item),
            ))
            self.counts["natural_sorted_lists"] += 1

    def target_json_files(self) -> list[Path]:
        files: list[Path] = []
        for path in self.public.rglob("*.json"):
            rel = path.relative_to(self.public).as_posix().casefold()
            name = path.name.casefold()
            if "story-title-groups" in name:
                files.append(path)
            elif rel.endswith("data/story-v7/localization.json"):
                files.append(path)
            elif "story-title" in name and not any(token in name for token in ("report", "audit", "authority")):
                files.append(path)
        unique = sorted(set(files))
        if not unique:
            raise RuntimeError("No story-title localization JSON targets were found")
        return unique

    def patch_json_targets(self) -> list[str]:
        changed: list[str] = []
        for path in self.target_json_files():
            before = path.read_bytes()
            data = self.load_json(path)
            data = self.patch_node(data, (path.relative_to(self.public).as_posix(),), path.name.casefold())
            rendered = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            if rendered != before:
                path.write_bytes(rendered)
                rel = path.relative_to(self.root).as_posix()
                changed.append(rel)
                self.changed_paths.add(rel)
            self.counts["target_json_files"] += 1
        return changed

    def patch_menu(self) -> None:
        title_text = "魔法纪录·Magia Exedra 魔法少女称呼搜索"
        css_href = "myfile/v22-menu-fixes.css?v=20260820"
        js_src = "myfile/v22-runtime-fixes.js?v=20260820"
        html_files = sorted(self.public.rglob("*.html"))
        menu_pages = 0
        for path in html_files:
            text = path.read_text(encoding="utf-8-sig", errors="replace")
            original = text
            text = re.sub(
                r'<([A-Za-z][\w:-]*)\b[^>]*class=["\'][^"\']*\bnavtext-container\b[^"\']*["\'][^>]*>.*?</\1\s*>',
                "",
                text,
                flags=re.I | re.S,
            )
            if title_text in text:
                body_match = re.search(r"<body\b[^>]*>(.*)</body\s*>", text, flags=re.I | re.S)
                if body_match and title_text in body_match.group(1):
                    body = body_match.group(1).replace(title_text, "")
                    text = text[:body_match.start(1)] + body + text[body_match.end(1):]
            if not re.search(r'<meta\s+name=["\']viewport["\']', text, flags=re.I):
                text = re.sub(r"</head\s*>", '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>', text, count=1, flags=re.I)
            has_menu = any(token in text for token in ("menu-btn", "hamburgerMenu", "class=\"menu\"", "class='menu'"))
            if has_menu:
                menu_pages += 1
                if css_href not in text:
                    text = re.sub(r"</head\s*>", f'<link rel="stylesheet" href="{css_href}">\n</head>', text, count=1, flags=re.I)
                if js_src not in text:
                    text = re.sub(r"</body\s*>", f'<script src="{js_src}" defer></script>\n</body>', text, count=1, flags=re.I)
            if path.name == "index.html":
                marker = f'<meta name="v22-release" content="{RELEASE}">'
                if marker not in text:
                    text = re.sub(r"</head\s*>", marker + "\n</head>", text, count=1, flags=re.I)
            if text != original:
                path.write_text(text, encoding="utf-8")
                self.changed_paths.add(path.relative_to(self.root).as_posix())
        self.counts["menu_pages"] = menu_pages
        if menu_pages == 0:
            raise RuntimeError("No hamburger-menu pages were detected")

        css = f"""/* {RELEASE}\n   The menu remains a local overlay whose intrinsic width is determined by its\n   widest label. Opening it must never lock or replace the whole document. */\n.navtext-container {{ display: none !important; }}\n.menu {{\n  inline-size: max-content !important;\n  width: max-content !important;\n  min-inline-size: 0 !important;\n  min-width: 0 !important;\n  max-inline-size: min(34rem, calc(100vw - 1rem)) !important;\n  max-width: min(34rem, calc(100vw - 1rem)) !important;\n  block-size: auto !important;\n  height: auto !important;\n  min-height: 0 !important;\n  max-block-size: calc(100dvh - 1rem) !important;\n  max-height: calc(100dvh - 1rem) !important;\n  right: auto !important;\n  bottom: auto !important;\n  overflow-x: hidden !important;\n  overflow-y: auto !important;\n  box-sizing: border-box !important;\n  contain: layout paint !important;\n}}\n.menu ul, .menu ol, .menu-list, .menu-content {{\n  inline-size: max-content !important;\n  width: max-content !important;\n  max-inline-size: 100% !important;\n  max-width: 100% !important;\n  box-sizing: border-box !important;\n}}\n.menu li, .menu a, .menu button {{\n  inline-size: auto !important;\n  width: auto !important;\n  max-inline-size: 100% !important;\n  max-width: 100% !important;\n  margin-inline: 0 !important;\n  box-sizing: border-box !important;\n  white-space: nowrap !important;\n}}\nbody:has(.menu-btn:checked),\nbody:has(#menu-btn:checked),\nhtml:has(.menu-btn:checked),\nhtml:has(#menu-btn:checked) {{\n  overflow: auto !important;\n  position: static !important;\n  inline-size: auto !important;\n  width: auto !important;\n}}\n@media (max-width: 36rem) {{\n  .menu {{ max-inline-size: calc(100vw - .5rem) !important; max-width: calc(100vw - .5rem) !important; }}\n  .menu li, .menu a, .menu button {{ white-space: normal !important; overflow-wrap: anywhere !important; }}\n}}\n"""
        css_path = self.public / "myfile" / "v22-menu-fixes.css"
        css_path.parent.mkdir(parents=True, exist_ok=True)
        css_path.write_text(css, encoding="utf-8")
        self.changed_paths.add(css_path.relative_to(self.root).as_posix())

        runtime = f"""/* {RELEASE} */\n(() => {{\n  'use strict';\n  const selectors = ['.menu-btn', '#menu-btn', 'input[type="checkbox"][class*="menu"]'];\n  const checkbox = selectors.map(s => document.querySelector(s)).find(Boolean);\n  const menu = document.querySelector('.menu');\n  if (!checkbox || !menu) return;\n  checkbox.setAttribute('aria-controls', menu.id || 'site-hamburger-menu');\n  if (!menu.id) menu.id = 'site-hamburger-menu';\n  checkbox.setAttribute('aria-label', '打开或关闭导航菜单');\n  const floating = [];\n  const rememberFloating = () => {{\n    floating.length = 0;\n    for (const el of document.body.querySelectorAll('*')) {{\n      const style = getComputedStyle(el);\n      if (style.position !== 'fixed' || style.display === 'none') continue;\n      const r = el.getBoundingClientRect();\n      if (r.width > 0 && r.width <= 160 && r.height > 0 && r.right >= innerWidth - 32) {{\n        floating.push([el, style.display, style.visibility, style.opacity]);\n      }}\n    }}\n  }};\n  const synchronize = () => {{\n    const open = Boolean(checkbox.checked);\n    checkbox.setAttribute('aria-expanded', String(open));\n    document.documentElement.style.setProperty('overflow', 'auto', 'important');\n    document.body.style.setProperty('overflow', 'auto', 'important');\n    if (open) {{\n      menu.style.setProperty('width', 'max-content', 'important');\n      menu.style.setProperty('height', 'auto', 'important');\n      for (const [el, display, visibility, opacity] of floating) {{\n        el.style.setProperty('display', display, 'important');\n        el.style.setProperty('visibility', visibility, 'important');\n        el.style.setProperty('opacity', opacity, 'important');\n      }}\n    }}\n  }};\n  addEventListener('DOMContentLoaded', () => {{ rememberFloating(); synchronize(); }}, {{ once: true }});\n  checkbox.addEventListener('change', synchronize);\n  addEventListener('keydown', event => {{\n    if (event.key === 'Escape' && checkbox.checked) {{ checkbox.checked = false; synchronize(); checkbox.focus(); }}\n  }});\n  addEventListener('resize', synchronize, {{ passive: true }});\n}})();\n"""
        js_path = self.public / "myfile" / "v22-runtime-fixes.js"
        js_path.write_text(runtime, encoding="utf-8")
        self.changed_paths.add(js_path.relative_to(self.root).as_posix())

    def remove_obsolete_main_dependencies(self) -> None:
        obsolete = [
            self.root / ".github" / "workflows" / "deploy-v21-production.yml",
            self.root / ".github" / "workflows" / "authority-v22-diagnostic.yml",
            self.root / ".deploy-v21-trigger",
            self.root / ".automation" / "authority-v22-diagnostic-run.json",
            self.root / ".automation" / "authority-v22-final-source-run.json",
        ]
        for path in obsolete:
            if path.exists():
                path.unlink()
                self.changed_paths.add(path.relative_to(self.root).as_posix())
                self.counts["obsolete_files_removed"] += 1

    def write_reports(self, target_files: list[str]) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.dump_json(self.cache_path, dict(sorted(self.translation_cache.items())))
        self.changed_paths.add(self.cache_path.relative_to(self.root).as_posix())

        authority_entries = sorted(
            self.output_map.values(),
            key=lambda item: (-PRIORITY.get(str(item.get("source")), 0), str(item.get("ja"))),
        )
        missing = sorted(self.missing_authoritative.values(), key=lambda item: str(item.get("ja")))
        unresolved = sorted(self.unresolved_display.values(), key=lambda item: str(item.get("ja")))
        report = {
            "release": RELEASE,
            "authorityOrder": [
                "official-cn-libs", "manual-approved", "magi-reader",
                "magireco-wiki-data", "rule/machine fallback",
            ],
            "policy": {
                "retainNaturalLatinAndEnglish": True,
                "retainKanjiOnlyWhenChineseWouldBeIdentical": True,
                "pieceNumberMapping": "No.n -> pieceId 1000+n",
            },
            "counts": dict(sorted(self.counts.items())),
            "targetFiles": target_files,
            "changedPaths": sorted(self.changed_paths),
            "uniqueTranslations": len(authority_entries),
            "missingAuthoritativeCount": len(missing),
            "displayStillContainsKanaCount": len(unresolved),
            "machineTranslationRequests": self.machine_used,
            "machineTranslationFailures": self.machine_failures,
            "translations": authority_entries,
            "missingAuthoritative": missing,
            "displayStillContainsKana": unresolved,
        }
        report_path = self.public / "data" / "story-title-authority-report-v22.json"
        self.dump_json(report_path, report)
        self.changed_paths.add(report_path.relative_to(self.root).as_posix())

        map_path = self.public / "data" / "story-title-authority-map-v22.json"
        compact = {
            entry["ja"]: {"zh": entry["zh"], "source": entry["source"], "detail": entry["detail"]}
            for entry in authority_entries
        }
        self.dump_json(map_path, {"release": RELEASE, "titles": compact})
        self.changed_paths.add(map_path.relative_to(self.root).as_posix())

        tsv_path = self.public / "downloads" / "story-title-missing-authoritative-v22.tsv"
        tsv_path.parent.mkdir(parents=True, exist_ok=True)
        rows = ["日文标题\t当前中文显示\t最低级来源\t位置\t说明"]
        for item in missing:
            values = [
                str(item.get("ja", "")), str(item.get("zh", "")), str(item.get("source", "")),
                str(item.get("path", "")), str(item.get("detail", "")),
            ]
            rows.append("\t".join(value.replace("\t", " ").replace("\r", " ").replace("\n", " ") for value in values))
        tsv_path.write_text("\ufeff" + "\n".join(rows) + "\n", encoding="utf-8")
        self.changed_paths.add(tsv_path.relative_to(self.root).as_posix())

    def static_audit(self) -> dict[str, Any]:
        findings: list[dict[str, Any]] = []
        json_errors: list[dict[str, str]] = []
        for path in self.public.rglob("*.json"):
            try:
                self.load_json(path)
            except Exception as exc:
                json_errors.append({"path": path.relative_to(self.root).as_posix(), "error": str(exc)})
        if json_errors:
            findings.append({"severity": "critical", "code": "invalid-json", "items": json_errors[:100]})

        duplicate_ids: list[dict[str, Any]] = []
        missing_viewport: list[str] = []
        title_leaks: list[str] = []
        broken_refs: list[dict[str, str]] = []
        ref_re = re.compile(r"\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)
        id_re = re.compile(r"\bid\s*=\s*[\"']([^\"']+)[\"']", re.I)
        title_text = "魔法纪录·Magia Exedra 魔法少女称呼搜索"
        for path in self.public.rglob("*.html"):
            text = path.read_text(encoding="utf-8-sig", errors="replace")
            ids = id_re.findall(text)
            duplicates = sorted(key for key, count in collections.Counter(ids).items() if count > 1)
            if duplicates:
                duplicate_ids.append({"path": path.relative_to(self.root).as_posix(), "ids": duplicates})
            if not re.search(r'<meta\s+name=["\']viewport["\']', text, re.I):
                missing_viewport.append(path.relative_to(self.root).as_posix())
            body = re.search(r"<body\b[^>]*>(.*)</body\s*>", text, re.I | re.S)
            if body and title_text in body.group(1):
                title_leaks.append(path.relative_to(self.root).as_posix())
            for ref in ref_re.findall(text):
                if not ref or ref.startswith(("#", "http://", "https://", "data:", "mailto:", "tel:", "javascript:")):
                    continue
                clean = ref.split("?", 1)[0].split("#", 1)[0]
                if not clean or "{{" in clean or "${" in clean:
                    continue
                target = (self.public / clean.lstrip("/")) if clean.startswith("/") else (path.parent / clean)
                if not target.exists():
                    broken_refs.append({"page": path.relative_to(self.root).as_posix(), "ref": ref})

        if duplicate_ids:
            findings.append({"severity": "warning", "code": "duplicate-html-ids", "items": duplicate_ids[:100]})
        if missing_viewport:
            findings.append({"severity": "warning", "code": "missing-viewport", "items": missing_viewport})
        if title_leaks:
            findings.append({"severity": "critical", "code": "removed-title-still-in-body", "items": title_leaks})
        if broken_refs:
            findings.append({"severity": "warning", "code": "missing-static-references", "count": len(broken_refs), "items": broken_refs[:100]})

        stale_workflows: list[dict[str, str]] = []
        workflow_root = self.root / ".github" / "workflows"
        if workflow_root.exists():
            pattern = re.compile(r"(?:safe-v\d+|release/|rollback/|fix/)[A-Za-z0-9_./-]*")
            for path in workflow_root.glob("*.y*ml"):
                text = path.read_text(encoding="utf-8", errors="replace")
                refs = sorted(set(pattern.findall(text)))
                if refs:
                    stale_workflows.append({"path": path.relative_to(self.root).as_posix(), "references": ", ".join(refs[:20])})
        if stale_workflows:
            findings.append({"severity": "warning", "code": "workflow-references-obsolete-branches", "items": stale_workflows})

        tracked_node_modules = ""
        try:
            tracked_node_modules = subprocess.check_output(
                ["git", "ls-files", "node_modules"], cwd=self.root, text=True, stderr=subprocess.DEVNULL
            ).strip()
        except Exception:
            pass
        if tracked_node_modules:
            findings.append({
                "severity": "maintenance",
                "code": "tracked-node-modules",
                "count": len(tracked_node_modules.splitlines()),
                "note": "Tracked dependencies enlarge clones and updates; remove in a dedicated history-safe maintenance pass.",
            })

        large_files = []
        for path in self.public.rglob("*"):
            if path.is_file() and path.stat().st_size > 8 * 1024 * 1024:
                large_files.append({"path": path.relative_to(self.root).as_posix(), "bytes": path.stat().st_size})
        if large_files:
            findings.append({
                "severity": "performance",
                "code": "large-static-payloads",
                "items": sorted(large_files, key=lambda item: -item["bytes"])[:50],
                "note": "These files should be monitored for parse cost and cache invalidation; this release does not split data formats incompatibly.",
            })

        css_text = (self.public / "myfile" / "v22-menu-fixes.css").read_text(encoding="utf-8")
        menu_ok = "width: max-content !important" in css_text and "overflow: auto !important" in css_text
        if not menu_ok:
            findings.append({"severity": "critical", "code": "menu-contract-missing"})

        audit = {
            "release": RELEASE,
            "state": "fail" if any(item["severity"] == "critical" for item in findings) else "pass-with-observations",
            "findings": findings,
            "summary": {
                "jsonErrors": len(json_errors),
                "duplicateIdPages": len(duplicate_ids),
                "missingViewportPages": len(missing_viewport),
                "titleLeakPages": len(title_leaks),
                "brokenStaticReferences": len(broken_refs),
                "staleWorkflowFiles": len(stale_workflows),
                "trackedNodeModules": len(tracked_node_modules.splitlines()) if tracked_node_modules else 0,
                "largeStaticFiles": len(large_files),
            },
        }
        audit_path = self.public / "data" / "v22-site-audit.json"
        self.dump_json(audit_path, audit)
        self.changed_paths.add(audit_path.relative_to(self.root).as_posix())

        md = [
            "# V22 网站缺陷审计", "", f"发布标识：`{RELEASE}`", "",
            f"静态审计状态：**{audit['state']}**", "",
            "## 自动检查结果", "",
        ]
        for finding in findings:
            md.append(f"- **{finding['severity']} / {finding['code']}**：{finding.get('count', len(finding.get('items', [])) if isinstance(finding.get('items'), list) else 1)}")
            if finding.get("note"):
                md.append(f"  - {finding['note']}")
        if not findings:
            md.append("- 未发现静态阻断项。")
        md += [
            "", "## 仍需持续观察的结构性风险", "",
            "- 标题和剧情数据为大型静态 JSON；移动端首载、解析与长列表 DOM 数量仍需通过真实浏览器回归持续监控。",
            "- Cloudflare Pages 的边缘缓存可能短暂保留旧 HTML；验收流程使用随机查询参数并核对发布标识，避免把缓存命中误判为发布失败。",
            "- Wiki 与机器翻译都不是国服权威来源；所有低优先级结果均进入 `story-title-missing-authoritative-v22.tsv`，不能反向覆盖今后新增的国服译名。",
            "- 分支删除属于仓库引用管理，不在本脚本内执行；产品构建已经不再依赖 `safe-v18-production-fix`。",
            "",
        ]
        docs = self.root / "docs" / "V22_SITE_AUDIT.md"
        docs.parent.mkdir(parents=True, exist_ok=True)
        docs.write_text("\n".join(md), encoding="utf-8")
        self.changed_paths.add(docs.relative_to(self.root).as_posix())
        return audit

    def acceptance(self, audit: dict[str, Any]) -> None:
        if audit["state"] == "fail":
            raise RuntimeError("Static site audit contains critical findings")
        if self.counts["target_json_files"] < 1:
            raise RuntimeError("No title JSON file was processed")
        if self.counts["changed_fields"] < 100:
            raise RuntimeError(f"Implausibly few localization changes: {self.counts['changed_fields']}")
        if len(self.unresolved_display) > 250:
            raise RuntimeError(f"Too many displayed titles still contain kana: {len(self.unresolved_display)}")
        index = (self.public / "index.html").read_text(encoding="utf-8", errors="replace")
        if RELEASE not in index:
            raise RuntimeError("Release marker is missing from index.html")
        if "navtext-container" in index:
            raise RuntimeError("navtext-container still exists in index.html")

    def run(self) -> dict[str, Any]:
        self.load_official()
        self.load_secondary_sources()
        targets = self.patch_json_targets()
        self.patch_menu()
        self.remove_obsolete_main_dependencies()
        self.write_reports(targets)
        audit = self.static_audit()
        self.acceptance(audit)
        summary = {
            "release": RELEASE,
            "state": "pass",
            "counts": dict(sorted(self.counts.items())),
            "missingAuthoritativeCount": len(self.missing_authoritative),
            "displayStillContainsKanaCount": len(self.unresolved_display),
            "changedPaths": sorted(self.changed_paths),
        }
        summary_path = self.root / ".automation" / "v22-build-summary.json"
        self.dump_json(summary_path, summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return summary


def run_existing_builders(root: Path) -> None:
    for relative in (
        "scripts/build-story-titles-v10.py",
        "scripts/build-story-title-groups-v1.py",
    ):
        path = root / relative
        if not path.exists():
            continue
        print(f"Running existing generator before V22 post-processing: {relative}")
        result = subprocess.run([sys.executable, str(path)], cwd=root)
        if result.returncode != 0:
            print(f"warning: existing generator returned {result.returncode}; continuing with existing generated data", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--public", default="public")
    parser.add_argument("--cn-libs", default="_sources/magireco-cn-patch/magica/js/libs")
    parser.add_argument("--reader", default="_sources/magi-reader")
    parser.add_argument("--wiki", default="_sources/magireco-wiki-data")
    parser.add_argument("--skip-existing-builders", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    public = (root / args.public).resolve()
    libs = (root / args.cn_libs).resolve()
    reader = (root / args.reader).resolve()
    wiki = (root / args.wiki).resolve()
    if not public.exists():
        raise SystemExit(f"public directory does not exist: {public}")
    if not libs.exists():
        raise SystemExit(f"official CN libs directory does not exist: {libs}")
    if not reader.exists():
        raise SystemExit(f"MagiReader source directory does not exist: {reader}")

    if not args.skip_existing_builders:
        run_existing_builders(root)

    builder = Builder(root, public, libs, reader, wiki if wiki.exists() else None)
    builder.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
