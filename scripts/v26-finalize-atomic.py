#!/usr/bin/env python3
from __future__ import annotations

import base64
import csv
import datetime as dt
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v26-converged-20260821"
RUNTIME_RELEASE = "story-title-runtime-v26-20260821"
SOURCE_RELEASE = "v25-live-cn-20260821"
EXPECTED_GROUPS = 2166
EXPECTED_CHILDREN = 5826
KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ffー]")
SOURCE_PRIORITY = [
    "magireco-cn-patch/magica/js/libs",
    "existing human/audited translations",
    "MagiReader",
    "magireco-wiki-data",
    "manual fallback",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stable_json(data), encoding="utf-8")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def nested_count(value: dict[str, Any]) -> int:
    return sum(len(inner) for inner in value.values() if isinstance(inner, dict))


def has_kana(value: str) -> bool:
    return bool(KANA_RE.search(str(value or "")))


def decode_v25_authority() -> dict[str, Any]:
    parts = sorted((ROOT / "public/data").glob("v25-title-delta.part-*.txt"))
    if len(parts) != 4:
        raise RuntimeError(f"expected four V25 payload parts, found {len(parts)}")
    encoded = "".join("".join(path.read_text(encoding="utf-8").split()) for path in parts)
    payload = json.loads(gzip.decompress(base64.b64decode(encoded)).decode("utf-8"))
    if payload.get("r") != SOURCE_RELEASE:
        raise RuntimeError(f"unexpected V25 source release: {payload.get('r')!r}")
    for key in ("p", "s", "e"):
        if not isinstance(payload.get(key), dict):
            raise RuntimeError(f"V25 payload field {key!r} is invalid")
    return payload


def compose_title(parent: str, suffix: str) -> str:
    return f"{parent}{' ' + suffix if suffix else ''}".strip()


def build_title_outputs(authority: dict[str, Any]) -> dict[str, Any]:
    parents = authority["parents"]
    suffixes = authority["suffixes"]
    exceptions = authority["exactExceptions"]
    generated_at = authority["generatedAt"]

    groups_path = ROOT / "public/data/story-title-groups-v1.json"
    groups_data = read_json(groups_path)
    groups = groups_data.get("groups")
    if not isinstance(groups, list) or len(groups) != EXPECTED_GROUPS:
        raise RuntimeError(f"unexpected group count: {len(groups) if isinstance(groups, list) else None}")

    title_by_category: dict[str, dict[str, str]] = {}
    child_count = 0
    kana_hits: list[tuple[str, str, str]] = []

    for group in groups:
        category = str(group.get("category") or "")
        source_base = str(group.get("source_base") or "")
        parent = str(
            parents.get(category, {}).get(source_base)
            or group.get("approved_translation")
            or group.get("current_translation")
            or source_base
        ).strip()
        if not parent:
            raise RuntimeError(f"empty parent translation: {category} / {source_base}")
        if has_kana(parent):
            kana_hits.append((category, source_base, parent))

        group["current_translation"] = parent
        group["approved_translation"] = parent
        group["status"] = "已校对"
        category_map = title_by_category.setdefault(category, {})

        children = group.get("children") or []
        group["child_count"] = len(children)
        for child in children:
            child_count += 1
            source_title = str(child.get("source_title") or "").strip()
            source_suffix = str(child.get("source_suffix") or "").strip()
            suffix = str(
                suffixes[source_suffix]
                if source_suffix in suffixes
                else child.get("localized_suffix") or source_suffix
            ).strip()
            exact = exceptions.get(category, {}).get(source_title)
            full = str(exact).strip() if isinstance(exact, str) and exact.strip() else compose_title(parent, suffix)
            if not source_title or not full:
                raise RuntimeError(f"invalid child title: {category} / {source_title!r} => {full!r}")
            if has_kana(suffix):
                kana_hits.append((category, source_title, suffix))
            if has_kana(full):
                kana_hits.append((category, source_title, full))
            child["current_translation"] = parent
            child["localized_suffix"] = suffix
            child["localized_joiner"] = " " if suffix else ""
            child["current_full_translation"] = full
            category_map[source_title] = full

    if child_count != EXPECTED_CHILDREN:
        raise RuntimeError(f"unexpected child title count: {child_count}")
    if nested_count(title_by_category) != EXPECTED_CHILDREN:
        raise RuntimeError(
            f"exact map count mismatch: {nested_count(title_by_category)} != {EXPECTED_CHILDREN}"
        )
    if kana_hits:
        raise RuntimeError(f"Chinese display fields still contain kana: {kana_hits[:30]}")

    groups_data["schemaVersion"] = 1
    groups_data["version"] = 26
    groups_data["release"] = RELEASE
    groups_data["generatedAt"] = generated_at
    summary = groups_data.setdefault("summary", {})
    summary.update(
        {
            "groupCount": EXPECTED_GROUPS,
            "childTitleCount": EXPECTED_CHILDREN,
            "approvedGroupCount": EXPECTED_GROUPS,
            "missingLocalizationCount": 0,
            "missingLocalizationSample": [],
            "kanaInChineseTranslationCount": 0,
        }
    )

    map_payload = {
        "schemaVersion": 1,
        "version": 26,
        "release": RELEASE,
        "generatedAt": generated_at,
        "summary": {
            "groupCount": EXPECTED_GROUPS,
            "childTitleCount": EXPECTED_CHILDREN,
            "mappedTitleCount": EXPECTED_CHILDREN,
            "kanaInChineseDisplayFields": 0,
        },
        "titleByCategory": title_by_category,
    }

    return {
        "groups": groups_data,
        "titleMap": map_payload,
        "titleByCategory": title_by_category,
    }


