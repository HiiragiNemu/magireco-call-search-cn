#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import re

RELEASE = "height-export-title-call-v10-20260817"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)


def insert_after(text: str, anchor: str, insertion: str, label: str) -> str:
    if insertion in text:
        return text
    return replace_once(text, anchor, anchor + "\n" + insertion, label)


def patch_height_source() -> None:
    path = Path("public/myfile/site-correction-v2.js")
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "    ['その他学校', '其他学校']\n  ];",
        "    ['その他学校', '其他学校'],\n    ['__NO_SCHOOL__', '无学校信息']\n  ];",
        "school unknown category",
    )
    text = replace_once(
        text,
        "    ['ヒストリア', '历史篇']\n  ];",
        "    ['ヒストリア', '历史篇'],\n    ['__NO_ORGANIZATION__', '无从属组织信息']\n  ];",
        "organization unknown category",
    )
    text = replace_once(
        text,
        "    scale: global.matchMedia(MOBILE_QUERY).matches ? 0.68 : 1,",
        "    scale: 0.5,",
        "height default scale",
    )
    text = replace_once(
        text,
        "      }).concat([['其他', '其他']]);",
        "      }).concat([['其他', '其他年龄'], ['__NO_AGE__', '无年龄信息']]);",
        "age unknown definitions",
    )

    old_age = """    if (mode === 'age') {
      const age = parseNumber(details instanceof Map ? details.get('年龄') || details.get('年齢') : '');
      const key = Number.isFinite(age) && age >= 10 && age <= 20 && Number.isInteger(age) ? String(age) : '其他';
      if (categoryKeys.has(key)) result.add(key);
      return result;
    }"""
    new_age = """    if (mode === 'age') {
      const rawAge = details instanceof Map ? String(details.get('年龄') || details.get('年齢') || '').trim() : '';
      const age = parseNumber(rawAge);
      const missing = !rawAge || rawAge === '-' || rawAge === '?' || /不详|不明|未知/u.test(rawAge);
      const key = missing
        ? '__NO_AGE__'
        : (Number.isFinite(age) && age >= 10 && age <= 20 && Number.isInteger(age) ? String(age) : '其他');
      if (categoryKeys.has(key)) result.add(key);
      return result;
    }"""
    text = replace_once(text, old_age, new_age, "age matching")

    old_school = """    if (mode === 'school') {
      for (const [key] of SCHOOL_DEFINITIONS) {
        if (key !== 'その他学校' && attributes.has(key) && categoryKeys.has(key)) result.add(key);
      }
      if (!result.size && categoryKeys.has('その他学校')) result.add('その他学校');
      return result;
    }
    for (const key of categoryKeys) if (attributes.has(key)) result.add(key);
    return result;"""
    new_school = """    if (mode === 'school') {
      const known = new Set(SCHOOL_DEFINITIONS.map(([key]) => key).filter((key) => !['その他学校', '__NO_SCHOOL__'].includes(key)));
      for (const key of known) if (attributes.has(key) && categoryKeys.has(key)) result.add(key);
      if (!result.size) {
        const schoolLike = [...attributes].some((value) => /学園|学院|学校|中学|高校|高等|学舎|アカデミー/u.test(String(value)));
        const fallback = schoolLike ? 'その他学校' : '__NO_SCHOOL__';
        if (categoryKeys.has(fallback)) result.add(fallback);
      }
      return result;
    }
    if (mode === 'organization') {
      const known = ORGANIZATION_DEFINITIONS.map(([key]) => key).filter((key) => key !== '__NO_ORGANIZATION__');
      for (const key of known) if (attributes.has(key) && categoryKeys.has(key)) result.add(key);
      if (!result.size && categoryKeys.has('__NO_ORGANIZATION__')) result.add('__NO_ORGANIZATION__');
      return result;
    }
    for (const key of categoryKeys) if (attributes.has(key)) result.add(key);
    return result;"""
    text = replace_once(text, old_school, new_school, "school and organization matching")

    old_refresh = """  function refreshHeightScaleReadout() {
    const readout = document.querySelector('[data-height-scale-readout-v2]');
    if (readout) readout.textContent = `${Math.round(heightState.scale * 100)}%`;
    const range = document.querySelector('[data-height-scale-range-v2]');
    if (range) range.value = String(Math.round(heightState.scale * 100));
  }

  function applyHeightScale(scale, mode) {
    heightState.scale = clamp(scale, 0.25, 1.6);"""
    new_refresh = """  function refreshHeightScaleReadout() {
    const displayPercent = Math.round(heightState.scale * 200);
    const readout = document.querySelector('[data-height-scale-readout-v2]');
    if (readout) {
      readout.textContent = `${displayPercent}%`;
      readout.classList.add('height-scale-readout-v10');
    }
    const range = document.querySelector('[data-height-scale-range-v2]');
    if (range) range.value = String(displayPercent);
    const controls = document.querySelector('.height-zoom-controls-v2');
    if (controls) controls.dataset.v10Scale = 'true';
  }

  function applyHeightScale(scale, mode) {
    heightState.scale = clamp(scale, 0.25, 1.25);"""
    text = replace_once(text, old_refresh, new_refresh, "height scale readout and clamp")
    text = replace_once(
        text,
        "    const scale = clamp((viewport.clientWidth - 4) / natural.width, 0.25, 1);",
        "    const scale = clamp((viewport.clientWidth - 4) / natural.width, 0.25, 1.25);",
        "height fit clamp",
    )

    old_controls = """    controls.appendChild(makeButton('适应屏幕', '将完整身高图适配到当前显示框宽度', fitHeightChart));
    controls.appendChild(makeButton('−', '缩小身高图', () => applyHeightScale(heightState.scale - 0.08, 'manual')));

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '25';
    range.max = '160';
    range.step = '5';
    range.value = String(Math.round(heightState.scale * 100));
    range.dataset.heightScaleRangeV2 = '';
    range.setAttribute('aria-label', '身高图缩放比例');
    range.addEventListener('input', () => applyHeightScale(Number(range.value) / 100, 'manual'));
    controls.appendChild(range);

    controls.appendChild(makeButton('＋', '放大身高图', () => applyHeightScale(heightState.scale + 0.08, 'manual')));
    controls.appendChild(makeButton('100%', '恢复身高图原始大小', () => applyHeightScale(1, 'manual')));"""
    new_controls = """    controls.appendChild(makeButton('适应屏幕', '将完整身高图适配到当前显示框宽度', fitHeightChart));
    controls.appendChild(makeButton('−', '缩小身高图', () => applyHeightScale(heightState.scale - 0.05, 'manual')));

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '50';
    range.max = '250';
    range.step = '10';
    range.value = String(Math.round(heightState.scale * 200));
    range.dataset.heightScaleRangeV2 = '';
    range.setAttribute('aria-label', '身高图缩放比例；100%等于旧版50%基准');
    range.addEventListener('input', () => applyHeightScale(Number(range.value) / 200, 'manual'));
    controls.appendChild(range);

    controls.appendChild(makeButton('＋', '放大身高图', () => applyHeightScale(heightState.scale + 0.05, 'manual')));
    controls.appendChild(makeButton('100%', '恢复身高图紧凑基准大小', () => applyHeightScale(0.5, 'manual')));"""
    text = replace_once(text, old_controls, new_controls, "height scale controls")

    # Existing scatter points are built only for entries with valid height, which is
    # correct. Unknown age/school/organization categories now retain every such point.
    path.write_text(text, encoding="utf-8")


