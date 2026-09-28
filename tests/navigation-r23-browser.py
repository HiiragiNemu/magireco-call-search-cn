#!/usr/bin/env python3
"""Real-browser sidebar regression and read-only cross-site handoff observations."""
import argparse, functools, http.server, json, shutil, threading, time, traceback
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
pa=argparse.ArgumentParser();pa.add_argument('--base');pa.add_argument('--baseline',action='store_true');pa.add_argument('--integration',action='store_true');pa.add_argument('--output',default='/tmp/call-navigation-evidence/browser');a=pa.parse_args()
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
r={'base':base,'baseline':a.baseline,'checks':[],'themes':[],'errors':[],'integration':[],'pass':False}
def ok(name,**kw):r['checks'].append(dict(name=name,pass_=True,**kw));print('PASS',name,flush=True)
def openpage(b,path,site=None):
 p=b.new_page(viewport={'width':1440,'height':900});p.on('pageerror',lambda e:r['errors'].append(str(e)))
 p.add_init_script("localStorage.setItem('magireco-call-theme-v2','light');sessionStorage.setItem('magireco-call-magius-boot-v1','1');")
 p.goto((site or base)+path,wait_until='load',timeout=90000);p.wait_for_function("window.__MAGIRECO_CALL_THEME__&&document.documentElement.dataset.callBootReleased==='true'",timeout=45000)
 collapse=p.locator('.call-jump-collapse-v7')
 if collapse.get_attribute('aria-expanded')=='false':collapse.click()
 return p
rail='.call-jump-actions-v7'
def buttons(p):return p.locator(rail+' button').evaluate_all("ns=>ns.map(n=>({action:n.dataset.action,label:n.getAttribute('aria-label'),title:n.title,text:n.textContent.trim(),svg:n.querySelectorAll('svg').length,visible:n.getBoundingClientRect().height>0}))")
def hit(p,action):p.locator(rail+f' button[data-action="{action}"]').click()
def destination(p,action,target):
 p.evaluate("s=>{const n=document.querySelector(s);for(let e=n;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=false;}",target)
 hit(p,action);p.wait_for_timeout(700)
 assert p.locator(target).is_visible(),(action,target)
 y=p.locator(target).evaluate('n=>n.getBoundingClientRect().top');assert -10<=y<=p.viewport_size['height'],(action,y)
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
     letters={'filter':'筛','characters':'选','results':'果','attributes':'属','cancel':'清','height':'高','top':'↑','bottom':'↓'}
     for item in rows:
      assert item['label']==item['title'] and len(item['label'])>1,item
      if item['action']=='search':assert item['svg']==1 and item['text']=='',item
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
   if a.integration:
    # The sidebar release never changes remote applications. Record every failed
    # handoff distinctly from our own UI test status instead of hiding it.
    local=json.loads((root/'public/aio/story-routes.json').read_text())
    audit={'checkedAt':time.time(),'routes':[],'manifest':{},'browser':[]}
    request=b.new_context().request
    try:
     resp=request.get('https://magireco-aio-router.pages.dev/story-routes.json',timeout=60000);remote=resp.json()
     audit['manifest']={'status':resp.status,'exactlyMatchesCallFallback':remote==local,'routeCount':len(remote['routes']),'targets':remote['targets'],'catalogRevision':remote['catalogRevision']}
     cases=[('main-1',29,None),('character',0,None),('scene0',0,None),('event',50,'initial'),('event',50,'rerun')]
     for slug,index,edition in cases:
      key=f"story-v6:{local['catalogRevision']}:{slug}:{index}"
      from urllib.parse import urlencode
      for target in ['reader','adv']:
       params=dict(source=key,target=target)
       if edition:params['edition']=edition
       row={'source':key,'target':target,'edition':edition,'responses':[]}
       for origin in ['https://magireco-aio-router.pages.dev/open','https://magireco-call-search-cn.pages.dev/aio/open']:
        try:
         res=request.get(origin+'?'+urlencode(params),max_redirects=0,timeout=60000)
         row['responses'].append({'request':res.url,'status':res.status,'location':res.headers.get('location')})
        except Exception as e:row['responses'].append({'request':origin,'error':str(e)})
       row['sameDestination']=len({x.get('location') for x in row['responses']})==1 and all(x.get('status')==302 for x in row['responses']);audit['routes'].append(row)
     # Real production Call controls -> popup navigation, not fabricated links.
     q=openpage(b,'/story',site='https://magireco-call-search-cn.pages.dev');q.locator('#storyCharacterFilter').fill('Satomi Touka');q.locator('#storyCharacterGrid [data-jp="里見灯花"]').click()
     q.evaluate("document.querySelectorAll('input[name=storyType]').forEach(n=>n.checked=n.value==='メイン【第1部】')")
     q.locator('#storySearchButton').click();q.wait_for_function("document.querySelector('.story-row-v7[data-story-row-index=\"29\"]')",timeout=90000)
     article=q.locator('.story-row-v7[data-story-row-index="29"]')
     for target in ['reader','adv']:
      link=article.locator('a.'+target).first;entry={'target':target,'clickedHref':link.get_attribute('href'),'events':[],'requests':[],'errors':[]}
      context=q.context
      def instrument(page):
       page.add_init_script("window.__handoffs=[];addEventListener('adv-handoff-status',e=>__handoffs.push(e.detail));")
       page.on('pageerror',lambda e:entry['errors'].append(str(e)))
       page.on('response',lambda res:entry['requests'].append({'url':res.url,'status':res.status,'revision':res.headers.get('x-demo-reader-revision')}) if '/api/magi-reader/' in res.url else None)
      context.on('page',instrument)
      with q.expect_popup(timeout=60000) as popup:link.click()
      child=popup.value
      try:
       child.wait_for_load_state('domcontentloaded',timeout=60000)
       if target=='adv':
        try:child.wait_for_function("['playing','failed','voice'].includes(document.documentElement.dataset.advHandoffState)",timeout=90000)
        except Exception:pass
       else:child.wait_for_timeout(5000)
       entry.update(url=child.url,body=child.locator('body').inner_text()[:12000],state=child.evaluate("document.documentElement.dataset.advHandoffState||null"),events=child.evaluate('window.__handoffs||[]'),canvas=child.locator('canvas').count())
       child.screenshot(path=str(out/f'integration-{target}.png'))
      except Exception as e:entry['error']=str(e);entry['url']=child.url
      finally:child.close();context.remove_listener('page',instrument)
      audit['browser'].append(entry)
     q.close()
    except Exception as e:audit['error']=str(e)
    r['integration']=audit
    print('INTEGRATION',json.dumps(audit,ensure_ascii=False),flush=True)
  finally:b.close()
except Exception:
 r['failure']=traceback.format_exc();print(r['failure'],flush=True);raise
finally:
 (out/'report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 if server:server.shutdown()