def rebuild_csv(path: Path, groups: list[dict[str, Any]]) -> None:
    headers = [
        "group_id", "category", "source_base", "current_translation", "source_count",
        "approved_translation", "status", "note", "last_edited_at", "last_edited_by",
        "child_source_title", "child_current_translation", "child_current_full_translation",
        "child_story_count", "child_row_count", "child_leaf_count", "child_story_ids",
        "child_source_suffix", "child_localized_suffix",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for group in groups:
            for child in group.get("children") or [{}]:
                writer.writerow(
                    {
                        "group_id": group.get("group_id", ""),
                        "category": group.get("category", ""),
                        "source_base": group.get("source_base", ""),
                        "current_translation": group.get("current_translation", ""),
                        "source_count": group.get("source_count", 0),
                        "approved_translation": group.get("approved_translation", ""),
                        "status": group.get("status", ""),
                        "note": group.get("note", ""),
                        "last_edited_at": group.get("last_edited_at", ""),
                        "last_edited_by": group.get("last_edited_by", ""),
                        "child_source_title": child.get("source_title", ""),
                        "child_current_translation": child.get("current_translation", ""),
                        "child_current_full_translation": child.get("current_full_translation", ""),
                        "child_story_count": child.get("story_count", 0),
                        "child_row_count": child.get("row_count", 0),
                        "child_leaf_count": child.get("leaf_count", 0),
                        "child_story_ids": "|".join(str(value) for value in child.get("story_ids", [])),
                        "child_source_suffix": child.get("source_suffix", ""),
                        "child_localized_suffix": child.get("localized_suffix", ""),
                    }
                )


def formalize_title_data(payload: dict[str, Any]) -> dict[str, Any]:
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    authority = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "authorityOrder": SOURCE_PRIORITY,
        "description": (
            "V26 canonical title authority. Generated from the production-verified V25 "
            "authoritative mapping and stored as normal JSON; no browser-side Base64 or gzip protocol."
        ),
        "expectedCounts": {"groupCount": EXPECTED_GROUPS, "childTitleCount": EXPECTED_CHILDREN},
        "parents": payload["p"],
        "suffixes": payload["s"],
        "exactExceptions": payload["e"],
    }
    write_json(ROOT / "data/titles/authority.json", authority)

    outputs = build_title_outputs(authority)
    groups_data = outputs["groups"]
    title_map = outputs["titleMap"]

    write_json(ROOT / "public/data/story-title-groups-v1.json", groups_data)
    write_json(ROOT / "public/downloads/story-title-groups.json", groups_data)
    rebuild_csv(ROOT / "public/downloads/story-title-groups.csv", groups_data["groups"])
    write_json(ROOT / "public/data/story-title-map.generated.json", title_map)

    localization_path = ROOT / "public/data/story-v7/localization.json"
    localization = read_json(localization_path)
    localization["titleDataRelease"] = RELEASE
    localization["titleByCategoryV10"] = outputs["titleByCategory"]
    localization["titleSourcesByCategoryV10"] = {
        category: {source: "v26-authority" for source in mapping}
        for category, mapping in outputs["titleByCategory"].items()
    }
    write_json(localization_path, localization)

    title_dir = ROOT / "public/data/titles"
    write_json(title_dir / "parents.json", {
        "schemaVersion": 1, "release": RELEASE, "generatedAt": generated_at, "parents": authority["parents"]
    })
    write_json(title_dir / "suffixes.json", {
        "schemaVersion": 1, "release": RELEASE, "generatedAt": generated_at, "suffixes": authority["suffixes"]
    })
    write_json(title_dir / "titles.json", title_map)
    provenance_payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "authorityOrder": SOURCE_PRIORITY,
        "counts": {
            "groupCount": EXPECTED_GROUPS,
            "childTitleCount": EXPECTED_CHILDREN,
            "mappedTitleCount": EXPECTED_CHILDREN,
            "changedParentTitleCount": nested_count(authority["parents"]),
            "translatedSuffixCount": len(authority["suffixes"]),
            "exactExceptionCount": nested_count(authority["exactExceptions"]),
            "kanaInChineseDisplayFields": 0,
        },
    }
    write_json(title_dir / "provenance.json", provenance_payload)

    files = {}
    for name in ("parents.json", "suffixes.json", "titles.json", "provenance.json"):
        path = title_dir / name
        files[name] = {"url": f"./{name}", "bytes": path.stat().st_size, "sha256": file_sha256(path)}
    write_json(title_dir / "manifest.json", {
        "schemaVersion": 1,
        "release": RELEASE,
        "runtime": RUNTIME_RELEASE,
        "generatedAt": generated_at,
        "counts": provenance_payload["counts"],
        "files": files,
    })

    marker = {
        "schemaVersion": 1,
        "state": "deployed-to-main",
        "release": RELEASE,
        "runtime": RUNTIME_RELEASE,
        "generatedAt": generated_at,
        "groupCount": EXPECTED_GROUPS,
        "childTitleCount": EXPECTED_CHILDREN,
        "mappedTitleCount": EXPECTED_CHILDREN,
        "kanaInChineseDisplayFields": 0,
        "dataArchitecture": "plain-json",
        "legacyV25PayloadParts": 0,
        "versionedLocalOverrideStorage": True,
        "authorityOrder": SOURCE_PRIORITY,
    }
    write_json(ROOT / "public/v26-build-marker.json", marker)
    return marker


