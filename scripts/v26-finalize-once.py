#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
RELEASE = "v26-converged-20260822"
RUNTIME_RELEASE = "story-title-runtime-v26-20260822"
CACHE_VERSION = "20260822-v26-final3"
SOURCE_RELEASE = "v25-live-cn-20260821"
SOURCE_PRIORITY = [
    "magireco-cn-patch/magica/js/libs",
    "existing human/audited translations",
    "MagiReader",
    "magireco-wiki-data",
    "manual fallback",
]

KANA_RE = re.compile(r"[\u3040-\u30ff]")


def fail(message: str) -> None:
    raise SystemExit(message)


def load_json(path: Path):
    raw = path.read_bytes()
    if raw.lstrip().startswith((b"<!DOCTYPE", b"<html", b"<")):
        fail(f"{path.relative_to(ROOT)} contains HTML instead of JSON")
    return json.loads(raw.decode("utf-8"))


def dump_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def nested_count(mapping: dict) -> int:
    return sum(len(value) for value in mapping.values() if isinstance(value, dict))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def decode_v25_payload() -> dict:
    chunks: list[str] = []
    for index in range(4):
        path = PUBLIC / "data" / f"v25-title-delta.part-{index:02d}.txt"
        if not path.is_file():
            fail(f"missing V25 source payload: {path.relative_to(ROOT)}")
        chunks.append(path.read_text(encoding="utf-8").strip())
    try:
        payload = json.loads(
            gzip.decompress(base64.b64decode("".join(chunks))).decode("utf-8")
        )
    except Exception as exc:
        fail(f"cannot decode V25 production payload: {exc}")
    if payload.get("r") != SOURCE_RELEASE:
        fail(f"unexpected V25 source release: {payload.get('r')!r}")
    for key in ("p", "s", "e"):
        if not isinstance(payload.get(key), dict):
            fail(f"V25 payload field {key!r} is invalid")
    return payload


def reconstruct_title_data(groups_data: dict, payload: dict):
    groups = groups_data.get("groups")
    if not isinstance(groups, list) or len(groups) != 2166:
        fail(f"expected 2166 mother-title groups, got {len(groups) if isinstance(groups, list) else 'invalid'}")

    parent_by_category = payload["p"]
    suffix_by_source = payload["s"]
    exact_exceptions = payload["e"]
    title_by_category: dict[str, dict[str, str]] = {}
    total_children = 0

    for group in groups:
        category = str(group.get("category") or "")
        source_base = str(group.get("source_base") or "")
        parent = str(
            parent_by_category.get(category, {}).get(source_base)
            or group.get("approved_translation")
            or group.get("current_translation")
            or source_base
        ).strip()
        if not parent:
            fail(f"empty mother title: {category}/{source_base}")

        group["current_translation"] = parent
        group["approved_translation"] = parent

        category_map = title_by_category.setdefault(category, {})
        for child in group.get("children") or []:
            total_children += 1
            source_title = str(child.get("source_title") or "").strip()
            source_suffix = str(child.get("source_suffix") or "")
            if not source_title:
                fail(f"empty source title in group {group.get('group_id')}")

            exact = exact_exceptions.get(category, {}).get(source_title)
            if isinstance(exact, str) and exact.strip():
                target = exact.strip()
            else:
                if source_suffix in suffix_by_source:
                    suffix = str(suffix_by_source[source_suffix] or "").strip()
                else:
                    suffix = str(
                        child.get("localized_suffix")
                        if child.get("localized_suffix") is not None
                        else source_suffix
                    ).strip()
                target = f"{parent}{' ' + suffix if suffix else ''}".strip()

            if not target:
                fail(f"empty Chinese display title: {category}/{source_title}")
            child["localized_suffix"] = (
                str(suffix_by_source.get(source_suffix, child.get("localized_suffix", source_suffix)) or "").strip()
            )
            child["localized_joiner"] = " " if child["localized_suffix"] else ""
            child["current_full_translation"] = target
            category_map[source_title] = target

    mapped_count = nested_count(title_by_category)
    if total_children != 5826:
        fail(f"expected 5826 child records, got {total_children}")
    if mapped_count != 5826:
        fail(f"expected 5826 exact title mappings, got {mapped_count}")

    bad_values: list[tuple[str, str, str]] = []
    for category, pairs in parent_by_category.items():
        for source, target in pairs.items():
            if not isinstance(target, str) or not target.strip() or KANA_RE.search(target):
                bad_values.append((category, source, str(target)))
    for category, pairs in title_by_category.items():
        for source, target in pairs.items():
            if not isinstance(target, str) or not target.strip() or KANA_RE.search(target):
                bad_values.append((category, source, str(target)))
    if bad_values:
        fail(f"Chinese display validation failed: {bad_values[:8]}")

    samples = {
        ("scene0", "サイドストーリー Film.0"): "支线故事 Film.0",
        ("イベント", "トリック☆トラブル☆学園祭 BADEND1話"): "诡计☆骚乱☆学园祭 坏结局 第1话",
        ("メモリア", "No.888 夢を追う妹"): "No.888 追梦的妹妹",
        ("メモリア", "No.900 夏のはじまりに母の影光り"): "No.900 夏日伊始，母亲的影子",
    }
    for (category, source), expected in samples.items():
        actual = title_by_category.get(category, {}).get(source)
        if actual != expected:
            fail(f"sample mismatch for {category}/{source}: {actual!r}")

    groups_data["release"] = RELEASE
    groups_data["version"] = 26
    groups_data["summary"] = {
        **(groups_data.get("summary") or {}),
        "groupCount": len(groups),
        "approvedGroupCount": len(groups),
        "missingLocalizationCount": 0,
        "missingLocalizationSample": [],
        "kanaInChineseTranslationCount": 0,
        "mappedTitleCount": mapped_count,
    }
    return parent_by_category, suffix_by_source, title_by_category, total_children


