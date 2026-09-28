#!/usr/bin/env python3
"""Call r22 local/production UI regressions; never open Reader/AIO/ADV."""
import argparse, datetime, functools, http.server, json, shutil, threading, time, traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
pa=argparse.ArgumentParser();pa.add_argument('--base');pa.add_argument('--output',default='/tmp/call-r22-browser');a=pa.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);root=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  u=urlparse(self.path)
  if u.path in ['/story','/attendance','/runes']:self.path=u.path+'.html'+(('?'+u.query) if u.query else '')
  return super().do_GET()
server=None
if not a.base:
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'public')))
 threading.Thread(target=server.serve_forever,daemon=True).start()
base=a.base.rstrip('/') if a.base else f'http://127.0.0.1:{server.server_port}'
report={'base':base,'checks':[],'errors':[],'themes':[],'pass':False}
def ok(name,**kw):report['checks'].append(dict(name=name,**kw));print('PASS',name,flush=True)
def openpage(b,path='/',controlled_clock=False):
 p=b.new_page(viewport={'width':1440,'height':900});p.on('pageerror',lambda e:report['errors'].append(str(e)))
 if controlled_clock:p.clock.install(time=datetime.datetime(2026,9,29,tzinfo=datetime.timezone.utc))
 p.add_init_script("localStorage.setItem('magireco-call-theme-v2','light');sessionStorage.setItem('magireco-call-magius-boot-v1','1');")
 r=p.goto(base+path,wait_until='load',timeout=60000);assert r.ok,r.status
 p.wait_for_function("window.__MAGIRECO_CALL_THEME__&&document.documentElement.dataset.callBootReleased==='true'",timeout=30000);return p
def metrics(p):return p.evaluate("""()=>{const v=document.querySelector('.relationship-table-viewport'),s=v.querySelector('.relationship-table-stage');return{height:v.clientHeight,stage:s.offsetHeight,scrollHeight:v.scrollHeight,scrollWidth:v.scrollWidth,width:v.clientWidth,scrollY:v.dataset.scrollY,overscroll:getComputedStyle(v).overscrollBehaviorY,top:v.scrollTop,outer:__MAGIRECO_SCROLL__.top};}""")
def reveal(p):
 p.evaluate("""()=>{const v=document.querySelector('.relationship-table-viewport');for(let e=v;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true;v.scrollIntoView({block:'center',behavior:'instant'});}""");p.wait_for_timeout(300)
def select(p,names):
 p.evaluate("""names=>{document.querySelectorAll('input.MagicalChk').forEach(n=>n.checked=names.includes(n.id));drawNet_Table();}""",names);reveal(p)
 p.wait_for_function("document.querySelector('.relationship-table-stage').offsetHeight>1");p.wait_for_timeout(150)
def wheel(p,dy,dx=0,expect_motion=True):
 point=p.evaluate("""()=>{const v=document.querySelector('.relationship-table-viewport'),r=v.getBoundingClientRect(),x=Math.max(25,Math.min(innerWidth-80,r.left+Math.min(r.width/2,400))),y=Math.max(90,Math.min(innerHeight-90,(Math.max(90,r.top)+Math.min(innerHeight-90,r.bottom))/2));return{x,y,hit:v.contains(document.elementFromPoint(x,y)),node:document.elementFromPoint(x,y)?.tagName};}""")
 assert point['hit'],point;p.mouse.move(point['x'],point['y']);before=metrics(p);p.mouse.wheel(dx,dy)
 # mouse.wheel dispatches input; it does not wait for the compositor to scroll.
 # Keep real clocks and wait for observable motion, not a machine-speed sleep.
 if expect_motion:
  p.wait_for_function("before=>{const v=document.querySelector('.relationship-table-viewport');return Math.abs(v.scrollTop-before.top)>40||Math.abs(__MAGIRECO_SCROLL__.top-before.outer)>40;}",arg=before,timeout=15000)
 p.wait_for_timeout(350);return before,metrics(p)
