#!/usr/bin/env python3
"""Build the local story-search snapshot from the original complete JSON export.

This script is intentionally manual/static. It never mutates magi-reader and it
keeps the browser-side tool independent from Google Apps Script/CORS availability.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any

CATEGORY_META: dict[str, tuple[str, str]] = {
    "メイン【第1部】": ("main-1", "主线【第一部】"),
    "メイン【第2部】": ("main-2", "主线【第二部】"),
    "アナザー【第1部】": ("another-1", "支线【第一部】"),
    "アナザー【第2部】": ("another-2", "支线【第二部】"),
    "魔法少女": ("character", "魔法少女个人故事"),
    "衣装": ("costume", "服装故事"),
    "ミラーズ": ("mirrors", "镜层故事"),
    "イベント": ("event", "活动故事"),
    "ピュエラ・ヒストリア": ("puella-historia", "普埃拉历史篇"),
    "バトルミュージアム": ("battle-museum", "战斗博物馆"),
    "scene0": ("scene0", "scene0"),
    "スペシャル": ("special", "特别故事"),
    "第1部EDムービー": ("ed-1", "第一部片尾动画"),
    "第2部EDムービー": ("ed-2", "第二部片尾动画"),
    "アニメ【1st】": ("anime-1", "动画【第一季】"),
    "アニメ【2nd】": ("anime-2", "动画【第二季】"),
    "アニメ【Final】": ("anime-final", "动画【最终季】"),
    "メモリア": ("memoria", "记忆结晶资料"),
    "シール図鑑": ("sticker", "贴纸图鉴"),
}

SOURCE_URL = (
    "https://drive.google.com/uc?export=download&"
    "id=1kFoEYZ6nJrYQAxGQVwN-SyLg-aPKkH6q"
)


def compact_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def normalize_row(category: str, index: int, value: Any) -> list[Any]:
    if not isinstance(value, list) or len(value) < 2:
        raise ValueError(f"{category}[{index}] is not a story row")
    raw_title = value[0]
    cast = value[1]
    raw_summary = value[2] if len(value) > 2 else ""
    raw_link = value[3] if len(value) > 3 else ""

    # The public export contains a small number of deliberately blank title cells.
    # Dropping them would make the local snapshot incomplete, so preserve the row
    # with a deterministic Chinese placeholder rather than rejecting it.
    title = "" if raw_title is None else str(raw_title).strip()
    if not title:
        title = f"未命名记录 {index + 1}"

    if not isinstance(cast, list) or any(not isinstance(item, str) for item in cast):
        raise ValueError(f"{category}[{index}] has an invalid cast")
    summary = "" if raw_summary is None else str(raw_summary)
    link = "" if raw_link is None else str(raw_link)
    return [title, [item.strip() for item in cast if item.strip()], summary, link]


def extract_variant_map(page_html: str) -> dict[str, list[str]]:
    # Current upstream expands base characters with blocks of this form:
    # if (magicalGirlChoice.indexOf("BASE") != -1) {
    #   magicalGirlChoice.push("VARIANT");
    # }
    pattern = re.compile(
        r"magicalGirlChoice\.indexOf\(\s*([\"'])(?P<base>.+?)\1\s*\)\s*!=\s*-1\s*\)\s*\{"
        r"(?P<body>[\s\S]*?)\n\s*\}",
        re.MULTILINE,
    )
    push_pattern = re.compile(
        r"magicalGirlChoice\.push\(\s*([\"'])(?P<variant>.+?)\1\s*\)"
    )
    result: dict[str, list[str]] = {}
    for match in pattern.finditer(page_html):
        base = match.group("base").strip()
        variants = [item.group("variant").strip() for item in push_pattern.finditer(match.group("body"))]
        if not base or not variants:
            continue
        bucket = result.setdefault(base, [])
        for variant in variants:
            if variant and variant not in bucket:
                bucket.append(variant)
    return dict(sorted(result.items()))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--page-html", type=Path)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    raw_bytes = args.input.read_bytes()
    source_sha = hashlib.sha256(raw_bytes).hexdigest()
    data = json.loads(raw_bytes.decode("utf-8"))
    if not isinstance(data, dict) or len(data) < 10:
        raise SystemExit("Complete story JSON is not a sufficiently large object.")

    unknown = sorted(set(data) - set(CATEGORY_META))
    missing = sorted(set(CATEGORY_META) - set(data))
    if unknown:
        raise SystemExit(f"Unknown story categories: {unknown}")
    if missing:
        raise SystemExit(f"Missing story categories: {missing}")

    output = args.output
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    generated_at = args.generated_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest_categories: list[dict[str, Any]] = []
    total_rows = 0
    cast_names: set[str] = set()

    for category, rows in data.items():
        if not isinstance(rows, list):
            raise SystemExit(f"Category {category} is not a list.")
        slug, label = CATEGORY_META[category]
        normalized = [normalize_row(category, index, row) for index, row in enumerate(rows)]
        for row in normalized:
            cast_names.update(row[1])
        total_rows += len(normalized)
        filename = f"{slug}.json"
        compact_json(
            output / filename,
            {"version": 1, "key": category, "label": label, "rows": normalized},
        )
        manifest_categories.append(
            {
                "key": category,
                "label": label,
                "slug": slug,
                "file": filename,
                "count": len(normalized),
            }
        )

    if total_rows < 10_000:
        raise SystemExit(f"Story snapshot unexpectedly small: {total_rows} rows")

    variant_map: dict[str, list[str]] = {}
    if args.page_html and args.page_html.exists():
        variant_map = extract_variant_map(args.page_html.read_text(encoding="utf-8"))
    compact_json(output / "variant-map.json", {"version": 1, "families": variant_map})

    manifest = {
        "version": 1,
        "generatedAt": generated_at,
        "source": {
            "name": "原角色故事搜索公开完整 JSON",
            "url": SOURCE_URL,
            "sha256": source_sha,
            "mode": "manual-static-snapshot",
        },
        "totalRows": total_rows,
        "castNames": len(cast_names),
        "variantFamilies": len(variant_map),
        "categories": manifest_categories,
    }
    compact_json(output / "manifest.json", manifest)
    print(
        json.dumps(
            {
                "totalRows": total_rows,
                "categories": len(manifest_categories),
                "castNames": len(cast_names),
                "variantFamilies": len(variant_map),
                "sourceSha256": source_sha,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
