#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    path = Path("scripts/build-story-titles-v10.py")
    text = path.read_text(encoding="utf-8")

    old_rows = '''    for row in rows:
        cleaned = [normalize(cell) for cell in row if normalize(cell)]
        # Lines in one cell, as used by the event list.
        for cell in cleaned:
            lines = [normalize(line) for line in re.split(r"[\\n\\r]+", cell) if normalize(line)]'''
    new_rows = '''    for row in rows:
        raw_cells = [cell for cell in row if normalize(cell)]
        cleaned = [normalize(cell) for cell in raw_cells]
        # Preserve the explicit line break between Japanese and Chinese names in
        # the Wiki event/memoria tables. Normalizing the whole cell first would
        # collapse that authoritative bilingual pair into one unparseable line.
        for cell in raw_cells:
            lines = [normalize(line) for line in re.split(r"[\\n\\r]+", cell) if normalize(line)]'''
    if old_rows in text:
        text = replace_once(text, old_rows, new_rows, "Wiki bilingual line preservation")

    old_prefix = '''def longest_source_prefix(title: str, mapping: dict[str, str]) -> tuple[str, str] | None:
    normalized_title = key_normalize(title)
    candidates: list[tuple[int, str, str]] = []
    for japanese, chinese in mapping.items():
        if japanese != normalize(japanese):
            continue
        key = key_normalize(japanese)
        if normalized_title.startswith(key):
            candidates.append((len(key), japanese, chinese))
    if not candidates:
        return None
    _, japanese, chinese = max(candidates)
    return japanese, chinese
'''
    new_prefix = '''def longest_source_prefix(title: str, mapping: dict[str, str]) -> tuple[str, str] | None:
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
'''
    if old_prefix in text:
        text = replace_once(text, old_prefix, new_prefix, "normalized authoritative prefix matcher")

    old_suffix = '''        # Slice approximately from original title using normalized punctuation.
        suffix = title[len(japanese):].strip(" 　-—～~") if title.startswith(japanese) else ""
        translated_suffix = translate_common(suffix, character_exact, character_normalized)'''
    new_suffix = '''        suffix = suffix_after_normalized_prefix(title, japanese)
        translated_suffix = translate_common(suffix, character_exact, character_normalized)'''
    if old_suffix in text:
        text = replace_once(text, old_suffix, new_suffix, "normalized authoritative suffix extraction")

    path.write_text(text, encoding="utf-8")
    print("improved-title-sources-v10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
