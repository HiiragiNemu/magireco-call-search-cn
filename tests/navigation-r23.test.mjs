import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const suite=read('public/myfile/suite-v7.js'),theme=read('public/myfile/theme-mode-v1.js');
const nav=suite.slice(suite.indexOf('  function installQuickRailV7()'),suite.indexOf('  function measureNav()'));
const icons=theme.slice(theme.indexOf('  function railIcon('),theme.indexOf('  function ensureRail('));
const expected={story:['top','filter','characters','search','results','cancel','bottom'],attendance:['top','filter','characters','cancel','bottom'],call:['top','characters','search','cancel','bottom']};
function node(){return {dataset:{},children:[],attrs:{},appendChild(x){this.children.push(x)},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this[k]=f}};}
for(const [tool,actions] of Object.entries(expected))test(tool+' actions are explicit, distinct and keep full accessible names',()=>{
 const body=node();body.dataset.suiteTool=tool;
 const c={document:{body,querySelector:()=>null,getElementById:()=>null,createElement:node},global:{},scrollToTarget:()=>{}};
 vm.runInNewContext(nav+';installQuickRailV7()',c);
 const buttons=body.children[0].children;assert.deepEqual(buttons.map(b=>b.dataset.action),actions);
 for(const b of buttons){assert.equal(b.title,b.attrs['aria-label']);assert.ok(b.title.length>1);assert.equal(typeof b.click,'function');}
});
test('legacy mixed-cache search labels migrate without replacing handlers or accessible names',()=>{
 const buttons=['搜索条件','执行搜索','搜索结果','取消筛选与角色选择'].map(label=>({dataset:{action:'search',callIconized:'true'},title:label,getAttribute:()=>label,writes:0,set innerHTML(v){this.markup=v;this.writes++}}));
 const ctx={buttons};vm.runInNewContext(icons+';normalizeRailButtons({querySelectorAll:()=>buttons});',ctx);
 assert.deepEqual(buttons.map(b=>b.dataset.action),['filter','search','results','cancel']);
 assert.match(buttons[0].markup,/>筛</);assert.match(buttons[1].markup,/<svg/);assert.match(buttons[2].markup,/>果</);assert.match(buttons[3].markup,/<svg/);assert.match(buttons[3].markup,/M6 6l12 12M18 6 6 18/);
 vm.runInNewContext('normalizeRailButtons({querySelectorAll:()=>buttons})',ctx);assert.ok(buttons.every(b=>b.writes===1));
});
test('single Chinese glyphs inherit theme and only search uses magnifier geometry',()=>{
 const c={};vm.runInNewContext(icons+';globalThis.icon=railIcon;',c);
 for(const [a,ch] of Object.entries({characters:'选',filter:'筛',attributes:'属',results:'果',height:'高'})){
  const s=c.icon(a);assert.match(s,/aria-hidden="true"/);assert.equal(s.replace(/<[^>]+>/g,''),ch);assert.doesNotMatch(s,/<svg/);
 }
 assert.match(c.icon('search'),/circle cx="10.5"/);
 const css=read('public/myfile/theme-mode-v1.css');assert.match(css,/\.call-rail-letter\s*\{[^}]*font-size:1rem!important/);assert.match(css,/\.call-rail-letter\s*\{[^}]*color:inherit/);
});
