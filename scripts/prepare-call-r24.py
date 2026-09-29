#!/usr/bin/env python3
"""Apply a hash-verified, reviewed patch to a disposable checkout; never publish."""
import hashlib,importlib.util,json,lzma,os,re,subprocess,tempfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
RELEASE='call-r24-x-and-reliability-20260929'
marker=ROOT/'public/call-r24-release.json'
if marker.exists():
    assert json.loads(marker.read_text())['release']==RELEASE
    print('r24 already applied; verify deployment instead.');raise SystemExit(0)
assert subprocess.check_output(['git','rev-parse','HEAD:public'],text=True).strip()=='70327625eb8ff812699492ceb929f59687d38628', 'Public baseline changed; reconcile before applying.'
patch=lzma.decompress((ROOT/'scripts/call-r24-reviewed.patch.xz').read_bytes())
assert hashlib.sha256(patch).hexdigest()=='2d03871743cfa9b2ea279905c0c3940a78c5be1c474a6abf2adc4938c7e43de4'
original={p:p.read_bytes() for p in (ROOT/'public').rglob('*') if p.is_file()}
fd=Path(tempfile.gettempdir())/'call-r24-reviewed.patch';fd.write_bytes(patch)
subprocess.run(['git','apply','--check','--unidiff-zero',str(fd)],check=True)
subprocess.run(['git','apply','--unidiff-zero',str(fd)],check=True)
# Invalidate only changed runtime consumers; preserve every earlier query prefix.
names=['theme-mode-v1.js','story-route-bridge-v1.js','tools-suite.js','attendance-app-v7.js','story-title-editor-v2.js','story-app-v7.js','callTable.js','charaAt.js']
pattern=re.compile(r'((?:'+'|'.join(re.escape(n) for n in names)+r')(?:\?[^"<>]*)?)(?=")')
for p in (ROOT/'public').glob('*.html'):
    raw=p.read_text();updated=pattern.sub(lambda m:m[1]+('&amp;' if '?' in m[1] else '?')+'audit=r24',raw)
    if updated!=raw:p.write_text(updated,encoding='utf-8',newline='\n')
sha=lambda data:hashlib.sha256(data).hexdigest()
for name in ['call-r22-release.json','call-r23-release.json']:
    p=ROOT/'public'/name;legacy=json.loads(p.read_text())
    for key in legacy['sha256']:legacy['sha256'][key]=sha((ROOT/'public'/key).read_bytes())
    p.write_text(json.dumps(legacy,ensure_ascii=False,indent=2)+'\n')
changes={str(p.relative_to(ROOT/'public')):sha(p.read_bytes()) for p,raw in original.items() if p.read_bytes()!=raw}
assert not any(p.startswith(('data/','aio/','edge-functions/','img/')) for p in changes)
marker.write_text(json.dumps({'release':RELEASE,'scope':'Restore X; bounded same-version Call fallback; safe text; cancellation and recoverable search; 16 existing display cells and 2 additive work facets. No changes to AIO/Reader/L2D or story/source identities.','sha256':changes},ensure_ascii=False,indent=2)+'\n')
# Compare the just-captured public data; never regenerate or reorder story rows.
sources=Path('/tmp/call-r24-sources');capture=json.loads((sources/'report.json').read_text());up=sources/'upstream'
for name,digest in {'callTable.js':'5227e09760a4fc861409ee0415a7bee719b1570ede85bb2a5df5f6a3ce1dfff8','charaAt.js':'44f3aed97565032ae44e8203e47dc845025c90fe2f26ea34fd0c84b748b219ff'}.items():
    assert sha((up/'myfile'/name).read_bytes())==digest,'Source JS changed; review before evaluating its data map.'
