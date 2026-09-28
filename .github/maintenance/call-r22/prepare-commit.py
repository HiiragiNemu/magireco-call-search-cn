import base64,concurrent.futures,hashlib,json,os,subprocess,time
from pathlib import Path
import requests
repo='HiiragiNemu/magireco-call-search-cn';assert os.environ['GITHUB_REPOSITORY']==repo
api='https://api.github.com/repos/'+repo
headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
def request(method,path,body=None):
 for attempt in range(4):
  response=requests.request(method,api+path,headers=headers,json=body,timeout=60)
  if response.status_code>=500 and attempt<3:time.sleep(2);continue
  response.raise_for_status();return response.json()
parent=os.environ['GITHUB_SHA'];assert request('GET','/git/ref/heads/main')['object']['sha']==parent,'main changed; do not overwrite'
commit=request('GET','/git/commits/'+parent)
paths=[p for p in subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0') if p]
assert paths and not any(p.startswith(('functions/','public/aio/','public/edge-functions/','public/data/story-v6/')) for p in paths)
report=json.loads(Path('/tmp/call-r22-verify/browser/results.json').read_text());assert report['pass'] and not report['errors']
assert not Path('.github/workflows/call-r22-verify.yml').exists()
def entry(path):
 p=Path(path)
 if not p.exists():return {'path':path,'mode':'100644','type':'blob','sha':None}
 raw=p.read_bytes();expected=hashlib.sha1(('blob '+str(len(raw))+'\0').encode()+raw).hexdigest()
 blob=request('POST','/git/blobs',{'content':base64.b64encode(raw).decode(),'encoding':'base64'});assert blob['sha']==expected,path
 mode=subprocess.check_output(['git','ls-files','-s','--',path]).decode().split()[0]
 return {'path':path,'mode':mode,'type':'blob','sha':expected}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:entries=list(pool.map(entry,paths))
tree=request('POST','/git/trees',{'base_tree':commit['tree']['sha'],'tree':entries})
prepared=request('POST','/git/commits',{'message':'fix(call): finish adaptive tables, theme hints and complete story rosters','tree':tree['sha'],'parents':[parent]})
Path('/tmp/call-r22-verify/prepared-commit.json').write_text(json.dumps({'parent':parent,'sha':prepared['sha'],'tree':tree['sha'],'entries':entries,'browserPass':True,'refUpdated':False},indent=2)+'\n')
print('Prepared commit (not published):',prepared['sha'])
