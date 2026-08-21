#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
KANA = re.compile(r"[\u3040-\u30ff\u31f0-\u31ffー]")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> dict[str, Any]:
    authority = read_json(ROOT / "data/titles/authority.json")
    groups_data = read_json(ROOT / "public/data/story-title-groups-v1.json")
    groups = groups_data.get("groups")
    if not isinstance(groups, list):
        raise RuntimeError("story-title-groups-v1.json has no groups array")

    release = str(authority["release"])
    generated_at = str(authority["generatedAt"])
    parents = authority.get("parents") or {}
    suffixes = authority.get("suffixes") or {}
    exact = authority.get("exactTitles") or {}
    title_by_category: dict[str, dict[str, str]] = {}
    provenance_records: list[dict[str, Any]] = []
    child_count = 0

    for group in groups:
        category = str(group.get("category") or "")
        source_base = str(group.get("source_base") or "")
        parent = str(
            (parents.get(category) or {}).get(source_base)
            or group.get("approved_translation")
            or group.get("current_translation")
            or source_base
        ).strip()
        if not category or not source_base or not parent or KANA.search(parent):
            raise RuntimeError(f"invalid parent: {category} / {source_base} => {parent}")

        for child in group.get("children") or []:
            child_count += 1
            source_title = str(child.get("source_title") or "").strip()
            source_suffix = str(child.get("source_suffix") or "").strip()
            suffix = str(
                suffixes[source_suffix]
                if source_suffix in suffixes
                else child.get("localized_suffix") or source_suffix
            ).strip()
            target = str(
                (exact.get(category) or {}).get(source_title)
                or f"{parent}{' ' + suffix if suffix else ''}"
            ).strip()
            if not source_title or not target or KANA.search(target):
                raise RuntimeError(f"invalid title: {category} / {source_title} => {target}")
            bucket = title_by_category.setdefault(category, {})
            previous = bucket.get(source_title)
            if previous is not None and previous != target:
                raise RuntimeError(f"conflicting title: {category} / {source_title}")
            bucket[source_title] = target
            provenance_records.append({
                "category": category,
                "groupId": group.get("group_id"),
                "sourceBase": source_base,
                "displayParent": parent,
                "sourceTitle": source_title,
                "displayTitle": target,
                "sourceSuffix": source_suffix,
                "displaySuffix": suffix,
                "sourceSha256": group.get("source_sha256"),
            })

    group_count = sum(len(value) for value in parents.values())
    mapped_count = sum(len(value) for value in title_by_category.values())
    if (group_count, child_count, mapped_count) != (2166, 5826, 5826):
        raise RuntimeError(
            f"unexpected title counts: groups={group_count}, children={child_count}, mapped={mapped_count}"
        )

    output_dir = ROOT / "public/data/titles"
    payloads = {
        "parents": {
            "schemaVersion": 1,
            "release": release,
            "generatedAt": generated_at,
            "summary": {"count": group_count},
            "parentByCategory": parents,
        },
        "suffixes": {
            "schemaVersion": 1,
            "release": release,
            "generatedAt": generated_at,
            "summary": {"count": len(suffixes)},
            "suffixBySource": suffixes,
        },
        "titles": {
            "schemaVersion": 1,
            "release": release,
            "generatedAt": generated_at,
            "summary": {"count": mapped_count},
            "titleByCategory": title_by_category,
        },
        "provenance": {
            "schemaVersion": 1,
            "release": release,
            "sourceRelease": authority.get("sourceRelease"),
            "generatedAt": generated_at,
            "sourcePriority": authority.get("sourcePriority") or [],
            "summary": {
                "groupCount": group_count,
                "childTitleCount": child_count,
                "mappedTitleCount": mapped_count,
                "kanaInChineseDisplayFields": 0,
            },
            "records": provenance_records,
        },
    }
    for name, payload in payloads.items():
        write_json(output_dir / f"{name}.json", payload)

    files = {}
    for name in payloads:
        path = output_dir / f"{name}.json"
        files[name] = {
            "path": f"./{path.name}",
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
    manifest = {
        "schemaVersion": 1,
        "release": release,
        "sourceRelease": authority.get("sourceRelease"),
        "generatedAt": generated_at,
        "summary": {
            "groupCount": group_count,
            "childTitleCount": child_count,
            "mappedTitleCount": mapped_count,
            "kanaInChineseDisplayFields": 0,
        },
        "files": files,
    }
    write_json(output_dir / "manifest.json", manifest)
    write_json(ROOT / "public/data/story-title-map.generated.json", {
        "version": 26,
        "release": release,
        "generatedAt": generated_at,
        "summary": manifest["summary"],
        "titleByCategory": title_by_category,
    })
    write_json(ROOT / "public/v26-build-marker.json", {
        "release": release,
        "generatedAt": generated_at,
        **manifest["summary"],
        "runtime": "story-title-runtime-v26-20260821",
        "status": "deployed-to-main",
    })
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    tracked = [
        ROOT / "public/data/titles/manifest.json",
        ROOT / "public/data/titles/parents.json",
        ROOT / "public/data/titles/suffixes.json",
        ROOT / "public/data/titles/titles.json",
        ROOT / "public/data/titles/provenance.json",
        ROOT / "public/data/story-title-map.generated.json",
        ROOT / "public/v26-build-marker.json",
    ]
    before = {path: path.read_bytes() for path in tracked} if args.check else {}
    build()
    if args.check:
        changed = [str(path.relative_to(ROOT)) for path, data in before.items() if path.read_bytes() != data]
        if changed:
            raise SystemExit(f"generated title data is stale: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
