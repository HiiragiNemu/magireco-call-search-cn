#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "canonical-title-authority-v1"
READER_REVISION = "bad94aa371dc9e6aed16ccf6d144106b31643f28"
AIO_ROUTER_BASE = "https://callsearch.magireco.top/aio/"
KANA = re.compile(r"[\u3040-\u30ff]")


def load(relative):
    path = ROOT / relative
    raw = path.read_bytes()
    if raw.lstrip().startswith((b"<!DOCTYPE", b"<html", b"<")):
        raise SystemExit(f"{relative}: HTML instead of JSON")
    return json.loads(raw.decode("utf-8"))


manifest = load("public/data/titles/manifest.json")
parents = load("public/data/titles/parents.json")
suffixes = load("public/data/titles/suffixes.json")
titles = load("public/data/titles/titles.json")
groups = load("public/data/story-title-groups-v1.json")
story_manifest = load("public/data/story-v6/manifest.json")
catalog = load("public/data/character-catalog.json")
localization = load("public/data/story-v7/localization.json")
reader_links = load("public/data/titles/reader-links.json")
title_sources = load("public/data/titles/sources.json")
story_router = load("public/data/story-router-v1.json")
aio_router = load("public/aio/story-routes.json")
build_info = load("public/build-info.json")

assert manifest["release"] == RELEASE
assert manifest["dataArchitecture"] == "plain-json"
assert parents["release"] == suffixes["release"] == titles["release"] == RELEASE
assert len(groups["groups"]) == 2166
assert sum(len(v) for v in titles["titleByCategory"].values()) == 5826
assert story_manifest["totalRows"] == 14466
assert len(story_manifest["categories"]) == 19
assert len(catalog) >= 180
assert isinstance(localization, dict)
assert reader_links["release"] == RELEASE
assert reader_links["reader"]["head"] == READER_REVISION
assert reader_links["reader"]["branch"] == "main"
assert reader_links["reader"]["dirty"] is False
assert reader_links["summary"] == {"entries": 1196, "officialCn": 871, "reader": 325}
assert len(reader_links["entriesBySourceIdentity"]) == 1196
assert title_sources["canonicalNameAliases"]["环伊吕波"] == "环彩羽"
assert title_sources["canonicalNameAliases"]["八云美玉"] == "八云御魂"
assert story_router["targets"]["reader"]["readerRevision"] == READER_REVISION
assert story_router["targets"]["reader"]["indexEntries"] == 3017
assert story_router["targets"]["adv"]["handoffReady"] is True
assert len(story_router["routes"]) == 9535
assert sum(route["reader"] is not None for route in story_router["routes"]) == 9535
assert sum(route["adv"] is not None for route in story_router["routes"]) == 8076
assert aio_router["catalogRevision"] == story_router["catalogRevision"]
assert aio_router["targets"]["reader"]["readerRevision"] == READER_REVISION
assert aio_router["targets"]["adv"]["handoffReady"] is True
assert len(aio_router["routes"]) == 9535
assert build_info["storyRouterRouteCount"] == 9535
assert build_info["storyRouterReaderRevision"] == READER_REVISION
assert build_info["aioRouterBase"] == AIO_ROUTER_BASE

for category, pairs in titles["titleByCategory"].items():
    for source, target in pairs.items():
        assert isinstance(target, str) and target.strip(), (category, source)
        assert not KANA.search(target), (category, source, target)

samples = {
    ("scene0", "サイドストーリー Film.0 1 (紫)"): "支线故事 Film.0 1 (紫色)",
    ("イベント", "トリック☆トラブル☆学園祭 BADEND1話"): "诡计☆骚乱☆学园祭 坏结局 第1话",
    ("メモリア", "No.888 夢を追う妹"): "No.888 追梦的妹妹",
    ("メモリア", "No.900 夏のはじまりに母の影光り"): "No.900 夏日伊始,母亲的影子",
}
for (category, source), expected in samples.items():
    assert titles["titleByCategory"][category][source] == expected

runtime = (ROOT / "public/myfile/story-title-runtime-v2.js").read_text(encoding="utf-8")
story = (ROOT / "public/story.html").read_text(encoding="utf-8")
editor = (ROOT / "public/story-title-editor.html").read_text(encoding="utf-8")
index = (ROOT / "public/index.html").read_text(encoding="utf-8")
menu_css = (ROOT / "public/myfile/hamburgerMenu.css").read_text(encoding="utf-8")

assert "story-title-runtime-canonical-title-authority-v1" in runtime
assert "DecompressionStream" not in runtime
assert "v25-title-delta" not in runtime
assert "magireco-story-title-overrides:" in runtime
assert "v26-converged-20260822" in story
assert "story-route-bridge-v1.js" in story
assert "story-sprite-bridge-v1.js" not in story
assert "SpriteBridge.wrapChip" not in (ROOT / "public/myfile/story-app-v7.js").read_text(encoding="utf-8")
assert f'<meta name="magireco-aio-router" content="{AIO_ROUTER_BASE}">' in story
assert (ROOT / "public/edge-functions/aio/open.js").is_file()
assert (ROOT / "public/edge-functions/aio/_runtime/story-router.js").is_file()
assert "v26-converged-20260822" in editor
assert "story-title-runtime-v2.js?v=20260825-canonical-title-v1" in story
assert "story-title-runtime-v2.js?v=20260825-canonical-title-v1" in editor
assert 'class="navtext-container"' not in index
assert "hamburger-menu-v23.js?v=20260822-v26-final3" in index
assert "width: max-content;" in menu_css
assert "min-width:" not in menu_css
assert "body:has(.menu-btn:checked)" in menu_css
assert "overflow: visible;" in menu_css

for relative in (
    "node_modules",
    ".automation",
    "NEW",
    "public/__acceptance.html",
    "public/json_open_old.html",
    "public/oldfile",
):
    assert not (ROOT / relative).exists(), relative

assert not list((ROOT / "public/data").glob("v25-title-delta.part-*.txt"))
assert not (ROOT / "public/data/story-title-map.generated.json").exists()

workflows = sorted(path.name for path in (ROOT / ".github/workflows").glob("*.yml"))
assert workflows == ["ci.yml", "production-verify.yml", "update-authoritative-titles.yml"], workflows

required_ignore = {
    "node_modules/",
    "_sources/",
    ".cache/",
    ".pytest_cache/",
    "coverage/",
    "dist/",
    "build/",
    "*.log",
    ".env",
    ".env.*",
}
ignore_lines = set((ROOT / ".gitignore").read_text(encoding="utf-8").splitlines())
assert required_ignore <= ignore_lines

print("V26 repository validation passed.")
