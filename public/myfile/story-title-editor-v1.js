/* Browser editor for one-parent-to-many-child story title translations. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-editor-v1-20260818';
  const Runtime = global.__STORY_TITLE_RUNTIME_V1__;
  const Tools = global.MagiTools || {};
  const PAGE_SIZE = 30;
  const STATUS_OPTIONS = ['待校对', '校对中', '已校对', '保留现状'];
  const nodes = {};
  let groupsData = { groups: [], summary: {} };
  let drafts = new Map();
  let page = 1;

  function cacheNodes() {
    for (const id of [
      'titleGroupSearch', 'titleCategoryFilter', 'titleStatusFilter', 'titleEditorList',
      'titleEditorStatus', 'titlePageInfo', 'titlePrevPage', 'titleNextPage',
      'titleSaveLocal', 'titleClearLocal', 'titleImportFile', 'titleExportOverridesJson',
      'titleExportExactJson', 'titleExportCsv', 'titleExportXlsx',
      'titleTotalGroups', 'titleTotalChildren', 'titleEditedGroups', 'titleVisibleGroups'
    ]) nodes[id] = document.getElementById(id);
  }

  function escapeHtml(value) {
    if (Tools.escapeHtml) return Tools.escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, '').trim();
  }

  function setStatus(message, kind = 'info') {
    if (Tools.setStatus) Tools.setStatus(nodes.titleEditorStatus, message, kind);
    else {
      nodes.titleEditorStatus.textContent = message;
      nodes.titleEditorStatus.dataset.kind = kind;
    }
  }

  function currentDraft(group) {
    return drafts.get(group.group_id) || {
      approved_translation: '',
      status: group.status || '待校对',
      note: group.note || ''
    };
  }

  function effectiveBase(group) {
    const draft = currentDraft(group);
    return String(draft.approved_translation || group.current_translation || group.source_base || '').trim();
  }

  function composePreview(group, child) {
    const suffix = String(child.localized_suffix ?? child.source_suffix ?? '').trim();
    return `${effectiveBase(group)}${suffix ? ` ${suffix}` : ''}`.trim();
  }

  function filteredGroups() {
    const query = normalize(nodes.titleGroupSearch.value);
    const category = nodes.titleCategoryFilter.value;
    const status = nodes.titleStatusFilter.value;
    return groupsData.groups.filter((group) => {
      const draft = currentDraft(group);
      if (category && group.category !== category) return false;
      if (status && String(draft.status || '待校对') !== status) return false;
      if (!query) return true;
      const haystack = normalize([
        group.group_id, group.category, group.source_base, group.current_translation,
        draft.approved_translation, draft.note,
        ...(group.children || []).slice(0, 12).map((child) => child.source_title)
      ].join(' '));
      return haystack.includes(query);
    });
  }

  function setDraftValue(group, key, value) {
    const existing = { ...currentDraft(group), [key]: value };
    drafts.set(group.group_id, existing);
    updateKpis();
  }

  function childRows(group) {
    return (group.children || []).map((child) => `
      <tr>
        <td data-label="原始完整标题">${escapeHtml(child.source_title)}</td>
        <td data-label="子剧情后缀">${escapeHtml(child.source_suffix || '（无）')}</td>
        <td data-label="网站生成预览">${escapeHtml(composePreview(group, child))}</td>
      </tr>`).join('');
  }

  function renderCard(group) {
    const draft = currentDraft(group);
    const first = group.children?.[0] || null;
    const preview = first ? composePreview(group, first) : effectiveBase(group);
    const statusOptions = STATUS_OPTIONS.map((value) =>
      `<option value="${escapeHtml(value)}"${draft.status === value ? ' selected' : ''}>${escapeHtml(value)}</option>`
    ).join('');
    return `
      <article class="story-title-card-v1" data-group-id="${escapeHtml(group.group_id)}">
        <header class="story-title-card-head-v1">
          <div>
            <h3>${escapeHtml(group.source_base)}</h3>
            <p class="story-title-meta-v1">${escapeHtml(group.category_label || group.category)} · <span class="story-title-inline-code-v1">${escapeHtml(group.group_id)}</span></p>
          </div>
          <span class="story-title-count-v1">${(group.children || []).length} 条</span>
        </header>
        <div class="story-title-fields-v1">
          <label>当前母故事译名
            <input class="suite-input story-title-current-v1" value="${escapeHtml(group.current_translation || '')}" readonly>
          </label>
          <label>校对后母故事译名
            <input class="suite-input story-title-approved-v1" data-title-field="approved_translation" value="${escapeHtml(draft.approved_translation || '')}" placeholder="留空则继续使用当前译名">
          </label>
          <label>状态
            <select class="suite-select story-title-status-v1" data-title-field="status">${statusOptions}</select>
          </label>
        </div>
        <label class="story-title-note-v1">备注
          <textarea class="suite-textarea" rows="2" data-title-field="note" placeholder="术语依据、人工校对说明等">${escapeHtml(draft.note || '')}</textarea>
        </label>
        <p class="story-title-preview-v1"><strong>生成预览：</strong><span data-title-preview>${escapeHtml(preview)}</span></p>
        <details class="story-title-children-v1">
          <summary>查看全部 ${(group.children || []).length} 条子剧情与映射结果</summary>
          <table class="story-title-child-table-v1">
            <thead><tr><th>原始完整标题</th><th>子剧情后缀</th><th>网站生成预览</th></tr></thead>
            <tbody data-child-rows>${childRows(group)}</tbody>
          </table>
        </details>
      </article>`;
  }

  function render() {
    const filtered = filteredGroups();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const shown = filtered.slice(start, start + PAGE_SIZE);
    nodes.titleEditorList.innerHTML = shown.length
      ? shown.map(renderCard).join('')
      : '<div class="story-title-empty-v1">没有符合当前条件的母故事。</div>';
    nodes.titlePageInfo.textContent = `第 ${page}/${totalPages} 页 · 共 ${filtered.length.toLocaleString()} 个母故事`;
    nodes.titlePrevPage.disabled = page <= 1;
    nodes.titleNextPage.disabled = page >= totalPages;
    nodes.titleVisibleGroups.textContent = filtered.length.toLocaleString();
  }

  function updateKpis() {
    const edited = [...drafts.values()].filter((draft) => String(draft.approved_translation || '').trim()).length;
    nodes.titleEditedGroups.textContent = edited.toLocaleString();
  }

  function populateCategories() {
    const categories = [...new Map(groupsData.groups.map((group) => [group.category, group.category_label || group.category])).entries()];
    nodes.titleCategoryFilter.innerHTML = '<option value="">全部分类</option>'
      + categories.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('');
    nodes.titleStatusFilter.innerHTML = '<option value="">全部状态</option>'
      + STATUS_OPTIONS.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
  }

  function updateCard(card, group) {
    const preview = card.querySelector('[data-title-preview]');
    const first = group.children?.[0] || null;
    if (preview) preview.textContent = first ? composePreview(group, first) : effectiveBase(group);
    const body = card.querySelector('[data-child-rows]');
    if (body) body.innerHTML = childRows(group);
  }

  function payloadFromDrafts() {
    const byId = new Map(groupsData.groups.map((group) => [group.group_id, group]));
    const overrides = [];
    for (const [groupId, draft] of drafts) {
      const approved = String(draft.approved_translation || '').trim();
      if (!approved) continue;
      const group = byId.get(groupId);
      if (!group) continue;
      overrides.push({
        group_id: group.group_id,
        category: group.category,
        source_base: group.source_base,
        source_sha256: group.source_sha256,
        approved_translation: approved,
        status: String(draft.status || '已校对'),
        note: String(draft.note || '')
      });
    }
    overrides.sort((a, b) => a.group_id.localeCompare(b.group_id));
    return {
      version: 1,
      release: RELEASE,
      checklist_generated_at: groupsData.generatedAt || '',
      overrides
    };
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
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const rows = [['group_id','分类','日文母故事名','当前母故事译名','校对后母故事译名','状态','备注','子剧情数量','source_sha256']];
    for (const group of groupsData.groups) {
      const draft = currentDraft(group);
      rows.push([
        group.group_id, group.category, group.source_base, group.current_translation,
        draft.approved_translation || '', draft.status || '待校对', draft.note || '',
        (group.children || []).length, group.source_sha256
      ]);
    }
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `story-title-groups-${filenameTimestamp()}.csv`);
  }

  function ensureXlsx() {
    if (!global.XLSX) throw new Error('XLSX 模块尚未加载，请刷新页面后重试。');
    return global.XLSX;
  }

  function exportXlsx() {
    const XLSX = ensureXlsx();
    const titleRows = groupsData.groups.map((group) => {
      const draft = currentDraft(group);
      return {
        group_id: group.group_id,
        分类: group.category,
        分类中文: group.category_label || group.category,
        日文母故事名: group.source_base,
        当前母故事译名: group.current_translation,
        校对后母故事译名: draft.approved_translation || '',
        状态: draft.status || '待校对',
        备注: draft.note || '',
        子剧情数量: (group.children || []).length,
        source_sha256: group.source_sha256
      };
    });
    const childRowsData = [];
    for (const group of groupsData.groups) {
      for (const child of group.children || []) {
        childRowsData.push({
          group_id: group.group_id,
          分类: group.category,
          日文母故事名: group.source_base,
          原始完整标题: child.source_title,
          原始子剧情后缀: child.source_suffix || '',
          本地化子剧情后缀: child.localized_suffix || '',
          网站生成预览: composePreview(group, child)
        });
      }
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(titleRows), '标题翻译');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(childRowsData), '子剧情明细');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['使用说明'],
      ['只修改“校对后母故事译名”“状态”“备注”；不得修改 group_id、分类、日文母故事名或 source_sha256。'],
      ['同一母故事的全部子剧情会自动使用同一个校对后译名，并保留各自子剧情后缀。'],
      ['导入本页面后立即写入浏览器本地并应用于故事搜索；提交仓库时使用导出的 overrides JSON。']
    ]), '使用说明');
    XLSX.writeFile(workbook, `story-title-groups-${filenameTimestamp()}.xlsx`, { compression: true });
  }

  function readFileText(file) {
    return file.text();
  }

  function rowsToPayload(rows) {
    const overrides = [];
    for (const row of rows) {
      const approved = String(row['校对后母故事译名'] ?? row.approved_translation ?? '').trim();
      if (!approved) continue;
      overrides.push({
        group_id: String(row.group_id || '').trim(),
        category: String(row['分类'] ?? row.category ?? '').trim(),
        source_base: String(row['日文母故事名'] ?? row.source_base ?? '').trim(),
        source_sha256: String(row.source_sha256 || '').trim(),
        approved_translation: approved,
        status: String(row['状态'] ?? row.status ?? '已校对'),
        note: String(row['备注'] ?? row.note ?? '')
      });
    }
    return { version: 1, overrides };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
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
        row.push(value.replace(/\r$/, '')); value = '';
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
      } else value += char;
    }
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  }

  async function parseImportFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.json')) return JSON.parse(await readFileText(file));
    if (lower.endsWith('.csv')) return rowsToPayload(parseCsv(await readFileText(file)));
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const XLSX = ensureXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets['标题翻译'] || workbook.Sheets[workbook.SheetNames[0]];
      return rowsToPayload(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
    }
    throw new Error('仅支持 JSON、CSV、XLSX。');
  }

  function applyPayloadToDrafts(payload) {
    const list = Array.isArray(payload) ? payload
      : Array.isArray(payload?.overrides) ? payload.overrides
        : Array.isArray(payload?.groups) ? payload.groups : [];
    for (const item of list) {
      const groupId = String(item.group_id || '').trim();
      if (!groupId) continue;
      drafts.set(groupId, {
        approved_translation: String(item.approved_translation || ''),
        status: String(item.status || '已校对'),
        note: String(item.note || '')
      });
    }
  }

  async function saveLocal() {
    const result = await Runtime.importPayload(payloadFromDrafts(), { persist: true, strict: true });
    setStatus(`已在浏览器保存 ${result.payload.overrides.length.toLocaleString()} 个母故事译名；故事搜索页刷新后立即使用。`, 'success');
  }

  async function importFile(file) {
    const raw = await parseImportFile(file);
    const result = await Runtime.importPayload(raw, { persist: true, strict: true });
    drafts = new Map();
    applyPayloadToDrafts(result.payload);
    page = 1;
    render();
    updateKpis();
    setStatus(`导入成功：${result.payload.overrides.length.toLocaleString()} 个母故事译名已写入浏览器并生成精确子剧情映射。`, 'success');
  }

  function bindEvents() {
    for (const node of [nodes.titleGroupSearch, nodes.titleCategoryFilter, nodes.titleStatusFilter]) {
      node.addEventListener(node.tagName === 'INPUT' ? 'input' : 'change', () => { page = 1; render(); });
    }
    nodes.titlePrevPage.addEventListener('click', () => { page -= 1; render(); scrollTo({ top: 0, behavior: 'smooth' }); });
    nodes.titleNextPage.addEventListener('click', () => { page += 1; render(); scrollTo({ top: 0, behavior: 'smooth' }); });
    nodes.titleEditorList.addEventListener('input', (event) => {
      const field = event.target.closest('[data-title-field]');
      const card = event.target.closest('[data-group-id]');
      if (!field || !card) return;
      const group = groupsData.groups.find((item) => item.group_id === card.dataset.groupId);
      if (!group) return;
      setDraftValue(group, field.dataset.titleField, field.value);
      updateCard(card, group);
    });
    nodes.titleEditorList.addEventListener('change', (event) => {
      const field = event.target.closest('[data-title-field]');
      const card = event.target.closest('[data-group-id]');
      if (!field || !card) return;
      const group = groupsData.groups.find((item) => item.group_id === card.dataset.groupId);
      if (!group) return;
      setDraftValue(group, field.dataset.titleField, field.value);
      updateCard(card, group);
    });
    nodes.titleSaveLocal.addEventListener('click', () => saveLocal().catch((error) => setStatus(`保存失败：${error.message || error}`, 'error')));
    nodes.titleClearLocal.addEventListener('click', () => Runtime.clearLocalOverrides().then(() => {
      drafts = new Map(); render(); updateKpis(); setStatus('已清除浏览器中的母故事译名覆盖。', 'success');
    }).catch((error) => setStatus(`清除失败：${error.message || error}`, 'error')));
    nodes.titleImportFile.addEventListener('change', () => {
      const file = nodes.titleImportFile.files?.[0];
      if (!file) return;
      importFile(file).catch((error) => setStatus(`导入失败：${error.message || error}`, 'error'))
        .finally(() => { nodes.titleImportFile.value = ''; });
    });
    nodes.titleExportOverridesJson.addEventListener('click', () => {
      const payload = payloadFromDrafts();
      downloadBlob(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' }), `story-title-overrides-${filenameTimestamp()}.json`);
    });
    nodes.titleExportExactJson.addEventListener('click', () => {
      try {
        const exact = Runtime.exactMapFrom(groupsData, payloadFromDrafts(), true);
        downloadBlob(new Blob([JSON.stringify(exact, null, 2) + '\n'], { type: 'application/json' }), `story-title-map-${filenameTimestamp()}.json`);
      } catch (error) { setStatus(`生成精确映射失败：${error.message || error}`, 'error'); }
    });
    nodes.titleExportCsv.addEventListener('click', exportCsv);
    nodes.titleExportXlsx.addEventListener('click', () => {
      try { exportXlsx(); } catch (error) { setStatus(`导出 XLSX 失败：${error.message || error}`, 'error'); }
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
      if (!groupsData.groups.length) throw new Error('母故事清单为空，等待 GitHub Actions 生成。');
      applyPayloadToDrafts(Runtime.readLocalPayload());
      nodes.titleTotalGroups.textContent = groupsData.summary.parentGroups?.toLocaleString?.() || groupsData.groups.length.toLocaleString();
      nodes.titleTotalChildren.textContent = groupsData.summary.childTitles?.toLocaleString?.()
        || groupsData.groups.reduce((sum, group) => sum + (group.children || []).length, 0).toLocaleString();
      populateCategories();
      bindEvents();
      render();
      updateKpis();
      setStatus('清单已加载。修改母故事译名后可保存到浏览器，或导出文件提交仓库。', 'success');
      document.documentElement.dataset.storyTitleEditorV1 = RELEASE;
    } catch (error) {
      console.error(error);
      setStatus(`初始化失败：${error.message || error}`, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
