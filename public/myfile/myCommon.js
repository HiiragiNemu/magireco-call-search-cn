// Shared character-name and data-key utilities.
(function (global) {
    'use strict';

    const META_KEYS = new Set(['年龄', '年齢', '学年', '身高', '第一人称', '二人称']);

    function getCharacterCheckboxes() {
        return Array.from(document.querySelectorAll('input.MagicalChk[name="chara"], input[name="chara"]'));
    }

    function getDisplayShortName(fullName) {
        return String(fullName || '').replace(/\s+\(.+$/, '').trim();
    }

    function normalizeShortName(name) {
        return getDisplayShortName(name)
            .replace(/-眼镜ver$/u, '(眼镜ver)')
            .replace(/^名小姐$/u, '名字')
            .replace(/^水树塁$/u, '水树垒')
            .replace(/^早乙女老师$/u, '早乙女和子')
            .replace(/^鹿目詢子$/u, '鹿目询子')
            .trim();
    }

    function getJapaneseNameFromValue(value) {
        const match = String(value || '').match(/\(([^/()]+)\s*\/[^()]*\)\s*$/u);
        return match ? match[1].trim() : '';
    }

    function variantBelongsTo(versionedName, baseName) {
        const versioned = String(versionedName || '').trim();
        const base = String(baseName || '').trim();
        if (!versioned || !base) return false;
        return versioned === base ||
            versioned.startsWith(base + '(') ||
            versioned.startsWith(base + '（') ||
            versioned.startsWith(base + '-') ||
            versioned.startsWith(base + '・');
    }

    function canonicalFromCheckbox(checkbox) {
        return normalizeShortName(checkbox ? (checkbox.value || checkbox.id) : '');
    }

    function buildCheckboxIndex() {
        const byCanonical = new Map();
        const byId = new Map();
        for (const checkbox of getCharacterCheckboxes()) {
            const canonical = canonicalFromCheckbox(checkbox);
            if (canonical && !byCanonical.has(canonical)) byCanonical.set(canonical, checkbox);
            if (checkbox.id) byId.set(checkbox.id, checkbox);
        }
        return { byCanonical, byId };
    }

    function buildCallTableKeyIndex() {
        const result = new Map();
        if (typeof callTable === 'undefined' || !(callTable instanceof Map)) return result;
        for (const key of callTable.keys()) {
            const canonical = normalizeShortName(key);
            if (canonical && !result.has(canonical)) result.set(canonical, key);
        }
        return result;
    }

    function findCheckboxByAnyName(name) {
        const normalized = normalizeShortName(name);
        const index = buildCheckboxIndex();
        return index.byCanonical.get(normalized) || index.byId.get(String(name || '')) || null;
    }

    function findCallTableKey(name) {
        return buildCallTableKeyIndex().get(normalizeShortName(name)) || null;
    }

    function relationTargets(details) {
        const targets = new Set();
        if (!(details instanceof Map)) return targets;
        for (const key of details.keys()) {
            if (!META_KEYS.has(key)) targets.add(normalizeShortName(key));
        }
        return targets;
    }

    function buildCalledMap() {
        const result = new Map();
        if (typeof callTable === 'undefined' || !(callTable instanceof Map)) return result;
        for (const [callerKey, details] of callTable) {
            const caller = normalizeShortName(callerKey);
            for (const callee of relationTargets(details)) {
                if (!result.has(callee)) result.set(callee, new Set());
                result.get(callee).add(caller);
            }
        }
        return result;
    }

    global.MagirecoNameUtils = Object.freeze({
        META_KEYS,
        getCharacterCheckboxes,
        getDisplayShortName,
        normalizeShortName,
        getJapaneseNameFromValue,
        variantBelongsTo,
        canonicalFromCheckbox,
        buildCheckboxIndex,
        buildCallTableKeyIndex,
        findCheckboxByAnyName,
        findCallTableKey,
        relationTargets,
        buildCalledMap
    });

    // Legacy compatibility: unlike the translated display values, DOM ids are valid lookup keys.
    global.allnames = getCharacterCheckboxes().map((checkbox) => checkbox.id).filter(Boolean);
})(window);
