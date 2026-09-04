#!/usr/bin/env python3
"""Materialize the checked-in AIO route manifest for the edge function."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "aio" / "story-routes.json"
OUTPUT = (
    ROOT
    / "public"
    / "edge-functions"
    / "aio"
    / "_generated"
    / "story-routes.js"
)


def render() -> str:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    routes = manifest.get("routes")
    targets = manifest.get("targets")
    if not isinstance(routes, list) or not isinstance(targets, dict):
        raise SystemExit("AIO route manifest is invalid")

    index: dict[str, dict] = {}
    for route in routes:
        source_key = route.get("sourceKey") if isinstance(route, dict) else None
        if not isinstance(source_key, str) or source_key in index:
            raise SystemExit(f"AIO route identity is invalid or duplicated: {source_key!r}")
        value = {"reader": route.get("reader"), "adv": route.get("adv")}
        if route.get("variants") is not None:
            value["variants"] = route["variants"]
        index[source_key] = value

    compact = {"ensure_ascii": False, "separators": (",", ":")}
    return (
        "export const STORY_ROUTE_INDEX = Object.freeze("
        + json.dumps(index, **compact)
        + ");\nexport const STORY_ROUTER_TARGETS = Object.freeze("
        + json.dumps(targets, **compact)
        + ");\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = render()

    if args.check:
        actual = OUTPUT.read_text(encoding="utf-8") if OUTPUT.is_file() else None
        if actual != expected:
            raise SystemExit(
                "embedded AIO edge route table is stale; run "
                "python scripts/build-aio-edge-route-index.py"
            )
        print("Embedded AIO edge route table is current.")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
    if OUTPUT.stat().st_size >= 5 * 1024 * 1024:
        raise SystemExit("embedded AIO edge route table exceeds 5 MiB")
    route_count = len(json.loads(MANIFEST.read_text(encoding="utf-8"))["routes"])
    print(f"Embedded {route_count:,} AIO routes; {OUTPUT.stat().st_size:,} bytes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
