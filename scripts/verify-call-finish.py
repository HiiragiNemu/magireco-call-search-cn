#!/usr/bin/env python3
"""Read-only verification of Call deployment bytes, source portraits and paged results."""
import argparse, hashlib, io, json, math, shutil, time, urllib.request
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser()
p.add_argument('--base',required=True);p.add_argument('--output',required=True)
p.add_argument('--wait',type=int,default=0);p.add_argument('--baseline-script')
p.add_argument('--check-upstream',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1];base=a.base.rstrip('/')
report=json.loads((root/'docs/call-sync-20260928.json').read_text())
proof={'base':base,'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'state':'fail','hashes':{},'browsers':[]}
paths=['public/myfile/story-app-v7.js','public/myfile/callTable.js','public/data/character-catalog.json','public/story.html','public/index.html']+[x['outputPath'] for x in report['portraits']]
end=time.monotonic()+a.wait
while True:
 try:
  for path in paths:
   url=base+'/'+quote(path.removeprefix('public/'),safe='/')+'?call_sync_verify='+str(time.time_ns())
   req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'Call-sync-verifier/1.0'})
   data=urllib.request.urlopen(req,timeout=35).read()
   wanted=hashlib.sha256((root/path).read_bytes()).hexdigest();got=hashlib.sha256(data).hexdigest()
   assert got==wanted,(path,'deployment bytes do not match checkout',wanted,got)
   proof['hashes'][path]=got
  break
 except Exception:
  if time.monotonic()>=end:raise
  time.sleep(5)
if a.check_upstream:
 from PIL import Image
 from html.parser import HTMLParser
 class RosterParser(HTMLParser):
  def __init__(self):super().__init__();self.names=[]
  def handle_starttag(self,tag,attrs):
   attrs=dict(attrs)
   if tag=='input' and attrs.get('name')=='chara' and attrs.get('id'):self.names.append(attrs['id'])
 source_html=urllib.request.urlopen('https://magireco-chara-search.vercel.app/call.html',timeout=35).read()
 parser=RosterParser();parser.feed(source_html.decode('utf-8'))
 upstream_names={('早乙女和子' if n=='早乙女先生' else n) for n in parser.names}
 local_names={c['jp'] for c in json.loads((root/'public/data/character-catalog.json').read_text())}
 assert upstream_names==local_names,(upstream_names-local_names,local_names-upstream_names)
 proof['upstreamRoster']={'count':len(upstream_names),'missing':0,'htmlSha256':hashlib.sha256(source_html).hexdigest()}
 proof['upstreamPortraits']=[]
 for item in report['portraits']:
  data=urllib.request.urlopen(item['sourceUrl'],timeout=35).read()
  src=Image.open(io.BytesIO(data)).convert('RGBA');dest=Image.open(root/item['outputPath']).convert('RGBA')
  assert src.size==dest.size and src.tobytes()==dest.tobytes(),item['jp']
  proof['upstreamPortraits'].append({'jp':item['jp'],'identicalPixels':True,'sourceSha256':hashlib.sha256(data).hexdigest()})
def prepare(page):
 page.goto(base+'/story.html?verify='+str(time.time_ns()),wait_until='domcontentloaded',timeout=120000)
 page.wait_for_function("document.querySelectorAll('#storyCharacterGrid .suite-character-card').length===193",timeout=120000)
 page.locator('#storyKeyword').fill('の');page.locator('#storySelectAll').click()
def search(page):
 page.evaluate('''() => {window.__callPerfStart=performance.now();window.__callLongTasks=[];
 if(window.__callPerfObserver)window.__callPerfObserver.disconnect();
 window.__callPerfObserver=new PerformanceObserver(list=>window.__callLongTasks.push(...list.getEntries().map(e=>e.duration)));
 window.__callPerfObserver.observe({type:'longtask'});
 }''')
 page.locator('#storySearchButton').click()
 page.wait_for_function("document.querySelector('#storyStatus').textContent.includes('搜索完成')",timeout=120000)
 return page.evaluate('''() => ({elapsedMs:performance.now()-window.__callPerfStart,
 rows:document.querySelectorAll('.story-row-v7').length,
 resultNodes:document.querySelectorAll('#storyResultsBody *').length,
 longTasks:window.__callLongTasks,status:document.querySelector('#storyStatus').textContent})''')
