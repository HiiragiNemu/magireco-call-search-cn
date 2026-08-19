#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'scripts/build-story-title-groups-v1.py'
text = path.read_text(encoding='utf-8')
old = 'BARE_NUMBER_RE = re.compile(r"^(?P<base>.+?)(?P<joiner>[\\s\\u3000]+)(?P<number>\\d+)$")'
new = 'BARE_NUMBER_RE = re.compile(r"^(?P<base>.+?)(?P<joiner>[\\s\\u3000]+)(?P<number>\\d+(?:\\s*[（(][^()（）]*[)）])?)$")'
if new not in text:
    if old not in text:
        raise SystemExit('BARE_NUMBER_RE anchor was not found')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8', newline='\n')
print('Applied numbered-parenthetical grouping rule')
