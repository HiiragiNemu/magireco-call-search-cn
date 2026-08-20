from pathlib import Path
import re

p = Path('scripts/finalize-v23.py')
s = p.read_text(encoding='utf-8')

# Distinct release marker for cache/provenance.
s = re.sub(r'RELEASE = "[^"]+"', 'RELEASE = "v24-complete-cn-20260820"', s, count=1)

# Correct memoria alignment: No.n is the 1-based catalogue ordinal, not pieceId-1000.
s = s.replace(
'''        if match and 1000 + int(match.group(1)) in piece_map:\n            return "official-libs/pieceList.json"''',
'''        if match and int(match.group(1)) in piece_map:\n            return "official-libs/pieceList.json (catalog ordinal alignment)"''')
s = s.replace('title = piece_map.get(1000 + number) or MEMORIA_FALLBACK.get(number)',
              'title = piece_map.get(number) or MEMORIA_FALLBACK.get(number)')
old_piece = '''    piece_map = {\n        int(row["pieceId"]): str(row["pieceName"]).strip()\n        for row in piece_rows\n        if row.get("pieceId") is not None and row.get("pieceName")\n    }'''
new_piece = '''    # The public No.n memoria catalogue is ordinal. Official piece IDs contain\n    # intentional gaps, so pieceId - 1000 becomes wrong after early entries.\n    # Sorting the official table by pieceId and taking its 1-based ordinal is\n    # the stable alignment (for example No.888 -> pieceId 1901).\n    ordered_piece_rows = sorted(\n        (row for row in piece_rows if row.get("pieceId") is not None and row.get("pieceName")),\n        key=lambda row: int(row["pieceId"]),\n    )\n    piece_map = {\n        ordinal: str(row["pieceName"]).strip()\n        for ordinal, row in enumerate(ordered_piece_rows, start=1)\n    }'''
if old_piece not in s:
    raise SystemExit('piece map block not found')
s = s.replace(old_piece, new_piece)

# Complete suffix vocabulary.
anchor = '    ("百禍チャレンジクエスト", "百祸挑战任务"),\n'
addition = '''    ("期間限定ミッション", "期间限定任务"),\n    ("百禍チャレンジ", "百祸挑战"),\n    ("EXチャレンジ", "EX挑战"),\n    ("チャレンジ", "挑战"),\n'''
if '期間限定ミッション' not in s:
    if anchor not in s:
        raise SystemExit('suffix anchor not found')
    s = s.replace(anchor, anchor + addition, 1)

# Higher-authority and manually reviewed exact title corrections.
event_overlay = r'''

# V24 reviewed overlay. Official CN client names override lower-authority text.
EVENT_EXACT.update({
    "FM神浜": "FM神滨 圣广播电台",
    "WHEREABOUTS OF THE FEATHER～羽根の行方～": "Whereabouts of the feather～羽翼的去向～",
    "ほわほわ少女頑張る!": "无忧少女要努力！～等一下，这是误会！～",
    "みたまと美味しい新年会": "御魂与美味的新年会",
    "アラカルトバレンタイン": "任君挑选的情人节～大家传递心情的方法～",
    "アラカルトバレンタイン 2nd": "任君挑选的情人节2nd～如果她是今天的主角？～",
    "アリナが街にやってくる": "阿莉娜进城来～白色圣诞狂想曲～",
    "バイバイ、また明日": "byebye、明天见",
    "バイバイ、また明日 せいか編": "byebye、明天见 清佳篇",
    "バイバイ、また明日 みと編": "byebye、明天见 未都篇",
    "バイバイ、また明日 れいら編": "byebye、明天见 丽良篇",
    "バイバイ、また明日 ３人編": "byebye、明天见 三人篇",
    "マジカルハロウィンシアター": "魔法万圣节剧场～仅限1日的魔法少女剧团～",
    "ユメミルサクラ": "做梦的樱花",
    "千秋理子のぶきっちょでもいいですから": "千秋理子笨手笨脚也没关系",
    "始まりと永遠と": "起始和永远",
    "常夜の国の反乱者": "常夜之国的叛乱者～魔法少女☆塔鲁特～",
    "巣立ちは空を見上げて": "离巢雏鸟仰望天空",
    "水名神社でHappy New Year!": "在水名神社Happy New Year！",
    "沙優希ステップアップ仕る！ですぅ～": "沙优希Step Up进步！的说～",
    "波打ち際のリボン": "海边的缎带",
    "神浜レアリティースター": "神滨稀有度之星",
    "新たな息吹より": "来自新风",
    "サマトレ！～火に消えた夏の宝～": "夏日寻宝！～火中消失的夏之宝物～",
    "時を越えて鳴らす鐘": "超越时空的钟声～魔法少女☆塔鲁特～",
    "駆け出しメイド十七夜 闊達自在": "初出茅庐的女仆十七夜 阔达自在！",
    "CROSS CONNECTION": "CROSS CONNECTION～魔法少女☆铃音～",
})
'''
if '# V24 reviewed overlay.' not in s:
    marker = '\nSPECIAL_MAP = {'
    if marker not in s:
        raise SystemExit('EVENT overlay marker not found')
    s = s.replace(marker, event_overlay + marker, 1)

