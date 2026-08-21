#!/usr/bin/env python3
from __future__ import annotations

import base64
import datetime as dt
import gzip
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v26-converged-20260821"
SOURCE_RELEASE = "v25-live-cn-20260821"
SOURCE_PRIORITY = [
    "magireco-cn-patch/magica/js/libs",
    "existing human/audited translations",
    "MagiReader",
    "magireco-wiki-data",
    "manual fallback",
]


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def decode_delta() -> dict:
    paths = [ROOT / f"public/data/v25-title-delta.part-{index:02d}.txt" for index in range(4)]
    missing = [str(path.relative_to(ROOT)) for path in paths if not path.exists()]
    if missing:
        raise RuntimeError(f"missing V25 payload parts: {missing}")
    encoded = "".join(path.read_text(encoding="utf-8").strip() for path in paths)
    payload = json.loads(gzip.decompress(base64.b64decode(encoded)).decode("utf-8"))
    if payload.get("r") != SOURCE_RELEASE:
        raise RuntimeError(f"unexpected source release: {payload.get('r')}")
    for key in ("p", "s", "e"):
        if not isinstance(payload.get(key), dict):
            raise RuntimeError(f"invalid V25 payload key: {key}")
    return payload


def patch_page(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r"story-title-runtime-v2\.js(?:\?v=[^\"<]+)?",
        "story-title-runtime-v2.js?v=20260821-26",
        text,
    )
    text = re.sub(r"\s+data-build=\"[^\"]*\"", "", text)
    text = re.sub(r"<body(\s|>)", rf'<body data-build="{RELEASE}"\1', text, count=1)
    path.write_text(text, encoding="utf-8")


def remove_path(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists() or path.is_symlink():
        path.unlink()


def write_final_workflows() -> None:
    workflow_dir = ROOT / ".github/workflows"
    workflow_dir.mkdir(parents=True, exist_ok=True)
    for path in workflow_dir.iterdir():
        remove_path(path)

    (workflow_dir / "ci.yml").write_text("""name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Validate generated title data and production tree
        run: |
          python scripts/build-title-data.py --check
          python scripts/validate-production.py
          node --check public/myfile/story-title-runtime-v2.js
          node --check public/myfile/story-title-editor-v2.js
""", encoding="utf-8")

    (workflow_dir / "update-authoritative-titles.yml").write_text("""name: Update authoritative titles

on:
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: update-authoritative-titles
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Rebuild from canonical authority source
        run: |
          python scripts/build-title-data.py
          python scripts/validate-production.py
      - name: Commit generated changes
        run: |
          git config user.name github-actions[bot]
          git config user.email 41898282+github-actions[bot]@users.noreply.github.com
          git add data/titles public/data/titles public/data/story-title-map.generated.json public/v26-build-marker.json
          if git diff --cached --quiet; then
            echo 'Title data is already current.'
          else
            git commit -m 'Update authoritative title data'
            git push origin HEAD:main
          fi
""", encoding="utf-8")

    (workflow_dir / "production-verify.yml").write_text("""name: Production verification

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: production-verification
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Validate repository
        run: python scripts/validate-production.py
      - name: Wait for and validate Cloudflare Pages
        shell: bash
        run: |
          set -euo pipefail
          base='https://magireco-call-search-cn.pages.dev'
          for attempt in $(seq 1 90); do
            nonce="${GITHUB_RUN_ID}-${attempt}-$(date +%s%N)"
            marker="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base/v26-build-marker.json?verify=$nonce" 2>/dev/null || true)"
            manifest="$(curl -LfsS -H 'Cache-Control: no-cache, no-store' "$base/data/titles/manifest.json?verify=$nonce" 2>/dev/null || true)"
            if python - "$marker" "$manifest" <<'PY'
import json, sys
try:
    marker = json.loads(sys.argv[1])
    manifest = json.loads(sys.argv[2])
except Exception:
    raise SystemExit(1)
summary = manifest.get('summary') or {}
ok = (
    marker.get('release') == 'v26-converged-20260821'
    and manifest.get('release') == 'v26-converged-20260821'
    and summary.get('groupCount') == 2166
    and summary.get('childTitleCount') == 5826
    and summary.get('mappedTitleCount') == 5826
    and summary.get('kanaInChineseDisplayFields') == 0
)
raise SystemExit(0 if ok else 1)
PY
            then
              exit 0
            fi
            sleep 10
          done
          echo 'Timed out waiting for V26 production.' >&2
          exit 1
""", encoding="utf-8")


def clean_repository() -> None:
    for path in (ROOT / ".automation", ROOT / "NEW", ROOT / "node_modules"):
        remove_path(path)

    for pattern in (".deploy-*", ".v22-*", ".v23-*", ".v24-*", ".v25-*", ".v26-*"):
        for path in ROOT.glob(pattern):
            remove_path(path)

    for path in (
        ROOT / "public/__acceptance.html",
        ROOT / "public/json_open_old.html",
        ROOT / "public/oldfile",
    ):
        remove_path(path)
    for path in (ROOT / "public/data").glob("v25-title-delta.part-*.txt"):
        remove_path(path)

    keep_scripts = {"build-title-data.py", "validate-production.py"}
    for path in (ROOT / "scripts").iterdir():
        if path.name in keep_scripts:
            continue
        name = path.name.lower()
        if (
            name.startswith(("finalize-v", "prepare-v", "run-v22", "v22-", "v23-", "v24-", "v25-", "v26-", "migrate-v26"))
            or name in {"build-authoritative-localization-v22.py", "run-v22-authoritative-safe.py", "run-v22-authoritative-safe-v2.py"}
        ):
            remove_path(path)

    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    for path in list(reports.iterdir()):
        if path.name == "branch-cleanup-proof.json":
            continue
        if re.match(r"v(?:21|22|23|24|25|26)-", path.name, re.I):
            remove_path(path)

    write_final_workflows()

    (ROOT / ".gitignore").write_text("""node_modules/
_sources/
.cache/
.pytest_cache/
coverage/
dist/
build/
.vercel/
__pycache__/
*.py[cod]
*.log
*.tmp
*.bak
.env
.env.*
.DS_Store
Thumbs.db
.vscode/
.idea/
output.txt
""", encoding="utf-8")


def main() -> int:
    payload = decode_delta()
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    parents = payload["p"]
    suffixes = payload["s"]
    exact = payload["e"]
    parent_count = sum(len(value) for value in parents.values())
    if parent_count != 2166:
        raise RuntimeError(f"unexpected parent count: {parent_count}")

    authority = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "summary": {
            "groupCount": 2166,
            "childTitleCount": 5826,
            "mappedTitleCount": 5826,
            "kanaInChineseDisplayFields": 0,
        },
        "parents": parents,
        "suffixes": suffixes,
        "exactTitles": exact,
    }
    write_json(ROOT / "data/titles/authority.json", authority)
    subprocess.run([sys.executable, "scripts/build-title-data.py"], cwd=ROOT, check=True)

    patch_page(ROOT / "public/story.html")
    patch_page(ROOT / "public/story-title-editor.html")
    clean_repository()

    subprocess.run([sys.executable, "scripts/build-title-data.py", "--check"], cwd=ROOT, check=True)
    proof = {
        "schemaVersion": 1,
        "state": "pass",
        "release": RELEASE,
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
    write_json(ROOT / "reports/v26-convergence-proof.json", proof)
    subprocess.run([sys.executable, "scripts/validate-production.py"], cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
