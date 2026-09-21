import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('public/myfile/height-export-v11.js');
const css=read('public/myfile/theme-mode-v1.css');
const palettes={
 light:['#f3f4f4','#fbfcfc','#283033','#6d797c78','#58666a','#5c696c','#e1e4e4','#5c696c'],
 paper:['#f5ecd0','#fff7de','#3a3023','#806e4b70','#715e3e','#755f3e','#e7dab8','#755f3e'],
 green:['#edf5e8','#f8fcf5','#19382c','#456d5980','#527d67','#40785d','#d1e3cf','#40785d'],
 dark:['#091006','#0b1308','#a7ff54','#879d6599','#b1dc83','#a7ff54','#12200e','#a7ff54'],
 amber:['#100a0d','#150d10','#fff077','#b9a05b99','#f1d36f','#fff077','#21191b','#fff077'],
 frost:['#03191f','#071e23','#a7e3db','#397d7d','#89e0d6','#99d8d1','#17363c','#99d8d1']
};
function harness(palette,mode){
 const colors=[],gradient=[];
 const ctx={scale(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},setLineDash(){},arc(){},clip(){},drawImage(){},measureText(s){return {width:s.length*6}},
 fillRect(){colors.push(this.fillStyle)},strokeRect(){colors.push(this.strokeStyle)},stroke(){colors.push(this.strokeStyle)},fillText(){colors.push(this.fillStyle)},
 createLinearGradient(){return {addColorStop(at,color){gradient.push(color)}}}};
 const canvas={dataset:{},getContext(){return ctx}};
 const point={style:{left:'100px',top:'160px'},offsetWidth:54,dataset:{characterColor:'#ff00ff'},querySelector(){return null}};
 const bar={style:{left:'100px',width:'50px',height:'60%'},querySelector(){return {textContent:'156cm'}}};
 const plot={offsetWidth:600,offsetHeight:720,querySelectorAll(s){return s==='.height-bar-v2'?[bar]:[point]}};
 const axis={offsetHeight:80,querySelectorAll(){return [{style:{width:'600px'},textContent:'分类'}]}};
 const left={offsetWidth:80,style:{}};
 const surface={querySelector(s){if(s==='.height-plot-v2')return plot;if(s==='.height-x-axis-v2')return axis;return left}};
 const values=Object.fromEntries(['bg','panel','ink','grid','major','accent','bar-start','bar-end'].map((k,i)=>['--call-chart-'+k,palette[i]]));
 const document={documentElement:{},readyState:'loading',addEventListener(){},createElement(){return canvas},querySelector(s){return s==='.height-chart-surface-v2'?surface:s==='.height-chart-viewport-v2'?{dataset:{}}:null}};
 const window={getComputedStyle(){return {getPropertyValue(k){return values[k]||''}}},__MAGIRECO_CORRECTION_V2__:{heightState:{viewMode:mode}}};
 const context={window,document,MutationObserver:class{observe(){}},Image:class{set src(v){this.onerror()}},console};
 vm.runInNewContext(source,context);return {api:window.__MAGIRECO_HEIGHT_EXPORT_V11__,colors,gradient,values};
}
for(const [theme,palette] of Object.entries(palettes)) for(const mode of ['scatter','bar']) test(`${theme} ${mode} export uses the current theme, not legacy character colors`,async()=>{
 const h=harness(palette,mode);const c=await h.api.renderExportCanvas();
 assert.equal(c.width,2280);assert.equal(c.height,2400);
 assert.equal(c.dataset.exportLeftAxes,'1');assert.equal(c.dataset.exportRightAxes,'1');
 const actual=[...h.colors.filter(v=>typeof v==='string'),...h.gradient];
 assert.ok(actual.includes(palette[0]));assert.ok(actual.includes(palette[2]));assert.ok(actual.includes(palette[5]));
 assert.ok(actual.every(v=>palette.includes(v)),actual.join(','));
 assert.ok(!actual.includes('#ff00ff'));
 if(mode==='bar')assert.deepEqual(h.gradient,[palette[6],palette[7]]);
 h.values['--call-chart-accent']='#123456';assert.equal(h.api.chartPalette().accent,'#123456');
});
test('Reader current night material uses direct sibling layers on all ten entries',()=>{
 for(const name of fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html'))){
  const html=read('public/'+name);const film=html.match(/<div class="call-reader-screen-v7"[^>]*>(.*?)<\/div>/s)?.[1];
  assert.ok(film);assert.doesNotMatch(film,/night-phosphor|night-grain|day-grain|scanlines/);
  assert.equal((html.match(/call-material-direct-v11/g)||[]).length,4,name);
  assert.match(html,/ui-r11-height-material/);
  if(html.includes('height-export-v11.js'))assert.match(html,/height-export-v11\.js\?v=ui-r11-height-material/);
 }
 const final=css.slice(css.indexOf('/* r11:'));
 assert.match(final,/NoiseAndGrain\.png/);assert.match(final,/PixelOverlay_RGB_16\.png/);
 assert.match(final,/opacity:\.495!important/);assert.match(final,/opacity:\.66!important/);
 assert.match(final,/mix-blend-mode:screen!important/);assert.match(final,/inset:0!important/);
 assert.match(read('public/myfile/call-loading-v10.js'),/\.call-reader-screen-v7 span, \.call-material-direct-v11/);
});
test('startup and runtime share the same single focus value; flat mode retains it',()=>{
 for(const p of ['public/myfile/theme-mode-v1.js','public/myfile/call-loading-v10.js'])assert.match(read(p),/getComputedStyle\(root\).getPropertyValue\('--call-focus-radius'\)/);
 assert.match(css,/data-call-optics-active="false"[\s\S]*?filter:blur\(var\(--call-focus-radius\)\)/);
 assert.match(css,/data-call-theme="dark"\] \{ --call-focus-radius:\.39px/);
 assert.match(css,/data-call-ios-flat="true"\]\[data-call-theme="frost"\] \{ --call-focus-radius:\.22px/);
});
test('theme coverage includes actual legacy controls and every chart decoration',()=>{
 const final=css.slice(css.indexOf('/* r11:'));
 for(const name of ['height-major-line-v2','height-chart-tooltip-v2','height-point-guide-v2','height-active-guide-v3','height-active-guide-label-v3','height-active-y-label-v3','height-bar-v2','height-x-axis-spacer-right-v3'])assert.ok(final.includes(name),name);
 assert.match(final,/#at_form label\.at:has\(input:checked\)/);assert.match(final,/::selection/);assert.match(final,/:focus-visible/);
 assert.doesNotMatch(source,/dataset.characterColor|#f28ec1|#ffd3e9|#ce176f/);
});
