#!/usr/bin/env python3
"""Real-browser sidebar regression; downstream checks live in the integration test."""
import argparse, functools, http.server, json, shutil, threading, traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
pa=argparse.ArgumentParser();pa.add_argument('--base');pa.add_argument('--baseline',action='store_true');pa.add_argument('--output',default='/tmp/call-navigation-evidence/browser');a=pa.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  u=urlparse(self.path)
  if u.path in ['/story','/attendance','/runes']: self.path=u.path+'.html'+(('?'+u.query) if u.query else '')
  super().do_GET()
server=None
if not a.base:
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'public')));threading.Thread(target=server.serve_forever,daemon=True).start()
base=a.base.rstrip('/') if a.base else f'http://127.0.0.1:{server.server_port}'
r={'base':base,'baseline':a.baseline,'checks':[],'themes':[],'errors':[],'pass':False}
def ok(name,**kw):r['checks'].append(dict(name=name,pass_=True,**kw));print('PASS',name,flush=True)
def openpage(b,path):
 p=b.new_page(viewport={'width':1440,'height':900});p.on('pageerror',lambda e:r['errors'].append(str(e)))
 p.add_init_script("localStorage.setItem('magireco-call-theme-v2','light');sessionStorage.setItem('magireco-call-magius-boot-v1','1');")
 p.goto(base+path,wait_until='load',timeout=90000);p.wait_for_function("window.__MAGIRECO_CALL_THEME__&&document.documentElement.dataset.callBootReleased==='true'",timeout=45000)
 collapse=p.locator('.call-jump-collapse-v7')
 if collapse.get_attribute('aria-expanded')=='false':collapse.click()
 return p
rail='.call-jump-actions-v7'
def buttons(p):return p.locator(rail+' button').evaluate_all("ns=>ns.map(n=>({action:n.dataset.action,label:n.getAttribute('aria-label'),title:n.title,text:n.textContent.trim(),svg:n.querySelectorAll('svg').length,visible:n.getBoundingClientRect().height>0}))")
def hit(p,action):p.locator(rail+f' button[data-action="{action}"]').click()
def destination(p,action,target):
 p.evaluate("s=>{const n=document.querySelector(s);for(let e=n;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=false;}",target)
 hit(p,action)
 # Native smooth scrolling can exceed 700ms across a full character catalog.
 # Wait for the observable destination, not a machine-dependent fixed delay.
 try:
  p.wait_for_function("s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return r.height>0&&r.top>=-10&&r.top<innerHeight}",arg=target,timeout=10000)
 except Exception:
  details=p.evaluate("s=>({target:s,top:document.querySelector(s).getBoundingClientRect().top,rootTop:__MAGIRECO_SCROLL__.top,rootHeight:__MAGIRECO_SCROLL__.height,clientHeight:__MAGIRECO_SCROLL__.clientHeight})",target)
  raise AssertionError((action,details))
 assert p.locator(target).is_visible(),(action,target)
