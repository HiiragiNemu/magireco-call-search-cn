import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};

function themeHarness(){
  const s=read('public/myfile/theme-mode-v1.js');
  const start=s.includes('  let themeRequest=')?s.indexOf('  let themeRequest='):s.indexOf('  function setTheme(');
  const body=s.slice(start,s.indexOf('  function setPhosphor('));
  let resolve,reject;const prepared=new Promise((a,b)=>{resolve=a;reject=b;});
  const commits=[],warnings=[];
  const c={root:{dataset:{callBootReleased:'true'}},VALID_THEMES:new Set(['paper','dark','frost']),
    state:{effects:{frost:{glassDamage:true}}},THEME_KEY:'theme',normalizeThemeState(){},storageSet(){},
    scheduleTrackingSweep(){},dispatchEvent(){},CustomEvent:class{},console:{warn:(...a)=>warnings.push(a)},
    window:{CallGlass:{prepare:()=>prepared}},applyAll:()=>commits.push(vm.runInContext('activeTheme',ctx))};
  const ctx=vm.createContext(c);vm.runInContext("let activeTheme='paper';"+body+";window.change=setTheme;window.current=()=>activeTheme;",ctx);
  return {api:c.window,commits,warnings,resolve,reject};
}
test('cold theme stays on previous complete scene until glass is prepared',async()=>{
  const h=themeHarness();h.api.change('frost');assert.equal(h.api.current(),'paper');assert.deepEqual(h.commits,[]);
  h.resolve();await flush();assert.equal(h.api.current(),'frost');assert.deepEqual(h.commits,['frost']);
});
test('a later theme click cancels stale cold publication',async()=>{
  const h=themeHarness();h.api.change('frost');h.api.change('dark');h.resolve();await flush();
  assert.equal(h.api.current(),'dark');assert.deepEqual(h.commits,['dark']);
});
test('cold decode failure leaves a usable previous theme',async()=>{
  const h=themeHarness();h.api.change('frost');h.reject(Error('decode'));await flush();
  assert.equal(h.api.current(),'paper');assert.equal(h.warnings.length,1);
});
test('viewport updates do not tear down an in-flight cold preparation',()=>{
  assert.match(read('public/myfile/theme-mode-v1.js'),/if\(pendingTheme!=='frost'\)window.CallGlass\?\.sync\(\)/);
});

