#!/usr/bin/env python3
"""Verify every r22 production byte, with a deployment marker gate first."""
import concurrent.futures, hashlib, json, time, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='https://magireco-call-search-cn.pages.dev/'
release=root/'public/call-r22-release.json'
expected=release.read_bytes()
def get(path):
 req=urllib.request.Request(base+path+'?verify='+str(time.time_ns()),headers={'User-Agent':'Mozilla/5.0 Call-r22-verification','Cache-Control':'no-cache, no-store'})
 with urllib.request.urlopen(req,timeout=45) as r:return r.read()
for attempt in range(60):
 try:
  assert get('call-r22-release.json')==expected,'production deployment has not converged'
  break
 except Exception:
  if attempt==59:raise
  time.sleep(5)
manifest=json.loads(expected)
def verify(item):
 path,sha=item;actual=hashlib.sha256(get(path)).hexdigest();assert actual==sha,path
 return {'path':path,'sha256':actual,'pass':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:checks=list(pool.map(verify,manifest['sha256'].items()))
assert json.loads(get('data/story-v6/manifest.json'))['totalRows']==14466
assert len(json.loads(get('data/character-catalog.json')))==193
Path('/tmp/call-r22-production-bytes.json').write_text(json.dumps({'release':manifest['release'],'pass':True,'files':checks,'storyRows':14466,'baseCharacters':193},indent=2)+'\n')
print('Verified production release',manifest['release'],'and',len(checks),'files byte-for-byte.')
