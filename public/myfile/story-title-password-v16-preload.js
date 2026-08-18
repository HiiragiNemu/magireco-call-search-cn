/* V16 administrator gate and compatibility shim for the archived V1 gate. */
(function (global) {
  'use strict';

  const RELEASE = 'story-title-password-v16-20260818';
  const LEGACY_RELEASE = 'story-title-password-v1-20260818';
  const HASH = 'af20a4cdb149e87bd038f3abdb309393a087c451718d7927780afe6e80c8279a';
  const SESSION_KEY = 'magireco-story-title-admin-v16';
  const PROTECTED_SELECTORS = [
    '#titleSaveLocal', '#titleClearLocal', '#titleImportFile',
    '#titleExportOverridesJson', '#titleExportExactJson',
    '#titleExportCsv', '#titleExportXlsx'
  ];

  let installed = false;
  let unlocked = false;
  let observer = null;

  function bytesToHex(buffer) {
    return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function sha256(value) {
    return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
  }

  function installGate() {
    if (installed) return global.__STORY_TITLE_PASSWORD_V1__;
    const list = document.getElementById('titleEditorList');
    const host = document.querySelector('.story-title-toolbar-v1')?.closest('.suite-panel')
      || document.querySelector('.story-title-editor-v1 .suite-panel:nth-of-type(2)');
    if (!list || !host) return null;
    installed = true;
    try { unlocked = sessionStorage.getItem(SESSION_KEY) === 'unlocked'; } catch { unlocked = false; }

    const gate = document.createElement('section');
    gate.className = 'suite-notice story-title-admin-gate-v16';
    gate.setAttribute('aria-label', '母故事标题管理员权限');
    gate.innerHTML = `
      <div style="display:grid;gap:10px">
        <strong>管理员编辑权限</strong>
        <span>清单可以公开查看和下载；修改、导入、保存及管理导出必须输入上传密码。</span>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <label style="display:flex;gap:8px;align-items:center;flex:1 1 320px">
            <span>上传密码</span>
            <input id="storyTitleAdminPasswordV16" class="suite-input" type="password" autocomplete="current-password" spellcheck="false" placeholder="输入管理员密码">
          </label>
          <button id="storyTitleAdminUnlockV16" type="button" class="suite-button primary">解锁编辑</button>
          <button id="storyTitleAdminLockV16" type="button" class="suite-button secondary">锁定</button>
        </div>
        <div id="storyTitleAdminStatusV16" class="suite-status" role="status" aria-live="polite"></div>
      </div>`;
    const anchor = host.querySelector('.story-title-toolbar-v1');
    if (anchor) anchor.insertAdjacentElement('beforebegin', gate);
    else host.prepend(gate);

    const password = gate.querySelector('#storyTitleAdminPasswordV16');
    const unlockButton = gate.querySelector('#storyTitleAdminUnlockV16');
    const lockButton = gate.querySelector('#storyTitleAdminLockV16');
    const status = gate.querySelector('#storyTitleAdminStatusV16');

    function setDisabled(control, disabled) {
      if (control && control.disabled !== disabled) control.disabled = disabled;
    }

    function setStatus(message, kind = 'info') {
      if (!status) return;
      status.textContent = message;
      status.dataset.kind = kind;
    }

    function enforceLockState() {
      document.documentElement.dataset.storyTitlePasswordV1 = LEGACY_RELEASE;
      document.documentElement.dataset.storyTitlePasswordV16 = RELEASE;
      document.documentElement.dataset.storyTitleAdminUnlocked = String(unlocked);
      gate.dataset.unlocked = String(unlocked);
      for (const selector of PROTECTED_SELECTORS) setDisabled(document.querySelector(selector), !unlocked);
      for (const field of list.querySelectorAll('[data-title-field]')) setDisabled(field, !unlocked);
      setDisabled(unlockButton, unlocked);
      setDisabled(lockButton, !unlocked);
      if (password) {
        setDisabled(password, unlocked);
        if (unlocked) password.value = '';
      }
      setStatus(
        unlocked
          ? '管理员权限已解锁。本标签页可以修改、导入、保存和导出校对结果。'
          : '当前为只读模式。公开用户不能修改或保存故事标题。',
        unlocked ? 'success' : 'info'
      );
    }

    async function unlock() {
      const value = String(password?.value || '');
      if (!value) {
        setStatus('请输入管理员密码。', 'error');
        password?.focus();
        return false;
      }
      setDisabled(unlockButton, true);
      try {
        if (await sha256(value) !== HASH) {
          unlocked = false;
          try { sessionStorage.removeItem(SESSION_KEY); } catch { /* optional */ }
          enforceLockState();
          setStatus('密码错误，编辑权限未开放。', 'error');
          password?.select();
          password?.focus();
          return false;
        }
        unlocked = true;
        try { sessionStorage.setItem(SESSION_KEY, 'unlocked'); } catch { /* optional */ }
        enforceLockState();
        return true;
      } finally {
        if (!unlocked) setDisabled(unlockButton, false);
      }
    }

    function lock() {
      unlocked = false;
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* optional */ }
      enforceLockState();
      password?.focus();
    }

    unlockButton?.addEventListener('click', () => unlock().catch(error => setStatus(`解锁失败：${error.message || error}`, 'error')));
    lockButton?.addEventListener('click', lock);
    password?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      unlock().catch(error => setStatus(`解锁失败：${error.message || error}`, 'error'));
    });

    observer = new MutationObserver(enforceLockState);
    observer.observe(list, { childList: true, subtree: true });
    enforceLockState();

    const api = Object.freeze({
      release: LEGACY_RELEASE,
      featureRelease: RELEASE,
      isUnlocked: () => unlocked,
      unlock,
      lock,
      enforceLockState
    });
    global.__STORY_TITLE_PASSWORD_V1__ = api;
    global.__STORY_TITLE_PASSWORD_V16__ = api;
    return api;
  }

  /* Intercept only the archived legacy gate, then immediately restore appendChild. */
  const originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function appendChildV16(node) {
    const source = node?.tagName === 'SCRIPT' ? String(node.textContent || '') : '';
    if (this === document.head && /sourceURL=public\/myfile\/story-title-password-v1\.js/u.test(source)) {
      Node.prototype.appendChild = originalAppendChild;
      installGate();
      return node;
    }
    return originalAppendChild.call(this, node);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installGate, { once: true });
  else installGate();
})(window);
