/* V7 local story search: responsive results, reader-grounded titles and character names. */
(function (global) {
  'use strict';

  const Tools = global.MagiToolsV7;
  if (!Tools?.loadLocalizationV7) return;
  const SpriteBridge = global.MagirecoStorySpriteBridge || null;

  const MANIFEST_URL = './data/story-v6/manifest.json';
  const VARIANT_URL = './data/story-v6/variant-map.json';
  const STORAGE_KEY = 'magireco-story-search-v7';
  const MAX_RENDERED_ROWS = 1800;
  const nodes = {};
  const categoryCache = new Map();
  let catalog = [];
  let manifest = null;
  let localization = null;
  let variantFamilies = new Map();
  let spriteCharacterIds = {};
  let storyGroupIds = new Map();
  let attributeController = null;
  let searchSerial = 0;

  function cacheNodes() {
    for (const id of [
      'storyTypeOptions', 'storySelectAll', 'storyClearTypes', 'storySpoiler', 'storyVariants',
      'storyKeyword', 'storyCharacterFilter', 'storySelectedSummary', 'storyClearCharacters',
      'storyCharacterCount', 'storyCharacterGrid', 'storySearchButton', 'storyResetButton',
      'storyStatus', 'storyResults', 'storyResultsBody'
    ]) nodes[id] = document.getElementById(id);
  }

  function categoryMeta(key) {
    return manifest?.categories?.find((entry) => entry.key === key) || null;
  }

  function categoryLabel(key) {
    return localization?.categoryLabels?.[key] || categoryMeta(key)?.label || Tools.storyLabel(key);
  }

  function buildStoryGroupIndex() {
    const index = new Map();
    for (const group of localization?.storyTitleGroupsV1?.groups || []) {
      for (const child of group.children || []) {
        const scenario = String(child.source_title || '').trim();
        if (scenario) index.set(`${group.category}\u0000${scenario}`, String(group.group_id || ''));
      }
    }
    storyGroupIds = index;
  }

  function storyBridgeContext(storyType, row) {
    const scenario = String(row?.[0] || '').trim();
    const story = storyGroupIds.get(`${storyType}\u0000${scenario}`) || '';
    return { story, scenario, renderer: 'cocos2d' };
  }

  function baseCharacterName(resolved) {
    return String(resolved?.variantOf || resolved?.jp || resolved?.raw || '')
      .replace(/[（(][^）)]*[）)]$/u, '')
      .trim();
  }

  function characterBridgeContext(resolved, storyContext) {
    const base = baseCharacterName(resolved);
    const catalogEntry = catalog.find((entry) => entry.jp === base || entry.jp === resolved?.jp) || null;
    const mapped = spriteCharacterIds[base] || spriteCharacterIds[resolved?.jp] || null;
    return {
      ...storyContext,
      characterId: mapped?.characterId || '',
      variant: mapped?.variant || '',
      character: catalogEntry?.roman || resolved?.jp || resolved?.raw || resolved?.zh || ''
    };
  }

  function orderedCategories() {
    const byKey = new Map(manifest.categories.map((entry) => [entry.key, entry]));
    const result = [];
    for (const key of localization.categoryOrder || []) {
      if (byKey.has(key)) {
        result.push(byKey.get(key));
        byKey.delete(key);
      }
    }
    result.push(...byKey.values());
    return result;
  }

  function renderStoryTypes() {
    nodes.storyTypeOptions.replaceChildren();
    for (const entry of orderedCategories()) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'storyType';
      input.value = entry.key;
      input.checked = true;
      label.title = `${entry.key} · ${entry.count.toLocaleString()} 条`;
      label.append(input, document.createTextNode(`${categoryLabel(entry.key)}（${entry.count.toLocaleString()}）`));
      nodes.storyTypeOptions.appendChild(label);
    }
  }

  function visibleCards() {
    return [...nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')].filter((card) => !card.hidden);
  }

  function updateCharacterCount() {
    const cards = [...nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')];
    const selected = cards.filter((card) => card.getAttribute('aria-pressed') === 'true').length;
    const visible = cards.filter((card) => !card.hidden).length;
    Tools.setStatus(nodes.storyCharacterCount, `显示 ${visible}/${cards.length} 名；已选 ${selected} 名。`);
  }

  function updateSelectedSummary() {
    const selected = Tools.selectedEntries(nodes.storyCharacterGrid, catalog);
    nodes.storySelectedSummary.replaceChildren();
    if (!selected.length) {
      nodes.storySelectedSummary.textContent = '尚未选择角色';
    } else {
      for (const entry of selected) {
        const chip = document.createElement('span');
        chip.className = 'suite-chip';
        chip.textContent = entry.zh;
        chip.title = entry.jp;
        nodes.storySelectedSummary.appendChild(chip);
      }
    }
    updateCharacterCount();
    saveState();
  }

  function renderCharacters() {
    nodes.storyCharacterGrid.replaceChildren();
    for (const entry of catalog) {
      const card = Tools.createCharacterCard(entry);
      card.addEventListener('click', () => {
        Tools.toggleCharacterCard(card);
        updateSelectedSummary();
      });
      nodes.storyCharacterGrid.appendChild(card);
    }
    const characterPanel = nodes.storyCharacterGrid.closest('.suite-panel');
    const filterField = nodes.storyCharacterFilter.closest('.suite-field');
    const anchor = document.createElement('div');
    anchor.id = 'storyAttributeFilterV7';
    (filterField?.parentElement || characterPanel).appendChild(anchor);
    attributeController = Tools.installAttributeFilterV7({
      grid: nodes.storyCharacterGrid,
      catalog,
      anchor,
      textInput: nodes.storyCharacterFilter,
      prefix: 'story'
    });
    nodes.storyCharacterGrid.addEventListener('suite-v7-filtered', updateCharacterCount);
    updateSelectedSummary();
  }

  function selectedTypes() {
    return [...nodes.storyTypeOptions.querySelectorAll('input[name="storyType"]:checked')].map((input) => input.value);
  }

  function selectedLogic() {
    return document.querySelector('input[name="storyLogic"]:checked')?.value || 'AND';
  }

  function saveState() {
    if (!catalog.length || !manifest) return;
    const selectedAttributes = [...document.querySelectorAll('#storyAttributeFilterV7 input[data-attribute-v7]:checked')]
      .map((input) => input.value);
    const state = {
      types: selectedTypes(),
      logic: selectedLogic(),
      spoiler: nodes.storySpoiler.checked,
      variants: nodes.storyVariants.checked,
      selected: Tools.selectedEntries(nodes.storyCharacterGrid, catalog).map((entry) => entry.jp),
      filter: nodes.storyCharacterFilter.value,
      keyword: nodes.storyKeyword.value,
      attributes: selectedAttributes,
      attributeLogic: document.querySelector('input[name="story-attribute-logic"]:checked')?.value || 'AND'
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* optional */ }
  }

  function restoreState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { state = null; }
    if (!state || typeof state !== 'object') return;
    const types = new Set(Array.isArray(state.types) ? state.types : manifest.categories.map((entry) => entry.key));
    for (const input of nodes.storyTypeOptions.querySelectorAll('input[name="storyType"]')) input.checked = types.has(input.value);
    const logic = document.querySelector(`input[name="storyLogic"][value="${CSS.escape(state.logic || 'AND')}"]`);
    if (logic) logic.checked = true;
    nodes.storySpoiler.checked = Boolean(state.spoiler);
    nodes.storyVariants.checked = state.variants !== false;
    nodes.storyCharacterFilter.value = String(state.filter || '');
    nodes.storyKeyword.value = String(state.keyword || '');
    const selected = new Set(Array.isArray(state.selected) ? state.selected : []);
    for (const card of nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')) {
      card.setAttribute('aria-pressed', String(selected.has(card.dataset.jp)));
    }
    const attrSet = new Set(Array.isArray(state.attributes) ? state.attributes : []);
    for (const input of document.querySelectorAll('#storyAttributeFilterV7 input[data-attribute-v7]')) input.checked = attrSet.has(input.value);
    const attrLogic = document.querySelector(`input[name="story-attribute-logic"][value="${CSS.escape(state.attributeLogic || 'AND')}"]`);
    if (attrLogic) attrLogic.checked = true;
    attributeController?.apply();
    updateSelectedSummary();
  }

  function resetAll() {
    for (const input of nodes.storyTypeOptions.querySelectorAll('input[name="storyType"]')) input.checked = true;
    const and = document.querySelector('input[name="storyLogic"][value="AND"]');
    if (and) and.checked = true;
    nodes.storySpoiler.checked = false;
    nodes.storyVariants.checked = true;
    nodes.storyKeyword.value = '';
    nodes.storyCharacterFilter.value = '';
    for (const card of nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')) card.setAttribute('aria-pressed', 'false');
    attributeController?.reset();
    updateSelectedSummary();
    Tools.setStatus(nodes.storyStatus, '已重置。');
    nodes.storyResultsBody.innerHTML = '<div class="suite-notice">尚未执行搜索。</div>';
  }

  function textFromMarkup(value) {
    const temp = document.createElement('div');
    temp.innerHTML = String(value ?? '').replace(/<BR\s*\/?>/gi, '\n');
    return (temp.textContent || '').replace(/\n+/g, ' ').trim();
  }

  function normalized(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ').trim();
  }

  function genericBaseName(value) {
    return String(value || '').normalize('NFKC')
      .replace(/[（(][^）)]*(?:ver|Ver|VER|衣装|水着|晴着|浴衣|クリスマス|ハロウィン|scene0|アニメ)[^）)]*[）)]$/u, '')
      .replace(/\s+/g, '').trim();
  }

  function buildFamilies(selected, includeVariants) {
    const catalogNames = catalog.map((entry) => entry.jp);
    return selected.map((entry) => {
      const names = new Set([entry.jp]);
      if (includeVariants) {
        for (const variant of variantFamilies.get(entry.jp) || []) names.add(variant);
        const base = genericBaseName(entry.jp);
        for (const candidate of catalogNames) {
          if (genericBaseName(candidate) === base || candidate.startsWith(`${entry.jp}(`) || candidate.startsWith(`${entry.jp}（`)) names.add(candidate);
        }
      }
      return { entry, names, base: genericBaseName(entry.jp) };
    });
  }

  function familyMatchesName(family, castName, includeVariants) {
    const raw = String(castName || '').normalize('NFKC').trim();
    if (family.names.has(raw)) return true;
    if (!includeVariants) return false;
    if (raw.startsWith(`${family.entry.jp}(`) || raw.startsWith(`${family.entry.jp}（`)) return true;
    return genericBaseName(raw) === family.base;
  }

  function rowMatches(row, families, logic, includeVariants, keywordTerms) {
    const cast = Array.isArray(row?.[1]) ? row[1] : [];
    const hits = families.map((family) => cast.some((name) => familyMatchesName(family, name, includeVariants)));
    let characterMatch = true;
    if (families.length) {
      if (logic === 'OR') characterMatch = hits.some(Boolean);
      else if (logic === 'EXCLUSIVE') characterMatch = hits.filter(Boolean).length === 1;
      else if (logic === 'ONLY') {
        characterMatch = hits.every(Boolean)
          && cast.every((name) => families.some((family) => familyMatchesName(family, name, includeVariants)));
      } else characterMatch = hits.every(Boolean);
    }
    if (!characterMatch) return false;
    if (!keywordTerms.length) return true;
    const haystack = normalized(`${textFromMarkup(row?.[0])} ${textFromMarkup(row?.[2])}`);
    return keywordTerms.every((term) => haystack.includes(term));
  }

  async function loadCategory(key) {
    if (!categoryCache.has(key)) {
      const meta = categoryMeta(key);
      if (!meta) throw new Error(`故事分类不存在：${key}`);
      categoryCache.set(key, Tools.fetchJson(`./data/story-v6/${meta.file}`, { cache: 'force-cache' }, 45000)
        .then((data) => {
          if (!data || data.key !== key || !Array.isArray(data.rows)) throw new Error(`${key} 数据无效。`);
          return data.rows;
        }));
    }
    return categoryCache.get(key);
  }

  function localizeTitle(storyType, raw) {
    const title = textFromMarkup(raw);
    const exact = localization.titleByCategoryV10?.[storyType]?.[title]
      || localization.titleExact?.[title];
    if (exact) return { display: exact, original: exact === title ? '' : title, translated: exact !== title };
    const prefix = (localization.titlePrefixes || []).find((item) => title === item.jp || title.startsWith(`${item.jp} `));
    if (prefix) {
      const suffix = title.slice(prefix.jp.length).trim();
      const display = `${prefix.zh}${suffix ? ` ${translateSafeSuffix(suffix)}` : ''}`;
      return { display, original: display === title ? '' : title, translated: display !== title };
    }
    return { display: title || '未命名故事', original: '', translated: false };
  }

  function translateSafeSuffix(suffix) {
    if (suffix === 'エンディング') return '结尾';
    if (suffix === 'プロローグ') return '序章';
    if (suffix === 'エピローグ') return '尾声';
    if (suffix === '序') return '序';
    const episode = suffix.match(/^(\d+)話$/u);
    if (episode) return `第${episode[1]}话`;
    const exact = localization.characters?.[suffix] || localization.charactersNormalized?.[suffix.normalize('NFKC').replace(/[\s　]+/g, '').replace('・', '·')];
    return exact?.zh || suffix;
  }

  function storyLink(storyType, row, displayTitle, originalTitle) {
    const source = String(row?.[3] || '').trim();
    if (/^https?:\/\//i.test(source)) return source;
    if (/^[A-Za-z0-9_-]{11}(?:[?&].*)?$/.test(source)) return `https://www.youtube.com/watch?v=${source}`;
    if (source.startsWith('/')) return `https://wiki.puella-magi.net${source}`;
    const query = originalTitle || displayTitle;
    return `https://www.google.com/search?q=${encodeURIComponent(`魔法纪录 ${query}`)}`;
  }

  async function renderCast(cast, storyContext) {
    const host = document.createElement('div');
    host.className = 'story-cast-v7';
    const seen = new Set();
    for (const rawName of Array.isArray(cast) ? cast : []) {
      const raw = String(rawName || '').trim();
      if (!raw) continue;
      const resolved = await Tools.resolveCharacterV7(raw);
      const key = `${resolved.zh}|${resolved.image || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const chip = Tools.createCastChipV7(resolved);
      host.appendChild(SpriteBridge
        ? SpriteBridge.wrapChip(chip, characterBridgeContext(resolved, storyContext))
        : chip);
    }
    if (!host.childElementCount) host.textContent = '—';
    return host;
  }

  async function renderResults(grouped, types, showSpoiler, totalMatches) {
    const wrapper = document.createElement('div');
    let rendered = 0;
    for (const storyType of types) {
      const rows = grouped.get(storyType) || [];
      if (!rows.length) continue;
      const group = document.createElement('section');
      group.className = 'suite-result-group';
      const heading = document.createElement('h3');
      heading.textContent = `${categoryLabel(storyType)}（${rows.length.toLocaleString()} 条）`;
      group.appendChild(heading);
      const list = document.createElement('div');
      list.className = 'story-result-list-v7';

      for (const row of rows) {
        if (rendered >= MAX_RENDERED_ROWS) break;
        rendered += 1;
        const titleInfo = localizeTitle(storyType, row?.[0]);
        const item = document.createElement('article');
        item.className = 'story-row-v7';
        const title = document.createElement('div');
        title.className = `story-title-v7${titleInfo.translated ? '' : ' story-untranslated-v7'}`;
        const link = document.createElement('a');
        link.href = storyLink(storyType, row, titleInfo.display, titleInfo.original);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = titleInfo.display;
        title.appendChild(link);
        if (titleInfo.original) {
          const original = document.createElement('small');
          original.className = 'story-title-original-v7';
          original.textContent = titleInfo.original;
          title.appendChild(original);
        }
        item.append(title, await renderCast(row?.[1], storyBridgeContext(storyType, row)));
        if (showSpoiler) {
          const summary = document.createElement('div');
          summary.className = 'story-summary-v7';
          summary.textContent = textFromMarkup(row?.[2]) || '—';
          item.appendChild(summary);
        }
        list.appendChild(item);
      }
      group.appendChild(list);
      wrapper.appendChild(group);
    }

    nodes.storyResultsBody.replaceChildren(wrapper);
    const summary = document.createElement('div');
    summary.className = 'suite-status';
    summary.dataset.kind = 'success';
    summary.textContent = totalMatches > MAX_RENDERED_ROWS
      ? `找到 ${totalMatches.toLocaleString()} 条；当前显示前 ${MAX_RENDERED_ROWS.toLocaleString()} 条。`
      : `找到 ${totalMatches.toLocaleString()} 条。`;
    nodes.storyResultsBody.prepend(summary);
    if (!wrapper.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'suite-notice';
      empty.textContent = '没有符合当前条件的故事。';
      nodes.storyResultsBody.appendChild(empty);
    }
  }

  async function searchStories() {
    const types = selectedTypes();
    const selected = Tools.selectedEntries(nodes.storyCharacterGrid, catalog);
    const keyword = nodes.storyKeyword.value.replace(/　/g, ' ').trim().replace(/\s+/g, ' ');
    if (!types.length) return Tools.setStatus(nodes.storyStatus, '请至少选择一种故事类型。', 'error');
    if (!selected.length && !keyword) return Tools.setStatus(nodes.storyStatus, '请选择角色或填写概要关键词。', 'error');

    const serial = ++searchSerial;
    const showSpoiler = nodes.storySpoiler.checked || Boolean(keyword);
    if (keyword) nodes.storySpoiler.checked = true;
    saveState();
    nodes.storySearchButton.disabled = true;
    Tools.setStatus(nodes.storyStatus, Tools.loadingMarkup('正在筛选…'));
    nodes.storyResultsBody.innerHTML = `<div class="suite-notice">${Tools.loadingMarkup('正在读取故事数据…')}</div>`;
    Tools.scrollToTargetV7(nodes.storyResults);

    const includeVariants = nodes.storyVariants.checked;
    const families = buildFamilies(selected, includeVariants);
    const keywordTerms = keyword.split(' ').filter(Boolean).map(normalized);
    const logic = selectedLogic();
    try {
      const datasets = await Promise.all(types.map(async (key) => [key, await loadCategory(key)]));
      if (serial !== searchSerial) return;
      const grouped = new Map();
      let total = 0;
      for (const [key, rows] of datasets) {
        const matches = rows.filter((row) => rowMatches(row, families, logic, includeVariants, keywordTerms));
        grouped.set(key, matches);
        total += matches.length;
      }
      await renderResults(grouped, types, showSpoiler, total);
      if (serial !== searchSerial) return;
      Tools.setStatus(nodes.storyStatus, `搜索完成：${total.toLocaleString()} 条。`, 'success');
      Tools.scrollToTargetV7(nodes.storyResults);
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.storyStatus, `搜索失败：${Tools.escapeHtml(error.message || error)}`, 'error');
      nodes.storyResultsBody.innerHTML = '<div class="suite-notice">数据读取失败，请刷新页面后重试。</div>';
    } finally {
      if (serial === searchSerial) nodes.storySearchButton.disabled = false;
    }
  }

  function bindEvents() {
    nodes.storySelectAll.addEventListener('click', () => {
      nodes.storyTypeOptions.querySelectorAll('input').forEach((input) => { input.checked = true; });
      saveState();
    });
    nodes.storyClearTypes.addEventListener('click', () => {
      nodes.storyTypeOptions.querySelectorAll('input').forEach((input) => { input.checked = false; });
      saveState();
    });
    nodes.storyClearCharacters.addEventListener('click', () => {
      nodes.storyCharacterGrid.querySelectorAll('.suite-character-card').forEach((card) => card.setAttribute('aria-pressed', 'false'));
      updateSelectedSummary();
    });
    nodes.storyCharacterFilter.addEventListener('input', updateCharacterCount);
    nodes.storySearchButton.addEventListener('click', searchStories);
    nodes.storyResetButton.addEventListener('click', resetAll);
    document.querySelectorAll('input[name="storyLogic"], #storySpoiler, #storyVariants').forEach((input) => input.addEventListener('change', saveState));
    nodes.storyTypeOptions.addEventListener('change', saveState);
    nodes.storyKeyword.addEventListener('change', saveState);
    nodes.storyKeyword.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); searchStories(); }
    });
  }

  async function init() {
    cacheNodes();
    Tools.renderNav('story');
    try {
      const spriteMapPromise = SpriteBridge
        ? SpriteBridge.loadCharacterMap().catch((error) => {
            console.error('战斗精灵角色映射不可用；链接继续使用角色名。', error);
            return {};
          })
        : Promise.resolve({});
      [catalog, manifest, localization, spriteCharacterIds] = await Promise.all([
        Tools.loadCatalog(),
        Tools.fetchJson(MANIFEST_URL, { cache: 'no-cache' }, 30000),
        Tools.loadLocalizationV7(),
        spriteMapPromise
      ]);
      if (!manifest?.categories?.length || manifest.totalRows < 10000) throw new Error('故事数据不完整。');
      const variants = await Tools.fetchJson(VARIANT_URL, { cache: 'no-cache' }, 30000);
      variantFamilies = new Map(Object.entries(variants?.families || {}));
      buildStoryGroupIndex();
      renderStoryTypes();
      renderCharacters();
      bindEvents();
      restoreState();
      Tools.setStatus(nodes.storyStatus, '请选择角色或填写关键词。');
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.storyStatus, `初始化失败：${Tools.escapeHtml(error.message || error)}`, 'error');
      nodes.storySearchButton.disabled = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
