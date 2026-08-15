/* Chinese, responsive frontend for the existing Magia Record story-search data service. */
(function (global) {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbz7rqYmZAcY-Cu0QG_XfcqH1JfRrgZXLkk7XRhU2Df7VYNNbOMBwwqrKdcqQQmokndm/exec';
  const STORY_TYPES = [
    'メイン【第1部】', 'メイン【第2部】',
    'アナザー【第1部】', 'アナザー【第2部】',
    '魔法少女', '衣装', 'ミラーズ', 'イベント',
    'バトルミュージアム', 'スペシャル', 'EDムービー',
    'アニメ【1st】', 'アニメ【2nd】', 'アニメ【Final】'
  ];
  const STORAGE_KEY = 'magireco-story-search-v5';
  const Tools = global.MagiTools;
  if (!Tools) return;

  const nodes = {};
  let catalog = [];
  let searchSerial = 0;

  function cacheNodes() {
    for (const id of [
      'storyTypeOptions', 'storySelectAll', 'storyClearTypes', 'storySpoiler', 'storyVariants',
      'storyKeyword', 'storyCharacterFilter', 'storySelectedSummary', 'storyClearCharacters',
      'storyCharacterCount', 'storyCharacterGrid', 'storySearchButton', 'storyResetButton',
      'storyStatus', 'storyResults', 'storyResultsBody'
    ]) nodes[id] = document.getElementById(id);
  }

  function renderStoryTypes() {
    nodes.storyTypeOptions.innerHTML = '';
    for (const value of STORY_TYPES) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'storyType';
      input.value = value;
      input.checked = true;
      label.append(input, document.createTextNode(Tools.storyLabel(value)));
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
    if (!catalog.length) return;
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
    const types = new Set(Array.isArray(state.types) ? state.types : STORY_TYPES);
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

  async function renderResults(outdata, types, showSpoiler) {
    const wrapper = document.createElement('div');
    let total = 0;

    for (const storyType of types) {
      const rows = Array.isArray(outdata?.[storyType]) ? outdata[storyType] : [];
      total += rows.length;
      const group = document.createElement('section');
      group.className = 'suite-result-group';
      const heading = document.createElement('h3');
      heading.textContent = `${Tools.storyLabel(storyType)}（${rows.length} 条）`;
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
          const tr = document.createElement('tr');
          const storyCell = document.createElement('td');
          storyCell.className = 'resultStory';
          const titleRaw = textFromMarkup(row?.[0] ?? '');
          const searchTitle = /イベント|スペシャル|魔法少女|衣装/.test(storyType)
            ? titleRaw
            : `${Tools.storyLabel(storyType)} ${titleRaw}`;
          const link = document.createElement('a');
          link.href = `https://www.google.com/search?q=${encodeURIComponent(`魔法纪录 故事 ${searchTitle}`)}&tbm=vid`;
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
    summary.textContent = `共找到 ${total} 条故事记录。点击故事名可打开视频搜索。`;
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
    Tools.setStatus(nodes.storyStatus, Tools.loadingMarkup('正在查询故事数据…'));
    nodes.storyResultsBody.innerHTML = `<div class="suite-notice">${Tools.loadingMarkup('正在加载结果…')}</div>`;
    Tools.smoothScrollTo(nodes.storyResults);

    const params = new URLSearchParams({
      and_or: selectedLogic(),
      story_csv: types.join(','),
      netabare: String(showSpoiler),
      chara_csv: selected.map((entry) => entry.jp).join(','),
      star: String(nodes.storyVariants.checked),
      keywordtext: keyword
    });

    try {
      const data = await Tools.fetchJson(`${API_URL}?${params.toString()}`, { cache: 'no-store' }, 45000);
      if (serial !== searchSerial) return;
      await renderResults(data, types, showSpoiler);
      Tools.setStatus(nodes.storyStatus, `查询完成：${selected.length ? `已选 ${selected.length} 名角色` : '仅按关键词'}。`, 'success');
      Tools.smoothScrollTo(nodes.storyResults);
    } catch (error) {
      if (serial !== searchSerial) return;
      console.error(error);
      Tools.setStatus(nodes.storyStatus, `故事数据获取失败：${Tools.escapeHtml(error.message || error)}。请稍后重试。`, 'error');
      nodes.storyResultsBody.innerHTML = '<div class="suite-notice">未能取得远程故事数据；角色选择和中文映射没有丢失。</div>';
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
    renderStoryTypes();
    bindEvents();
    try {
      catalog = await Tools.loadCatalog();
      renderCharacters();
      restoreState();
      Tools.setStatus(nodes.storyStatus, '角色目录已就绪。请选择角色和故事类型。', 'success');
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.storyStatus, Tools.escapeHtml(error.message || error), 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
