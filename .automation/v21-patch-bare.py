#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]

path = root / 'scripts/build-story-title-groups-v1.py'
text = path.read_text(encoding='utf-8')
old = 'BARE_NUMBER_RE = re.compile(r"^(?P<base>.+?)(?P<joiner>[\\s\\u3000]+)(?P<number>\\d+)$")'
new = 'BARE_NUMBER_RE = re.compile(r"^(?P<base>.+?)(?P<joiner>[\\s\\u3000]+)(?P<number>\\d+(?:\\s*[（(][^()（）]*[)）])?)$")'
if new not in text:
    if old not in text:
        raise SystemExit('BARE_NUMBER_RE anchor was not found')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8', newline='\n')
print('Applied numbered-parenthetical grouping rule')

path = root / 'public/myfile/runes-v18.css'
text = path.read_text(encoding='utf-8')
text = text.replace('width: min(100%, 720px) !important;', 'width: min(100%, 360px) !important;')
text = text.replace('max-width: 720px !important;', 'max-width: 360px !important;')
text = text.replace('max-height: 560px !important;', 'max-height: 360px !important;')
if 'max-width: 360px !important;' not in text:
    raise SystemExit('Failed to apply compact rune-reference size')
path.write_text(text, encoding='utf-8', newline='\n')
print('Applied compact rune-reference size')