V26_RUNTIME = r'''/* V26 authoritative Chinese title runtime.
 * Loads ordinary JSON and never lets title enhancement failure disable core story search. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-runtime-v26-20260822';
  const DATA_RELEASE = 'v26-converged-20260822';
  const VERSION = '20260822-v26-final3';
  const GROUPS_URL = `./data/story-title-groups-v1.json?v=${VERSION}`;
  const MANIFEST_URL = `./data/titles/manifest.json?v=${VERSION}`;
  const PARENTS_URL = `./data/titles/parents.json?v=${VERSION}`;
  const SUFFIXES_URL = `./data/titles/suffixes.json?v=${VERSION}`;
  const TITLES_URL = `./data/titles/titles.json?v=${VERSION}`;
  const STORAGE_PREFIX = 'magireco-story-title-overrides:';
  const STORAGE_KEY = `${STORAGE_PREFIX}${DATA_RELEASE}`;
  const LEGACY_STORAGE_KEYS = ['magireco-story-title-overrides-v1'];

  const Tools = global.MagiToolsV7;
  if (!Tools?.loadLocalizationV7) {
    console.error('V26 标题运行时未找到 MagiToolsV7。');
    return;
  }

  const originalLoad = Tools.loadLocalizationV7.bind(Tools);
  let formalPromise = null;
  let groupsPromise = null;
  let mergedPromise = null;

  async function fetchJsonStrict(url, label) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${label}：HTTP ${response.status}`);
    const text = await response.text();
    if (/^\s*</u.test(text)) throw new Error(`${label}返回了 HTML，而不是 JSON。`);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`${label}不是有效 JSON：${error.message}`);
    }
  }

  function validateRelease(payload, label) {
    if (!payload || payload.release !== DATA_RELEASE) {
      throw new Error(`${label}数据版本不一致。`);
    }
    return payload;
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function loadFormalData() {
    if (!formalPromise) {
      formalPromise = Promise.all([
        fetchJsonStrict(MANIFEST_URL, '标题清单'),
        fetchJsonStrict(PARENTS_URL, '母标题'),
        fetchJsonStrict(SUFFIXES_URL, '后缀'),
        fetchJsonStrict(TITLES_URL, '完整标题')
      ]).then(([manifest, parents, suffixes, titles]) => {
        validateRelease(manifest, '标题清单');
        validateRelease(parents, '母标题');
        validateRelease(suffixes, '后缀');
        validateRelease(titles, '完整标题');
        if (manifest.dataArchitecture !== 'plain-json') {
          throw new Error('标题清单不是 plain-json 架构。');
        }
        if (!parents.parentByCategory || !suffixes.suffixBySource || !titles.titleByCategory) {
          throw new Error('正式标题数据结构不完整。');
        }
        return { manifest, parents, suffixes, titles };
      });
    }
    return formalPromise;
  }

  function applyFormalData(groupsData, formal) {
    const parentByCategory = formal.parents.parentByCategory || {};
    const suffixBySource = formal.suffixes.suffixBySource || {};
    const titleByCategory = formal.titles.titleByCategory || {};

    for (const group of groupsData.groups || []) {
      const category = String(group.category || '');
      const sourceBase = String(group.source_base || '');
      const parent = String(
        parentByCategory[category]?.[sourceBase]
        || group.approved_translation
        || group.current_translation
        || sourceBase
      ).trim();
      group.current_translation = parent;
      group.approved_translation = parent;

      for (const child of group.children || []) {
        const sourceTitle = String(child.source_title || '');
        const sourceSuffix = String(child.source_suffix || '');
        const suffix = own(suffixBySource, sourceSuffix)
          ? String(suffixBySource[sourceSuffix] ?? '').trim()
          : String(child.localized_suffix ?? sourceSuffix).trim();
        const target = String(
          titleByCategory[category]?.[sourceTitle]
          || `${parent}${suffix ? ` ${suffix}` : ''}`
        ).trim();
        child.localized_suffix = suffix;
        child.localized_joiner = suffix ? ' ' : '';
        child.current_full_translation = target;
      }
    }

    groupsData.release = DATA_RELEASE;
    groupsData.version = 26;
    groupsData.summary = {
      ...(groupsData.summary || {}),
      groupCount: (groupsData.groups || []).length,
      approvedGroupCount: (groupsData.groups || []).length,
      missingLocalizationCount: 0,
      missingLocalizationSample: [],
      kanaInChineseTranslationCount: 0
    };
    return groupsData;
  }

  function loadGroups() {
    if (!groupsPromise) {
      groupsPromise = Promise.all([
        fetchJsonStrict(GROUPS_URL, '母故事清单'),
        loadFormalData()
      ]).then(([groupsData, formal]) => {
        if (!groupsData || !Array.isArray(groupsData.groups)) {
          throw new Error('母故事清单格式无效。');
        }
        return applyFormalData(groupsData, formal);
      });
    }
    return groupsPromise;
  }

  function loadServerMap() {
    return loadFormalData().then((formal) => ({
      version: 26,
      release: DATA_RELEASE,
      titleByCategory: formal.titles.titleByCategory || {}
    }));
  }

  function emptyLocalPayload() {
    return { version: 26, release: DATA_RELEASE, overrides: [] };
  }

  function readLocalPayload() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.release !== DATA_RELEASE || !Array.isArray(parsed.overrides)) {
        return emptyLocalPayload();
      }
      return parsed;
    } catch {
      return emptyLocalPayload();
    }
  }

  function writeLocalPayload(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...payload,
      version: 26,
      release: DATA_RELEASE
    }));
  }

  function normalizeOverrideList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.overrides)) return payload.overrides;
    if (Array.isArray(payload?.groups)) {
      return payload.groups
        .filter((item) => String(item?.approved_translation || '').trim())
        .map((item) => ({
          group_id: item.group_id,
          category: item.category,
          source_base: item.source_base,
          source_sha256: item.source_sha256,
          approved_translation: item.approved_translation
        }));
    }
    return [];
  }

  function validateAndIndex(groupsData, payload, strict = true) {
    const groups = new Map(groupsData.groups.map((group) => [group.group_id, group]));
    const overrides = new Map();
    const errors = [];
    for (const raw of normalizeOverrideList(payload)) {
      const groupId = String(raw?.group_id || '').trim();
      const approved = String(raw?.approved_translation || '').trim();
      if (!groupId || !approved) continue;
      const group = groups.get(groupId);
      if (!group) {
        errors.push(`不存在的 group_id：${groupId}`);
        continue;
      }
      for (const [key, expected] of [
        ['category', group.category],
        ['source_base', group.source_base],
        ['source_sha256', group.source_sha256]
      ]) {
        if (raw[key] != null && String(raw[key]) !== String(expected)) {
          errors.push(`${groupId} 的 ${key} 与当前清单不一致。`);
        }
      }
      if (overrides.has(groupId)) errors.push(`重复 group_id：${groupId}`);
      overrides.set(groupId, {
        group_id: groupId,
        category: group.category,
        source_base: group.source_base,
        source_sha256: group.source_sha256,
        approved_translation: approved
      });
    }
    if (strict && errors.length) throw new Error(errors.slice(0, 12).join('\n'));
    return { overrides, errors };
  }

  function compose(group, child, override) {
    if (!override) return String(child.current_full_translation || '').trim();
    const base = String(override.approved_translation || '').trim();
    const suffix = String(child.localized_suffix ?? '').trim();
    return `${base}${suffix ? ` ${suffix}` : ''}`.trim();
  }

  function exactMapFrom(groupsData, payload, strict = true) {
    const { overrides, errors } = validateAndIndex(groupsData, payload, strict);
    const titleByCategory = {};
    for (const group of groupsData.groups) {
      const categoryMap = titleByCategory[group.category]
        || (titleByCategory[group.category] = {});
      const override = overrides.get(group.group_id);
      for (const child of group.children || []) {
        const source = String(child.source_title || '').trim();
        if (source) categoryMap[source] = compose(group, child, override);
      }
    }
    return { release: DATA_RELEASE, version: 26, titleByCategory, errors };
  }

  function mergeCategoryMaps(...maps) {
    const output = {};
    for (const source of maps) {
      if (!source || typeof source !== 'object') continue;
      for (const [category, pairs] of Object.entries(source)) {
        if (!pairs || typeof pairs !== 'object') continue;
        output[category] = Object.assign(output[category] || {}, pairs);
      }
    }
    return output;
  }

  function loadMergedLocalization() {
    if (!mergedPromise) {
      mergedPromise = originalLoad().then(async (localization) => {
        try {
          const [groupsData, serverMap] = await Promise.all([loadGroups(), loadServerMap()]);
          let localMap = { titleByCategory: {} };
          try {
            localMap = exactMapFrom(groupsData, readLocalPayload(), true);
          } catch (error) {
            console.error('当前发布版本的本地母标题修改未应用。', error);
          }
          return {
            ...localization,
            release: DATA_RELEASE,
            titleByCategoryV10: mergeCategoryMaps(
              localization?.titleByCategoryV10,
              serverMap.titleByCategory,
              localMap.titleByCategory
            ),
            storyTitleGroupsV1: groupsData,
            storyTitleMapV1: serverMap
          };
        } catch (error) {
          console.error('V26 标题增强载入失败；核心故事搜索继续使用基础本地化。', error);
          global.dispatchEvent(new CustomEvent('story-title-runtime-error', {
            detail: { message: String(error?.message || error) }
          }));
          return {
            ...localization,
            storyTitleRuntimeError: String(error?.message || error)
          };
        }
      });
    }
    return mergedPromise;
  }

  function refresh() {
    mergedPromise = null;
    global.dispatchEvent(new CustomEvent('story-title-map-v1-updated'));
  }

  async function importPayload(payload, { persist = true, strict = true } = {}) {
    const groupsData = await loadGroups();
    const normalizedInput = { ...payload, release: DATA_RELEASE };
    const indexed = validateAndIndex(groupsData, normalizedInput, strict);
    const normalized = {
      version: 26,
      release: DATA_RELEASE,
      checklist_generated_at: groupsData.generatedAt || '',
      overrides: [...indexed.overrides.values()]
        .sort((a, b) => a.group_id.localeCompare(b.group_id))
    };
    if (persist) writeLocalPayload(normalized);
    refresh();
    return {
      payload: normalized,
      map: exactMapFrom(groupsData, normalized, strict),
      warnings: indexed.errors
    };
  }

  function clearLocalOverrides() {
    localStorage.removeItem(STORAGE_KEY);
    refresh();
    return Promise.resolve();
  }

  const api = Object.freeze({
    release: RELEASE,
    dataRelease: DATA_RELEASE,
    groupsUrl: GROUPS_URL,
    mapUrl: TITLES_URL,
    storageKey: STORAGE_KEY,
    ignoredLegacyStorageKeys: LEGACY_STORAGE_KEYS,
    loadGroups,
    loadServerMap,
    readLocalPayload,
    importPayload,
    clearLocalOverrides,
    exactMapFrom,
    compose,
    refresh
  });

  global.MagiToolsV7 = Object.freeze({
    ...Tools,
    loadLocalizationV7: loadMergedLocalization
  });
  global.__STORY_TITLE_RUNTIME_V1__ = api;
  document.documentElement.dataset.storyTitleRuntimeV2 = RELEASE;
})(window);
'''


