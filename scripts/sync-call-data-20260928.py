#!/usr/bin/env python3
"""Apply the reviewed September 28 call-data patch. Manual-only; never scans/syncs upstream.

Only seven new avatar paths may be created. Existing portraits and runtime logic
are not rewritten. The original WebP byte hashes pin the requested upstream art.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PAGE = 'https://magireco-chara-search.vercel.app/call.html'
SHEET = 'https://docs.google.com/spreadsheets/d/1V0QTP3YZsoc7h5wOC8oqg7NKJpA6ZPyck9yCYfbJGlk/edit'
CHARACTERS = [
    dict(jp='夜明すみれ', zh='夜明堇', roman='Yoake Sumire', kana='よあけ すみれ', style='unionColor', after='安名メル', attributes=['まどドラ','栄総合学園','豊鶴学院'], row=2,
         sha256='5fbaa820de2113fb3aa732535e7302ef022308ed5042a9abba3ee01483e31765',
         values=[['年龄','?'],['学年','?'],['身高','?'],['第一人称','私 (watashi / 我)'],['日暮风花','ふうか (Fuuka / 风花)'],['十咎桃子','ももこさん (Momoko-san / 桃子小姐)']]),
    dict(jp='日暮ふうか', zh='日暮风花', roman='Higure Fuuka', kana='ひぐれ ふうか', style='unionColor', after='夜明すみれ', attributes=['まどドラ','豊鶴学院'], row=3,
         sha256='77b2c44924e842a86aced8c86af8c8d9d379bf51f11aca511091dbce4ba5bcd8',
         values=[['年龄','?'],['学年','?'],['身高','?'],['第一人称','あたし (atashi / 我)'],['二人称','キミ (kimi / 你)'],['夜明堇','すみれ (Sumire / 堇)']]),
    dict(jp='紫丁香', zh='紫丁香', roman='Shi Chouka', kana='し ちょうか', style='PMHQColor', after='愛生まばゆ', attributes=['まどマギ','見滝原中学校'], row=67,
         sha256='582e71362ef4caa6754c5793fb94d0d49a7cacdb37701733180bbc0c16c20852',
         values=[['年龄','?'],['学年','?'],['身高','?'],['第一人称','あたし (atashi / 我)'],['二人称','あなた (anata / 你)'],['晓美焰','暁美ほむら (Akemi Homura / 晓美焰)']]),
    dict(jp='セルマ・テレーゼ', zh='瑟尔玛·特蕾泽', roman='Selma Therese', kana='せるま てれーぜ', style='PMHQColor', after='紫丁香', attributes=['まどマギ','見滝原中学校'], row=68,
         sha256='646462fcd76c8d58f5b5005cdacfed7ba4e822404ebead02d5dbd5ffb9750bda',
         values=[['年龄','?'],['学年','?'],['身高','?'],['第一人称','私 (watashi / 我) / わたし (watashi / 我) / セルマ (Selma / 瑟尔玛)'],['百江渚','なぎさ (Nagisa / 渚)']]),
    dict(jp='ワス', zh='瓦斯', roman='Wasu', kana='わす', style='PMHQColor', after='セルマ・テレーゼ', attributes=['まどマギ','見滝原中学校'], row=69,
         sha256='8970fc5d36991e1c53069b087c6fd5aad82eaa0b9dea0b23ff03df200a3ac590',
         values=[['年龄','15岁?'],['学年','初三'],['身高','?'],['第一人称','わたくし (watakushi / 我)'],['二人称','あなた (anata / 你)'],['鹿目圆','マルグリート (Marguerite / 玛格丽特)'],['紫丁香','紫丁香 (Shi Chouka / 紫丁香)'],['瑟尔玛·特蕾泽','セルマ (Selma / 瑟尔玛)']]),
    dict(jp='凪星そらな', zh='凪星索拉娜', roman='Nagiboshi Sorana', kana='なぎぼし そらな', style='negiusColor', after='日向華々莉', attributes=['まどドラ','そらな'], row=194,
         sha256='94787c41d104f197a82ea64f7bf8582a87a6cde830861e8446dea56c3b5b96ae',
         values=[['年龄','?'],['学年','?'],['身高','?'],['第一人称','?']]),
    dict(jp='リリー・キャンディー', zh='莉莉·坎迪', roman='Lily Candy', kana='りりー きゃんでぃー', style='negiusColor', after='凪星そらな', attributes=['まどドラ','そらな'], row=195,
         sha256='f97ea5d44d10481977543ac56659a9ff1a994436c0d38ad40024fbb66dd0c5da',
         values=[['年龄','?'],['学年','?'],['身高','?'],['第一人称','?']]),
]
EXISTING = [
    dict(caller='环彩羽 (環いろは / Tamaki Iroha)', target='里见那由他', cell='AK4',
         source='里見さん→那由他ちゃん/(5周年:那由他さん)',
         old='里見さん (Satomi-san / 里见小姐)→那由他ちゃん (Nayuta-chan / 小那由他)',
         new='里見さん (Satomi-san / 里见小姐)→那由他ちゃん (Nayuta-chan / 小那由他) / 那由他さん（5周年） (Nayuta-san [5th anniversary] / 那由他小姐【五周年】)'),
    dict(caller='七海八千代 (七海やちよ / Nanami Yachiyo)', target='由比鹤乃', cell='L5',
         source='由比さん→鶴乃、うちの孔明さん',
         old='由比さん (Yui-san / 由比小姐)→鶴乃 (Tsuruno / 鹤乃)',
         new='由比さん (Yui-san / 由比小姐)→鶴乃 (Tsuruno / 鹤乃) / うちの孔明さん (Uchi no Koumei-san / 我家的孔明先生)'),
]
NEW_RELATIONS = [
    ('I2','夜明堇','日暮风花','ふうか'),('Y2','夜明堇','十咎桃子','ももこさん'),
    ('H3','日暮风花','夜明堇','すみれ'),('H19','十咎桃子','夜明堇','すみれちゃん'),
    ('BN67','紫丁香','晓美焰','暁美ほむら'),('BS68','瑟尔玛·特蕾泽','百江渚','なぎさ'),
    ('BM69','瓦斯','鹿目圆','マルグリート'),('BU69','瓦斯','紫丁香','紫丁香'),('BV69','瓦斯','瑟尔玛·特蕾泽','セルマ'),
]

def q(value):
    return json.dumps(value, ensure_ascii=False)

def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f'Expected one exact patch anchor: {before[:100]!r}; got {text.count(before)}')
    return text.replace(before, after, 1)

def apply(avatar_dir: Path | None) -> None:
    index_path = ROOT/'public/index.html'
    index = index_path.read_text(encoding='utf-8')
    if any(f'id="{c["jp"]}"' in index for c in CHARACTERS):
        raise SystemExit('Patch already applied or partial character records present; refusing duplicate/partial overwrite.')
    table_path = ROOT/'public/myfile/callTable.js'
    table = table_path.read_text(encoding='utf-8')
    for item in EXISTING:
        table = replace_once(table, q(item['old']), q(item['new']))
    anchor = '  ["十咎桃子 (十咎ももこ / Togame Momoko)", new Map([\n'
    table = replace_once(table, anchor, anchor + '    ["夜明堇", "すみれちゃん (Sumire-chan / 小堇)"],\n')
    blocks = []
    for c in CHARACTERS:
        full = f'{c["zh"]} ({c["jp"]} / {c["roman"]})'
        blocks.append('  [' + q(full) + ', new Map([\n' + ',\n'.join('    ['+q(k)+', '+q(v)+']' for k,v in c['values'])+'\n  ])]')
        label = f'\t\t\t\t<label class="girlbox {c["style"]}" data-kana="{c["kana"]}"><input type="checkbox" class="MagicalChk" name="chara" id="{c["jp"]}" value="{full}"><br>{c["zh"]}★</label>'
        pattern = re.compile(r'(^[^\n]*<label\b[^\n]*id="'+re.escape(c['after'])+r'"[^\n]*</label>)(?=\n)', re.M)
        if len(pattern.findall(index)) != 1:
            raise ValueError(f'Selector insertion anchor missing or ambiguous: {c["after"]}')
        index = pattern.sub(lambda m: m[1]+'\n'+label, index, count=1)
    table = replace_once(table, '\n]);\nconst calledMap', ',\n'+',\n'.join(blocks)+'\n]);\nconst calledMap')
    # Keep the legacy reverse map consistent too, without rebuilding unrelated entries.
    main, reverse = table.split('const calledMap',1)
    incoming = {}
    for _, caller, target, _ in NEW_RELATIONS:
        incoming.setdefault(target, []).append(caller)
    for c in CHARACTERS:
        incoming.setdefault(c['zh'], [])
    additions=[]
    for target, callers in incoming.items():
        pattern=re.compile(r'(\['+re.escape(q(target))+r', new Set\()(?P<array>\[[^\n]*?\])(\)\])')
        matches=list(pattern.finditer(reverse))
        if len(matches)>1: raise ValueError(f'Ambiguous reverse-map target: {target}')
        if matches:
            m=matches[0]; values=json.loads(m['array'])
            for name in callers:
                if name not in values: values.append(name)
            reverse=reverse[:m.start('array')]+q(values)+reverse[m.end('array'):]
        else:
            additions.append('  ['+q(target)+', new Set('+q(callers)+')]')
    if additions:
        pos=reverse.rfind(']);')
        if pos<0: raise ValueError('Reverse-map terminator missing')
        reverse=reverse[:pos]+',\n'+',\n'.join(additions)+'\n'+reverse[pos:]
    table=main+'const calledMap'+reverse
    css_path=ROOT/'public/myfile/charaBox_png.css'
    css=css_path.read_text(encoding='utf-8')
    css+='\n/* Seven portraits added from the upstream call roster, 2026-09-28. */\n'
    attrs_path=ROOT/'public/myfile/charaAt.js'
    attrs=attrs_path.read_text(encoding='utf-8')
    attr_lines=[]
    provenance=[]
    for c in CHARACTERS:
        full=f'{c["zh"]} ({c["jp"]} / {c["roman"]})'
        css+=f'.magicalgirl input[value="{full}"] {{\n  background: url(../img/png/{c["zh"]}.png);\n  background-size: contain;\n  background-repeat: no-repeat;\n  background-position: center;\n}}\n'
        attr_lines.append('  ['+q(c['jp'])+', new Set('+q(c['attributes'])+')],')
        dest=ROOT/'public/img/png'/(c['zh']+'.png')
        if dest.exists(): raise ValueError(f'Existing avatar must not be overwritten: {dest}')
        url='https://magireco-chara-search.vercel.app/img/webp/'+urllib.parse.quote(c['jp'])+'.webp'
        if avatar_dir is not None:
            raw=(avatar_dir/(c['jp']+'.webp')).read_bytes()
        else:
            with urllib.request.urlopen(url,timeout=45) as response: raw=response.read()
        if hashlib.sha256(raw).hexdigest()!=c['sha256']:
            raise ValueError(f'Upstream portrait changed since review: {c["jp"]}')
        im=Image.open(io.BytesIO(raw)); im.load()
        if im.format!='WEBP': raise ValueError(f'Expected WebP source: {c["jp"]}')
        image=im.convert('RGBA'); buf=io.BytesIO(); image.save(buf,format='PNG',optimize=True)
        png=buf.getvalue()
        if Image.open(io.BytesIO(png)).convert('RGBA').tobytes()!=image.tobytes(): raise ValueError('Pixel conversion mismatch')
        dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(png)
        provenance.append(dict(jp=c['jp'],zh=c['zh'],roman=c['roman'],kana=c['kana'],sheetRow=c['row'],sourceUrl=url,sourceSha256=c['sha256'],outputPath=str(dest.relative_to(ROOT)),outputSha256=hashlib.sha256(png).hexdigest(),size=list(image.size),pixelPolicy='decoded-RGBA-identical; no crop, resize or redraw',translationStatus='manual localization; not asserted to be official Chinese'))
    attrs=replace_once(attrs, 'let charaAttribute = new Map([\n','let charaAttribute = new Map([\n'+'\n'.join(attr_lines)+'\n')
    for path,text in [(index_path,index),(table_path,table),(css_path,css),(attrs_path,attrs)]: path.write_text(text,encoding='utf-8')
    doc=dict(baseProductionCommit='c8961403d542280a3008df616b56ed25fe4febb5',sourceSpreadsheet=SHEET,sourceModifiedTime='2026-09-28T10:03:19.821Z',sourceRoster=SOURCE_PAGE,scope='seven character selectors, portraits, attributes and call records; two existing values; nine edges only',portraits=provenance,existingValueAdditions=EXISTING,newRelations=[dict(cell=a,caller=b,target=c,sourceJapanese=d) for a,b,c,d in NEW_RELATIONS],notes=['No existing portrait replaced.','Unknown values remain unknown, including Wasu age 15? and empty Sorana/Lily relations.','Source kana supplies Japanese reading. Nagiboshi uses ぼ, not ほ.','Chinese names are conservative manual localization, not a claim of official publication.','Source-sheet auxiliary placeholders absent from the upstream selectable roster are not introduced as new UI characters.','Source characters and relationships are public data; form submissions and personal data are not included.'])
    target=ROOT/'docs/call-sync-20260928.json'
    target.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    subprocess.run(['python','scripts/audit-translations-v5.py'],cwd=ROOT,check=True)
    print(json.dumps({'addedCharacters':7,'existingValuesExtended':2,'addedRelations':9,'portraits':[p['outputPath'] for p in provenance]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--avatar-dir',type=Path,help='Optional directory of the exact reviewed upstream WebP bytes')
    args=parser.parse_args(); apply(args.avatar_dir)