with sync_playwright() as pw:
 binary=shutil.which('chromium');browser=pw.chromium.launch(**({'executable_path':binary} if binary else {}),args=['--no-sandbox'])
 for viewport,throttle in [({'width':1280,'height':900},1),({'width':390,'height':844},4)]:
  ctx=browser.new_context(viewport=viewport);page=ctx.new_page();errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)));prepare(page)
  session=ctx.new_cdp_session(page);session.send('Emulation.setCPUThrottlingRate',{'rate':throttle})
  initial=search(page)
  total=int(page.locator('#storyResultsBody').get_attribute('data-result-total'))
  assert total>1800 and initial['rows']==100,(total,initial)
  expected=page.evaluate('''async () => {
   const m=await MagiToolsV7.fetchJson('./data/story-v6/manifest.json');
   const types=[...document.querySelectorAll('#storyTypeOptions input:checked')].map(x=>x.value);
   const text=v=>{const d=document.createElement('div');d.innerHTML=String(v??'').replace(/<BR\\s*\\/?>/gi,'\\n');return(d.textContent||'').replace(/\\n+/g,' ').trim();};
   const out=[];
   for(const key of types){const c=m.categories.find(c=>c.key===key);const data=await MagiToolsV7.fetchJson('./data/story-v6/'+c.file);
    data.rows.forEach((r,i)=>{const t=(text(r[0])+' '+text(r[2])).normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\\s+/g,' ').trim();if(t.includes('の'))out.push(key+':'+i);});
   }return out;
  }''')
  assert len(expected)==total,(len(expected),total)
  def check_page(number):
   page.wait_for_function("p=>document.querySelector('#storyResultsBody').dataset.resultPage===String(p)",arg=number,timeout=60000)
   actual=page.locator('.story-row-v7').evaluate_all("es=>es.map(e=>e.dataset.storyCategory+':'+e.dataset.storyRowIndex)")
   assert actual==expected[(number-1)*100:number*100],(number,actual[:1]);assert len(actual)<=100
   return len(actual)
  check_page(1)
  jump=page.locator('[data-story-page-input]').first;jump.fill('19');jump.press('Enter');check_page(19)
  page.locator('[data-story-page-action="last"]').first.click();last_rows=check_page(math.ceil(total/100))
  page.locator('[data-story-page-action="first"]').first.click();check_page(1)
  warm=[search(page) for _ in range(2)]
  page.wait_for_function("[...document.querySelectorAll('.story-result-list-v7')].every(x=>x.dataset.parentFoldV18)",timeout=30000)
  item={'viewport':viewport,'cpuThrottle':throttle,'catalog':193,'totalMatches':total,'pages':math.ceil(total/100),'lastPageRows':last_rows,'initial':initial,'warm':warm,'verifiedPages':[1,19,math.ceil(total/100)],'pageErrors':errors}
  assert not errors,errors
  if a.baseline_script:
   old=ctx.new_page();old.route('**/myfile/story-app-v7.js*',lambda route:route.fulfill(path=a.baseline_script,content_type='application/javascript'))
   prepare(old);s=ctx.new_cdp_session(old);s.send('Emulation.setCPUThrottlingRate',{'rate':throttle});search(old)
   item['baselineWarm']=[search(old) for _ in range(2)]
   assert all(x['rows']==1800 for x in item['baselineWarm']);old.close()
  proof['browsers'].append(item);ctx.close()
 browser.close()
proof['state']='pass';Path(a.output).write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(proof,ensure_ascii=False,indent=2))
