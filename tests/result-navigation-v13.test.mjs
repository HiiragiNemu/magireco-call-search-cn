import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/myfile/site-correction-v4.js',import.meta.url),'utf8');
function harness({optical=true,reduced=false}={}) {
  const frames=[],calls=[];
  const folded={tagName:'DETAILS',open:false,parentElement:null};
  const height={tagName:'DIV',isConnected:true,parentElement:folded,getBoundingClientRect:()=>({top:900})};
  const result={...height};
  const document={readyState:'loading',addEventListener(){},
    getElementById:id=>({heightChartContainer:height,callResultSection:result}[id]||null),
    querySelector:s=>s==='.suite-nav'?{getBoundingClientRect:()=>({height:60})}:null};
  const window={__MAGIRECO_CORRECTION_V2__:{},__MAGIRECO_CORRECTION_V3__:{},
    localStorage:{getItem:()=>null},addEventListener(){},scrollY:100,
    requestAnimationFrame:f=>frames.push(f),matchMedia:()=>({matches:reduced}),
    scrollTo:v=>calls.push({kind:'window',...v}),
    displayHeightChart:()=>calls.push({kind:'render-height'}),
    toggleHeightView:v=>calls.push({kind:'height-visible',value:v}),
    drawNet_Table:()=>calls.push({kind:'render-call'})};
  if(optical)window.__MAGIRECO_SCROLL__={element:(target,behavior)=>calls.push({kind:'optical',target,behavior})};
  vm.runInNewContext(source,{window,document,console});
  const flush=()=>{while(frames.length)frames.shift()();};
  return {window,folded,height,result,calls,flush,jump:window.__MAGIRECO_CORRECTION_V4__.scrollTarget};
}
test('selected height search opens folded results and scrolls the real optical scroller',()=>{
  const h=harness();h.window.displayHeightChart(['环彩羽']);h.flush();
  assert.equal(h.folded.open,true);
  assert.deepEqual(h.calls.map(c=>c.kind),['render-height','optical']);
  assert.equal(h.calls[1].target,h.height);assert.equal(h.calls[1].behavior,'smooth');
});
test('relation search after height switches view, renders, then targets the relation section',()=>{
  const h=harness();h.window.displayHeightChart(['环彩羽']);h.flush();h.calls.length=0;
  h.window.drawAndJump();h.flush();
  assert.deepEqual(h.calls.map(c=>c.kind),['height-visible','render-call','optical']);
  assert.equal(h.calls[0].value,false);assert.equal(h.calls[2].target,h.result);
});
test('latest requested result wins if actions happen before layout settles',()=>{
  const h=harness();h.window.displayHeightChart(['环彩羽']);h.window.drawAndJump();h.flush();
  const jumps=h.calls.filter(c=>c.kind==='optical');assert.equal(jumps.length,1);assert.equal(jumps[0].target,h.result);
});
test('chart mode redraw does not pull the reader away from the current position',()=>{
  const h=harness();h.window.displayHeightChart(['环彩羽'],'all-left');h.flush();
  assert.deepEqual(h.calls.map(c=>c.kind),['render-height']);
});
test('reduced motion, detached targets and pre-optics window fallback are respected',()=>{
  const h=harness({reduced:true});h.jump(h.height);h.flush();assert.equal(h.calls[0].behavior,'auto');
  h.calls.length=0;h.jump(h.height);h.height.isConnected=false;h.flush();assert.equal(h.calls.length,0);
  const fallback=harness({optical:false});fallback.jump(fallback.result);fallback.flush();
  assert.equal(fallback.calls[0].kind,'window');assert.equal(fallback.calls[0].top,926);
});

test('theme installation preserves the canonical V4 navigation instead of replacing view switching',()=>{
  const theme=fs.readFileSync(new URL('../public/myfile/theme-mode-v1.js',import.meta.url),'utf8');
  const patch=theme.slice(theme.indexOf('  function patchLegacyScroll(){'),theme.indexOf('  let trackingTimer='));
  const h=harness(),canonical=h.window.drawAndJump;
  vm.runInNewContext(patch+'\npatchLegacyScroll();',{window:h.window});
  assert.equal(h.window.drawAndJump,canonical);
});

test('suite controls cover non-home filters, disclosures, notices, ranking and native file buttons',()=>{
  const css=fs.readFileSync(new URL('../public/myfile/reader-controls-v12.css',import.meta.url),'utf8');
  const shared=css.slice(css.indexOf('/* Shared suite controls:'));
  for(const selector of ['.suite-checks label','.suite-attribute-toolbar-v7 label','.suite-attribute-options-v7 label',
    '.runes-mask-enable-v9','.runes-mask-brush-v9','.suite-notice','.suite-status',
    '.suite-result-table th','.attendance-track','.attendance-bar','.runes-drop','::file-selector-button',
    '>summary::after',':has(input:checked)',':has(input:focus-visible)',':has(input:disabled)'])assert.ok(shared.includes(selector),selector);
  assert.doesNotMatch(shared,/backdrop-filter|filter:|setInterval|animation:/);
  assert.ok(shared.includes('var(--control-radius)'));assert.ok(shared.includes('var(--control-selected-shadow)'));
});