BUILD_SCRIPT = r'''#!/usr/bin/env python3
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
'''


VALIDATE_SCRIPT = r'''#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v26-converged-20260822"
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

assert manifest["release"] == RELEASE
assert manifest["dataArchitecture"] == "plain-json"
assert parents["release"] == suffixes["release"] == titles["release"] == RELEASE
assert len(groups["groups"]) == 2166
assert sum(len(v) for v in titles["titleByCategory"].values()) == 5826
assert story_manifest["totalRows"] == 14466
assert len(story_manifest["categories"]) == 19
assert len(catalog) >= 180
assert isinstance(localization, dict)

for category, pairs in titles["titleByCategory"].items():
    for source, target in pairs.items():
        assert isinstance(target, str) and target.strip(), (category, source)
        assert not KANA.search(target), (category, source, target)

samples = {
    ("scene0", "サイドストーリー Film.0"): "支线故事 Film.0",
    ("イベント", "トリック☆トラブル☆学園祭 BADEND1話"): "诡计☆骚乱☆学园祭 坏结局 第1话",
    ("メモリア", "No.888 夢を追う妹"): "No.888 追梦的妹妹",
    ("メモリア", "No.900 夏のはじまりに母の影光り"): "No.900 夏日伊始，母亲的影子",
}
for (category, source), expected in samples.items():
    assert titles["titleByCategory"][category][source] == expected

runtime = (ROOT / "public/myfile/story-title-runtime-v2.js").read_text(encoding="utf-8")
story = (ROOT / "public/story.html").read_text(encoding="utf-8")
editor = (ROOT / "public/story-title-editor.html").read_text(encoding="utf-8")
index = (ROOT / "public/index.html").read_text(encoding="utf-8")
menu_css = (ROOT / "public/myfile/hamburgerMenu.css").read_text(encoding="utf-8")

assert "story-title-runtime-v26-20260822" in runtime
assert "DecompressionStream" not in runtime
assert "v25-title-delta" not in runtime
assert "magireco-story-title-overrides:" in runtime
assert "v26-converged-20260822" in story
assert "v26-converged-20260822" in editor
assert "20260822-v26-final3" in story
assert "20260822-v26-final3" in editor
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
'''


