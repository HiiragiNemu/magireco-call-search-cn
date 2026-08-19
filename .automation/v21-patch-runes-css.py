#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'public/myfile/runes-v18.css'
text = path.read_text(encoding='utf-8')
text = text.replace('width: min(100%, 720px) !important;', 'width: min(100%, 360px) !important;')
text = text.replace('max-width: 720px !important;', 'max-width: 360px !important;')
text = text.replace('max-height: 560px !important;', 'max-height: 360px !important;')
if 'max-width: 360px !important;' not in text:
    raise SystemExit('Failed to apply compact rune-reference size')
path.write_text(text, encoding='utf-8', newline='\n')
print('Applied compact rune-reference size')
