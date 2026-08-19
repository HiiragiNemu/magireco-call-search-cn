#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def text(path):
    return (ROOT / path).read_text(encoding='utf-8')

def must(condition, message):
    if not condition:
        raise SystemExit(message)

call_table = text('public/myfile/callTable.js')
must('私チャン (Watashi-chan / 我酱【直译】/人家)' in call_table, 'Aika text missing')
must('我酱【独特的自称】' not in call_table, 'old Aika text remains')

index = text('public/index.html')
must('点击右侧的“搜”' in index, 'new call instruction missing')
must('或此处的“称呼搜索”按钮' in index, 'new call button instruction missing')
must('母故事标题翻译清单（管理员）' in index, 'editor menu entry missing')
must('魔女文翻译' in index and '魔女文字解读' not in index, 'rune label not normalized')

layout = text('public/myfile/layout-v8.js')
must("createCallPanel('搜索条件', 'call-search-panel-v8', false)" in layout, 'search panel is not collapsed')
must('insertBefore(search.details, selection.details)' in layout, 'search panel is not first')

call_ui = text('public/myfile/call-ui-v10.js')
must("toggle.textContent = '操作说明'" not in call_ui, 'operation help button remains')
must('body.dataset.v21SearchLayout' in call_ui, 'V21 compact search layout missing')

css = text('public/myfile/hamburgerMenu.css')
must('V21 hamburger overlay isolation' in css, 'hamburger overlay fix missing')
must('body:has(.menu-btn:checked) #pagetop' in css, 'fixed top arrow hide rule missing')
must('body:has(.menu-btn:checked) .call-quick-rail-v10' in css, 'quick rail hide rule missing')

runes = text('public/runes.html')
for expected in ('runes-fix-v14.js', 'runes-chart-v15.js', 'runes-glyph-v16.js', 'runes-mask-glyph-v18.js'):
    must(expected in runes, f'{expected} not loaded')
must('魔女文翻译' in runes, 'runes title not renamed')

editor = text('public/story-title-editor.html')
for expected in ('story-title-editor-v2.css', 'story-title-editor-v2.js', 'story-title-password-v2.js'):
    must(expected in editor, f'{expected} not loaded')
must('备注' not in editor and '状态' not in editor, 'old editor fields remain in HTML')

story = text('public/story.html')
for expected in ('story-title-runtime-v2.js', 'story-grouped-results-v18.js'):
    must(expected in story, f'{expected} not loaded')

data = json.loads((ROOT / 'public/data/story-title-groups-v1.json').read_text(encoding='utf-8'))
groups = data.get('groups') or []
must(len(groups) > 1000, f'group catalog too small: {len(groups)}')
must(len(groups) < 2409, f'new grouping was not applied: {len(groups)}')
checks = {
    'Film.0': 6,
    'サイドストーリー Film.0': 30,
    '鏡の国のショコラティエPart1': 16,
    '復刻 みかづき荘のSummer Vacation 6日目': 16,
    'ウワサアクアリウムへようこそ': 21,
}
for source, expected_count in checks.items():
    rows = [group for group in groups if group.get('source_base') == source]
    must(len(rows) == 1, f'{source}: expected one parent, got {len(rows)}')
    must(rows[0].get('child_count') == expected_count,
         f'{source}: expected {expected_count} children, got {rows[0].get("child_count")}')

json_download = ROOT / 'public/downloads/story-title-groups.json'
must(json_download.exists() and json_download.read_text(encoding='utf-8').lstrip().startswith('{'), 'JSON download missing')
print(json.dumps({'state': 'pass', 'groups': len(groups), 'checks': checks}, ensure_ascii=False))
