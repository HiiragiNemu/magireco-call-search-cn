#!/usr/bin/env python3
"""Apply only the reviewed 2026-10-20 Sorana character/call additions.

Not a recurring upstream importer. Requires the reviewed capture; preserves old
portraits, unrelated records, themes, story row identities and cross-tool routes.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://magireco-chara-search.vercel.app/'
SHEET = 'https://docs.google.com/spreadsheets/d/1V0QTP3YZsoc7h5wOC8oqg7NKJpA6ZPyck9yCYfbJGlk/edit'
NEW = [
    dict(jp='そらなの母', zh='索拉娜的母亲', roman='Sorana no Haha', kana='そらなのはは', row=196),
    dict(jp='リナ', zh='莉娜', roman='Rina', kana='りな', row=197),
]
EDGES = [
    ('FM194','凪星そらな','丘比','キュゥべえ','Kyuubee','丘比'),
    ('GS194','凪星そらな','莉莉·坎迪','リリーちゃん','Lily-chan','小莉莉'),
    ('GT194','凪星そらな','索拉娜的母亲','ママ','Mama','妈妈'),
    ('GU194','凪星そらな','莉娜','リナ母さん','Rina-kaasan','莉娜妈妈'),
    ('FM195','リリー・キャンディー','丘比','キュゥべえちゃん','Kyuubee-chan','小丘比'),
    ('GR195','リリー・キャンディー','凪星索拉娜','そらなちゃん','Sorana-chan','小索拉娜'),
    ('GR196','そらなの母','凪星索拉娜','そらなちゃん','Sorana-chan','小索拉娜'),
    ('GU196','そらなの母','莉娜','リナちゃん','Rina-chan','小莉娜'),
]
SCHOOLS = [('宝崎市立第一中学校','宝崎市立第一中学'), ('シー・ホライズン国際高等学校','海平线国际高等学校')]

def q(x): return json.dumps(x, ensure_ascii=False)
def once(s, old, new):
    if s.count(old) != 1: raise ValueError(f'Expected one anchor: {old[:100]}')
    return s.replace(old,new,1)
def write(p,s): p.write_bytes(s.encode('utf-8'))
def digest(b): return hashlib.sha256(b).hexdigest()

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--capture',type=Path,required=True)
    args=ap.parse_args(); cap=args.capture
    for rel,expected in {
        'call.html':'4551a5685b3e45868266853de042a1712e317a7f152ba7871b76e460c41ab9e6',
        'myfile/callTable.js':'5814a28bad627024fd4868a22e3b28177f4d926a3d3e4a50772db894af2ac4c2',
        'myfile/charaAt.js':'22e46dc93abe74158b3fee9e31919d4d8f681d1d092cb776fd305b7113488152',
    }.items():
        assert digest((cap/rel).read_bytes())==expected, f'Reviewed source changed: {rel}'
    index_path=ROOT/'public/index.html';index=index_path.read_text(encoding='utf-8')
    assert all(f'id="{c["jp"]}"' not in index for c in NEW), 'Already applied or partial update'
    # Hash the untouched semantic records before modifying anything.
    js="""
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');const c={};
vm.runInNewContext(fs.readFileSync('public/myfile/callTable.js','utf8')+';globalThis.calls=callTable;',c);
vm.runInNewContext(fs.readFileSync('public/myfile/charaAt.js','utf8')+';globalThis.tags=charaAttribute;',c);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
console.log(JSON.stringify({
 preservedCallRecordsSha256:hash([...c.calls].filter(([k])=>!['凪星そらな','リリー・キャンディー'].some(jp=>k.includes('('+jp+' / '))).map(([k,v])=>[k,[...v]])),
 preservedAttributesSha256:hash([...c.tags].filter(([jp])=>!['凪星そらな','環いろは','くろ'].includes(jp)).map(([k,v])=>[k,[...v]]))
}));"""
    proof=json.loads(subprocess.check_output(['node','-e',js],cwd=ROOT).decode())
    proof.update(baselineCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                 sourceSpreadsheet=SHEET, sources=json.loads((cap/'capture.json').read_text(encoding='utf-8')),
                 characters=NEW, edges=[dict(cell=cell,caller=caller,target=target,japanese=jp,roman=roman,chinese=zh) for cell,caller,target,jp,roman,zh in EDGES],
                 schoolAdditions=[dict(jp=jp,school=school) for jp,school in [('凪星そらな',SCHOOLS[1][0]),('環いろは',SCHOOLS[0][0]),('くろ',SCHOOLS[0][0])]],
                 officialAge=dict(jp='凪星そらな',age=17,url='https://madoka-exedra.com/sorana/character/',grade='unknown'),
                 held=[dict(item='阿見莉愛→百江なぎさ=安名メル',reason='Misaligned character name; no edge added.'),
                       dict(item='瀬奈みこと',reason='Do not remove 大東学院 or merge version-mixed combat/limited tags.'),
                       dict(item='アシュリー・テイラー→更紗帆奈=ひみか',reason='Existing ambiguity retained, not guessed or duplicated.')],
                 translationPolicy='Conservative manual Chinese localization, not asserted official. Rina is kana romanization; do not merge with 人見リナ.',
                 storyRowsUnchanged=True,routeBindingsUnchanged=True,portraits=[])
    table_path=ROOT/'public/myfile/callTable.js';table=table_path.read_text(encoding='utf-8')
    table,reverse=table.split('const calledMap',1)
    names={'凪星そらな':'凪星索拉娜','リリー・キャンディー':'莉莉·坎迪',**{c['jp']:c['zh'] for c in NEW}}
    for jp in ['凪星そらな','リリー・キャンディー']:
        pattern=r'(  \["[^"\n]*\('+re.escape(jp)+r' / [^"\n]*", new Map\(\[\n)(.*?)(\n  \]\)\])'
        match=re.search(pattern,table,re.S);assert match,jp
        body=once(match[2],'["第一人称", "?"]','["第一人称", "わたし (watashi / 我)"]')
        if jp=='凪星そらな': body=once(body,'["年龄", "?"]','["年龄", "17岁"]')
        for _,caller,target,raw,roman,zh in EDGES:
            if caller==jp:body+=',\n    ['+q(target)+', '+q(f'{raw} ({roman} / {zh})')+']'
        table=table[:match.start(2)]+body+table[match.end(2):]
    blocks=[]
    for c in NEW:
        values=[('年龄','?'),('学年','-'),('身高','?'),('第一人称','?')]
        values += [(target,f'{raw} ({roman} / {zh})') for _,caller,target,raw,roman,zh in EDGES if caller==c['jp']]
        blocks.append('  ['+q(f'{c["zh"]} ({c["jp"]} / {c["roman"]})')+', new Map([\n'+',\n'.join('    ['+q(k)+', '+q(v)+']' for k,v in values)+'\n  ])]')
    pos=table.rfind(']);');assert pos>=0;table=table[:pos].rstrip()+',\n'+',\n'.join(blocks)+'\n'+table[pos:]
    incoming={}
    for _,caller,target,*_ in EDGES:incoming.setdefault(target,[]).append(names[caller])
    for target,callers in incoming.items():
        pat=r'(\['+re.escape(q(target))+r', new Set\()(\[[^\n]*?\])(\)\])';m=re.search(pat,reverse)
        if m:
            values=json.loads(m[2]);values += [v for v in callers if v not in values]
            reverse=reverse[:m.start(2)]+q(values)+reverse[m.end(2):]
        else:
            pos=reverse.rfind(']);');reverse=reverse[:pos].rstrip()+',\n  ['+q(target)+', new Set('+q(callers)+')]\n'+reverse[pos:]
    labels='\n'.join(f'\t\t\t\t<label class="girlbox negiusColor" data-kana="{c["kana"]}"><input type="checkbox" class="MagicalChk" name="chara" id="{c["jp"]}" value="{c["zh"]} ({c["jp"]} / {c["roman"]})"><br>{c["zh"]}</label>' for c in NEW)
    label=re.search(r'<label[^>]*>\s*<input[^>]*id="リリー・キャンディー".*?</label>',index,re.S)
    assert label;index=index[:label.end()]+'\n'+labels+index[label.end():]
    facet=re.search(r'<label[^>]*>\s*<input[^>]*value="聖乙女学園"[^>]*>.*?</label>',index,re.S);assert facet
    index=index[:facet.end()]+'\n'+''.join('\t\t\t\t'+facet[0].replace('聖乙女学園',jp).replace('圣乙女学园',zh)+'\n' for jp,zh in SCHOOLS)+index[facet.end():]
    attrs_path=ROOT/'public/myfile/charaAt.js';attrs=attrs_path.read_text(encoding='utf-8')
    for jp,school in [('凪星そらな',SCHOOLS[1][0]),('環いろは',SCHOOLS[0][0]),('くろ',SCHOOLS[0][0])]:
        pat=r'(\[[\'\"]'+re.escape(jp)+r'[\'\"], new Set\(\[)([^\n]*?)(\]\)\])';m=re.search(pat,attrs);assert m,jp
        attrs=attrs[:m.end(2)]+', '+q(school)+attrs[m.end(2):]
    attrs=once(attrs,'let charaAttribute = new Map([\n','let charaAttribute = new Map([\n'+''.join('  ['+q(c['jp'])+', new Set(["まどドラ", "そらな"])],\n' for c in NEW))
    css_path=ROOT/'public/myfile/charaBox_png.css';css=css_path.read_text(encoding='utf-8')
    images=[]
    for c in NEW:
        url=BASE+'img/webp/'+urllib.parse.quote(c['jp'])+'.webp'
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as r:raw=r.read()
        image=Image.open(io.BytesIO(raw));assert image.format=='WEBP';rgba=image.convert('RGBA');buf=io.BytesIO();rgba.save(buf,format='PNG',optimize=True);png=buf.getvalue()
        assert Image.open(io.BytesIO(png)).convert('RGBA').tobytes()==rgba.tobytes()
        dest=ROOT/'public/img/png'/f'{c["zh"]}.png';assert not dest.exists();images.append((dest,png))
        proof['portraits'].append(dict(jp=c['jp'],source=url,sourceSha256=digest(raw),pngSha256=digest(png),size=list(rgba.size),pixelsIdentical=True))
        css+='\n.magicalgirl input[value='+q(f'{c["zh"]} ({c["jp"]} / {c["roman"]})')+'] {\n  background: url(../img/png/'+c['zh']+'.png);\n  background-size: contain;\n  background-repeat: no-repeat;\n  background-position: center;\n}\n'
    write(index_path,index);write(table_path,table+'const calledMap'+reverse);write(attrs_path,attrs);write(css_path,css)
    for dest,png in images:dest.write_bytes(png)
    # Keep new school labels Chinese in filters and height-axis groupings too.
    for rel,anchor,lines in [
        ('public/myfile/suite-v7.js', "    '白羽女学院': '白羽女子学院', '茜咲中学': '茜咲中学', '聖乙女学園': '圣乙女学园',\n",
         "    '宝崎市立第一中学校': '宝崎市立第一中学', 'シー・ホライズン国際高等学校': '海平线国际高等学校',\n    'そらな': '索拉娜篇',\n"),
        ('public/myfile/site-correction-v2.js', "    ['聖乙女学園', '圣乙女学园'],\n",
         "    ['宝崎市立第一中学校', '宝崎市立第一中学'],\n    ['シー・ホライズン国際高等学校', '海平线国际高等学校'],\n"),
        ('scripts/audit-translations-v5.py', '    "聖乙女学園": "圣乙女学园",\n',
         '    "宝崎市立第一中学校": "宝崎市立第一中学",\n    "シー・ホライズン国際高等学校": "海平线国际高等学校",\n'),
    ]:
        p=ROOT/rel;s=p.read_text(encoding='utf-8')
        if lines not in s:write(p,once(s,anchor,anchor+lines))
    write(ROOT/'docs/call-data-update-20261020.json',json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
    subprocess.run([sys.executable,'-X','utf8','-B','scripts/audit-translations-v5.py'],cwd=ROOT,check=True)
    print('Applied 2 characters, 8 directed calls, 2 pronouns, 3 additive school tags and official Sorana age 17.')

if __name__=='__main__': main()
