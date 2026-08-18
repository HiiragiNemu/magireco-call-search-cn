/* Password gate for the browser-side parent-story editor.
 * The static site never writes GitHub directly; this gate prevents casual
 * visitors from editing/importing/exporting administrator override payloads.
 */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-password-v1-20260818';
  const PASSWORD_SHA256 = 'af20a4cdb149e87bd038f3abdb309393a087c451718d7927780afe6e80c8279a';
  const SESSION_KEY = 'story-title-editor-unlocked-v1';
  let unlocked = false;
  let observer = null;

  function hex(buffer) {
    return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function digest(value) {
    if (!global.crypto?.subtle) throw new Error('当前浏览器不支持安全摘要，无法解锁。');
    return hex(await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  }

  function editableNodes() {
    return document.querySelectorAll([
      '#titleSaveLocal', '#titleClearLocal', '#titleImportFile',
      '#titleExportOverridesJson', '#titleExportExactJson', '#titleExportCsv', '#titleExportXlsx',
      '#titleEditorList [data-title-field]'
    ].join(','));
  }

  function applyLockState() {
    for (const node of editableNodes()) {
      node.disabled = !unlocked;
      node.setAttribute('aria-disabled', String(!unlocked));
      if (!unlocked) node.title = '输入管理员密码后才能修改或导入标题。';
      else if (node.title === '输入管理员密码后才能修改或导入标题。') node.removeAttribute('title');
    }
    document.documentElement.dataset.storyTitleEditorLocked = String(!unlocked);
    const state = document.getElementById('storyTitlePasswordState');
    if (state) {
      state.textContent = unlocked
        ? '已解锁：本次浏览器会话可编辑、导入和导出管理员覆盖文件。'
        : '已锁定：访客可以查看和下载基准清单，但不能修改、导入或保存覆盖。';
      state.dataset.kind = unlocked ? 'success' : 'info';
    }
  }

  function createGate() {
    if (document.getElementById('storyTitlePasswordGate')) return;
    const firstPanel = document.querySelector('.story-title-editor-v1 .suite-panel:nth-of-type(2)')
      || document.querySelector('.story-title-editor-v1 .suite-panel');
    if (!firstPanel) return;
    const gate = document.createElement('section');
    gate.id = 'storyTitlePasswordGate';
    gate.className = 'suite-panel story-title-password-v1';
    gate.innerHTML = `
      <h2>管理员编辑解锁</h2>
      <p>标题清单可公开查看和下载；修改、导入、浏览器保存及覆盖文件导出需要管理员密码。永久更新仍须由管理员把覆盖 JSON 提交到仓库，普通访客无法直接修改线上数据。</p>
      <div class="story-title-password-row-v1">
        <label class="suite-field" for="storyTitlePasswordInput"><span>上传／编辑密码</span>
          <input id="storyTitlePasswordInput" class="suite-input" type="password" autocomplete="current-password" spellcheck="false">
        </label>
        <button id="storyTitlePasswordUnlock" type="button" class="suite-button primary">解锁编辑</button>
        <button id="storyTitlePasswordLock" type="button" class="suite-button secondary">重新锁定</button>
      </div>
      <div id="storyTitlePasswordState" class="suite-status" role="status" aria-live="polite"></div>`;
    firstPanel.parentNode.insertBefore(gate, firstPanel);
    const style = document.createElement('style');
    style.textContent = `
      .story-title-password-v1{border-color:rgba(239,75,160,.38)}
      .story-title-password-row-v1{display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:10px;align-items:end}
      html[data-story-title-editor-locked="true"] #titleEditorList{filter:saturate(.65);opacity:.82}
      html[data-story-title-editor-locked="true"] #titleEditorList [data-title-field]{cursor:not-allowed}
      @media(max-width:760px){.story-title-password-row-v1{grid-template-columns:1fr}.story-title-password-row-v1 .suite-button{width:100%}}
    `;
    document.head.appendChild(style);

    const input = gate.querySelector('#storyTitlePasswordInput');
    const unlock = gate.querySelector('#storyTitlePasswordUnlock');
    const lock = gate.querySelector('#storyTitlePasswordLock');
    async function attempt() {
      const state = gate.querySelector('#storyTitlePasswordState');
      try {
        const valid = await digest(input.value) === PASSWORD_SHA256;
        input.value = '';
        if (!valid) {
          state.textContent = '密码错误。';
          state.dataset.kind = 'error';
          return;
        }
        unlocked = true;
        sessionStorage.setItem(SESSION_KEY, '1');
        applyLockState();
      } catch (error) {
        state.textContent = `解锁失败：${error.message || error}`;
        state.dataset.kind = 'error';
      }
    }
    unlock.addEventListener('click', attempt);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); attempt(); }
    });
    lock.addEventListener('click', () => {
      unlocked = false;
      sessionStorage.removeItem(SESSION_KEY);
      applyLockState();
    });
  }

  function install() {
    unlocked = sessionStorage.getItem(SESSION_KEY) === '1';
    createGate();
    applyLockState();
    observer = new MutationObserver(() => applyLockState());
    const list = document.getElementById('titleEditorList');
    if (list) observer.observe(list, { childList: true, subtree: true });
    document.documentElement.dataset.storyTitlePasswordV1 = RELEASE;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