def patch_index() -> None:
    path = Path("public/index.html")
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)
    if count != 1:
        raise SystemExit("index body release marker missing")

    css_anchor = '<link rel="stylesheet" href="./myfile/rune-mask-v9.css">'
    if css_anchor not in text:
        css_anchor = '<link rel="stylesheet" href="./myfile/layout-v8.css">'
    text = insert_after(text, css_anchor, '<link rel="stylesheet" href="./myfile/site-correction-v10.css">', "V10 CSS")

    script_anchor = '<script src="./myfile/rune-mask-v9.js"></script>'
    if script_anchor not in text:
        script_anchor = '<script src="./myfile/layout-v8.js"></script>'
    scripts = '<script src="./myfile/call-ui-v10.js"></script>\n<script src="./myfile/height-export-v10.js"></script>'
    text = insert_after(text, script_anchor, scripts, "V10 scripts")
    path.write_text(text, encoding="utf-8")


def patch_build_info() -> None:
    path = Path("public/build-info.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    value.update({
        "release": RELEASE,
        "rollbackBeforeHeightExportTitleCallV10": "rollback/pre-height-export-title-call-v10-20260817",
        "callRelationshipTableFold": True,
        "callHelpLayout": "desktop-right-column-independent-fold",
        "callQuickRail": "nine-Chinese-actions",
        "heightScaleBaseline": "display-100-equals-legacy-50",
        "heightScaleDisplayedRange": "50-250-percent",
        "heightUnknownCategories": ["无年龄信息", "无学校信息", "无从属组织信息"],
        "heightExport": "full-unscaled-dual-outer-rulers-high-dpi-png",
        "storyTitleLocalization": "complete-reader-wiki-structural-self-audited",
        "storyTitleAudit": "docs/story-title-self-translations-v10.md",
    })
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_expected_releases() -> None:
    files = [
        "public/__acceptance.html",
        "scripts/smoke-neo11-v3.mjs",
        "scripts/smoke-height-guide-v4.mjs",
        "scripts/smoke-integrated-tools-v5.mjs",
        "scripts/smoke-story-ui-v7.mjs",
        "scripts/smoke-rune-v7.mjs",
        "scripts/smoke-collapsible-layout-v8.mjs",
        "scripts/smoke-rune-mask-v9.mjs",
    ]
    pattern = re.compile(r"const EXPECTED_RELEASE = '[^']+';")
    for filename in files:
        path = Path(filename)
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        text, count = pattern.subn(f"const EXPECTED_RELEASE = '{RELEASE}';", text, count=1)
        if count != 1:
            raise SystemExit(f"release constant missing: {filename}")
        path.write_text(text, encoding="utf-8")


def main() -> int:
    patch_height_source()
    patch_index()
    patch_build_info()
    patch_expected_releases()
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
