#!/usr/bin/env python3
from __future__ import annotations

import base64
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v26-converged-20260821"
SOURCE_RELEASE = "v25-live-cn-20260821"
KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ffãƒ¼]")
SOURCE_PRIORITY = [
    "magireco-cn-patch/magica/js/libs",
    "existing human/audited translations",
    "MagiReader",
    "magireco-wiki-data",
    "manual fallback",
]


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode_v25_delta() -> dict[str, Any]:
    paths = [ROOT / f"public/data/v25-title-delta.part-{index:02d}.txt" for index in range(4)]
    missing = [str(path.relative_to(ROOT)) for path in paths if not path.exists()]
    if missing:
        raise RuntimeError(f"V25 title payload parts are missing: {missing}")
    encoded = "".join(path.read_text(encoding="utf-8").strip() for path in paths)
    payload = json.loads(gzip.decompress(base64.b64decode(encoded)).decode("utf-8"))
    if payload.get("r") != SOURCE_RELEASE:
        raise RuntimeError(f"unexpected V25 payload release: {payload.get('r')!r}")
    for key in ("p", "s", "e"):
        if not isinstance(payload.get(key), dict):
            raise RuntimeError(f"V25 payload key {key!r} is missing or invalid")
    return payload


def set_nested(mapping: dict[str, dict[str, str]], category: str, source: str, target: str) -> None:
    bucket = mapping.setdefault(category, {})
    old = bucket.get(source)
    if old is not None and old != target:
        raise RuntimeError(f"conflicting title mapping: {category} / {source}: {old!r} != {target!r}")
    bucket[source] = target


def has_kana(value: str) -> bool:
    return bool(KANA_RE.search(value or ""))


