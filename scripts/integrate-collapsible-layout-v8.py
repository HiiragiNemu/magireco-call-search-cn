#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

RELEASE = "collapsible-layout-v8-20260816"


def inject_after(text: str, anchor: str, insertion: str, label: str) -> str:
    if insertion in text:
        return text
    count = text.count(anchor)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    return text.replace(anchor, anchor + "\n" + insertion, 1)


def update_page(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)
    if count != 1:
        raise SystemExit(f"{path}: data-build marker missing")
    indent = "\t" if "\t<link rel=\"stylesheet\" href=\"./myfile/suite-v7.css\">" in text else "  "
    text = inject_after(
        text,
        f'{indent}<link rel="stylesheet" href="./myfile/suite-v7.css">',
        f'{indent}<link rel="stylesheet" href="./myfile/layout-v8.css">',
        f"{path} V8 CSS",
    )
    script = f'{indent}<script src="./myfile/layout-v8.js"></script>'
    if script not in text:
        closing = f"{indent}</body>" if f"{indent}</body>" in text else "</body>"
        if text.count(closing) != 1:
            raise SystemExit(f"{path}: body closing anchor missing")
        text = text.replace(closing, script + "\n" + closing, 1)
    path.write_text(text, encoding="utf-8")


def patch_build_info() -> None:
    path = Path("public/build-info.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    value.update({
        "release": RELEASE,
        "rollbackBeforeCollapsibleLayoutV8": "rollback/pre-collapsible-layout-v8-20260816",
        "panelLayout": "collapsible-search-selection-attributes-results",
        "characterGridScrollMode": "document-flow-no-internal-scrollbar",
        "attendanceDesktopLayout": "balanced-selection-and-ranking-halves",
        "attendanceDisplayName": "共同出场次数排行",
        "suiteNavigationIcons": False,
        "callCharacterCount": "visible-total-selected-live",
        "ocrStage": "unchanged-from-v7-pending-mask-v9",
    })
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_expected_releases() -> None:
    files = [
        "public/__acceptance.html",
        "scripts/smoke-neo11-v3.mjs",
        "scripts/smoke-height-guide-v4.mjs",
        "scripts/smoke-integrated-tools-v5.mjs",
        "scripts/smoke-story-layout-v6.mjs",
        "scripts/smoke-ocr-v6.mjs",
        "scripts/smoke-story-ui-v7.mjs",
        "scripts/smoke-rune-v7.mjs",
    ]
    pattern = re.compile(r"const EXPECTED_RELEASE = '[^']+';")
    for filename in files:
        path = Path(filename)
        text = path.read_text(encoding="utf-8")
        text, count = pattern.subn(f"const EXPECTED_RELEASE = '{RELEASE}';", text, count=1)
        if count != 1:
            raise SystemExit(f"{filename}: expected-release constant missing")
        path.write_text(text, encoding="utf-8")


def patch_validator() -> None:
    path = Path("scripts/validate-site.js")
    text = path.read_text(encoding="utf-8")
    if "V8: 'collapsible-layout-v8-20260816'" not in text:
        text = text.replace(
            "  V7: 'story-ui-translation-ocr-v7-20260816'\n});",
            "  V7: 'story-ui-translation-ocr-v7-20260816',\n  V8: 'collapsible-layout-v8-20260816'\n});",
            1,
        )
    if "const isV8 = release === RELEASES.V8;" not in text:
        text = text.replace(
            "const isV7 = release === RELEASES.V7;\nconst isV6 = release === RELEASES.V6 || isV7;",
            "const isV8 = release === RELEASES.V8;\nconst isV7 = release === RELEASES.V7 || isV8;\nconst isV6 = release === RELEASES.V6 || isV7;",
            1,
        )

    block = r'''
if (isV8) {
  for (const file of [
    'public/myfile/layout-v8.css', 'public/myfile/layout-v8.js',
    'scripts/integrate-collapsible-layout-v8.py', 'scripts/smoke-collapsible-layout-v8.mjs'
  ]) requireFile(file);
  for (const page of ['public/index.html', 'public/story.html', 'public/attendance.html', 'public/runes.html']) {
    const pageText = read(page);
    if (!pageText.includes('./myfile/layout-v8.css')) fail(`${page} missing V8 layout CSS.`);
    if (!pageText.includes('./myfile/layout-v8.js')) fail(`${page} missing V8 layout JavaScript.`);
  }
  const layoutV8 = read('public/myfile/layout-v8.js');
  for (const marker of [
    'prepareStoryPage', 'prepareAttendancePage', 'prepareCallPage',
    'installCharacterGridDetails', 'wrapCallResults', '共同出场次数排行'
  ]) {
    if (!layoutV8.includes(marker)) fail(`V8 layout marker missing: ${marker}`);
  }
  const cssV8 = read('public/myfile/layout-v8.css');
  for (const marker of [
    'attendance-workspace-v8', 'character-grid-details-v8',
    'max-height: none !important', 'overflow: visible !important'
  ]) {
    if (!cssV8.includes(marker)) fail(`V8 CSS marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeCollapsibleLayoutV8 !== 'rollback/pre-collapsible-layout-v8-20260816') {
    fail('V8 rollback pointer missing or incorrect.');
  }
  if (buildInfo.characterGridScrollMode !== 'document-flow-no-internal-scrollbar') {
    fail('V8 character-grid scroll policy is incorrect.');
  }
  if (buildInfo.attendanceDisplayName !== '共同出场次数排行') {
    fail('V8 attendance display name is incorrect.');
  }
}
'''
    anchor = "\nif (failed) process.exit(1);"
    if "if (isV8) {" not in text:
        if anchor not in text:
            raise SystemExit("validate-site final anchor missing")
        text = text.replace(anchor, "\n" + block + anchor, 1)
    path.write_text(text, encoding="utf-8")


def patch_site_validation() -> None:
    path = Path(".github/workflows/site-validation.yml")
    text = path.read_text(encoding="utf-8")
    if "fix/collapsible-layout-v8-20260816" not in text:
        text = text.replace(
            "      - fix/story-ui-translation-ocr-v7-20260816\n",
            "      - fix/story-ui-translation-ocr-v7-20260816\n      - fix/collapsible-layout-v8-20260816\n",
            1,
        )
    if "public/myfile/layout-v8.js" not in text:
        anchor = "              scripts/smoke-rune-v7.mjs\n"
        addition = anchor + "              public/myfile/layout-v8.js\n              scripts/smoke-collapsible-layout-v8.mjs\n"
        if anchor not in text:
            raise SystemExit("site-validation V7 JavaScript anchor missing")
        text = text.replace(anchor, addition, 1)
    if "scripts/integrate-collapsible-layout-v8.py" not in text:
        text = text.replace(
            "            scripts/integrate-story-ui-v7.py\n",
            "            scripts/integrate-story-ui-v7.py \\\n            scripts/integrate-collapsible-layout-v8.py\n",
            1,
        )
    path.write_text(text, encoding="utf-8")


def main() -> int:
    for filename in ["public/index.html", "public/story.html", "public/attendance.html", "public/runes.html"]:
        update_page(Path(filename))
    patch_build_info()
    patch_expected_releases()
    patch_validator()
    patch_site_validation()
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
