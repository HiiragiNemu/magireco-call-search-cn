import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('public/data/story-router-v1.json'));
const search=JSON.parse(read('public/data/story-v6/manifest.json'));
const routeSource=read('public/myfile/story-route-bridge-v1.js');
function bridge(fetchImpl,{query='',meta='https://magireco-aio-router.pages.dev/',fastTimeout=false}={}) {
 const c={URL,URLSearchParams,AbortController,console,fetch:fetchImpl,
  setTimeout:fastTimeout?(fn,ms)=>setTimeout(fn,Math.min(ms,15)):setTimeout,clearTimeout,
  document:{baseURI:'https://call.example/story.html',querySelector:s=>s==='meta[name="magireco-aio-router"]'?{content:meta}:null},
  location:{href:'https://call.example/story.html'+query,search:query}};
 c.window=c;vm.runInNewContext(routeSource,c);return c.MagirecoStoryRouteBridge;
}
const response=(payload=manifest,status=200,headers={})=>({ok:status>=200&&status<300,status,headers:{get:k=>headers[k.toLowerCase()]||null},json:async()=>payload});
const isLocal=url=>new URL(url,'https://call.example').origin==='https://call.example';
test('r24 AIO outage falls back to same-origin handler, preserving source and edition',async()=>{
 const b=bridge(async url=>response(manifest,isLocal(url)?200:503));await b.initialize(search);
 for(const [slug,i]of[['character',0],['event',50]]){
  const links=b.links(slug,i);
  for(const item of[links,...links.variants])for(const target of['reader','adv']){
   const url=new URL(item[target]);assert.equal(url.origin,'https://call.example');assert.equal(url.pathname,'/aio/open');
   assert.equal(url.searchParams.get('source'),links.sourceKey);assert.equal(url.searchParams.get('target'),target);
   if(item!==links&&item.edition)assert.equal(url.searchParams.get('edition'),item.edition);
  }
 }
});
test('r24 AIO timeout includes slow body, aborts it, and does not freeze search',async()=>{
 let signal;const b=bridge(async(url,opts)=>{
  if(isLocal(url))return response();signal=opts.signal;return {...response(),json:()=>new Promise(()=>{})};
 },{fastTimeout:true});
 const result=await Promise.race([b.initialize(search).then(()=>true),new Promise(r=>setTimeout(()=>r(false),120))]);
 assert.equal(result,true);assert.equal(signal.aborted,true);assert.equal(new URL(b.links('character',0).adv).origin,'https://call.example');
});
test('r24 network recovery can retry initialization after both manifests fail',async()=>{
 let fail=true;const b=bridge(async()=>response(manifest,fail?503:200));
 await assert.rejects(b.initialize(search));fail=false;await b.initialize(search);
 assert.equal(new URL(b.links('character',0).adv).origin,'https://magireco-aio-router.pages.dev');
});
test('r24 parseable partial responses and duplicate source identities never replace the local routes',async()=>{
 for(const bad of[response(manifest,206),response(manifest,200,{'content-range':'bytes 0-100/200'}),response({...manifest,routes:[manifest.routes[0],manifest.routes[0]]})]){
  const b=bridge(async url=>isLocal(url)?response():bad);await b.initialize(search);
  assert.equal(new URL(b.links('character',0).adv).origin,'https://call.example');
 }
});
test('r24 invalid URL overrides cannot disable healthy local routes; valid /open bases stay usable',async()=>{
 for(const query of['?aioBase=%','?aioBase=javascript:alert(1)','?aioBase=https://user:password@bad.example/']){
  const calls=[];const b=bridge(async u=>{calls.push(String(u));return response()},{query});await b.initialize(search);
  assert.equal(new URL(b.links('character',0).adv).origin,'https://call.example');assert.ok(calls.every(isLocal));
 }
 const calls=[];const b=bridge(async u=>{calls.push(String(u));return response()},{query:'?aioBase=https://aio.example/sub/open'});
 await b.initialize(search);assert.equal(calls[0],'https://aio.example/sub/story-routes.json');assert.equal(new URL(b.links('character',0).reader).pathname,'/sub/open');
});
// A small DOM model is sufficient to expose the asynchronous commit race; the
// real browser suite additionally clicks actual clear controls during resolution.
function element(){return{dataset:{},style:{},children:[],textContent:'',attrs:{},replaceChildren(...xs){this.children=xs;this.textContent=''},appendChild(x){this.children.push(x)},append(...xs){this.children.push(...xs)},setAttribute(k,v){this.attrs[k]=v},addEventListener(){}};}
function ranking(){
 const source=read('public/myfile/attendance-app-v7.js');const code=source.slice(source.indexOf('  async function resolveResult'),source.indexOf('  async function init()'));
 let release;const pending=new Promise(r=>release=r);const status=element(),body=element(),grid={querySelectorAll:()=>[]};
 const nodes={attendanceResultsBody:body,attendanceStatus:status,attendanceGrid:grid,attendanceSelected:element()};
 const Tools={resolveCharacterV7:()=>pending,fetchJson:async()=>[['日本名',4]],setStatus:(n,s)=>n.textContent=s,loadingMarkup:s=>s,scrollToTargetV7(){},escapeHtml:s=>s,imageUrl:()=>''};
 const c={Map,URLSearchParams,AbortController,console,nodes,Tools,requestSerial:1,requestController:null,selected:null,API_URL:'https://rank.example',document:{createElement:element},updateSelection(){}};
 vm.createContext(c);vm.runInContext(code+';globalThis.render=renderRanking;globalThis.load=loadRanking;globalThis.clear=clearAll;',c);
 return{c,body,status,release};
}
test('r24 clear during asynchronous ranking cannot be undone by the old render',async()=>{
 const h=ranking();const promise=h.c.render({},[['日本名',4]],1);h.c.clear();h.body.replaceChildren();h.body.textContent='cleared';
 h.release({zh:'中文名'});await promise;assert.equal(h.body.children.length,0);assert.equal(h.body.textContent,'cleared');
});
test('r24 a newer ranking request also prevents stale render commits',async()=>{
 const h=ranking();const promise=h.c.render({},[['日本名',4]],1);h.c.requestSerial=2;h.body.textContent='new selection';h.release({zh:'旧中文名'});await promise;
 assert.equal(h.body.children.length,0);assert.equal(h.body.textContent,'new selection');
});
test('r24 a cancelled ranking never writes a late success status',async()=>{
 const h=ranking();const promise=h.c.load({jp:'日本名',zh:'中文名'});await new Promise(r=>setImmediate(r));h.c.clear();h.release({zh:'旧中文名'});await promise;
 assert.equal(h.status.textContent,'已清除。');
});
test('r24 current ranking still sorts and deduplicates as before',async()=>{
 const h=ranking();h.release({zh:'中文名'});await h.c.render({},[['日本名',4],['日本名',2]],1);
 assert.equal(h.body.children.length,1);assert.equal(h.body.children[0].children.length,1);assert.equal(h.body.children[0].children[0].children[2].textContent,'4话');
});
test('r24 title error messages are text, never HTML markup',()=>{
 const src=read('public/myfile/story-title-editor-v2.js');const fn=src.slice(src.indexOf('  function setStatus('),src.indexOf('  function serverValue('));
 let htmlCalls=0;const status=element(),c={nodes:{titleEditorStatus:status},Tools:{setStatus(){htmlCalls++}}};vm.runInNewContext(fn+';setStatus(\'导入失败：<b>r24</b>\',\'error\')',c);
 assert.equal(htmlCalls,0);assert.equal(status.textContent,'导入失败：<b>r24</b>');assert.equal(status.dataset.kind,'error');
});
function sharedFetch(fetch){const c={window:null,fetch,AbortController,URL,Map,console,setTimeout,clearTimeout,document:{}};c.window=c;vm.runInNewContext(read('public/myfile/tools-suite.js'),c);return c.MagiTools.fetchJson;}
test('r24 shared JSON fetch forwards caller cancellation and removes its listener',async()=>{
 let seen;const f=sharedFetch(async(u,o)=>{seen=o.signal;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
 const ctrl=new AbortController();const p=f('https://rank.example',{signal:ctrl.signal},100);ctrl.abort();const immediate=await Promise.race([p.then(()=>false,()=>true),new Promise(r=>setTimeout(()=>r(false),20))]);assert.equal(immediate,true);assert.equal(seen.aborted,true);
});
test('r24 shared JSON fetch does not start a request that was already cancelled',async()=>{
 let calls=0;const f=sharedFetch(async()=>{calls++;return response()});const c=new AbortController();c.abort();await assert.rejects(f('https://rank.example',{signal:c.signal}));assert.equal(calls,0);
});
function categoryLoader(fetchJson){
 const src=read('public/myfile/story-app-v7.js');const fn=src.slice(src.indexOf('  async function loadCategory('),src.indexOf('  function localizeTitle('));
 const c={categoryCache:new Map(),categoryMeta:key=>({file:'a.json',count:2}),Tools:{fetchJson},loadMemoriaWikiLinks:async()=>null};vm.runInNewContext(fn+';globalThis.load=loadCategory;',c);return c.load;
}
test('r24 failed category loads can recover on the next search with stable row indexes',async()=>{
 let attempts=0;const load=categoryLoader(async()=>{if(++attempts===1)throw Error('503');return{key:'a',rows:[['a',[]],['b',[]]]};});
 await assert.rejects(load('a'));const rows=await load('a');assert.equal(attempts,2);assert.deepEqual(Array.from(rows,r=>r.rowIndex),[0,1]);
 await load('a');assert.equal(attempts,2);
});
test('r24 a valid but incomplete category JSON is rejected and not cached',async()=>{
 let attempts=0;const load=categoryLoader(async()=>({key:'a',rows:++attempts===1?[['a',[]]]:[['a',[]],['b',[]]]}));
 await assert.rejects(load('a'));assert.equal((await load('a')).length,2);
});