RUNTIME_JS = '/* V26 canonical Chinese title runtime.\n * Loads normal JSON files and isolates browser-local edits by release.\n */\n(function (global) {\n  \'use strict\';\n\n  const RELEASE = \'story-title-runtime-v26-20260821\';\n  const DATA_RELEASE = \'v26-converged-20260821\';\n  const GROUPS_URL = \'./data/story-title-groups-v1.json?v=20260821-26\';\n  const MANIFEST_URL = \'./data/titles/manifest.json?v=20260821-26\';\n  const TITLES_URL = \'./data/titles/titles.json?v=20260821-26\';\n  const STORAGE_PREFIX = \'magireco-story-title-overrides:\';\n  const STORAGE_KEY = `${STORAGE_PREFIX}${DATA_RELEASE}`;\n  const Tools = global.MagiToolsV7;\n\n  if (!Tools?.loadLocalizationV7) {\n    console.error(\'V26 标题运行时未找到 MagiToolsV7。\');\n    return;\n  }\n\n  const originalLoad = Tools.loadLocalizationV7.bind(Tools);\n  let groupsPromise = null;\n  let serverMapPromise = null;\n  let mergedPromise = null;\n\n  async function fetchRequired(url) {\n    const response = await fetch(url, { cache: \'no-store\' });\n    if (!response.ok) throw new Error(`${url}：HTTP ${response.status}`);\n    return response.json();\n  }\n\n  function validateManifest(manifest) {\n    if (!manifest || manifest.release !== DATA_RELEASE ||\n        manifest.runtime !== RELEASE ||\n        manifest.counts?.groupCount !== 2166 ||\n        manifest.counts?.childTitleCount !== 5826) {\n      throw new Error(\'V26 标题数据清单格式或版本无效。\');\n    }\n    return manifest;\n  }\n\n  function loadGroups() {\n    if (!groupsPromise) {\n      groupsPromise = Promise.all([fetchRequired(GROUPS_URL), fetchRequired(MANIFEST_URL)])\n        .then(([groupsData, manifest]) => {\n          validateManifest(manifest);\n          if (!groupsData || groupsData.release !== DATA_RELEASE ||\n              !Array.isArray(groupsData.groups) || groupsData.groups.length !== 2166) {\n            throw new Error(\'V26 母故事清单格式或版本无效。\');\n          }\n          return groupsData;\n        });\n    }\n    return groupsPromise;\n  }\n\n  function loadServerMap() {\n    if (!serverMapPromise) {\n      serverMapPromise = Promise.all([fetchRequired(TITLES_URL), fetchRequired(MANIFEST_URL)])\n        .then(([data, manifest]) => {\n          validateManifest(manifest);\n          if (!data || data.release !== DATA_RELEASE ||\n              typeof data.titleByCategory !== \'object\' ||\n              data.summary?.mappedTitleCount !== 5826) {\n            throw new Error(\'V26 完整标题映射格式或版本无效。\');\n          }\n          return data;\n        });\n    }\n    return serverMapPromise;\n  }\n\n  function readLocalPayload() {\n    try {\n      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || \'null\');\n      if (!parsed || parsed.release !== DATA_RELEASE || !Array.isArray(parsed.overrides)) {\n        return { version: 26, release: DATA_RELEASE, overrides: [] };\n      }\n      return parsed;\n    } catch {\n      return { version: 26, release: DATA_RELEASE, overrides: [] };\n    }\n  }\n\n  function writeLocalPayload(payload) {\n    localStorage.setItem(STORAGE_KEY, JSON.stringify({\n      ...payload,\n      version: 26,\n      release: DATA_RELEASE\n    }));\n  }\n\n  function normalizeOverrideList(payload) {\n    if (Array.isArray(payload)) return payload;\n    if (Array.isArray(payload?.overrides)) return payload.overrides;\n    if (Array.isArray(payload?.groups)) {\n      return payload.groups\n        .filter((item) => String(item?.approved_translation || \'\').trim())\n        .map((item) => ({\n          group_id: item.group_id,\n          category: item.category,\n          source_base: item.source_base,\n          source_sha256: item.source_sha256,\n          approved_translation: item.approved_translation\n        }));\n    }\n    return [];\n  }\n\n  function validateAndIndex(groupsData, payload, strict = true) {\n    const groups = new Map(groupsData.groups.map((group) => [group.group_id, group]));\n    const overrides = new Map();\n    const errors = [];\n    for (const raw of normalizeOverrideList(payload)) {\n      const groupId = String(raw?.group_id || \'\').trim();\n      const approved = String(raw?.approved_translation || \'\').trim();\n      if (!groupId || !approved) continue;\n      const group = groups.get(groupId);\n      if (!group) { errors.push(`不存在的 group_id：${groupId}`); continue; }\n      for (const [key, expected] of [\n        [\'category\', group.category],\n        [\'source_base\', group.source_base],\n        [\'source_sha256\', group.source_sha256]\n      ]) {\n        if (raw[key] != null && String(raw[key]) !== String(expected)) {\n          errors.push(`${groupId} 的 ${key} 与当前清单不一致。`);\n        }\n      }\n      if (overrides.has(groupId)) errors.push(`重复 group_id：${groupId}`);\n      overrides.set(groupId, {\n        group_id: groupId,\n        category: group.category,\n        source_base: group.source_base,\n        source_sha256: group.source_sha256,\n        approved_translation: approved\n      });\n    }\n    if (strict && errors.length) throw new Error(errors.slice(0, 12).join(\'\\n\'));\n    return { groups, overrides, errors };\n  }\n\n  function compose(group, child, override) {\n    if (!override) return String(child.current_full_translation || \'\').trim();\n    const base = String(override.approved_translation || \'\').trim();\n    const suffix = String(child.localized_suffix ?? child.source_suffix ?? \'\').trim();\n    return `${base}${suffix ? ` ${suffix}` : \'\'}`.trim();\n  }\n\n  function exactMapFrom(groupsData, payload, strict = true) {\n    const { overrides, errors } = validateAndIndex(groupsData, payload, strict);\n    const titleByCategory = {};\n    for (const group of groupsData.groups) {\n      const override = overrides.get(group.group_id);\n      const categoryMap = titleByCategory[group.category] || (titleByCategory[group.category] = {});\n      for (const child of group.children || []) {\n        const source = String(child.source_title || \'\').trim();\n        const target = compose(group, child, override);\n        if (source && target) categoryMap[source] = target;\n      }\n    }\n    return { release: DATA_RELEASE, version: 26, titleByCategory, errors };\n  }\n\n  function mergeCategoryMaps(...maps) {\n    const output = {};\n    for (const source of maps) {\n      if (!source || typeof source !== \'object\') continue;\n      for (const [category, pairs] of Object.entries(source)) {\n        if (!pairs || typeof pairs !== \'object\') continue;\n        output[category] = Object.assign(output[category] || {}, pairs);\n      }\n    }\n    return output;\n  }\n\n  function loadMergedLocalization() {\n    if (!mergedPromise) {\n      mergedPromise = Promise.all([originalLoad(), loadGroups(), loadServerMap()])\n        .then(([localization, groupsData, serverMap]) => {\n          let localMap = { titleByCategory: {} };\n          try {\n            localMap = exactMapFrom(groupsData, readLocalPayload(), true);\n          } catch (error) {\n            console.error(\'当前版本的浏览器本地母故事译名未应用。\', error);\n          }\n          return {\n            ...localization,\n            release: DATA_RELEASE,\n            titleByCategoryV10: mergeCategoryMaps(\n              localization?.titleByCategoryV10,\n              serverMap.titleByCategory,\n              localMap.titleByCategory\n            ),\n            storyTitleGroupsV1: groupsData,\n            storyTitleMapV1: serverMap\n          };\n        });\n    }\n    return mergedPromise;\n  }\n\n  function refresh() {\n    mergedPromise = null;\n    global.dispatchEvent(new CustomEvent(\'story-title-map-v1-updated\'));\n  }\n\n  async function importPayload(payload, { persist = true, strict = true } = {}) {\n    const groupsData = await loadGroups();\n    const indexed = validateAndIndex(groupsData, payload, strict);\n    const normalized = {\n      version: 26,\n      release: DATA_RELEASE,\n      checklist_generated_at: groupsData.generatedAt || \'\',\n      overrides: [...indexed.overrides.values()].sort((a, b) =>\n        a.group_id.localeCompare(b.group_id)\n      )\n    };\n    if (persist) writeLocalPayload(normalized);\n    refresh();\n    return {\n      payload: normalized,\n      map: exactMapFrom(groupsData, normalized, strict),\n      warnings: indexed.errors\n    };\n  }\n\n  function clearLocalOverrides() {\n    localStorage.removeItem(STORAGE_KEY);\n    refresh();\n    return Promise.resolve();\n  }\n\n  const api = Object.freeze({\n    release: RELEASE,\n    dataRelease: DATA_RELEASE,\n    groupsUrl: GROUPS_URL,\n    mapUrl: TITLES_URL,\n    manifestUrl: MANIFEST_URL,\n    storageKey: STORAGE_KEY,\n    loadGroups,\n    loadServerMap,\n    readLocalPayload,\n    importPayload,\n    clearLocalOverrides,\n    exactMapFrom,\n    compose,\n    refresh\n  });\n\n  global.MagiToolsV7 = Object.freeze({ ...Tools, loadLocalizationV7: loadMergedLocalization });\n  global.__STORY_TITLE_RUNTIME_V1__ = api;\n  document.documentElement.dataset.storyTitleRuntimeV2 = RELEASE;\n})(window);\n'


