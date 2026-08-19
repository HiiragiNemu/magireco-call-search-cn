#!/usr/bin/env python3
from pathlib import Path
import base64
import hashlib
import io
import shutil
import subprocess
import tarfile

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

# Recover the exact user-provided OCR fixtures from the reviewed fixture bundle.
chunks = []
for part in range(1, 7):
    member = f'scripts/v18-fixtures/part-{part:02d}.b64'
    chunks.append(subprocess.check_output(
        ['git', 'show', f'origin/safe-v18-production-fix:{member}'],
        cwd=root,
        text=True,
    ).strip())
payload = ''.join(chunks)
data = base64.b64decode(payload, validate=True)
expected = '4af08b2ef717b4fddff7b5d6cdf4a7f34df5cf959299196e8a1134de3e05456a'
actual = hashlib.sha256(data).hexdigest()
if actual != expected:
    raise SystemExit(f'Fixture bundle checksum mismatch: {actual} != {expected}')
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    members = archive.getmembers()
    for member in members:
        target = (root / member.name).resolve()
        if target != root.resolve() and root.resolve() not in target.parents:
            raise SystemExit(f'Unsafe fixture member: {member.name}')
    archive.extractall(root)
print(f'Extracted {len(members)} real OCR fixture members:')
for member in members:
    print(f'  {member.name}')

fixture_dir = root / 'tests/fixtures/runes'
fixture_dir.mkdir(parents=True, exist_ok=True)
extracted_files = []
for member in members:
    candidate = root / member.name
    if candidate.is_file() and candidate.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}:
        extracted_files.append(candidate)

charlotte = fixture_dir / 'charlotte.png'
if not charlotte.exists():
    candidates = [p for p in extracted_files if p.suffix.lower() == '.png'
                  and ('qq20260818-164056' in p.name.lower() or 'charlotte' in p.name.lower())]
    if not candidates:
        pngs = [p for p in extracted_files if p.suffix.lower() == '.png']
        if len(pngs) == 1:
            candidates = pngs
    if candidates:
        shutil.copyfile(candidates[0], charlotte)

alphabet = fixture_dir / 'alphabet.jpg'
if not alphabet.exists():
    candidates = [p for p in extracted_files if p.name.lower() == 'images.jpg'
                  or 'alphabet' in p.name.lower()]
    if candidates:
        shutil.copyfile(candidates[0], alphabet)

decorated = fixture_dir / 'decorated.jpg'
if not decorated.exists():
    candidates = [p for p in extracted_files if p.name.lower() in {'images (1).jpg', 'images_1.jpg'}
                  or 'decorated' in p.name.lower()]
    if candidates:
        shutil.copyfile(candidates[0], decorated)

for required in (charlotte, alphabet):
    if not required.exists():
        raise SystemExit(f'Required OCR fixture is missing after normalization: {required}')
print(f'Normalized OCR fixtures: {charlotte}, {alphabet}, decorated={decorated.exists()}')

# Keep the browser test usable both in Actions and in an ordinary checkout.
path = root / '.automation/v21-smoke.mjs'
text = path.read_text(encoding='utf-8')
text = text.replace(
    "const fixtures = process.env.FIXTURE_DIR;",
    "const fixtures = process.env.FIXTURE_DIR || path.resolve('tests/fixtures/runes');",
)
text = text.replace(
    "if (!base || !fixtures || !chrome) throw new Error('BASE_URL, FIXTURE_DIR and CHROME_PATH are required');",
    "if (!base || !chrome) throw new Error('BASE_URL and CHROME_PATH are required');",
)
path.write_text(text, encoding='utf-8', newline='\n')
print('Configured browser smoke to use real OCR fixtures')
