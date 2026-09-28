#!/usr/bin/env python3
"""Read-only production handoff audit, separate from Call's release acceptance.
A failed downstream observation is recorded as failure, never as playback success.
"""
import argparse,json,time,traceback
from pathlib import Path
from urllib.parse import urlencode,urlparse,parse_qs
from playwright.sync_api import sync_playwright
pa=argparse.ArgumentParser();pa.add_argument('--output',default='/tmp/call-navigation-evidence/integration');a=pa.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[1]
local=json.loads((root/'public/aio/story-routes.json').read_text())
report={'checkedAt':time.time(),'manifest':{},'routes':[],'browser':[],'scope':'read-only Call -> AIO -> Reader/L2D'}
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox','--enable-unsafe-swiftshader'])
 try:
  ctx=b.new_context(viewport={'width':1440,'height':900})
  ctx.add_init_script("window.__handoffs=[];addEventListener('adv-handoff-status',e=>__handoffs.push(e.detail));")
  req=ctx.request
  response=req.get('https://magireco-aio-router.pages.dev/story-routes.json',timeout=60000)
  remote=response.json()
  report['manifest']={'status':response.status,'exactlyMatchesCallFallback':remote==local,'routes':len(remote['routes']),'catalogRevision':remote['catalogRevision'],'targets':remote['targets']}
  for slug,index,edition in [('main-1',29,None),('character',0,None),('scene0',0,None),('event',50,'initial'),('event',50,'rerun')]:
   for target in ['reader','adv']:
    params={'source':f"story-v6:{local['catalogRevision']}:{slug}:{index}",'target':target}
    if edition:params['edition']=edition
    row={'params':params,'responses':[]}
    for origin in ['https://magireco-aio-router.pages.dev/open','https://magireco-call-search-cn.pages.dev/aio/open']:
     try:
      r=req.get(origin+'?'+urlencode(params),max_redirects=0,timeout=45000)
      row['responses'].append({'request':r.url,'status':r.status,'location':r.headers.get('location')})
     except Exception as e:row['responses'].append({'request':origin,'error':str(e)})
    row['sameDestination']=all(x.get('status')==302 for x in row['responses']) and len({x.get('location') for x in row['responses']})==1
    report['routes'].append(row)
  # Exercise real links only after the asynchronous parent-group presentation is
  # complete. Open actual disclosure controls; never force-click a hidden link.
  q=ctx.new_page();q.add_init_script("localStorage.setItem('magireco-call-theme-v2','light');sessionStorage.setItem('magireco-call-magius-boot-v1','1');")
  q.goto('https://magireco-call-search-cn.pages.dev/story',wait_until='load',timeout=90000)
  q.wait_for_function("document.documentElement.dataset.callBootReleased==='true'&&document.querySelectorAll('#storyCharacterGrid button').length>0",timeout=60000)
  q.locator('#storyCharacterFilter').fill('Satomi Touka');q.locator('#storyCharacterGrid [data-jp="里見灯花"]').click()
  q.evaluate("document.querySelectorAll('input[name=storyType]').forEach(n=>n.checked=n.value==='メイン【第1部】')")
  q.locator('#storySearchButton').click()
  q.wait_for_function("document.querySelector('.story-row-v7[data-story-row-index=\"29\"]')&&[...document.querySelectorAll('.story-result-list-v7')].every(n=>n.dataset.parentFoldV18)",timeout=90000)
  article=q.locator('.story-row-v7[data-story-row-index="29"]')
  for disclosure in article.locator('xpath=ancestor::details').all():
   if disclosure.get_attribute('open') is None:disclosure.locator(':scope > summary').click()
  article.wait_for(state='visible')
  for target in ['reader','adv']:
   link=article.locator('a.'+target).first
   entry={'target':target,'clickedHref':link.get_attribute('href'),'responses':[],'errors':[],'events':[]}
   def instrument(page):
    page.on('pageerror',lambda e:entry['errors'].append(str(e)))
    page.on('response',lambda r:entry['responses'].append({'url':r.url,'status':r.status,'revision':r.headers.get('x-demo-reader-revision')}) if '/api/magi-reader/' in r.url else None)
   ctx.on('page',instrument)
   child=None
   try:
    with q.expect_popup(timeout=60000) as pop:link.click()
    child=pop.value;child.wait_for_load_state('domcontentloaded',timeout=90000)
    if target=='adv':
     try:child.wait_for_function("['playing','failed','voice'].includes(document.documentElement.dataset.advHandoffState)",timeout=120000)
     except Exception as e:entry['waitError']=str(e)
    else:
     try:child.wait_for_selector('#sec-101201-1-1',state='attached',timeout=45000)
     except Exception as e:entry['anchorWaitError']=str(e)
     child.wait_for_timeout(1000)
    entry.update(url=child.url,title=child.title(),body=child.locator('body').inner_text()[:18000],state=child.evaluate("document.documentElement.dataset.advHandoffState||null"),events=child.evaluate('window.__handoffs||[]'),canvases=child.locator('canvas').count())
    if target=='reader':
     entry['anchorExists']=child.locator('#sec-101201-1-1').count()>0
     entry['anchorText']=child.locator('#sec-101201-1-1').evaluate("n=>(n.closest('section')||n.parentElement).innerText.slice(0,2500)") if entry['anchorExists'] else None
    child.screenshot(path=str(out/(target+'.png')))
   except Exception as e:
    entry['error']=str(e)
    if child:entry['url']=child.url
   finally:
    if child:child.close()
    ctx.remove_listener('page',instrument)
   report['browser'].append(entry)
  q.close()
 except Exception:
  report['error']=traceback.format_exc()
 finally:
  b.close()
  report['readerContentVerified']=any(x.get('target')=='reader' and x.get('anchorExists') and not x.get('error') for x in report['browser'])
  report['advEngineReportedPlaying']=any(x.get('target')=='adv' and x.get('state')=='playing' for x in report['browser'])
  report['transportParityVerified']=bool(report['routes']) and all(x['sameDestination'] for x in report['routes'])
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({k:v for k,v in report.items() if k not in ['routes','browser']},ensure_ascii=False,indent=2))
  for entry in report['browser']:print(json.dumps({k:v for k,v in entry.items() if k not in ['body','responses','events']},ensure_ascii=False))
