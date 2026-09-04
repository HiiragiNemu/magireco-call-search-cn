#!/usr/bin/env python3
"""Canonical visible Simplified-Chinese terminology shared by Call generators.

This module is deliberately limited to user-facing Chinese strings.  It must
not be applied to source identities, filesystem paths, Japanese fields, or
technical protocol keys such as ``kimochi``.
"""
from __future__ import annotations

import re


# Longest and most specific spellings first.  These are user-approved Reader
# authority decisions and therefore also govern Call/AIO visible labels.
EXACT_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("小圆前辈·小伊吕波", "小圆前辈·小彩羽"),
    ("无限大小伊吕波", "无限大小彩羽"),
    ("伊吕波·黑江", "彩羽·黑江"),
    ("圆·伊吕波", "圆·彩羽"),
    ("∞伊吕波", "∞彩羽"),
    ("万年樱之谣", "万年樱的传闻"),
    ("午夜0时的民间传说", "午前0时的民间传说"),
    ("午前0点的民间传说", "午前0时的民间传说"),
    ("午前0时Forklore", "午前0时的民间传说"),
    ("始于反复的梦", "始于重叠的梦想"),
    ("濑奈御琴", "濑奈命"),
    ("心魔之石", "心魔石"),
    ("志切思惟", "思惟"),
    ("新玛吉斯", "Neo-Magius"),
    ("ネオマギウス", "Neo-Magius"),
    ("ネオマギ", "新玛"),
    ("日之本", "日出之国"),
    ("常盘七夏", "常盘七香"),
    ("毬子彩花", "毬子亚弥华"),
    ("八云美玉", "八云御魂"),
    ("小伊吕波", "小彩羽"),
    ("环伊吕波", "环彩羽"),
    ("环羽衣", "环忧"),
    ("伊萨博", "伊莎贝拉"),
    ("美由里", "美由利"),
    ("小阿尔", "小阿鲁"),
    ("谣莎奈", "传闻莎奈"),
    ("谣鹤乃", "传闻鹤乃"),
    ("血盟", "PROMISED BLOOD"),
)

FORBIDDEN_VISIBLE_TERMS: tuple[str, ...] = tuple(old for old, _ in EXACT_REPLACEMENTS) + (
    "kimochi",
    "キモチ",
    "心魔石ver",
)


def canonicalize_cn_visible(value: str) -> str:
    """Return the canonical Reader-authority spelling for visible CN text."""

    result = str(value or "")
    for old, new in EXACT_REPLACEMENTS:
        result = result.replace(old, new)
    # A Kimochi is the entity ``心魔``.  Only its stone is ``心魔石``.  Match the
    # longer stone expression first so a general entity replacement cannot
    # manufacture the old, semantically wrong ``心魔石ver.`` character label.
    result = re.sub(
        r"kimochi\s*(?:の|之|的)?\s*石",
        "心魔石",
        result,
        flags=re.IGNORECASE,
    )
    result = re.sub(r"キモチ\s*(?:の|之|的)?\s*石", "心魔石", result)
    result = re.sub(r"kimochi", "心魔", result, flags=re.IGNORECASE)
    result = result.replace("キモチ", "心魔")
    result = re.sub(r"心魔石\s*ver\.?", "心魔ver.", result, flags=re.IGNORECASE)
    result = re.sub(r"心魔\s+ver\.?", "心魔ver.", result, flags=re.IGNORECASE)
    # The abbreviation is 新玛; the complete organization name remains
    # Neo-Magius.  The negative look-ahead prevents corrupting the full name.
    result = re.sub(r"Neo[- ]?Magi(?!us)", "新玛", result, flags=re.IGNORECASE)
    return result


def canonicalize_character_cn(raw: str, value: str) -> str:
    """Canonicalize one visible character label with source-name context.

    ``シィ`` is the short name and therefore displays as ``思``.  The longest
    name actually used by the game is ``思惟``; no synthetic surname is added.
    """

    result = canonicalize_cn_visible(value)
    if str(raw or "").strip() == "シィ" and result.strip() in {"椎", "思", "思惟"}:
        return "思"
    return result


def find_forbidden_visible_terms(value: str) -> list[str]:
    result: list[str] = []
    for term in FORBIDDEN_VISIBLE_TERMS:
        if term.lower() in str(value or "").lower():
            result.append(term)
    return result


def _self_test() -> None:
    cases = {
        "美由里与小阿尔": "美由利与小阿鲁",
        "濑奈御琴的KIMOCHI": "濑奈命的心魔",
        "Kimochi攻防": "心魔攻防",
        "Kimochi之石": "心魔石",
        "冰室拉比（Kimochi ver.）": "冰室拉比（心魔ver.）",
        "冰室拉比（心魔石ver.）": "冰室拉比（心魔ver.）",
        "心魔之石": "心魔石",
        "午夜0时的民间传说": "午前0时的民间传说",
        "午前0时Forklore": "午前0时的民间传说",
        "血盟与始于反复的梦": "PROMISED BLOOD与始于重叠的梦想",
        "新玛吉斯与Neo-Magi": "Neo-Magius与新玛",
        "日之本": "日出之国",
        "志切思惟": "思惟",
        "小圆前辈·小伊吕波与谣莎奈": "小圆前辈·小彩羽与传闻莎奈",
    }
    for source, expected in cases.items():
        actual = canonicalize_cn_visible(source)
        assert actual == expected, (source, expected, actual)
        assert not find_forbidden_visible_terms(actual), actual
    assert canonicalize_character_cn("シィ", "椎") == "思"
    assert canonicalize_character_cn("思惟", "思惟") == "思惟"
    print(f"CN terminology self-test passed ({len(cases)} cases).")


if __name__ == "__main__":
    _self_test()