try:
 with sync_playwright() as pw:
  exe=shutil.which('chromium');b=pw.chromium.launch(**({'executable_path':exe} if exe else {}),args=['--no-sandbox'])
  try:
   p=openpage(b,'/story')
   if a.baseline:
    old=buttons(p);assert sum(x['action']=='search' for x in old)==3,old
    p.locator('.call-jump-widget-v7').screenshot(path=str(out/'before-rail.png'));ok('reproduced three search-classified story controls',buttons=old);p.close()
   else:
    ex={'/story':['top','filter','characters','search','results','cancel','bottom'],'/attendance':['top','filter','characters','cancel','bottom'],'/':['top','characters','filter','attributes','search','cancel','height','bottom'],'/runes':['top','bottom']}
    for path,expected in ex.items():
     if path!='/story':p=openpage(b,path)
     rows=buttons(p);assert [x['action'] for x in rows]==expected,(path,rows)
     letters={'filter':'筛','characters':'选','results':'果','attributes':'属','height':'高','top':'↑','bottom':'↓'}
     for item in rows:
      assert item['label']==item['title'] and len(item['label'])>1,item
      if item['action'] in ['search','cancel']:assert item['svg']==1 and item['text']=='',item
      else:assert item['svg']==0 and item['text']==letters[item['action']],item
     for width,height in [(1440,900),(390,844)]:
      p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(150)
      sizes=p.locator(rail+' .call-rail-letter').evaluate_all("ns=>ns.map(n=>{const c=getComputedStyle(n),r=n.getBoundingClientRect();return{font:parseFloat(c.fontSize),height:r.height,width:r.width,inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}})")
      assert all(s['font']>=14 and s['height']>0 and s['inside'] for s in sizes),sizes
      p.locator('.call-jump-collapse-v7').click();visible=[x['action'] for x in buttons(p) if x['visible']];assert visible==[x for x in expected if x in ['top','search','bottom']],visible
      p.locator('.call-jump-collapse-v7').click();assert all(x['visible'] for x in buttons(p))
     p.set_viewport_size({'width':1440,'height':900});ok('distinct controls and collapsed/mobile layout',page=path,buttons=rows)
     if path=='/story':
      p.evaluate("window.searchClicks=0;document.querySelector('#storySearchButton').addEventListener('click',()=>searchClicks++);")
      for action,target in [('filter','.story-search-panel-v8'),('characters','.story-character-panel-v8'),('results','.story-results-panel-v8')]:destination(p,action,target)
      assert p.evaluate('searchClicks')==0;ok('filter, character and results shortcuts only navigate; folded targets reveal')
      hit(p,'characters');p.locator('#storyCharacterFilter').fill('Tamaki Iroha');p.locator('#storyCharacterGrid [data-jp="環いろは"]').click()
      search=p.locator(rail+' [data-action="search"]');search.focus();search.press('Enter')
      p.wait_for_function("+document.querySelector('#storyResultsBody').dataset.resultTotal>0",timeout=90000)
      assert p.evaluate('searchClicks')==1;assert p.locator('.story-row-v7').count()<=100
      ok('keyboard search executes exactly once, with bounded result DOM',total=p.locator('#storyResultsBody').get_attribute('data-result-total'))
      hit(p,'results');assert p.evaluate('searchClicks')==1
      p.locator(rail+' [data-action="cancel"]').focus();p.locator(rail+' [data-action="cancel"]').press('Enter')
      assert p.locator('#storyCharacterGrid [aria-pressed="true"]').count()==0;assert not p.locator('#storyResultsBody').get_attribute('data-result-total');ok('clear retains reset behavior and results navigation never repeats search')
      for theme,ph in [('light','green'),('paper','green'),('green','green'),('dark','green'),('dark','amber'),('frost','green')]:
       p.evaluate("([t,c])=>{__MAGIRECO_CALL_THEME__.setTheme(t);if(t==='dark')__MAGIRECO_CALL_THEME__.setPhosphor(c)}",[theme,ph]);p.wait_for_timeout(200)
       styles=p.locator(rail+' .call-rail-letter').evaluate_all("ns=>ns.map(n=>{const c=getComputedStyle(n);return{text:n.textContent,color:c.color,font:c.fontFamily,shadow:c.textShadow,inScene:!!n.closest('.call-display-root-v7')}})")
       assert all(x['inScene'] for x in styles);r['themes'].append(dict(theme=theme,phosphor=ph,styles=styles))
       p.locator('.call-jump-widget-v7').screenshot(path=str(out/f'rail-{theme}-{ph}.png'))
      assert len({x['styles'][0]['color'] for x in r['themes']})>=5;ok('six palette/phosphor variants retain readable Chinese and shared materials')
     p.close()
    assert not r['errors'],r['errors']
   r['pass']=True
  finally:b.close()
except Exception:
 r['failure']=traceback.format_exc();print(r['failure'],flush=True);raise
finally:
 (out/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 if server:server.shutdown()
