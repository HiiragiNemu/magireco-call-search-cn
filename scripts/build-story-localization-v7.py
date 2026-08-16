#!/usr/bin/env python3
"""Build visitor-facing V7 localization without mutating MagiReader.

Only translations explicitly present in the local catalogue, MagiReader's generated
story index/titles/dictionary, or this audited exact-prefix table are emitted.  An
unmatched Japanese title remains Japanese instead of being guessed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

CATEGORY_ORDER = [
    "メイン【第1部】", "メイン【第2部】", "アナザー【第1部】", "アナザー【第2部】",
    "魔法少女", "衣装", "ミラーズ", "イベント", "バトルミュージアム",
    "ピュエラ・ヒストリア", "scene0", "スペシャル", "第1部EDムービー",
    "第2部EDムービー", "アニメ【1st】", "アニメ【2nd】", "アニメ【Final】",
    "メモリア", "シール図鑑",
]
CATEGORY_LABELS = {
    "メイン【第1部】": "主线【第一部】",
    "メイン【第2部】": "主线【第二部】",
    "アナザー【第1部】": "支线【第一部】",
    "アナザー【第2部】": "支线【第二部】",
    "魔法少女": "魔法少女个人故事",
    "衣装": "服装故事",
    "ミラーズ": "镜层故事",
    "イベント": "活动故事",
    "バトルミュージアム": "战斗博物馆",
    "ピュエラ・ヒストリア": "魔法少女历史篇",
    "scene0": "scene0",
    "スペシャル": "特别故事",
    "第1部EDムービー": "第一部片尾动画",
    "第2部EDムービー": "第二部片尾动画",
    "アニメ【1st】": "动画【第一季】",
    "アニメ【2nd】": "动画【第二季】",
    "アニメ【Final】": "动画【最终季】",
    "メモリア": "记忆结晶资料",
    "シール図鑑": "贴纸图鉴",
}

# Every Chinese value below was verified against a MagiReader event folder.
AUDITED_EVENT_PREFIXES = {
    "アリナのアトリエ～Factor of Despair～ (1回目)": "阿莉娜的工作室～Factor of Despair～（一期）",
    "アリナのアトリエ～Factor of Despair～ (2回目)": "阿莉娜的工作室～Factor of Despair～（二期）",
    "アリナのアトリエ～Factor of Despair～ (3回目)": "阿莉娜的工作室～Factor of Despair～（三期）",
    "神浜スパアドベンチャー ビーチに渦巻く悪魔の怨嗟": "神滨SPA大冒险 席卷沙滩的恶魔怨叹",
    "彼方より、あなたへ〜神浜大東団地の黄昏〜": "从远方，寄给你～神滨大东团地的黄昏～",
    "彼方より、あなたへ～神浜大東団地の黄昏～": "从远方，寄给你～神滨大东团地的黄昏～",
    "明けまして竜突猛進！": "新年龙突猛进！",
    "オモイデ・ドロップス": "Omoide Drops",
    "ハロウィンによみがえる同胞たち": "在万圣夜苏醒的同胞们",
    "Agent Magica～マギアレコード×リコリス・リコイル～": "Agent Magica～魔法纪录×Lycoris Recoil～",
    "「普通」でありたい伊並満": "想「普通」地活着的伊并满",
    "パラダイスシフト～帰還の物語～": "Paradise Shift～归还的物语～",
    "かごめの百怪波瀾～炎夏の宴～": "笼目的百怪波澜～炎夏之宴～",
    "サマーポップフェスティバル！～なぎさのアツい夏休み～": "Summer Pop Festival！～渚的炎炎暑假～",
    "あしたの幸せに花束を": "为明天的幸福献上花束",
    "神浜MVD 環いろはの事件簿": "神滨MVD 环彩羽的事件簿",
    "バレンタインメッセージ～思い出は淡いくろ色～": "情人节祝福～回忆是褪色的黑～",
    "新春☆初夢スクランブル": "新春☆初梦Scramble",
    "Winter Recollection～まだ透明な私たちより～幻の物語": "Winter Recollection～来自仍然透明的我们～梦幻物语",
    "Winter Recollection～まだ透明な私たちより～古の物語": "Winter Recollection～来自仍然透明的我们～旧时物语",
    "ちぐはぐ!?アルちゃん注意報！": "不对劲!小阿鲁警报！",
    "闇色ハロウィンは恋の色!? ～繋げて・恋の東西最前線！～": "暗夜色万圣节染上恋爱的颜色!～连起来呀・东西边的恋爱最前线！～",
    "サヨナラ・ストレージ": "Sayonara Storage",
    "むすんでひらいて座談会 ～第2部をまとめて～": "握成拳头然后张开座谈会～第2部的整理总结～",
    "星屑のミラージュ": "繁星的幻景",
    "七色夏模様 ～ノートに記された日常～": "七彩夏日绘～笔记中记录的日常～",
    "うららとナイショと送別会": "丽与秘密与送别会",
    "恋は△　愛は●": "恋是△ 爱是●",
    "恋は△ 愛は●": "恋是△ 爱是●",
    "My Only Salvation ～魔法少女おりこ☆マギカ～": "My Only Salvation～魔法少女织莉子～",
    "Last Bird's Hope": "Last Bird's Hope",
    "Little Bird's Star": "Little Bird's Star",
    "神浜大運動会": "神滨大运动会",
    "神浜大運動会～激闘！神浜騎馬戦～": "神滨大运动会～激斗！神滨骑马战～",
}

MANUAL_CHARACTER_ALIASES = {
    "いろはちゃん": "小彩羽", "まどか先輩": "小圆前辈", "フェリシアちゃん": "小菲莉希亚",
    "ほむらちゃん": "小焰", "悪魔ほむらちゃん": "恶魔小焰", "やちよ師匠": "八千代师父",
    "小さなキュゥべえ": "小丘比", "小さいキュウベェ": "小丘比", "キュゥべえ": "丘比",
    "ピンクのキュゥべえ": "粉色丘比", "ジュゥべえ": "朱比", "ウワサさん": "谣先生",
    "まばゆの母": "眩的母亲", "鹿目詢子": "鹿目询子", "早乙女先生": "早乙女和子",
    "上条恭介": "上条恭介", "灯花の父": "灯花的父亲", "里見太助": "里见太助",
    "夏希の兄": "夏希的哥哥", "まどか先輩・いろはちゃん": "小圆前辈·小彩羽",
    "まどか先輩＆いろはちゃん": "小圆前辈与小彩羽",
    "いろは・うい(巫女ver)": "环彩羽·环忧（巫女ver.）",
    "いろは・やちよ": "环彩羽·七海八千代", "いろは・やちよ(決戦ver)": "环彩羽·七海八千代（决战ver.）",
    "おネェさま": "姐姐大人", "オネェさま": "姐姐大人",
    "かりん・アリナ(ハロウィンver)": "御园花凛·阿莉娜·格雷（万圣节ver.）", "ちはるの母": "千春的母亲",
    "まさら・こころ(花嫁ver)": "加贺见真良·粟根心（新娘ver.）",
    "ももこ・みたま(人魚ver)": "十咎桃子·八云御魂（人鱼ver.）",
    "やちよ・みふゆ(始まりver)": "七海八千代·梓美冬（初始ver.）",
    "アイ": "爱", "エッべ": "埃贝", "タケさん": "阿武", "トルテ": "托尔特", "ニコラ": "尼古拉",
    "ユリア": "尤莉娅", "ラマ": "拉玛", "レナ・かえで(水着ver)": "水波玲奈·秋野枫（泳装ver.）",
    "伊津見尹縫": "伊津见尹缝", "八九寺真宵": "八九寺真宵", "出涸嵐マナ": "出涸岚玛娜",
    "千石撫子": "千石抚子", "天音姉妹(水着ver)": "天音姐妹（泳装ver.）", "忍野忍": "忍野忍",
    "戦場ヶ原ひたぎ": "战场原黑仪", "未完成いろは": "未完成彩羽",
    "梨花・れん(クリスマスver)": "绫野梨花·五十铃怜（圣诞ver.）", "水名の先輩": "水名前辈",
    "波レナ": "波玲奈", "灯花・ねむ(聖夜ver)": "里见灯花·柊音梦（圣夜ver.）", "神原駿河": "神原骏河",
    "結菜・樹里(ヴァンパイアver)": "红晴结菜·大庭树里（吸血鬼ver.）", "羽川翼": "羽川翼",
    "那由他・みかげ(クリスマスver)": "里见那由他·八云御影（圣诞ver.）", "静香の母": "静香的母亲",
    "鶴乃・フェリシア(宅配ver)": "由比鹤乃·深月菲莉希亚（配送ver.）",
}

MANUAL_CHARACTER_IMAGE_SOURCE = {
    "いろは・うい(巫女ver)": "環いろは", "いろは・やちよ": "環いろは", "いろは・やちよ(決戦ver)": "環いろは",
    "かりん・アリナ(ハロウィンver)": "御園かりん", "ちはるの母": "広江ちはる",
    "まさら・こころ(花嫁ver)": "加賀見まさら", "ももこ・みたま(人魚ver)": "十咎ももこ",
    "やちよ・みふゆ(始まりver)": "七海やちよ", "レナ・かえで(水着ver)": "水波レナ",
    "天音姉妹(水着ver)": "天音月夜", "未完成いろは": "環いろは", "梨花・れん(クリスマスver)": "綾野梨花",
    "波レナ": "水波レナ", "灯花・ねむ(聖夜ver)": "里見灯花", "結菜・樹里(ヴァンパイアver)": "紅晴結菜",
    "那由他・みかげ(クリスマスver)": "里見那由他", "静香の母": "時女静香",
    "鶴乃・フェリシア(宅配ver)": "由比鶴乃",
}

VARIANT_REPLACEMENTS = [
    ("水着", "泳装"), ("眼鏡", "眼镜"), ("晴着", "新年和服"), ("クリスマス", "圣诞"),
    ("ハロウィン", "万圣节"), ("アニメ", "动画"), ("おとぎ話", "童话"),
    ("バレンタイン", "情人节"), ("常闇", "常暗"), ("始まり", "初始"),
    ("新春龍神", "新春龙神"), ("花嫁", "新娘"), ("浴衣", "浴衣"),
]


def norm(value: str) -> str:
    return re.sub(r"[\s　]+", "", unicodedata.normalize("NFKC", str(value or ""))).replace("・", "·")


def has_japanese(value: str) -> bool:
    return bool(re.search(r"[ぁ-んァ-ヶ]", value))


def has_chinese(value: str) -> bool:
    return bool(re.search(r"[一-龠]", value)) and not has_japanese(value)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_character_folders(index: list[dict[str, Any]]) -> dict[str, str]:
    result: dict[str, str] = {}
    pattern = re.compile(r"^\d+\s*-\s*(?P<cn>.+?)（(?P<jp>.+?)）$")
    for item in index:
        if item.get("category") != "character_story":
            continue
        match = pattern.match(str(item.get("folder", "")))
        if not match:
            continue
        cn = match.group("cn").strip()
        jp = re.sub(r"\s+", "", match.group("jp")).strip()
        if jp and cn:
            result.setdefault(jp, cn)
            result.setdefault(norm(jp), cn)
    return result


def parse_dictionary_aliases(source: str) -> dict[str, str]:
    result: dict[str, str] = {}
    pair_re = re.compile(r'"([^"]+)"\s*:\s*"#[0-9A-Fa-f]{6}"')
    for line in source.splitlines():
        values = [match.group(1) for match in pair_re.finditer(line)]
        if len(values) < 2:
            continue
        jp = [value for value in values if has_japanese(value)]
        cn = [value for value in values if has_chinese(value)]
        if not jp or not cn:
            continue
        # The dictionary is written as ordered JP/CN alias pairs.  Pair in order;
        # when counts differ, use the nearest corresponding Chinese alias.
        for index, value in enumerate(jp):
            mapped = cn[min(index, len(cn) - 1)]
            if value and mapped:
                result.setdefault(value, mapped)
                result.setdefault(norm(value), mapped)
    return result


def variant_parts(raw: str) -> tuple[str, str]:
    match = re.match(r"^(.*?)[（(]([^）)]+)[）)]$", raw)
    if not match:
        return raw, ""
    return match.group(1).strip(), match.group(2).strip()


def translate_variant(value: str) -> str:
    result = value
    for source, target in VARIANT_REPLACEMENTS:
        result = result.replace(source, target)
    result = re.sub(r"ver\.?", "ver.", result, flags=re.I)
    return result


def split_bilingual_title(value: str) -> tuple[str, str] | None:
    value = str(value or "").strip()
    if not value:
        return None
    # MagiReader titles conventionally append the original JP title after the CN
    # title.  Locate the first kana run and split immediately before its word.
    match = re.search(r"[ぁ-んァ-ヶ]", value)
    if not match:
        return None
    start = match.start()
    while start > 0 and value[start - 1] not in " \t\n":
        start -= 1
    cn = value[:start].strip()
    jp = value[start:].strip()
    if not cn or not jp or cn == jp:
        return None
    return jp, cn


def title_suffix_translation(suffix: str, character_map: dict[str, dict[str, Any]]) -> str:
    suffix = suffix.strip()
    if not suffix:
        return ""
    replacements = {"エンディング": "结尾", "プロローグ": "序章", "エピローグ": "尾声", "序": "序"}
    if suffix in replacements:
        return replacements[suffix]
    match = re.fullmatch(r"(\d+)話", suffix)
    if match:
        return f"第{match.group(1)}话"
    match = re.fullmatch(r"第?(\d+)", suffix)
    if match:
        return f"第{match.group(1)}话"
    mapped = character_map.get(suffix) or character_map.get(norm(suffix))
    return mapped["zh"] if mapped else suffix


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--story-dir", required=True, type=Path)
    parser.add_argument("--reader-index", required=True, type=Path)
    parser.add_argument("--reader-titles", required=True, type=Path)
    parser.add_argument("--reader-dictionary", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    catalog = load_json(args.catalog)
    reader_index = load_json(args.reader_index)
    reader_titles = load_json(args.reader_titles)
    dictionary_aliases = parse_dictionary_aliases(args.reader_dictionary.read_text(encoding="utf-8"))
    folder_aliases = parse_character_folders(reader_index)

    characters: dict[str, dict[str, Any]] = {}
    normalized: dict[str, dict[str, Any]] = {}

    def register(raw: str, zh: str, image: str = "", source: str = "") -> None:
        raw = str(raw or "").strip()
        zh = str(zh or "").strip()
        if not raw or not zh:
            return
        entry = {"jp": raw, "zh": zh, "image": image, "source": source}
        characters.setdefault(raw, entry)
        normalized.setdefault(norm(raw), entry)

    catalog_by_jp: dict[str, dict[str, Any]] = {}
    for entry in catalog:
        catalog_by_jp[entry["jp"]] = entry
        register(entry["jp"], entry["zh"], entry.get("image", entry["zh"]), "character-catalog")
        for alias in entry.get("aliases", []):
            register(alias, entry["zh"], entry.get("image", entry["zh"]), "character-catalog-alias")

    for raw, zh in folder_aliases.items():
        base = catalog_by_jp.get(raw) or catalog_by_jp.get(re.sub(r"\s+", "", raw))
        register(raw, zh, (base or {}).get("image", zh), "magi-reader-character-folder")
    for raw, zh in dictionary_aliases.items():
        base = characters.get(raw) or normalized.get(norm(raw))
        image = base.get("image", "") if base else ""
        register(raw, zh, image, "magi-reader-dictionary")
    for raw, zh in MANUAL_CHARACTER_ALIASES.items():
        base_raw, _ = variant_parts(raw)
        image_source = MANUAL_CHARACTER_IMAGE_SOURCE.get(raw, base_raw)
        base = characters.get(image_source) or normalized.get(norm(image_source))
        register(raw, zh, base.get("image", "") if base else "", "audited-alias")

    # Gather every cast name before resolving variants so the output is complete.
    cast_names: set[str] = set()
    for category_file in args.story_dir.glob("*.json"):
        if category_file.name in {"manifest.json", "variant-map.json"}:
            continue
        payload = load_json(category_file)
        for row in payload.get("rows", []):
            if len(row) > 1 and isinstance(row[1], list):
                cast_names.update(str(name).strip() for name in row[1] if str(name).strip())

    for raw in sorted(cast_names):
        if raw in characters or norm(raw) in normalized:
            continue
        base_raw, suffix = variant_parts(raw)
        base = characters.get(base_raw) or normalized.get(norm(base_raw))
        if base:
            zh = base["zh"] + (f"（{translate_variant(suffix)}）" if suffix else "")
            register(raw, zh, base.get("image", ""), "base-character-variant")
            continue
        alias_cn = dictionary_aliases.get(raw) or dictionary_aliases.get(norm(raw))
        if alias_cn:
            register(raw, alias_cn, "", "magi-reader-dictionary")

    # Exact bilingual chapter titles from MagiReader.
    title_exact: dict[str, str] = {}
    for value in reader_titles.values():
        split = split_bilingual_title(value)
        if split:
            jp, cn = split
            title_exact.setdefault(jp, cn)

    # Add exact source title matches and verified event prefix replacements.
    title_prefixes = [
        {"jp": jp, "zh": zh, "source": "magi-reader-event-folder"}
        for jp, zh in sorted(AUDITED_EVENT_PREFIXES.items(), key=lambda item: (-len(item[0]), item[0]))
    ]

    # Produce exact translations for rows that consist of a verified prefix plus
    # a safely translatable suffix.  Unmatched text remains absent by design.
    for category_file in args.story_dir.glob("*.json"):
        if category_file.name in {"manifest.json", "variant-map.json"}:
            continue
        payload = load_json(category_file)
        for row in payload.get("rows", []):
            raw_title = str(row[0] if row else "").strip()
            if not raw_title or raw_title in title_exact:
                continue
            for jp_prefix, zh_prefix in sorted(AUDITED_EVENT_PREFIXES.items(), key=lambda item: -len(item[0])):
                if raw_title == jp_prefix:
                    title_exact[raw_title] = zh_prefix
                    break
                if raw_title.startswith(jp_prefix + " "):
                    suffix = raw_title[len(jp_prefix):].strip()
                    translated_suffix = title_suffix_translation(suffix, characters | normalized)
                    title_exact[raw_title] = f"{zh_prefix} {translated_suffix}".strip()
                    break

    unresolved = sorted(raw for raw in cast_names if raw not in characters and norm(raw) not in normalized)
    output = {
        "version": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "categoryOrder": CATEGORY_ORDER,
        "categoryLabels": CATEGORY_LABELS,
        "characters": characters,
        "charactersNormalized": normalized,
        "titleExact": title_exact,
        "titlePrefixes": title_prefixes,
        "audit": {
            "castNames": len(cast_names),
            "mappedCastNames": len(cast_names) - len(unresolved),
            "unresolvedCastNames": unresolved,
            "exactTitles": len(title_exact),
            "auditedPrefixes": len(title_prefixes),
            "sources": ["character-catalog", "magi-reader-story-index", "magi-reader-titles", "magi-reader-dictionary"],
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(output["audit"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