CI_WORKFLOW = r'''name: Validate static site

on:
  push:
    branches: [main]
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
          python-version: "3.12"
      - run: |
          python scripts/build-title-data.py --check
          python scripts/validate-production.py
          node --check public/myfile/story-title-runtime-v2.js
          node --check public/myfile/story-app-v7.js
          node --check public/myfile/story-title-editor-v2.js
'''


PRODUCTION_WORKFLOW = r'''name: Verify production deployment

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "public/**"
      - "scripts/validate-production.py"
      - ".github/workflows/production-verify.yml"

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python scripts/validate-production.py
      - name: Wait for Cloudflare Pages and validate production data
        run: |
          python - <<'PY'
          import json
          import time
          import urllib.request

          base = "https://magireco-call-search-cn.pages.dev"
          for attempt in range(120):
              nonce = str(time.time_ns())

              def get(path):
                  req = urllib.request.Request(
                      f"{base}/{path}?verify={nonce}",
                      headers={
                          "Cache-Control": "no-cache, no-store",
                          "User-Agent": "V26-production-verify",
                      },
                  )
                  with urllib.request.urlopen(req, timeout=60) as response:
                      raw = response.read()
                  if raw.lstrip().startswith((b"<!DOCTYPE", b"<html", b"<")):
                      raise RuntimeError(f"{path}: HTML instead of data")
                  return raw

              try:
                  manifest = json.loads(get("data/titles/manifest.json"))
                  assert manifest["release"] == "v26-converged-20260822"
                  assert manifest["dataArchitecture"] == "plain-json"
                  assert json.loads(get("data/story-v6/manifest.json"))["totalRows"] == 14466
                  assert len(json.loads(get("data/character-catalog.json"))) >= 180
                  titles = json.loads(get("data/titles/titles.json"))
                  assert sum(len(v) for v in titles["titleByCategory"].values()) == 5826
                  print("Production V26 endpoints passed.")
                  break
              except Exception:
                  if attempt == 119:
                      raise
                  time.sleep(5)
          PY
      - name: Exercise production in Chromium
        run: |
          python -m pip install --disable-pip-version-check playwright
          python -m playwright install --with-deps chromium
          python scripts/browser-smoke.py \
            --base https://magireco-call-search-cn.pages.dev \
            --output /tmp/v26-production-browser-proof.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: v26-production-verification
          path: /tmp/v26-production-browser-proof.json
          if-no-files-found: ignore
          retention-days: 30
'''


