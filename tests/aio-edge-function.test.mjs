import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import onRequest from '../public/edge-functions/aio/open.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/aio/story-routes.json', import.meta.url), 'utf8'));
const source = manifest.routes[0].sourceKey;

test('routes Reader and keeps ADV fail-closed through the deployed AIO function', async () => {
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
});