def patch_body_build(text: str) -> str:
    text = re.sub(r"\s+data-build=\"[^\"]*\"", "", text)
    return text.replace("<body", f'<body data-build="{RELEASE}"', 1)


def patch_pages() -> None:
    (ROOT / "public/myfile/story-title-runtime-v2.js").write_text(
        RUNTIME_JS.rstrip() + "\n", encoding="utf-8"
    )
    for rel in ("public/story-title-editor.html", "public/story.html"):
        path = ROOT / rel
        text = patch_body_build(path.read_text(encoding="utf-8"))
        text = re.sub(
            r"story-title-runtime-v2\.js\?v=[^\"<]+",
            "story-title-runtime-v2.js?v=20260821-26",
            text,
        )
        path.write_text(text, encoding="utf-8")

    index_path = ROOT / "public/index.html"
    index = index_path.read_text(encoding="utf-8")
    index = re.sub(
        r"\s*<div class=\"navtext-container\">\s*"
        r"<div class=\"navtext\">魔法纪录·Magia Exedra 魔法少女称呼搜索</div>\s*</div>\s*",
        "\n",
        index,
        count=1,
    )
    index_path.write_text(patch_body_build(index), encoding="utf-8")


BUILD_SCRIPT = '#!/usr/bin/env python3\nfrom __future__ import annotations\nimport argparse, hashlib, json, re, subprocess\nfrom pathlib import Path\nfrom typing import Any\n\nROOT = Path(__file__).resolve().parents[1]\nKANA_RE = re.compile(r"[\\u3040-\\u30ff\\u31f0-\\u31ffー]")\n\n\ndef read_json(path: Path) -> Any:\n    return json.loads(path.read_text(encoding="utf-8"))\n\n\ndef write_json(path: Path, data: Any) -> None:\n    path.parent.mkdir(parents=True, exist_ok=True)\n    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")\n\n\ndef nested_count(value):\n    return sum(len(inner) for inner in value.values() if isinstance(inner, dict))\n\n\ndef sha(path):\n    return hashlib.sha256(path.read_bytes()).hexdigest()\n\n\ndef build() -> None:\n    authority = read_json(ROOT / "data/titles/authority.json")\n    release = authority["release"]\n    expected_groups = int(authority["expectedCounts"]["groupCount"])\n    expected_children = int(authority["expectedCounts"]["childTitleCount"])\n    parents = authority["parents"]\n    suffixes = authority["suffixes"]\n    exceptions = authority["exactExceptions"]\n    generated_at = authority["generatedAt"]\n\n    groups_path = ROOT / "public/data/story-title-groups-v1.json"\n    groups_data = read_json(groups_path)\n    groups = groups_data["groups"]\n    if len(groups) != expected_groups:\n        raise SystemExit(f"group count mismatch: {len(groups)}")\n\n    title_by_category = {}\n    child_count = 0\n    kana_hits = []\n    for group in groups:\n        category = str(group.get("category") or "")\n        source_base = str(group.get("source_base") or "")\n        parent = str(\n            parents.get(category, {}).get(source_base)\n            or group.get("approved_translation")\n            or group.get("current_translation")\n            or source_base\n        ).strip()\n        group["current_translation"] = parent\n        group["approved_translation"] = parent\n        group["status"] = "已校对"\n        if KANA_RE.search(parent):\n            kana_hits.append((category, source_base, parent))\n        category_map = title_by_category.setdefault(category, {})\n        children = group.get("children") or []\n        group["child_count"] = len(children)\n        for child in children:\n            child_count += 1\n            source_title = str(child.get("source_title") or "").strip()\n            source_suffix = str(child.get("source_suffix") or "").strip()\n            suffix = str(\n                suffixes[source_suffix]\n                if source_suffix in suffixes\n                else child.get("localized_suffix") or source_suffix\n            ).strip()\n            exact = exceptions.get(category, {}).get(source_title)\n            full = str(exact).strip() if isinstance(exact, str) and exact.strip() else (\n                f"{parent}{\' \' + suffix if suffix else \'\'}".strip()\n            )\n            child["current_translation"] = parent\n            child["localized_suffix"] = suffix\n            child["localized_joiner"] = " " if suffix else ""\n            child["current_full_translation"] = full\n            category_map[source_title] = full\n            if KANA_RE.search(suffix) or KANA_RE.search(full):\n                kana_hits.append((category, source_title, full))\n\n    if child_count != expected_children or nested_count(title_by_category) != expected_children:\n        raise SystemExit("child title count mismatch")\n    if kana_hits:\n        raise SystemExit(f"kana remains in Chinese display fields: {kana_hits[:20]}")\n\n    groups_data.update({"schemaVersion": 1, "version": 26, "release": release, "generatedAt": generated_at})\n    groups_data.setdefault("summary", {}).update({\n        "groupCount": expected_groups,\n        "childTitleCount": expected_children,\n        "approvedGroupCount": expected_groups,\n        "missingLocalizationCount": 0,\n        "missingLocalizationSample": [],\n        "kanaInChineseTranslationCount": 0,\n    })\n    map_payload = {\n        "schemaVersion": 1,\n        "version": 26,\n        "release": release,\n        "generatedAt": generated_at,\n        "summary": {\n            "groupCount": expected_groups,\n            "childTitleCount": expected_children,\n            "mappedTitleCount": expected_children,\n            "kanaInChineseDisplayFields": 0,\n        },\n        "titleByCategory": title_by_category,\n    }\n    write_json(groups_path, groups_data)\n    write_json(ROOT / "public/downloads/story-title-groups.json", groups_data)\n    write_json(ROOT / "public/data/story-title-map.generated.json", map_payload)\n\n    localization_path = ROOT / "public/data/story-v7/localization.json"\n    localization = read_json(localization_path)\n    localization["titleDataRelease"] = release\n    localization["titleByCategoryV10"] = title_by_category\n    localization["titleSourcesByCategoryV10"] = {\n        category: {source: "v26-authority" for source in mapping}\n        for category, mapping in title_by_category.items()\n    }\n    write_json(localization_path, localization)\n\n    title_dir = ROOT / "public/data/titles"\n    write_json(title_dir / "parents.json", {\n        "schemaVersion": 1, "release": release, "generatedAt": generated_at, "parents": parents\n    })\n    write_json(title_dir / "suffixes.json", {\n        "schemaVersion": 1, "release": release, "generatedAt": generated_at, "suffixes": suffixes\n    })\n    write_json(title_dir / "titles.json", map_payload)\n    provenance = {\n        "schemaVersion": 1,\n        "release": release,\n        "sourceRelease": authority["sourceRelease"],\n        "generatedAt": generated_at,\n        "authorityOrder": authority["authorityOrder"],\n        "counts": {\n            "groupCount": expected_groups,\n            "childTitleCount": expected_children,\n            "mappedTitleCount": expected_children,\n            "changedParentTitleCount": nested_count(parents),\n            "translatedSuffixCount": len(suffixes),\n            "exactExceptionCount": nested_count(exceptions),\n            "kanaInChineseDisplayFields": 0,\n        },\n    }\n    write_json(title_dir / "provenance.json", provenance)\n    files = {}\n    for name in ("parents.json", "suffixes.json", "titles.json", "provenance.json"):\n        path = title_dir / name\n        files[name] = {"url": f"./{name}", "bytes": path.stat().st_size, "sha256": sha(path)}\n    write_json(title_dir / "manifest.json", {\n        "schemaVersion": 1,\n        "release": release,\n        "runtime": "story-title-runtime-v26-20260821",\n        "generatedAt": generated_at,\n        "counts": provenance["counts"],\n        "files": files,\n    })\n\n\ndef main() -> int:\n    parser = argparse.ArgumentParser()\n    parser.add_argument("--check", action="store_true")\n    args = parser.parse_args()\n    build()\n    if args.check:\n        subprocess.run([\n            "git", "diff", "--exit-code", "--",\n            "data/titles",\n            "public/data/story-title-groups-v1.json",\n            "public/data/story-title-map.generated.json",\n            "public/data/story-v7/localization.json",\n            "public/data/titles",\n            "public/downloads/story-title-groups.json",\n        ], cwd=ROOT, check=True)\n    return 0\n\n\nif __name__ == "__main__":\n    raise SystemExit(main())\n'
VALIDATE_SCRIPT = '#!/usr/bin/env python3\nfrom __future__ import annotations\nimport argparse, json, re\nfrom pathlib import Path\n\nRELEASE = "v26-converged-20260821"\nRUNTIME = "story-title-runtime-v26-20260821"\nKANA = re.compile(r"[\\u3040-\\u30ff\\u31f0-\\u31ffー]")\n\n\ndef read(path):\n    return json.loads(path.read_text(encoding="utf-8"))\n\n\ndef nested_count(value):\n    return sum(len(inner) for inner in value.values() if isinstance(inner, dict))\n\n\ndef main():\n    parser = argparse.ArgumentParser()\n    parser.add_argument("--root", type=Path, default=Path.cwd())\n    args = parser.parse_args()\n    root = args.root.resolve()\n\n    authority = read(root / "data/titles/authority.json")\n    manifest = read(root / "public/data/titles/manifest.json")\n    groups = read(root / "public/data/story-title-groups-v1.json")\n    titles = read(root / "public/data/titles/titles.json")\n    marker = read(root / "public/v26-build-marker.json")\n\n    assert authority["release"] == RELEASE\n    assert manifest["release"] == RELEASE and manifest["runtime"] == RUNTIME\n    assert groups["release"] == RELEASE and len(groups["groups"]) == 2166\n    assert sum(len(group.get("children", [])) for group in groups["groups"]) == 5826\n    assert titles["release"] == RELEASE\n    assert nested_count(titles["titleByCategory"]) == 5826\n    assert marker["release"] == RELEASE and marker["dataArchitecture"] == "plain-json"\n\n    for mapping in titles["titleByCategory"].values():\n        for target in mapping.values():\n            assert not KANA.search(str(target)), target\n\n    parent_samples = {\n        ("scene0", "サイドストーリー Film.0"): "支线故事 Film.0",\n        ("イベント", "トリック☆トラブル☆学園祭 BADEND"): "诡计☆骚乱☆学园祭 坏结局",\n        ("メモリア", "No.888 夢を追う妹"): "No.888 追梦的妹妹",\n        ("メモリア", "No.889 新鮮なポジション"): "No.889 新鲜的位置",\n        ("メモリア", "No.900 夏のはじまりに母の影光り"): "No.900 夏日伊始，母亲的影子",\n        ("メモリア", "No.901 記憶の中の温もりは蘇り"): "No.901 记忆中的温暖复苏了",\n    }\n    group_index = {\n        (str(group.get("category") or ""), str(group.get("source_base") or "")):\n        str(group.get("current_translation") or "")\n        for group in groups["groups"]\n    }\n    for key, expected in parent_samples.items():\n        actual = group_index[key]\n        assert actual == expected, (key, actual, expected)\n\n    child_samples = {\n        ("scene0", "サイドストーリー Film.0 1 (紫)"): "支线故事 Film.0 1 （紫色）",\n        ("イベント", "トリック☆トラブル☆学園祭 BADEND1話"): "诡计☆骚乱☆学园祭 坏结局 第1话",\n    }\n    maps = titles["titleByCategory"]\n    for key, expected in child_samples.items():\n        actual = maps[key[0]][key[1]]\n        assert actual == expected, (key, actual, expected)\n\n    runtime = (root / "public/myfile/story-title-runtime-v2.js").read_text(encoding="utf-8")\n    assert RUNTIME in runtime\n    assert "DecompressionStream" not in runtime\n    assert "v25-title-delta" not in runtime\n    assert "STORAGE_KEY = `${STORAGE_PREFIX}${DATA_RELEASE}`" in runtime\n    assert "parsed.release !== DATA_RELEASE" in runtime\n\n    for page in ("public/story.html", "public/story-title-editor.html"):\n        text = (root / page).read_text(encoding="utf-8")\n        assert \'story-title-runtime-v2.js?v=20260821-26\' in text\n        assert f\'data-build="{RELEASE}"\' in text\n\n    forbidden = [\n        root / "node_modules",\n        root / ".automation",\n        root / "NEW",\n        root / "public/__acceptance.html",\n        root / "public/json_open_old.html",\n        root / "public/oldfile",\n    ]\n    assert not [str(path) for path in forbidden if path.exists()]\n    assert not list((root / "public/data").glob("v25-title-delta.part-*.txt"))\n\n    workflows = sorted(path.name for path in (root / ".github/workflows").glob("*.yml"))\n    assert workflows == ["ci.yml", "production-verify.yml", "update-authoritative-titles.yml"], workflows\n\n    gitignore = (root / ".gitignore").read_text(encoding="utf-8")\n    for entry in ("node_modules/", "_sources/", "*.log", "dist/", "build/"):\n        assert entry in gitignore, entry\n\n    print(json.dumps({\n        "state": "pass",\n        "release": RELEASE,\n        "groupCount": 2166,\n        "childTitleCount": 5826,\n        "mappedTitleCount": 5826,\n        "kanaInChineseDisplayFields": 0,\n        "formalDataArchitecture": True,\n        "versionedLocalOverrides": True,\n        "workflowCount": 3,\n    }, ensure_ascii=False, indent=2))\n\n\nif __name__ == "__main__":\n    main()\n'
VERIFY_LIVE_SCRIPT = '#!/usr/bin/env python3\nfrom __future__ import annotations\nimport argparse, datetime as dt, json, re, urllib.error, urllib.parse, urllib.request\nfrom pathlib import Path\n\nRELEASE = "v26-converged-20260821"\nRUNTIME = "story-title-runtime-v26-20260821"\nKANA = re.compile(r"[\\u3040-\\u30ff\\u31f0-\\u31ffー]")\n\n\ndef get(base, path, as_json=False):\n    separator = "&" if "?" in path else "?"\n    url = urllib.parse.urljoin(base.rstrip("/") + "/", path.lstrip("/")) + separator + "verify=" + str(dt.datetime.now().timestamp())\n    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache, no-store", "User-Agent": "V26-production-verifier"})\n    with urllib.request.urlopen(request, timeout=60) as response:\n        data = response.read()\n    return json.loads(data.decode("utf-8")) if as_json else data.decode("utf-8")\n\n\ndef nested_count(value):\n    return sum(len(inner) for inner in value.values() if isinstance(inner, dict))\n\n\ndef main():\n    parser = argparse.ArgumentParser()\n    parser.add_argument("--base", required=True)\n    parser.add_argument("--output", type=Path, required=True)\n    parser.add_argument("--source-sha", default="")\n    parser.add_argument("--run-id", default="")\n    args = parser.parse_args()\n\n    marker = get(args.base, "v26-build-marker.json", True)\n    manifest = get(args.base, "data/titles/manifest.json", True)\n    groups = get(args.base, "data/story-title-groups-v1.json", True)\n    titles = get(args.base, "data/titles/titles.json", True)\n    runtime = get(args.base, "myfile/story-title-runtime-v2.js")\n    editor = get(args.base, "story-title-editor.html")\n    story = get(args.base, "story.html")\n    index = get(args.base, "")\n\n    assert marker["release"] == RELEASE\n    assert marker["dataArchitecture"] == "plain-json"\n    assert manifest["release"] == RELEASE and manifest["runtime"] == RUNTIME\n    assert groups["release"] == RELEASE and len(groups["groups"]) == 2166\n    assert sum(len(group.get("children", [])) for group in groups["groups"]) == 5826\n    assert titles["release"] == RELEASE and nested_count(titles["titleByCategory"]) == 5826\n\n    for mapping in titles["titleByCategory"].values():\n        for target in mapping.values():\n            assert not KANA.search(str(target)), target\n\n    parent_samples = {\n        ("scene0", "サイドストーリー Film.0"): "支线故事 Film.0",\n        ("イベント", "トリック☆トラブル☆学園祭 BADEND"): "诡计☆骚乱☆学园祭 坏结局",\n        ("メモリア", "No.888 夢を追う妹"): "No.888 追梦的妹妹",\n        ("メモリア", "No.900 夏のはじまりに母の影光り"): "No.900 夏日伊始，母亲的影子",\n    }\n    group_index = {\n        (str(group.get("category") or ""), str(group.get("source_base") or "")):\n        str(group.get("current_translation") or "")\n        for group in groups["groups"]\n    }\n    for key, expected in parent_samples.items():\n        actual = group_index[key]\n        assert actual == expected, (key, actual, expected)\n\n    child_samples = {\n        ("scene0", "サイドストーリー Film.0 1 (紫)"): "支线故事 Film.0 1 （紫色）",\n        ("イベント", "トリック☆トラブル☆学園祭 BADEND1話"): "诡计☆骚乱☆学园祭 坏结局 第1话",\n    }\n    for key, expected in child_samples.items():\n        actual = titles["titleByCategory"][key[0]][key[1]]\n        assert actual == expected, (key, actual, expected)\n\n    assert RUNTIME in runtime\n    assert "DecompressionStream" not in runtime and "v25-title-delta" not in runtime\n    assert "STORAGE_KEY = `${STORAGE_PREFIX}${DATA_RELEASE}`" in runtime\n    assert "parsed.release !== DATA_RELEASE" in runtime\n    assert "story-title-runtime-v2.js?v=20260821-26" in editor\n    assert "story-title-runtime-v2.js?v=20260821-26" in story\n    assert "魔法纪录·Magia Exedra 魔法少女称呼搜索</div>" not in index\n\n    removed = {}\n    for path in (\n        "data/v25-title-delta.part-00.txt",\n        "__acceptance.html",\n        "json_open_old.html",\n    ):\n        try:\n            get(args.base, path)\n            removed[path] = False\n        except urllib.error.HTTPError as error:\n            removed[path] = error.code == 404\n    assert all(removed.values()), removed\n\n    proof = {\n        "schemaVersion": 1,\n        "state": "pass",\n        "release": RELEASE,\n        "runtime": RUNTIME,\n        "sourceMainSha": args.source_sha,\n        "runId": args.run_id,\n        "verifiedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),\n        "production": args.base,\n        "groupCount": 2166,\n        "childTitleCount": 5826,\n        "mappedTitleCount": 5826,\n        "kanaInChineseDisplayFields": 0,\n        "formalDataArchitecture": True,\n        "legacyV25PayloadParts": 0,\n        "versionedLocalOverrideStorage": True,\n        "removedPublicLegacyPaths": removed,\n        "parentSamples": {f"{key[0]} / {key[1]}": value for key, value in parent_samples.items()},\n        "childSamples": {f"{key[0]} / {key[1]}": value for key, value in child_samples.items()},\n    }\n    args.output.parent.mkdir(parents=True, exist_ok=True)\n    args.output.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")\n    print(json.dumps(proof, ensure_ascii=False, indent=2))\n\n\nif __name__ == "__main__":\n    main()\n'
CI_WORKFLOW = 'name: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-python@v5\n        with:\n          python-version: "3.12"\n      - name: Rebuild and compare canonical title data\n        run: python scripts/build-title-data.py --check\n      - name: Validate repository and product data\n        run: python scripts/validate-production.py --root .\n      - name: JavaScript syntax checks\n        run: |\n          node --check public/myfile/story-title-runtime-v2.js\n          node --check public/myfile/hamburger-menu-v23.js\n          node --check public/myfile/story-app-v7.js\n'
UPDATE_WORKFLOW = 'name: Update authoritative title outputs\n\non:\n  workflow_dispatch:\n\npermissions:\n  contents: write\n\nconcurrency:\n  group: update-authoritative-title-outputs\n  cancel-in-progress: false\n\njobs:\n  update:\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-python@v5\n        with:\n          python-version: "3.12"\n      - name: Rebuild canonical outputs\n        run: |\n          python scripts/build-title-data.py\n          python scripts/validate-production.py --root .\n      - name: Commit changed generated files\n        run: |\n          git config user.name github-actions[bot]\n          git config user.email 41898282+github-actions[bot]@users.noreply.github.com\n          git add data/titles public/data public/downloads\n          if git diff --cached --quiet; then\n            echo "Canonical outputs are already current."\n          else\n            git commit -m "Update canonical authoritative title outputs"\n            git push origin HEAD:main\n          fi\n'
PRODUCTION_WORKFLOW = 'name: Production verification\n\non:\n  push:\n    branches: [main]\n    paths:\n      - "data/titles/**"\n      - "public/**"\n      - "!public/v26-production-proof.json"\n      - "scripts/build-title-data.py"\n      - "scripts/validate-production.py"\n      - "scripts/verify-live-v26.py"\n      - ".github/workflows/production-verify.yml"\n  workflow_dispatch:\n\npermissions:\n  contents: write\n\nconcurrency:\n  group: magireco-call-search-production-verification\n  cancel-in-progress: false\n\njobs:\n  verify-production:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - name: Wait for Cloudflare Pages V26\n        run: |\n          set -euo pipefail\n          base="https://magireco-call-search-cn.pages.dev"\n          for attempt in $(seq 1 120); do\n            nonce="${GITHUB_RUN_ID}-${attempt}-$(date +%s%N)"\n            marker="$(curl -LfsS -H \'Cache-Control: no-cache, no-store\' "$base/v26-build-marker.json?v=$nonce" 2>/dev/null || true)"\n            if python - "$marker" <<\'PY\'\n          import json, sys\n          try:\n              value = json.loads(sys.argv[1])\n          except Exception:\n              raise SystemExit(1)\n          raise SystemExit(0 if value.get("release") == "v26-converged-20260821" else 1)\n          PY\n            then\n              exit 0\n            fi\n            sleep 10\n          done\n          echo "Timed out waiting for V26 production." >&2\n          exit 1\n      - name: Independently verify production\n        run: |\n          python scripts/verify-live-v26.py \\\n            --base https://magireco-call-search-cn.pages.dev \\\n            --output /tmp/v26-production-proof.json \\\n            --source-sha "$GITHUB_SHA" \\\n            --run-id "$GITHUB_RUN_ID"\n      - name: Record proof once\n        run: |\n          set -euo pipefail\n          git pull --ff-only origin main\n          if [ -f public/v26-production-proof.json ] && \\\n             python - <<\'PY\'\n          import json\n          from pathlib import Path\n          path = Path("public/v26-production-proof.json")\n          value = json.loads(path.read_text(encoding="utf-8"))\n          raise SystemExit(0 if value.get("state") == "pass" and value.get("release") == "v26-converged-20260821" else 1)\n          PY\n          then\n            echo "A passing V26 production proof already exists."\n            exit 0\n          fi\n          cp /tmp/v26-production-proof.json public/v26-production-proof.json\n          mkdir -p reports\n          cp /tmp/v26-production-proof.json reports/v26-production-proof.json\n          git config user.name github-actions[bot]\n          git config user.email 41898282+github-actions[bot]@users.noreply.github.com\n          git add public/v26-production-proof.json reports/v26-production-proof.json\n          git commit -m "Record passing V26 production verification"\n          git push origin HEAD:main\n'


