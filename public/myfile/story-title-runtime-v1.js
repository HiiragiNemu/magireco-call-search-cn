/* Parent-title checklist runtime: exact category+full-title mapping only. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-runtime-v1-20260818';
  const GROUPS_URL = './data/story-title-groups-v1.json';
  const MAP_URL = './data/story-title-map.generated.json';
  const STORAGE_KEY = 'magireco-story-title-overrides-v1';
  const Tools = global.MagiToolsV7;
  if (!Tools?.loadLocalizationV7) return;

  const originalLoad = Tools.loadLocalizationV7.bind(Tools);
  let groupsPromise = null;
  let serverMapPromise = null;
  let mergedPromise = null;

  function fetchOptional(url) {
    return fetch(url, { cache: 'no-cache' }).then((response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${url}：HTTP ${response.status}`);
      return response.json();
    });
  }

  function loadGroups() {
    if (!groupsPromise) {
      groupsPromise = fetchOptional(GROUPS_URL).then((data) => {
        if (!data || data.version !== 1 || !Array.isArray(data.groups)) return { version: 1, groups: [], summary: {} };
        return data;
      }).catch((error) => {
        console.warn('母故事清单未就绪。', error);
        return { version: 1, groups: [], summary: {} };
      });
    }
    return groupsPromise;
  }

  function loadServerMap() {
    if (!serverMapPromise) {
      serverMapPromise = fetchOptional(MAP_URL).then((data) => {
        if (!data || data.version !== 1 || typeof data.titleByCategory !== 'object') return { version: 1, titleByCategory: {} };
        return data;
      }).catch((error) => {
        console.warn('母故事精确映射未就绪。', error);
        return { version: 1, titleByCategory: {} };
      });
    }
    return serverMapPromise;
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

  function effectiveTitle(group, override) {
    const approved = String(override?.approved_translation || '').trim();
    return approved || String(group.current_translation || group.source_base || '').trim();
  }

  function localizedSuffix(child) {
    const value = String(child.localized_suffix ?? child.source_suffix ?? '').trim();
    return value;
  }

  function compose(group, child, override) {
    const base = effectiveTitle(group, override);
    const suffix = localizedSuffix(child);
    return `${base}${suffix ? ` ${suffix}` : ''}`.trim();
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
          approved_translation: item.approved_translation,
          status: item.status || '已校对',
          note: item.note || ''
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
      if (!group) {
        errors.push(`不存在的 group_id：${groupId}`);
        continue;
      }
      const checks = [
        ['category', group.category],
        ['source_base', group.source_base],
        ['source_sha256', group.source_sha256]
      ];
      for (const [key, expected] of checks) {
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
        approved_translation: approved,
        status: String(raw.status || '已校对'),
        note: String(raw.note || '')
      });
    }
    if (strict && errors.length) throw new Error(errors.slice(0, 12).join('\n'));
    return { groups, overrides, errors };
  }

  function exactMapFrom(groupsData, payload, strict = true) {
    const { overrides, errors } = validateAndIndex(groupsData, payload, strict);
    const titleByCategory = {};
    for (const group of groupsData.groups) {
      const override = overrides.get(group.group_id) || null;
      if (!titleByCategory[group.category]) titleByCategory[group.category] = {};
      for (const child of group.children || []) {
        const full = String(child.source_title || '').trim();
        if (!full) continue;
        if (Object.prototype.hasOwnProperty.call(titleByCategory[group.category], full)) {
          throw new Error(`重复完整原题：${group.category} / ${full}`);
        }
        titleByCategory[group.category][full] = compose(group, child, override);
      }
    }
    return { release: RELEASE, version: 1, titleByCategory, errors };
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

  async function loadMergedLocalization() {
    if (!mergedPromise) {
      mergedPromise = Promise.all([originalLoad(), loadGroups(), loadServerMap()]).then(([localization, groupsData, serverMap]) => {
        let localMap = { titleByCategory: {} };
        try {
          localMap = exactMapFrom(groupsData, readLocalPayload(), true);
        } catch (error) {
          console.error('浏览器中的母故事译名未应用。', error);
        }
        return {
          ...localization,
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
      version: 1,
      release: RELEASE,
      checklist_generated_at: groupsData.generatedAt || '',
      overrides: [...indexed.overrides.values()].sort((a, b) => a.group_id.localeCompare(b.group_id))
    };
    if (persist) writeLocalPayload(normalized);
    refresh();
    return { payload: normalized, map: exactMapFrom(groupsData, normalized, strict), warnings: indexed.errors };
  }

  async function clearLocalOverrides() {
    localStorage.removeItem(STORAGE_KEY);
    refresh();
  }

  const runtimeApi = Object.freeze({
    release: RELEASE,
    groupsUrl: GROUPS_URL,
    mapUrl: MAP_URL,
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
  global.__STORY_TITLE_RUNTIME_V1__ = runtimeApi;
  document.documentElement.dataset.storyTitleRuntimeV1 = RELEASE;
})(window);
