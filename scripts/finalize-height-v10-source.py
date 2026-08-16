#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)


path = Path('public/myfile/site-correction-v2.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "        bar.className = 'height-bar-v2';\n        bar.style.left",
    "        bar.className = 'height-bar-v2';\n        bar.dataset.category = layout.category[0];\n        bar.style.left",
    'bar category metadata',
)
text = replace_once(
    text,
    "        guide.dataset.character = item.entry.canonical;\n        plot.appendChild(guide);",
    "        guide.dataset.character = item.entry.canonical;\n        guide.dataset.category = layout.category[0];\n        plot.appendChild(guide);",
    'guide category metadata',
)
text = replace_once(
    text,
    "        point.dataset.character = item.entry.canonical;\n        point.dataset.height",
    "        point.dataset.character = item.entry.canonical;\n        point.dataset.category = layout.category[0];\n        point.dataset.height",
    'point category metadata',
)
text = replace_once(
    text,
    "      label.textContent = layout.category[1];\n      xAxis.appendChild(label);",
    "      label.dataset.category = layout.category[0];\n      label.textContent = layout.category[1];\n      xAxis.appendChild(label);",
    'axis label category metadata',
)
text = replace_once(
    text,
    "      const schoolKey = SCHOOL_DEFINITIONS.find(([key]) => key !== 'その他学校' && attributes.has(key));",
    "      const schoolKey = SCHOOL_DEFINITIONS.find(([key]) => !['その他学校', '__NO_SCHOOL__'].includes(key) && attributes.has(key));",
    'school display metadata',
)
path.write_text(text, encoding='utf-8')
