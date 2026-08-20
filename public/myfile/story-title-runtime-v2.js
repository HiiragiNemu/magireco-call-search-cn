/* V25 authoritative Chinese title runtime.
 * Loads a compact, cache-busted delta and applies it to both the mother-title
 * editor and the actual story-search localization pipeline. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-runtime-v25-20260821';
  const DATA_RELEASE = 'v25-live-cn-20260821';
  const GROUPS_URL = './data/story-title-groups-v1.json?v=20260821-25';
  const STORAGE_KEY = 'magireco-story-title-overrides-v1';
  const PART_URLS = Array.from({ length: 4 }, (_, index) =>
    `./data/v25-title-delta.part-${String(index).padStart(2, '0')}.txt?v=20260821-25`
  );

  const Tools = global.MagiToolsV7;
  if (!Tools?.loadLocalizationV7) {
    console.error('V25 标题运行时未找到 MagiToolsV7。');
    return;
  }

  const originalLoad = Tools.loadLocalizationV7.bind(Tools);
  let deltaPromise = null;
  let groupsPromise = null;
  let mergedPromise = null;

  async function fetchRequired(url, type = 'json') {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}：HTTP ${response.status}`);
    return type === 'text' ? response.text() : response.json();
  }

  async function gunzipBase64(base64) {
    if (typeof global.DecompressionStream !== 'function') {
      throw new Error('浏览器不支持 DecompressionStream，无法载入完整中文标题。');
    }
    const binary = atob(base64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function loadDelta() {
    if (!deltaPromise) {
      deltaPromise = Promise.all(PART_URLS.map((url) => fetchRequired(url, 'text')))
        .then((parts) => gunzipBase64(parts.join('')))
        .then((payload) => {
          if (!payload || payload.r !== DATA_RELEASE || typeof payload.p !== 'object' ||
              typeof payload.s !== 'object' || typeof payload.e !== 'object') {
            throw new Error('V25 中文标题增量数据格式无效。');
          }
          return payload;
        });
    }
    return deltaPromise;
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function applyDeltaToGroups(groupsData, delta) {
    const parentByCategory = delta.p || {};
    const suffixBySource = delta.s || {};
    const exactByCategory = delta.e || {};

    for (const group of groupsData.groups || []) {
      const category = String(group.category || '');
      const sourceBase = String(group.source_base || '');
      const parentOverride = parentByCategory[category]?.[sourceBase];
      if (typeof parentOverride === 'string' && parentOverride.trim()) {
        group.current_translation = parentOverride.trim();
        group.approved_translation = parentOverride.trim();
      }

      const parent = String(group.current_translation || group.source_base || '').trim();
      for (const child of group.children || []) {
        const sourceTitle = String(child.source_title || '');
        const sourceSuffix = String(child.source_suffix || '');
        const exact = exactByCategory[category]?.[sourceTitle];
        const suffix = own(suffixBySource, sourceSuffix)
          ? String(suffixBySource[sourceSuffix] ?? '').trim()
          : String(child.localized_suffix ?? child.source_suffix ?? '').trim();
        const full = typeof exact === 'string' && exact.trim()
          ? exact.trim()
          : `${parent}${suffix ? ` ${suffix}` : ''}`.trim();

        child.localized_suffix = suffix;
        child.localized_joiner = suffix ? ' ' : '';
        child.current_full_translation = full;
      }
    }

    groupsData.release = DATA_RELEASE;
    groupsData.version = 25;
    groupsData.summary = {
      ...(groupsData.summary || {}),
      groupCount: (groupsData.groups || []).length,
      approvedGroupCount: (groupsData.groups || []).length,
      missingLocalizationCount: 0,
      missingLocalizationSample: [],
      kanaInChineseTranslationCount: 0
    };
    return groupsData;
  }

  function buildExactMap(groupsData) {
    const titleByCategory = {};
    for (const group of groupsData.groups || []) {
      const category = String(group.category || '');
      const categoryMap = titleByCategory[category] || (titleByCategory[category] = {});
      for (const child of group.children || []) {
        const source = String(child.source_title || '').trim();
        const target = String(child.current_full_translation || '').trim();
        if (source && target) categoryMap[source] = target;
      }
    }
    return { version: 25, release: DATA_RELEASE, titleByCategory };
  }

  function loadGroups() {
    if (!groupsPromise) {
      groupsPromise = Promise.all([fetchRequired(GROUPS_URL), loadDelta()])
        .then(([groupsData, delta]) => {
          if (!groupsData || !Array.isArray(groupsData.groups)) {
            throw new Error('母故事清单格式无效。');
          }
          return applyDeltaToGroups(groupsData, delta);
        })
        .catch((error) => {
          console.error('V25 完整中文标题载入失败。', error);
          throw error;
        });
    }
    return groupsPromise;
  }

  function loadServerMap() {
    return loadGroups().then(buildExactMap);
  }

  function readLocalPayload() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : { version: 1, overrides: [] };
    } catch {
      return { version: 1, overrides: [] };
    }
  }

  function writeLocalPayload(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function normalizeOverrideList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.overrides)) return payload.overrides;
    if (Array.isArray(payload?.groups)) {
      return payload.groups
        .filter((item) => String(item?.approved_translation || '').trim())
        .map((item) => ({
          group_id: item.group_id,
          category: item.category,
          source_base: item.source_base,
          source_sha256: item.source_sha256,
          approved_translation: item.approved_translation
        }));
    }
    return [];
  }

  function validateAndIndex(groupsData, payload, strict = true) {
    const groups = new Map(groupsData.groups.map((group) => [group.group_id, group]));
    const overrides = new Map();
    const errors = [];
    for (const raw of normalizeOverrideList(payload)) {
      const groupId = String(raw?.group_id || '').trim();
      const approved = String(raw?.approved_translation || '').trim();
      if (!groupId || !approved) continue;
      const group = groups.get(groupId);
      if (!group) { errors.push(`不存在的 group_id：${groupId}`); continue; }
      for (const [key, expected] of [
        ['category', group.category],
        ['source_base', group.source_base],
        ['source_sha256', group.source_sha256]
      ]) {
        if (raw[key] != null && String(raw[key]) !== String(expected)) {
          errors.push(`${groupId} 的 ${key} 与当前清单不一致。`);
        }
      }
      if (overrides.has(groupId)) errors.push(`重复 group_id：${groupId}`);
      overrides.set(groupId, {
        group_id: groupId,
        category: group.category,
        source_base: group.source_base,
        source_sha256: group.source_sha256,
        approved_translation: approved
      });
    }
    if (strict && errors.length) throw new Error(errors.slice(0, 12).join('\n'));
    return { groups, overrides, errors };
  }

  function compose(group, child, override) {
    if (!override) return String(child.current_full_translation || '').trim();
    const base = String(override.approved_translation || '').trim();
    const suffix = String(child.localized_suffix ?? child.source_suffix ?? '').trim();
    return `${base}${suffix ? ` ${suffix}` : ''}`.trim();
  }

  function exactMapFrom(groupsData, payload, strict = true) {
    const { overrides, errors } = validateAndIndex(groupsData, payload, strict);
    const titleByCategory = {};
    for (const group of groupsData.groups) {
      const override = overrides.get(group.group_id);
      const categoryMap = titleByCategory[group.category] || (titleByCategory[group.category] = {});
      for (const child of group.children || []) {
        const source = String(child.source_title || '').trim();
        if (source) categoryMap[source] = compose(group, child, override);
      }
    }
    return { release: RELEASE, version: 25, titleByCategory, errors };
  }

  function mergeCategoryMaps(...maps) {
    const output = {};
    for (const source of maps) {
      if (!source || typeof source !== 'object') continue;
      for (const [category, pairs] of Object.entries(source)) {
        if (!pairs || typeof pairs !== 'object') continue;
        output[category] = Object.assign(output[category] || {}, pairs);
      }
    }
    return output;
  }

  function loadMergedLocalization() {
    if (!mergedPromise) {
      mergedPromise = Promise.all([originalLoad(), loadGroups(), loadServerMap()])
        .then(([localization, groupsData, serverMap]) => {
          let localMap = { titleByCategory: {} };
          try { localMap = exactMapFrom(groupsData, readLocalPayload(), true); }
          catch (error) { console.error('浏览器中的母故事译名未应用。', error); }
          return {
            ...localization,
            release: DATA_RELEASE,
            titleByCategoryV10: mergeCategoryMaps(
              localization?.titleByCategoryV10,
              serverMap.titleByCategory,
              localMap.titleByCategory
            ),
            storyTitleGroupsV1: groupsData,
            storyTitleMapV1: serverMap
          };
        });
    }
    return mergedPromise;
  }

  function refresh() {
    mergedPromise = null;
    global.dispatchEvent(new CustomEvent('story-title-map-v1-updated'));
  }

  async function importPayload(payload, { persist = true, strict = true } = {}) {
    const groupsData = await loadGroups();
    const indexed = validateAndIndex(groupsData, payload, strict);
    const normalized = {
      version: 25,
      release: RELEASE,
      checklist_generated_at: groupsData.generatedAt || '',
      overrides: [...indexed.overrides.values()].sort((a, b) => a.group_id.localeCompare(b.group_id))
    };
    if (persist) writeLocalPayload(normalized);
    refresh();
    return { payload: normalized, map: exactMapFrom(groupsData, normalized, strict), warnings: indexed.errors };
  }

  function clearLocalOverrides() {
    localStorage.removeItem(STORAGE_KEY);
    refresh();
    return Promise.resolve();
  }

  const api = Object.freeze({
    release: RELEASE,
    groupsUrl: GROUPS_URL,
    mapUrl: PART_URLS[0],
    storageKey: STORAGE_KEY,
    loadGroups,
    loadServerMap,
    readLocalPayload,
    importPayload,
    clearLocalOverrides,
    exactMapFrom,
    compose,
    refresh
  });

  global.MagiToolsV7 = Object.freeze({ ...Tools, loadLocalizationV7: loadMergedLocalization });
  global.__STORY_TITLE_RUNTIME_V1__ = api;
  document.documentElement.dataset.storyTitleRuntimeV2 = RELEASE;
})(window);
