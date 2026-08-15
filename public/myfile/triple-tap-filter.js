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
      Object.assign(toast.style, {
        position: 'fixed',
        left: '50%',
        bottom: '18px',
        zIndex: '100000',
        transform: 'translate(-50%, 14px)',
        maxWidth: 'min(92vw, 520px)',
        padding: '9px 13px',
        border: '2px solid #f558ad',
        borderRadius: '999px',
        background: 'rgba(255,255,255,.97)',
        color: '#6b1948',
        boxShadow: '0 6px 22px rgba(76,20,50,.24)',
        fontWeight: '700',
        textAlign: 'center',
        opacity: '0',
        pointerEvents: 'none',
        transition: 'opacity .14s ease, transform .14s ease'
      });
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showToast(message, duration = 950) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, 14px)';
    }, duration);
  }

  function pulse(label, count) {
    if (!label) return;
    label.dataset.tripleTapCount = String(count);
    label.animate(
      [
        { boxShadow: '0 0 0 0 rgba(245,88,173,.65)' },
        { boxShadow: '0 0 0 7px rgba(245,88,173,0)' }
      ],
      { duration: 270, easing: 'ease-out' }
    );
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

  function prepareLabels() {
    for (const input of document.querySelectorAll('input.MagicalChk[name="chara"]')) {
      input.removeAttribute('ondblclick');
      const label = labelFor(input);
      if (!label) continue;
      label.style.touchAction = 'manipulation';
      label.style.userSelect = 'none';
      label.title = `${label.title ? `${label.title}\n` : ''}三击此角色：按上方“称呼/被称呼”方向筛选`;
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
