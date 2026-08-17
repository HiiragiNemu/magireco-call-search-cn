from pathlib import Path
import json
import re

RELEASE = 'live-regression-repair-v12-20260818'
OLD = 'live-reacceptance-v11-20260817'
PAGES = [
    Path('public/index.html'),
    Path('public/story.html'),
    Path('public/attendance.html'),
    Path('public/runes.html'),
]


def patch_page(path: Path):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'data-build="[^"]+"', f'data-build="{RELEASE}"', text, count=1)

    css_ref = './myfile/live-fixes-v12.css'
    if css_ref not in text:
        marker = '<link rel="stylesheet" href="./myfile/live-fixes-v11.css">'
        if marker in text:
            text = text.replace(marker, marker + f'\n  <link rel="stylesheet" href="{css_ref}">', 1)
        else:
            text = text.replace('</head>', f'  <link rel="stylesheet" href="{css_ref}">\n</head>', 1)

    js_ref = './myfile/live-fixes-v12.js'
    if js_ref not in text:
        text = text.replace('</body>', f'  <script src="{js_ref}"></script>\n</body>', 1)

    if path.name == 'runes.html':
        # V12 intentionally restores the first paint-mask recognition stack:
        # runes-app -> runes-template-v7 -> runes-mask-v9. Later V10/V11
        # recognition wrappers remain in git for rollback/reference but are not
        # loaded in production.
        for asset in ('runes-v10.js', 'runes-line-v10.js', 'runes-v11.js'):
            text = re.sub(
                rf'\s*<script\s+src=["\']\./myfile/{re.escape(asset)}["\']\s*></script>',
                '',
                text,
                flags=re.IGNORECASE,
            )

    path.write_text(text, encoding='utf-8')


for page in PAGES:
    patch_page(page)

build_path = Path('public/build-info.json')
build = json.loads(build_path.read_text(encoding='utf-8'))
build.update({
    'release': RELEASE,
    'deploymentTarget': 'magireco-call-search-cn.pages.dev',
    'rollbackBeforeLiveRegressionRepairV12': 'rollback/pre-live-fix-v12-20260818',
    'suiteNavigation': 'document-sticky-body-level-call-nav',
    'callQuickRail': 'nine-actions-replaces-legacy-three',
    'heightViewport': 'scaled-stage-auto-height-no-reserved-vh',
    'runeRecognitionTechnology': 'rollback-to-first-paint-mask-v9',
    'runeActiveRecognizerScripts': [
        'runes-app.js',
        'runes-template-v7.js',
        'runes-mask-v9.js',
    ],
    'runeMaskMeaning': 'painted-selection-binary-crop',
    'runeAutoRouting': 'generic-v7-v9-template-and-classic-multipass',
    'runeDecorativeLineAuto': 'no-alphabet-special-routing',
    'runePaintedLineDecoder': 'v9-mask-to-v7-template-classic',
    'realDeviceRegressionRepair': 'height-nav-legacy-rail-rune-tech-rollback',
})
build_path.write_text(json.dumps(build, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

acceptance = Path('public/__acceptance.html')
if acceptance.exists():
    text = acceptance.read_text(encoding='utf-8')
    text = text.replace(OLD, RELEASE)
    acceptance.write_text(text, encoding='utf-8')

print(f'Integrated {RELEASE}.')
