/* Local, CORS-free story search backed by the original public complete JSON snapshot. */
(function (global) {
  'use strict';

  const MANIFEST_URL = './data/story-v6/manifest.json';
  const VARIANT_URL = './data/story-v6/variant-map.json';
  const STORAGE_KEY = 'magireco-story-search-v6';
  const MAX_RENDERED_ROWS = 1800;
  const Tools = global.MagiTools;
  if (!Tools) return;

  const nodes = {};
  const categoryCache = new Map();
  let catalog = [];
  let manifest = null;
  let variantFamilies = new Map();
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
    return categoryMeta(key)?.label || Tools.storyLabel(key);
  }

  function renderStoryTypes() {
    nodes.storyTypeOptions.innerHTML = '';
    for (const entry of manifest.categories) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'storyType';
      input.value = entry.key;
      input.checked = true;
      label.title = `${entry.key} · ${entry.count.toLocaleString()} 条`;
      label.append(input, document.createTextNode(`${entry.label}（${entry.count.toLocaleString()}）`));
      nodes.storyTypeOptions.appendChild(label);
    }
  }

  function updateCharacterCount() {
    const cards = [...nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')];
    const visible = cards.filter((card) => !card.hidden).length;
    const selected = cards.filter((card) => card.getAttribute('aria-pressed') === 'true').length;
    Tools.setStatus(nodes.storyCharacterCount, `角色目录：显示 ${visible}/${cards.length} 名；已选 ${selected} 名。`);
  }

  function updateSelectedSummary() {
    const selected = Tools.selectedEntries(nodes.storyCharacterGrid, catalog);
    nodes.storySelectedSummary.innerHTML = '';
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
    nodes.storyCharacterGrid.innerHTML = '';
    for (const entry of catalog) {
      const card = Tools.createCharacterCard(entry);
      card.addEventListener('click', () => {
        Tools.toggleCharacterCard(card);
        updateSelectedSummary();
      });
      nodes.storyCharacterGrid.appendChild(card);
    }
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
    const state = {
      types: selectedTypes(),
      logic: selectedLogic(),
      spoiler: nodes.storySpoiler.checked,
      variants: nodes.storyVariants.checked,
      selected: Tools.selectedEntries(nodes.storyCharacterGrid, catalog).map((entry) => entry.jp),
      filter: nodes.storyCharacterFilter.value,
      keyword: nodes.storyKeyword.value
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* optional */ }
  }

  function restoreState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { state = null; }
    if (!state || typeof state !== 'object') return;
    const allTypes = manifest.categories.map((entry) => entry.key);
    const types = new Set(Array.isArray(state.types) ? state.types : allTypes);
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
    Tools.filterCharacterCards(nodes.storyCharacterGrid, nodes.storyCharacterFilter.value);
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
    for (const card of nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')) {
      card.hidden = false;
      card.setAttribute('aria-pressed', 'false');
    }
    updateSelectedSummary();
    Tools.setStatus(nodes.storyStatus, '已重置全部条件。');
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
    return String(value || '')
      .normalize('NFKC')
      .replace(/[（(][^）)]*(?:ver|Ver|VER|衣装|水着|晴着|浴衣|クリスマス|ハロウィン|scene0|アニメ)[^）)]*[）)]$/u, '')
      .replace(/\s+/g, '')
      .trim();
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
    const familyHits = families.map((family) => cast.some((name) => familyMatchesName(family, name, includeVariants)));
    let characterMatch = true;
    if (families.length) {
      if (logic === 'OR') characterMatch = familyHits.some(Boolean);
      else if (logic === 'EXCLUSIVE') characterMatch = familyHits.filter(Boolean).length === 1;
      else if (logic === 'ONLY') {
        characterMatch = familyHits.every(Boolean)
          && cast.every((name) => families.some((family) => familyMatchesName(family, name, includeVariants)));
      } else characterMatch = familyHits.every(Boolean);
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
          if (!data || data.key !== key || !Array.isArray(data.rows)) throw new Error(`${key} 的本地故事数据格式无效。`);
          return data.rows;
        }));
    }
    return categoryCache.get(key);
  }

  async function castItem(name) {
    const raw = String(name || '').trim();
    const entry = await Tools.resolveCharacter(raw);
    const display = entry?.zh || Tools.canonicalDisplay(raw);
    const span = document.createElement('span');
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = Tools.imageUrl(entry || display);
    img.alt = display;
    Tools.attachImageFallback(img);
    const text = document.createElement('span');
    text.textContent = display;
    text.title = raw === display ? display : `${display}（${raw}）`;
    span.append(img, text);
    return span;
  }

  function storyLink(storyType, row, title) {
    const source = String(row?.[3] || '').trim();
    if (/^https?:\/\//i.test(source)) return source;
    if (/^[A-Za-z0-9_-]{11}(?:[?&].*)?$/.test(source)) return `https://www.youtube.com/watch?v=${source}`;
    if (source.startsWith('/')) return `https://wiki.puella-magi.net${source}`;
    const searchTitle = /イベント|スペシャル|魔法少女|衣装|メモリア|シール/u.test(storyType)
      ? title
      : `${categoryLabel(storyType)} ${title}`;
    return `https://www.google.com/search?q=${encodeURIComponent(`魔法纪录 ${searchTitle}`)}`;
  }

  async function renderResults(grouped, types, showSpoiler, totalMatches) {
    const wrapper = document.createElement('div');
    let rendered = 0;

    for (const storyType of types) {
      const rows = grouped.get(storyType) || [];
      const group = document.createElement('section');
      group.className = 'suite-result-group';
      const heading = document.createElement('h3');
      heading.textContent = `${categoryLabel(storyType)}（${rows.length.toLocaleString()} 条）`;
      group.appendChild(heading);

      if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'suite-notice';
        empty.textContent = '没有符合当前条件的数据。';
        group.appendChild(empty);
      } else {
        const table = document.createElement('table');
        table.className = 'suite-result-table';
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (const label of showSpoiler ? ['故事', '登场人物', '概要／剧透'] : ['故事', '登场人物']) {
          const th = document.createElement('th');
          th.textContent = label;
          headRow.appendChild(th);
        }
        head.appendChild(headRow);
        table.appendChild(head);
        const body = document.createElement('tbody');

        for (const row of rows) {
          if (rendered >= MAX_RENDERED_ROWS) break;
          rendered += 1;
          const tr = document.createElement('tr');
          const storyCell = document.createElement('td');
          storyCell.className = 'resultStory';
          const titleRaw = textFromMarkup(row?.[0] ?? '');
          const link = document.createElement('a');
          link.href = storyLink(storyType, row, titleRaw);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = titleRaw || '未命名故事';
          storyCell.appendChild(link);
          tr.appendChild(storyCell);

          const castCell = document.createElement('td');
          castCell.className = 'suite-cast';
          const cast = Array.isArray(row?.[1]) ? row[1] : [];
          for (const name of cast) castCell.appendChild(await castItem(name));
          if (!cast.length) castCell.textContent = '—';
          tr.appendChild(castCell);

          if (showSpoiler) {
            const spoilerCell = document.createElement('td');
            spoilerCell.className = 'suite-spoiler';
            spoilerCell.textContent = textFromMarkup(row?.[2] ?? '') || '—';
            tr.appendChild(spoilerCell);
          }
          body.appendChild(tr);
        }
        table.appendChild(body);
        group.appendChild(table);
      }
      wrapper.appendChild(group);
    }

    nodes.storyResultsBody.replaceChildren(wrapper);
    const summary = document.createElement('div');
    summary.className = 'suite-status';
    summary.dataset.kind = 'success';
    summary.textContent = totalMatches > MAX_RENDERED_ROWS
      ? `共找到 ${totalMatches.toLocaleString()} 条记录；为保证手机性能，当前显示前 ${MAX_RENDERED_ROWS.toLocaleString()} 条。`
      : `共找到 ${totalMatches.toLocaleString()} 条故事记录。数据来自本站保存的完整静态快照，不再请求 Google Apps Script。`;
    nodes.storyResultsBody.prepend(summary);
  }

  async function searchStories() {
    const types = selectedTypes();
    const selected = Tools.selectedEntries(nodes.storyCharacterGrid, catalog);
    const keyword = nodes.storyKeyword.value.replace(/　/g, ' ').trim().replace(/\s+/g, ' ');
    if (!types.length) {
      Tools.setStatus(nodes.storyStatus, '请至少选择一种故事类型。', 'error');
      return;
    }
    if (!selected.length && !keyword) {
      Tools.setStatus(nodes.storyStatus, '请至少选择一名角色，或填写概要关键词。', 'error');
      return;
    }

    const serial = ++searchSerial;
    const showSpoiler = nodes.storySpoiler.checked || Boolean(keyword);
    if (keyword) nodes.storySpoiler.checked = true;
    saveState();
    nodes.storySearchButton.disabled = true;
    Tools.setStatus(nodes.storyStatus, Tools.loadingMarkup('正在读取本站故事快照并筛选…'));
    nodes.storyResultsBody.innerHTML = `<div class="suite-notice">${Tools.loadingMarkup('正在加载本地故事数据…')}</div>`;
    Tools.smoothScrollTo(nodes.storyResults);

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
      Tools.setStatus(
        nodes.storyStatus,
        `筛选完成：${total.toLocaleString()} 条；快照共 ${manifest.totalRows.toLocaleString()} 条，生成于 ${manifest.generatedAt}。`,
        'success'
      );
      Tools.smoothScrollTo(nodes.storyResults);
    } catch (error) {
      if (serial !== searchSerial) return;
      console.error(error);
      Tools.setStatus(nodes.storyStatus, `本站故事快照读取失败：${Tools.escapeHtml(error.message || error)}。`, 'error');
      nodes.storyResultsBody.innerHTML = '<div class="suite-notice">本地数据文件未能载入。此版本不会退回到容易受跨域和网络限制影响的远程浏览器请求。</div>';
    } finally {
      if (serial === searchSerial) nodes.storySearchButton.disabled = false;
    }
  }

  function bindEvents() {
    nodes.storySelectAll.addEventListener('click', () => {
      for (const input of nodes.storyTypeOptions.querySelectorAll('input')) input.checked = true;
      saveState();
    });
    nodes.storyClearTypes.addEventListener('click', () => {
      for (const input of nodes.storyTypeOptions.querySelectorAll('input')) input.checked = false;
      saveState();
    });
    nodes.storyClearCharacters.addEventListener('click', () => {
      for (const card of nodes.storyCharacterGrid.querySelectorAll('.suite-character-card')) card.setAttribute('aria-pressed', 'false');
      updateSelectedSummary();
    });
    nodes.storyCharacterFilter.addEventListener('input', () => {
      Tools.filterCharacterCards(nodes.storyCharacterGrid, nodes.storyCharacterFilter.value);
      updateCharacterCount();
      saveState();
    });
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
    bindEvents();
    try {
      [catalog, manifest] = await Promise.all([
        Tools.loadCatalog(),
        Tools.fetchJson(MANIFEST_URL, { cache: 'no-cache' }, 30000)
      ]);
      if (!manifest || !Array.isArray(manifest.categories) || manifest.totalRows < 10000) {
        throw new Error('故事快照清单无效或不完整。');
      }
      const variantData = await Tools.fetchJson(VARIANT_URL, { cache: 'no-cache' }, 30000);
      variantFamilies = new Map(Object.entries(variantData?.families || {}));
      renderStoryTypes();
      renderCharacters();
      restoreState();
      Tools.setStatus(
        nodes.storyStatus,
        `本地完整故事快照已就绪：${manifest.totalRows.toLocaleString()} 条、${manifest.categories.length} 类。`,
        'success'
      );
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.storyStatus, Tools.escapeHtml(error.message || error), 'error');
      nodes.storySearchButton.disabled = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
