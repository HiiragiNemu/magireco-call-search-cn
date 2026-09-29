(function (global) {
  'use strict';

  const BRIDGE_REVISION = 1;
  const LOCAL_MANIFEST_URL = './data/story-router-v1.json';
  let state = null;
  let statePromise = null;
  let activeRouterBase = null;
  const MANIFEST_TIMEOUT_MS = 8000;

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
    if ((base.protocol !== 'http:' && base.protocol !== 'https:') || base.username || base.password) {
      throw new Error('路由地址必须使用无凭据的 HTTP(S) 地址');
    }
    return base;
  }

  function manifestUrl() {
    const base = aioBase();
    if (!base) return localManifestUrl();
    const url = absoluteBase(base);
    url.pathname = url.pathname.replace(/\/open\/?$/u, '/');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    url.hash = '';
    return new URL('story-routes.json', url).toString();
  }

  function routerUrl(sourceKey, target, edition) {
    const base = activeRouterBase ?? aioBase();
    if (!base) return '';
    const url = absoluteBase(base);
    if (!/\/open\/?$/u.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/u, '')}/open`;
    }
    url.search = '';
    url.hash = '';
    url.searchParams.set('source', sourceKey);
    url.searchParams.set('target', target);
    if (edition === 'initial' || edition === 'rerun') url.searchParams.set('edition', edition);
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
    if (!/^[a-z0-9-]{1,64}$/u.test(payload.catalogRevision || '') || !Array.isArray(payload.routes) || !payload.routes.length) {
      throw new Error('Story Router 清单结构无效');
    }
    const prefix = `story-v6:${payload.catalogRevision}:`;
    const routes = new Map();
    for (const route of payload.routes) {
      if (typeof route?.sourceKey !== 'string' || !route.sourceKey.startsWith(prefix) || !route?.reader?.storyId || routes.has(route.sourceKey)) {
        throw new Error('Story Router 清单存在无效或重复的来源标识');
      }
      routes.set(route.sourceKey, route);
    }
    return Object.freeze({ payload, routes });
  }

  function localManifestUrl() {
    return new URL(LOCAL_MANIFEST_URL, global.document?.baseURI || global.location?.href || 'http://localhost/').toString();
  }

  async function fetchManifest(url) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
          // A parseable partial response is still an incomplete route catalog.
          if (response.status !== 200 || response.headers?.get('content-range')) {
            throw new Error(`Story Router 非完整响应：HTTP ${response.status}`);
          }
          return await response.json();
        })(),
        new Promise((_, reject) => {
          timer = global.setTimeout(() => {
            controller.abort();
            reject(new Error('Story Router 清单读取超时'));
          }, MANIFEST_TIMEOUT_MS);
        })
      ]);
    } finally {
      global.clearTimeout(timer);
    }
  }

  async function loadManifest(searchManifest) {
    const local = localManifestUrl();
    let remote = '';
    let lastError = null;
    try { remote = manifestUrl(); } catch (error) { lastError = error; }
    const candidates = [...new Set([remote, local].filter(Boolean))];
    for (const url of candidates) {
      try {
        const loaded = parseManifest(await fetchManifest(url), searchManifest);
        // The fallback catalog belongs to the co-deployed handler, not to the
        // remote service that just failed. Keep source/edition/revision intact.
        activeRouterBase = url === local && aioBase()
          ? new URL('../aio/', local).toString()
          : aioBase();
        state = loaded;
        return state;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Story Router 清单不可用');
  }

  function initialize(searchManifest) {
    if (!statePromise) {
      statePromise = loadManifest(searchManifest).catch((error) => {
        statePromise = null;
        throw error;
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
    const variants = Array.isArray(route.variants)
      ? route.variants.map((variant) => {
          const edition = variant?.edition;
          const variantAdvReady = variant?.adv && state.payload.targets?.adv?.handoffReady === true;
          return Object.freeze({
            label: text(variant?.label),
            edition,
            storyId: text(variant?.reader?.storyId),
            precision: text(variant?.precision),
            translationStatus: variant?.translationStatus || null,
            reader: routerUrl(key, 'reader', edition) || directReaderUrl(variant),
            adv: variantAdvReady ? routerUrl(key, 'adv', edition) : '',
            advAvailable: Boolean(variant?.adv),
            advReady: Boolean(variantAdvReady)
          });
        })
      : [];
    return Object.freeze({
      sourceKey: key,
      storyId: route.reader.storyId,
      edition: route.edition || '',
      precision: route.precision || '',
      translationStatus: route.translationStatus || null,
      variants: Object.freeze(variants),
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
