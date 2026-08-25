import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import onRequest from '../public/edge-functions/aio/open.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/aio/story-routes.json', import.meta.url), 'utf8'));
const route = manifest.routes.find((entry) => entry.sourceKey.endsWith(':character:411'));
assert.ok(route);
const source = route.sourceKey;

test('routes Reader and requires both ADV production gates', async () => {
  const reader = await onRequest({
    request: new Request(`https://callsearch.magireco.top/aio/open?source=${encodeURIComponent(source)}&target=reader`),
    env: {},
  });
  assert.equal(reader.status, 302);
  assert.match(reader.headers.get('location'), /^https:\/\/magireader\.pages\.dev\//u);

  const adv = await onRequest({
    request: new Request(`https://callsearch.magireco.top/aio/open?source=${encodeURIComponent(source)}&target=adv`),
    env: {},
  });
  assert.equal(adv.status, 409);

  const enabledAdv = await onRequest({
    request: new Request(`https://callsearch.magireco.top/aio/open?source=${encodeURIComponent(source)}&target=adv`),
    env: { AIO_ADV_HANDOFF_ENABLED: '1' },
  });
  assert.equal(enabledAdv.status, 302);
  const location = new URL(enabledAdv.headers.get('location'));
  assert.equal(location.origin, 'https://magiaexedralive2dviewer.pages.dev');
  assert.equal(location.searchParams.get('advRenderer'), 'pixi-v2');
  assert.equal(location.searchParams.get('bridge'), '1');
  assert.equal(location.searchParams.get('story'), '310371');
  assert.equal(location.searchParams.get('section'), '310371-1');
  assert.equal(location.searchParams.get('readerRevision'), '65f221f2aaa5a9fe161ed32e03e4dfbb93d4746d');
});
