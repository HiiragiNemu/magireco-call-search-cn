import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = process.env.EXPECTED_RELEASE || 'live-regression-repair-v12-20260818';
const EXPECTED_TEXT = 'LCHTSTEMICH';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

function fatal(errors) {
  return errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text));
}

async function newPage(browser, route, viewport) {
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}${route}${route.includes('?') ? '&' : '?'}v12=${Date.now()}`, {
    waitUntil: 'domcontentloaded', timeout: 90000
  });
  return { page, errors };
}

async function callAndHeightTest(browser) {
  const { page, errors } = await newPage(browser, '/', {
    width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false
  });

  await page.waitForFunction(() => document.readyState === 'complete'
    && window.__MAGIRECO_LIVE_V12__
    && window.__MAGIRECO_CALL_UI_V10__
    && window.__MAGIRECO_CORRECTION_V2__
    && typeof window.displayHeightChart === 'function'
    && document.querySelectorAll('input.MagicalChk[name="chara"]').length >= 180,
  { timeout: 60000 });
  await sleep(350);

  const chrome = await page.evaluate(async () => {
    const nav = document.querySelector('.suite-nav');
    const rail = document.querySelector('.call-quick-rail-v10');
    const legacy = ['pagetop', 'pagemdl', 'pagebtm'].map((id) => {
      const node = document.getElementById(id);
      return {
        id,
        exists: Boolean(node),
        hidden: Boolean(node?.hidden),
        display: node ? getComputedStyle(node).display : 'missing',
        visibility: node ? getComputedStyle(node).visibility : 'missing'
      };
    });
    const beforeTop = nav?.getBoundingClientRect().top;
    window.scrollTo(0, Math.min(1900, document.documentElement.scrollHeight - innerHeight - 20));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterTop = nav?.getBoundingClientRect().top;
    return {
      release: document.body.dataset.build,
      apiRelease: window.__MAGIRECO_LIVE_V12__.release,
      navParent: nav?.parentElement?.tagName || '',
      navPosition: nav ? getComputedStyle(nav).position : '',
      beforeTop,
      afterTop,
      scrollY,
      railButtons: [...(rail?.querySelectorAll('button') || [])].map((button) => button.textContent.trim()),
      railLabels: [...(rail?.querySelectorAll('button') || [])].map((button) => button.getAttribute('aria-label')),
      legacy,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });

  assert(chrome.release === EXPECTED_RELEASE && chrome.apiRelease === EXPECTED_RELEASE,
    'call page exposes V12 release markers', chrome);
  assert(chrome.navParent === 'BODY' && chrome.navPosition === 'sticky'
    && chrome.scrollY > 400 && Math.abs(chrome.afterTop) <= 2,
  'call suite navigation follows document scrolling like the suite pages', chrome);
  assert(chrome.railButtons.join('') === '↑角筛属搜图表高↓'
    && chrome.railLabels.length === 9,
  'new nine-action rail remains the complete call-page shortcut set', chrome);
  assert(chrome.legacy.every((item) => item.exists && item.hidden && item.display === 'none'),
    'legacy three right-side buttons are hard-disabled instead of competing with the new rail', chrome.legacy);
  assert(chrome.documentWidth <= chrome.viewportWidth + 3,
    'call page remains horizontally contained after moving the sticky navigation', chrome);

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const wanted = ['环彩羽', '七海八千代', '由比鹤乃', '二叶莎奈', '深月菲莉希亚'];
    for (const input of document.querySelectorAll('input.MagicalChk[name="chara"]')) input.checked = false;
    for (const label of document.querySelectorAll('label.girlbox')) {
      const compact = label.textContent.replace(/\s+/g, '');
      if (wanted.some((name) => compact.includes(name))) {
        const input = label.querySelector('input.MagicalChk[name="chara"]');
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    window.displayHeightChart('selected', 'age');
  });
  await page.waitForFunction(() => document.querySelectorAll('.height-point-v2').length >= 4
    && document.querySelector('.height-chart-stage-v2'), { timeout: 30000 });
  await sleep(250);
  await page.evaluate(() => window.__MAGIRECO_LIVE_V12__.fitHeightViewports());
  await sleep(120);

  const height = await page.evaluate(async () => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const stage = viewport?.querySelector('.height-chart-stage-v2');
    const surface = viewport?.querySelector('.height-chart-surface-v2');
    const plot = viewport?.querySelector('.height-plot-v2');
    const viewportRect = viewport?.getBoundingClientRect();
    const stageRect = stage?.getBoundingClientRect();
    const surfaceRect = surface?.getBoundingClientRect();
    const save = window.__MAGIRECO_HEIGHT_EXPORT_V11__ || window.__MAGIRECO_HEIGHT_EXPORT_V10__;
    const exportCanvas = save?.renderExportCanvas ? await save.renderExportCanvas() : null;
    return {
      viewportHeight: viewportRect?.height || 0,
      stageHeight: stageRect?.height || 0,
      surfaceHeight: surfaceRect?.height || 0,
      plotHeight: plot?.getBoundingClientRect().height || 0,
      blankTail: Math.max(0, (viewportRect?.height || 0) - (stageRect?.height || 0)),
      overflowX: viewport ? getComputedStyle(viewport).overflowX : '',
      overflowY: viewport ? getComputedStyle(viewport).overflowY : '',
      resize: viewport ? getComputedStyle(viewport).resize : '',
      autoHeight: viewport?.dataset.v12AutoHeight || '',
      points: viewport?.querySelectorAll('.height-point-v2').length || 0,
      leftAxes: Number(exportCanvas?.dataset.exportLeftAxes || 0),
      rightAxes: Number(exportCanvas?.dataset.exportRightAxes || 0),
      exportWidth: exportCanvas?.width || 0,
      exportHeight: exportCanvas?.height || 0
    };
  });

  assert(height.points >= 4 && height.autoHeight === 'true'
    && height.viewportHeight >= height.stageHeight - 2
    && height.blankTail <= 28,
  'desktop height viewport self-sizes to the scaled chart instead of reserving a giant blank lower area', height);
  assert(height.overflowY === 'hidden' && height.resize === 'none',
    'height chart no longer exposes a manually resizable vertical blank box', height);
  assert(height.leftAxes === 1 && height.rightAxes === 1 && height.exportWidth > 0 && height.exportHeight > 0,
    'V12 keeps the established high-resolution height export with exactly two outer rulers', height);
  assert(fatal(errors).length === 0, 'call/height V12 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/live-v12-call-height.png', fullPage: false });
  await page.close();
}

async function installSyntheticComplexLine(page) {
  await page.evaluate(async () => {
    const templates = await window.__RUNE_TEMPLATE_V7__.buildTemplates();
    const templateMap = new Map(templates.map((entry) => [entry.character.toUpperCase(), entry.mask]));
    const text = 'LCH TSTE MICH';
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 480;
    const context = canvas.getContext('2d');

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#08060a');
    gradient.addColorStop(.5, '#32172f');
    gradient.addColorStop(1, '#09070b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.globalAlpha = .3;
    for (let index = 0; index < 150; index += 1) {
      const x = (index * 97) % canvas.width;
      const y = (index * 53) % canvas.height;
      context.fillStyle = index % 2 ? '#9a4f86' : '#e7b7d7';
      context.beginPath();
      context.arc(x, y, 2 + index % 7, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.strokeStyle = '#fff';
    context.lineWidth = 14;
    context.beginPath(); context.moveTo(0, 28); context.lineTo(canvas.width, 28); context.stroke();
    context.beginPath(); context.moveTo(0, canvas.height - 28); context.lineTo(canvas.width, canvas.height - 28); context.stroke();
    context.strokeStyle = '#f0d8a0';
    context.lineWidth = 8;
    for (const [cx, cy] of [[70, 74], [1210, 74], [70, 406], [1210, 406]]) {
      for (let ring = 0; ring < 3; ring += 1) {
        context.beginPath();
        context.arc(cx, cy, 18 + ring * 13, 0, Math.PI * 2);
        context.stroke();
      }
    }

    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = 64;
    glyphCanvas.height = 64;
    const glyphContext = glyphCanvas.getContext('2d');
    const glyphSize = 76;
    const characterGap = 15;
    const wordGap = 48;
    const y = 198;
    let x = 98;
    const lineStart = x;
    for (const character of text) {
      if (character === ' ') { x += wordGap; continue; }
      const mask = templateMap.get(character);
      if (!mask) throw new Error(`Missing synthetic template: ${character}`);
      const image = glyphContext.createImageData(64, 64);
      for (let pixel = 0; pixel < mask.length; pixel += 1) {
        if (!mask[pixel]) continue;
        const offset = pixel * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = 255;
      }
      glyphContext.clearRect(0, 0, 64, 64);
      glyphContext.putImageData(image, 0, 0);
      context.imageSmoothingEnabled = false;
      context.drawImage(glyphCanvas, x, y, glyphSize, glyphSize);
      x += glyphSize + characterGap;
    }
    const lineEnd = x - characterGap;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'complex-LCH-TSTE-MICH.png', { type: 'image/png' }));
    const field = document.getElementById('runesFile');
    field.files = transfer.files;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    window.__V12_SYNTHETIC_LINE__ = { lineStart, lineEnd, y, glyphSize, width: canvas.width, height: canvas.height };
  });
  await page.waitForFunction(() => window.__RUNE_MASK_V9__.state.workingFile
    && document.getElementById('runesPreview').complete
    && document.getElementById('runesMaskCanvas').width > 1000,
  { timeout: 30000 });
}

async function waitRecognition(page, timeout = 420000) {
  await page.waitForFunction(() => {
    const status = document.getElementById('runesStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout });
  await sleep(220);
  return page.evaluate(() => {
    const canvas = document.getElementById('runesCanvas');
    let grayscaleRatio = 0;
    if (canvas && !canvas.hidden && canvas.width && canvas.height) {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const width = Math.min(canvas.width, 300);
      const height = Math.min(canvas.height, 180);
      const data = context.getImageData(0, 0, width, height).data;
      let grayscale = 0;
      let sampled = 0;
      for (let index = 0; index < data.length; index += 16) {
        const r = data[index], g = data[index + 1], b = data[index + 2];
        if (Math.max(r, g, b) - Math.min(r, g, b) <= 3) grayscale += 1;
        sampled += 1;
      }
      grayscaleRatio = sampled ? grayscale / sampled : 0;
    }
    return {
      kind: document.getElementById('runesStatus').dataset.kind,
      status: document.getElementById('runesStatus').textContent.trim(),
      output: document.getElementById('runesOutput').value.trim(),
      normalized: document.getElementById('runesOutput').value.toUpperCase().replace(/[^A-Z]/g, ''),
      diagnostics: document.getElementById('runesDiagnostics').textContent.trim(),
      processedHidden: Boolean(canvas?.hidden),
      processedWidth: canvas?.width || 0,
      processedHeight: canvas?.height || 0,
      grayscaleRatio
    };
  });
}

async function runeRollbackTest(browser) {
  const { page, errors } = await newPage(browser, '/runes.html', {
    width: 1440, height: 940, deviceScaleFactor: 1, isMobile: false, hasTouch: false
  });

  await page.waitForFunction(() => document.readyState === 'complete'
    && window.__RUNE_TEMPLATE_V7__
    && window.__RUNE_MASK_V9__
    && document.getElementById('runesRecognize')
    && document.getElementById('runesMaskCanvas'),
  { timeout: 60000 });
  await sleep(350);

  const stack = await page.evaluate(() => ({
    release: document.body.dataset.build,
    scripts: [...document.scripts].map((script) => script.getAttribute('src') || '').filter(Boolean),
    hasV10Global: Boolean(window.__RUNE_V10__),
    hasV11Global: Boolean(window.__RUNE_V11__),
    hasV9: Boolean(window.__RUNE_MASK_V9__),
    hasV7: Boolean(window.__RUNE_TEMPLATE_V7__),
    maskControls: Boolean(document.getElementById('runesMaskControlsV9')),
    referenceClosed: !document.getElementById('runesReferenceDetailsV9')?.open
  }));

  assert(stack.release === EXPECTED_RELEASE && stack.hasV9 && stack.hasV7,
    'rune page keeps the V12 shell while restoring the first paint-mask recognizer core', stack);
  assert(!stack.scripts.some((src) => /runes-(?:v10|line-v10|v11)\.js/u.test(src))
    && !stack.hasV10Global && !stack.hasV11Global,
  'later alphabet-specialized V10/V11 recognition overrides are not active', stack);
  assert(stack.maskControls && stack.referenceClosed,
    'the newer mask/reference UI remains intact after recognition-technology rollback', stack);

  await installSyntheticComplexLine(page);
  if (!await page.$eval('#runesMaskEnabled', (node) => node.checked)) await page.click('#runesMaskEnabled');
  await page.evaluate(() => {
    const api = window.__RUNE_MASK_V9__;
    const line = window.__V12_SYNTHETIC_LINE__;
    api.clear();
    api.addStroke([
      { x: line.lineStart - 18, y: line.y + line.glyphSize / 2 },
      { x: line.lineEnd + 18, y: line.y + line.glyphSize / 2 }
    ], line.glyphSize * 1.45, 'paint');
    document.getElementById('runesLayout').value = 'auto';
  });

  const mask = await page.evaluate(async () => {
    const api = window.__RUNE_MASK_V9__;
    const source = document.getElementById('runesFile').files[0];
    const metrics = api.maskMetrics();
    const built = await api.buildMaskedFile(source);
    return {
      metrics,
      width: built.width,
      height: built.height,
      sourceWidth: api.state.sourceWidth,
      sourceHeight: api.state.sourceHeight,
      foregroundRatio: built.foregroundRatio,
      threshold: built.threshold,
      fileSize: built.file.size
    };
  });

  assert(mask.width < mask.sourceWidth && mask.height < mask.sourceHeight
    && mask.width > 700 && mask.height > 60 && mask.fileSize > 1000,
  'paint-mask preprocessing produces a cropped OCR image instead of silently reusing the original image', mask);
  assert(mask.foregroundRatio > .005 && mask.foregroundRatio < .65,
    'mask preprocessing yields a nontrivial binary foreground region', mask);

  await page.click('#runesRecognize');
  const recognition = await waitRecognition(page);
  assert(recognition.kind === 'success' && recognition.normalized === EXPECTED_TEXT,
    'restored first-mask technology recognizes LCH TSTE MICH on a decorated complex background', recognition);
  assert(!recognition.processedHidden && recognition.processedWidth > 0 && recognition.processedHeight > 0
    && recognition.grayscaleRatio > .94,
  'processed-image panel now shows actual grayscale/binary preprocessing rather than another copy of the original', recognition);
  assert(fatal(errors).length === 0, 'rune V12 rollback path has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/live-v12-runes.png', fullPage: false });
  await page.close();
}

async function suiteSanity(browser) {
  for (const route of ['/story.html', '/attendance.html']) {
    const { page, errors } = await newPage(browser, route, {
      width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true
    });
    await page.waitForFunction(() => document.readyState === 'complete'
      && document.querySelectorAll('.suite-nav a').length === 4
      && document.querySelectorAll('.suite-character-card').length >= 180,
    { timeout: 60000 });
    const audit = await page.evaluate(() => ({
      release: document.body.dataset.build,
      nav: [...document.querySelectorAll('.suite-nav a')].map((a) => a.textContent.trim()),
      cards: document.querySelectorAll('.suite-character-card').length,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    }));
    assert(audit.release === EXPECTED_RELEASE && audit.nav.length === 4 && audit.cards >= 180,
      `suite page ${route} keeps its catalog/navigation`, audit);
    assert(audit.documentWidth <= audit.viewportWidth + 3,
      `suite page ${route} remains horizontally contained`, audit);
    assert(fatal(errors).length === 0, `suite page ${route} has no fatal JavaScript errors`, errors);
    await page.close();
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 900000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  await callAndHeightTest(browser);
  await runeRollbackTest(browser);
  await suiteSanity(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
