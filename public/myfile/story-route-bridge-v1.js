(function (global) {
  'use strict';

  const BRIDGE_REVISION = 1;
  const LOCAL_MANIFEST_URL = './data/story-router-v1.json';
  let state = null;
  let statePromise = null;

  function text(value) {
    return String(value == null ? '' : value).normalize('NFC').trim();
  }

  function parameter(name) {
    return new URLSearchParams(global.location?.search || '').get(name) || '';
  }

  function aioBase() {
    return text(
      parameter('aioBase')
      || parameter('storyRouter')
      || global.MAGIRECO_AIO_ROUTER_BASE_URL
      || global.document?.querySelector('meta[name="magireco-aio-router"]')?.content
    );
  }

  function readerBase() {
    return text(
      parameter('readerBase')
      || global.MAGIRECO_READER_BASE_URL
      || global.document?.querySelector('meta[name="magireco-reader-base"]')?.content
      || 'https://magireader.pages.dev/'
    );
  }

  function absoluteBase(value) {
    const base = new URL(value, global.document?.baseURI || global.location?.href || 'http://localhost/');
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('路由地址必须使用 HTTP(S)');
    return base;
  }

  function manifestUrl() {
    const base = aioBase();
    return base ? new URL('story-routes.json', base.endsWith('/') ? base : `${base}/`).toString() : LOCAL_MANIFEST_URL;
  }

  function routerUrl(sourceKey, target) {
    const base = aioBase();
    if (!base) return '';
    const url = absoluteBase(base);
    if (!/\/open\/?$/u.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/u, '')}/open`;
    }
    url.search = '';
    url.hash = '';
    url.searchParams.set('source', sourceKey);
    url.searchParams.set('target', target);
    return url.toString();
  }

  function stableHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function safeAnchorToken(value) {
    const trimmed = text(value);
    const cleaned = trimmed.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned && cleaned === trimmed ? cleaned : `${cleaned || 'source'}-${stableHash(trimmed)}`;
  }

  function sectionAnchor(sectionDescriptor) {
    const descriptor = /^(.*?)\s+Section\s*(\d+)\b/iu.exec(sectionDescriptor || '');
    if (!descriptor) return '';
    const source = safeAnchorToken(descriptor[1] || 'story');
    const section = safeAnchorToken(descriptor[2] || 'unknown');
    const branch = /(?:Branch|分支|group)\s*_?\s*(\d+)/iu.exec(sectionDescriptor)?.[1];
    return `sec-${source}-${section}${branch ? `-branch-${safeAnchorToken(branch)}` : ''}`;
  }

  function directReaderUrl(route) {
    const base = absoluteBase(readerBase());
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    const url = new URL(`reader/${encodeURIComponent(route.reader.storyId)}`, base);
    const anchor = route.reader.section ? sectionAnchor(route.reader.section) : '';
    if (anchor) {
      url.searchParams.set('section', anchor);
      url.hash = anchor;
    }
    return url.toString();
  }

  function parseManifest(payload, searchManifest) {
    if (!payload || payload.version !== 1 || payload.bridgeRevision !== BRIDGE_REVISION) {
      throw new Error('Story Router 清单版本无效');
    }
    if (payload.sourceCatalog !== 'story-v6' || payload.catalogGeneratedAt !== searchManifest.generatedAt) {
      throw new Error('搜索目录与 Story Router 不是同一版本');
    }
    const routes = new Map();
    for (const route of payload.routes || []) {
      if (route?.sourceKey && route?.reader?.storyId) routes.set(route.sourceKey, route);
    }
    return Object.freeze({ payload, routes });
  }

  function initialize(searchManifest) {
    if (!statePromise) {
      statePromise = fetch(manifestUrl(), { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`Story Router HTTP ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          state = parseManifest(payload, searchManifest);
          return state;
        });
    }
    return statePromise;
  }

  function sourceKey(categorySlug, rowIndex) {
    if (!state || !/^[a-z0-9-]{1,64}$/u.test(categorySlug) || !Number.isSafeInteger(rowIndex) || rowIndex < 0) return '';
    return `story-v6:${state.payload.catalogRevision}:${categorySlug}:${rowIndex}`;
  }

  function links(categorySlug, rowIndex) {
    const key = sourceKey(categorySlug, rowIndex);
    const route = key ? state?.routes.get(key) : null;
    if (!route) return null;
    const routedReader = routerUrl(key, 'reader');
    const advReady = route.adv && state.payload.targets?.adv?.handoffReady === true;
    return Object.freeze({
      sourceKey: key,
      storyId: route.reader.storyId,
      reader: routedReader || directReaderUrl(route),
      adv: advReady ? routerUrl(key, 'adv') : '',
      advAvailable: Boolean(route.adv),
      advReady: Boolean(advReady)
    });
  }

  global.MagirecoStoryRouteBridge = Object.freeze({
    revision: BRIDGE_REVISION,
    initialize,
    sourceKey,
    links,
    aioBase,
    readerBase
  });
})(window);
