import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root=process.env.CALL_REVIEW_ROOT || fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const theme=read('public/myfile/theme-mode-v1.js');
const css=read('public/myfile/theme-mode-v1.css');
const desktop={userAgent:'Mozilla/5.0 Windows AppleWebKit/537.36 Chrome/140',platform:'Win32',maxTouchPoints:0};
const iosSafari={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1',platform:'iPhone',maxTouchPoints:5};
const iosChrome={...iosSafari,userAgent:iosSafari.userAgent.replace('Version/26.0','CriOS/140.0')};
const ipad={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5};
const android={userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',platform:'Linux armv8l',maxTouchPoints:5};
function preboot(saved,storedTheme='dark',identity=desktop) {
  const context={navigator:identity,document:{documentElement:{dataset:{},style:{}}},localStorage:{getItem:key=>
    key==='magireco-call-theme-v2'?storedTheme:key==='magireco-call-visual-v7-5'?JSON.stringify(saved):null},
    matchMedia:()=>({matches:false}),setTimeout:()=>0,addEventListener:()=>{},console};
  vm.runInNewContext(read('public/myfile/theme-preboot-v8.js'),context);
  return context.document.documentElement.dataset;
}
test('modified JavaScript parses',()=>{
  for(const name of ['theme-mode-v1','theme-preboot-v8','live-fixes-v11','live-fixes-v12','site-correction-v3-network'])
    new vm.Script(read(`public/myfile/${name}.js`),{filename:name});
});
test('index inline scripts parse, including newline delimiters',()=>{
  for(const [i,m] of [...read('public/index.html').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries())
    if(!/\bsrc\s*=/.test(m[1]))new vm.Script(m[2],{filename:`index-inline-${i}`});
});
test('every named startup step resolves to a declared function',()=>{
  for(const m of theme.matchAll(/runInstallStep\('[^']+',([a-zA-Z_$][\w$]*)\)/g))
    assert.match(theme,new RegExp(`function ${m[1]}\\(`));
});
test('first-paint dark respects a saved curvature OFF',()=>assert.equal(preboot({effects:{dark:{curvature:false}}}).callFxCurvature,'false'));
test('first-paint defaults retain dark curvature',()=>assert.equal(preboot({}).callFxCurvature,'true'));
test('all themes and platforms default registration on but preserve explicit off',()=>{
  for(const identity of [desktop,iosSafari,iosChrome,ipad,android]) for(const theme of ['light','paper','green','dark','frost']){
    assert.equal(preboot({},theme,identity).callFxRegistration,'true');
    assert.equal(preboot({effects:{[theme]:{registration:false}}},theme,identity).callFxRegistration,'false');
  }
});
test('static lens is at most three primitives with one small blur',()=>{
  const install=theme.split('function installOpticalFilter(){')[1].split('function updateOpticalFilter(){')[0];
  assert.equal([...install.matchAll(/svgEl\('fe/g)].length,3);
  assert.equal([...install.matchAll(/feGaussianBlur/g)].length,1);
  assert.match(install,/stdDeviation:'\.38 \.22'/);
  assert.match(install,/filterUnits:'userSpaceOnUse'/);
});
test('iOS first paint clamps only curvature including saved on',()=>{
  for(const identity of [iosSafari,iosChrome,ipad]) for(const mode of ['light','paper','green','dark','frost']){
    const d=preboot({effects:{[mode]:{curvature:true}}},mode,identity);
    assert.equal(d.callIosFlat,'true');assert.equal(d.callFxCurvature,'false');
    assert.equal(d.callFxNoise,'true');assert.equal(d.callFxRegistration,'true');
  }
});

test('runtime iOS policy matches bootstrap, keeps stored curvature and skips SVG allocation',()=>{
  for(const identity of [iosSafari,iosChrome,ipad,desktop,android]){
    const saved={effects:{dark:{curvature:true,registration:true}}};
    const ctx={navigator:identity,document:{documentElement:{dataset:{},style:{}},readyState:'loading',addEventListener:()=>{}},
      localStorage:{getItem:key=>key==='magireco-call-theme-v2'?'dark':key==='magireco-call-visual-v7-5'?JSON.stringify(saved):null},
      matchMedia:()=>({matches:false}),window:{},console};
    const instrumented=theme.replace("  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install", "  window.policy={effectValue,state,isIOS,installOpticalFilter};\n  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install");
    vm.runInNewContext(instrumented,ctx);
    const p=ctx.window.policy,isIOS=[iosSafari,iosChrome,ipad].includes(identity);
    assert.equal(p.effectValue('curvature'),!isIOS);assert.equal(p.state.effects.dark.curvature,true);
    assert.equal(ctx.document.documentElement.dataset.callFxCurvature,String(!isIOS));
    assert.equal(p.effectValue('registration'),true);
    if(isIOS) assert.doesNotThrow(()=>p.installOpticalFilter()); // document has no DOM factories.
  }
});

test('software scrolling experiment has no runtime or page entry point',()=>{
  assert.doesNotMatch(theme,/iosPaintScroll|MagirecoIOSPaintScroll|stopPaintScroll/);
  for(const name of fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html')))
    assert.doesNotMatch(read('public/'+name),/ios-paint-scroll-v1/);
});

test('iOS has final flat CSS while desktop and Android retain the lens',()=>{
  assert.match(theme,/isIOS \? 'native-flat' : 'static-svg'/);
  assert.match(css,/filter:var\(--call-ios-flat-filter\)!important/);
  assert.match(css,/data-call-crt-engine="static-svg"\]\[data-call-optics-active="true"/);
});

test('menu and filter help target actual markup, not the retired widget',()=>{
  assert.match(css,/body \.header \.navicon::before/);
  assert.match(css,/background:var\(--call-text\); border-radius:0; transition:none/);
  assert.match(theme,/input.placeholder='输入名字或假名'/);
  assert.match(theme,/input.setAttribute\('aria-describedby',id\)/);
  assert.match(css,/white-space:normal; overflow-wrap:anywhere/);
  assert.match(css,/overflow:clip/);
});

test('no named scene motion remains enabled',()=>assert.doesNotMatch(css,/animation\s*:\s*call-(?:signal|night|frost|tracking|rolling)/));
test('graph export encoding is click-driven rather than per drawing frame',()=>{
  const source=read('public/myfile/site-correction-v3-network.js');
  assert.doesNotMatch(source,/network.on\('afterDrawing'/);
  assert.match(source,/imageLink.onclick = function exportGraph/);
  assert.match(source,/toDataURL\('image\/png'\)/);
});
test('static selected glow uses a soft halo rather than only a hard outline',()=>{
  assert.match(css,/--call-selected-shadow:0 0 2px/);
  assert.match(css,/0 0 20px color-mix/);
});