node=r'''
const fs=require('fs'),vm=require('vm'),up='/tmp/call-r24-sources/upstream/';
const read=p=>fs.readFileSync(p,'utf8');
function map(path,name){const c={};vm.runInNewContext(read(path)+';globalThis.result='+name,c,{timeout:2000});return c.result;}
const local=map('public/myfile/callTable.js','callTable'),source=map(up+'myfile/callTable.js','callTable');
const norm=n=>({'早乙女先生':'早乙女和子','エッべ':'エッペ'}[n]||n),zh=new Map();
for(const [k]of local){const m=k.match(/^(.*?) \((.*?) \/ /);if(m)zh.set(m[1],m[2]);}
const meta=new Set(['一人称','第一人称','二人称','年齢','年龄','学年','身長','身高','称呼倾向']);
function edges(m,cn){const e=new Map();for(const [caller,vals]of m){const from=norm(cn?(caller.match(/^.*? \((.*?) \/ /)?.[1]||caller):caller);for(const [key,value]of vals){if(meta.has(key)||!value||['-','—','?'].includes(value))continue;const to=norm(cn?(zh.get(key)||key):key);if(from!==to)e.set(from+'\t'+to,value);}}return e;}
const se=edges(source,false),le=edges(local,true),missing=[...se].filter(([k])=>!le.has(k)),extra=[...le].filter(([k])=>!se.has(k));
const la=map('public/myfile/charaAt.js','charaAttribute'),sa=map(up+'myfile/charaAt.js','charaAttribute');
const held=[...sa].filter(([k,v])=>!la.has(k)||JSON.stringify([...v].sort())!==JSON.stringify([...la.get(k)].sort())).map(([jp,v])=>({jp,upstream:[...v],local:la.has(jp)?[...la.get(jp)]:null}));
if(se.size!==2805||le.size!==2804||missing.length!==1||missing[0][0]!=='阿見莉愛\t百江なぎさ'||extra.length||held.length!==1||held[0].jp!=='瀬奈みこと')throw Error('Unexpected source differences; do not auto-copy.');
console.log(JSON.stringify({relations:{upstream:se.size,production:le.size,missing,extra},attributes:{sourceRecords:sa.size,localRecords:la.size,held}}));
'''
data=json.loads(subprocess.check_output(['node','-e',node],text=True))
sp=importlib.util.spec_from_file_location('snapshot',ROOT/'scripts/build-story-snapshot-v6.py');mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
raw=(up/'story.json').read_bytes();payload=json.loads(raw);manifest=json.loads((ROOT/'public/data/story-v6/manifest.json').read_text());categories=[]
for meta in manifest['categories']:
    local=json.loads((ROOT/'public/data/story-v6'/meta['file']).read_text())['rows']
    expected=[mod.normalize_row(meta['key'],i,row) for i,row in enumerate(payload[meta['key']])]
    assert local==expected, 'Story source changed; retain row identities and review separately.'
    categories.append({'category':meta['key'],'rows':len(local),'differentRows':0})
variants=mod.extract_variant_map((up/'index.html').read_text());assert variants==json.loads((ROOT/'public/data/story-v6/variant-map.json').read_text())['families']
base=json.loads((ROOT/'public/data/character-catalog.json').read_text());coverage={}
for page,extra in [('call.html',None),('index.html','story'),('cnt.html','attendance')]:
    local=base+(json.loads((ROOT/('public/data/'+extra+'-character-additions.json')).read_text()) if extra else [])
    names={x['jp'] for x in local}|{a for x in local for a in x.get('aliases',[])}
    if '早乙女和子' in names:names.add('早乙女先生')
    missing=sorted(set(capture['selectors'][page])-names);assert not missing,missing
    coverage[page]={'upstream':len(set(capture['selectors'][page])),'local':len(local),'missingAfterKnownAliases':missing}
models=[]
for rel in ['mdkOCR/mdk.traineddata','mdkOCR/mdm.traineddata']:
    item={'path':rel,'source':'https://magireco-chara-search.vercel.app/'+rel};models.append(item)
    try:
        req=urllib.request.Request(item['source'],headers={'User-Agent':'Mozilla/5.0 Call-r24-source-audit'})
        with urllib.request.urlopen(req,timeout=25) as response:
            body=response.read(12*1024*1024+1);assert response.status==200 and len(body)<=12*1024*1024
        item.update(bytes=len(body),upstreamSha256=sha(body),localSha256=sha((ROOT/'public'/rel).read_bytes()))
        item['identical']=item['upstreamSha256']==item['localSha256']
    except Exception as error:item['error']=str(error)
report={'checkedAt':capture['checkedAt'],'captureRun':os.environ.get('GITHUB_RUN_ID'),'sources':capture['resources'],'story':{'rows':sum(c['rows'] for c in categories),'categories':categories,'rawSourceSha256':sha(raw),'rawSourceMatchesPrevious':sha(raw)==manifest['source']['sha256'],'variantFamilies':len(variants),'variantFamiliesEqual':True},'selectorCoverage':coverage,**data,'addedFacets':[{'jp':n,'tag':'まどドラ'} for n in ['梓みふゆ','アリナ・グレイ']],'displayRepairs':16,'runeModels':models,'heldPolicy':['阿見莉愛→百江なぎさ=安名メル: likely misaligned cell; not added.','瀬奈みこと: keep existing school; do not merge unverified Rumor-character battle tags.','Ashley→更紗帆奈=ひみか: existing suspect entry flagged; no guessed reassignment.'],'limits':'Edge/row coverage is not proof that every historic translation or upstream annotation is correct. L2D/AIO playback is audited separately; no source or binding changes here.'}
(ROOT/'docs/call-upstream-audit-r24.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'release':RELEASE,'publicFiles':len(changes),'sourceRows':report['story']['rows'],'coverage':coverage,'runeModels':models},ensure_ascii=False))
