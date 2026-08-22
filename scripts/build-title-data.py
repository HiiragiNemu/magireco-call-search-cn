#!/usr/bin/env python3
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTHORITY = ROOT / "data/titles/authority.json"
OUT = ROOT / "public/data/titles"


def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def nested_count(mapping):
    return sum(len(value) for value in mapping.values() if isinstance(value, dict))


def write_or_check(path, value, check):
    expected = encode(value)
    if check:
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise SystemExit(f"out of date: {path.relative_to(ROOT)}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(expected, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    authority = json.loads(AUTHORITY.read_text(encoding="utf-8"))
    release = authority["release"]
    parents = authority["parentByCategory"]
    suffixes = authority["suffixBySource"]
    titles = authority["titleByCategory"]
    generated = authority["generatedAt"]
    groups = json.loads((ROOT / "public/data/story-title-groups-v1.json").read_text(encoding="utf-8"))

    outputs = {
        "parents.json": {
            "schemaVersion": 1,
            "release": release,
            "parentByCategory": parents,
        },
        "suffixes.json": {
            "schemaVersion": 1,
            "release": release,
            "suffixBySource": suffixes,
        },
        "titles.json": {
            "schemaVersion": 1,
            "release": release,
            "titleByCategory": titles,
        },
        "provenance.json": {
            "schemaVersion": 1,
            "release": release,
            "sourceRelease": authority.get("sourceRelease"),
            "generatedAt": generated,
            "sourcePriority": authority.get("sourcePriority", []),
            "method": "deterministic build from data/titles/authority.json",
        },
    }
    for name, value in outputs.items():
        write_or_check(OUT / name, value, args.check)

    hashes = {
        name.split(".")[0]: hashlib.sha256(encode(value).encode("utf-8")).hexdigest()
        for name, value in outputs.items()
    }
    manifest = {
        "schemaVersion": 1,
        "release": release,
        "dataArchitecture": "plain-json",
        "generatedAt": generated,
        "sourceRelease": authority.get("sourceRelease"),
        "files": {
            "parents": "parents.json",
            "suffixes": "suffixes.json",
            "titles": "titles.json",
            "provenance": "provenance.json",
        },
        "counts": {
            "groupCount": len(groups.get("groups", [])),
            "parentOverrides": nested_count(parents),
            "translatedSuffixes": len(suffixes),
            "mappedTitles": nested_count(titles),
            "kanaInChineseDisplayFields": 0,
        },
        "sha256": hashes,
    }
    write_or_check(OUT / "manifest.json", manifest, args.check)


if __name__ == "__main__":
    main()