UPDATE_WORKFLOW = r'''name: Rebuild authoritative title data

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: |
          python scripts/build-title-data.py
          python scripts/validate-production.py
      - run: |
          git config user.name github-actions[bot]
          git config user.email 41898282+github-actions[bot]@users.noreply.github.com
          git add data/titles public/data/titles
          if git diff --cached --quiet; then
            echo "No title-data changes."
          else
            git commit -m "Rebuild authoritative title data"
            git push origin HEAD:main
          fi
'''


BROWSER_SMOKE = '#!/usr/bin/env python3\nfrom __future__ import annotations\n\nimport argparse\nimport json\nimport time\nfrom pathlib import Path\nfrom urllib.parse import urlparse\n\nfrom playwright.sync_api import sync_playwright\n\nEXPECTED_RELEASE = "v26-converged-20260822"\n\n\ndef main() -> None:\n    parser = argparse.ArgumentParser()\n    parser.add_argument("--base", required=True)\n    parser.add_argument("--output", required=True)\n    parser.add_argument("--allow-title-runtime-error", action="store_true")\n    args = parser.parse_args()\n\n    base = args.base.rstrip("/")\n    origin = f"{urlparse(base).scheme}://{urlparse(base).netloc}"\n    proof = {\n        "base": base,\n        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),\n        "state": "fail",\n        "pageErrors": [],\n        "sameOriginRequestFailures": [],\n        "checks": {},\n    }\n\n    with sync_playwright() as playwright:\n        browser = playwright.chromium.launch(headless=True)\n        context = browser.new_context(viewport={"width": 1280, "height": 900})\n        page = context.new_page()\n\n        page.on("pageerror", lambda error: proof["pageErrors"].append(str(error)))\n\n        def request_failed(request):\n            if request.url.startswith(origin):\n                proof["sameOriginRequestFailures"].append({\n                    "url": request.url,\n                    "failure": request.failure,\n                })\n\n        page.on("requestfailed", request_failed)\n\n        page.goto(f"{base}/story.html?smoke={time.time_ns()}", wait_until="domcontentloaded", timeout=120000)\n        page.wait_for_function(\n            "() => document.querySelectorAll(\'.suite-character-card\').length >= 180",\n            timeout=120000,\n        )\n        count_text = page.locator("#storyCharacterCount").inner_text()\n        status_text = page.locator("#storyStatus").inner_text()\n        if "初始化失败" in status_text:\n            raise AssertionError(status_text)\n        if page.locator("#storySearchButton").is_disabled():\n            raise AssertionError("story search button is disabled after initialization")\n\n        runtime_info = page.evaluate(\n            """async () => {\n              const api = window.__STORY_TITLE_RUNTIME_V1__;\n              const localization = await window.MagiToolsV7.loadLocalizationV7();\n              const map = localization.titleByCategoryV10 || {};\n              return {\n                dataRelease: api?.dataRelease || null,\n                runtimeRelease: api?.release || null,\n                mappedTitles: Object.values(map).reduce(\n                  (sum, pairs) => sum + Object.keys(pairs || {}).length,\n                  0\n                ),\n                sample: map[\'メモリア\']?.[\'No.888 夢を追う妹\'] || null,\n                runtimeError: localization.storyTitleRuntimeError || null\n              };\n            }"""\n        )\n        if not args.allow_title_runtime_error:\n            if runtime_info["dataRelease"] != EXPECTED_RELEASE:\n                raise AssertionError(runtime_info)\n            if runtime_info["mappedTitles"] < 5826:\n                raise AssertionError(runtime_info)\n            if runtime_info["sample"] != "No.888 追梦的妹妹":\n                raise AssertionError(runtime_info)\n            if runtime_info["runtimeError"]:\n                raise AssertionError(runtime_info)\n        else:\n            # Missing V26 title files are allowed here. The assertion is that the\n            # core catalog and search UI still initialize and return results.\n            pass\n\n        page.locator("#storyClearTypes").click()\n        page.evaluate(\n            """() => {\n              const input = [...document.querySelectorAll(\n                \'#storyTypeOptions input[name="storyType"]\'\n              )].find((item) => item.value === \'魔法少女\');\n              if (!input) throw new Error(\'character-story category is missing\');\n              input.checked = true;\n              input.dispatchEvent(new Event(\'change\', { bubbles: true }));\n            }"""\n        )\n        target = page.locator(\'.suite-character-card[data-jp="環いろは"]\')\n        if target.count() == 0:\n            target = page.locator(".suite-character-card").first\n        target.click()\n        page.locator("#storySearchButton").click()\n        page.wait_for_function(\n            "() => document.querySelector(\'#storyStatus\')?.textContent.includes(\'搜索完成\')",\n            timeout=120000,\n        )\n        result_rows = page.locator(".story-row-v7").count()\n        if result_rows < 1:\n            raise AssertionError("story search returned no result rows")\n\n        proof["checks"]["storySearch"] = {\n            "characterCountText": count_text,\n            "resultRows": result_rows,\n            "runtime": runtime_info,\n        }\n\n        if not args.allow_title_runtime_error:\n            editor = context.new_page()\n            editor.on("pageerror", lambda error: proof["pageErrors"].append(f"editor: {error}"))\n            editor.goto(\n                f"{base}/story-title-editor.html?smoke={time.time_ns()}",\n                wait_until="domcontentloaded",\n                timeout=120000,\n            )\n            editor.wait_for_function(\n                "() => document.querySelectorAll(\'#titleEditorList tr[data-group-id]\').length >= 2100",\n                timeout=120000,\n            )\n            editor_rows = editor.locator("#titleEditorList tr[data-group-id]").count()\n            if editor_rows != 2166:\n                raise AssertionError(f"expected 2166 editor rows, got {editor_rows}")\n            proof["checks"]["titleEditor"] = {"rows": editor_rows}\n\n            index = context.new_page()\n            index.goto(f"{base}/?smoke={time.time_ns()}", wait_until="domcontentloaded", timeout=120000)\n            if index.locator(".navtext-container").count() != 0:\n                raise AssertionError("obsolete top title row is still present")\n            label = index.locator(\'label[for="menu-btn"]\')\n            label.click()\n            index.wait_for_function(\n                "() => document.querySelector(\'#menu-btn\')?.checked === true",\n                timeout=30000,\n            )\n            menu_box = index.locator(".header .menu").bounding_box()\n            if not menu_box or menu_box["width"] >= 700:\n                raise AssertionError(f"hamburger menu is unexpectedly wide: {menu_box}")\n            body_overflow = index.evaluate("getComputedStyle(document.body).overflow")\n            if body_overflow == "hidden":\n                raise AssertionError("hamburger menu locked document scrolling")\n            index.keyboard.press("Escape")\n            index.wait_for_function(\n                "() => document.querySelector(\'#menu-btn\')?.checked === false",\n                timeout=30000,\n            )\n            proof["checks"]["hamburger"] = {\n                "width": menu_box["width"],\n                "bodyOverflow": body_overflow,\n            }\n\n            for path, heading in (\n                ("attendance.html", "共同出场次数排行"),\n                ("runes.html", "魔女文翻译"),\n            ):\n                other = context.new_page()\n                other.goto(f"{base}/{path}?smoke={time.time_ns()}", wait_until="domcontentloaded", timeout=120000)\n                other.wait_for_selector("h1", timeout=60000)\n                actual = other.locator("h1").first.inner_text()\n                if heading not in actual:\n                    raise AssertionError(f"{path}: unexpected heading {actual!r}")\n                proof["checks"][path] = {"heading": actual}\n                other.close()\n\n        if proof["pageErrors"]:\n            raise AssertionError(f"page errors: {proof[\'pageErrors\']}")\n        if proof["sameOriginRequestFailures"] and not args.allow_title_runtime_error:\n            raise AssertionError(\n                f"same-origin request failures: {proof[\'sameOriginRequestFailures\'][:10]}"\n            )\n\n        proof["state"] = "pass"\n        context.close()\n        browser.close()\n\n    Path(args.output).write_text(\n        json.dumps(proof, ensure_ascii=False, indent=2) + "\\n",\n        encoding="utf-8",\n    )\n    print(json.dumps(proof, ensure_ascii=False, indent=2))\n\n\nif __name__ == "__main__":\n    main()\n'


