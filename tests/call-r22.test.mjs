import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const json=p=>JSON.parse(read(p));
const base=json('public/data/character-catalog.json');
const story=json('public/data/story-character-additions.json');
const attendance=json('public/data/attendance-character-additions.json');
const selectors=json('tests/fixtures/story-selectors-r22.json');
test('page-specific rosters cover every source choice without changing base characters',()=>{
 assert.equal(base.length,193);assert.equal(story.length,98);assert.equal(attendance.length,1);
 for(const [kind,extra] of [['story',story],['attendance',attendance]]){
  const names=[...base,...extra].map(x=>x.jp);assert.equal(names.length,new Set(names).size);
  for(const n of selectors[kind])assert.ok(names.includes(n==='早乙女先生'?'早乙女和子':n),n);
  for(const e of extra)for(const key of ['jp','zh','roman','kana','image'])assert.ok(e[key],`${e.jp} ${key}`);
 }
 assert.equal(attendance[0].jp,'小さなキュゥべえ');
});
test('new portraits are complete and match the pixel-verification manifest',()=>{
 const proof=json('docs/story-character-assets-20260929.json');assert.equal(proof.length,98);
 for(const entry of story){
  const item=proof.find(x=>x.jp===entry.jp);assert.ok(item.decodedPixelsEqual);
  const image=fs.readFileSync(new URL('../public/img/png/'+entry.image+'.png',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(image).digest('hex'),item.pngSha256);
 }
});
test('base catalog stays isolated and failed extension loads can retry',async()=>{
 const calls=[];let fail=true;
 const c=vm.createContext({console,Map,Set,AbortController,setTimeout,clearTimeout,window:{setTimeout,clearTimeout},fetch:async url=>{
  calls.push(url);
  if(url.includes('character-catalog'))return {ok:true,json:async()=>base};
  if(fail){fail=false;throw Error('transient fixture failure');}
  return {ok:true,json:async()=>story};
 }});
 vm.runInContext(read('public/myfile/tools-suite.js'),c);const api=c.window.MagiTools;
 assert.equal((await api.loadCatalog()).length,193);
 await assert.rejects(api.loadCatalog('./data/story-character-additions.json'));
 assert.equal((await api.loadCatalog('./data/story-character-additions.json')).length,291);
 assert.equal((await api.loadCatalog()).length,193);
 assert.equal(api.extraCharacter('アルティメットまどか').roman,'Ultimate Madoka');
 assert.equal(calls.filter(x=>x.includes('character-catalog')).length,1);
});
test('existing raw story rows and AIO routing files are not rebuilt',()=>{
 const audit=json('docs/story-attendance-sync-20260929.json');assert.equal(audit.totalRows,14466);
 assert.equal(audit.rawStoryDataChanged,false);assert.equal(audit.aioChanged,false);
 assert.ok(audit.categories.every(x=>x.differentRows===0));
});
