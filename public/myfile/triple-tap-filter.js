/* Triple-tap/click relationship filtering for character icons. */
(function (global) {
  'use strict';

  const TAP_WINDOW_MS = 850;
  const MOVE_LIMIT_PX = 12;
  const sequence = { target: null, count: 0, firstAt: 0, lastAt: 0 };
  const pointers = new Map();
  let resetTimer = 0;
  let toastTimer = 0;

  function characterInput(target) {
    if (!(target instanceof Element)) return null;
    if (target.matches('input.MagicalChk[name="chara"]')) return target;
    const label = target.closest('label.girlbox');
    return label ? label.querySelector('input.MagicalChk[name="chara"]') : null;
  }

  function labelFor(input) {
    return input?.closest('label.girlbox') || null;
  }

  function clearSequence() {
    sequence.target = null;
    sequence.count = 0;
    sequence.firstAt = 0;
    sequence.lastAt = 0;
    global.clearTimeout(resetTimer);
  }

  function ensureToast() {
    let toast = document.getElementById('tripleTapFilterToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tripleTapFilterToast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.className = 'call-status-toast';
    }
    const host = document.querySelector('.call-display-root-v7') || document.body;
    if (toast.parentElement !== host) host.appendChild(toast);
    return toast;
  }

  function showToast(message, duration = 950) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.classList.add('is-visible');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, duration);
  }

  function pulse(label, count) {
    if (!label) return;
    label.dataset.tripleTapCount = String(count);
    if (!global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      label.animate(
        [
          { boxShadow: '0 0 0 0 currentColor' },
          { boxShadow: '0 0 0 7px transparent' }
        ],
        { duration: 270, easing: 'ease-out' }
      );
    }
    global.setTimeout(() => {
      if (label.dataset.tripleTapCount === String(count)) delete label.dataset.tripleTapCount;
    }, 500);
  }

  function runFilter(input) {
    if (typeof global.mgirlCallNarrow !== 'function') return;
    input.checked = true;
    global.mgirlCallNarrow(input);
    const canonical = global.MagirecoNameUtils?.canonicalFromCheckbox?.(input)
      || input.value
      || input.id;
    showToast(`已按当前方向筛选：${canonical}`, 1350);
  }

  function registerTap(input, event) {
    const now = performance.now();
    const same = sequence.target === input;
    const within = same && now - sequence.lastAt <= TAP_WINDOW_MS && now - sequence.firstAt <= TAP_WINDOW_MS * 1.7;

    if (!within) {
      sequence.target = input;
      sequence.count = 1;
      sequence.firstAt = now;
    } else {
      sequence.count += 1;
    }
    sequence.lastAt = now;
    global.clearTimeout(resetTimer);
    resetTimer = global.setTimeout(clearSequence, TAP_WINDOW_MS + 90);

    const label = labelFor(input);
    pulse(label, sequence.count);
    if (sequence.count === 2) {
      showToast('再点击同一角色一次即可按称呼关系筛选', 820);
    } else if (sequence.count >= 3) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      global.setTimeout(() => runFilter(input), 0);
      clearSequence();
    }
  }

  document.addEventListener('pointerdown', (event) => {
    const input = characterInput(event.target);
    if (!input) return;
    pointers.set(event.pointerId, {
      input,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      at: performance.now()
    });
  }, true);

  document.addEventListener('pointermove', (event) => {
    const state = pointers.get(event.pointerId);
    if (!state) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > MOVE_LIMIT_PX) state.moved = true;
  }, true);

  document.addEventListener('pointercancel', (event) => pointers.delete(event.pointerId), true);
  document.addEventListener('pointerup', (event) => {
    const state = pointers.get(event.pointerId);
    if (!state) return;
    pointers.delete(event.pointerId);
    if (state.moved || performance.now() - state.at > 700) return;
    state.input.dataset.validTripleTapPointer = String(Math.round(performance.now()));
  }, true);

  document.addEventListener('click', (event) => {
    const input = characterInput(event.target);
    if (!input) return;

    const pointerAt = Number(input.dataset.validTripleTapPointer || 0);
    delete input.dataset.validTripleTapPointer;
    const pointerValid = pointerAt && Math.abs(performance.now() - pointerAt) < 900;
    const keyboardClick = event.detail === 0;
    if (!pointerValid && !keyboardClick) return;

    registerTap(input, event);
  }, true);

  document.addEventListener('dblclick', (event) => {
    if (!characterInput(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  const READING_TIP_ID = 'call-character-reading-tip';
  const TAP_HINT = '三击此角色：按上方“称呼/被称呼”方向筛选';
  let readingLabel = null;
  let readingTip = null;
  let savedTitle = '';

  function readingDescription(label) {
    const kana = (label.dataset.kana || '').trim();
    const extra = (label.title || '').split('\n').filter(s => s && s !== TAP_HINT && !s.startsWith('日文读音：'));
    return [kana ? `日文读音：${kana}` : '', ...extra, TAP_HINT].filter(Boolean).join('\n');
  }

  function hideReading() {
    if (readingLabel) {
      readingLabel.title = savedTitle;
      delete readingLabel.dataset.callReadingOpen;
      const input = readingLabel.querySelector('input.MagicalChk[name="chara"]');
      const ids = (input?.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== READING_TIP_ID);
      if (ids.length) input?.setAttribute('aria-describedby', ids.join(' '));
      else input?.removeAttribute('aria-describedby');
    }
    if (readingTip) readingTip.hidden = true;
    readingLabel = null;
  }

  function showReading(target) {
    const input = characterInput(target), label = labelFor(input);
    const host = document.querySelector('.call-display-root-v7');
    if (!label || !host || readingLabel === label) return;
    hideReading();
    if (!readingTip) {
      readingTip = document.createElement('div');
      readingTip.id = READING_TIP_ID;
      readingTip.className = 'call-character-reading-tip';
      readingTip.setAttribute('role', 'tooltip');
    }
    host.appendChild(readingTip);
    savedTitle = readingDescription(label);
    readingTip.textContent = savedTitle;
    readingLabel = label;
    label.dataset.callReadingReady = 'true';
    label.dataset.callReadingOpen = 'true';
    // Preserve the native fallback on exit, but do not paint a second white box.
    label.removeAttribute('title');
    const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    input.setAttribute('aria-describedby', [...new Set([...ids, READING_TIP_ID])].join(' '));
    readingTip.hidden = false;
    readingTip.style.visibility = 'hidden';
    readingTip.style.maxWidth = Math.max(0, host.clientWidth - 20) + 'px';
    const card = label.getBoundingClientRect(), surface = host.getBoundingClientRect();
    const width = readingTip.offsetWidth, height = readingTip.offsetHeight;
    const above = card.top - surface.top - height - 7;
    const left = Math.min(Math.max(10, card.left - surface.left + (card.width - width) / 2), Math.max(10, host.clientWidth - width - 10));
    const top = Math.min(Math.max(10, above >= 10 ? above : card.bottom - surface.top + 7), Math.max(10, host.clientHeight - height - 10));
    readingTip.style.left = left + 'px';
    readingTip.style.top = top + 'px';
    readingTip.style.visibility = 'visible';
  }

  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'touch') showReading(event.target);
  });
  document.addEventListener('pointerout', event => {
    if (readingLabel?.contains(event.target) && !readingLabel.contains(event.relatedTarget)) hideReading();
  });
  document.addEventListener('focusin', event => showReading(event.target));
  document.addEventListener('focusout', event => {
    if (readingLabel?.contains(event.target) && !readingLabel.contains(event.relatedTarget)) hideReading();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideReading(); });
  document.addEventListener('scroll', hideReading, true);
  global.addEventListener('resize', hideReading);
  global.addEventListener('magireco-call-theme-change', hideReading);

  function prepareLabels() {
    for (const input of document.querySelectorAll('input.MagicalChk[name="chara"]')) {
      input.removeAttribute('ondblclick');
      const label = labelFor(input);
      if (!label) continue;
      label.style.touchAction = 'manipulation';
      label.style.userSelect = 'none';
      label.dataset.callReadingReady = 'true';
      label.title = readingDescription(label);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepareLabels, { once: true });
  } else {
    prepareLabels();
  }

  global.MagirecoTripleTapFilter = Object.freeze({
    TAP_WINDOW_MS,
    clearSequence,
    prepareLabels,
    registerTap
  });
})(window);
