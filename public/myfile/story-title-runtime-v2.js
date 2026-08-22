/* V26 authoritative Chinese title runtime.
 * Loads ordinary JSON and never lets title enhancement failure disable core story search. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-runtime-v26-20260822';
  const DATA_RELEASE = 'v26-converged-20260822';
  const VERSION = '20260822-v26-final3';
  const GROUPS_URL = `./data/story-title-groups-v1.json?v=${VERSION}`;
  const MANIFEST_URL = `./data/titles/manifest.json?v=${VERSION}`;
  const PARENTS_URL = `./data/titles/parents.json?v=${VERSION}`;
  const SUFFIXES_URL = `./data/titles/suffixes.json?v=${VERSION}`;
  const TITLES_URL = `./data/titles/titles.json?v=${VERSION}`;
  const STORAGE_PREFIX = 'magireco-story-title-overrides:';
  const STORAGE_KEY = `${STORAGE_PREFIX}${DATA_RELEASE}`;
  const LEGACY_STORAGE_KEYS = ['magireco-story-title-overrides-v1'];

  const Tools = global.MagiToolsV7;
  if (!Tools?.loadLocalizationV7) {
    console.error('V26 标题运行时未找到 MagiToolsV7。');
    return;
  }

  const originalLoad = Tools.loadLocalizationV7.bind(Tools);
  let formalPromise = null;
  let groupsPromise = null;
  let mergedPromise = null;

  async function fetchJsonStrict(url, label) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${label}：HTTP ${response.status}`);
    const text = await response.text();
    if (/^\s*</u.test(text)) throw new Error(`${label}返回了 HTML，而不是 JSON。`);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`${label}不是有效 JSON：${error.message}`);
    }
  }

  function validateRelease(payload, label) {
    if (!payload || payload.release !== DATA_RELEASE) {
      throw new Error(`${label}数据版本不一致。`);
    }
    return payload;
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function loadFormalData() {
    if (!formalPromise) {
      formalPromise = Promise.all([
        fetchJsonStrict(MANIFEST_URL, '标题清单'),
        fetchJsonStrict(PARENTS_URL, '母标题'),
        fetchJsonStrict(SUFFIXES_URL, '后缀'),
        fetchJsonStrict(TITLES_URL, '完整标题')
      ]).then(([manifest, parents, suffixes, titles]) => {
        validateRelease(manifest, '标题清单');
        validateRelease(parents, '母标题');
        validateRelease(suffixes, '后缀');
        validateRelease(titles, '完整标题');
        if (manifest.dataArchitecture !== 'plain-json') {
          throw new Error('标题清单不是 plain-json 架构。');
        }
        if (!parents.parentByCategory || !suffixes.suffixBySource || !titles.titleByCategory) {
          throw new Error('正式标题数据结构不完整。');
        }
        return { manifest, parents, suffixes, titles };
      });
    }
    return formalPromise;
  }

  function applyFormalData(groupsData, formal) {
    const parentByCategory = formal.parents.parentByCategory || {};
    const suffixBySource = formal.suffixes.suffixBySource || {};
    const titleByCategory = formal.titles.titleByCategory || {};

    for (const group of groupsData.groups || []) {
      const category = String(group.category || '');
      const sourceBase = String(group.source_base || '');
      const parent = String(
        parentByCategory[category]?.[sourceBase]
        || group.approved_translation
        || group.current_translation
        || sourceBase
      ).trim();
      group.current_translation = parent;
      group.approved_translation = parent;

      for (const child of group.children || []) {
        const sourceTitle = String(child.source_title || '');
        const sourceSuffix = String(child.source_suffix || '');
        const suffix = own(suffixBySource, sourceSuffix)
          ? String(suffixBySource[sourceSuffix] ?? '').trim()
          : String(child.localized_suffix ?? sourceSuffix).trim();
        const target = String(
          titleByCategory[category]?.[sourceTitle]
          || `${parent}${suffix ? ` ${suffix}` : ''}`
        ).trim();
        child.localized_suffix = suffix;
        child.localized_joiner = suffix ? ' ' : '';
        child.current_full_translation = target;
      }
    }

    groupsData.release = DATA_RELEASE;
    groupsData.version = 26;
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

  function loadGroups() {
    if (!groupsPromise) {
      groupsPromise = Promise.all([
        fetchJsonStrict(GROUPS_URL, '母故事清单'),
        loadFormalData()
      ]).then(([groupsData, formal]) => {
        if (!groupsData || !Array.isArray(groupsData.groups)) {
          throw new Error('母故事清单格式无效。');
        }
        return applyFormalData(groupsData, formal);
      });
    }
    return groupsPromise;
  }

  function loadServerMap() {
    return loadFormalData().then((formal) => ({
      version: 26,
      release: DATA_RELEASE,
      titleByCategory: formal.titles.titleByCategory || {}
    }));
  }

  function emptyLocalPayload() {
    return { version: 26, release: DATA_RELEASE, overrides: [] };
  }

  function readLocalPayload() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.release !== DATA_RELEASE || !Array.isArray(parsed.overrides)) {
        return emptyLocalPayload();
      }
      return parsed;
    } catch {
      return emptyLocalPayload();
    }
  }

  function writeLocalPayload(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...payload,
      version: 26,
      release: DATA_RELEASE
    }));
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
      if (!group) {
        errors.push(`不存在的 group_id：${groupId}`);
        continue;
      }
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
    return { overrides, errors };
  }

  function compose(group, child, override) {
    if (!override) return String(child.current_full_translation || '').trim();
    const base = String(override.approved_translation || '').trim();
    const suffix = String(child.localized_suffix ?? '').trim();
    return `${base}${suffix ? ` ${suffix}` : ''}`.trim();
  }

  function exactMapFrom(groupsData, payload, strict = true) {
    const { overrides, errors } = validateAndIndex(groupsData, payload, strict);
    const titleByCategory = {};
    for (const group of groupsData.groups) {
      const categoryMap = titleByCategory[group.category]
        || (titleByCategory[group.category] = {});
      const override = overrides.get(group.group_id);
      for (const child of group.children || []) {
        const source = String(child.source_title || '').trim();
        if (source) categoryMap[source] = compose(group, child, override);
      }
    }
    return { release: DATA_RELEASE, version: 26, titleByCategory, errors };
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
      mergedPromise = originalLoad().then(async (localization) => {
        try {
          const [groupsData, serverMap] = await Promise.all([loadGroups(), loadServerMap()]);
          let localMap = { titleByCategory: {} };
          try {
            localMap = exactMapFrom(groupsData, readLocalPayload(), true);
          } catch (error) {
            console.error('当前发布版本的本地母标题修改未应用。', error);
          }
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
        } catch (error) {
          console.error('V26 标题增强载入失败；核心故事搜索继续使用基础本地化。', error);
          global.dispatchEvent(new CustomEvent('story-title-runtime-error', {
            detail: { message: String(error?.message || error) }
          }));
          return {
            ...localization,
            storyTitleRuntimeError: String(error?.message || error)
          };
        }
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
    const normalizedInput = { ...payload, release: DATA_RELEASE };
    const indexed = validateAndIndex(groupsData, normalizedInput, strict);
    const normalized = {
      version: 26,
      release: DATA_RELEASE,
      checklist_generated_at: groupsData.generatedAt || '',
      overrides: [...indexed.overrides.values()]
        .sort((a, b) => a.group_id.localeCompare(b.group_id))
    };
    if (persist) writeLocalPayload(normalized);
    refresh();
    return {
      payload: normalized,
      map: exactMapFrom(groupsData, normalized, strict),
      warnings: indexed.errors
    };
  }

  function clearLocalOverrides() {
    localStorage.removeItem(STORAGE_KEY);
    refresh();
    return Promise.resolve();
  }

  const api = Object.freeze({
    release: RELEASE,
    dataRelease: DATA_RELEASE,
    groupsUrl: GROUPS_URL,
    mapUrl: TITLES_URL,
    storageKey: STORAGE_KEY,
    ignoredLegacyStorageKeys: LEGACY_STORAGE_KEYS,
    loadGroups,
    loadServerMap,
    readLocalPayload,
    importPayload,
    clearLocalOverrides,
    exactMapFrom,
    compose,
    refresh
  });

  global.MagiToolsV7 = Object.freeze({
    ...Tools,
    loadLocalizationV7: loadMergedLocalization
  });
  global.__STORY_TITLE_RUNTIME_V1__ = api;
  document.documentElement.dataset.storyTitleRuntimeV2 = RELEASE;
})(window);
