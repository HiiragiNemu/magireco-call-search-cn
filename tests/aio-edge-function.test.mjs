import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { onRequest } from '../functions/aio/open.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/aio/story-routes.json', import.meta.url), 'utf8'));
const route = manifest.routes.find((entry) => entry.sourceKey.endsWith(':character:411'));
assert.ok(route);
const source = route.sourceKey;
const editionRoute = manifest.routes.find((entry) => Array.isArray(entry.variants));
assert.ok(editionRoute);

test('routes Reader and requires both ADV production gates', async () => {
  const reader = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(source)}&target=reader`),
    env: {},
  });
  assert.equal(reader.status, 302);
  assert.match(reader.headers.get('location'), /^https:\/\/magireader\.pages\.dev\//u);

  const adv = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(source)}&target=adv`),
    env: {},
  });
  assert.equal(adv.status, 409);

  const enabledAdv = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(source)}&target=adv`),
    env: { AIO_ADV_HANDOFF_ENABLED: '1' },
  });
  assert.equal(enabledAdv.status, 302);
  const location = new URL(enabledAdv.headers.get('location'));
  assert.equal(location.origin, 'https://magiaexedralive2dviewer.pages.dev');
  assert.equal(location.searchParams.get('advRenderer'), 'pixi-v2');
  assert.equal(location.searchParams.get('bridge'), '1');
  assert.equal(location.searchParams.get('story'), '310371');
  assert.equal(location.searchParams.get('section'), '310371-1');
  assert.equal(location.searchParams.get('readerRevision'), 'bad94aa371dc9e6aed16ccf6d144106b31643f28');
});

test('routes initial and rerun editions to their distinct Reader and ADV targets', async () => {
  const readerLocations = [];
  const advLocations = [];
  for (const edition of ['initial', 'rerun']) {
    const expected = editionRoute.variants.find((variant) => variant.edition === edition);
    assert.ok(expected);
    const reader = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(editionRoute.sourceKey)}&target=reader&edition=${edition}`),
      env: {},
    });
    assert.equal(reader.status, 302);
    const readerLocation = new URL(reader.headers.get('location'));
    assert.equal(decodeURIComponent(readerLocation.pathname), `/reader/${expected.reader.storyId}`);
    readerLocations.push(readerLocation.toString());

    const adv = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(editionRoute.sourceKey)}&target=adv&edition=${edition}`),
      env: { AIO_ADV_HANDOFF_ENABLED: '1' },
    });
    assert.equal(adv.status, 302);
    const advLocation = new URL(adv.headers.get('location'));
    assert.equal(advLocation.searchParams.get('story'), expected.adv.chapterId);
    assert.equal(advLocation.searchParams.get('section'), expected.adv.section.split(/\s+/u, 1)[0]);
    advLocations.push(advLocation.toString());
  }
  assert.notEqual(readerLocations[0], readerLocations[1]);
  assert.notEqual(advLocations[0], advLocations[1]);
});

test('preserves audited SPA, English-special and Scene0 section targets', async () => {
  const cases = [
    ['event:101', '516101', '516101-1_DpzxE Section 1', 'sec-516101-1_DpzxE-1', 'exact-section'],
    ['special:219', '619001', '619001-1_F5Syz Section 1', 'sec-619001-1_F5Syz-1', 'exact-section'],
    ['scene0:15', 'scene0_main_902110_030-050_af52fe6e', '902110-050 Section 050', 'sec-902110-050-050', 'exact-section'],
    ['scene0:277', 'scene0_main_913117_030-090_12ab8eba', '913117-070 Section 070', 'sec-913117-070-070', 'story-parent'],
    ['event:84', '516520', '516520-2_819Mg Section 2', 'sec-516520-2_819Mg-2', 'exact-section'],
    ['event:98', '516520', '516520-16_819Mg Section 16', 'sec-516520-16_819Mg-16', 'exact-section'],
  ];
  for (const [suffix, storyId, section, readerAnchor, precision] of cases) {
    const expected = manifest.routes.find((entry) => entry.sourceKey.endsWith(`:${suffix}`));
    assert.ok(expected, suffix);
    assert.equal(expected.reader.storyId, storyId, suffix);
    assert.equal(expected.reader.section, section, suffix);
    assert.equal(expected.precision, precision, suffix);

    const reader = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(expected.sourceKey)}&target=reader`),
      env: {},
    });
    assert.equal(reader.status, 302, suffix);
    const readerLocation = new URL(reader.headers.get('location'));
    assert.equal(decodeURIComponent(readerLocation.pathname), `/reader/${storyId}`, suffix);
    assert.equal(readerLocation.searchParams.get('section'), readerAnchor, suffix);
    assert.equal(readerLocation.hash, `#${readerAnchor}`, suffix);

    const adv = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(expected.sourceKey)}&target=adv`),
      env: { AIO_ADV_HANDOFF_ENABLED: '1' },
    });
    assert.equal(adv.status, 302, suffix);
    const advLocation = new URL(adv.headers.get('location'));
    assert.equal(advLocation.searchParams.get('story'), storyId, suffix);
    assert.equal(advLocation.searchParams.get('section'), section.split(/\s+/u, 1)[0], suffix);
  }
});

test('preserves audited cross-volume and initial/rerun event sections', async () => {
  const cases = [
    ['event:2677', '508020-2 Section 2', '511720', '511720-2 Section 2'],
    ['event:2840', '507502-2_v4eNL Section 2', '512202', '507502-2_v4eNL Section 2'],
    ['event:2841', '507502-2_v4eNL Section 2', '512202', '507502-2_v4eNL Section 2'],
    ['event:2842', '507502-3_v4eNL Section 3', '512202', '507502-3_v4eNL Section 3'],
    ['event:2843', '507502-4_v4eNL Section 4', '512202', '507502-4_v4eNL Section 4'],
    ['event:2844', '507502-4_v4eNL Section 4', '512202', '507502-4_v4eNL Section 4'],
    ['event:2845', '507502-4_v4eNL Section 4', '512202', '507502-4_v4eNL Section 4'],
  ];
  for (const [suffix, initialSection, rerunStoryId, rerunSection] of cases) {
    const expected = manifest.routes.find((entry) => entry.sourceKey.endsWith(`:${suffix}`));
    assert.ok(expected, suffix);
    const variants = Object.fromEntries(expected.variants.map((variant) => [variant.edition, variant]));
    assert.equal(variants.initial.precision, 'exact-section', suffix);
    assert.equal(variants.initial.reader.section, initialSection, suffix);
    assert.equal(variants.rerun.precision, 'exact-section', suffix);
    assert.equal(variants.rerun.reader.storyId, rerunStoryId, suffix);
    assert.equal(variants.rerun.reader.section, rerunSection, suffix);

    const reader = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(expected.sourceKey)}&target=reader&edition=rerun`),
      env: {},
    });
    assert.equal(reader.status, 302, suffix);
    const readerLocation = new URL(reader.headers.get('location'));
    assert.equal(decodeURIComponent(readerLocation.pathname), `/reader/${rerunStoryId}`, suffix);

    const adv = await onRequest({
    request: new Request(`https://magireco-aio-router.pages.dev/open?source=${encodeURIComponent(expected.sourceKey)}&target=adv&edition=rerun`),
      env: { AIO_ADV_HANDOFF_ENABLED: '1' },
    });
    assert.equal(adv.status, 302, suffix);
    const advLocation = new URL(adv.headers.get('location'));
    assert.equal(advLocation.searchParams.get('story'), rerunStoryId, suffix);
    assert.equal(advLocation.searchParams.get('section'), rerunSection.split(/\s+/u, 1)[0], suffix);
  }
});
