import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('public/myfile/reader-controls-v12.css');
const night=css.slice(css.indexOf('/* r21: night selection'),css.indexOf('/* r17: cold selection'));

test('night selected character cards retain dark face and bright ink with persistent edge glow',()=>{
 assert.match(night,/data-call-theme="dark"/);
 assert.match(night,/label\.girlbox:has\(input:checked\),\.suite-character-card\[aria-pressed="true"\]/);
 assert.match(night,/background:var\(--call-card-bg\)!important; color:var\(--call-card-text\)!important/);
 assert.match(night,/border-color:var\(--call-accent-strong\)!important/);
 for(const radius of [4,12,20])assert.ok(night.includes(`0 0 ${radius}px color-mix(in srgb,var(--call-accent)`));
 assert.match(night,/inset 0 0 0 1px var\(--call-accent-strong\)/);
 assert.doesNotMatch(night,/background:var\(--call-accent\)|color:var\(--call-accent-ink\)|:hover|:focus|transform:|filter:|animation:|border-width:|padding:/);
});

test('night green and amber use their own readable palette, while cold selection is unchanged',()=>{
 const theme=read('public/myfile/theme-mode-v1.css');
 const lum=hex=>hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
 for(const selector of [':root[data-call-theme="dark"]{',':root[data-call-theme="dark"][data-call-phosphor="amber"]{']){
  const rule=theme.slice(theme.indexOf(selector)).split('}')[0];
  const face=rule.match(/--call-card-bg:(#[a-f\d]{6})/)[1];
  const ink=rule.match(/--call-card-text:(#[a-f\d]{6})/)[1];
  assert.ok((lum(ink)+.05)/(lum(face)+.05)>7,selector+' source palette contrast');
 }
 const cold=css.slice(css.indexOf('/* r17: cold selection')).split('}')[0];
 assert.match(cold,/border-color:#d8eee3!important/);
 assert.match(cold,/box-shadow:inset 0 0 0 1px #c1ebdc,0 0 4px rgba\(193,235,220,\.65\),0 0 12px rgba\(149,222,208,\.68\),0 0 20px rgba\(101,195,185,\.5\)!important/);
 assert.match(css,/content:"✓"/);
 assert.match(css,/label\.girlbox input\.MagicalChk \{\s*outline:none!important; border:0!important; box-shadow:none!important/);
});

test('all ten pages load the night halo stylesheet after the shared theme',()=>{
 const pages=fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html'));
 assert.equal(pages.length,10);
 for(const name of pages){
  const html=read('public/'+name);
  const control=html.indexOf('reader-controls-v12.css?v=20260928-r21-night-halo');
  assert.ok(control>html.indexOf('theme-mode-v1.css')&&control>0,name);
 }
});