def write_formal_data(
    groups_data: dict,
    parent_by_category: dict,
    suffix_by_source: dict,
    title_by_category: dict,
    total_children: int,
) -> None:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    authority = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "parentByCategory": parent_by_category,
        "suffixBySource": suffix_by_source,
        "titleByCategory": title_by_category,
    }
    dump_json(ROOT / "data/titles/authority.json", authority)
    dump_json(PUBLIC / "data/story-title-groups-v1.json", groups_data)

    formal_dir = PUBLIC / "data/titles"
    parents_value = {
        "schemaVersion": 1,
        "release": RELEASE,
        "parentByCategory": parent_by_category,
    }
    suffixes_value = {
        "schemaVersion": 1,
        "release": RELEASE,
        "suffixBySource": suffix_by_source,
    }
    titles_value = {
        "schemaVersion": 1,
        "release": RELEASE,
        "titleByCategory": title_by_category,
    }
    provenance_value = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "method": "lossless expansion of the production-proven V25 title payload",
    }
    for name, value in {
        "parents.json": parents_value,
        "suffixes.json": suffixes_value,
        "titles.json": titles_value,
        "provenance.json": provenance_value,
    }.items():
        dump_json(formal_dir / name, value)

    manifest = {
        "schemaVersion": 1,
        "release": RELEASE,
        "dataArchitecture": "plain-json",
        "generatedAt": generated_at,
        "sourceRelease": SOURCE_RELEASE,
        "files": {
            "parents": "parents.json",
            "suffixes": "suffixes.json",
            "titles": "titles.json",
            "provenance": "provenance.json",
        },
        "counts": {
            "groupCount": len(groups_data["groups"]),
            "childTitleCount": total_children,
            "parentOverrides": nested_count(parent_by_category),
            "translatedSuffixes": len(suffix_by_source),
            "mappedTitles": nested_count(title_by_category),
            "kanaInChineseDisplayFields": 0,
        },
    }
    manifest["sha256"] = {
        name: sha256(formal_dir / filename)
        for name, filename in manifest["files"].items()
    }
    dump_json(formal_dir / "manifest.json", manifest)

    dump_json(PUBLIC / "v26-build-marker.json", {
        "schemaVersion": 1,
        "release": RELEASE,
        "runtime": RUNTIME_RELEASE,
        "dataArchitecture": "plain-json",
        "groupCount": len(groups_data["groups"]),
        "childTitleCount": total_children,
        "mappedTitleCount": nested_count(title_by_category),
        "status": "built-and-locally-validated",
    })


