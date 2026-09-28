import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const report = JSON.parse(read('docs/call-sync-20260928.json'));
const catalog = JSON.parse(read('public/data/character-catalog.json'));
const html = read('public/index.html');
const ctx = vm.createContext({ Map, Set, console, window: {}, document: { querySelectorAll: () => [] } });
vm.runInContext(read('public/myfile/callTable.js') + '\n;globalThis.calls=callTable;globalThis.reverse=calledMap;',ctx);
vm.runInContext(read('public/myfile/myCommon.js'),ctx);
vm.runInContext(read('public/myfile/charaAt.js')+'\n;globalThis.attributes=charaAttribute;',ctx);
const formatter = html.slice(html.indexOf('function buildCallDisplayGroup'), html.indexOf('function formatNodeLabel'));
assert.ok(formatter.includes('function formatCallText'));
vm.runInContext(formatter,ctx);
const opts = key => ({japanese:key==='japanese',romaji:key==='romaji',chinese:key==='chinese'});
const callKey = name => [...ctx.calls.keys()].find(k=> k.split(' (')[0]===name);

test('all seven upstream roster additions are selectable, localized and pictured',()=>{
  assert.equal(catalog.length,193);
  assert.equal(ctx.calls.size,195);
  for (const p of report.portraits) {
    const matches=catalog.filter(c=>c.jp===p.jp);
    assert.equal(matches.length,1,p.jp);
    const c=matches[0]; assert.equal(c.zh,p.zh); assert.equal(c.roman,p.roman); assert.equal(c.kana,p.kana);
    assert.ok(!/[ぁ-ヿ]/u.test(c.zh));
    assert.ok(ctx.calls.has(`${c.zh} (${c.jp} / ${c.roman})`));
    assert.ok(ctx.attributes.has(c.jp));
    assert.ok(read('public/myfile/charaBox_png.css').includes(`../img/png/${c.zh}.png`));
    const png=fs.readFileSync(new URL(p.outputPath,root));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(crypto.createHash('sha256').update(png).digest('hex'),p.outputSha256);
    const value=`${c.zh} (${c.jp} / ${c.roman})`;
    assert.equal(ctx.formatNameText(value,opts('chinese')),c.zh);
    assert.equal(ctx.formatNameText(value,opts('romaji')),c.roman);
    assert.equal(ctx.formatNameText(value,opts('japanese')),c.jp);
  }
});

test('nine directed relationships match source Japanese and support every display mode',()=>{
  const incoming=ctx.window.MagirecoNameUtils.buildCalledMap();
  for(const e of report.newRelations){
    const details=ctx.calls.get(callKey(e.caller));
    const value=details.get(e.target);
    assert.ok(value,e.cell);
    assert.equal(ctx.formatCallText(value,opts('japanese')),e.sourceJapanese,e.cell);
    assert.ok(ctx.formatCallText(value,opts('chinese')),e.cell);
    assert.match(ctx.formatCallText(value,opts('romaji')),/[A-Za-z]/u,e.cell);
    assert.ok(!/[ぁ-ヿ]/u.test(ctx.formatCallText(value,opts('chinese'))),e.cell);
    assert.ok(!/[\u3400-\u9fffぁ-ヿ]/u.test(ctx.formatCallText(value,opts('romaji'))),e.cell);
    assert.ok(incoming.get(e.target)?.has(e.caller),e.cell);
    assert.ok(ctx.reverse.get(e.target)?.has(e.caller),e.cell);
  }
});

test('existing calls are only extended; anniversary context survives in all languages',()=>{
  for(const e of report.existingValueAdditions){
    const actual=ctx.calls.get(e.caller).get(e.target);
    assert.equal(actual,e.new);
    assert.ok(actual.startsWith(e.old));
  }
  const value=ctx.calls.get(report.existingValueAdditions[0].caller).get('里见那由他');
  assert.match(ctx.formatCallText(value,opts('japanese')),/那由他さん（5周年）/u);
  assert.match(ctx.formatCallText(value,opts('romaji')),/Nayuta-san \[5th anniversary\]/u);
  assert.match(ctx.formatCallText(value,opts('chinese')),/那由他小姐【五周年】/u);
  const y=ctx.calls.get(report.existingValueAdditions[1].caller).get('由比鹤乃');
  assert.match(ctx.formatCallText(y,opts('japanese')),/うちの孔明さん/u);
  assert.match(ctx.formatCallText(y,opts('romaji')),/Uchi no Koumei-san/u);
  assert.match(ctx.formatCallText(y,opts('chinese')),/我家的孔明先生/u);
});

test('unknowns and existing independent grade corrections are not overwritten',()=>{
  const w=ctx.calls.get(callKey('瓦斯'));
  assert.equal(w.get('年龄'),'15岁?'); assert.equal(w.get('学年'),'初三'); assert.equal(w.get('身高'),'?');
  for(const name of ['凪星索拉娜','莉莉·坎迪']){
    const row=ctx.calls.get(callKey(name));
    assert.equal(row.size,4); for(const val of row.values())assert.equal(val,'?');
  }
  vm.runInContext(read('public/myfile/gradeOverrides.js'),ctx);
  const g=ctx.window.EXPLICIT_GRADE_ATTRIBUTES;
  assert.deepEqual([...g.get('瀬奈みこと')],['中2','中学生']);
  assert.deepEqual([...g.get('浅古小糸')],['中学生']);
  assert.deepEqual([...g.get('行方晶')],['中3','中学生']);
  assert.equal(ctx.calls.get('濑奈命 (瀬奈みこと / Sena Mikoto)').get('身高'),'161cm');
});
