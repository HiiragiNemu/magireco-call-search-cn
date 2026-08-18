/* V15: fold story-search rows by editable parent-story title. */
(function (global) {
  'use strict';

  const RELEASE = 'story-parent-fold-v15-20260818';
  const Runtime = global.__STORY_TITLE_RUNTIME_V1__;
  let indexPromise = null;
  let applying = false;
  let timer = 0;

  function injectStyle() {
    if (document.getElementById('storyParentFoldStyleV15')) return;
    const style = document.createElement('style');
    style.id = 'storyParentFoldStyleV15';
    style.textContent = `
      .story-parent-group-v15{border:1px solid rgba(139,34,91,.22);border-radius:16px;margin:10px 0;background:rgba(255,249,252,.78);overflow:hidden}
      .story-parent-group-v15>summary{cursor:pointer;list-style:none;padding:14px 16px;font-weight:800;color:#8a174f;display:flex;gap:10px;align-items:center;justify-content:space-between}
      .story-parent-group-v15>summary::-webkit-details-marker{display:none}
      .story-parent-group-v15>summary::before{content:'＋';flex:0 0 auto;font-size:1.15em}
      .story-parent-group-v15[open]>summary::before{content:'－'}
      .story-parent-count-v15{font-size:.86em;font-weight:700;color:#765b67;background:#f5edf1;border-radius:999px;padding:3px 9px;white-space:nowrap}
      .story-parent-source-v15{display:block;font-size:.76em;font-weight:500;color:#886879;margin-top:3px}
      .story-parent-children-v15{border-top:1px solid rgba(139,34,91,.15)}
      .story-parent-children-v15>.story-row-v7{border-radius:0;margin:0;border-left:0;border-right:0}
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

  async function buildIndex() {
    if (!Runtime?.loadGroups) return null;
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
    const original = article.querySelector('.story-title-original-v7')?.textContent?.trim();
    if (original) return original;
    return article.querySelector('.story-title-v7 a')?.textContent?.trim() || '';
  }

  function categoryFromSection(section, index) {
    const heading = section.querySelector(':scope > h3')?.textContent?.trim() || '';
    const label = heading.replace(/（[\d,]+\s*条）.*$/u, '').trim();
    return index.categoryLabels.get(label) || label;
  }

  function createParentDetails(group, rows, overrides) {
    const details = document.createElement('details');
    details.className = 'story-parent-group-v15';
    details.dataset.groupId = group.group_id;
    const summary = document.createElement('summary');
    const titleWrap = document.createElement('span');
    titleWrap.textContent = effectiveBase(group, overrides);
    const source = document.createElement('small');
    source.className = 'story-parent-source-v15';
    source.textContent = group.source_base;
    titleWrap.appendChild(source);
    const count = document.createElement('span');
    count.className = 'story-parent-count-v15';
    count.textContent = `${rows.length} 条子剧情`;
    summary.append(titleWrap, count);
    const body = document.createElement('div');
    body.className = 'story-parent-children-v15';
    body.append(...rows);
    details.append(summary, body);
    return details;
  }

  async function apply() {
    if (applying) return;
    const host = document.getElementById('storyResultsBody');
    if (!host || !host.querySelector('.story-row-v7')) return;
    const index = await buildIndex();
    if (!index) return;
    applying = true;
    try {
      const overrides = localOverrides();
      for (const section of host.querySelectorAll('.suite-result-group')) {
        const list = section.querySelector('.story-result-list-v7');
        if (!list) continue;
        const articles = [...list.querySelectorAll('article.story-row-v7')];
        if (!articles.length) continue;
        const category = categoryFromSection(section, index);
        const order = [];
        const buckets = new Map();
        for (const article of articles) {
          const raw = sourceTitle(article);
          const group = index.childMap.get(`${category}\u0000${raw}`) || null;
          const key = group?.group_id || `single:${order.length}`;
          if (!buckets.has(key)) {
            buckets.set(key, { group, rows: [] });
            order.push(key);
          }
          buckets.get(key).rows.push(article);
        }
        const fragment = document.createDocumentFragment();
        for (const key of order) {
          const bucket = buckets.get(key);
          if (bucket.group && bucket.rows.length > 1) fragment.appendChild(createParentDetails(bucket.group, bucket.rows, overrides));
          else fragment.append(...bucket.rows);
        }
        list.replaceChildren(fragment);
        list.dataset.parentFoldV15 = RELEASE;
      }
      document.documentElement.dataset.storyParentFoldV15 = RELEASE;
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (applying || timer) return;
    timer = global.setTimeout(() => { timer = 0; apply().catch((error) => console.error('V15 parent-story folding failed.', error)); }, 60);
  }

  function install() {
    injectStyle();
    const host = document.getElementById('storyResultsBody');
    if (!host) return;
    new MutationObserver(schedule).observe(host, { childList: true, subtree: true });
    global.addEventListener('story-title-map-v1-updated', () => {
      indexPromise = null;
      schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
