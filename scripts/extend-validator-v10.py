#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

RELEASE = "height-export-title-call-rune-v10-20260817"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    path = Path("scripts/validate-site.js")
    text = path.read_text(encoding="utf-8")

    if "V10: 'height-export-title-call-rune-v10-20260817'" not in text:
        text = replace_once(
            text,
            "  V9: 'rune-mask-v9-20260816'\n});",
            "  V9: 'rune-mask-v9-20260816',\n  V10: 'height-export-title-call-rune-v10-20260817'\n});",
            "V10 release identifier",
        )
    if "const isV10 = release === RELEASES.V10;" not in text:
        text = replace_once(
            text,
            "const isV9 = release === RELEASES.V9;",
            "const isV10 = release === RELEASES.V10;\nconst isV9 = release === RELEASES.V9 || isV10;",
            "V10 release-family chain",
        )

    marker = "\nif (failed) process.exit(1);"
    if "if (isV10) {" not in text:
        block = r'''

if (isV10) {
  for (const file of [
    'public/myfile/call-ui-v10.js', 'public/myfile/site-correction-v10.css',
    'public/myfile/height-export-v10.js', 'public/myfile/runes-v10.js',
    'public/myfile/runes-line-v10.js', 'public/myfile/runes-v10.css',
    'public/data/story-v10/title-audit.json',
    'docs/story-title-self-translations-v10.md', 'scripts/build-story-titles-v10.py',
    'scripts/assemble-runes-v10.py', 'scripts/integrate-height-export-title-call-v10.py',
    'scripts/integrate-complete-v10.py', 'scripts/finalize-height-v10-source.py',
    'scripts/smoke-complete-v10.mjs'
  ]) requireFile(file);

  const rootV10 = read('public/index.html');
  for (const marker of ['./myfile/site-correction-v10.css', './myfile/call-ui-v10.js', './myfile/height-export-v10.js']) {
    if (!rootV10.includes(marker)) fail(`V10 root page missing ${marker}`);
  }
  const callUiV10 = read('public/myfile/call-ui-v10.js');
  for (const marker of ['call-table-details-v10', 'call-help-details-v10', 'call-quick-rail-v10', '执行称呼搜索']) {
    if (!callUiV10.includes(marker)) fail(`V10 call UI marker missing: ${marker}`);
  }
  const heightV10 = read('public/myfile/height-export-v10.js');
  for (const marker of ['renderExportCanvas', 'exportLeftAxes', 'exportRightAxes', 'MAX_CANVAS_AREA']) {
    if (!heightV10.includes(marker)) fail(`V10 height-export marker missing: ${marker}`);
  }
  const heightSourceV10 = read('public/myfile/site-correction-v2.js');
  for (const marker of ['__NO_AGE__', '__NO_SCHOOL__', '__NO_ORGANIZATION__', "range.max = '250'", 'heightState.scale * 200']) {
    if (!heightSourceV10.includes(marker)) fail(`V10 height-source marker missing: ${marker}`);
  }

  const runesV10Page = read('public/runes.html');
  for (const marker of ['./myfile/runes-v10.css', './myfile/runes-v10.js', './myfile/runes-line-v10.js']) {
    if (!runesV10Page.includes(marker)) fail(`V10 runes page missing ${marker}`);
  }
  const runesV10 = read('public/myfile/runes-v10.js');
  for (const marker of ['detectAlphabetGrid', 'recognizeAlphabet', 'buildSmartMaskedFile', 'expanded-rectangular-selection', '__RUNE_V10__', '较慢但更准确']) {
    if (!runesV10.includes(marker)) fail(`V10 rune marker missing: ${marker}`);
  }
  const runesLineV10 = read('public/myfile/runes-line-v10.js');
  for (const marker of ['recognizePaintedLine', 'painted-line-dp', 'paint-guided line segmentation', 'skipCost']) {
    if (!runesLineV10.includes(marker)) fail(`V10 painted-line marker missing: ${marker}`);
  }

  const localizationV10 = JSON.parse(read('public/data/story-v7/localization.json'));
  const titleAuditV10 = JSON.parse(read('public/data/story-v10/title-audit.json'));
  if (localizationV10.titleAuditV10?.uniqueSourceTitles !== 5710
      || localizationV10.titleAuditV10?.localizedSourceTitles !== 5710) {
    fail('V10 story-title localization does not cover all 5,710 source titles.');
  }
  if (localizationV10.titleAuditV10?.selfTranslatedTitles !== titleAuditV10.selfTranslations?.length) {
    fail('V10 self-translation audit count is inconsistent.');
  }
  if (Object.keys(localizationV10.titleExact || {}).length < 5710) {
    fail('V10 titleExact map is unexpectedly incomplete.');
  }
  if (!read('docs/story-title-self-translations-v10.md').includes('## 助手自译清单')) {
    fail('V10 self-translation Markdown audit is incomplete.');
  }

  if (buildInfo.rollbackBeforeHeightExportTitleCallRuneV10 !== 'rollback/pre-height-export-title-call-v10-20260817') {
    fail('V10 rollback pointer is missing or incorrect.');
  }
  if (buildInfo.callQuickRail !== 'nine-Chinese-actions') fail('V10 call quick rail marker is incorrect.');
  if (buildInfo.heightScaleDisplayedRange !== '50-250-percent') fail('V10 height scale marker is incorrect.');
  if (buildInfo.runeMaskMeaning !== 'expanded-selection-region-not-exact-pixel-clipping') fail('V10 mask semantics marker is incorrect.');
  if (buildInfo.runePaintedLineDecoder !== 'template-dynamic-programming-with-noise-skips') fail('V10 painted-line decoder marker is incorrect.');
}
'''
        text = replace_once(text, marker, block + marker, "V10 validation block")

    path.write_text(text, encoding="utf-8")
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
