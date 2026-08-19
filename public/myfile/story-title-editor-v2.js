/* Dense single-page editor for parent-story display titles. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-dense-editor-v19-20260819';
  const Runtime = global.__STORY_TITLE_RUNTIME_V1__;
  const Tools = global.MagiTools || {};
  const nodes = {};
  let groupsData = { groups: [], summary: {} };
  let groupsById = new Map();
  let values = new Map();
  let baselines = new Map();
  let filterFrame = 0;

  const IDS = [
    'titleGroupSearch', 'titleCategoryFilter', 'titleOnlyChanged', 'titleEditorList',
    'titleEditorStatus', 'titleSaveLocal', 'titleClearLocal', 'titleImportFile',
    'titleExportOverridesJson', 'titleExportExactJson', 'titleExportCsv', 'titleExportXlsx',
    'titleTotalGroups', 'titleTotalChildren', 'titleEditedGroups', 'titleVisibleGroups'
  ];

  function cacheNodes() {
    for (const id of IDS) nodes[id] = document.getElementById(id);
  }

  function escapeHtml(value) {
    if (Tools.escapeHtml) return Tools.escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase('ja-JP')
      .replace(/[\s\u3000]+/g, '')
      .trim();
  }

  function setStatus(message, kind = 'info') {
    if (Tools.setStatus) Tools.setStatus(nodes.titleEditorStatus, message, kind);
    else if (nodes.titleEditorStatus) {
      nodes.titleEditorStatus.textContent = message;
      nodes.titleEditorStatus.dataset.kind = kind;
    }
  }

  function serverValue(group) {
    return String(
      group.approved_translation
      || group.current_translation
      || group.source_base
      || ''
    ).trim();
  }

  function valueFor(group) {
    return String(values.get(group.group_id) ?? serverValue(group)).trim();
  }

  function isDirty(group) {
    return valueFor(group) !== String(baselines.get(group.group_id) ?? serverValue(group)).trim();
  }

  function categoryLabel(group) {
    return String(group.category_label || group.category || '').trim();
  }

  function populateCategories() {
    const categories = [...new Map(
      groupsData.groups.map((group) => [String(group.category), categoryLabel(group)])
    ).entries()];
    nodes.titleCategoryFilter.innerHTML = '<option value="">全部分类</option>'
      + categories.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('');
  }

  function renderAllRows() {
    const html = groupsData.groups.map((group) => {
      const value = valueFor(group);
      const dirty = isDirty(group);
      const childCount = Number(group.child_count || group.children?.length || 0);
      const meta = `${categoryLabel(group)}${childCount > 1 ? ` · ${childCount} 条子剧情` : ''}`;
      const searchable = normalize([
        group.source_base, value, serverValue(group), group.category, categoryLabel(group), group.group_id
      ].join(' '));
      return `<tr data-group-id="${escapeHtml(group.group_id)}" data-category="${escapeHtml(group.category)}" data-search="${escapeHtml(searchable)}"${dirty ? ' data-dirty="true"' : ''}>
        <td class="story-title-source-v2">
          <span>${escapeHtml(group.source_base)}</span>
          <small>${escapeHtml(meta)}</small>
        </td>
        <td class="story-title-display-v2">
          <input class="story-title-display-input-v2" data-title-display type="text" spellcheck="false"
            value="${escapeHtml(value)}" data-baseline="${escapeHtml(serverValue(group))}"
            aria-label="${escapeHtml(group.source_base)} 的网站显示文本">
        </td>
      </tr>`;
    }).join('');
    nodes.titleEditorList.innerHTML = html;
    document.dispatchEvent(new CustomEvent('story-title-editor-rendered'));
    applyFilters();
  }

  function applyFilters() {
    filterFrame = 0;
    const query = normalize(nodes.titleGroupSearch.value);
    const category = nodes.titleCategoryFilter.value;
    const changedOnly = Boolean(nodes.titleOnlyChanged.checked);
    let visible = 0;
    for (const row of nodes.titleEditorList.querySelectorAll('tr[data-group-id]')) {
      const group = groupsById.get(row.dataset.groupId);
      const show = Boolean(group)
        && (!category || group.category === category)
        && (!query || String(row.dataset.search || '').includes(query))
        && (!changedOnly || isDirty(group));
      row.hidden = !show;
      if (show) visible += 1;
    }
    nodes.titleVisibleGroups.textContent = visible.toLocaleString();
    updateDirtyCount();
  }

  function scheduleFilters() {
    if (filterFrame) return;
    filterFrame = requestAnimationFrame(applyFilters);
  }

  function updateDirtyCount() {
    let count = 0;
    for (const group of groupsData.groups) if (isDirty(group)) count += 1;
    nodes.titleEditedGroups.textContent = count.toLocaleString();
  }

  function payloadFromValues() {
    const overrides = [];
    for (const group of groupsData.groups) {
      const value = valueFor(group);
      if (!value || !isDirty(group)) continue;
      overrides.push({
        group_id: group.group_id,
        category: group.category,
        source_base: group.source_base,
        source_sha256: group.source_sha256,
        approved_translation: value
      });
    }
    return {
      version: 1,
      release: RELEASE,
      checklist_generated_at: groupsData.generatedAt || '',
      overrides
    };
  }

  function applyLocalPayload(payload) {
    const list = Array.isArray(payload?.overrides) ? payload.overrides : [];
    for (const item of list) {
      const group = groupsById.get(String(item.group_id || ''));
      if (!group) continue;
      const value = String(item.approved_translation || '').trim();
      if (value) values.set(group.group_id, value);
    }
  }

  function filenameTimestamp() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function exportRows() {
    return groupsData.groups.map((group) => ({
      group_id: group.group_id,
      分类: group.category,
      日文母故事名: group.source_base,
      网站显示文本: valueFor(group),
      子剧情数量: Number(group.child_count || group.children?.length || 0),
      source_sha256: group.source_sha256
    }));
  }

  function exportCsv() {
    const rows = exportRows();
    const headers = ['group_id', '分类', '日文母故事名', '网站显示文本', '子剧情数量', 'source_sha256'];
    const csv = '\uFEFF' + [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ''))]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n') + '\r\n';
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `story-title-groups-${filenameTimestamp()}.csv`);
  }

  function exportXlsx() {
    if (!global.XLSX) throw new Error('XLSX 模块尚未加载。');
    const workbook = global.XLSX.utils.book_new();
    const sheet = global.XLSX.utils.json_to_sheet(exportRows());
    sheet['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 56 }, { wch: 56 }, { wch: 12 }, { wch: 68 }];
    global.XLSX.utils.book_append_sheet(workbook, sheet, '标题翻译');
    global.XLSX.writeFile(workbook, `story-title-groups-${filenameTimestamp()}.xlsx`, { compression: true });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');
    for (let index = 0; index <= input.length; index += 1) {
      const char = input[index] ?? '\n';
      if (quoted) {
        if (char === '"' && input[index + 1] === '"') { value += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(value); value = ''; }
      else if (char === '\n') {
        row.push(value.replace(/\r$/, ''));
        value = '';
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
      } else value += char;
    }
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  }

  function groupForImportedRow(row) {
    const id = String(row.group_id || '').trim();
    if (id && groupsById.has(id)) return groupsById.get(id);
    const category = String(row['分类'] ?? row.category ?? '').trim();
    const source = String(row['日文母故事名'] ?? row.source_base ?? '').trim();
    return groupsData.groups.find((group) => group.category === category && group.source_base === source) || null;
  }

  function applyImportedRows(rows) {
    let applied = 0;
    for (const row of rows) {
      const group = groupForImportedRow(row);
      if (!group) continue;
      const value = String(
        row['网站显示文本']
        ?? row['校对后母故事译名']
        ?? row['当前母故事译名']
        ?? row.approved_translation
        ?? ''
      ).trim();
      if (!value) continue;
      values.set(group.group_id, value);
      applied += 1;
    }
    return applied;
  }

  async function importFile(file) {
    const lower = file.name.toLowerCase();
    let applied = 0;
    if (lower.endsWith('.json')) {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data?.overrides)) {
        applied = applyImportedRows(data.overrides.map((item) => ({
          ...item,
          网站显示文本: item.approved_translation
        })));
      } else if (Array.isArray(data?.groups)) {
        applied = applyImportedRows(data.groups.map((item) => ({
          ...item,
          网站显示文本: item.approved_translation || item.current_translation
        })));
      } else if (Array.isArray(data)) applied = applyImportedRows(data);
    } else if (lower.endsWith('.csv')) {
      applied = applyImportedRows(parseCsv(await file.text()));
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      if (!global.XLSX) throw new Error('XLSX 模块尚未加载。');
      const workbook = global.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets['标题翻译'] || workbook.Sheets[workbook.SheetNames[0]];
      applied = applyImportedRows(global.XLSX.utils.sheet_to_json(sheet, { defval: '' }));
    } else {
      throw new Error('仅支持 JSON、CSV、XLSX。');
    }
    renderAllRows();
    setStatus(`已导入 ${applied.toLocaleString()} 行；点击“保存并应用”后写入本浏览器。`, 'success');
  }

  async function saveLocal() {
    const payload = payloadFromValues();
    const result = await Runtime.importPayload(payload, { persist: true, strict: true });
    setStatus(`已保存 ${result.payload.overrides.length.toLocaleString()} 个变更；角色故事搜索页刷新后立即使用。`, 'success');
  }

  async function clearLocal() {
    await Runtime.clearLocalOverrides();
    values = new Map(baselines);
    renderAllRows();
    setStatus('已清除本浏览器中的标题变更，恢复网站当前显示文本。', 'success');
  }

  function bindEvents() {
    nodes.titleGroupSearch.addEventListener('input', scheduleFilters);
    nodes.titleCategoryFilter.addEventListener('change', applyFilters);
    nodes.titleOnlyChanged.addEventListener('change', applyFilters);

    nodes.titleEditorList.addEventListener('input', (event) => {
      const input = event.target.closest('[data-title-display]');
      const row = event.target.closest('tr[data-group-id]');
      if (!input || !row) return;
      const group = groupsById.get(row.dataset.groupId);
      if (!group) return;
      values.set(group.group_id, input.value);
      row.dataset.search = normalize([
        group.source_base, input.value, serverValue(group), group.category, categoryLabel(group), group.group_id
      ].join(' '));
      if (isDirty(group)) row.dataset.dirty = 'true';
      else delete row.dataset.dirty;
      updateDirtyCount();
      if (nodes.titleOnlyChanged.checked) scheduleFilters();
    });

    nodes.titleEditorList.addEventListener('focusout', (event) => {
      const input = event.target.closest('[data-title-display]');
      const row = event.target.closest('tr[data-group-id]');
      if (!input || !row || input.value.trim()) return;
      const group = groupsById.get(row.dataset.groupId);
      if (!group) return;
      input.value = serverValue(group);
      values.set(group.group_id, input.value);
      delete row.dataset.dirty;
      updateDirtyCount();
    });

    nodes.titleSaveLocal.addEventListener('click', () => saveLocal().catch((error) => setStatus(`保存失败：${error.message || error}`, 'error')));
    nodes.titleClearLocal.addEventListener('click', () => clearLocal().catch((error) => setStatus(`清除失败：${error.message || error}`, 'error')));
    nodes.titleImportFile.addEventListener('change', () => {
      const file = nodes.titleImportFile.files?.[0];
      if (!file) return;
      importFile(file).catch((error) => setStatus(`导入失败：${error.message || error}`, 'error'))
        .finally(() => { nodes.titleImportFile.value = ''; });
    });
    nodes.titleExportOverridesJson.addEventListener('click', () => {
      const payload = payloadFromValues();
      downloadBlob(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' }), `story-title-overrides-${filenameTimestamp()}.json`);
    });
    nodes.titleExportExactJson.addEventListener('click', () => {
      try {
        const exact = Runtime.exactMapFrom(groupsData, payloadFromValues(), true);
        downloadBlob(new Blob([JSON.stringify(exact, null, 2) + '\n'], { type: 'application/json' }), `story-title-map-${filenameTimestamp()}.json`);
      } catch (error) {
        setStatus(`生成精确映射失败：${error.message || error}`, 'error');
      }
    });
    nodes.titleExportCsv.addEventListener('click', exportCsv);
    nodes.titleExportXlsx.addEventListener('click', () => {
      try { exportXlsx(); }
      catch (error) { setStatus(`导出 XLSX 失败：${error.message || error}`, 'error'); }
    });
  }

  async function init() {
    cacheNodes();
    Tools.renderNav?.('story');
    if (!Runtime) {
      setStatus('母故事映射运行时未加载。', 'error');
      return;
    }
    try {
      groupsData = await Runtime.loadGroups();
      if (!Array.isArray(groupsData.groups) || !groupsData.groups.length) throw new Error('母故事清单为空。');
      groupsById = new Map(groupsData.groups.map((group) => [group.group_id, group]));
      baselines = new Map(groupsData.groups.map((group) => [group.group_id, serverValue(group)]));
      values = new Map(baselines);
      applyLocalPayload(Runtime.readLocalPayload());
      nodes.titleTotalGroups.textContent = groupsData.groups.length.toLocaleString();
      nodes.titleTotalChildren.textContent = groupsData.groups
        .reduce((sum, group) => sum + Number(group.child_count || group.children?.length || 0), 0)
        .toLocaleString();
      populateCategories();
      bindEvents();
      renderAllRows();
      setStatus('完整清单已加载：一行一个母故事，第二列就是网站当前显示文本。', 'success');
      document.documentElement.dataset.storyTitleEditorV2 = RELEASE;
    } catch (error) {
      console.error(error);
      setStatus(`初始化失败：${error.message || error}`, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
