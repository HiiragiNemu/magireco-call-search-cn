import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/myfile/story-route-bridge-v1.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('public/data/story-router-v1.json', root), 'utf8'));
const searchManifest = JSON.parse(await readFile(new URL('public/data/story-v6/manifest.json', root), 'utf8'));

function loadBridge(search = '') {
  const context = {
    URL,
    URLSearchParams,
    Math,
    Object,
    Number,
    RegExp,
    String,
    console,
    location: { search, href: `https://call.example/story.html${search}` },
    document: {
      baseURI: 'https://call.example/story.html',
      querySelector(selector) {
        if (selector === 'meta[name="magireco-reader-base"]') return { content: 'https://magireader.pages.dev/' };
        return null;
      }
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => manifest })
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'story-route-bridge-v1.js' });
  return context.MagirecoStoryRouteBridge;
}

test('preserves story-v6 source identity and direct Reader destination', async () => {
  const bridge = loadBridge();
  await bridge.initialize(searchManifest);
  const route = manifest.routes.find((entry) => entry.sourceKey.endsWith(':character:0'));
  assert.ok(route);
  const links = bridge.links('character', 0);
  assert.equal(links.sourceKey, route.sourceKey);
  assert.equal(links.storyId, route.reader.storyId);
  assert.match(links.reader, new RegExp(`/reader/${route.reader.storyId}(?:[?#]|$)`));
  assert.equal(links.adv, '');
  assert.equal(links.advAvailable, route.adv !== null);
  assert.equal(links.advReady, false);
});

test('uses the AIO router when configured without bypassing the ADV gate', async () => {
  const bridge = loadBridge('?aioBase=https%3A%2F%2Faio.example%2F');
  await bridge.initialize(searchManifest);
  const links = bridge.links('character', 0);
  const reader = new URL(links.reader);
  assert.equal(reader.origin, 'https://aio.example');
  assert.equal(reader.pathname, '/open');
  assert.equal(reader.searchParams.get('source'), links.sourceKey);
  assert.equal(reader.searchParams.get('target'), 'reader');
  assert.equal(links.adv, '');
});

test('unknown source rows do not create guessed links', async () => {
  const bridge = loadBridge();
  await bridge.initialize(searchManifest);
  assert.equal(bridge.links('character', 999999), null);
  assert.equal(bridge.links('../character', 0), null);
});
