import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const proof=JSON.parse(read('docs/call-display-r24.json'));
const c={Map,Set,console,window:{},document:{querySelectorAll:()=>[]}};vm.createContext(c);
vm.runInContext(read('public/myfile/callTable.js')+';globalThis.calls=callTable;',c);
vm.runInContext(read('public/myfile/myCommon.js'),c);
const html=read('public/index.html');vm.runInContext(html.slice(html.indexOf('function buildCallDisplayGroup'),html.indexOf('function formatNodeLabel')),c);
test('r24 sixteen existing cell repairs work separately in all three language modes',()=>{
 assert.equal(proof.count,16);
 for(const item of proof.changes){
  const row=[...c.calls].find(([k])=>k.includes(`(${item.caller} / `));const value=row[1].get(item.target);
  assert.equal(value,item.after);
  for(const lang of['japanese','romaji','chinese']){
   const text=c.formatCallText(value,{japanese:lang==='japanese',romaji:lang==='romaji',chinese:lang==='chinese'});
   assert.ok(text,`${item.caller} ${item.target} ${lang}`);
   if(lang==='romaji'){assert.match(text,/[A-Za-z]/);assert.doesNotMatch(text,/[\u3400-\u9fffぁ-ヿ]/u);}
   if(lang==='chinese')assert.doesNotMatch(text,/[ぁ-ヿ]/u);
  }
 }
 const item=proof.changes.at(-1),v=c.formatCallText(item.after,{japanese:true,romaji:false,chinese:false});
 assert.match(v,/偏屈ババア/);assert.match(v,/ケチババア/);
});
test('r24 preserves source ambiguity and source spelling decisions',()=>{
 const row=jp=>[...c.calls].find(([k])=>k.includes(`(${jp} / `))[1];
 assert.equal(row('アシュリー・テイラー').get('更纱帆奈'),'ひみか (Himika)');
 assert.ok(!row('阿見莉愛').has('百江渚'));
});
test('r24 two additive Exedra facets preserve existing character and school tags',()=>{
 const context={};vm.runInNewContext(read('public/myfile/charaAt.js')+';globalThis.tags=charaAttribute;',context);
 for(const name of ['梓みふゆ','アリナ・グレイ']){assert.ok(context.tags.get(name).has('まどドラ'));assert.ok(context.tags.get(name).has('マギレコ'));}
 assert.ok(context.tags.get('梓みふゆ').has('水名女学園'));assert.ok(context.tags.get('瀬奈みこと').has('大東学院'));assert.ok(!context.tags.get('瀬奈みこと').has('AAABC'));
});
