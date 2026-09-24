import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('public/myfile/call-loading-v10.js');
const css=read('public/myfile/call-loading-v10.css');
const theme=read('public/myfile/theme-mode-v1.js');
test('all ten entries contain the same pre-rendered Reader card and one shared optical stack',()=>{
 const pages=fs.readdirSync(path.join(root,'public')).filter(x=>x.endsWith('.html'));
 assert.equal(pages.length,10);
 for(const name of pages){
  const html=read('public/'+name);
  assert.equal((html.match(/id="call-loading-screen"/g)||[]).length,1,name);
  assert.equal((html.match(/id="call-screen-optics-v7"/g)||[]).length,1,name);
  assert.equal((html.match(/class="call-reader-screen-v7"/g)||[]).length,1,name);
  assert.match(html,/<\/div><span class="call-fx-day-grain-v7 call-material-direct-v11"/);
  assert.match(html,/EIA 2017 \/ MAGIUS LINK/);
  assert.match(html,/viewBox="96 32 548 624"/);
  assert.match(html,/>LOADING<\/span>/);
  assert.ok(html.indexOf('theme-preboot-v8.js')<html.indexOf('<body'));
  assert.ok(html.indexOf('call-loading-v10.js')<html.indexOf('theme-mode-v1.js'));
 }
});
test('day geometry, night ratio and lower-scale label match Reader source',()=>{
 assert.match(css,/width: min\(30\.5cqi, 56vw, 32dvh, 310px\)/);
 assert.match(css,/width: 60%/);assert.match(css,/width: 40%/);
 assert.match(css,/left: 33%; top: 76\.7105263158%/);
 assert.match(css,/width: 34%; height: 4\.6052631579%/);
 assert.match(css,/margin: auto 0/);
});
test('loader registration follows the shared setting and required texture files are real images',()=>{
 assert.match(css,/data-call-fx-registration="true"\] #call-loading-screen svg/);
 assert.match(css,/drop-shadow\(0 0 12px var\(--loading-glow\)\)/);
 for(const file of ['2k_BG_Texture.png','DirtHighContrast.png','frost-glass-scratches.png','magi-lofi-grain.png']){
  const bytes=fs.readFileSync(path.join(root,'public/myfile/reader-textures',file));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file);
  assert.ok(bytes.length>1000,file);
 }
 assert.match(source,/imageReady\('\.\/myfile\/reader-textures\/frost-phosphor-ink-mask.svg'\)/);
 assert.match(read('public/myfile/theme-mode-v1.css'),/data-call-theme="frost"\] \.call-reader-screen-v7 \{ mix-blend-mode:screen; \}/);
});
test('DOM initialization adopts the existing surface and does not duplicate filters or grain',()=>{
 assert.match(theme,/displayRoot=displayRoot \|\| document.createElement/);
 assert.match(theme,/node===displayRoot/);
 assert.match(theme,/if\(displayRoot.querySelector\('\.call-reader-screen-v7'\)\) return/);
 assert.match(theme,/window.CallReaderOpticsV14.mount\(displayRoot\)/);
 const adapter=read('public/myfile/reader-optics-v14.js');
 assert.match(adapter,/document.querySelector\('\.call-optics-defs-v7'\)/);
 assert.match(adapter,/svg.replaceChildren\(defs\)/);
 assert.match(source,/callIosFlat==='true'[\s\S]*closest\('svg'\)\?\.remove/);
 assert.doesNotMatch(source,/requestAnimationFrame\([^\n]*(?:animate|renderLoop)/);
});
test('startup gates cover each asynchronous application initialization',()=>{
 for(const name of ['story-app-v7','attendance-app-v7','story-title-editor-v2']){
  const s=read('public/myfile/'+name+'.js');
  assert.match(s,/CallLoading\?\.hold\('page-data'\)/);
  assert.match(s,/Promise.resolve\(\).then\(init\)/);
  assert.match(s,/\.finally\(done\)/);
 }
 assert.match(theme,/CallLoading.release\('theme'\)/);
 assert.doesNotMatch(theme,/seen \? 180 : 620/);
});
function harness({assetFailure=false,fontWait=Promise.resolve(),decodeWait=Promise.resolve()}={}){
 const events={},raf=[],buttons={},error={hidden:true},scroll={inert:true};
 const cover={setAttribute(){},querySelector(sel){if(sel==='.call-loading-error')return error;return {addEventListener(type,fn){buttons[sel]=fn;}};}};
 const html={dataset:{callTheme:'frost',callIosFlat:'true',callFxCurvature:'false',callFxPixelFont:'true'}};
 const doc={documentElement:html,getElementById(id){return id==='call-loading-screen'?cover:null;},querySelector(){return scroll;},querySelectorAll(){return [{}];},fonts:{load(){return fontWait;}},addEventListener(name,fn){events[name]=fn;}};
 const ctx={document:doc,window:{},location:{origin:'https://fixture.test',pathname:'/index.html',href:'https://fixture.test/index.html',reload(){}},URL,Image:class{set src(_){assetFailure?this.onerror():this.onload();}decode(){return decodeWait;}},getComputedStyle(){return {display:'block',visibility:'visible',opacity:'1',backgroundImage:'url("./noise.png")'};},requestAnimationFrame(fn){raf.push(fn);},setTimeout(){return 1;},clearTimeout(){},addEventListener(name,fn){events[name]=fn;},console};
 vm.runInNewContext(source,ctx);
 return {api:ctx.window.CallLoading,html,error,scroll,events,buttons,paint(){while(raf.length)raf.shift()();}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('readiness waits for page data and actual display assets, then restores interaction',async()=>{
 let readyFont;const h=harness({fontWait:new Promise(r=>readyFont=r)});
 const dataDone=h.api.hold('page-data');h.events.DOMContentLoaded();h.api.release('theme');
 await flush();h.paint();assert.equal(h.api.active,true);
 readyFont();await flush();h.paint();assert.equal(h.api.active,true);
 dataDone();h.paint();assert.equal(h.api.active,false);assert.equal(h.html.dataset.callPreboot,'false');assert.equal(h.scroll.inert,false);
});
test('asset failure shows recovery controls rather than pretending ready',async()=>{
 const h=harness({assetFailure:true});h.events.DOMContentLoaded();h.api.release('theme');await flush();h.paint();
 assert.equal(h.html.dataset.callLoadingState,'error');assert.equal(h.error.hidden,false);assert.equal(h.api.active,true);
 h.buttons['[data-loading-continue]']();assert.equal(h.api.active,false);assert.equal(h.scroll.inert,false);
});
test('same-origin navigation reuses the cover and bfcache restores the page',async()=>{
 const h=harness();h.events.DOMContentLoaded();h.api.release('theme');await flush();h.paint();
 const link={href:'https://fixture.test/story.html',target:'',hasAttribute(){return false;}};
 h.events.click({button:0,target:{closest(){return link;}}});
 assert.equal(h.html.dataset.callLoadingState,'navigation');assert.equal(h.scroll.inert,true);
 h.events.pageshow({persisted:true});assert.equal(h.html.dataset.callLoadingState,'ready');assert.equal(h.scroll.inert,false);
});

test('decoded textures gate the reveal, not just network onload',async()=>{
 let decoded;const h=harness({decodeWait:new Promise(r=>decoded=r)});
 h.events.DOMContentLoaded();h.api.release('theme');await flush();h.paint();
 assert.equal(h.api.active,true);assert.notEqual(h.html.dataset.callLoadingAssets,'ready');
 decoded();await flush();h.paint();assert.equal(h.api.active,false);
 assert.equal(h.html.dataset.callLoadingAssets,'ready');
});
