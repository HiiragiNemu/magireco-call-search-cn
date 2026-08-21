#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v26-converged-20260821"
KANA = re.compile(r"[\u3040-\u30ff\u31f0-\u31ffー]")


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def main() -> int:
    manifest = load("public/data/titles/manifest.json")
    parents = load("public/data/titles/parents.json")
    suffixes = load("public/data/titles/suffixes.json")
    titles = load("public/data/titles/titles.json")
    marker = load("public/v26-build-marker.json")
    branch_proof = load("reports/branch-cleanup-proof.json")

    for payload in (manifest, parents, suffixes, titles, marker):
        assert payload.get("release") == RELEASE, payload.get("release")
    assert manifest["summary"] == {
        "groupCount": 2166,
        "childTitleCount": 5826,
        "mappedTitleCount": 5826,
        "kanaInChineseDisplayFields": 0,
    }
    assert branch_proof.get("state") == "pass"
    assert branch_proof.get("after") == ["main"]

    hits = []
    for category, mapping in parents["parentByCategory"].items():
        for source, target in mapping.items():
            if KANA.search(str(target)):
                hits.append((category, source, target))
    for category, mapping in titles["titleByCategory"].items():
        for source, target in mapping.items():
            if KANA.search(str(target)):
                hits.append((category, source, target))
    assert not hits, hits[:20]

    expected = {
        ("scene0", "サイドストーリー Film.0 1 (紫)"): "支线故事 Film.0 1 （紫色）",
        ("イベント", "トリック☆トラブル☆学園祭 BADEND1話"): "诡计☆骚乱☆学园祭 坏结局 第1话",
        ("メモリア", "No.888 夢を追う妹"): "No.888 追梦的妹妹",
        ("メモリア", "No.900 夏のはじまりに母の影光り"): "No.900 夏日伊始，母亲的影子",
    }
    for (category, source), target in expected.items():
        assert titles["titleByCategory"][category][source] == target

    runtime = (ROOT / "public/myfile/story-title-runtime-v2.js").read_text(encoding="utf-8")
    assert "story-title-runtime-v26-20260821" in runtime
    assert "DecompressionStream" not in runtime
    assert "magireco-story-title-overrides:" in runtime
    assert "v25-title-delta" not in runtime

    expected_workflows = {"ci.yml", "production-verify.yml", "update-authoritative-titles.yml"}
    actual_workflows = {path.name for path in (ROOT / ".github/workflows").glob("*.yml")}
    assert actual_workflows == expected_workflows, actual_workflows

    forbidden = [
        ROOT / ".automation",
        ROOT / "NEW",
        ROOT / "node_modules",
        ROOT / "public/__acceptance.html",
        ROOT / "public/json_open_old.html",
        ROOT / "public/oldfile",
    ]
    assert not [str(path.relative_to(ROOT)) for path in forbidden if path.exists()]
    assert not list(ROOT.glob(".deploy-*"))
    assert not list(ROOT.glob(".v2*-*trigger*"))
    assert not list((ROOT / "public/data").glob("v25-title-delta.part-*.txt"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
