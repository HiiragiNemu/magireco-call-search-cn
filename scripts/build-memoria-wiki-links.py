#!/usr/bin/env python3
"""Build Call's canonical Memoria links from the local magireco wiki data."""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

# The first two legacy catalogue rows identify a familiar by an English subtype.
# The authoritative wiki snapshot indexes the corresponding numbered Memoria pages.
PAGE_OVERRIDES = {
    "No.1 薔薇園の魔女の手下 (Anthony)": "记忆结晶/薔薇園の魔女の手下 (1)",
    "No.2 薔薇園の魔女の手下 (Adelbert)": "记忆结晶/薔薇園の魔女の手下 (2)",
}


def normalized(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    # Old list rows sometimes insert a space before an edition marker.
    return re.sub(r"\s+([()])", r"\1", text)


def title_variants(title: str) -> list[str]:
    title = normalized(title)
    variants = [title]
    # NFKC represents an ellipsis as three dots. The historical public catalogue
    # sometimes omits that trailing punctuation entirely.
    if title.endswith("..."):
        variants.append(title[:-3])
    else:
        variants.append(title + "...")
    return list(dict.fromkeys(variants))


def wiki_url(article_page: str) -> str:
    return "https://magireco.moe/wiki/" + quote(article_page, safe="/")


def build(call_memoria: Path, wiki_memoria: Path, wiki_pages_index: Path) -> dict:
    call_rows = json.loads(call_memoria.read_text(encoding="utf-8"))["rows"]
    wiki_records = json.loads(wiki_memoria.read_text(encoding="utf-8"))
    pages = json.loads(wiki_pages_index.read_text(encoding="utf-8"))

    by_title: dict[str, list[dict]] = {}
    for record in wiki_records.values():
        name = record.get("name_ja")
        article_page = record.get("_article_page")
        if not name or not article_page:
            continue
        for key in title_variants(str(name)):
            by_title.setdefault(key, []).append(record)

    page_titles = {str(page.get("title")) for page in pages if isinstance(page, dict)}
    links: dict[str, dict] = {}
    unmatched: list[tuple[int, str]] = []
    ambiguous: list[tuple[int, str, list[str]]] = []

    for row_index, row in enumerate(call_rows):
        displayed = str(row[0]).strip()
        article_page = PAGE_OVERRIDES.get(displayed)
        match_kind = "page-index-alias" if article_page else "name_ja"
        if article_page:
            if article_page not in page_titles:
                raise RuntimeError(f"Override page is absent from Wiki index: {article_page}")
        else:
            raw_title = re.sub(r"^No\.\d+\s*", "", displayed).strip()
            candidates: list[dict] = []
            for candidate in title_variants(raw_title):
                candidates.extend(by_title.get(candidate, []))
            unique = {str(record.get("_article_page")): record for record in candidates}
            if len(unique) == 1:
                article_page = next(iter(unique))
            elif len(unique) > 1:
                ambiguous.append((row_index, displayed, sorted(unique)))
                continue
            else:
                unmatched.append((row_index, displayed))
                continue

        links[str(row_index)] = {
            "articlePage": article_page,
            "url": wiki_url(article_page),
            "match": match_kind,
        }

    if unmatched or ambiguous or len(links) != len(call_rows):
        raise RuntimeError(
            "Memoria link mapping is incomplete: "
            f"mapped={len(links)} total={len(call_rows)} "
            f"unmatched={unmatched[:10]} ambiguous={ambiguous[:10]}"
        )

    return {
        "version": 1,
        "authority": "https://magireco.moe/wiki/",
        "source": {
            "memoria": "magireco-wiki-data/data/memoria.json",
            "pagesIndex": "magireco-wiki-data/data/pages_index.json",
        },
        "count": len(call_rows),
        "links": links,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wiki-data", type=Path, required=True)
    parser.add_argument("--call-memoria", type=Path, default=Path("public/data/story-v6/memoria.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/story-v6/memoria-wiki-links-v1.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    payload = build(
        args.call_memoria,
        args.wiki_data / "data" / "memoria.json",
        args.wiki_data / "data" / "pages_index.json",
    )
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            raise SystemExit("Generated Memoria link file is missing or stale.")
        print(f"MEMORIA_WIKI_LINKS=PASS count={payload['count']}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"MEMORIA_WIKI_LINKS=WRITTEN count={payload['count']} output={args.output}")


if __name__ == "__main__":
    main()
