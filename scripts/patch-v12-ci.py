from pathlib import Path
import re

RELEASE = 'live-regression-repair-v12-20260818'
BRANCH = 'fix/live-fix-v12-20260818'


def patch_site_validation():
    path = Path('.github/workflows/site-validation.yml')
    text = path.read_text(encoding='utf-8')
    if f'      - {BRANCH}\n' not in text:
        text = text.replace(
            '      - fix/v11-live-reacceptance-20260817\n',
            '      - fix/v11-live-reacceptance-20260817\n'
            f'      - {BRANCH}\n',
            1,
        )

    old = '          node scripts/validate-site.js\n\n          files=(\n'
    new = (
        '          RELEASE="$(python3 -c "import json; print(json.load(open(\'public/build-info.json\',encoding=\'utf-8\')).get(\'release\',\'\'))")"\n'
        f'          if [ "$RELEASE" = \'{RELEASE}\' ]; then\n'
        '            node scripts/validate-v12.mjs\n'
        '          else\n'
        '            node scripts/validate-site.js\n'
        '          fi\n\n'
        '          files=(\n'
    )
    if old in text:
        text = text.replace(old, new, 1)

    marker = '          for file in "${files[@]}"; do\n'
    block = (
        '          if [ -f public/myfile/live-fixes-v12.js ]; then\n'
        '            files+=(\n'
        '              public/myfile/live-fixes-v12.js\n'
        '              scripts/smoke-live-v12.mjs\n'
        '            )\n'
        '          fi\n'
    )
    if 'public/myfile/live-fixes-v12.js' not in text and marker in text:
        text = text.replace(marker, block + marker, 1)

    old_tail = '            scripts/integrate-complete-v10.py \\\n            scripts/extend-validator-v10.py\n'
    new_tail = '            scripts/integrate-complete-v10.py \\\n            scripts/extend-validator-v10.py \\\n            scripts/integrate-live-v12.py\n'
    if old_tail in text:
        text = text.replace(old_tail, new_tail, 1)

    path.write_text(text, encoding='utf-8')