try:
 with sync_playwright() as pw:
  exe=shutil.which('chromium');b=pw.chromium.launch(**({'executable_path':exe} if exe else {}),args=['--no-sandbox'])
  try:
   p=openpage(b);short=['静海このは','遊佐葉月'];assert p.locator('input.MagicalChk').count()==193
   select(p,short);m=metrics(p);assert m['height']<=m['stage']+2 and m['height']<350,m;assert m['scrollY']=='false' and m['overscroll']=='auto',m
   x,z=wheel(p,-220);assert z['outer']<x['outer']-100,(x,z);ok('short table fits content; wheel scrolls page',before=x,after=z)
   reveal(p);p.screenshot(path=str(out/'short-table.png'))
   p.evaluate("document.querySelector('.relationship-table-viewport').style.height='850px'");p.wait_for_timeout(100);m=metrics(p);assert m['height']<=m['stage']+2,m;ok('manual resize cannot recreate empty space')
   p.set_viewport_size({'width':900,'height':900});select(p,short);p.evaluate("__MAGIRECO_CORRECTION_V2__.applyRelationScale(1.6,'manual')");p.wait_for_timeout(150);reveal(p)
   m=metrics(p);assert m['scrollWidth']>m['width'] and m['scrollY']=='false',m;x,z=wheel(p,-180);assert z['outer']<x['outer']-80,(x,z)
   sizes=[]
   for i in range(4):p.evaluate("__MAGIRECO_CORRECTION_V2__.applyRelationScale(1.6,'manual')");sizes.append(metrics(p)['stage'])
   assert len(set(sizes))==1,sizes;ok('horizontal-only overflow passes wheel; zoom does not compound',sizes=sizes)
   p.set_viewport_size({'width':1440,'height':900});many=p.locator('input.MagicalChk').evaluate_all('ns=>ns.slice(0,30).map(n=>n.id)');select(p,many)
   p.evaluate("__MAGIRECO_CORRECTION_V2__.applyRelationScale(1,'manual')");p.wait_for_timeout(200);reveal(p);p.evaluate("document.querySelector('.relationship-table-viewport').scrollTop=0")
   m=metrics(p);assert m['scrollY']=='true' and m['overscroll']=='contain' and m['height']<=630,m
   x,z=wheel(p,200);assert z['top']>x['top']+50 and abs(z['outer']-x['outer'])<2,(x,z);ok('long table scrolls internally without moving page',before=x,after=z)
   p.evaluate("document.querySelector('.relationship-table-viewport').scrollTop=0");x,z=wheel(p,-200,expect_motion=False);assert abs(z['outer']-x['outer'])<2,(x,z);ok('long-table boundary remains contained')
   p.evaluate("""()=>{const n=document.querySelector('[data-relation-height-range]');n.value='45';n.dispatchEvent(new Event('input',{bubbles:true}));}""");p.wait_for_timeout(160);assert metrics(p)['height']<=405;ok('height upper-limit slider works')
   select(p,short);m=metrics(p);assert m['height']<=m['stage']+2 and m['scrollY']=='false',m
   p.evaluate("""()=>{document.querySelector('.call-result-details-v8').open=false;drawNet_Table();}""");p.wait_for_timeout(200);reveal(p);m=metrics(p);assert m['height']<=m['stage']+2 and m['scrollY']=='false',m;ok('long-to-short and delayed folded-panel reveal remeasure')
   changes=p.evaluate("""()=>new Promise(resolve=>{let n=0;const o=new MutationObserver(es=>n+=es.length);o.observe(document.querySelector('.relationship-table-viewport'),{attributes:true,subtree:true});setTimeout(()=>{o.disconnect();resolve(n)},600)})""");assert changes<=2,changes;ok('no idle sizing loop',mutations=changes)
   # Short-lived overlays need a controlled clock for screenshots on GPU-less CI:
   # the unchanged full CRT graph can take seconds per software-rendered frame.
   p.close();p=openpage(b,controlled_clock=True);select(p,short)
   p.clock.pause_at(datetime.datetime(2026,9,29,1,tzinfo=datetime.timezone.utc))
   for theme,ph in [('light','green'),('paper','green'),('green','green'),('dark','green'),('dark','amber'),('frost','green')]:
    p.evaluate("""([t,c])=>{__MAGIRECO_CALL_THEME__.setTheme(t);if(t==='dark')__MAGIRECO_CALL_THEME__.setPhosphor(c);}""",[theme,ph]);p.clock.fast_forward(300)
    p.evaluate("document.fonts.ready")
    p.evaluate("""()=>{const a=MagirecoTripleTapFilter,n=document.querySelector('input.MagicalChk');a.clearSequence();a.registerTap(n,new MouseEvent('click'));a.registerTap(n,new MouseEvent('click'));}""")
    p.clock.fast_forward(200)
    # Style changes may first reach the compositor on the next CPU-rendered
    # frame. Observe the actual transition completion while the hint timer is paused.
    deadline=time.monotonic()+20
    while p.locator('#tripleTapFilterToast').evaluate('n=>+getComputedStyle(n).opacity')<.99:
     if time.monotonic()>=deadline:raise AssertionError('hint opacity did not reach one')
     p.wait_for_timeout(100)
    s=p.locator('#tripleTapFilterToast').evaluate("""n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return{text:n.textContent,parent:n.parentElement.className,color:s.color,background:s.backgroundColor,border:s.borderColor,font:s.fontFamily,shadow:s.boxShadow,zIndex:+s.zIndex,pointerEvents:s.pointerEvents,opacity:+s.opacity,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,visibleClass:n.classList.contains('is-visible')};}""")
    assert s['parent']=='call-display-root-v7' and s['pointerEvents']=='none' and s['zIndex']<5000 and s['opacity']>.9 and s['inside'] and s['visibleClass'],s
    assert '再点击同一角色一次' in s['text'] and s['color']!='rgb(107, 25, 72)' and s['border']!='rgb(245, 88, 173)',s
    report['themes'].append(dict(theme=theme,phosphor=ph,clockControlled=True,**s));p.screenshot(path=str(out/f'toast-{theme}-{ph}.png'))
    p.clock.fast_forward(900);assert not p.locator('#tripleTapFilterToast').evaluate("n=>n.classList.contains('is-visible')")
   assert len({x['color'] for x in report['themes']})>=5;ok('toast inherits six theme/phosphor materials; original expiry works',clockControlled=True)
   p.emulate_media(reduced_motion='reduce');assert p.locator('#tripleTapFilterToast').evaluate('n=>getComputedStyle(n).transitionDuration')=='0s';ok('reduced-motion toast is nonanimated');p.close()
   # Resume real-time, uninstrumented interaction tests in a fresh page.
   p=openpage(b);p.set_viewport_size({'width':390,'height':844});select(p,short);m=metrics(p);assert m['scrollY']=='false' and m['overscroll']=='auto',m
   x,z=wheel(p,-180);assert z['outer']<x['outer']-80,(x,z);ok('phone-width table preserves page scrolling');p.screenshot(path=str(out/'phone-table.png'));p.close()
   q=openpage(b,'/story');q.wait_for_function("document.querySelectorAll('#storyCharacterGrid .suite-character-card').length===291")
   names=q.locator('#storyCharacterGrid .suite-character-card').evaluate_all('ns=>ns.map(n=>n.dataset.jp)');src=json.loads((root/'tests/fixtures/story-selectors-r22.json').read_text())
   assert len(names)==len(set(names))==291 and all(('早乙女和子' if n=='早乙女先生' else n) in names for n in src['story']);ok('291 story choices cover upstream; call base unchanged')
   q.locator('#storyCharacterFilter').fill('Ultimate Madoka');q.locator('#storyCharacterGrid [data-jp="アルティメットまどか"]').click();q.locator('#storySelectAll').click();q.locator('#storyVariants').uncheck();q.locator('#storySearchButton').click()
   q.wait_for_function("Number(document.querySelector('#storyResultsBody').dataset.resultTotal)>0",timeout=60000)
   manifest=json.loads((root/'public/data/story-v6/manifest.json').read_text());expected=sum(sum('アルティメットまどか' in row[1] for row in json.loads((root/'public/data/story-v6'/c['file']).read_text())['rows']) for c in manifest['categories'])
   assert q.locator('#storyResultsBody').get_attribute('data-result-total')==str(expected);assert q.locator('.story-row-v7').count()<=100
   entry=q.evaluate("MagiToolsV7.resolveCharacterV7('アルティメットまどか')");assert entry['image'].startswith('story-');assert q.request.get(base+'/img/png/'+entry['image']+'.png').status==200
   assert q.locator('.story-route-actions-v1 a').count()>0;ok('new variant romaji search has exact count and real portrait',matches=expected);q.screenshot(path=str(out/'story-result.png'));q.close()
   q=openpage(b,'/attendance');q.wait_for_function("document.querySelectorAll('#attendanceGrid .suite-character-card').length===194");names=q.locator('#attendanceGrid .suite-character-card').evaluate_all('ns=>ns.map(n=>n.dataset.jp)')
   assert all(('早乙女和子' if n=='早乙女先生' else n) in names for n in src['attendance']);assert '小さなキュゥべえ' in names;ok('194 attendance choices include small Kyubey');q.close()
   assert not report['errors'],report['errors'];report['pass']=True
  finally:b.close()
except Exception:report['failure']=traceback.format_exc();print(report['failure'],flush=True)
finally:
 if server:server.shutdown();server.server_close()
 (out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if not report['pass']:raise SystemExit(1)
