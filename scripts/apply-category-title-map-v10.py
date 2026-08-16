#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_builder() -> None:
    path = Path("scripts/build-story-titles-v10.py")
    text = path.read_text(encoding="utf-8")
    if 'localization["titleByCategoryV10"]' in text:
        return

    text = replace_once(
        text,
        '''    final_exact = dict(localization.get("titleExact", {}))
    source_by_title: dict[str, dict[str, str]] = {}
    self_translated: list[dict[str, str]] = []''',
        '''    final_exact = dict(localization.get("titleExact", {}))
    title_by_category: dict[str, dict[str, str]] = collections.defaultdict(dict)
    source_by_title: dict[str, dict[str, str]] = {}
    sources_by_category: dict[str, dict[str, str]] = collections.defaultdict(dict)
    self_translated: list[dict[str, str]] = []''',
        "builder title-map declarations",
    )
    text = replace_once(
        text,
        '''            final_exact[raw] = chinese
            source_by_title[raw] = {"source": source, "category": category}
            counts[source] += 1''',
        '''            # The same compact source label (for example `1章1話`) appears
            # in several categories.  Keep an explicit category-aware map so the
            # main, another and anime stories never overwrite each other.
            title_by_category[category][raw] = chinese
            sources_by_category[category][raw] = source
            final_exact.setdefault(raw, chinese)
            source_by_title.setdefault(raw, {"source": source, "category": category})
            counts[source] += 1''',
        "builder per-title registration",
    )
    text = replace_once(
        text,
        '''    localization["titleExact"] = final_exact
    localization["titleSourcesV10"] = source_by_title
    localization["titleAuditV10"] = {''',
        '''    localization["titleExact"] = final_exact
    localization["titleByCategoryV10"] = {
        category: dict(sorted(mapping.items()))
        for category, mapping in sorted(title_by_category.items())
    }
    localization["titleSourcesV10"] = source_by_title
    localization["titleSourcesByCategoryV10"] = {
        category: dict(sorted(mapping.items()))
        for category, mapping in sorted(sources_by_category.items())
    }
    localization["titleAuditV10"] = {''',
        "builder localization output",
    )
    text = replace_once(
        text,
        '''        "localizedSourceTitles": len(all_unique),
        "authoritativeEventPairs":''',
        '''        "localizedSourceTitles": len(all_unique),
        "categoryTitlePairs": sum(len(values) for values in titles_by_category.values()),
        "authoritativeEventPairs":''',
        "builder category-pair audit",
    )
    path.write_text(text, encoding="utf-8")


def patch_story_app() -> None:
    path = Path("public/myfile/story-app-v7.js")
    text = path.read_text(encoding="utf-8")
    if "titleByCategoryV10" not in text:
        text = replace_once(
            text,
            '''  function localizeTitle(raw) {
    const title = textFromMarkup(raw);
    const exact = localization.titleExact?.[title];''',
            '''  function localizeTitle(storyType, raw) {
    const title = textFromMarkup(raw);
    const exact = localization.titleByCategoryV10?.[storyType]?.[title]
      || localization.titleExact?.[title];''',
            "story category-aware localizer",
        )
        text = replace_once(
            text,
            "        const titleInfo = localizeTitle(row?.[0]);",
            "        const titleInfo = localizeTitle(storyType, row?.[0]);",
            "story localizer call",
        )
    path.write_text(text, encoding="utf-8")


def main() -> int:
    patch_builder()
    patch_story_app()
    print("category-aware-title-map-v10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
