#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8', newline='\n')

def replace(path, old, new, required=True):
    text = read(path)
    if new in text:
        return
    if old not in text:
        if required:
            raise RuntimeError(f'{path}: expected text not found: {old!r}')
        return
    write(path, text.replace(old, new))

replace(
    'public/myfile/callTable.js',
    '私チャン (Watashi-chan / 我酱【独特的自称】)',
    '私チャン (Watashi-chan / 我酱【直译】/人家)',
)

replace('public/myfile/tools-suite.js', "label: '魔女文字解读'", "label: '魔女文翻译'")
replace('public/myfile/layout-v8.js', "['runes.html', '魔女文字解读']", "['runes.html', '魔女文翻译']")

path = 'public/myfile/layout-v8.js'
text = read(path)
text = text.replace(
    "const search = createCallPanel('搜索条件', 'call-search-panel-v8', true);",
    "const search = createCallPanel('搜索条件', 'call-search-panel-v8', false);",
)
text = text.replace(
    "selection.details.insertAdjacentElement('afterend', search.details);",
    "selection.details.parentNode.insertBefore(search.details, selection.details);",
)
write(path, text)

path = 'public/myfile/call-ui-v10.js'
text = read(path)
replacement = '''function enhanceSearchPanel() {
    const panel = document.querySelector('.call-search-panel-v8');
    const body = panel?.querySelector(':scope > .call-panel-body-v8');
    if (!body || body.dataset.v21SearchLayout === 'true') return;
    body.dataset.v21SearchLayout = 'true';
    document.querySelectorAll('.call-help-toggle-v10, .call-help-details-v10').forEach((node) => node.remove());
    removeOldHelpText();
  }

  function ensureResultStructure()'''
text, count = re.subn(
    r'function enhanceSearchPanel\(\) \{.*?\n  \}\n\n  function ensureResultStructure\(\)',
    replacement,
    text,
    count=1,
    flags=re.S,
)
if count != 1 and 'body.dataset.v21SearchLayout' not in text:
    raise RuntimeError('call-ui-v10.js: enhanceSearchPanel replacement failed')
write(path, text)

for html_path in (ROOT / 'public').glob('*.html'):
    html = html_path.read_text(encoding='utf-8')
    html = html.replace('魔女文字解读工具', '魔女文翻译')
    html = html.replace('魔女文字解读', '魔女文翻译')
    if html_path.name == 'index.html':
        html = html.replace('点击右下角的', '点击右侧的“搜”')
        html = html.replace('或“搜索”按钮', '或此处的“称呼搜索”按钮')
        html = re.sub(r'\s*<i class="fa fa-share-alt-square"[^>]*></i>\s*', '\n', html, count=1)
        editor = '<li><a href="./story-title-editor.html">母故事标题翻译清单（管理员）</a></li>'
        if editor not in html:
            anchor = '<li><a href="./story.html">角色故事搜索</a></li>'
            if anchor not in html:
                raise RuntimeError('index.html: story menu anchor not found')
            html = html.replace(anchor, anchor + '\n\t\t\t\t' + editor, 1)
        html = re.sub(
            r'<body(?:\s+data-build="[^"]*")?',
            '<body data-build="safe-call-layout-v21-20260819"',
            html,
            count=1,
        )
    html_path.write_text(html, encoding='utf-8', newline='\n')

path = 'public/myfile/hamburgerMenu.css'
text = read(path)
marker = '/* V21 hamburger overlay isolation */'
if marker not in text:
    text += r'''

/* V21 hamburger overlay isolation */
.header {
  z-index: 2147483000;
  isolation: isolate;
}
.header .menu { z-index: 2147483001; }
.header .menu-icon { z-index: 2147483002; }
body:has(.menu-btn:checked) { overflow: hidden; }
body:has(.menu-btn:checked) #pagetop,
body:has(.menu-btn:checked) #pagemdl,
body:has(.menu-btn:checked) #pagebtm,
body:has(.menu-btn:checked) .call-quick-rail-v10 {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
'''
write(path, text)

markers = {
    'runes.html': 'rune-glyph-color-chart-v21-20260819',
    'story-title-editor.html': 'story-title-dense-v21-20260819',
    'story.html': 'story-parent-map-v21-20260819',
}
for name, marker in markers.items():
    path = ROOT / 'public' / name
    html = path.read_text(encoding='utf-8')
    html = re.sub(r'<body(?:\s+data-build="[^"]*")?', f'<body data-build="{marker}"', html, count=1)
    path.write_text(html, encoding='utf-8', newline='\n')

print('V21 patches applied')