def update_product_files() -> None:
    runtime_path = PUBLIC / "myfile/story-title-runtime-v2.js"
    runtime_path.write_text(V26_RUNTIME, encoding="utf-8")

    for relative in ("story.html", "story-title-editor.html"):
        path = PUBLIC / relative
        text = path.read_text(encoding="utf-8")
        text = re.sub(
            r'data-build="[^"]+"',
            f'data-build="{RELEASE}"',
            text,
            count=1,
        )
        text = re.sub(
            r"story-title-runtime-v2\.js\?v=[^\"]+",
            f"story-title-runtime-v2.js?v={CACHE_VERSION}",
            text,
        )
        if RELEASE not in text or CACHE_VERSION not in text:
            fail(f"failed to switch {relative} to V26")
        path.write_text(text, encoding="utf-8")

    index_path = PUBLIC / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index, removed = re.subn(
        r'\s*<div class="navtext-container">\s*<div class="navtext">.*?</div>\s*</div>\s*',
        "\n",
        index,
        count=1,
        flags=re.S,
    )
    if removed != 1 or 'class="navtext-container"' in index:
        fail("failed to physically remove the obsolete top title row")
    if "<title>魔法纪录·Magia Exedra 魔法少女称呼搜索</title>" not in index:
        fail("browser document title was accidentally removed")
    index = re.sub(
        r'\s*<script src="\./myfile/hamburger-menu-v23\.js[^"]*"></script>\s*',
        "\n",
        index,
    )
    menu_script = (
        f'  <script src="./myfile/hamburger-menu-v23.js?v={CACHE_VERSION}"></script>\n'
    )
    if "</body>" not in index:
        fail("index.html has no closing body tag")
    index = index.replace("</body>", menu_script + "</body>", 1)
    index = re.sub(
        r'<body data-build="[^"]+"',
        f'<body data-build="{RELEASE}"',
        index,
        count=1,
    )
    index_path.write_text(index, encoding="utf-8")

    menu_css_path = PUBLIC / "myfile/hamburgerMenu.css"
    menu_css = menu_css_path.read_text(encoding="utf-8")
    menu_css = re.sub(r"(?m)^\s*min-width:\s*[^;]+;\s*\n?", "", menu_css)
    if "width: max-content;" not in menu_css or "min-width:" in menu_css:
        fail("hamburger menu intrinsic-width rule is invalid")
    if "body:has(.menu-btn:checked)" not in menu_css or "overflow: visible;" not in menu_css:
        fail("hamburger menu scroll behavior is invalid")
    menu_css_path.write_text(menu_css, encoding="utf-8")


