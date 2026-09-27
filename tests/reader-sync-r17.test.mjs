import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const css=fs.readFileSync(path.join(root,'public/myfile/reader-optics-v14.css'),'utf8');

test('day optics use Reader .28 grain with no extra noise-linked scene blur',()=>{
 assert.match(css,/--call-reader-scan:\.28; --call-day-noise:\.28;/);
 assert.match(css,/filter:var\(--call-optical-pass\) var\(--call-glass-pass\)/);
 assert.doesNotMatch(css,/--call-day-focus-pass|--call-day-noise:\.6|blur\(\.42px\)|blur\(\.44px\)/);
 assert.match(css,/data-call-fx-registration="true"\] \{ --call-ios-flat-filter:blur\(\.13px\)/);
 assert.doesNotMatch(css,/backdrop-filter:blur|@keyframes/);
});

test('the two modified shared styles are cache-invalidated on all ten entries',()=>{
 const pages=fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html'));
 assert.equal(pages.length,10);
 for(const page of pages){
  const html=fs.readFileSync(path.join(root,'public',page),'utf8');
  for(const name of ['reader-controls-v12.css','reader-optics-v14.css'])assert.ok(html.includes(name+'?v='+(name==='reader-optics-v14.css'?'20260927-r19-day-glass':'20260926-r17-reader-sync')),page+' '+name);
  assert.ok(html.includes('call-boot-guard-v16'),page);
 }
});
