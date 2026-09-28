"""Full traversal, stable route identities, bounded DOM and stale-render regression."""
import argparse,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--root',default='.');p.add_argument('--output',default='/tmp/story-pagination-browser.json');a=p.parse_args()
source=(Path(a.root)/'public/myfile/story-app-v7.js').read_text(encoding='utf-8')
boot="  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWithLoading, { once: true });\n  else initWithLoading();"
assert source.count(boot)==1
source=source.replace(boot,"""  cacheNodes();
  localization={categoryLabels:{a:'分类甲',b:'分类乙'}};
  manifest={categories:[{key:'a',slug:'alpha'},{key:'b',slug:'beta'}]};
  global.__test={renderResults,resetAll,rowMatches,getSerial:()=>searchSerial,invalidate:()=>{searchSerial++;renderSerial++;}};""")
ids=['storyTypeOptions','storySelectAll','storyClearTypes','storySpoiler','storyVariants','storyKeyword','storyCharacterFilter','storySelectedSummary','storyClearCharacters','storyCharacterCount','storyCharacterGrid','storySearchButton','storyResetButton','storyStatus','storyResults','storyResultsBody']
html='<!doctype html><meta charset="utf-8">'+''.join(f'<input id="{i}">' if i in ['storyKeyword','storyCharacterFilter','storySpoiler','storyVariants'] else f'<div id="{i}"></div>' for i in ids)
with sync_playwright() as pw:
 exe=shutil.which('chromium');b=pw.chromium.launch(**({'executable_path':exe} if exe else {}),args=['--no-sandbox']);page=b.new_page();page.set_content(html)
 page.evaluate('''() => {
 window.delayCast=0;window.failCast=false;
 window.MagiToolsV7={loadLocalizationV7:async()=>({}),selectedEntries:()=>[],setStatus:(n,t)=>n.textContent=t,escapeHtml:String,scrollToTargetV7:()=>{},storyLabel:x=>x,
 resolveCharacterV7:async n=>{if(delayCast)await new Promise(r=>setTimeout(r,delayCast));if(failCast)throw Error('test failure');return{zh:n,image:n};},
 createCastChipV7:x=>{const e=document.createElement('span');e.textContent=x.zh;return e;}};
 window.MagirecoStoryRouteBridge={links:(c,i)=>({reader:`https://example.invalid/reader?source=${c}&row=${i}`,adv:`https://example.invalid/adv?source=${c}&row=${i}`,storyId:String(i)})};
 window.grouped=new Map([['a',Array.from({length:95},(_,i)=>({rowIndex:1000+i,row:[`A ${i}`,['人物'],`概要 A ${i}`,'abcdefghijk']}))],['b',Array.from({length:14371},(_,i)=>({rowIndex:2000+i,row:[`B ${i}`,['人物'],`概要 B ${i}`,'abcdefghijk']}))]]);
 window.assert=(v,m)=>{if(!v)throw Error(m);};
 }''')
 page.add_script_tag(content=source)
 proof=page.evaluate('''async () => {
 const T=__test,host=document.querySelector('#storyResultsBody'),seen=new Set();let maxRows=0,maxNodes=0;
 for(let p=0;p<145;p++){
  await T.renderResults(grouped,['a','b'],true,14466,T.getSerial(),p);
  const rows=[...host.querySelectorAll('.story-row-v7')];maxRows=Math.max(maxRows,rows.length);maxNodes=Math.max(maxNodes,host.querySelectorAll('*').length);
  assert(rows.length===(p===144?66:100),'page size');
  for(const r of rows){const id=r.dataset.storyCategory+':'+r.dataset.storyRowIndex;assert(!seen.has(id),'duplicate');seen.add(id);
   const link=new URL(r.querySelector('.story-title-v7 > a').href);assert(link.searchParams.get('row')===r.dataset.storyRowIndex,'route index');assert(link.searchParams.get('source')===(r.dataset.storyCategory==='a'?'alpha':'beta'),'route category');}
  if(p===0)assert(host.querySelectorAll('.suite-result-group').length===2,'cross-category page');
  if(p===18)assert(rows[0].dataset.storyRowIndex==='3705','1801st result');
 }
 assert(seen.size===14466,'full traversal');
 for(const n of [0,1,100,101,1800,1801]){
  const g=new Map([['a',Array.from({length:n},(_,i)=>({rowIndex:i,row:['title',[], 'summary']}))]]);
  await T.renderResults(g,['a'],true,n,T.getSerial(),Math.max(0,Math.ceil(n/100)-1));
  assert(host.querySelectorAll('.story-row-v7').length===(n===0?0:((n-1)%100)+1),'boundary '+n);
 }
 const stale=T.getSerial();T.invalidate();await T.renderResults(grouped,['a','b'],true,14466,T.getSerial(),1);await T.renderResults(grouped,['a','b'],true,14466,stale,2);assert(host.dataset.resultPage==='2','stale render');
 window.delayCast=2;let ticks=0;const timer=setInterval(()=>ticks++,0);const pending=T.renderResults(grouped,['a','b'],true,14466);T.resetAll();await pending;clearInterval(timer);window.delayCast=0;
 assert(host.textContent.includes('尚未执行搜索'),'reset cancellation');assert(!host.hasAttribute('aria-busy'),'busy reset');
 const f={entry:{jp:'人物'},names:new Set(['人物']),base:'人物'};
 assert(T.rowMatches(['t',['人物'],'s'],[f],'AND',false,[]),'AND');assert(!T.rowMatches(['t',['别人'],'s'],[f],'OR',false,[]),'OR');assert(!T.rowMatches(['t',['人物','别人'],'s'],[f],'ONLY',false,[]),'ONLY');assert(T.rowMatches(['t',['人物'],'s'],[f],'EXCLUSIVE',false,[]),'EXCLUSIVE');
 await T.renderResults(grouped,['a','b'],true,14466);
 return{totalVisited:seen.size,pages:145,maxLiveRows:maxRows,maxLiveNodes:maxNodes,boundaries:[0,1,100,101,1800,1801],stableRouteIndices:true,staleRenderCancelled:true};
 }''')
 page.locator('[data-story-page-action="last"]').first.click();page.wait_for_function("document.querySelector('#storyResultsBody').dataset.resultPage==='145'")
 page.locator('[data-story-page-action="previous"]').first.click();page.wait_for_function("document.querySelector('#storyResultsBody').dataset.resultPage==='144'")
 inp=page.locator('[data-story-page-input]').first;inp.fill('19');inp.press('Enter');page.wait_for_function("document.querySelector('#storyResultsBody').dataset.resultPage==='19'")
 inp.fill('0');page.locator('[data-story-page-action="jump"]').first.click();assert page.locator('#storyResultsBody').get_attribute('data-result-page')=='19'
 page.evaluate('window.failCast=true');page.locator('[data-story-page-action="next"]').first.click();page.wait_for_function("document.querySelector('#storyStatus').textContent.includes('翻页失败')")
 assert not page.locator('[data-story-page-action="next"]').first.is_disabled()
 page.evaluate('window.failCast=false');page.locator('[data-story-page-action="next"]').first.click();page.wait_for_function("document.querySelector('#storyResultsBody').dataset.resultPage==='20'")
 proof.update(state='pass',controlsAndErrorRetry='pass');Path(a.output).write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(proof,ensure_ascii=False,indent=2));b.close()
