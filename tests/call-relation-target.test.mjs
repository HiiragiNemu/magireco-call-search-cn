import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const tableSource = fs.readFileSync(new URL('../public/myfile/callTable.js', import.meta.url), 'utf8');
const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/character-catalog.json', import.meta.url), 'utf8'));
const context = vm.createContext({ Map, Set });
vm.runInContext(`${tableSource}\n;globalThis.result = callTable;`, context);

test('Himena relation resolves Alexandra by her canonical Chinese name', () => {
  const targets = catalog.filter(item => item.jp === '栗栖アレクサンドラ');
  assert.equal(targets.length, 1);
  assert.equal(targets[0].zh, '栗栖亚历山德拉');
  const relations = context.result.get('蓝家姬奈 (藍家ひめな / Aika Himena)');
  assert.ok(relations instanceof Map);
  assert.equal(relations.get(targets[0].zh), 'サーシャ (Sasha / 莎夏)');
  assert.equal(relations.has('栗栖亚历山德ラ'), false);
});
