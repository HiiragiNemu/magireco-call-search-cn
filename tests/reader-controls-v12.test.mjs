import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('public/myfile/reader-controls-v12.css');
const preboot=read('public/myfile/theme-preboot-v8.js');
const runtime=read('public/myfile/theme-mode-v1.js');
function context(theme,saved={},ios=false){return {
 navigator:{userAgent:ios?'iPhone AppleWebKit':'Windows AppleWebKit',platform:ios?'iPhone':'Win32',maxTouchPoints:ios?5:0},
 document:{documentElement:{dataset:{},style:{}},readyState:'loading',addEventListener(){}},window:{},console,
 localStorage:{getItem:k=>k==='magireco-call-theme-v2'?theme:k==='magireco-call-visual-v7-5'?JSON.stringify(saved):null},
 matchMedia:()=>({matches:false}),setTimeout(){},addEventListener(){}
};}
test('all themes first-paint and runtime defaults match Reader shared effects, including iOS flat',()=>{
 for(const ios of [true,false])for(const theme of ['light','paper','green','frost','dark'])for(const phosphor of ['green','amber']){
  const a=context(theme,{phosphor},ios),b=context(theme,{phosphor},ios);
  vm.runInNewContext(preboot,a);vm.runInNewContext(runtime,b);
  const expected={Curvature:theme==='dark'&&!ios,Scanlines:theme==='dark',Noise:theme==='dark',PixelFont:theme==='dark'&&phosphor==='amber',Registration:true,GlassDamage:false};
  for(const [key,value]of Object.entries(expected)){
   assert.equal(a.document.documentElement.dataset['callFx'+key],String(value),`${theme} ${phosphor} bootstrap ${key}`);
   assert.equal(b.document.documentElement.dataset['callFx'+key],String(value),`${theme} ${phosphor} runtime ${key}`);
  }
 }
});
test('explicit glass and registration choices survive startup and runtime',()=>{
 for(const glassDamage of [true,false])for(const registration of [true,false])for(const ios of [true,false]){
  for(const script of [preboot,runtime]){
   const c=context('frost',{effects:{frost:{glassDamage,registration}}},ios);vm.runInNewContext(script,c);
   assert.equal(c.document.documentElement.dataset.callFxGlassDamage,String(glassDamage));
   assert.equal(c.document.documentElement.dataset.callFxRegistration,String(registration));
  }
 }
});
test('green and amber retain independent saved pixel-font choices',()=>{
 for(const phosphor of ['green','amber'])for(const script of [preboot,runtime]){
  const c=context('dark',{phosphor,nightPixelFonts:{green:true,amber:false},effects:{dark:{pixelFont:true}}});vm.runInNewContext(script,c);
  assert.equal(c.document.documentElement.dataset.callFxPixelFont,String(phosphor==='green'));
 }
});
test('each entry loads common controls, same menu and glass readiness in correct order',()=>{
 for(const p of fs.readdirSync(path.join(root,'public')).filter(x=>x.endsWith('.html'))){
  const h=read('public/'+p);
  for(const file of ['reader-controls-v12.css','hamburger-menu-v23.js','reader-glass-v12.js','reader-glass-cache-v12.js'])assert.equal(h.split(file).length,2,p+' '+file);
  assert.ok(h.indexOf('reader-glass-cache-v12.js')<h.indexOf('reader-glass-v12.js'));
  assert.ok(h.indexOf('reader-glass-v12.js')<h.indexOf('theme-mode-v1.js'));
 }
});
test('menu belongs to navigation, has bounded available-height scrolling and real exact destinations',()=>{
 const js=read('public/myfile/hamburger-menu-v23.js');new vm.Script(js);
 assert.match(js,/nav.prepend\(header\)/);assert.match(js,/bottom - menu.getBoundingClientRect\(\).top - 24/);
 for(const url of ['https://magius3dviewer.pages.dev/','https://madeinmagius-site.pages.dev/','https://afdian.com/a/madeinmagius'])assert.ok(js.includes(url));
 assert.match(css,/scrollbar-color:var\(--call-accent\) var\(--call-surface\)/);
 assert.match(css,/max-height:var\(--call-menu-room/);
 assert.match(js,/menu.inert = !expanded/);
 assert.ok(js.includes('使用本工具二创，请注明工具名称及出处链接。'));
 assert.ok(js.includes('magia exedra 魔法纪录l2d查看器'));
 assert.ok(js.includes('魔法纪录MAGIAEXEDRA 中日双语剧情存档与翻译平台'));
 assert.ok(!js.includes('■通用'));
});
test('theme-specific geometry, keyboard/selected/pressed/disabled states and cold copy are explicit',()=>{
 for(const rule of ['--control-radius:7px','--control-radius:2px','--control-radius:10px 4px 10px 4px','--control-radius:0','--control-radius:6px',':focus-visible',':active',':disabled','[aria-pressed="true"]'])assert.ok(css.includes(rule),rule);
 assert.match(read('public/index.html'),/class="top call-selection-help">[\s\S]*?页面底部将显示称呼关系图[\s\S]*?单击仍用于选择角色。<BR>\s*<\/p>/);
 assert.match(css,/\.call-selection-help span/);
});
test('native-DPR glass mask geometry preserves dimensions through viewport resizing',()=>{
 const c={window:{}};vm.runInNewContext(read('public/myfile/reader-glass-cache-v12.js'),c);
 const {glassMaskSize,glassMaskExtent,usesCachedGlassMask}=c.window.CallGlassCache;
 const a=glassMaskSize(393,740,2.75),b=glassMaskSize(393,680,2.75);
 assert.equal(a.pixelWidth,1081);assert.equal(a.pixelHeight,2035);assert.equal(a.dpr,2.75);
 assert.equal(glassMaskExtent(a,b).height,680);
 assert.equal(glassMaskSize(0,740,3),null);
 assert.equal(usesCachedGlassMask('Android Chrome/140'),true);assert.equal(usesCachedGlassMask('iPhone AppleWebKit'),false);
});
test('glass uses exact Reader refraction graph and mounted image decode before cache publication',()=>{
 const js=read('public/myfile/reader-glass-v12.js');new vm.Script(js);
 assert.match(js,/radius="\.6"/);assert.match(js,/dx="1\.5" dy="-\.6"/);
 assert.ok(js.indexOf('await wear.decode()')<js.indexOf('startCachedGlassMask'));
 assert.match(js,/requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
 assert.match(read('public/myfile/call-loading-v10.js'),/waits.push\(window.CallGlass.sync\(\)\)/);
 assert.match(css,/filter:url\('#call-screen-optics-v7'\) var\(--call-glass-filter-v12\)/);
 assert.doesNotMatch(js,/setInterval|scrollTop|devicePixelRatio\s*=/);
});
