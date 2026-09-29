"""Isolated real-engine checks against the actual runtime functions; no external data reads."""
import argparse,json,shutil,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
source=(root/'public/myfile/story-app-v7.js').read_text();fn=source[source.index('  function textFromMarkup('):source.index('  function normalized(')]
editor=(root/'public/myfile/story-title-editor-v2.js').read_text();status=editor[editor.index('  function setStatus('):editor.index('  function serverValue(')]
rows=[]
for category in json.loads((root/'public/data/story-v6/manifest.json').read_text())['categories']:
 rows += json.loads((root/'public/data/story-v6'/category['file']).read_text())['rows']
inputs=[str(row[i] or '') for row in rows for i in (0,2)]
report={'tests':{},'pass':False}
with sync_playwright() as p:
 exe=shutil.which('chromium');browser=p.chromium.launch(**({'executable_path':exe} if exe else {}),args=['--no-sandbox']);page=browser.new_page();requests=[]
 page.route('https://r24.invalid/**',lambda route:(requests.append(route.request.url),route.fulfill(status=404,body='not found')))
 page.set_content('<!doctype html><meta charset="utf-8"><div id="status"></div>')
 page.add_script_tag(content=fn+';window.convert=textFromMarkup;')
 report['tests']['inertText']=page.evaluate('''async()=>{window.injected=false;const text=convert('<img src="https://r24.invalid/probe" onerror="window.injected=true">正文<BR>次行 &amp; 符号');await new Promise(r=>setTimeout(r,150));return{text,scriptExecuted:window.injected};}''')
 report['tests']['inertText']['imageRequests']=len(requests)
 page.add_script_tag(content="const nodes={titleEditorStatus:document.querySelector('#status')};const Tools={setStatus:(n,s)=>n.innerHTML=s};"+status)
 report['tests']['importError']=page.evaluate('''()=>{let message;try{JSON.parse('<b>r24</b>')}catch(e){message='导入失败：'+e.message}setStatus(message,'error');return{message,text:nodes.titleEditorStatus.textContent,insertedElements:nodes.titleEditorStatus.children.length};}''')
 # All existing titles and summaries retain the old plain-text result. Source
 # payload is immutable and known; only the malicious probe is kept inert above.
 parity=page.evaluate('''inputs=>{const old=value=>{const n=document.createElement('div');n.innerHTML=String(value??'').replace(/<BR\\s*\\/?>/gi,'\\n');return(n.textContent||'').replace(/\\n+/g,' ').trim();};let mismatches=[];const start=performance.now();for(let i=0;i<inputs.length;i++){if(old(inputs[i])!==convert(inputs[i]))mismatches.push(i);}return{tested:inputs.length,mismatches,elapsedMs:performance.now()-start};}''',inputs)
 report['tests']['allExistingTextParity']=parity
 report['pass']=not report['tests']['inertText']['scriptExecuted'] and not requests and report['tests']['importError']['insertedElements']==0 and report['tests']['importError']['message']==report['tests']['importError']['text'] and not parity['mismatches']
 browser.close()
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False));raise SystemExit(0 if report['pass'] else 1)
