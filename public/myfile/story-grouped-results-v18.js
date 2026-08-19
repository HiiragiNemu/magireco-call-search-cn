/* Fold story-search rows once per rendered result set; no mutation feedback loop. */
(function (global) {
  'use strict';

  const RELEASE = 'story-parent-fold-v18-20260819';
  const Runtime = global.__STORY_TITLE_RUNTIME_V1__;
  let indexPromise = null;
  let scheduled = false;

  function injectStyle() {
    if (document.getElementById('storyParentFoldStyleV18')) return;
    const style = document.createElement('style');
    style.id = 'storyParentFoldStyleV18';
    style.textContent = `
      .story-parent-group-v18{border:1px solid rgba(139,34,91,.22);border-radius:12px;margin:5px 0;background:#fffafd;overflow:hidden}
      .story-parent-group-v18>summary{cursor:pointer;list-style:none;padding:8px 10px;font-weight:800;color:#8a174f;display:flex;gap:8px;align-items:center;justify-content:space-between}
      .story-parent-group-v18>summary::-webkit-details-marker{display:none}
      .story-parent-group-v18>summary::before{content:'＋';flex:0 0 auto}
      .story-parent-group-v18[open]>summary::before{content:'－'}
      .story-parent-title-v18{min-width:0;flex:1}
      .story-parent-source-v18{display:block;font-size:.72em;font-weight:500;color:#886879;margin-top:2px;overflow-wrap:anywhere}
      .story-parent-count-v18{font-size:.8em;color:#765b67;background:#f5edf1;border-radius:999px;padding:2px 7px;white-space:nowrap}
      .story-parent-children-v18{border-top:1px solid rgba(139,34,91,.15)}
    `;
    document.head.appendChild(style);
  }

  function localOverrides() {
    const list = Runtime?.readLocalPayload?.()?.overrides;
    return new Map((Array.isArray(list) ? list : []).map((item) => [String(item.group_id || ''), item]));
  }

  function effectiveBase(group, overrides) {
    return String(
      overrides.get(group.group_id)?.approved_translation
      || group.approved_translation
      || group.current_translation
      || group.source_base
      || ''
    ).trim();
  }

  function buildIndex() {
    if (!Runtime?.loadGroups) return Promise.resolve(null);
    if (!indexPromise) {
      indexPromise = Runtime.loadGroups().then((data) => {
        const categoryLabels = new Map();
        const childMap = new Map();
        for (const group of data.groups || []) {
          categoryLabels.set(String(group.category_label || group.category), group.category);
          categoryLabels.set(String(group.category), group.category);
          for (const child of group.children || []) {
            childMap.set(`${group.category}\u0000${String(child.source_title || '').trim()}`, group);
          }
        }
        return { data, categoryLabels, childMap };
      });
    }
    return indexPromise;
  }

  function sourceTitle(article) {
    return article.querySelector('.story-title-original-v7')?.textContent?.trim()
      || article.querySelector('.story-title-v7 a')?.textContent?.trim()
      || '';
  }

  function categoryFromSection(section, index) {
    const heading = section.querySelector(':scope > h3')?.textContent?.trim() || '';
    const label = heading.replace(/（[\d,]+\s*条）.*$/u, '').trim();
    return index.categoryLabels.get(label) || label;
  }

  function createParentDetails(group, rows, overrides) {
    const details = document.createElement('details');
    details.className = 'story-parent-group-v18';
    details.dataset.groupId = group.group_id;

    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.className = 'story-parent-title-v18';
    title.dataset.parentTitle = '';
    title.append(document.createTextNode(effectiveBase(group, overrides)));
    const source = document.createElement('small');
    source.className = 'story-parent-source-v18';
    source.textContent = group.source_base;
    title.appendChild(source);
    const count = document.createElement('span');
    count.className = 'story-parent-count-v18';
    count.textContent = `${rows.length} 条子剧情`;
    summary.append(title, count);

    const body = document.createElement('div');
    body.className = 'story-parent-children-v18';
    body.append(...rows);
    details.append(summary, body);
    return details;
  }

  async function applyToUnprocessedLists() {
    scheduled = false;
    const host = document.getElementById('storyResultsBody');
    if (!host) return;
    const index = await buildIndex();
    if (!index) return;
    const overrides = localOverrides();

    for (const section of host.querySelectorAll('.suite-result-group')) {
      const list = section.querySelector('.story-result-list-v7');
      if (!list || list.dataset.parentFoldV18 === RELEASE) continue;
      const directRows = [...list.children].filter((node) => node.matches?.('article.story-row-v7'));
      if (!directRows.length) {
        list.dataset.parentFoldV18 = RELEASE;
        continue;
      }
      const category = categoryFromSection(section, index);
      const order = [];
      const buckets = new Map();
      for (const article of directRows) {
        const group = index.childMap.get(`${category}\u0000${sourceTitle(article)}`) || null;
        const key = group?.group_id || `single:${order.length}`;
        if (!buckets.has(key)) { buckets.set(key, { group, rows: [] }); order.push(key); }
        buckets.get(key).rows.push(article);
      }
      const fragment = document.createDocumentFragment();
      for (const key of order) {
        const bucket = buckets.get(key);
        if (bucket.group && bucket.rows.length > 1) fragment.appendChild(createParentDetails(bucket.group, bucket.rows, overrides));
        else fragment.append(...bucket.rows);
      }
      list.replaceChildren(fragment);
      list.dataset.parentFoldV18 = RELEASE;
    }
    document.documentElement.dataset.storyParentFoldV18 = RELEASE;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => applyToUnprocessedLists().catch((error) => {
      scheduled = false;
      console.error('V18 parent-story folding failed.', error);
    }), 40);
  }

  async function refreshTitles() {
    const index = await buildIndex();
    if (!index) return;
    const byId = new Map((index.data.groups || []).map((group) => [group.group_id, group]));
    const overrides = localOverrides();
    for (const details of document.querySelectorAll('.story-parent-group-v18[data-group-id]')) {
      const group = byId.get(details.dataset.groupId);
      const title = details.querySelector('[data-parent-title]');
      if (!group || !title) continue;
      const source = title.querySelector('.story-parent-source-v18');
      title.firstChild.nodeValue = effectiveBase(group, overrides);
      if (source) source.textContent = group.source_base;
    }
  }

  function install() {
    injectStyle();
    const host = document.getElementById('storyResultsBody');
    if (!host) return;
    new MutationObserver((records) => {
      if (records.some((record) => [...record.addedNodes].some((node) =>
        node.nodeType === 1 && (node.matches?.('.suite-result-group,.story-result-list-v7') || node.querySelector?.('.story-result-list-v7'))
      ))) schedule();
    }).observe(host, { childList: true, subtree: true });
    global.addEventListener('story-title-map-v1-updated', () => refreshTitles().catch(console.error));
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
