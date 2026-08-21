#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

path = Path('scripts/v26-converge.py')
text = path.read_text(encoding='utf-8')
old = '''def prepare_permanent_updater() -> None:\n    old = ROOT / "scripts/finalize-v23.py"\n    prep = ROOT / "scripts/prepare-v24.py"\n    target = ROOT / "scripts/update-authoritative-titles.py"\n    if old.exists() and prep.exists():\n        run(sys.executable, str(prep.relative_to(ROOT)))\n        text = old.read_text(encoding="utf-8")\n        text = re.sub(r'RELEASE = "[^"]+"', 'RELEASE = "v26-authoritative-source"', text, count=1)\n        write_text(target, text)\n    elif old.exists() and not target.exists():\n        shutil.copy2(old, target)\n    if not target.exists():\n        raise RuntimeError("Could not prepare scripts/update-authoritative-titles.py")\n'''
new = '''def prepare_permanent_updater() -> None:\n    old = ROOT / "scripts/finalize-v23.py"\n    target = ROOT / "scripts/update-authoritative-titles.py"\n    if not old.exists():\n        if target.exists():\n            return\n        raise RuntimeError("Could not find scripts/finalize-v23.py")\n\n    text = old.read_text(encoding="utf-8")\n    text = re.sub(r'RELEASE = "[^"]+"', 'RELEASE = "v26-authoritative-source"', text, count=1)\n    text = text.replace(\n        'if match and 1000 + int(match.group(1)) in piece_map:',\n        'if match and int(match.group(1)) in piece_map:',\n    )\n    text = text.replace(\n        'piece_map.get(1000 + number) or MEMORIA_FALLBACK.get(number)',\n        'piece_map.get(number) or MEMORIA_FALLBACK.get(number)',\n    )\n    text = re.sub(\n        r'piece_map = \\{int\\(row\\["pieceId"\\]\\): str\\(row\\["pieceName"\\]\\)\\.strip\\(\\) for row in piece_rows if row\\.get\\("pieceId"\\) is not None and row\\.get\\("pieceName"\\)\\}',\n        'ordered_piece_rows = sorted((row for row in piece_rows if row.get("pieceId") is not None and row.get("pieceName")), key=lambda row: int(row["pieceId"]))\\n    piece_map = {ordinal: str(row["pieceName"]).strip() for ordinal, row in enumerate(ordered_piece_rows, start=1)}',\n        text,\n        count=1,\n    )\n    if 'ordered_piece_rows' not in text:\n        raise RuntimeError("Could not install ordinal memoria alignment in permanent updater")\n    write_text(target, text)\n'''
if old not in text:
    raise SystemExit('prepare_permanent_updater block not found')
text = text.replace(old, new)
text = text.replace(
    '"build-story-titles-v10.py", "build-story-title-groups-v1.py",',
    '"build-story-titles-v10.py",',
)
text = text.replace(
    '"improve-title-sources-v10.py", "audit-translations-v5.py", "v26-converge.py",',
    '"improve-title-sources-v10.py", "audit-translations-v5.py", "v26-converge.py", "v26-hotfix.py",',
)
path.write_text(text, encoding='utf-8')