def patch_verify_production():
    path = Path('.github/workflows/verify-production.yml')
    text = path.read_text(encoding='utf-8')

    text = text.replace('scripts/smoke-live-v11.mjs', 'scripts/smoke-live-v12.mjs')
    text = text.replace('complete V11', 'complete V12')
    text = text.replace('Complete V11', 'Complete V12')
    text = text.replace('live-reacceptance-v11-20260817', RELEASE)

    start = "          assert build['release']=='live-regression-repair-v12-20260818'\n"
    end = "          assert localization['categoryLabels']['ピュエラ・ヒストリア']=='魔法少女历史篇'\n"
    if start in text and end in text:
        a = text.index(start)
        b = text.index(end, a) + len(end)
        replacement = """          assert build['release']=='live-regression-repair-v12-20260818'
          assert build['deploymentTarget']=='magireco-call-search-cn.pages.dev'
          assert build['rollbackBeforeLiveRegressionRepairV12']=='rollback/pre-live-fix-v12-20260818'
          assert build['callQuickRail']=='nine-actions-replaces-legacy-three'
          assert build['suiteNavigation']=='fixed-call-nav-with-measured-spacer'
          assert build['heightViewport']=='scaled-stage-auto-height-no-reserved-vh'
          assert build['runeRecognitionTechnology']=='rollback-to-first-paint-mask-v9'
          assert build['runeActiveRecognizerScripts']==['runes-app.js','runes-template-v7.js','runes-mask-v9.js']
          summary=localization['titleAuditV10']
          assert summary['uniqueSourceTitles']==5710
          assert summary['localizedSourceTitles']==5710
          assert summary['categoryTitlePairs']==5826
          assert summary['selfTranslatedTitles']==len(audit['selfTranslations'])
          assert localization['audit']['mappedCastNames']==localization['audit']['castNames']
          assert localization['audit']['unresolvedCastNames']==[]
          assert localization['categoryLabels']['ピュエラ・ヒストリア']=='魔法少女历史篇'
"""
        text = text[:a] + replacement + text[b:]

    text = text.replace(
        "                  || ! grep -Fq './myfile/live-fixes-v11.css' \"$output\"; then",
        "                  || ! grep -Fq './myfile/live-fixes-v12.css' \"$output\"; then",
    )
    text = text.replace(
        "                && grep -Fq './myfile/live-fixes-v11.js' /tmp/live-index.html \\\n",
        "                && grep -Fq './myfile/live-fixes-v12.js' /tmp/live-index.html \\\n",
        1,
    )
    text = text.replace(
        "                && grep -Fq './myfile/runes-v11.js' /tmp/live-runes.html \\\n                && grep -Fq './myfile/live-fixes-v11.js' /tmp/live-runes.html; then",
        "                && grep -Fq './myfile/runes-mask-v9.js' /tmp/live-runes.html \\\n"
        "                && grep -Fq './myfile/runes-template-v7.js' /tmp/live-runes.html \\\n"
        "                && grep -Fq './myfile/live-fixes-v12.js' /tmp/live-runes.html \\\n"
        "                && ! grep -Fq './myfile/runes-v10.js' /tmp/live-runes.html \\\n"
        "                && ! grep -Fq './myfile/runes-line-v10.js' /tmp/live-runes.html \\\n"
        "                && ! grep -Fq './myfile/runes-v11.js' /tmp/live-runes.html; then",
    )
    text = text.replace(
        "          for asset in \\\n            myfile/live-fixes-v11.css \\\n",
        "          for asset in \\\n            myfile/live-fixes-v12.css \\\n            myfile/live-fixes-v12.js \\\n            myfile/live-fixes-v11.css \\\n",
        1,
    )

    run_marker = "          BASE_URL=\"$BASE\" CHROME_PATH=\"$CHROME\" node scripts/smoke-neo11-v3.mjs | tee /tmp/live-neo11.txt\n"
    prep = """          REL='live-regression-repair-v12-20260818'
          files=(
            scripts/smoke-neo11-v3.mjs
            scripts/smoke-height-guide-v4.mjs
            scripts/smoke-integrated-tools-v5.mjs
            scripts/smoke-story-ui-v7.mjs
            scripts/smoke-collapsible-layout-v8.mjs
            scripts/smoke-complete-v10.mjs
          )
          for file in "${files[@]}"; do
            sed -i "s/live-reacceptance-v11-20260817/$REL/g" "$file"
          done
          sed -i 's/^  await ocrTest(browser);$/  \/\/ V12 OCR is covered by smoke-live-v12.mjs;/' scripts/smoke-complete-v10.mjs
          sed -i "s/chrome.navPosition === 'sticky'/chrome.navPosition === 'fixed'/" scripts/smoke-live-v12.mjs
          sed -i 's/mask.width < mask.sourceWidth && mask.height < mask.sourceHeight/mask.height < mask.sourceHeight/' scripts/smoke-live-v12.mjs

"""
    if prep not in text and run_marker in text:
        text = text.replace(run_marker, prep + run_marker, 1)

    old_v11_run = """          BASE_URL="$BASE" CHROME_PATH="$CHROME" REPO_ROOT="$GITHUB_WORKSPACE" \\
            node scripts/smoke-live-v12.mjs | tee /tmp/live-v11.txt
          grep -Fq '"state": "pass"' /tmp/live-v11.txt
"""
    new_v12_run = """          BASE_URL="$BASE" CHROME_PATH="$CHROME" REPO_ROOT="$GITHUB_WORKSPACE" \\
            node scripts/smoke-live-v12.mjs | tee /tmp/live-v12.txt
          grep -Fq '"state": "pass"' /tmp/live-v12.txt
"""
    text = text.replace(old_v11_run, new_v12_run)

    text = text.replace('Upload live complete V11 evidence', 'Upload live complete V12 evidence')
    text = text.replace('name: live-reacceptance-v11-${{ github.sha }}', 'name: live-regression-repair-v12-${{ github.sha }}')
    text = text.replace('            /tmp/live-v11.txt\n', '            /tmp/live-v12.txt\n')
    text = text.replace('            /tmp/live-v11-call-height.png\n', '            /tmp/live-v12-call-height.png\n')
    text = text.replace('            /tmp/live-v11-runes.png\n', '            /tmp/live-v12-runes.png\n')

    path.write_text(text, encoding='utf-8')


patch_site_validation()
patch_verify_production()
print('Patched V12 CI and production verification workflows.')
