import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('public/myfile/reader-optics-graphs-v14.json'));
const css=read('public/myfile/reader-optics-v14.css');
const preserved={
  "light:false": "0a32cd8463c47cc2e06aa06c1e0f97b9d883d41bb5c30ba80ceb87777d1c845a",
  "light:true": "a1292d72bdf7ff4bd7c40509f8fec285ad5bbd09f007789f5bd18b64805763ab",
  "paper:false": "0a32cd8463c47cc2e06aa06c1e0f97b9d883d41bb5c30ba80ceb87777d1c845a",
  "paper:true": "a1292d72bdf7ff4bd7c40509f8fec285ad5bbd09f007789f5bd18b64805763ab",
  "green:false": "0a32cd8463c47cc2e06aa06c1e0f97b9d883d41bb5c30ba80ceb87777d1c845a",
  "green:true": "a1292d72bdf7ff4bd7c40509f8fec285ad5bbd09f007789f5bd18b64805763ab",
  "frost:false": "bb718bf7b413b3ddccfa62441662c069f227963ac19d92abc2232053e20fdf3e",
  "frost:true": "e858cfba445a2d31e73c62647efed863666dc6f9ec9829e69061cb90772f8e6a",
  "dark:green": "be07317ea35ed85d4859aa86fe1691339d98496e6692720483de369ee85183b9",
  "flat:green": "dc24cdedeb8770e33ee3979ac2fe001c74604b12c002bf706ba285711e796597",
  "flat:day": "366eb70c90fb2624f100a04249c564b71fef446bab396cf00f21810184cbb4d0"
};
test('approved incremental donor changes only the two amber graphs',()=>{
 assert.equal(data.meta.independentInk.packageSha256,'92615a28ed14730ab037ae46cb0e41473e0e4ece3fb0cf524800ce2f487645fd');
 assert.equal(data.meta.independentInk.acceptance,'USER_ACCEPTED_COLOUR_BASELINE_ONLY');
 assert.equal(data.meta.independentInk.files.length,5);
 for(const [key,sha] of Object.entries(preserved))assert.equal(crypto.createHash('sha256').update(data.graphs[key]).digest('hex'),sha,key);
});
test('amber is one independent scene pass, pale edge remains inside the source stroke',()=>{
 for(const key of ['flat:amber','dark:amber']){
  const g=data.graphs[key];
  assert.match(g,/dx="0" dy="0" result="[^"]*-registered"/);
  assert.doesNotMatch(g,/-red-shift|-blue-shift|-pale-echo|-inverse-rim/);
  assert.match(g,/1 0 -1 0 0/);assert.match(g,/-1 2 -1 0 0/);
  assert.match(g,/dx="0.8" result="[^"]*-warm-shift"/);
  assert.match(g,/in="[^"]*-pale-edge" result="[^"]*-pale-mask"/);
  assert.ok(g.indexOf('in="'+(key==='flat:amber'?'flat-registration':'registeredScene')+'-original-core"')<g.lastIndexOf('-inverse-pale'));
 }
});
test('yellow key excludes native white, green and the orange-red echo',()=>{
 const clamp=n=>Math.max(0,Math.min(1,n));const key=([r,g,b])=>clamp(r-b)*clamp(2*g-r-b);
 for(const rgb of [[1,1,1],[244/255,248/255,245/255],[0,1,0],[1,65/255,13/255]])assert.equal(key(rgb),0);
 assert.ok(key([1,240/255,119/255])>0);
 const stroke=[0,0,1,1,1,0],edge=stroke.map((v,i)=>Math.max(0,v-(stroke[i-1]||0)));
 assert.deepEqual(edge,[0,0,1,0,0,0]); // left coverage is inside, never outside
});
test('night paint is shadow-only, independent white and inverse roles follow actual control faces',()=>{
 const rules=css.slice(css.indexOf('/* r18 accepted'),css.indexOf('/* Reader native-flat:'));
 assert.match(rules,/--call-night-white-shadow:.*rgb\(38,141,255\)/);
 assert.match(rules,/--call-night-base-shadow:.*#ff410de8/);
 assert.match(rules,/--call-night-inverse-shadow:.*#fffef1/);
 assert.match(rules,/label.girlbox:has\(input:checked\)/);
 assert.match(rules,/\.call-theme-widget-v7 \.call-theme-option-v7\[aria-pressed="true"\]/);
 for(const m of rules.matchAll(/([^{}]+)\{([^{}]+)\}/g)){
  assert.ok(m[1].includes('[data-call-theme="dark"]'));
  assert.doesNotMatch(m[2],/(?:^|;)\s*(?:color|background|filter|-webkit-text-fill-color|transform):/);
 }
 assert.doesNotMatch(read('public/myfile/reader-optics-v14.js'),/pointermove|mousemove|MutationObserver/);
});
test('r20 invalidates material assets while retaining accepted graph coefficients and r16 loader',()=>{
 for(const name of fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html'))){
  const html=read('public/'+name);
  assert.ok(html.includes('reader-optics-v14.css?v=20260928-r20-day-grain'));
  assert.ok(html.includes('reader-optics-graphs-v14.js?v=20260928-r20-day-grain'));
  assert.ok(html.includes('reader-controls-v12.css?v=20260928-r21-night-halo'));
  assert.ok(html.includes('call-loading-v10.js?v=20260926-r16-selection-boot'));
 }
});
