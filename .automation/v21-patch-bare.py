#!/usr/bin/env python3
from pathlib import Path
import base64
import hashlib
import io
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
for required in (
    fixture_dir / 'charlotte.jpg',
    fixture_dir / 'alphabet.jpg',
    fixture_dir / 'decorated.jpg',
):
    if not required.exists():
        raise SystemExit(f'Required OCR fixture is missing: {required}')
print('Real OCR fixtures are present')

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
text = text.replace("'charlotte.png'", "'charlotte.jpg'")
needle = """  await page.select('#runesPreprocess', preprocess);
  await page.select('#runesLayout', layout);
  await page.click('#runesRecognize');
"""
replacement = """  await page.select('#runesPreprocess', preprocess);
  await page.select('#runesLayout', layout);
  if (/charlotte/i.test(fileName)) {
    const direct = await page.evaluate(async () => {
      const file = document.getElementById('runesFile')?.files?.[0];
      const focused = file ? await window.__RUNE_COLOR_V14__?.buildColorFocusedInput?.(file, true) : null;
      const glyph = focused?.canvas ? window.__RUNE_GLYPH_V16__?.recognizeCanvas?.(focused.canvas, { expectedGlyphs: focused.segments }) : null;
      return {
        focused: focused ? {
          segments: focused.segments,
          score: focused.score,
          foregroundRatio: focused.foregroundRatio,
          width: focused.canvas?.width,
          height: focused.canvas?.height,
          bounds: focused.bounds
        } : null,
        glyph: glyph ? {
          text: glyph.text,
          raw: glyph.raw,
          accepted: glyph.accepted,
          corrected: glyph.corrected,
          glyphs: glyph.glyphs,
          averageScore: glyph.averageScore,
          averageMargin: glyph.averageMargin,
          topCandidates: glyph.topCandidates
        } : null
      };
    });
    console.log('DIRECT_CHARLOTTE_DIAGNOSTIC', JSON.stringify(direct));
    if (!direct.focused || !direct.glyph) {
      throw new Error(`direct Charlotte pipeline returned no result: ${JSON.stringify(direct)}`);
    }
    if (!direct.glyph.accepted || direct.glyph.text.toUpperCase() !== expected) {
      throw new Error(`direct Charlotte glyph result rejected: ${JSON.stringify(direct)}`);
    }
  }
  await page.click('#runesRecognize');
"""
if 'DIRECT_CHARLOTTE_DIAGNOSTIC' not in text:
    if needle not in text:
        raise SystemExit('Smoke recognition injection anchor was not found')
    text = text.replace(needle, replacement, 1)
path.write_text(text, encoding='utf-8', newline='\n')
print('Configured browser smoke to use real OCR fixtures with direct Charlotte diagnostics')