class Element {
  constructor(tag){this.tag=tag;this.dataset={};this.attrs={};this.children=[];this.hidden=false;this.style={removeProperty(k){delete this[k];}};this.classList={add(){}};this.clientWidth=320;this.clientHeight=240;this.offsetWidth=300;this.offsetHeight=54;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  removeAttribute(k){delete this.attrs[k];}
  get title(){return this.attrs.title||'';}set title(v){this.attrs.title=v;}
  appendChild(c){if(c.parentNode)c.remove();this.children.push(c);c.parentNode=this;return c;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
  matches(s){return this.tag==='input'&&s.startsWith('input.MagicalChk');}
  closest(s){return s==='label.girlbox'?(this.tag==='label'?this:this.parentNode?.closest(s)):null;}
  querySelector(s){if(s==='filter')return new Element('filter');return this.children.find(c=>c.matches(s))||null;}
  querySelectorAll(){return [];}
  contains(c){return c===this||this.children.some(x=>x.contains(c));}
  getBoundingClientRect(){return this.rect||{top:0,left:0,right:320,bottom:240,width:320,height:240};}
  dispatchEvent(){}
}
function tooltipHarness(options={}){
  const docEvents={},winEvents={},host=new Element('div'),label=new Element('label'),input=new Element('input');
  label.dataset.kana=options.kana||'あずさ みふゆ';input.value=options.value||'';label.title=options.title||'';label.rect={left:2,top:1,right:70,bottom:82,width:68,height:81};label.appendChild(input);
  const doc={readyState:'complete',querySelector:()=>host,querySelectorAll:()=>[input],
    createElement:t=>new Element(t),addEventListener:(n,f)=>{(docEvents[n]||=[]).push(f);}};
  const win={addEventListener:(n,f)=>{winEvents[n]=f;},setTimeout(){},clearTimeout(){},matchMedia:()=>({matches:true})};
  vm.runInNewContext(read('public/myfile/triple-tap-filter.js'),{document:doc,window:win,Element,Map,Set,performance:{now:()=>0}});
  const fire=(type,args={})=>{for(const f of docEvents[type]||[])f({target:input,pointerType:'mouse',...args});};
  return {label,input,host,win,fire,tip:()=>host.children.find(x=>x.id==='call-character-reading-tip')};
}
test('kana and action hint both survive initialization and repeated preparation',()=>{
  const h=tooltipHarness();h.win.MagirecoTripleTapFilter.prepareLabels();
  assert.match(h.label.title,/日文读音：あずさ みふゆ/);assert.equal(h.label.title.split('三击此角色').length,2);
});
test('hover reading renders outside clipped card, is viewport bounded and restores native fallback',()=>{
  const h=tooltipHarness();h.input.setAttribute('aria-describedby','existing');h.fire('pointerover');const t=h.tip();
  assert.ok(t);assert.equal(t.parentNode,h.host);assert.match(t.textContent,/あずさ みふゆ/);assert.match(t.textContent,/三击此角色/);
  assert.equal(h.label.title,'');assert.equal(h.label.dataset.callReadingOpen,'true');
  assert.ok(parseFloat(t.style.left)>=10);assert.ok(parseFloat(t.style.top)>=10);
  assert.match(h.input.getAttribute('aria-describedby'),/^existing call-character-reading-tip$/);
  h.fire('pointerout',{relatedTarget:null});assert.equal(t.hidden,true);assert.match(h.label.title,/あずさ みふゆ/);
  assert.equal(h.input.getAttribute('aria-describedby'),'existing');assert.equal(h.label.dataset.callReadingOpen,undefined);assert.equal(h.label.dataset.callReadingReady,'true');
});
test('keyboard focus reads kana; escape/scroll dismiss; touch does not create sticky hover',()=>{
  const h=tooltipHarness();h.fire('pointerover',{pointerType:'touch'});assert.equal(h.tip(),undefined);
  h.fire('focusin');assert.equal(h.tip().hidden,false);h.fire('keydown',{key:'Escape'});assert.equal(h.tip().hidden,true);
  h.fire('focusin');h.fire('scroll');assert.equal(h.tip().hidden,true);
});
test('managed cards suppress clipped pseudo-tooltip even after scrolling; 76px stays',()=>{
  const css=read('public/myfile/site-correction-v2.css');
  assert.match(css,/label\.girlbox\[data-call-reading-ready="true"\]::after/);
  assert.match(css,/\.call-character-reading-tip[\s\S]*--call-menu-face/);
  assert.match(css,/bottom: calc\(76px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(read('public/myfile/mycss.css'),/content: attr\(data-kana\)/);
});

test('prepared glass stays invisible until explicit theme activation, with no second decode',async()=>{
  const root={dataset:{callTheme:'paper',callFxGlassDamage:'false'}},scene=new Element('div'),body=new Element('body'),frames=[];
  let decoded,cacheReady,decodes=0;
  const doc={documentElement:root,body,querySelector:()=>scene,createElementNS:(_,t)=>new Element(t),createElement:t=>{const e=new Element(t);if(t==='img')e.decode=()=>{decodes++;return new Promise(r=>decoded=r);};return e;}};
  const win={CallGlassCache:{mountViewportFilter:()=>({filter:{},dispose(){}}),startCachedGlassMask:(_s,_f,ready)=>{cacheReady=ready;return ()=>{};}}};
  vm.runInNewContext(read('public/myfile/reader-glass-v12.js'),{document:doc,window:win,Event:class{},requestAnimationFrame:f=>(frames.push(f),frames.length),cancelAnimationFrame(){}});
  assert.equal(typeof win.CallGlass.prepare,'function');const wait=win.CallGlass.prepare();
  assert.equal(root.dataset.callGlassActive,'false');decoded();await flush();cacheReady();while(frames.length)frames.shift()();await wait;
  assert.equal(root.dataset.callGlassActive,'false');assert.equal(scene.dataset.filmReady,'true');
  root.dataset.callTheme='frost';root.dataset.callFxGlassDamage='true';win.CallGlass.sync();
  assert.equal(root.dataset.callGlassActive,'true');assert.equal(decodes,1);
});

// Use real legacy card data: data-kana could already contain a romanized line.
test('romanization stays one line across 200 hover and preparation cycles',()=>{
  const h=tooltipHarness({kana:'ふたば さな\nFutaba Sana',value:'二叶莎奈 (二葉さな / Futaba Sana)',title:'日文读音：ふたば さな\nFutaba Sana\nFutaba Sana\nFutaba Sana'});
  for(let i=0;i<200;i++){
    h.win.MagirecoTripleTapFilter.prepareLabels();h.fire('pointerover');
    assert.deepEqual(h.tip().textContent.split('\n'),['日文读音：ふたば さな','Futaba Sana','三击此角色：按上方“称呼/被称呼”方向筛选']);
    h.fire('pointerout',{relatedTarget:null});
  }
  assert.equal(h.label.dataset.kana,'ふたば さな\nFutaba Sana');
});

test('nested parentheses and punctuation do not drop romanized names',()=>{
  for(const roman of ['Akemi Homura (Glasses ver)','Melissa de Vignolles','Kazari Jun (Vampire ver.)',"D’Arc / Tart"]){
    const h=tooltipHarness({kana:'あけみ ほむら めがね',value:`晓美焰-眼镜ver (暁美ほむら(眼鏡ver) / ${roman})`});
    h.fire('pointerover');assert.equal(h.tip().textContent.split('\n')[1],roman);
  }
});

test('refresh while hovered updates current source and keeps native duplicate hidden',()=>{
  const h=tooltipHarness({kana:'ゆい つるの',value:'由比鹤乃 (由比鶴乃 / Yui Tsuruno)'});
  h.fire('pointerover');h.win.MagirecoTripleTapFilter.prepareLabels();assert.equal(h.label.title,'');
  h.input.value='由比鹤乃 (由比鶴乃 / Yui Tsuruno (Rumor ver))';h.win.MagirecoTripleTapFilter.prepareLabels();
  assert.equal(h.tip().textContent.split('\n')[1],'Yui Tsuruno (Rumor ver)');
  h.fire('pointerout',{relatedTarget:null});assert.equal(h.label.title.split('\n')[1],'Yui Tsuruno (Rumor ver)');
});

test('all actual root card values render kana and romanization without title feedback',()=>{
  const html=read('public/index.html');
  const cards=[...html.matchAll(/<label[^>]*data-kana="([^"]+)"[^>]*>\s*<input[^>]*value="([^"]+)"/g)];
  assert.ok(cards.length>=186);
  for(const card of cards){
    const value=card[2],roman=value.slice(value.indexOf(' / ')+3).replace(/\)\s*$/u,'').trim();
    assert.ok(value.includes(' / '));
    const h=tooltipHarness({kana:card[1],value,title:'obsolete romanization'});h.fire('pointerover');
    assert.deepEqual(h.tip().textContent.split('\n'),[`日文读音：${card[1]}`,roman,'三击此角色：按上方“称呼/被称呼”方向筛选']);
  }
});