def write_maintained_files() -> None:
    scripts = ROOT / "scripts"
    scripts.mkdir(parents=True, exist_ok=True)
    (scripts / "build-title-data.py").write_text(BUILD_SCRIPT, encoding="utf-8")
    (scripts / "validate-production.py").write_text(VALIDATE_SCRIPT, encoding="utf-8")
    (scripts / "browser-smoke.py").write_text(BROWSER_SMOKE, encoding="utf-8")

    workflows = ROOT / ".github/workflows"
    if workflows.exists():
        shutil.rmtree(workflows)
    workflows.mkdir(parents=True)
    for name, content in {
        "ci.yml": CI_WORKFLOW,
        "production-verify.yml": PRODUCTION_WORKFLOW,
        "update-authoritative-titles.yml": UPDATE_WORKFLOW,
    }.items():
        (workflows / name).write_text(content, encoding="utf-8")

    gitignore = '''.vercel
__pycache__/
*.py[cod]
.DS_Store
Thumbs.db
.vscode/
.idea/
output.txt
*.tmp
*.bak
node_modules/
_sources/
.cache/
.pytest_cache/
coverage/
dist/
build/
*.log
.env
.env.*
'''
    (ROOT / ".gitignore").write_text(gitignore, encoding="utf-8")


def cleanup_repository() -> None:
    for directory in (
        ROOT / "node_modules",
        ROOT / ".automation",
        ROOT / "NEW",
        PUBLIC / "oldfile",
    ):
        if directory.exists():
            shutil.rmtree(directory)

    for pattern in (
        ".actions-probe-*",
        ".deploy-*",
        ".v22*",
        ".v23*",
        ".v24*",
        ".v25*",
        ".v26*",
    ):
        for path in ROOT.glob(pattern):
            if path.is_file():
                path.unlink()

    for path in (
        PUBLIC / "__acceptance.html",
        PUBLIC / "json_open_old.html",
        PUBLIC / "v23-build-marker.json",
        PUBLIC / "v25-build-marker.json",
        PUBLIC / "v25-production-proof.json",
        PUBLIC / "data/story-title-map.generated.json",
    ):
        if path.exists():
            path.unlink()

    for path in (PUBLIC / "data").glob("v25-title-delta.part-*.txt"):
        path.unlink()

    scripts = ROOT / "scripts"
    if scripts.exists():
        for path in scripts.iterdir():
            if not path.is_file():
                continue
            lower = path.name.lower()
            if path.name in {"build-title-data.py", "validate-production.py"}:
                continue
            if any(token in lower for token in ("v22", "v23", "v24", "v25", "v26")):
                path.unlink()

    reports = ROOT / "reports"
    if reports.exists():
        for path in list(reports.iterdir()):
            if path.name == "branch-cleanup-proof.json":
                continue
            if path.is_file() and (
                path.name.startswith(("v22-", "v23-", "v24-", "v25-", "v26-"))
                or path.name.startswith(("temporary-", "emergency-"))
            ):
                path.unlink()

    self_path = Path(__file__).resolve()
    if self_path.exists():
        self_path.unlink()


def main() -> None:
    payload = decode_v25_payload()
    groups_data = load_json(PUBLIC / "data/story-title-groups-v1.json")
    parent_by_category, suffix_by_source, title_by_category, total_children = reconstruct_title_data(
        groups_data, payload
    )
    write_formal_data(
        groups_data,
        parent_by_category,
        suffix_by_source,
        title_by_category,
        total_children,
    )
    update_product_files()
    cleanup_repository()
    write_maintained_files()

    run(sys.executable, "scripts/build-title-data.py", "--check")
    run(sys.executable, "scripts/validate-production.py")
    run("node", "--check", "public/myfile/story-title-runtime-v2.js")
    run("node", "--check", "public/myfile/story-app-v7.js")
    run("node", "--check", "public/myfile/story-title-editor-v2.js")

    print(json.dumps({
        "release": RELEASE,
        "groups": len(groups_data["groups"]),
        "children": total_children,
        "mappedTitles": nested_count(title_by_category),
        "parentOverrides": nested_count(parent_by_category),
        "translatedSuffixes": len(suffix_by_source),
        "workflows": sorted(path.name for path in (ROOT / ".github/workflows").glob("*.yml")),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
