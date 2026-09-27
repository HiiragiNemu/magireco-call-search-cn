import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const context={window:{}};vm.runInNewContext(read('public/myfile/reader-glass-cache-v12.js'),context);
const api=context.window.CallGlassCache;
test('Reader mask cache supports all Chromium families, not Android only',()=>{
 for(const ua of ['Windows Chrome/140','Android Chrome/140','Linux Chromium/140','Windows Edg/140'])assert.equal(api.usesCachedGlassMask(ua),true,ua);
 for(const ua of ['iPhone AppleWebKit Version/18 Safari/604','Firefox/144'])assert.equal(api.usesCachedGlassMask(ua),false,ua);
});
test('Reader displacement is neutral off-scratch and samples +1.5 / -.6 shifted scene',()=>{
 assert.equal(api.GLASS_REFRACTION_SCALE,4);
 assert.equal(api.GLASS_REFRACTION_MATRIX,'0 0 0 -.375 .5  0 0 0 .15 .5  0 0 0 0 .5  0 0 0 0 1');
 for(const alpha of [0,.5,1]){
  const sampleX=4*((.5-.375*alpha)-.5),sampleY=4*((.5+.15*alpha)-.5);
  assert.ok(Math.abs(sampleX+1.5*alpha)<1e-12);assert.ok(Math.abs(sampleY-.6*alpha)<1e-12);
 }
});
test('glass lifecycle tears down native mask cache, frame, viewport defs and wear image',()=>{
 const s=read('public/myfile/reader-glass-v12.js');new vm.Script(s);
 for(const text of ['cancelPending();','cancelAnimationFrame(frame);stopCache();viewport.dispose();defs.remove();wear.remove();refraction.remove();','scene.style.removeProperty(property)','if(token!==generation)return','mountViewportFilter(scene,defs.querySelector(\'filter\'),property)'])assert.ok(s.includes(text),text);
 assert.ok(s.indexOf('if(!on)')<s.indexOf("const defs=document.createElementNS"));
 assert.doesNotMatch(s,/<feOffset|<feMerge|operator="out"/);
});
test('viewport bounds preserve cached feImage native extent and do not follow hover',()=>{
 const s=read('public/myfile/reader-glass-cache-v12.js');
 assert.match(s,/function boundViewportFilter/);assert.match(s,/function mountViewportFilter/);
 assert.match(s,/observer.disconnect/);assert.match(s,/URL.revokeObjectURL/);
 assert.doesNotMatch(s,/pointermove|mousemove|addEventListener\('scroll'/);
});
test('day palettes, desktop logo alignment and both portrait target layouts match Reader',()=>{
 const css=read('public/myfile/theme-mode-v1.css'),loading=read('public/myfile/call-loading-v10.css');
 assert.match(css,/--call-bg:#f3eacb/);assert.match(css,/--call-bg:#d6e9c4/);
 assert.match(loading,/top:21.5%/);assert.match(loading,/width:66%; margin:0/);
 for(const token of ['translate(330px,-42px)','translate(670px,802px)','translate(330px,86px)','translate(670px,674px)','width:500px; height:980px','y:38px; height:684px'])assert.ok(loading.includes(token),token);
 assert.doesNotMatch(loading,/html:root\[data-call-fx-registration="true"\] #call-loading-screen svg/);
 for(const file of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
  const h=read('public/'+file);for(let i=0;i<4;i++)assert.equal(h.split('data-loading-target="'+i+'"').length,2,file);
  assert.equal(h.split('class="magi-loading-chart-border"').length,2,file);
  for(const asset of ['reader-optics-v14.css','theme-mode-v1.css','call-loading-v10.css','reader-glass-v12.js','reader-glass-cache-v12.js'])assert.ok(h.includes(asset+'?v=20260927-r19-day-glass'),file+' '+asset);
 }
});