def build_formal_title_data() -> dict[str, Any]:
    generated_at = now_iso()
    delta = decode_v25_delta()
    groups_path = ROOT / "public/data/story-title-groups-v1.json"
    groups_data = read_json(groups_path)
    groups = groups_data.get("groups")
    if not isinstance(groups, list):
        raise RuntimeError("story-title-groups-v1.json has no groups array")

    parent_by_category: dict[str, dict[str, str]] = {}
    title_by_category: dict[str, dict[str, str]] = {}
    suffix_by_source = {str(key): str(value) for key, value in delta["s"].items()}
    delta_parents = delta["p"]
    delta_exact = delta["e"]
    record_rows: list[dict[str, Any]] = []
    child_count = 0

    for group in groups:
        category = str(group.get("category") or "")
        source_base = str(group.get("source_base") or "")
        parent = str(
            (delta_parents.get(category) or {}).get(source_base)
            or group.get("approved_translation")
            or group.get("current_translation")
            or source_base
        ).strip()
        if not category or not source_base or not parent:
            raise RuntimeError(f"invalid parent group: {group!r}")
        if has_kana(parent):
            raise RuntimeError(f"parent Chinese display still contains kana: {category} / {source_base} => {parent}")
        set_nested(parent_by_category, category, source_base, parent)

        for child in group.get("children") or []:
            child_count += 1
            source_title = str(child.get("source_title") or "").strip()
            source_suffix = str(child.get("source_suffix") or "").strip()
            exact = str((delta_exact.get(category) or {}).get(source_title) or "").strip()
            suffix = str(
                suffix_by_source.get(source_suffix)
                if source_suffix in suffix_by_source
                else child.get("localized_suffix") or source_suffix
            ).strip()
            target = exact or f"{parent}{' ' + suffix if suffix else ''}".strip()
            if not source_title or not target:
                raise RuntimeError(f"invalid child title: {category} / {source_title!r}")
            if has_kana(target):
                raise RuntimeError(f"child Chinese display still contains kana: {category} / {source_title} => {target}")
            set_nested(title_by_category, category, source_title, target)
            record_rows.append({
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

    group_count = sum(len(values) for values in parent_by_category.values())
    mapped_count = sum(len(values) for values in title_by_category.values())
    if group_count != 2166:
        raise RuntimeError(f"expected 2166 parent titles, got {group_count}")
    if child_count != 5826 or mapped_count != 5826:
        raise RuntimeError(f"expected 5826 child titles, got children={child_count}, mapped={mapped_count}")

    authority = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "summary": {
            "groupCount": group_count,
            "childTitleCount": child_count,
            "mappedTitleCount": mapped_count,
            "kanaInChineseDisplayFields": 0,
        },
        "parents": parent_by_category,
        "suffixes": suffix_by_source,
        "exactTitles": delta_exact,
    }
    write_json(ROOT / "data/titles/authority.json", authority)

    parents_payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "generatedAt": generated_at,
        "summary": {"count": group_count},
        "parentByCategory": parent_by_category,
    }
    suffixes_payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "generatedAt": generated_at,
        "summary": {"count": len(suffix_by_source)},
        "suffixBySource": suffix_by_source,
    }
    titles_payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "generatedAt": generated_at,
        "summary": {"count": mapped_count},
        "titleByCategory": title_by_category,
    }
    provenance_payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "sourcePriority": SOURCE_PRIORITY,
        "summary": {
            "groupCount": group_count,
            "childTitleCount": child_count,
            "mappedTitleCount": mapped_count,
            "kanaInChineseDisplayFields": 0,
        },
        "records": record_rows,
    }

    output_dir = ROOT / "public/data/titles"
    write_json(output_dir / "parents.json", parents_payload)
    write_json(output_dir / "suffixes.json", suffixes_payload)
    write_json(output_dir / "titles.json", titles_payload)
    write_json(output_dir / "provenance.json", provenance_payload)

    compatibility = {
        "version": 26,
        "release": RELEASE,
        "generatedAt": generated_at,
        "summary": {
            "groupCount": group_count,
            "childTitleCount": child_count,
            "mappedTitleCount": mapped_count,
            "kanaInChineseTranslationCount": 0,
        },
        "titleByCategory": title_by_category,
    }
    write_json(ROOT / "public/data/story-title-map.generated.json", compatibility)

    file_specs = [
        ("parents", output_dir / "parents.json"),
        ("suffixes", output_dir / "suffixes.json"),
        ("titles", output_dir / "titles.json"),
        ("provenance", output_dir / "provenance.json"),
    ]
    manifest = {
        "schemaVersion": 1,
        "release": RELEASE,
        "sourceRelease": SOURCE_RELEASE,
        "generatedAt": generated_at,
        "summary": {
            "groupCount": group_count,
            "childTitleCount": child_count,
            "mappedTitleCount": mapped_count,
            "kanaInChineseDisplayFields": 0,
        },
        "files": {
            name: {
                "path": f"./{path.name}",
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for name, path in file_specs
        },
    }
    write_json(output_dir / "manifest.json", manifest)
    write_json(ROOT / "public/v26-build-marker.json", {
        "release": RELEASE,
        "generatedAt": generated_at,
        "groupCount": group_count,
        "childTitleCount": child_count,
        "mappedTitleCount": mapped_count,
        "kanaInChineseDisplayFields": 0,
        "runtime": "story-title-runtime-v26-20260821",
        "status": "deployed-to-main",
    })
    return manifest


RUNTIME_JS = r''*'/* V26 authoritative Chinese title runtime.
 * Uses ordinary versioned JSON files and release-scoped local overrides. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-runtime-v26-20260821';
  const DATA_RELEASE = 'v26-converged-20260821';
  const GROTPS_URL = './data/story-title-groups-v1.json?v=20260821-26';
  const PARENTS_URL = './data/titles/parents.json?v=20260821-26';
  const SUFFIXES_URL = './data/titles/suffixes.json?v=20260821-26';
  const TITLES_URL = './data/titles/titles.json?v=20260821-26';
  const STORAGE_PREFIX = 'magireco-story-title-overrides:';
  const STORAGE_KEY = `${STORAGE_PREFIX}${DATA_RELEASE}`;
  const LEGACY_STORAGE_KEYS = ['magireco-story-title-overrides-v1'];

  const Tools = global.MagiToolsVC;
  if (!Tools?.loadLocalizationV7) {
    console.error('V26 æ ‡é¢˜è¿è¡Œæ—¶æœªæœªæœ¾åˆ°.');
    return;
  }

  const originalLoad = Tools.loadLocalizationV7.bind(Tools);
  let groupsPromise = null;
  let serverMapPromise = null;
  let mergedPromise = null;

  async function fetchRequired(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}ï¼šHTTP ${response.status}`);
    return response.json();
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function validateRelease(payload, label) {
    if (!payload || payload.release !== DATA_RELEASE) {
      throw new Error(`${label} æ•°æ®ç‰ˆæœ¬ä¸åŒ¹é…ã€‚à);
    }
    return payload;
  }

  function applyFormalData(groupsData, parentsData, suffixesData, titlesData) {
    const parentByCategory = parentsData.parentByCategory || {};
    const suffixBySource = suffixesData.suffixBySource || {};
    const titleByCategory = titlesData.titleByCategory || {};

    for (const group of groupsData.groups || []) {
      const category = String(group.category || '');
      const sourceBase = String(group.source_base || '');
      const parent = String(parentByCategory[category]?.[sourceBase]
        || group.approved_translation
        || group.current_translation
        || sourceBase).trim();
      group.current_translation = parent;
      group.approved_translation = parent;

      for (const child of group.children || []) {
        const sourceTitle = String(child.source_title || '');
        const sourceSuffix = String(child.source_suffix || '');
        const suffix = own(suffixBySource, sourceSuffix)
          ? String(suffixBySource[sourceSuffix] ?? '').trim()
          : String(child.localized_suffix ?? sourceSuffix).trim();
        const target = String(titleByCategory[category]?.[sourceTitle]
          || `${parent}${suffix ? ` ${suffix}` : ''}`).trim();
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
        fetchRequired(GROUPS_URL),
        fetchRequired(PARENTS_URL(¹Ñ¡•¸ ¡Ù…±Õ”¤€ôøÙ…±¥‘…Ñ•I•±•…Í”¡Ù…±Õ”°€Ÿš¾7š‚#¦Šar’’À¢fWF6…&WV—&VB…5Tdd•„U5õU$Â’çF†Vâ‚‡fÇVR’ÓâfÆ–FFU&VÆV6R‡fÇVRÂ~YÎ{Èr’’À¢fWF6…&WV—&VB…D•DÄU5õU$Â’çF†Vâ‚‡fÇVR’ÓâfÆ–FFU&VÆV6R‡fÇVRÂ~ZèÎi[Njš)…ÊJBˆJK[Š
ÙÜ›İ\Ñ]K\™[Ñ]KİY™š^\Ñ]K]\Ñ]WJHOˆÂˆYˆ
YÜ›İ\Ñ]HP\œ˜^Kš\Ğ\œ˜^JÜ›İ\Ñ]K™Ü›İ\ÊJHÂˆ›İÈ™]È\œ›ÜŠ	ù«ãy¥ay.¢ù®!ycey¯#ùo#ù.#¹æ¡9£ä9£ä9£ä9£ä8à ‚‰ÊNÂˆBˆ™]\›ˆ\Q›Ü›X[]JÜ›İ\Ñ]K\™[Ñ]KİY™š^\Ñ]K]\Ñ]JNÂˆJNÂˆBˆ™]\›ˆÜ›İ\Ô›ÛZ\ÙNÂˆB‚ˆ[˜İ[ÛˆØYÙ\™\“X\

