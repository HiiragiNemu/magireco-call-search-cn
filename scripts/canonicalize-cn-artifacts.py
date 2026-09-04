#!/usr/bin/env python3
"""Normalize existing generated Call title-review artifacts in place."""
from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path
from typing import Any

from cn_terminology import canonicalize_cn_visible


ROOT = Path(__file__).resolve().parents[1]
GROUP_JSONS = (
    ROOT / "public/data/story-title-groups-v1.json",
    ROOT / "public/downloads/story-title-groups.json",
)
GROUP_CSV = ROOT / "public/downloads/story-title-groups.csv"
VISIBLE_KEYS = {
    "category_label",
    "current_translation",
    "approved_translation",
    "current_full_translation",
    "localized_suffix",
}


def normalize_json_value(value: Any, parent_key: str = "") -> Any:
    if isinstance(value, dict):
        return {key: normalize_json_value(item, key) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_json_value(item, parent_key) for item in value]
    if isinstance(value, str) and parent_key in VISIBLE_KEYS:
        return canonicalize_cn_visible(value)
    return value


def normalized_json_bytes(path: Path) -> bytes:
    payload = json.loads(path.read_text(encoding="utf-8"))
    normalized = normalize_json_value(payload)
    return (json.dumps(normalized, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def normalized_csv_bytes(path: Path) -> bytes:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise ValueError(f"CSV has no header: {path}")
        rows = list(reader)

    for row in rows:
        for key in ("分类中文", "网站显示文本"):
            if key in row and row[key] is not None:
                row[key] = canonicalize_cn_visible(row[key])

    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8-sig")


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    outputs = [(path, normalized_json_bytes(path)) for path in GROUP_JSONS]
    outputs.append((GROUP_CSV, normalized_csv_bytes(GROUP_CSV)))
    stale = [str(path.relative_to(ROOT)) for path, data in outputs if path.read_bytes() != data]
    if args.check:
        if stale:
            raise SystemExit("out of date: " + ", ".join(stale))
    else:
        for path, data in outputs:
            path.write_bytes(data)
    print(json.dumps({"checked": len(outputs), "changed": stale}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