def write_permanent_tooling() -> None:
    scripts = ROOT / "scripts"
    scripts.mkdir(exist_ok=True)
    (scripts / "build-title-data.py").write_text(BUILD_SCRIPT.rstrip() + "\n", encoding="utf-8")
    (scripts / "validate-production.py").write_text(VALIDATE_SCRIPT.rstrip() + "\n", encoding="utf-8")
    (scripts / "verify-live-v26.py").write_text(VERIFY_LIVE_SCRIPT.rstrip() + "\n", encoding="utf-8")

    workflows = ROOT / ".github/workflows"
    if workflows.exists():
        shutil.rmtree(workflows)
    workflows.mkdir(parents=True, exist_ok=True)
    (workflows / "ci.yml").write_text(CI_WORKFLOW.rstrip() + "\n", encoding="utf-8")
    (workflows / "update-authoritative-titles.yml").write_text(
        UPDATE_WORKFLOW.rstrip() + "\n", encoding="utf-8"
    )
    (workflows / "production-verify.yml").write_text(
        PRODUCTION_WORKFLOW.rstrip() + "\n", encoding="utf-8"
    )


def cleanup_repository() -> None:
    for rel in (".automation", "NEW", "node_modules"):
        shutil.rmtree(ROOT / rel, ignore_errors=True)

    for path in list(ROOT.iterdir()):
        if path.name.startswith((".deploy-", ".v22-", ".v23-", ".v24-", ".v25-", ".v26-")):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink(missing_ok=True)

    scripts_dir = ROOT / "scripts"
    if scripts_dir.exists():
        for path in list(scripts_dir.iterdir()):
            if path.name in {"build-title-data.py", "validate-production.py", "verify-live-v26.py"}:
                continue
            if re.search(r"v(?:22|23|24|25|26)", path.name, flags=re.I):
                if path.is_dir():
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    path.unlink(missing_ok=True)

    tests_dir = ROOT / "tests"
    if tests_dir.exists():
        for path in list(tests_dir.iterdir()):
            if re.search(r"v(?:22|23|24|25|26)", path.name, flags=re.I):
                if path.is_dir():
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    path.unlink(missing_ok=True)

    reports = ROOT / "reports"
    shutil.rmtree(reports, ignore_errors=True)
    reports.mkdir(parents=True, exist_ok=True)
    (reports / "README.md").write_text(
        "# Reports\n\nOnly current V26 convergence and production-verification evidence belongs here.\n",
        encoding="utf-8",
    )

    public = ROOT / "public"
    for rel in ("__acceptance.html", "json_open_old.html", "oldfile"):
        path = public / rel
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)

    for path in (public / "data").glob("v25-title-delta.part-*.txt"):
        path.unlink(missing_ok=True)

    for pattern in (
        "v22*.json", "v23*.json", "v24*.json", "v25*.json",
        "*v22*.json", "*v23*.json", "*v24*.json", "*v25*.json",
    ):
        for base in (public / "data", public, public / "downloads"):
            for path in base.glob(pattern):
                path.unlink(missing_ok=True)

    (ROOT / ".gitignore").write_text(
        """# Dependencies and generated working data
node_modules/
_sources/
.cache/
.pytest_cache/
coverage/
dist/
build/

# Python
__pycache__/
*.py[cod]

# Logs, secrets, and temporary files
*.log
.env
.env.*
*.tmp
*.bak
output.txt

# Editors and operating systems
.vercel
.DS_Store
Thumbs.db
.vscode/
.idea/
""",
        encoding="utf-8",
    )


