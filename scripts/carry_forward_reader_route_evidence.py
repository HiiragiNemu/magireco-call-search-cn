#!/usr/bin/env python3
"""Carry reviewed exact Call routes across a Reader index regeneration.

The only accepted identity migration is an exact Reader ``raw_id`` match.  If
the former public id became a composite id because duplicate aggregate TXT
files exist, the paired CN+JP aggregate containing the exact requested section
is selected.  Ambiguous or absent targets fail closed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def route_key(route: dict[str, Any]) -> tuple[str, str]:
    return str(route["slug"]), str(route["sourceTitle"])


def resolve_target(
    reader_id: str,
    section: str | None,
    by_id: dict[str, dict[str, Any]],
    by_raw_id: dict[str, list[dict[str, Any]]],
) -> tuple[str, dict[str, Any] | None]:
    existing = by_id.get(reader_id)
    if existing is not None:
        if section is None or section in (existing.get("sections") or []):
            return reader_id, None
        raise ValueError(f"section missing from current Reader target: {reader_id} {section}")

    candidates = []
    for entry in by_raw_id.get(reader_id, []):
        if section is not None and section not in (entry.get("sections") or []):
            continue
        score = (
            4 * bool(entry.get("has_cn") and entry.get("has_jp"))
            + 2 * bool(entry.get("has_cn"))
            + bool(entry.get("has_jp"))
        )
        candidates.append((score, str(entry["id"]), entry))
    if not candidates:
        raise ValueError(f"exact raw_id target absent from current Reader: {reader_id} {section or ''}")
    best_score = max(item[0] for item in candidates)
    best = [item for item in candidates if item[0] == best_score]
    if len(best) != 1:
        # The Reader generator can expose two names for the same one-section
        # aggregate (for example ``_005`` and redundant ``_005-005``).  This
        # is not a route ambiguity when both entries point at the exact same
        # JSON sources and section set; keep the shortest canonical stem.
        identities = {
            (
                item[2].get("category"),
                item[2].get("folder"),
                tuple(item[2].get("sections") or []),
                tuple(item[2].get("json_sources_jp") or []),
                tuple(item[2].get("json_sources_cn") or []),
            )
            for item in best
        }
        if len(identities) == 1:
            best = [min(best, key=lambda item: (len(str(item[2].get("file_stem") or "")), item[1]))]
        else:
            ids = ",".join(sorted(item[1] for item in best))
            raise ValueError(f"ambiguous exact raw_id target: {reader_id} -> {ids}")
    _, replacement, entry = best[0]
    return replacement, {
        "oldReaderId": reader_id,
        "newReaderId": replacement,
        "rawId": str(entry.get("raw_id") or ""),
        "section": section,
        "hasCn": bool(entry.get("has_cn")),
        "hasJp": bool(entry.get("has_jp")),
        "sourceIdentity": entry.get("source_identity"),
    }


def migrate_route(
    route: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
    by_raw_id: dict[str, list[dict[str, Any]]],
    migrations: list[dict[str, Any]],
) -> dict[str, Any]:
    migrated = dict(route)
    targets: list[tuple[str, dict[str, Any]]] = [("primary", migrated)]
    if route.get("variants") is not None:
        migrated["variants"] = [dict(value) for value in route["variants"]]
        targets.extend(
            (f"variant:{index}", value)
            for index, value in enumerate(migrated["variants"])
        )
    for target_kind, target in targets:
        reader_id = str(target["readerId"])
        replacement, migration = resolve_target(
            reader_id,
            target.get("section"),
            by_id,
            by_raw_id,
        )
        target["readerId"] = replacement
        if migration is not None:
            migrations.append(
                {
                    "route": {"slug": route["slug"], "sourceTitle": route["sourceTitle"]},
                    "targetKind": target_kind,
                    **migration,
                }
            )
    return migrated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--regenerated", required=True, type=Path)
    parser.add_argument("--reader-index", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--verification", required=True, type=Path)
    args = parser.parse_args()

    baseline = read_json(args.baseline)
    regenerated = read_json(args.regenerated)
    reader_index = read_json(args.reader_index)
    if not isinstance(reader_index, list):
        raise ValueError("Reader index must be a list")
    by_id = {str(entry["id"]): entry for entry in reader_index}
    by_raw_id: dict[str, list[dict[str, Any]]] = {}
    for entry in reader_index:
        by_raw_id.setdefault(str(entry.get("raw_id") or entry["id"]), []).append(entry)

    baseline_routes = {route_key(route): route for route in baseline["routes"]}
    regenerated_routes = {route_key(route): route for route in regenerated["routes"]}
    migrations: list[dict[str, Any]] = []
    merged = []
    for key in sorted(baseline_routes.keys() | regenerated_routes.keys()):
        source = regenerated_routes.get(key, baseline_routes[key])
        merged.append(migrate_route(source, by_id, by_raw_id, migrations))

    output = dict(baseline)
    output["reader"] = dict(regenerated["reader"])
    output["officialCn"] = dict(regenerated["officialCn"])
    output["summary"] = dict(baseline["summary"])
    output["summary"]["exactEvidenceRoutes"] = len(merged)
    output["routes"] = merged
    verification = {
        "status": "PASS",
        "policy": "exact source key plus exact Reader raw_id; explicit section must exist; paired CN+JP aggregate wins only when unique",
        "readerRevision": regenerated["reader"]["revision"],
        "readerIndexEntries": len(reader_index),
        "baselineRoutes": len(baseline_routes),
        "regeneratedRoutes": len(regenerated_routes),
        "commonRoutes": len(baseline_routes.keys() & regenerated_routes.keys()),
        "carriedForwardRoutes": len(baseline_routes.keys() - regenerated_routes.keys()),
        "newRoutes": len(regenerated_routes.keys() - baseline_routes.keys()),
        "mergedRoutes": len(merged),
        "identityMigrations": len(migrations),
        "migrations": migrations,
    }
    write_json(args.output, output)
    write_json(args.verification, verification)
    print(json.dumps({key: value for key, value in verification.items() if key != "migrations"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
