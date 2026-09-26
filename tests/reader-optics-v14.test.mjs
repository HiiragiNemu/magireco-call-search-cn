import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const artifact=JSON.parse(read('public/myfile/reader-optics-graphs-v14.json'));
const script=read('public/myfile/reader-optics-v14.js');
const material=read('public/myfile/reader-optics-v14.css');

// Minimal XML/DOM test double: tests graph wiring and mutation boundaries only.
// This deliberately does not claim browser paint, raster or SVG-filter support.
let writes=0;
class Element {
  constructor(tag,attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.clientWidth=1024;this.clientHeight=768;this.classList={add:(...c)=>this.attrs.class=[this.attrs.class,...c].filter(Boolean).join(' ')};}
  appendChild(el){if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(x=>x!==el);this.children.push(el);el.parentNode=this;return el;}
  replaceChildren(...els){for(const c of this.children)c.parentNode=null;this.children=[];for(const c of els)this.appendChild(c);writes++;}
  setAttribute(k,v){this.attrs[k]=String(v);writes++;}
  getAttribute(k){return this.attrs[k]??null;}
  querySelector(selector){for(const c of this.children){if(selector.startsWith('.')?(c.attrs.class||'').split(' ').includes(selector.slice(1)):c.tag===selector)return c;const nested=c.querySelector(selector);if(nested)return nested;}return null;}
  clone(){const c=new Element(this.tag,this.attrs);for(const child of this.children)c.appendChild(child.clone());return c;}
}
function xml(text){
  const doc=new Element('document'),stack=[doc];
  for(const match of text.matchAll(/<(\/)?([\w:-]+)([^>]*?)(\/?)>/g)){
    if(match[1]){stack.pop();continue;}
    const attrs=Object.fromEntries([...match[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const el=stack.at(-1).appendChild(new Element(match[2],attrs));
    if(!match[4])stack.push(el);
  }
  return doc;
}
function harness({identity=null,mode='green'}={}){
  const html=new Element('html');html.dataset={callTheme:mode,callPhosphor:'green',callFxRegistration:'true'};
  const body=new Element('body'),scene=body.appendChild(new Element('div'));
  const scroll=scene.appendChild(new Element('div',{class:'call-display-scroll-v7'}));scroll.scrollTop=412;
  const host=scene.appendChild(new Element('span',{class:'call-fx-scanlines-v7'}));
  const existing=body.appendChild(new Element('svg',{class:'call-optics-defs-v7'}));
  const observers=[];
  const context={window:{},document:{documentElement:html,body,readyState:'loading',addEventListener(){},querySelector:s=>body.querySelector(s),createElementNS:(_,t)=>new Element(t),importNode:n=>n.clone()},DOMParser:class{parseFromString(s){return xml(s);}},ResizeObserver:class{constructor(f){this.callback=f;observers.push(this);}observe(el){this.observed=el;}}};
  vm.runInNewContext(read('public/myfile/reader-optics-graphs-v14.js'),context);
  vm.runInNewContext(script,context);
  let api;
  if(identity){
    Object.assign(context,{navigator:identity,localStorage:{getItem:k=>k==='magireco-call-theme-v2'?mode:null},matchMedia:()=>({matches:false}),console});
    const theme=read('public/myfile/theme-mode-v1.js').replace("  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install", "  window.activateTestMaterials=scene=>{displayRoot=scene;installOpticalFilter();return opticalRefs;};\n  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install");
    vm.runInNewContext(theme,context);api=context.window.activateTestMaterials(scene);
  }else api=context.window.CallReaderOpticsV14.mount(scene);
  return {html,body,scene,scroll,host,existing,observers,api,window:context.window,lens:()=>body.querySelector('.call-reader-optics-defs-v14')?.querySelector('filter')};
}

test('exported graph payload is pinned to the Reader handoff, including all coefficients',()=>{
  assert.equal(artifact.meta.donorCommit,'7bd527d068a72047cdc982a90b5bd60c19871915');
  assert.equal(artifact.meta.files.length,36);assert.equal(Object.keys(artifact.graphs).length,13);
  const ctx={window:{}};vm.runInNewContext(read('public/myfile/reader-optics-graphs-v14.js'),ctx);
  for(const [key,value] of Object.entries(artifact.graphs)){
    assert.equal(ctx.window.CallReaderGraphsV14[key],value,key);
    assert.equal(crypto.createHash('sha256').update(value).digest('hex'),artifact.meta.graphHashes[key],key);
    const filter=xml(value).querySelector('filter');assert.ok(filter,key);
    const known=new Set(['SourceGraphic','SourceAlpha']);
    function visit(node){
      for(const k of ['in','in2'])if(node.attrs[k])assert.ok(known.has(node.attrs[k]),key+': '+node.attrs[k]);
      for(const c of node.children)visit(c);
      if(node.attrs.result)known.add(node.attrs.result);
    }
    for(const node of filter.children)visit(node);
  }
});

test('runtime changes only viewport coordinates and responsive lens scale in every exported graph',()=>{
  const h=harness();
  for(const key of Object.keys(artifact.graphs).filter(k=>!k.startsWith('flat:'))){
    const [theme,choice]=key.split(':');h.html.dataset.callTheme=theme;
    if(theme==='dark')h.html.dataset.callPhosphor=choice;else h.html.dataset.callFxRegistration=choice;
    for(const [width,height] of [[412,915],[1024,768]]){
      h.scene.clientWidth=width;h.scene.clientHeight=height;h.api.sync();
      const expected=xml(artifact.graphs[key]).querySelector('filter');
      expected.attrs.id=h.lens().attrs.id;expected.attrs.filterUnits='userSpaceOnUse';expected.attrs.primitiveUnits='userSpaceOnUse';
      for(const p of [expected,...expected.children])Object.assign(p.attrs,{x:'0',y:'0',width:String(width),height:String(height)});
      expected.querySelector('feDisplacementMap').attrs.scale=width<=767?'38':'50';
      const flat=n=>({tag:n.tag,attrs:n.attrs,children:n.children.map(flat)});
      assert.deepEqual(flat(h.lens()),flat(expected),key+': '+width);
      assert.equal(h.scene.dataset.opticalViewport,width+'x'+height);
    }
  }
});

test('repeated synchronization and child hover do not rewrite the viewport graph or scroll tree',()=>{
  const h=harness(),lens=h.lens(),lines=h.host.children[0];
  assert.equal(h.observers.length,1);assert.equal(h.observers[0].observed,h.scene);
  const button=h.scroll.appendChild(new Element('button'));
  button.setAttribute('class','hover');const before=writes;
  h.api.sync();h.observers[0].callback();h.api.sync();
  assert.equal(writes,before);assert.equal(h.lens(),lens);assert.equal(h.host.children[0],lines);
  assert.equal(h.scroll.scrollTop,412);assert.equal(h.scroll.parentNode,h.scene);
  assert.doesNotMatch(script,/addEventListener|requestAnimationFrame|setInterval|pointermove|mousemove/);
});

test('noise and scanline toggles leave filter definitions and native scroll position intact',()=>{
  const h=harness(),lens=h.lens(),before=writes;
  for(const value of ['false','true','false']){h.html.dataset.callFxNoise=value;h.html.dataset.callFxScanlines=value;h.api.sync();}
  assert.equal(writes,before);assert.equal(h.lens(),lens);assert.equal(h.scroll.scrollTop,412);
});

test('Reader scanlines are deterministic, irregular, bounded and stationary',()=>{
  const h=harness(),pattern=h.window.CallReaderScanlinesV14;
  const a=pattern(1024,768),b=pattern(1024,768);
  assert.deepEqual(a,b);assert.ok(a.length>200&&a.length<500);
  assert.ok(new Set(a.map(l=>l.thickness)).size>200);
  for(const l of a){assert.ok(l.thickness>=.24&&l.thickness<.8);assert.ok(l.opacity>=.15&&l.opacity<.49);assert.ok(l.y>=0&&l.y<768);}
  assert.equal(pattern(0,768).length,0);assert.equal(pattern(412,9000).length,0);
});

test('all ten pages load the shared adapter before the theme and use the donor lens',()=>{
  for(const name of fs.readdirSync(path.join(root,'public')).filter(x=>x.endsWith('.html'))){
    const html=read('public/'+name);
    assert.ok(html.indexOf('reader-optics-graphs-v14.js')<html.indexOf('reader-optics-v14.js'),name);
    assert.ok(html.indexOf('reader-optics-v14.js')<html.indexOf('theme-mode-v1.js'),name);
    assert.match(html,/reader-optics-v14.css\?v=reader-7bd527d-r15/);
    assert.match(html,/call-loading-v10.js\?v=reader-7bd527d-r15/);
    assert.match(html,/href="\.\/myfile\/reader-textures\/magi-tube-lens-512.png"/);
  }
});

test('material recipe uses the Reader scales and does not animate or reblur the whole cold scene',()=>{
  assert.match(material,/257px 131px/);assert.match(material,/--call-reader-scan:\.28/);
  assert.match(material,/opacity:\.96!important; mix-blend-mode:screen/);
  assert.match(material,/opacity:\.95!important; mix-blend-mode:screen/);
  assert.match(material,/19px 17px\/384px 384px/);assert.match(material,/7px 13px\/384px 384px/);
  assert.match(material,/backdrop-filter:none!important/);
  assert.match(material,/call-loading-state="error"/);
  assert.doesNotMatch(material,/@keyframes|animation:(?!none)/);
});

test('actual iPhone Safari/Chrome UA dispatches shared material runtime without a signal filter',()=>{
  const safari={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1',platform:'iPhone',maxTouchPoints:5};
  const chrome={...safari,userAgent:safari.userAgent.replace('Version/26.0','CriOS/140.0')};
  for(const identity of [safari,chrome])for(const mode of ['light','paper','green','frost','dark']){
    const h=harness({identity,mode});
    assert.equal(h.html.dataset.callIosFlat,'true');assert.equal(h.html.dataset.callReaderOptics,'v14');
    assert.equal(h.html.dataset.callFxCurvature,'false');assert.equal(h.body.querySelector('filter'),null);
    assert.ok(h.host.querySelector('path'));assert.equal(h.observers.length,1);
    const lines=h.host.children[0],before=writes;h.api.sync();assert.equal(writes,before);assert.equal(h.host.children[0],lines);
    assert.equal(h.scroll.scrollTop,412);
  }
});

test('iOS shares material selectors but is excluded from URL filtering and duplicate cold focus',()=>{
  for(const match of material.matchAll(/([^{}]+)\{([^{}]+)\}/g)){
    const selector=match[1],declaration=match[2];
    if(declaration.includes('--call-optical-pass:')||declaration.includes('--call-glass-pass:')||declaration.includes('filter:blur(.32px)'))
      assert.ok(selector.includes(':not([data-call-ios-flat="true"])'),selector);
  }
  const native=material.slice(material.indexOf('/* Reader native-flat:'));
  assert.match(native,/call-fx-registration="true"[^{}]+\{ --call-ios-flat-filter:blur\(.13px\)/);
  assert.match(native,/call-theme="frost"[^{}]+\{ --call-ios-flat-filter:blur\(.22px\)/);
  assert.match(native,/call-theme="dark"[^{}]+\{ --call-ios-flat-filter:blur\(.39px\)/);
  assert.match(native,/\.call-display-root-v7 \{\s*filter:var\(--call-ios-flat-filter\)!important/);
  assert.match(native,/\.call-display-scroll-v7 \{\s*filter:none!important/);
  assert.doesNotMatch(native,/url\(/);
  // Pending asset visibility is shared and was already correct before this fix.
  assert.match(material,/data-call-material-ready="false"\]\[data-call-preboot="true"\]:not\(\[data-call-loading-state="error"\]\) body \.call-display-root-v7 \{ opacity:0!important/);
});


test('cold is the night signal path and panel bloom, not the retired coldFocus prefilter',()=>{
  for(const key of ['frost:false','frost:true','dark:green','dark:amber']){
    const graph=xml(artifact.graphs[key]).querySelector('filter');
    const pass=result=>graph.children.find(n=>n.attrs.result===result);
    assert.equal(pass('beam').attrs.stdDeviation,'0.35');
    assert.equal(pass('tubeSignal').attrs.stdDeviation,'0.18');
    assert.equal(pass('nearBloom').children[0].attrs.slope,'0.32');
    assert.equal(pass('wideBloom').children[0].attrs.slope,'0.36');
    assert.equal(pass('panelScatter').attrs.stdDeviation,'48');
    assert.equal(pass('panelBloom').children[0].attrs.slope,'.38');
    assert.doesNotMatch(artifact.graphs[key],/coldFocus|coldSaturation|coldExposure/);
  }
  assert.equal(xml(artifact.graphs['frost:false']).querySelector('filter').children.find(n=>n.attrs.result==='beam').attrs.in,'SourceGraphic');
  assert.equal(xml(artifact.graphs['frost:true']).querySelector('filter').children.find(n=>n.attrs.result==='beam').attrs.in,'registeredScene');
});

test('each display owns unique filter IDs and an idempotent mount, including loader reuse',()=>{
  const h=harness({mode:'frost'}),original=h.lens(),before=writes;
  assert.equal(h.window.CallReaderOpticsV14.mount(h.scene),h.api);
  assert.equal(writes,before);
  const second=h.body.appendChild(new Element('div'));
  second.appendChild(new Element('span',{class:'call-fx-scanlines-v7'}));
  h.window.CallReaderOpticsV14.mount(second);
  const filterIds=h.body.children.filter(n=>n.attrs.class?.includes('call-reader-optics-defs-v14')).flatMap(n=>n.children[0].children.map(f=>f.attrs.id));
  assert.equal(new Set(filterIds).size,4);
  assert.notEqual(second.style['--call-active-tube-filter'],h.scene.style['--call-active-tube-filter']);
  assert.equal(h.lens(),original);assert.equal(h.existing.children.length,0);
  assert.equal(h.observers.length,2);
  assert.match(material,/--call-optical-pass:var\(--call-active-tube-filter\)/);
  assert.doesNotMatch(material,/url\('#call-(screen-optics|flat-registration)/);
});

test('Call has no legacy Reader grid DOM or per-card SVG wear masks to carry into curves',()=>{
  for(const name of fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html'))){
    const page=read('public/'+name);
    assert.doesNotMatch(page,/class="[^"\n]*magi-background/);
    assert.doesNotMatch(page,/id="call-screen-optics-v7"/);
    assert.ok(page.indexOf('reader-optics-v14.js')<page.indexOf('call-loading-v10.js'));
  }
  // Decorations keep masks; content cards/sidebar/rows do not use SVG wear masks.
  for(const name of fs.readdirSync(path.join(root,'public/myfile')).filter(n=>n.endsWith('.css'))){
    assert.doesNotMatch(read('public/myfile/'+name),/url\(['"]?#call-screen-optics-v7/);
    for(const rule of read('public/myfile/'+name).matchAll(/([^{}]+)\{([^{}]+)\}/g)){
      if(/mask-image:\s*url\(/.test(rule[2]))assert.doesNotMatch(rule[1],/\.girlbox|\.suite-character-card|\.hamburger/);
    }
  }
});
