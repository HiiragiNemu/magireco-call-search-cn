/* Compact password gate for the dense browser-side title editor. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-password-v19-20260819';
  const PASSWORD_SHA256 = 'af20a4cdb149e87bd038f3abdb309393a087c451718d7927780afe6e80c8279a';
  const SESSION_KEY = 'story-title-editor-unlocked-v2';
  let unlocked = false;

  function hex(buffer) {
    return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function digest(value) {
    if (!global.crypto?.subtle) throw new Error('当前浏览器不支持安全摘要。');
    return hex(await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  }

  function editableNodes() {
    return document.querySelectorAll([
      '#titleSaveLocal', '#titleClearLocal', '#titleImportFile',
      '#titleExportOverridesJson', '#titleExportExactJson', '#titleExportCsv', '#titleExportXlsx',
      '#titleEditorList [data-title-display]'
    ].join(','));
  }

  function applyLockState() {
    for (const node of editableNodes()) {
      node.disabled = !unlocked;
      node.setAttribute('aria-disabled', String(!unlocked));
      if (!unlocked) node.title = '输入管理员密码后才能编辑。';
      else if (node.title === '输入管理员密码后才能编辑。') node.removeAttribute('title');
    }
    document.documentElement.dataset.storyTitleEditorLocked = String(!unlocked);
    const state = document.getElementById('storyTitlePasswordState');
    if (state) {
      state.textContent = unlocked ? '已解锁：可编辑并保存。' : '只读：输入管理员密码后编辑。';
      state.dataset.kind = unlocked ? 'success' : 'info';
    }
  }

  async function attemptUnlock() {
    const input = document.getElementById('storyTitlePasswordInput');
    const state = document.getElementById('storyTitlePasswordState');
    try {
      const valid = await digest(input?.value || '') === PASSWORD_SHA256;
      if (input) input.value = '';
      if (!valid) {
        if (state) { state.textContent = '密码错误。'; state.dataset.kind = 'error'; }
        return;
      }
      unlocked = true;
      sessionStorage.setItem(SESSION_KEY, '1');
      applyLockState();
    } catch (error) {
      if (state) { state.textContent = `解锁失败：${error.message || error}`; state.dataset.kind = 'error'; }
    }
  }

  function install() {
    unlocked = sessionStorage.getItem(SESSION_KEY) === '1';
    document.getElementById('storyTitlePasswordUnlock')?.addEventListener('click', attemptUnlock);
    document.getElementById('storyTitlePasswordInput')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); attemptUnlock(); }
    });
    document.getElementById('storyTitlePasswordLock')?.addEventListener('click', () => {
      unlocked = false;
      sessionStorage.removeItem(SESSION_KEY);
      applyLockState();
    });
    document.addEventListener('story-title-editor-rendered', applyLockState);
    applyLockState();
    document.documentElement.dataset.storyTitlePasswordV2 = RELEASE;
    global.__STORY_TITLE_PASSWORD_V2__ = Object.freeze({
      release: RELEASE,
      isUnlocked: () => unlocked,
      applyLockState
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window);
