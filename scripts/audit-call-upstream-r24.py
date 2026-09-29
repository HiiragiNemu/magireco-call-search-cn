#!/usr/bin/env python3
"""Read-only, bounded public-source capture. Never regenerates production data."""
import argparse, datetime, hashlib, json, subprocess, urllib.request
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

BASE = 'https://magireco-chara-search.vercel.app/'
PAGES = ['call.html', 'index.html', 'cnt.html', 'json_open.html', 'mdkOCR/index.html']
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.scripts=[]; self.names=[]; self.links=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='script' and a.get('src'): self.scripts.append(a['src'])
        if tag=='input' and 'MagicalChk' in a.get('class','').split(): self.names.append(a.get('value',a.get('id','')))
        if tag=='a' and a.get('href'): self.links.append(a['href'])

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--output', required=True); args=ap.parse_args()
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repositoryCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'resources':[],'selectors':{}}
    # git archive includes only committed repository files, not credentials or runner state.
    subprocess.run(['git','archive','--format=tar.gz','--output='+str(out/'repository.tar.gz'),'HEAD'],check=True)
    seen=set()
    def get(url, target):
        if url in seen: return None
        seen.add(url); item={'url':url,'path':str(target.relative_to(out))}; report['resources'].append(item)
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Call-source-audit','Cache-Control':'no-cache'})
            with urllib.request.urlopen(req,timeout=25) as response:
                data=response.read(12*1024*1024+1)
                if len(data)>12*1024*1024: raise ValueError('Response exceeds capture budget')
                item.update(status=response.status,finalUrl=response.url,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))
                target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data); return data
        except Exception as error: item['error']=str(error); return None
    scripts=set()
    for rel in PAGES:
        url=urljoin(BASE,rel); data=get(url,out/'upstream'/rel)
        if data is None: continue
        parser=Page(); parser.feed(data.decode('utf-8-sig'))
        report['selectors'][rel]=parser.names; report.setdefault('links',{})[rel]=parser.links
        for script in parser.scripts:
            absolute=urljoin(url,script)
            if urlsplit(absolute).netloc==urlsplit(BASE).netloc: scripts.add(absolute)
    for url in sorted(scripts)[:35]: get(url,out/'upstream'/urlsplit(url).path.lstrip('/'))
    source='https://drive.google.com/uc?export=download&id=1kFoEYZ6nJrYQAxGQVwN-SyLg-aPKkH6q'
    data=get(source,out/'upstream/story.json')
    if data:
        try:
            payload=json.loads(data); report['storyRows']={k:len(v) for k,v in payload.items()}
            report['storyBytesMatchBaseline']=hashlib.sha256(data).hexdigest()==json.loads(Path('public/data/story-v6/manifest.json').read_text())['source']['sha256']
        except Exception as error: report['storyParseError']=str(error)
    base=json.loads(Path('public/data/character-catalog.json').read_text())
    for rel,extra in [('call.html',None),('index.html','story'),('cnt.html','attendance')]:
        local=base+(json.loads(Path('public/data/'+extra+'-character-additions.json').read_text()) if extra else [])
        names={x['jp'] for x in local}; original=set(report['selectors'].get(rel,[]))
        report.setdefault('coverage',{})[rel]={'upstream':len(original),'local':len(names),'missing':sorted(original-names),'localOnly':sorted(names-original)}
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'commit':report['repositoryCommit'],'resources':len(report['resources']),'coverage':report['coverage']},ensure_ascii=False))
if __name__=='__main__': main()
