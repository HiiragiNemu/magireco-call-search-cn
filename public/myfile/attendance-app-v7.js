/* V7 co-appearance ranking with shared localization and attribute filters. */
(function (global) {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbyXrQPl-k-SPUxM4MFHkdlFgHQp3kUp7p3iZgaTIc4Hbu8_lghESfjjLOjFPJXTDGbd/exec';
  const Tools = global.MagiToolsV7;
  if (!Tools?.resolveCharacterV7) return;

  const nodes = {};
  let catalog = [];
  let selected = null;
  let requestSerial = 0;
  let attributeController = null;

  function cacheNodes() {
    for (const id of [
      'attendanceFilter', 'attendanceSelected', 'attendanceClear', 'attendanceCharacterCount',
      'attendanceGrid', 'attendanceStatus', 'attendanceResults', 'attendanceResultsBody'
    ]) nodes[id] = document.getElementById(id);
  }

  function updateCount() {
    const cards = [...nodes.attendanceGrid.querySelectorAll('.suite-character-card')];
    const visible = cards.filter((card) => !card.hidden).length;
    Tools.setStatus(nodes.attendanceCharacterCount, `显示 ${visible}/${cards.length} 名。`);
  }

  function updateSelection() {
    nodes.attendanceSelected.replaceChildren();
    if (!selected) {
      nodes.attendanceSelected.textContent = '尚未选择角色';
      return;
    }
    const chip = document.createElement('span');
    chip.className = 'suite-chip';
    chip.textContent = selected.zh;
    chip.title = selected.jp;
    nodes.attendanceSelected.appendChild(chip);
  }

  function setSelected(entry) {
    selected = entry;
    for (const card of nodes.attendanceGrid.querySelectorAll('.suite-character-card')) {
      card.setAttribute('aria-pressed', String(card.dataset.jp === entry.jp));
    }
    updateSelection();
  }

  function renderCharacters() {
    nodes.attendanceGrid.replaceChildren();
    for (const entry of catalog) {
      const card = Tools.createCharacterCard(entry);
      card.addEventListener('click', () => {
        setSelected(entry);
        loadRanking(entry);
      });
      nodes.attendanceGrid.appendChild(card);
    }
    const anchor = document.createElement('div');
    anchor.id = 'attendanceAttributeFilterV7';
    const filterField = nodes.attendanceFilter.closest('.suite-field');
    (filterField?.parentElement || nodes.attendanceGrid.parentElement).appendChild(anchor);
    attributeController = Tools.installAttributeFilterV7({
      grid: nodes.attendanceGrid,
      catalog,
      anchor,
      textInput: nodes.attendanceFilter,
      prefix: 'attendance'
    });
    nodes.attendanceGrid.addEventListener('suite-v7-filtered', updateCount);
    updateCount();
  }

  async function resolveResult(row) {
    const jp = String(row?.[0] ?? '').trim();
    const value = Number(row?.[1] ?? 0);
    const entry = await Tools.resolveCharacterV7(jp);
    return {
      jp,
      zh: entry?.zh || jp,
      image: entry?.image || '',
      value: Number.isFinite(value) ? value : 0
    };
  }

  function personImage(item) {
    if (!item.image) {
      const fallback = document.createElement('span');
      fallback.className = 'story-cast-fallback-v7';
      fallback.textContent = item.zh.slice(0, 1) || '?';
      return fallback;
    }
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = Tools.imageUrl({ image: item.image, zh: item.zh });
    img.alt = item.zh;
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'story-cast-fallback-v7';
      fallback.textContent = item.zh.slice(0, 1) || '?';
      img.replaceWith(fallback);
    }, { once: true });
    return img;
  }

  async function renderRanking(source, output) {
    const byName = new Map();
    for (const row of Array.isArray(output) ? output : []) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const item = await resolveResult(row);
      const key = item.zh;
      const previous = byName.get(key);
      if (!previous || item.value > previous.value) byName.set(key, item);
    }
    const resolved = [...byName.values()].sort((a, b) => b.value - a.value || a.zh.localeCompare(b.zh, 'zh-CN'));
    nodes.attendanceResultsBody.replaceChildren();
    if (!resolved.length) {
      const empty = document.createElement('div');
      empty.className = 'suite-notice';
      empty.textContent = '没有排行数据。';
      nodes.attendanceResultsBody.appendChild(empty);
      return;
    }
    const max = Math.max(1, ...resolved.map((item) => item.value));
    const list = document.createElement('div');
    list.className = 'attendance-result';
    resolved.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'attendance-row';
      const person = document.createElement('div');
      person.className = 'attendance-person';
      const label = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `${index + 1}. ${item.zh}`;
      label.appendChild(strong);
      person.append(personImage(item), label);
      const track = document.createElement('div');
      track.className = 'attendance-track';
      track.setAttribute('aria-label', `${item.zh}：${item.value} 话`);
      const bar = document.createElement('div');
      bar.className = 'attendance-bar';
      bar.style.width = `${Math.max(1.5, item.value / max * 100)}%`;
      track.appendChild(bar);
      const value = document.createElement('div');
      value.className = 'attendance-value';
      value.textContent = `${item.value}话`;
      row.append(person, track, value);
      list.appendChild(row);
    });
    nodes.attendanceResultsBody.appendChild(list);
  }

  async function loadRanking(entry) {
    const serial = ++requestSerial;
    Tools.setStatus(nodes.attendanceStatus, Tools.loadingMarkup(`正在查询 ${entry.zh}…`));
    nodes.attendanceResultsBody.innerHTML = `<div class="suite-notice">${Tools.loadingMarkup('正在生成排行…')}</div>`;
    Tools.scrollToTargetV7(nodes.attendanceResults);
    try {
      const params = new URLSearchParams({ gname: entry.jp });
      const data = await Tools.fetchJson(`${API_URL}?${params.toString()}`, { cache: 'no-store' }, 40000);
      if (serial !== requestSerial) return;
      await renderRanking(entry, data);
      Tools.setStatus(nodes.attendanceStatus, `${entry.zh} 的排行已生成。`, 'success');
      Tools.scrollToTargetV7(nodes.attendanceResults);
    } catch (error) {
      if (serial !== requestSerial) return;
      console.error(error);
      Tools.setStatus(nodes.attendanceStatus, `排行获取失败：${Tools.escapeHtml(error.message || error)}`, 'error');
      nodes.attendanceResultsBody.innerHTML = '<div class="suite-notice">排行服务暂时不可用，请稍后重试。</div>';
    }
  }

  function clearAll() {
    ++requestSerial;
    selected = null;
    nodes.attendanceGrid.querySelectorAll('.suite-character-card').forEach((card) => card.setAttribute('aria-pressed', 'false'));
    updateSelection();
    nodes.attendanceResultsBody.innerHTML = '<div class="suite-notice">尚未选择角色。</div>';
    Tools.setStatus(nodes.attendanceStatus, '已清除。');
  }

  async function init() {
    cacheNodes();
    Tools.renderNav('attendance');
    nodes.attendanceClear.addEventListener('click', clearAll);
    try {
      [catalog] = await Promise.all([Tools.loadCatalog(), Tools.loadLocalizationV7()]);
      renderCharacters();
      Tools.setStatus(nodes.attendanceStatus, '点击角色即可生成排行。');
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.attendanceStatus, `初始化失败：${Tools.escapeHtml(error.message || error)}`, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
