/* Chinese frontend for the existing co-appearance count service. */
(function (global) {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbyXrQPl-k-SPUxM4MFHkdlFgHQp3kUp7p3iZgaTIc4Hbu8_lghESfjjLOjFPJXTDGbd/exec';
  const Tools = global.MagiTools;
  if (!Tools) return;

  const nodes = {};
  let catalog = [];
  let selected = null;
  let requestSerial = 0;

  function cacheNodes() {
    for (const id of [
      'attendanceFilter', 'attendanceSelected', 'attendanceClear', 'attendanceCharacterCount',
      'attendanceGrid', 'attendanceStatus', 'attendanceResults', 'attendanceResultsBody'
    ]) nodes[id] = document.getElementById(id);
  }

  function updateCount() {
    const cards = [...nodes.attendanceGrid.querySelectorAll('.suite-character-card')];
    const visible = cards.filter((card) => !card.hidden).length;
    Tools.setStatus(nodes.attendanceCharacterCount, `角色目录：显示 ${visible}/${cards.length} 名。`);
  }

  function updateSelection() {
    nodes.attendanceSelected.innerHTML = '';
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
    nodes.attendanceGrid.innerHTML = '';
    for (const entry of catalog) {
      const card = Tools.createCharacterCard(entry);
      card.addEventListener('click', () => {
        setSelected(entry);
        loadRanking(entry);
      });
      nodes.attendanceGrid.appendChild(card);
    }
    updateCount();
  }

  async function resolveResult(row) {
    const jp = String(row?.[0] ?? '').trim();
    const value = Number(row?.[1] ?? 0);
    const entry = await Tools.resolveCharacter(jp);
    return {
      jp,
      zh: entry?.zh || Tools.canonicalDisplay(jp),
      image: entry || Tools.canonicalDisplay(jp),
      value: Number.isFinite(value) ? value : 0
    };
  }

  async function renderRanking(source, output) {
    const resolved = [];
    for (const row of Array.isArray(output) ? output : []) {
      if (!Array.isArray(row) || row.length < 2) continue;
      resolved.push(await resolveResult(row));
    }
    resolved.sort((a, b) => b.value - a.value || a.zh.localeCompare(b.zh, 'zh-CN'));

    nodes.attendanceResultsBody.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'suite-status';
    header.dataset.kind = 'success';
    header.textContent = resolved.length
      ? `${source.zh}：共取得 ${resolved.length} 名共同出场角色。`
      : `${source.zh}：没有返回排行数据。`;
    nodes.attendanceResultsBody.appendChild(header);

    if (!resolved.length) return;
    const max = Math.max(1, ...resolved.map((item) => item.value));
    const list = document.createElement('div');
    list.className = 'attendance-result';

    resolved.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'attendance-row';
      const person = document.createElement('div');
      person.className = 'attendance-person';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = Tools.imageUrl(item.image);
      img.alt = item.zh;
      Tools.attachImageFallback(img);
      const label = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `${index + 1}. ${item.zh}`;
      const small = document.createElement('small');
      small.textContent = item.jp === item.zh ? '' : item.jp;
      label.append(strong, document.createElement('br'), small);
      person.append(img, label);

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
    Tools.setStatus(nodes.attendanceStatus, Tools.loadingMarkup(`正在查询 ${entry.zh} 的共同出场数据…`));
    nodes.attendanceResultsBody.innerHTML = `<div class="suite-notice">${Tools.loadingMarkup('正在生成排行…')}</div>`;
    Tools.smoothScrollTo(nodes.attendanceResults);
    try {
      const params = new URLSearchParams({ gname: entry.jp });
      const data = await Tools.fetchJson(`${API_URL}?${params.toString()}`, { cache: 'no-store' }, 40000);
      if (serial !== requestSerial) return;
      await renderRanking(entry, data);
      Tools.setStatus(nodes.attendanceStatus, `${entry.zh} 的排行已生成。`, 'success');
      Tools.smoothScrollTo(nodes.attendanceResults);
    } catch (error) {
      if (serial !== requestSerial) return;
      console.error(error);
      Tools.setStatus(nodes.attendanceStatus, `共同出场数据获取失败：${Tools.escapeHtml(error.message || error)}。`, 'error');
      nodes.attendanceResultsBody.innerHTML = '<div class="suite-notice">远程排行数据暂时不可用；本站角色中文映射不受影响。</div>';
    }
  }

  function clearAll() {
    ++requestSerial;
    selected = null;
    for (const card of nodes.attendanceGrid.querySelectorAll('.suite-character-card')) card.setAttribute('aria-pressed', 'false');
    updateSelection();
    nodes.attendanceResultsBody.innerHTML = '<div class="suite-notice">尚未选择角色。</div>';
    Tools.setStatus(nodes.attendanceStatus, '已清除选择和排行。');
  }

  async function init() {
    cacheNodes();
    Tools.renderNav('attendance');
    nodes.attendanceFilter.addEventListener('input', () => {
      Tools.filterCharacterCards(nodes.attendanceGrid, nodes.attendanceFilter.value);
      updateCount();
    });
    nodes.attendanceClear.addEventListener('click', clearAll);

    try {
      catalog = await Tools.loadCatalog();
      renderCharacters();
      Tools.setStatus(nodes.attendanceStatus, '角色目录已就绪；点击角色即可生成排行。', 'success');
    } catch (error) {
      console.error(error);
      Tools.setStatus(nodes.attendanceStatus, Tools.escapeHtml(error.message || error), 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
