/* V13: route ordinary rune OCR through the full Tesseract ensemble.
 * The V7 template recognizer is intentionally kept only for the explicit
 * standard-rune chart mode where deterministic row-major decoding is useful.
 */
(function (global) {
  'use strict';

  const RELEASE = 'rune-engine-router-v13-20260818';
  let retries = 0;

  function shouldUseTemplate() {
    const layout = document.getElementById('runesLayout')?.value || 'auto';
    const preprocess = document.getElementById('runesPreprocess')?.value || 'auto';
    const model = document.getElementById('runesModel')?.value || 'mdk';

    // The template engine performs its own binary preprocessing and therefore
    // must never override an explicit preprocessing choice such as "original".
    // It is also trained only against the standard MadokaRunes reference chart.
    return layout === 'chart' && preprocess === 'auto' && model === 'mdk';
  }

  function install() {
    const templateButton = document.getElementById('runesRecognizeV7');
    const classicButton = document.getElementById('runesRecognizeLegacyV7');

    if (!templateButton || !classicButton) {
      if (retries < 20) {
        retries += 1;
        global.setTimeout(install, 25);
      }
      return;
    }
    if (templateButton.dataset.engineRouterV13 === 'true') return;

    templateButton.dataset.engineRouterV13 = 'true';
    templateButton.addEventListener('click', (event) => {
      if (shouldUseTemplate()) return;

      // Stop the V7 fast-template handler before it can generate a misleading
      // binary preview/result. The legacy button is the full V6 Tesseract
      // ensemble; it already honors runesPreprocess, runesLayout, model choice,
      // the V9 paint mask override, and renders the actual selected analysis.
      event.preventDefault();
      event.stopImmediatePropagation();
      classicButton.click();
    }, true);

    document.documentElement.dataset.runeEngineV13 = RELEASE;
    global.__RUNE_ENGINE_V13__ = Object.freeze({
      release: RELEASE,
      shouldUseTemplate
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
