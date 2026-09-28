import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const report = JSON.parse(read('docs/call-sync-audit-20260929.json'));
const context = vm.createContext({Map,Set,console,window:{},document:{querySelectorAll:()=>[]}});
vm.runInContext(read('public/myfile/callTable.js')+';globalThis.calls=callTable;globalThis.reverse=calledMap;',context);
vm.runInContext(read('public/myfile/myCommon.js'),context);
const html=read('public/index.html');
vm.runInContext(html.slice(html.indexOf('function buildCallDisplayGroup'),html.indexOf('function formatNodeLabel')),context);
const options=lang=>({japanese:lang==='japanese',romaji:lang==='romaji',chinese:lang==='chinese'});
test('19 reviewed relation changes preserve bilingual/romaji display and reverse lookups',()=>{
 assert.equal(report.newRelationsAndCalls.length,19);
 const incoming=context.window.MagirecoNameUtils.buildCalledMap();
 for(const change of report.newRelationsAndCalls){
  const value=context.calls.get(change.callerKey).get(change.targetKey);
  assert.equal(value,change.after,change.cell);
  for(const lang of ['japanese','romaji','chinese'])assert.ok(context.formatCallText(value,options(lang)),`${change.cell} ${lang}`);
  assert.match(context.formatCallText(value,options('romaji')),/[A-Za-z]/u,change.cell);
  assert.doesNotMatch(context.formatCallText(value,options('romaji')),/[\u3400-\u9fffぁ-ヿ]/u,change.cell);
  assert.doesNotMatch(context.formatCallText(value,options('chinese')),/[ぁ-ヿ]/u,change.cell);
  const caller=change.callerKey.split(' (')[0];
  assert.ok(incoming.get(change.targetKey)?.has(caller),change.cell);
  if(change.kind==='add-relation')assert.ok(context.reverse.get(change.targetKey)?.has(caller),change.cell);
 }
});
test('source ambiguity stays uncommitted; uncertainty and grade types are preserved',()=>{
 const key=jp=>[...context.calls.keys()].find(k=>k.includes(`(${jp} / `));
 assert.equal(context.calls.get(key('愛生まばゆ')).get('年龄'),'15岁?');
 assert.equal(context.calls.get(key('シィ')).get('学年'),'?');
 assert.ok(!context.calls.get(key('阿見莉愛')).has('百江渚'));
 assert.equal(report.heldSourceAnomaly[0].cell,'BS76');
 assert.equal(context.calls.get(key('ワス')).get('年龄'),'15岁?');
 assert.equal(context.calls.get(key('瀬奈みこと')).get('身高'),'161cm');
});
test('complete edge count excludes metadata, self edges, and placeholders',()=>{
 const metadata=new Set(['年龄','年齢','学年','身高','第一人称','二人称','称呼倾向']);
 let count=0;
 for(const [caller,values] of context.calls)for(const [target,value] of values){
  if(metadata.has(target)||target===caller.split(' (')[0]||!value||['-','—','?'].includes(value))continue;
  count++;
 }
 assert.equal(count,2804);
 assert.equal(context.calls.size,195);
 assert.equal(JSON.parse(read('public/data/character-catalog.json')).length,193);
});
test('display cap is pagination only, never truncation of search matches',()=>{
 const source=read('public/myfile/story-app-v7.js');
 assert.ok(!source.includes('MAX_RENDERED_ROWS'));
 assert.match(source,/const RESULTS_PAGE_SIZE = 100;/);
 assert.match(source,/tagged\.rowIndex/);
 assert.match(read('public/story.html'),/story-app-v7\.js\?v=20260929-paged-results-v1/);
});