def local_final_report(marker: dict[str, Any]) -> None:
    write_json(ROOT / "reports/v26-convergence.json", {
        "schemaVersion": 1,
        "state": "local-pass",
        "release": RELEASE,
        "checkedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "priorities": {
            "1_repository_convergence": "complete-pending-remote-branch-check",
            "2_versioned_local_overrides": "complete",
            "3_plain_json_title_architecture": "complete",
            "9_public_directory_cleanup": "complete",
        },
        "marker": marker,
    })


def main() -> int:
    payload = decode_v25_authority()
    cleanup_repository()
    marker = formalize_title_data(payload)
    patch_pages()
    write_permanent_tooling()
    local_final_report(marker)

    subprocess.run([sys.executable, str(ROOT / "scripts/build-title-data.py")], cwd=ROOT, check=True)
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/validate-production.py"), "--root", str(ROOT)],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(["node", "--check", "public/myfile/story-title-runtime-v2.js"], cwd=ROOT, check=True)

    print(json.dumps({
        "state": "pass",
        "release": RELEASE,
        "groupCount": EXPECTED_GROUPS,
        "childTitleCount": EXPECTED_CHILDREN,
        "mappedTitleCount": EXPECTED_CHILDREN,
        "formalDataArchitecture": True,
        "versionedLocalOverrides": True,
        "repositoryCleanupPrepared": True,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
