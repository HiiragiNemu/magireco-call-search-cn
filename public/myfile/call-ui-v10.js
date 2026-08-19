/* V10 call-page controls: nested result folding, compact help and direct shortcuts. */
(function (global) {
  'use strict';

  const RELEASE = 'height-export-title-call-v10-20260817';

  function detailsOpen(selector) {
    const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (element?.tagName === 'DETAILS') element.open = true;
    return element;
  }

  function scrollToTarget(target) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return;
    const nav = document.querySelector('.suite-nav');
    const offset = (nav?.getBoundingClientRect().height || 0) + 8;
    const top = Math.max(0, global.scrollY + element.getBoundingClientRect().top - offset);
    global.scrollTo({ top, behavior: 'smooth' });
  }

  function createDetails(className, title, open = true) {
    const details = document.createElement('details');
    details.className = className;
    details.open = open;
    const summary = document.createElement('summary');
    const heading = document.createElement('span');
    heading.textContent = title;
    const state = document.createElement('span');
    state.className = 'call-details-state-v10';
    state.setAttribute('aria-hidden', 'true');
    summary.append(heading, state);
    const body = document.createElement('div');
    body.className = 'call-details-body-v10';
    details.append(summary, body);
    return { details, body };
  }

  function wrapRelationshipTable() {
    const tableHost = document.getElementById('mytable');
    if (!tableHost || tableHost.closest('.call-table-details-v10')) return;
    const resultDetails = document.querySelector('.call-result-details-v8');
    const resultBody = resultDetails?.querySelector(':scope > .call-panel-body-v8') || resultDetails;
    if (!resultBody) return;

    const { details, body } = createDetails('call-table-details-v10', '称呼关系表', true);
    body.appendChild(tableHost);
    resultBody.appendChild(details);

    const observer = new MutationObserver(() => {
      const hasTable = Boolean(tableHost.querySelector('table'));
      details.hidden = !hasTable;
      if (hasTable) details.open = true;
    });
    observer.observe(tableHost, { childList: true, subtree: true });
    details.hidden = !tableHost.querySelector('table');
  }

  function removeOldHelpText() {
    const root = document.getElementById('wrapper') || document.body;
    const elements = [...root.querySelectorAll('div,p,span')]
      .filter((element) => /拖动图标[：:]|滚动滚轮[：:]/u.test(element.textContent || ''))
      .sort((left, right) => (left.textContent || '').length - (right.textContent || '').length);
    for (const element of elements) {
      if (element.closest('.call-help-details-v10')) continue;
      element.hidden = true;
      element.dataset.replacedByV10 = 'true';
      break;
    }
  }

  function buildHelpDetails() {
    const { details, body } = createDetails('call-help-details-v10', '关系图操作说明', true);
    body.innerHTML = `
      <p><strong>拖动角色：</strong>移动单个图标；<strong>拖动空白：</strong>移动整个关系图；<strong>滚轮／双指：</strong>缩放。</p>
      <p><strong>单击角色或箭头：</strong>高亮相关关系；<strong>双击关系图角色：</strong>移到中心并高亮。</p>
      <p><strong>三击角色卡：</strong>按当前“称呼／被称呼／双方”等选项筛选对象。若关系图没有角色，请先取消选择后重新选择。</p>`;
    return details;
  }

  function enhanceSearchPanel() {
    const panel = document.querySelector('.call-search-panel-v8');
    const body = panel?.querySelector(':scope > .call-panel-body-v8');
    if (!body || body.dataset.v21SearchLayout === 'true') return;
    body.dataset.v21SearchLayout = 'true';
    document.querySelectorAll('.call-help-toggle-v10, .call-help-details-v10').forEach((node) => node.remove());
    removeOldHelpText();
  }

  function ensureResultStructure() {
    const resultDetails = document.querySelector('.call-result-details-v8');
    const section = document.getElementById('callResultSection');
    if (resultDetails && section && !resultDetails.contains(section)) {
      resultDetails.querySelector(':scope > .call-panel-body-v8')?.appendChild(section);
    }
    wrapRelationshipTable();
  }

  function openAndScroll(detailsSelector, targetSelector) {
    detailsOpen(detailsSelector);
    global.requestAnimationFrame(() => scrollToTarget(targetSelector || detailsSelector));
  }

  function installQuickRail() {
    if (document.querySelector('.call-quick-rail-v10')) return;
    for (const id of ['pagetop', 'pagemdl', 'pagebtm']) {
      const legacy = document.getElementById(id);
      if (legacy) {
        legacy.hidden = true;
        legacy.setAttribute('aria-hidden', 'true');
      }
    }

    const definitions = [
      ['↑', '页面顶部', () => global.scrollTo({ top: 0, behavior: 'smooth' })],
      ['角', '选择角色', () => openAndScroll('.call-selection-panel-v8', '.call-selection-panel-v8')],
      ['筛', '搜索条件', () => openAndScroll('.call-search-panel-v8', '.call-search-panel-v8')],
      ['属', '属性筛选', () => openAndScroll('.call-attribute-panel-v8', '.call-attribute-panel-v8')],
      ['搜', '执行称呼搜索', () => {
        detailsOpen('.call-result-details-v8');
        if (typeof global.drawAndJump === 'function') global.drawAndJump();
      }],
      ['图', '关系图', () => {
        detailsOpen('.call-result-details-v8');
        if (typeof global.toggleHeightView === 'function') global.toggleHeightView(false);
        global.requestAnimationFrame(() => scrollToTarget('#canvasflame'));
      }],
      ['表', '称呼关系表', () => {
        detailsOpen('.call-result-details-v8');
        detailsOpen('.call-table-details-v10');
        if (typeof global.toggleHeightView === 'function') global.toggleHeightView(false);
        global.requestAnimationFrame(() => scrollToTarget('.call-table-details-v10'));
      }],
      ['高', '身高图', () => {
        detailsOpen('.call-result-details-v8');
        const selected = Boolean(document.querySelector('input.MagicalChk[name="chara"]:checked'));
        if (typeof global.displayHeightChart === 'function') global.displayHeightChart(selected ? 'selected' : 'global');
      }],
      ['↓', '页面底部', () => global.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })]
    ];

    const rail = document.createElement('aside');
    rail.className = 'call-quick-rail-v10';
    rail.setAttribute('aria-label', '称呼与身高快捷操作');
    for (const [glyph, label, action] of definitions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = glyph;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', action);
      rail.appendChild(button);
    }
    document.body.appendChild(rail);
  }

  function init() {
    if (!document.getElementById('wrapper')) return;
    enhanceSearchPanel();
    ensureResultStructure();
    installQuickRail();
    document.documentElement.dataset.callUiV10 = 'true';
  }

  global.__MAGIRECO_CALL_UI_V10__ = Object.freeze({
    release: RELEASE,
    init,
    enhanceSearchPanel,
    wrapRelationshipTable,
    installQuickRail
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