HÂˆYˆ
\Ù\™\“X\›ÛZ\ÙJHÂˆÙ\™\“X\›ÛZ\ÙHH™]Ú™\]Z\™Y
UT×ÕT“
Bˆ[Š
˜[YJHOˆ˜[Y]T™[X\ÙJ˜[YK	ùk£9¥m9¨!úh§yd"ˆ
JBˆ[Š
˜[YJHOˆ
Âˆ™\œÚ[Ûˆ‹ˆ™[X\ÙNˆUWÔ‘SPTÑKˆ]PPØ]YÛÜNˆ˜[YK]PPØ]YÛÜHßBˆJJNÂˆBˆ™]\›ˆÙ\™\“X\›ÛZ\ÙNÂˆB‚ˆ[˜İ[Ûˆ[\SØØ[^[ØY

HÂˆ™]\›ˆÈ™\œÚ[Ûˆ‹™[X\ÙNˆUWÔ‘SPTÑKİ™\œšY\Îˆ×HNÂˆB‚ˆ[˜İ[Ûˆ™XYØØ[^[ØY

HÂˆHÂˆÛÛœİ\œÙYH”ÓÓ‹œ\œÙJØØ[İÜ˜YÙK™Ù]][JÕÔQÑWÒÑVJH	Û[	ÊNÂˆYˆ
\\œÙY\œÙYœ™[X\ÙHOOHUWÔ‘SPTÑHP\œ˜^Kš\Ğ\œ˜^J\œÙY›İ™\œšY\ÊJHÂˆ™]\›ˆ[\SØØ[^[ØY

NÂˆBˆ™]\›ˆ\œÙYÂˆHØ]ÚÂˆ™]\›ˆ[\SØØ[^[ØY

NÂˆBˆB‚ˆ[˜İ[ÛˆÜš]SØØ[^[ØY
^[ØY
HÂˆØØ[İÜ˜YÙKœÙ]][JÕÔQÑWÒÑVK”ÓÓ‹œİš[™ÚYJÂˆ‹‹œ^[ØYˆ™\œÚ[Ûˆ‹ˆ™[X\ÙNˆUWÔ‘SPTÑBˆJJNÂˆB‚ˆ[˜İ[Ûˆ›Ü›X[^™Sİ™\œšYS\İ
^[ØY
HÂˆYˆ
\^[ØY^[ØYœ™[X\ÙHOOHUWÔ‘SPTÑJH™]\›ˆ×NÂˆYˆ
\œ˜^Kš\Ğ\œ˜^J^[ØY›İ™\œšY\ÊJH™]\›ˆ^[ØY›İ™\œšY\ÎÂˆ™]\›ˆ×NÂˆB‚ˆ[˜İ[Ûˆ˜[Y]P[™[™^
Ü›İ\Ñ]K^[ØYİšXİHYJHÂˆÛÛœİÜ›İ\ÈH™]ÈX\
Ü›İ\Ñ]K™Ü›İ\Ë›X\

Ü›İ\
HOˆÙÜ›İ\™Ü›İ\ÚYÜ›İ\JJNÂˆÛÛœİİ™\œšY\ÈH™]ÈX\

NÂˆÛÛœİ\œ›ÜœÈH×NÂˆ›Üˆ
ÛÛœİ˜]ÈÙˆ›Ü›X[^™Sİ™\œšYS\İ
^[ØY
JHÂˆÛÛœİÜ›İ\YHİš[™Ê˜]ÏË™Ü›İ\ÚY	ÉÊKš[J
NÂˆÛÛœİ\›İ™YHİš[™Ê˜]ÏË˜\›İ™Yİ˜[œÛ][Ûˆ	ÉÊKš[J
NÂˆYˆ
YÜ›İ\YX\›İ™Y
HÛÛ[YNÂˆÛÛœİÜ›İ\HÜ›İ\Ë™Ù]
Ü›İ\Y
NÂˆYˆ
YÜ›İ\
HÈ\œ›ÜœËœ\Ú
9.#ykf9g*9æ¡Ü›İ\ÚY;ï&ÑÜ›İ\YX
NÈÛÛ[YNÈBˆ›Üˆ
ÛÛœİÚÙ^K^XİYHÙˆÂˆÉØØ]YÛÜIËÜ›İ\˜Ø]YÛÜWKˆÉÜÛİ\˜ÙWØ˜\ÙIËÜ›İ\œÛİ\˜ÙWØ˜\ÙWKˆÉÜÛİ\˜ÙWÜÚLM‰ËÜ›İ\œÛİ\˜ÙWÜÚLM—BˆJHÂˆYˆ
˜]ÖÚÙ^WHOH[	‰ˆİš[™Ê˜]ÖÚÙ^WJHOOHİš[™Ê^XİY
JHÂˆ\œ›ÜœËœ\Ú
	ÙÜ›İ\YH9æ¡	ÚÙ^_H9.#¹à®ybcyd%y­(8à ‚‰ÊNÂˆBˆBˆYˆ
İ™\œšY\Ëš\ÊÜ›İ\Y
JH\œ›ÜœËœ\Ú
™ÜSË•œ˜[™İ\ÚY;ï&‰ÙÜ›İ\YX
NÂˆİ™\œšY\ËœÙ]
Ü›İ\YÂˆÜ›İ\ÚYˆÜ›İ\YˆØ]YÛÜNˆÜ›İ\˜Ø]YÛÜKˆÛİ\˜ÙWØ˜\ÙNˆÜ›İ\œÛİ\˜ÙWØ˜\ÙKˆÛİ\˜ÙWÜÚLMˆÜ›İ\œÛİ\˜ÙWÜÚLM‹ˆ\›İ™Yİ˜[œÛ][Ûˆ\›İ™YˆJNÂˆBˆYˆ
İšXİ	‰ˆ\œ›ÜœË›[™İ
H›İÈ™]È\œ›ÜŠ\œ›ÜœËœÛXÙJLŠKš›Ú[Š	×‰ÊJNÂˆ™]\›ˆÈİ™\œšY\Ë\œ›ÜœÈNÂˆB‚ˆ[˜İ[ÛˆÛÛ\ÜÙJÜ›İ\Ú[İ™\œšYJHÂˆYˆ
[İ™\œšYJH™]\›ˆİš[™ÊÚ[˜İ\œ™[Ù[İ˜[œÛ][Ûˆ	ÉÊKš[J
NÂˆÛÛœİ˜\ÙHHİš[™Êİ™\œšYK˜\›İ™Yİ˜[œÛ][Ûˆ	ÉÊKš[J
NÂˆÛÛœİİY™š^Hİš[™ÊÚ[›ØØ[^™YÜİY™š^ÏÈ	ÉÊKš[J
NÂˆ™]\›ˆ	Ø˜\Ù_IÜİY™š^È	ÜİY™š^Xˆ	ÉßXš[J
NÂˆB‚ˆ[˜İ[Ûˆ^XİX\œ›ÛJÜ›İ\Ñ]K^[ØYİšXİHYJHÂˆÛÛœİÈİ™\œšY\Ë\œ›ÜœÈHH˜[Y]P[™[™^
Ü›İ\Ñ]K^[ØYİšXİ
NÂˆÛÛœİ]PPØ]YÛÜHHßNÂˆ›Üˆ
ÛÛœİÜ›İ\ÙˆÜ›İ\Ñ]K™Ü›İ\ÊHÂˆÛÛœİİ™\œšYHHİ™\œšY\Ë™Ù]
Ü›İ\™Ü›İ\ÚY
NÂˆÛÛœİØ]YÛÜSX\H]PPØ]YÛÜVÙÜ›İ\˜Ø]YÛÜWH
]PPØ]YÛÜVÙÜ›İ\˜Ø]YÛÜWHHßJNÂˆ›Üˆ
ÛÛœİÚ[ÙˆÜ›İ\˜Ú[™[ˆ×JHÂˆÛÛœİÛİ\˜ÙHHİš[™ÊÚ[œÛİ\˜ÙWİ]H	ÉÊKš[J
NÂˆYˆ
Ûİ\˜ÙJHØ]YÛÜSX\ÜÛİ\˜ÙWHHÛÛ\ÜÙJÜ›İ\Ú[İ™\œšYJNÂˆBˆBˆ™]\›ˆÈ™[X\ÙNˆUWÔ‘SPTÑK™\œÚ[Ûˆ‹]PPØ]YÛÜK\œ›ÜœÈNÂˆB‚ˆ[˜İ[ÛˆY\™ÙPØ]YÛÜSX\Ê‹‹›X\ÊHÂˆÛÛœİİ]]HßNÂˆ›Üˆ
ÛÛœİÛİ\˜ÙHÙˆX\ÊHÂˆYˆ
\Ûİ\˜ÙH\[ÙˆÛİ\˜ÙHOOH	ÛØš™Xİ	ÊHÛÛ[YNÂˆ›Üˆ
ÛÛœİØØ]YÛÜKZ\œ×HÙˆØš™Xİ™[šY\ÊÛİ\˜ÙJJHÂˆYˆ
\Z\œÈ\[ÙˆZ\œÈOOH	ÛØš™Xİ	ÊHÛÛ[YNÂˆİ]]ØØ]YÛÜWHHØš™Xİ˜\ÜÚYÛŠİ]]ØØ]YÛÜWHßKZ\œÊNÂˆBˆBˆ™]\›ˆİ]]ÂˆB‚ˆ[˜İ[ÛˆØYY\™ÙYØØ[^˜][ÛŠ
HÂˆYˆ
[Y\™ÙY›ÛZ\ÙJHÂˆY\™ÙY›ÛZ\ÙHH›ÛZ\ÙK˜[
ÛÜšYÚ[˜[ØY

KØYÜ›İ\Ê
KØYÙ\™\“X\

WJBˆ[Š
ÛØØ[^˜][Û‹Ü›İ\Ñ]KÙ\™\“X\JHOˆÂˆ]ØØ[X\HÈ]PPØ]YÛÜNˆßHNÂˆHÈØØ[X\H^XİX\œ›ÛJÜ›İ\Ñ]K™XYØØ[^[ØY

KYJNÈBˆØ]Ú
\œ›ÜŠHÈÛÛœÛÛK™\œ›ÜŠ	ùodùbcycäyn ùâb9§+9æ¡9§+9g,9«ãy¨!úh¦9§*¹n¥9å*8à ‰Ë\œ›ÜŠNÈBˆ™]\›ˆÂˆ‹‹›ØØ[^˜][Û‹ˆ™[X\ÙNˆUWÔ‘SPTÑKˆ]PPØ]YÛÜUŒLˆY\™ÙPØ]YÛÜSX\ÊˆØØ[^˜][ÛË]PPØ]YÛÜUŒLˆÙ\™\“X\]PPØ]YÛÜKˆØØ[X\]PPØ]YÛÜBˆ
KˆİÜU]QÜ›İ\ÕŒNˆÜ›İ\Ñ]KˆİÜU]SX\ŒNˆÙ\™\“X\ˆNÂˆJNÂˆBˆ™]\›ˆY\™ÙY›ÛZ\ÙNÂˆB‚ˆ[˜İ[Ûˆ™Yœ™\Ú

HÂˆY\™ÙY›ÛZ\ÙHH[ÂˆÛØ˜[™\Ü]Ú]™[
™]Èİ\İÛQ]™[
	ÜİÜK]]K[X\]ŒK]\]Y	ÊJNÂˆB‚ˆ\Ş[˜È[˜İ[Ûˆ[\Ü^[ØY
^[ØYÈ\œÚ\İHYKİšXİHYHHHßJHÂˆÛÛœİÜ›İ\Ñ]HH]ØZ]ØYÜ›İ\Ê
NÂˆÛÛœİ›Ü›X[^™Y[œ]HÈ‹‹œ^[ØY™[X\ÙNˆUWÔ‘SPTÑHNÂˆÛÛœİ[™^YH˜[Y]P[™[™^
Ü›İ\Ñ]K›Ü›X[^™Y[œ]İšXİ
NÂˆÛÛœİ›Ü›X[^™YHÂˆ™\œÚ[Ûˆ‹ˆ™[X\ÙNˆUWÔ‘SPTÑKˆÚXÚÛ\İÙÙ[™\˜]YØ]ˆÜ›İ\Ñ]K™Ù[™\˜]Y]	ÉËˆİ™\œšY\ÎˆË‹‹š[™^Y›İ™\œšY\Ë˜[Y\Ê
WKœÛÜ

KŠHOˆK™Ü›İ\ÚY›ØØ[PÛÛ\\™J‹™Ü›İ\ÚY
JBˆNÂˆYˆ
\œÚ\İ
HÜš]SØØ[^[ØY
›Ü›X[^™Y
NÂˆ™Yœ™\Ú

NÂˆ™]\›ˆÈ^[ØYˆ›Ü›X[^™YX\ˆ^XİX\œ›ÛJÜ›İ\Ñ]K›Ü›X[^™YİšXİ
KØ\›š[™ÜÎˆ[™^Y™\œ›ÜœÈNÂˆB‚ˆ[˜İ[ÛˆÛX\“ØØ[İ™\œšY\Ê
HÂˆØØ[İÜ˜YÙKœ™[[İ™R][JÕÔQÑWÒÑVJNÂˆ™Yœ™\Ú

NÂˆ™]\›ˆ›ÛZ\ÙKœ™\ÛÛ™J
NÂˆB‚ˆÛÛœİ\HHØš™Xİ™œ™Y^™JÂˆ™[X\ÙNˆ‘SPTÑKˆ]T™[X\ÙNˆUWÔ‘SPTÑKˆÜ›İ\Õ\›ˆÔ“ÕT×ÕT“ˆX\\›ˆUT×ÕT“ˆİÜ˜YÙRÙ^NˆÕÔQÑWÒÑVKˆYÛ›Ü™YYØXŞTİÜ˜YÙRÙ^\ÎˆQĞPÖWÔÕÔQÑWÒÑVTËˆØYÜ›İ\ËˆØYÙ\™\“X\ˆ™XYØØ[^[ØYˆ[\Ü^[ØYˆÛX\“ØØ[İ™\œšY\Ëˆ^XİX\œ›ÛKˆÛÛ\ÜÙKˆ™Yœ™\ÚˆJNÂ‚ˆÛØ˜[“XYÚUÛÛÕÈHØš™Xİ™œ™Y^™JÈ‹‹•ÛÛËØYØØ[^˜][Û•ÎˆØYY\™ÙYØØ[^˜][ÛˆJNÂˆÛØ˜[—×ÔÕÔ–WÕUWÔ•S•SQWÕŒW×ÈH\NÂˆØİ[Y[™Øİ[Y[[[Y[™]\Ù]œİÜU]T[[YUŒˆH‘SPTÑNÂŸJJÚ[™İÊNÂ‰ÉÉÂ‚‚•RSÔĞÔ’TH‰ÉÈÈKİ\Ü‹Øš[‹Ù[ˆ]ÛŒÂ™œ›ÛH×Ù]\™W×È[\Ü[››İ][ÛœÂ‚š[\Ü\™Ü\œÙBš[\Ü\ÚX‚š[\ÜœÛÛ‚š[\Ü™B™œ›ÛH]Xˆ[\Ü]™œ›ÛH\[™È[\Ü[B‚”“ÓÕH]
×Ùš[W×ÊKœ™\ÛÛ™J
Kœ\™[ÖÌWB’ĞSHH™K˜ÛÛ\[Jˆ–×LÌWLÌ™—LÌYŒWLÌY™¸àïHŠB‚‚™Yˆ™XYÚœÛÛŠ]ˆ]
HOˆ[N‚ˆ™]\›ˆœÛÛ‹›ØYÊ]œ™XYİ^
[˜ÛÙ[™ÏH]‹NŠJB‚‚™YˆÜš]WÚœÛÛŠ]ˆ]˜[YNˆ[JHOˆ›Û™N‚ˆ]œ\™[›ZÙ\Š\™[ÏUYK^\İÛÚÏUYJBˆ]Üš]Wİ^
œÛÛ‹™[\Ê˜[YK[œİ\™WØ\ØÚZOQ˜[ÙK[™[LŠH
È—ˆ‹[˜ÛÙ[™ÏH]‹NŠB‚‚™YˆÚLMŠ]ˆ]
HOˆİ‚ˆ™]\›ˆ\ÚX‹œÚLMŠ]œ™XYØ]\Ê
JKš^YÙ\İ

B‚‚™YˆZ[

HOˆ›Û™N‚ˆ]]Üš]HH™XYÚœÛÛŠ“ÓÕÈ™]Kİ]\ËØ]]Üš]KšœÛÛˆŠBˆÜ›İ\ÈH™XYÚœÛÛŠ“ÓÕÈœX›XËÙ]KÜİÜK]]KYÜ›İ\Ë]ŒKšœÛÛˆŠK™Ù]
™Ü›İ\È‹×JBˆ™[X\ÙHH]]Üš]VÈœ™[X\ÙH—BˆÙ[™\˜]YØ]H]]Üš]VÈ™Ù[™\˜]Y]—Bˆ\™[ÈH]]Üš]VÈœ\™[È—BˆİY™š^\ÈH]]Üš]VÈœİY™š^\È—Bˆ^XİH]]Üš]K™Ù]
™^Xİ]\È‹ßJBˆ]\ÎˆXİÜİ‹XİÜİ‹İ—WHHßBˆ™XÛÜ™ÈH×BˆÚ[™[ˆH‚ˆ›ÜˆÜ›İ\[ˆÜ›İ\Î‚ˆØ]YÛÜHHİŠÜ›İ\™Ù]
˜Ø]YÛÜHŠHÜˆˆŠBˆÛİ\˜ÙWØ˜\ÙHHİŠÜ›İ\™Ù]
œÛİ\˜ÙWØ˜\ÙHŠHÜˆˆŠBˆ\™[HİŠ
\™[Ë™Ù]
Ø]YÛÜJHÜˆßJK™Ù]
Ûİ\˜ÙWØ˜\ÙJHÜˆÜ›İ\™Ù]
˜İ\œ™[İ˜[œÛ][ÛˆŠHÜˆÛİ\˜ÙWØ˜\ÙJKœİš\

BˆYˆĞSKœÙX\˜Ú
\™[
Nˆ˜Z\ÙH[[YQ\œ›ÜŠˆšØ[˜H[ˆ\™[ˆØØ]YÛÜ_KŞÜÛİ\˜ÙWØ˜\Ù_HOˆÜ\™[HŠBˆ›ÜˆÚ[[ˆÜ›İ\™Ù]
˜Ú[™[ˆŠHÜˆ×N‚ˆÚ[™[ˆ
ÏHBˆÛİ\˜ÙWİ]HHİŠÚ[™Ù]
œÛİ\˜ÙWİ]HŠHÜˆˆŠKœİš\

BˆÛİ\˜ÙWÜİY™š^HİŠÚ[™Ù]
œÛİ\˜ÙWÜİY™š^ŠHÜˆˆŠKœİš\

BˆİY™š^HİŠİY™š^\Ë™Ù]
Ûİ\˜ÙWÜİY™š^Ú[™Ù]
›ØØ[^™YÜİY™š^ŠHÜˆÛİ\˜ÙWÜİY™š^
JKœİš\

Bˆ\™Ù]HİŠ
^Xİ™Ù]
Ø]YÛÜJHÜˆßJK™Ù]
Ûİ\˜ÙWİ]JHÜˆˆÜ\™[^ÉÈ	È
ÈİY™š^YˆİY™š^[ÙH	ÉßHŠKœİš\

BˆYˆĞSKœÙX\˜Ú
\™Ù]
Nˆ˜Z\ÙH[[YQ\œ›ÜŠˆšØ[˜H[ˆ]NˆØØ]YÛÜ_KŞÜÛİ\˜ÙWİ]_HOˆİ\™Ù]HŠBˆXÚÙ]H]\ËœÙ]Y˜][
Ø]YÛÜKßJBˆYˆÛİ\˜ÙWİ]H[ˆXÚÙ][™XÚÙ]ÜÛİ\˜ÙWİ]WHOH\™Ù]‚ˆ˜Z\ÙH[[YQ\œ›ÜŠˆ˜ÛÛ™›Xİ[™È]NˆØØ]YÛÜ_KŞÜÛİ\˜ÙWİ]_HŠBˆXÚÙ]ÜÛİ\˜ÙWİ]WHH\™Ù]ˆ™XÛÜ™Ë˜\[™
È˜Ø]YÛÜHˆØ]YÛÜK™Ü›İ\YˆÜ›İ\™Ù]
™Ü›İ\ÚYŠKœÛİ\˜ÙP˜\ÙHˆÛİ\˜ÙWØ˜\ÙK™\Ü^T\™[ˆ\™[œÛİ\˜ÙU]HˆÛİ\˜ÙWİ]K™\Ü^U]Hˆ\™Ù]œÛİ\˜ÙTİY™š^ˆÛİ\˜ÙWÜİY™š^™\Ü^TİY™š^ˆİY™š^œÛİ\˜ÙTÚLMˆˆÜ›İ\™Ù]
œÛİ\˜ÙWÜÚLMˆŠ_JB‚ˆÜ›İ\ØÛİ[Hİ[J[Š˜[YJH›Üˆ˜[YH[ˆ\™[Ë˜[Y\Ê
JBˆ]WØÛİ[Hİ[J[Š˜[YJH›Üˆ˜[YH[ˆ]\Ë˜[Y\Ê
JBˆYˆ
Ü›İ\ØÛİ[Ú[™[‹]WØÛİ[
HOH
ŒM‹N‹NŠN‚ˆ˜Z\ÙH[[YQ\œ›ÜŠ
Ü›İ\ØÛİ[Ú[™[‹]WØÛİ[
JB‚ˆİ]]H“ÓÕÈœX›XËÙ]Kİ]\È‚ˆ^[ØYÈHÂˆœ\™[ÈˆÈœØÚ[XU™\œÚ[ÛˆˆKœ™[X\ÙHˆ™[X\ÙK™Ù[™\˜]Y]ˆÙ[™\˜]YØ]œİ[[X\HˆÈ˜Ûİ[ˆÜ›İ\ØÛİ[Kœ\™[PØ]YÛÜHˆ\™[ßKˆœİY™š^\ÈˆÈœØÚ[XU™\œÚ[ÛˆˆKœ™[X\ÙHˆ™[X\ÙK™Ù[™\˜]Y]ˆÙ[™\˜]YØ]œİ[[X\HˆÈ˜Ûİ[ˆ[ŠİY™š^\Ê_KœİY™š^TÛİ\˜ÙHˆİY™š^\ßKˆ]\ÈˆÈœØÚ[XU™\œÚ[ÛˆˆKœ™[X\ÙHˆ™[X\ÙK™Ù[™\˜]Y]ˆÙ[™\˜]YØ]œİ[[X\HˆÈ˜Ûİ[ˆ]WØÛİ[K]PPØ]YÛÜHˆ]\ßKˆœ›İ™[˜[˜ÙHˆÈœØÚ[XU™\œÚ[ÛˆˆKœ™[X\ÙHˆ™[X\ÙKœÛİ\˜ÙT™[X\ÙHˆ]]Üš]K™Ù]
œÛİ\˜ÙT™[X\ÙHŠK™Ù[™\˜]Y]ˆÙ[™\˜]YØ]œÛİ\˜ÙTš[Üš]Hˆ]]Üš]K™Ù]
œÛİ\˜ÙTš[Üš]H‹×JKœİ[[X\HˆÈ™Ü›İ\Ûİ[ˆÜ›İ\ØÛİ[˜Ú[]PÛİ[ˆÚ[™[‹›X\Y]PÛİ[ˆ]WØÛİ[šØ[˜R[Ú[™\ÙQ\Ü^QšY[ÈˆKœ™XÛÜ™Èˆ™XÛÜ™ßKˆBˆ›Üˆ˜[YK^[ØY[ˆ^[ØYËš][\Ê
NˆÜš]WÚœÛÛŠİ]]ÈˆÛ˜[Y_KšœÛÛˆ‹^[ØY
BˆX[šY™\İHÈœØÚ[XU™\œÚ[ÛˆˆKœ™[X\ÙHˆ™[X\ÙKœÛİ\˜ÙT™[X\ÙHˆ]]Üš]K™Ù]
œÛİ\˜ÙT™[X\ÙHŠK™Ù[™\˜]Y]ˆÙ[™\˜]YØ]œİ[[X\HˆÈ™Ü›İ\Ûİ[ˆÜ›İ\ØÛİ[˜Ú[]PÛİ[ˆÚ[™[‹›X\Y]PÛİ[ˆ]WØÛİ[šØ[˜R[Ú[™\ÙQ\Ü^QšY[ÈˆK™š[\ÈˆÛ˜[YNˆÈœ]ˆˆ‹‹ŞÛ˜[Y_KšœÛÛˆ‹˜]\Èˆ
İ]]ÈˆÛ˜[Y_KšœÛÛˆŠKœİ]

KœİÜÚ^™KœÚLMˆˆÚLMŠİ]]ÈˆÛ˜[Y_KšœÛÛˆŠ_H›Üˆ˜[YH[ˆ^[ØYß_BˆÜš]WÚœÛÛŠİ]]È›X[šY™\İšœÛÛˆ‹X[šY™\İ
BˆÜš]WÚœÛÛŠ“ÓÕÈœX›XËÙ]KÜİÜK]]K[X\™Ù[™\˜]YšœÛÛˆ‹È™\œÚ[Ûˆˆ‹œ™[X\ÙHˆ™[X\ÙK™Ù[™\˜]Y]ˆÙ[™\˜]YØ]œİ[[X\HˆX[šY™\İÈœİ[[X\H—K]PPØ]YÛÜHˆ]\ßJB‚‚™YˆXZ[Š
HOˆ[‚ˆ\œÙ\ˆH\™Ü\œÙK\™İ[Y[\œÙ\Š
Bˆ\œÙ\‹˜YØ\™İ[Y[
‹KXÚXÚÈ‹Xİ[ÛHœİÜ™WİYHŠBˆ\™ÜÈH\œÙ\‹œ\œÙWØ\™ÜÊ
BˆYˆ\™ÜË˜ÚXÚÎ‚ˆ™Y›Ü™HHÜ]ˆ]œ™XYØ]\Ê
H›Üˆ][ˆÔ“ÓÕÈœX›XËÙ]Kİ]\ËÛX[šY™\İšœÛÛˆ‹“ÓÕÈœX›XËÙ]Kİ]\ËÜ\™[ËšœÛÛˆ‹“ÓÕÈœX›XËÙ]Kİ]\ËÜİY™š^\ËšœÛÛˆ‹“ÓÕÈœX›XËÙ]Kİ]\Ëİ]\ËšœÛÛˆ‹“ÓÕÈœX›XËÙ]Kİ]\ËÜ›İ™[˜[˜ÙKšœÛÛˆ‹“ÓÕÈœX›XËÙ]KÜİÜK]]K[X\™Ù[™\˜]YšœÛÛˆ—_BˆZ[

BˆÚ[™ÙYHÜİŠ]œ™[]]™WİÊ“ÓÕ
JH›Üˆ]]H[ˆ™Y›Ü™Kš][\Ê
HYˆ]œ™XYØ]\Ê
HOH]WBˆYˆÚ[™ÙYˆ˜Z\ÙHŞ\İ[Q^]
ˆ™Ù[™\˜]Y]H]H\Èİ[NˆØÚ[™ÙYHŠBˆ[ÙN‚ˆZ[

Bˆ™]\›ˆ‚šYˆ×Û˜[YW×ÈOH—×ÛXZ[—×Èˆ˜Z\ÙHŞ\İ[Q^]
XZ[Š
JB‰ÉÉÂ‚‚•SQUWÔĞÔ’TH‰ÉÉÈÈKİ\Ü‹Øš[‹Ù[ˆ]ÛŒÂ™œ›ÛH×Ù]\™W×È[\Ü[››İ][ÛœÂ‚š[\ÜœÛÛ‚š[\Ü™B™œ›ÛH]Xˆ[\Ü]‚”“ÓÕH]
×Ùš[W×ÊKœ™\ÛÛ™J
Kœ\™[ÖÌWB”‘SPTÑHHŒ‹XÛÛ™\™ÙYLŒŒŒH‚’ĞSHH™K˜ÛÛ\[Jˆ–×LÌWLÌ™—LÌYŒWLÌY™¸àïHŠB‚‚™YˆØY
]ˆİŠN‚ˆ™]\›ˆœÛÛ‹›ØYÊ
“ÓÕÈ]
Kœ™XYİ^
[˜ÛÙ[™ÏH]‹NŠJB‚‚™YˆXZ[Š
HOˆ[‚ˆX[šY™\İHØY
œX›XËÙ]Kİ]\ËÛX[šY™\İšœÛÛˆŠBˆ\™[ÈHØY
œX›XËÙ]Kİ]\ËÜ\™[ËšœÛÛˆŠBˆİY™š^\ÈHØY
œX›XËÙ]Kİ]\ËÜİY™š^\ËšœÛÛˆŠBˆ]\ÈHØY
œX›XËÙ]Kİ]\Ëİ]\ËšœÛÛˆŠBˆX\šÙ\ˆHØY
œX›XËİŒ‹XZ[[X\šÙ\‹šœÛÛˆŠBˆ›ÛÙˆHØY
œ™\ÜËØœ˜[˜ÚXÛX[\\›ÛÙ‹šœÛÛˆŠBˆ›Üˆ^[ØY[ˆ
X[šY™\İ\™[ËİY™š^\Ë]\ËX\šÙ\ŠN‚ˆ\ÜÙ\^[ØY™Ù]
œ™[X\ÙHŠHOH‘SPTÑK^[ØY™Ù]
œ™[X\ÙHŠBˆ\ÜÙ\›ÛÙ‹™Ù]
œİ]HŠHOHœ\ÜÈˆ[™›ÛÙ‹™Ù]
˜Y\ˆŠHOHÈ›XZ[ˆ—Bˆ\™[ØÛİ[Hİ[J[Š˜[YJH›Üˆ˜[YH[ˆ\™[ÖÈœ\™[PØ]YÛÜH—K˜[Y\Ê
JBˆ]WØÛİ[Hİ[J[Š˜[YJH›Üˆ˜[YH[ˆ]\ÖÈ]PPØ]YÛÜH—K˜[Y\Ê
JBˆ\ÜÙ\\™[ØÛİ[OHŒM‚ˆ\ÜÙ\]WØÛİ[OHN‚ˆ]ÈH×Bˆ›ÜˆØ]YÛÜKX\[™È[ˆ\™[ÖÈœ\™[PØ]YÛÜH—Kš][\Ê
N‚ˆ›ÜˆÛİ\˜ÙK\™Ù][ˆX\[™Ëš][\Ê
N‚ˆYˆĞSKœÙX\˜Ú
İŠ\™Ù]
JNˆ]Ë˜\[™

Ø]YÛÜKÛİ\˜ÙK\™Ù]
JBˆ›ÜˆØ]YÛÜKX\[™È[ˆ]\ÖÈ]PPØ]YÛÜH—Kš][\Ê
N‚ˆ›ÜˆÛİ\˜ÙK\™Ù][ˆX\[™Ëš][\Ê
N‚ˆYˆĞSKœÙX\˜Ú
İŠ\™Ù]
JNˆ]Ë˜\[™

Ø]YÛÜKÛİ\˜ÙK\™Ù]
JBˆ\ÜÙ\›İ]Ë]ÖÎŒŒBˆØ[\\ÈHÂˆ
œØÙ[™L‹¸à­xà©8àâxà®xàâ8àï8àê¸àïš[KŒH
9í*Ëkºwµç