import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ctx = {Map, Set, console, window: {}, document: {querySelectorAll: () => []}};
vm.createContext(ctx);
vm.runInContext(read('public/myfile/callTable.js') + ';globalThis.calls=callTable;globalThis.reverse=calledMap;', ctx);
vm.runInContext(read('public/myfile/charaAt.js') + ';globalThis.tags=charaAttribute;', ctx);
vm.runInContext(read('public/myfile/myCommon.js'), ctx);
const html = read('public/index.html');
vm.runInContext(html.slice(html.indexOf('function buildCallDisplayGroup'), html.indexOf('function formatNodeLabel')), ctx);
const catalog = JSON.parse(read('public/data/character-catalog.json'));
const row = jp => [...ctx.calls].find(([k]) => k.includes(`(${jp} / `))[1];
const opts = lang => ({japanese: lang === 'jp', romaji: lang === 'roman', chinese: lang === 'zh'});

test('two new localized identities have separate kana, portraits and unknown metadata', () => {
  assert.equal(catalog.length, 195);
  assert.equal(ctx.calls.size, 197);
  for (const [jp, zh, roman, kana] of [
    ['そらなの母', '索拉娜的母亲', 'Sorana no Haha', 'そらなのはは'],
    ['リナ', '莉娜', 'Rina', 'りな'],
  ]) {
    const c = catalog.filter(c => c.jp === jp);
    assert.equal(c.length, 1);
    assert.equal(c[0].zh, zh); assert.equal(c[0].roman, roman); assert.equal(c[0].kana, kana);
    assert.equal(row(jp).get('年龄'), '?'); assert.equal(row(jp).get('学年'), '-');
    assert.equal(row(jp).get('身高'), '?'); assert.equal(row(jp).get('第一人称'), '?');
    assert.equal(fs.readFileSync(new URL(`../public/img/png/${zh}.png`, import.meta.url)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([...ctx.tags.get(jp)], ['まどドラ', 'そらな']);
  }
  assert.equal(catalog.find(c => c.jp === '人見リナ').zh, '人见里奈');
  assert.notEqual(catalog.find(c => c.jp === 'リナ').image, catalog.find(c => c.jp === '人見リナ').image);
});

test('eight directed calls preserve Japanese and give Chinese and romanized displays', () => {
  const incoming = ctx.window.MagirecoNameUtils.buildCalledMap();
  for (const [caller, target, jp, zh] of [
    ['凪星そらな', '丘比', 'キュゥべえ', '丘比'],
    ['凪星そらな', '莉莉·坎迪', 'リリーちゃん', '小莉莉'],
    ['凪星そらな', '索拉娜的母亲', 'ママ', '妈妈'],
    ['凪星そらな', '莉娜', 'リナ母さん', '莉娜妈妈'],
    ['リリー・キャンディー', '丘比', 'キュゥべえちゃん', '小丘比'],
    ['リリー・キャンディー', '凪星索拉娜', 'そらなちゃん', '小索拉娜'],
    ['そらなの母', '凪星索拉娜', 'そらなちゃん', '小索拉娜'],
    ['そらなの母', '莉娜', 'リナちゃん', '小莉娜'],
  ]) {
    const value = row(caller).get(target);
    assert.equal(ctx.formatCallText(value, opts('jp')), jp);
    assert.equal(ctx.formatCallText(value, opts('zh')), zh);
    assert.doesNotMatch(ctx.formatCallText(value, opts('roman')), /[\u3400-\u9fffぁ-ヿ]/u);
    assert.match(ctx.formatCallText(value, opts('roman')), /[A-Za-z]/);
    const name = catalog.find(c => c.jp === caller).zh;
    assert.ok(incoming.get(target)?.has(name)); assert.ok(ctx.reverse.get(target)?.has(name));
  }
  assert.equal(row('リナ').size, 4, 'No invented outgoing calls or self-edge');
  assert.ok(!ctx.reverse.get('人见里奈').has('凪星索拉娜'));
  for (const jp of ['凪星そらな', 'リリー・キャンディー']) assert.equal(row(jp).get('第一人称'), 'わたし (watashi / 我)');
});

test('additive school mapping preserves prior schools and holds suspect source changes', () => {
  assert.equal(row('凪星そらな').get('年龄'), '17岁');
  assert.equal(row('凪星そらな').get('学年'), '?');
  assert.ok(ctx.tags.get('凪星そらな').has('シー・ホライズン国際高等学校'));
  for (const jp of ['環いろは', 'くろ']) assert.ok(ctx.tags.get(jp).has('宝崎市立第一中学校'));
  assert.ok(ctx.tags.get('環いろは').has('神浜市立大附属'));
  assert.ok(ctx.tags.get('瀬奈みこと').has('大東学院'));
  assert.ok(!ctx.tags.get('瀬奈みこと').has('限定'));
  assert.ok(!row('阿見莉愛').has('百江渚'));
  assert.equal(row('アシュリー・テイラー').get('更纱帆奈'), 'ひみか (Himika)');
  for (const text of [html, read('public/myfile/suite-v7.js'), read('public/myfile/site-correction-v2.js')]) {
    for (const label of ['海平线国际高等学校', '宝崎市立第一中学']) assert.ok(text.includes(label));
  }
});

test('previous unrelated call records and attribute sets remain byte-equivalent semantically', () => {
  const proof = JSON.parse(read('docs/call-data-update-20261020.json'));
  const preserved = [...ctx.calls].filter(([k]) => !['凪星そらな','リリー・キャンディー','そらなの母','リナ'].some(jp => k.includes(`(${jp} / `)))
    .map(([k,v]) => [k, [...v]]);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(preserved)).digest('hex'), proof.preservedCallRecordsSha256);
  const tags = [...ctx.tags].filter(([jp]) => !['凪星そらな','環いろは','くろ','そらなの母','リナ'].includes(jp)).map(([k,v]) => [k,[...v]]);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(tags)).digest('hex'), proof.preservedAttributesSha256);
});
