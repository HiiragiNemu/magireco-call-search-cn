import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/myfile/story-sprite-bridge-v1.js', import.meta.url), 'utf8');
const posted = [];
const dispatched = [];
let fetchCount = 0;
const window = {
  location: new URL('https://example.test/call-search/story.html?viewerBase=%2Fsprite-viewer%2F'),
  document: {
    baseURI: 'https://example.test/call-search/story.html',
    querySelector() { return null; },
    createElement() { throw new Error('not used in this test'); }
  },
  parent: { postMessage(payload, origin) { posted.push({ payload, origin }); } },
  dispatchEvent(event) { dispatched.push(event); },
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
};
window.window = window;
const fetch = async () => {
  fetchCount += 1;
  return { ok: true, json: async () => ({ characters: { '環いろは': { characterId: '1001', variant: '100100_r' } } }) };
};

vm.runInNewContext(source, { window, URL, URLSearchParams, fetch, CustomEvent: window.CustomEvent });
const bridge = window.MagirecoStorySpriteBridge;

assert.equal(bridge.viewerBase(), '/sprite-viewer/');
assert.deepEqual(
  JSON.parse(JSON.stringify(bridge.normalizeContext({ unit: '001001', groupId: '魔法少女:abc', title: '序章 1話', skin: '100100_r' }))),
  {
    characterId: '1001',
    story: '魔法少女:abc',
    scenario: '序章 1話',
    variant: '100100_r',
    renderer: 'cocos2d'
  }
);

assert.equal(
  bridge.buildViewerUrl({
    characterId: '1001',
    story: '魔法少女:abc',
    scenario: '序章 1話',
    variant: '100100_r'
  }),
  'https://example.test/sprite-viewer/?characterId=1001&story=%E9%AD%94%E6%B3%95%E5%B0%91%E5%A5%B3%3Aabc&scenario=%E5%BA%8F%E7%AB%A0+1%E8%A9%B1&variant=100100_r&renderer=cocos2d'
);

const mapA = await bridge.loadCharacterMap();
const mapB = await bridge.loadCharacterMap();
assert.equal(mapA['環いろは'].characterId, '1001');
assert.equal(mapB['環いろは'].variant, '100100_r');
assert.equal(fetchCount, 1);

const payload = bridge.emitOpen({ characterId: '1001', variant: '100100_r' }, 'https://example.test/sprite-viewer/');
assert.equal(payload.type, 'magireco.story.open-sprite');
assert.equal(payload.bridgeRevision, 1);
assert.equal(posted.at(-1).payload.characterId, '1001');
assert.equal(dispatched.at(-1).type, 'magireco.story.open-sprite');

console.log('V26 story sprite bridge tests passed');
