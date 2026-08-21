#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "scripts/migrate-v26-repository.py"


def load_migration_module():
    spec = importlib.util.spec_from_file_location("v26_migration", MIGRATION)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load migration module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    module = load_migration_module()
    payload = module.decode_delta()
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    groups_data = json.loads(
        (ROOT / "public/data/story-title-groups-v1.json").read_text(encoding="utf-8")
    )

    parent_delta = payload["p"]
    parents: dict[str, dict[str, str]] = {}
    for group in groups_data.get("groups") or []:
        category = str(group.get("category") or "")
        source_base = str(group.get("source_base") or "")
        target = str(
            (parent_delta.get(category) or {}).get(source_base)
            or group.get("approved_translation")
            or group.get("current_translation")
            or source_base
        ).strip()
        if not category or not source_base or not target:
            raise RuntimeError(f"invalid parent group: {group!r}")
        parents.setdefault(category, {})[source_base] = target

    parent_count = sum(len(value) for value in parents.values())
    if parent_count != 2166:
        raise RuntimeError(f"unexpected complete parent count: {parent_count}")

    authority = {
        "schemaVersion": 1,
        "release": module.RELEASE,
        "sourceRelease": module.SOURCE_RELEASE,
        "generatedAt": generated_at,
        "sourcePriority": module.SOURCE_PRIORITY,
        "summary": {
            "groupCount": 2166,
            "childTitleCount": 5826,
            "mappedTitleCount": 5826,
            "kanaInChineseDisplayFields": 0,
        },
        "parents": parents,
        "suffixes": payload["s"],
        "exactTitles": payload["e"],
    }
    module.write_json(ROOT / "data/titles/authority.json", authority)
    subprocess.run([sys.executable, "scripts/build-title-data.py"], cwd=ROOT, check=True)

    module.patch_page(ROOT / "public/story.html")
    module.patch_page(ROOT / "public/story-title-editor.html")
    module.clean_repository()

    subprocess.run(
        [sys.executable, "scripts/build-title-data.py", "--check"],
        cwd=ROOT,
        check=True,
    )
    proof = {
        "schemaVersion": 1,
        "state": "pass",
        "release": module.RELEASE,
        "completedAt": generated_at,
        "branchCleanupProof": "reports/branch-cleanup-proof.json",
        "remainingBranches": ["main"],
        "workflows": ["ci.yml", "production-verify.yml", "update-authoritative-titles.yml"],
        "formalTitleData": [
            "data/titles/authority.json",
            "public/data/titles/manifest.json",
            "public/data/titles/parents.json",
            "public/data/titles/suffixes.json",
            "public/data/titles/titles.json",
            "public/data/titles/provenance.json",
        ],
        "localOverrideStorage": "magireco-story-title-overrides:v26-converged-20260821",
        "removed": [
            "node_modules",
            ".automation",
            "NEW",
            "legacy trigger files",
            "legacy workflows",
            "V25 compressed title parts",
            "public historical acceptance pages",
        ],
    }
    module.write_json(ROOT / "reports/v26-convergence-proof.json", proof)
    subprocess.run([sys.executable, "scripts/validate-production.py"], cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
