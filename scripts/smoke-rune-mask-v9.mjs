import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'rune-mask-v9-20260816';
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

async function waitForPage(page) {
  await page.waitForFunction(() => document.readyState === 'complete'
    && window.__RUNE_TEMPLATE_V7__
    && window.__RUNE_MASK_V9__
    && document.getElementById('runesRecognize')
    && document.getElementById('runesMaskCanvas'),
  { timeout: 40000 });
  await sleep(350);
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
    gradient.addColorStop(.5, '#2b1730');
    gradient.addColorStop(1, '#09070b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.globalAlpha = .28;
    for (let index = 0; index < 110; index += 1) {
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

    context.save();
    context.strokeStyle = '#f0d8a0';
    context.lineWidth = 8;
    for (const [cx, cy] of [[70, 74], [1210, 74], [70, 406], [1210, 406]]) {
      for (let ring = 0; ring < 3; ring += 1) {
        context.beginPath();
        context.arc(cx, cy, 18 + ring * 13, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();

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
      if (character === ' ') {
        x += wordGap;
        continue;
      }
      const mask = templateMap.get(character);
      if (!mask) throw new Error(`Synthetic template missing: ${character}`);
      const image = glyphContext.createImageData(64, 64);
      for (let pixel = 0; pixel < mask.length; pixel += 1) {
        const offset = pixel * 4;
        if (mask[pixel]) {
          image.data[offset] = 255;
          image.data[offset + 1] = 255;
          image.data[offset + 2] = 255;
          image.data[offset + 3] = 255;
        }
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
    window.__V9_SYNTHETIC_LINE__ = { lineStart, lineEnd, y, glyphSize, width: canvas.width, height: canvas.height };
  });
  await page.waitForFunction(() => window.__RUNE_MASK_V9__.state.workingFile
    && document.getElementById('runesPreview').complete
    && document.getElementById('runesMaskCanvas').width > 1000,
  { timeout: 30000 });
}

async function desktopTest(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 940, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}/runes.html?v9-desktop=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForPage(page);

  const initial = await page.evaluate(() => {
    const reference = document.getElementById('runesReferenceDetailsV9');
    const pair = document.querySelector('.runes-preview-pair-v9');
    const columns = getComputedStyle(pair).gridTemplateColumns.split(/\s+/).filter(Boolean);
    return {
      release: document.body.dataset.build,
      maskRelease: window.__RUNE_MASK_V9__.release,
      controls: Boolean(document.getElementById('runesMaskControlsV9')),
      referenceClosed: Boolean(reference && !reference.open),
      columns: columns.length,
      guidance: document.querySelector('.runes-mask-guidance-v9')?.textContent || '',
      oldInternalCopy: document.body.textContent.includes('V6 会比较原图')
        || document.body.textContent.includes('V7 segmented-template')
    };
  });
  assert(initial.release === EXPECTED_RELEASE && initial.maskRelease === EXPECTED_RELEASE,
    'desktop V9 release markers', initial);
  assert(initial.controls && initial.referenceClosed && initial.columns === 2,
    'desktop exposes mask controls, a collapsed reference and side-by-side images', initial);
  assert(/涂抹蒙版/u.test(initial.guidance) && !initial.oldInternalCopy,
    'visitor guidance is concise and contains no internal V6/V7 implementation prose', initial);

  await installSyntheticComplexLine(page);
  await page.click('#runesMaskEnabled');
  await page.$eval('#runesMaskStage', (stage) => stage.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await sleep(180);

  const overlayRect = await page.$eval('#runesMaskCanvas', (canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  await page.mouse.move(overlayRect.left + overlayRect.width * .2, overlayRect.top + overlayRect.height * .52);
  await page.mouse.down();
  await page.mouse.move(overlayRect.left + overlayRect.width * .3, overlayRect.top + overlayRect.height * .52, { steps: 8 });
  await page.mouse.up();
  const pointerAudit = await page.evaluate(() => ({
    commands: window.__RUNE_MASK_V9__.state.commands.length,
    metrics: window.__RUNE_MASK_V9__.maskMetrics()
  }));
  assert(pointerAudit.commands >= 1 && pointerAudit.metrics?.pixels > 0,
    'mouse/pointer painting creates a real mask command', pointerAudit);

  await page.click('#runesMaskUndo');
  await page.evaluate(() => {
    const line = window.__V9_SYNTHETIC_LINE__;
    const api = window.__RUNE_MASK_V9__;
    api.clear();
    api.addStroke([
      { x: line.lineStart - 18, y: line.y + line.glyphSize / 2 },
      { x: line.lineEnd + 18, y: line.y + line.glyphSize / 2 }
    ], line.glyphSize * 1.45, 'paint');
  });

  const maskAudit = await page.evaluate(async () => {
    const api = window.__RUNE_MASK_V9__;
    const metrics = api.maskMetrics();
    const built = await api.buildMaskedFile(document.getElementById('runesFile').files[0]);
    return {
      metrics,
      outputWidth: built.width,
      outputHeight: built.height,
      polarity: built.polarity,
      threshold: built.threshold,
      foregroundRatio: built.foregroundRatio,
      sourceWidth: api.state.sourceWidth,
      sourceHeight: api.state.sourceHeight,
      fileSize: built.file.size
    };
  });
  assert(maskAudit.metrics.top > 100 && maskAudit.metrics.bottom < 380,
    'painted mask excludes the strong top and bottom borders', maskAudit);
  assert(maskAudit.outputHeight < maskAudit.sourceHeight && maskAudit.outputWidth > 700 && maskAudit.fileSize > 1000,
    'masked OCR input is cropped to a substantial clean text region', maskAudit);

  await page.select('#runesLayout', 'line');
  await page.click('#runesRecognize');
  await page.waitForFunction(() => document.getElementById('runesStatus')?.dataset.kind === 'success'
    || document.getElementById('runesStatus')?.dataset.kind === 'error',
  { timeout: 420000 });
  await sleep(250);

  const recognition = await page.evaluate(() => ({
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    normalized: document.getElementById('runesOutput').value.toUpperCase().replace(/[^A-Z]/g, ''),
    processedHidden: document.getElementById('runesCanvas').hidden,
    overrideCleared: window.__RUNE_INPUT_OVERRIDE_V9__ === undefined,
    maskStatus: document.getElementById('runesMaskStatus').textContent.trim(),
    diagnostics: document.getElementById('runesDiagnostics').textContent.trim()
  }));
  assert(recognition.kind === 'success' && recognition.normalized === EXPECTED_TEXT,
    'painted complex background recognizes LCH TSTE MICH in reading order', recognition);
  assert(!recognition.processedHidden && recognition.overrideCleared && /蒙版已送入识别/u.test(recognition.maskStatus),
    'processed image is visible and the temporary OCR override is cleaned up', recognition);

  await page.evaluate(() => { document.getElementById('runesReferenceDetailsV9').open = true; });
  await sleep(100);
  const referenceAudit = await page.evaluate(() => {
    const image = document.querySelector('#runesReferenceDetailsV9 .runes-reference');
    const rect = image.getBoundingClientRect();
    return {
      displayedWidth: rect.width,
      displayedHeight: rect.height,
      viewportHeight: innerHeight,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight
    };
  });
  assert(referenceAudit.displayedWidth <= 862 && referenceAudit.displayedHeight <= referenceAudit.viewportHeight * .7,
    'reference chart is size-capped instead of filling and blurring the PC screen', referenceAudit);

  const pageAudit = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    fatalText: document.body.textContent.includes('V6 会比较原图')
  }));
  assert(pageAudit.scrollWidth <= pageAudit.innerWidth + 3 && !pageAudit.fatalText,
    'desktop V9 has no document-level horizontal overflow or internal notice', pageAudit);
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'desktop V9 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/rune-mask-v9-desktop.png', fullPage: false });
  await page.close();
}

async function mobileTest(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE_URL}/runes.html?v9-mobile=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForPage(page);
  await installSyntheticComplexLine(page);
  await page.click('#runesMaskEnabled');

  const mobile = await page.evaluate(() => {
    const pair = document.querySelector('.runes-preview-pair-v9');
    const columns = getComputedStyle(pair).gridTemplateColumns.split(/\s+/).filter(Boolean);
    const stage = document.getElementById('runesMaskStage');
    const reference = document.getElementById('runesReferenceDetailsV9');
    return {
      release: document.body.dataset.build,
      columns: columns.length,
      touchAction: getComputedStyle(stage).touchAction,
      referenceClosed: !reference.open,
      controlsWidth: document.getElementById('runesMaskControlsV9').getBoundingClientRect().width,
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  assert(mobile.release === EXPECTED_RELEASE && mobile.columns === 1 && mobile.referenceClosed,
    'mobile stacks original and processed images and keeps reference collapsed', mobile);
  assert(mobile.touchAction === 'none' && mobile.controlsWidth <= mobile.viewportWidth
    && mobile.scrollWidth <= mobile.viewportWidth + 3,
  'mobile painting captures touch without creating horizontal overflow', mobile);

  await page.evaluate(() => {
    const api = window.__RUNE_MASK_V9__;
    const line = window.__V9_SYNTHETIC_LINE__;
    api.addStroke([
      { x: line.lineStart, y: line.y + line.glyphSize / 2 },
      { x: line.lineEnd, y: line.y + line.glyphSize / 2 }
    ], line.glyphSize * 1.35, 'paint');
  });
  const mobileMask = await page.evaluate(() => window.__RUNE_MASK_V9__.maskMetrics());
  assert(mobileMask?.pixels > 0 && mobileMask.coverage < .5,
    'mobile/programmatic brush keeps a focused region rather than the whole image', mobileMask);
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'mobile V9 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/rune-mask-v9-mobile.png', fullPage: false });
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  await desktopTest(browser);
  await mobileTest(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
