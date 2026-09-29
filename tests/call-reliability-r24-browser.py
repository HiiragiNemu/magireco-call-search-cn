"""Real Call pages with explicit failure injection; does not mutate server data."""
import argparse,functools,http.server,json,shutil,threading,traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ap=argparse.ArgumentParser();ap.add_argument('--base');ap.add_argument('--output',required=True);a=ap.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  u=urlparse(self.path)
  if u.path in ['/story','/attendance','/runes']:self.path=u.path+'.html'+(('?'+u.query) if u.query else '')
  super().do_GET()
server=None
if not a.base:
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'public')));threading.Thread(target=server.serve_forever,daemon=True).start()
base=a.base.rstrip('/') if a.base else f'http://127.0.0.1:{server.server_port}'
r={'base':base,'checks':[],'errors':[],'pass':False,'injection':'503 and delayed ranking resolver are test-only, not changes to service data'}
def newpage(browser):
 p=browser.new_page(viewport={'width':1440,'height':900});p.on('pageerror',lambda e:r['errors'].append(str(e)))
 p.add_init_script("localStorage.setItem('magireco-call-theme-v2','light');sessionStorage.setItem('magireco-call-magius-boot-v1','1');")
 return p
def ready(p,path):
 p.goto(base+path,wait_until='load',timeout=90000);p.wait_for_function("document.documentElement.dataset.callBootReleased==='true'",timeout=45000)
try:
 with sync_playwright() as pw:
  exe=shutil.which('chromium');b=pw.chromium.launch(**({'executable_path':exe} if exe else {}),args=['--no-sandbox'])
  try:
   p=newpage(b);p.route('https://magireco-aio-router.pages.dev/story-routes.json',lambda route:route.fulfill(status=503,body='injected outage'))
   ready(p,'/story');p.wait_for_function("document.querySelectorAll('#storyCharacterGrid button').length===291")
   p.locator('#storyCharacterFilter').fill('Tamaki Iroha');p.locator('#storyCharacterGrid [data-jp="環いろは"]').click()
   p.evaluate("document.querySelectorAll('input[name=storyType]').forEach(n=>n.checked=n.value==='メイン【第1部】')")
   p.locator('#storySearchButton').click();p.wait_for_function("+document.querySelector('#storyResultsBody').dataset.resultTotal>0",timeout=60000)
   hrefs=p.locator('.story-row-v7 a.adv').evaluate_all('ns=>ns.map(n=>n.href)');assert hrefs
   assert all(urlparse(h).netloc==urlparse(base).netloc and urlparse(h).path=='/aio/open' for h in hrefs),hrefs[:2]
   r['checks'].append({'name':'AIO 503 produces actual same-origin Reader/ADV links without losing search results','count':len(hrefs),'example':hrefs[0]})
   p.screenshot(path=str(out/'fallback-search.png'));p.close()
   p=newpage(b)
   # Preserve the actual module; only delay its resolver, to make the potential
   # race deterministic rather than pretending a synthetic run is a live GAS result.
   p.add_init_script("""(()=>{let tools;Object.defineProperty(window,'MagiToolsV7',{configurable:true,get:()=>tools,set:v=>{tools={...v,resolveCharacterV7:n=>new Promise(resolve=>{window.__r24Resume=()=>Promise.resolve(v.resolveCharacterV7(n)).then(resolve)})}}})})();""")
   p.route('https://script.google.com/macros/s/**/exec?*',lambda route:route.fulfill(status=200,content_type='application/json',body='[["七海やちよ",7]]'))
   ready(p,'/attendance');p.wait_for_function("document.querySelectorAll('#attendanceGrid button').length===194")
   p.locator('#attendanceFilter').fill('Tamaki Iroha');p.locator('#attendanceGrid [data-jp="環いろは"]').click();p.wait_for_function('!!window.__r24Resume')
   p.locator('#attendanceClear').click();p.evaluate('window.__r24Resume()');p.wait_for_timeout(300)
   assert p.locator('.attendance-row').count()==0;assert '已清除' in p.locator('#attendanceStatus').inner_text()
   r['checks'].append({'name':'clear during delayed result resolution stays cleared','status':p.locator('#attendanceStatus').inner_text()});p.close()
   p=newpage(b);ready(p,'/story-title-editor.html');p.wait_for_function("!!document.documentElement.dataset.storyTitleEditorV2",timeout=45000)
   p.locator('#titleImportFile').set_input_files({'name':'invalid-r24.json','mimeType':'application/json','buffer':b'<b>r24</b>'})
   p.wait_for_function("document.querySelector('#titleEditorStatus').textContent.includes('导入失败')")
   text=p.locator('#titleEditorStatus').inner_text();assert '<b>r24</b>' in text,text;assert p.locator('#titleEditorStatus > *').count()==0
   r['checks'].append({'name':'actual imported JSON error renders literally','text':text});p.screenshot(path=str(out/'literal-import-error.png'));p.close()
   assert not r['errors'],r['errors'];r['pass']=True
  finally:b.close()
except Exception:r['failure']=traceback.format_exc()
finally:
 if server:server.shutdown();server.server_close()
 (out/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False));
raise SystemExit(0 if r['pass'] else 1)
