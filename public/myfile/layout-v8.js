/* V8: collapsible panels and full-document character/result layouts. */
(function (global) {
  'use strict';

  const RELEASE = 'collapsible-layout-v8-20260816';
  const NAV_LABELS = [
    ['story.html', '角色故事搜索'],
    ['attendance.html', '共同出场次数排行'],
    ['runes.html', '魔女文翻译'],
    ['index.html', '称呼与身高']
  ];

  function updateNavigation() {
    let changed = false;
    for (const link of document.querySelectorAll('.suite-nav a')) {
      const href = link.getAttribute('href') || '';
      const label = NAV_LABELS.find(([path]) => href.includes(path))?.[1]
        || (href === './' || href === '/' ? '称呼与身高' : link.textContent.trim());
      if (link.textContent.trim() === label && link.childNodes.length === 1
        && link.firstChild?.nodeType === Node.TEXT_NODE) continue;
      link.replaceChildren(document.createTextNode(label));
      changed = true;
    }
    return changed;
  }

  function panelSummary(title) {
    const summary = document.createElement('summary');
    const text = document.createElement('span');
    text.textContent = title;
    summary.appendChild(text);
    return summary;
  }

  function wrapSuitePanel(section, title, extraClass = '') {
    if (!section) return null;
    const existing = section.parentElement?.matches('details.suite-panel-details-v8')
      ? section.parentElement
      : null;
    if (existing) return existing;
    const details = document.createElement('details');
    details.className = `suite-panel-details-v8 ${extraClass}`.trim();
    details.open = true;
    details.appendChild(panelSummary(title));
    section.parentNode.insertBefore(details, section);
    details.appendChild(section);
    return details;
  }

  function mirrorText(source, target) {
    const update = () => {
      const text = source?.textContent?.replace(/\s+/g, ' ').trim();
      const next = text || '角色目录';
      if (target.textContent !== next) target.textContent = next;
    };
    update();
    if (source && typeof MutationObserver === 'function') {
      new MutationObserver(update).observe(source, { childList: true, subtree: true, characterData: true });
    }
    return update;
  }

  function installCharacterGridDetails(countNode, grid, label = '角色头像') {
    if (!countNode || !grid) return null;
    const existing = grid.parentElement?.matches('details.character-grid-details-v8')
      ? grid.parentElement
      : null;
    if (existing) return existing;

    const details = document.createElement('details');
    details.className = 'character-grid-details-v8';
    details.open = true;
    const summary = document.createElement('summary');
    const count = document.createElement('span');
    count.className = 'character-grid-count-v8';
    count.dataset.label = label;
    summary.appendChild(count);

    countNode.parentNode.insertBefore(details, countNode);
    details.append(summary, grid);
    countNode.classList.add('v8-count-source');
    countNode.hidden = true;
    details.insertAdjacentElement('afterend', countNode);
    mirrorText(countNode, count);
    return details;
  }

  function prepareStoryPage() {
    document.querySelector('.suite-hero')?.remove();
    const searchSection = document.getElementById('story-options-title')?.closest('.suite-panel');
    const characterSection = document.getElementById('story-character-title')?.closest('.suite-panel');
    const resultsSection = document.getElementById('storyResults');
    const searchDetails = wrapSuitePanel(searchSection, '搜索条件', 'story-search-panel-v8');
    const characterDetails = wrapSuitePanel(characterSection, '选择角色', 'story-character-panel-v8');
    const resultDetails = wrapSuitePanel(resultsSection, '搜索结果', 'story-results-panel-v8');

    searchSection?.querySelector('.suite-grid.two')?.classList.add('story-controls-v8');
    installCharacterGridDetails(
      document.getElementById('storyCharacterCount'),
      document.getElementById('storyCharacterGrid'),
      '角色头像'
    );

    const moveAttributePanel = () => {
      const anchor = document.getElementById('storyAttributeFilterV7');
      const controls = characterSection?.querySelector('.suite-grid.two');
      if (anchor && controls && anchor.parentElement !== characterSection) {
        controls.insertAdjacentElement('afterend', anchor);
      }
    };
    moveAttributePanel();
    if (characterSection && typeof MutationObserver === 'function') {
      new MutationObserver(moveAttributePanel).observe(characterSection, { childList: true, subtree: true });
    }

    document.getElementById('storySearchButton')?.addEventListener('click', () => {
      if (searchDetails) searchDetails.open = true;
      if (characterDetails) characterDetails.open = true;
      if (resultDetails) resultDetails.open = true;
    }, true);
  }

  function prepareAttendancePage() {
    document.querySelector('.suite-hero')?.remove();
    const selectionSection = document.getElementById('attendance-character-title')?.closest('.suite-panel');
    const resultsSection = document.getElementById('attendanceResults');
    const selectionDetails = wrapSuitePanel(selectionSection, '选择基准角色', 'attendance-selection-v8');
    const resultDetails = wrapSuitePanel(resultsSection, '排行结果', 'attendance-results-v8');

    const controls = selectionSection?.querySelector('.suite-grid.two');
    if (controls) {
      controls.classList.add('attendance-control-stack-v8');
      const current = document.getElementById('attendanceSelected')?.closest('.suite-field');
      if (current) {
        current.dataset.v8CurrentSelection = 'true';
        controls.prepend(current);
      }
    }

    installCharacterGridDetails(
      document.getElementById('attendanceCharacterCount'),
      document.getElementById('attendanceGrid'),
      '角色头像'
    );

    if (selectionDetails && resultDetails && !selectionDetails.parentElement?.classList.contains('attendance-workspace-v8')) {
      const workspace = document.createElement('div');
      workspace.className = 'attendance-workspace-v8';
      selectionDetails.parentNode.insertBefore(workspace, selectionDetails);
      workspace.append(selectionDetails, resultDetails);
    }

    document.getElementById('attendanceGrid')?.addEventListener('click', (event) => {
      if (event.target.closest('.suite-character-card') && resultDetails) resultDetails.open = true;
    }, true);
  }

  function createCallPanel(title, className = '', open = true) {
    const details = document.createElement('details');
    details.className = `call-panel-v8 ${className}`.trim();
    details.open = open;
    details.appendChild(panelSummary(title));
    const body = document.createElement('div');
    body.className = 'call-panel-body-v8';
    details.appendChild(body);
    return { details, body };
  }

  function callCountUpdater(grid, target) {
    const labels = [...grid.querySelectorAll('label.girlbox')];
    let frame = 0;
    const update = () => {
      frame = 0;
      const visible = labels.filter((label) => {
        const style = global.getComputedStyle(label);
        return !label.hidden && style.display !== 'none' && style.visibility !== 'hidden';
      }).length;
      const selected = labels.filter((label) => label.querySelector('input.MagicalChk')?.checked).length;
      const next = `显示 ${visible}/${labels.length} 名；已选 ${selected} 名。`;
      if (target.textContent !== next) target.textContent = next;
    };
    const schedule = () => {
      if (frame) return;
      frame = global.requestAnimationFrame(update);
    };
    grid.addEventListener('change', schedule);
    document.getElementById('ndownword1')?.addEventListener('input', schedule);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(schedule).observe(grid, {
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
    }
    update();
    return update;
  }

  function wrapCallResults() {
    const section = document.getElementById('callResultSection');
    if (!section) return null;
    const existing = section.closest('details.call-result-details-v8');
    if (existing) return existing;
    const { details, body } = createCallPanel('搜索结果', 'call-result-details-v8', true);
    section.parentNode.insertBefore(details, section);
    body.appendChild(section);
    return details;
  }

  function prepareCallPage() {
    const wrapper = document.getElementById('wrapper');
    const returnLink = wrapper?.querySelector('.returnlink');
    const callOption = wrapper?.querySelector('fieldset.calloption');
    const form = wrapper?.querySelector('form[name="magicalgirl"]');
    if (!wrapper || !returnLink || !callOption || !form || wrapper.dataset.v8Organized === 'true') return;
    wrapper.dataset.v8Organized = 'true';

    const selection = createCallPanel('选择角色', 'call-selection-panel-v8', true);
    returnLink.parentNode.insertBefore(selection.details, returnLink);

    let cursor = returnLink;
    while (cursor && cursor !== callOption) {
      const next = cursor.nextSibling;
      selection.body.appendChild(cursor);
      cursor = next;
    }

    const search = createCallPanel('搜索条件', 'call-search-panel-v8', false);
    selection.details.parentNode.insertBefore(search.details, selection.details);
    const explainer = document.getElementById('ndownword1')?.previousElementSibling;
    const nameFilter = document.getElementById('ndownword1');
    const filterReset = wrapper.querySelector('.ndownReset');
    search.body.classList.add('call-search-filter-v8');
    search.body.appendChild(callOption);
    if (explainer?.tagName === 'P') search.body.appendChild(explainer);
    if (nameFilter) search.body.appendChild(nameFilter);
    if (filterReset) search.body.appendChild(filterReset);

    const actions = document.createElement('div');
    actions.className = 'call-actions-v8';
    for (const selector of [
      '#mgreset',
      'input[name="call_search"]',
      'input[name="height_search_selected"]',
      'input[name="height_search_global"]'
    ]) {
      const button = wrapper.querySelector(selector);
      if (button) actions.appendChild(button);
    }
    selection.body.append(actions, form);

    const grid = form.querySelector('.magicalgirl');
    if (grid) {
      const avatarDetails = document.createElement('details');
      avatarDetails.className = 'character-grid-details-v8 call-avatar-details-v8';
      avatarDetails.open = true;
      const summary = document.createElement('summary');
      const count = document.createElement('span');
      count.className = 'character-grid-count-v8';
      summary.appendChild(count);
      grid.parentNode.insertBefore(avatarDetails, grid);
      avatarDetails.append(summary, grid);
      callCountUpdater(grid, count);
    }

    const attributeFieldset = [...wrapper.querySelectorAll('fieldset')]
      .find((fieldset) => /按属性选择魔法少女/u.test(fieldset.querySelector('legend')?.textContent || ''));
    if (attributeFieldset) {
      const attribute = createCallPanel('按属性选择魔法少女', 'call-attribute-panel-v8', false);
      attributeFieldset.parentNode.insertBefore(attribute.details, attributeFieldset);
      attributeFieldset.classList.add('call-attribute-fieldset-v8');
      attribute.body.appendChild(attributeFieldset);
    }

    let resultDetails = wrapCallResults();
    let resultFrame = 0;
    const resultObserver = typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
        if (resultFrame) return;
        resultFrame = global.requestAnimationFrame(() => {
          resultFrame = 0;
          resultDetails = wrapCallResults() || resultDetails;
        });
      })
      : null;
    resultObserver?.observe(wrapper, { childList: true, subtree: true });

    wrapper.querySelector('input[name="call_search"]')?.addEventListener('click', () => {
      selection.details.open = true;
      if (resultDetails) resultDetails.open = true;
      global.setTimeout(() => {
        resultDetails = wrapCallResults() || resultDetails;
        if (resultDetails) resultDetails.open = true;
      }, 80);
    }, true);
  }

  function init() {
    updateNavigation();
    const navObserver = typeof MutationObserver === 'function'
      ? new MutationObserver(() => updateNavigation())
      : null;
    for (const nav of document.querySelectorAll('.suite-nav')) navObserver?.observe(nav, { childList: true, subtree: true });

    const tool = document.body?.dataset.suiteTool;
    if (tool === 'story') prepareStoryPage();
    else if (tool === 'attendance') prepareAttendancePage();
    else if (!document.body?.classList.contains('suite-page')) prepareCallPage();

    document.documentElement.dataset.layoutV8 = RELEASE;
  }

  global.__MAGIRECO_LAYOUT_V8__ = Object.freeze({
    release: RELEASE,
    updateNavigation,
    prepareStoryPage,
    prepareAttendancePage,
    prepareCallPage,
    installCharacterGridDetails,
    wrapCallResults
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
