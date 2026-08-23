(function (global) {
  'use strict';

  const BRIDGE_REVISION = 1;
  const MAP_URL = './data/sprite-character-ids-v1.json';
  const CANONICAL_KEYS = [
    'characterId', 'story', 'scenario', 'variant',
    'renderer', 'animation', 'character'
  ];
  const ALIASES = {
    characterId: ['characterId', 'character_id', 'unitId', 'unit'],
    story: ['story', 'storyId', 'groupId'],
    scenario: ['scenario', 'storyTitle', 'title'],
    variant: ['variant', 'skin'],
    renderer: ['renderer', 'render'],
    animation: ['animation', 'motion'],
    character: ['character', 'characterName', 'chara', 'gname']
  };
  let mapPromise = null;

  function text(value) {
    return String(value == null ? '' : value).normalize('NFC').trim();
  }

  function normalizeContext(input = {}) {
    const output = {};
    const rawId = text(input.characterId || input.character_id || input.unitId || input.unit);
    if (/^\d{1,8}$/.test(rawId)) output.characterId = String(Number(rawId));
    for (const key of ['story', 'scenario', 'variant', 'animation', 'character']) {
      const value = ALIASES[key].map((alias) => text(input[alias])).find(Boolean) || '';
      if (value) output[key] = value;
    }
    output.renderer = text(input.renderer || input.render) || 'cocos2d';
    return output;
  }

  function removeBridgeParameters(params) {
    Object.values(ALIASES).flat().forEach((key) => params.delete(key));
  }

  function viewerBase() {
    const params = new URLSearchParams(global.location?.search || '');
    return text(
      params.get('viewerBase')
      || params.get('spriteViewer')
      || global.MAGIRECO_SPRITE_VIEWER_URL
      || global.document?.querySelector('meta[name="magireco-sprite-viewer"]')?.content
      || 'https://kyu.gay/'
    );
  }

  function buildViewerUrl(context, base = viewerBase()) {
    const reference = global.document?.baseURI || global.location?.href || 'http://localhost/';
    const url = new URL(base, reference);
    const normalized = normalizeContext(context);
    removeBridgeParameters(url.searchParams);
    for (const key of CANONICAL_KEYS) {
      if (normalized[key]) url.searchParams.append(key, normalized[key]);
    }
    return url.toString();
  }

  function loadCharacterMap() {
    if (!mapPromise) {
      mapPromise = fetch(MAP_URL, { cache: 'force-cache' }).then((response) => {
        if (!response.ok) throw new Error(`战斗精灵角色映射加载失败：HTTP ${response.status}`);
        return response.json();
      }).then((payload) => payload?.characters || {});
    }
    return mapPromise;
  }

  function emitOpen(context, url) {
    const payload = {
      type: 'magireco.story.open-sprite',
      bridgeRevision: BRIDGE_REVISION,
      target: 'sprite',
      url,
      ...normalizeContext(context)
    };
    if (global.parent && global.parent !== global && typeof global.parent.postMessage === 'function') {
      global.parent.postMessage(payload, '*');
    }
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new CustomEvent('magireco.story.open-sprite', { detail: payload }));
    }
    return payload;
  }

  function wrapChip(chip, context) {
    const normalized = normalizeContext(context);
    const link = document.createElement('a');
    link.className = 'story-sprite-link-v1';
    link.href = buildViewerUrl(normalized);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = `在战斗精灵查看器中打开${normalized.character ? `：${normalized.character}` : ''}`;
    link.dataset.bridgeRevision = String(BRIDGE_REVISION);
    if (normalized.characterId) link.dataset.characterId = normalized.characterId;
    if (normalized.story) link.dataset.story = normalized.story;
    if (normalized.scenario) link.dataset.scenario = normalized.scenario;
    link.addEventListener('click', () => emitOpen(normalized, link.href));
    link.appendChild(chip);
    return link;
  }

  global.MagirecoStorySpriteBridge = Object.freeze({
    revision: BRIDGE_REVISION,
    mapUrl: MAP_URL,
    canonicalKeys: [...CANONICAL_KEYS],
    normalizeContext,
    viewerBase,
    buildViewerUrl,
    loadCharacterMap,
    emitOpen,
    wrapChip
  });
})(window);