hist_overlay = r'''

HISTORIA_MAP.update({
    "Pillar of Tomorrow": "Pillar of Tomorrow",
    "現代神浜編": "现代神滨篇",
    "神浜の戦神子編": "神滨战神子篇",
    "邪馬台国の跡目編": "邪马台国的后嗣篇",
    "未命名记录": "未命名记录",
})
'''
if '"Pillar of Tomorrow": "Pillar of Tomorrow"' not in s:
    marker = '\nCHARACTER_VARIANT_FIX = {'
    if marker not in s:
        raise SystemExit('Historia overlay marker not found')
    s = s.replace(marker, hist_overlay + marker, 1)

# Normalize Japanese variants and legacy mechanical fragments that contain no kana
# but are not acceptable Simplified Chinese display text.
normalizer = r'''

TARGET_TEXT_REPLACEMENTS = [
    ("大東団地", "大东团地"),
    ("神浜大東団地", "神滨大东团地"),
    ("現代神浜", "现代神滨"),
    ("邪馬台国", "邪马台国"),
    ("跡目", "后嗣"),
    ("飛蝗", "飞蝗"),
    ("永遠", "永远"),
    ("仮装", "装扮"),
    ("病院服", "病号服"),
    ("(1回目)", "（第1次）"),
    ("(2回目)", "（第2次）"),
    ("(3回目)", "（第3次）"),
    ("（1回目）", "（第1次）"),
    ("（2回目）", "（第2次）"),
    ("（3回目）", "（第3次）"),
    ("Epilogue", "尾声"),
    ("Intermission", "幕间"),
    ("INTERMISSON", "幕间"),
    ("Prologue", "序章"),
]


def normalize_target_text(value: str) -> str:
    result = str(value or "").strip()
    for source, target in TARGET_TEXT_REPLACEMENTS:
        result = result.replace(source, target)
    result = result.replace("桃子 篇", "桃子篇").replace("御魂 篇", "御魂篇")
    result = re.sub(r"\s+篇$", "篇", result)
    return result
'''
if 'def normalize_target_text' not in s:
    marker = '\ndef translate_group('
    if marker not in s:
        raise SystemExit('normalizer marker not found')
    s = s.replace(marker, normalizer + marker, 1)

s = s.replace('target = translate_group(group, piece_map, character_map).strip()',
              'target = normalize_target_text(translate_group(group, piece_map, character_map).strip())')
s = s.replace('full_target = join_translation(target, suffix, child)',
              'full_target = normalize_target_text(join_translation(target, suffix, child))')

p.write_text(s, encoding='utf-8')

# Runtime must accept newer schema/release versions and actually load V24 data.
runtime = Path('public/myfile/story-title-runtime-v2.js')
r = runtime.read_text(encoding='utf-8')
r = re.sub(r"const RELEASE = '[^']+';", "const RELEASE = 'story-title-runtime-v24-20260820';", r, count=1)
r = r.replace("if (!data || data.version !== 1 || !Array.isArray(data.groups)) {",
              "if (!data || !Array.isArray(data.groups)) {")
r = r.replace("if (!data || data.version !== 1 || typeof data.titleByCategory !== 'object') {",
              "if (!data || typeof data.titleByCategory !== 'object') {")
runtime.write_text(r, encoding='utf-8')

# Cache-bust the runtime on both the editor and the actual story search page.
for rel in ('public/story-title-editor.html', 'public/story.html'):
    hp = Path(rel)
    h = hp.read_text(encoding='utf-8')
    h = re.sub(r'story-title-runtime-v2\.js\?v=[^"<]+',
               'story-title-runtime-v2.js?v=20260820-24', h)
    h = re.sub(r'\s+data-build="story-title-dense-v19-20260819"', '', h)
    h = re.sub(r'data-build="[^"]*"', 'data-build="v24-complete-cn-20260820"', h, count=1)
    hp.write_text(h, encoding='utf-8')
