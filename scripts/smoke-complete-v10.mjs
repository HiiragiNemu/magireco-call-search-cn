import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'height-export-title-call-rune-v10-20260817';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COMPLEX_TEXT = 'LCHTSTEMICH';
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

async function open(browser, route, viewport) {
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}${route}${route.includes('?') ? '&' : '?'}v10=${Date.now()}`, {
    waitUntil: 'domcontentloaded', timeout: 90000
  });
  return { page, errors };
}

async function waitOcr(page) {
  await page.waitForFunction(() => document.readyState === 'complete'
    && window.__RUNE_V10__
    && window.__RUNE_MASK_V9__
    && document.getElementById('runesRecognize')?.dataset.runeV10 === 'true',
  { timeout: 60000 });
  await sleep(250);
}

async function assignUrlAsFile(page, url, name) {
  await page.evaluate(async ({ url, name }) => {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}file=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const blob = await response.blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, { type: blob.type || 'image/jpeg' }));
    const input = document.getElementById('runesFile');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { url, name });
  await page.waitForFunction(() => !document.getElementById('runesRecognize').disabled, { timeout: 30000 });
}

async function waitRecognition(page, timeout = 420000) {
  await page.waitForFunction(() => {
    const node = document.getElementById('runesStatus');
    return node?.dataset.kind === 'success' || node?.dataset.kind === 'error';
  }, { timeout });
  await sleep(200);
  return page.evaluate(() => ({
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    normalized: document.getElementById('runesOutput').value.toUpperCase().replace(/[^A-Z]/g, ''),
    diagnostics: document.getElementById('runesDiagnostics').textContent.trim(),
    processedHidden: document.getElementById('runesCanvas').hidden
  }));
}

async function installSyntheticLine(page) {
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
    gradient.addColorStop(.5, '#38172f');
    gradient.addColorStop(1, '#09070b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.globalAlpha = .28;
    for (let index = 0; index < 140; index += 1) {
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
        context.beginPath(); context.arc(cx, cy, 18 + ring * 13, 0, Math.PI * 2); context.stroke();
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
      if (!mask) throw new Error(`Missing synthetic glyph ${character}`);
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
    window.__V10_SYNTHETIC__ = { lineStart, lineEnd, y, glyphSize, width: canvas.width, height: canvas.height };
  });
  await page.waitForFunction(() => window.__RUNE_MASK_V9__.state.workingFile
    && document.getElementById('runesMaskCanvas').width > 1000,
  { timeout: 30000 });
}

async function ocrTest(browser) {
  const { page, errors } = await open(browser, '/runes.html', {
    width: 1280, height: 920, deviceScaleFactor: 1, isMobile: false, hasTouch: false
  });
  await waitOcr(page);
  const initial = await page.evaluate(() => ({
    release: document.body.dataset.build,
    apiRelease: window.__RUNE_V10__.release,
    guidance: document.getElementById('runesGuidanceV10')?.textContent || '',
    chartLabel: document.querySelector('#runesLayout option[value="chart"]')?.textContent || '',
    referenceClosed: !document.getElementById('runesReferenceDetailsV9')?.open
  }));
  assert(initial.release === EXPECTED_RELEASE && initial.apiRelease === EXPECTED_RELEASE,
    'OCR V10 release markers are active', initial);
  assert(/较慢但更准确/u.test(initial.guidance) && /较慢但更准确/u.test(initial.chartLabel) && initial.referenceClosed,
    'OCR explains the slower rule-network path and keeps the reference collapsed', initial);

  await assignUrlAsFile(page, './mdkOCR/madokarunes.jpg', 'alphabet-reference.jpg');
  await page.select('#runesLayout', 'chart');
  await page.click('#runesRecognize');
  const alphabet = await waitRecognition(page);
  assert(alphabet.kind === 'success' && alphabet.normalized === ALPHABET,
    'actual registered alphabet chart is recognized A-Z in row-major order', alphabet);

  await installSyntheticLine(page);
  if (!await page.$eval('#runesMaskEnabled', (node) => node.checked)) await page.click('#runesMaskEnabled');
  await page.evaluate(() => {
    const api = window.__RUNE_MASK_V9__;
    const line = window.__V10_SYNTHETIC__;
    api.clear();
    api.addStroke([
      { x: line.lineStart - 12, y: line.y + line.glyphSize / 2 },
      { x: line.lineEnd + 12, y: line.y + line.glyphSize / 2 }
    ], 26, 'paint');
    document.getElementById('runesLayout').value = 'auto';
  });
  const smartMask = await page.evaluate(async () => {
    const source = document.getElementById('runesFile').files[0];
    const raw = window.__RUNE_MASK_V9__.maskMetrics();
    const expanded = await window.__RUNE_V10__.buildSmartMaskedFile(source);
    return {
      rawHeight: raw.height,
      expandedHeight: expanded.height,
      expandedWidth: expanded.width,
      strategy: expanded.strategy,
      fileSize: expanded.file.size
    };
  });
  assert(smartMask.expandedHeight > smartMask.rawHeight * 2 && smartMask.expandedWidth > 700
    && smartMask.strategy === 'expanded-rectangular-selection' && smartMask.fileSize > 1000,
  'a thin paint stroke expands into a complete text-line selection instead of clipping glyphs', smartMask);

  await page.click('#runesRecognize');
  const complex = await waitRecognition(page);
  assert(complex.kind === 'success' && complex.normalized === COMPLEX_TEXT,
    'masked complex background auto-routes to rule-network and recognizes LCH TSTE MICH', complex);
  assert(!complex.processedHidden && /智能蒙版|规则网络|字母表网格/u.test(complex.diagnostics),
    'OCR exposes a processed image and useful public diagnostics', complex);
  assert(fatal(errors).length === 0, 'OCR V10 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/complete-v10-ocr.png', fullPage: false });
  await page.close();
}

async function callHeightTest(browser) {
  const { page, errors } = await open(browser, '/', {
    width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false
  });
  await page.waitForFunction(() => window.__MAGIRECO_CALL_UI_V10__
    && window.__MAGIRECO_HEIGHT_EXPORT_V10__
    && window.__MAGIRECO_CORRECTION_V2__
    && document.querySelectorAll('input.MagicalChk[name="chara"]').length >= 180
    && document.querySelector('.call-table-details-v10')
    && document.querySelector('.call-help-details-v10'),
  { timeout: 60000 });
  await sleep(350);

  const callAudit = await page.evaluate(() => {
    const searchBody = document.querySelector('.call-search-panel-v8 > .call-panel-body-v8');
    const columns = getComputedStyle(searchBody).gridTemplateColumns.split(/\s+/).filter(Boolean);
    const tableDetails = document.querySelector('.call-table-details-v10');
    const help = document.querySelector('.call-help-details-v10');
    const rail = document.querySelector('.call-quick-rail-v10');
    return {
      release: document.body.dataset.build,
      columns: columns.length,
      tableContainsHost: tableDetails?.contains(document.getElementById('mytable')),
      tableTitle: tableDetails?.querySelector('summary')?.textContent || '',
      helpTitle: help?.querySelector('summary')?.textContent || '',
      helpButton: document.querySelector('.call-help-toggle-v10')?.textContent || '',
      railButtons: [...rail.querySelectorAll('button')].map((button) => button.textContent.trim()),
      railLabels: [...rail.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')),
      oldRailVisible: ['pagetop','pagemdl','pagebtm'].some((id) => !document.getElementById(id)?.hidden)
    };
  });
  assert(callAudit.release === EXPECTED_RELEASE && callAudit.columns === 2,
    'call search controls and help use the PC two-column layout', callAudit);
  assert(callAudit.tableContainsHost && /称呼关系表/u.test(callAudit.tableTitle)
    && /关系图操作说明/u.test(callAudit.helpTitle) && callAudit.helpButton === '操作说明',
  'relationship table and graph help are independently collapsible', callAudit);
  assert(callAudit.railButtons.join('') === '顶角筛属搜图表高底'
    && callAudit.railLabels.includes('执行称呼搜索') && callAudit.railLabels.includes('称呼关系表')
    && !callAudit.oldRailVisible,
  'call page has nine Chinese direct-action shortcuts and hides legacy buttons', callAudit);

  const unknownAudit = await page.evaluate(async () => {
    const api = window.__MAGIRECO_CORRECTION_V2__;
    const modes = ['age', 'school', 'organization'];
    const output = {};
    for (const mode of modes) {
      window.displayHeightChart('global', mode);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      output[mode] = {
        labels: [...document.querySelectorAll('.height-x-axis-label-v2')].map((node) => node.textContent.trim()),
        categories: [...document.querySelectorAll('.height-point-v2')].map((node) => node.dataset.category),
        pointCount: document.querySelectorAll('.height-point-v2').length
      };
    }
    window.displayHeightChart('global', 'age');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      output,
      readout: document.querySelector('[data-height-scale-readout-v2]')?.textContent || '',
      rangeMin: document.querySelector('[data-height-scale-range-v2]')?.min,
      rangeMax: document.querySelector('[data-height-scale-range-v2]')?.max,
      internalScale: api.heightState.scale
    };
  });
  assert(unknownAudit.output.age.labels.includes('无年龄信息')
    && unknownAudit.output.school.labels.includes('无学校信息')
    && unknownAudit.output.organization.labels.includes('无从属组织信息'),
  'height chart exposes explicit missing age, school and organization categories', unknownAudit.output);
  assert(unknownAudit.output.age.categories.includes('__NO_AGE__')
    && unknownAudit.output.school.categories.includes('__NO_SCHOOL__')
    && unknownAudit.output.organization.categories.includes('__NO_ORGANIZATION__'),
  'characters with missing metadata remain visible as plotted points', unknownAudit.output);
  assert(unknownAudit.readout === '100%' && unknownAudit.rangeMin === '50' && unknownAudit.rangeMax === '250'
    && Math.abs(unknownAudit.internalScale - .5) < .001,
  'height zoom uses the compact 100% baseline and 50-250% displayed range', unknownAudit);

  await page.evaluate(() => {
    const wanted = ['环彩羽', '七海八千代', '由比鹤乃', '二叶莎奈'];
    for (const input of document.querySelectorAll('input.MagicalChk[name="chara"]')) input.checked = false;
    for (const label of document.querySelectorAll('label.girlbox')) {
      const text = label.textContent.replace(/\s+/g, '');
      if (wanted.some((name) => text.includes(name))) {
        const input = label.querySelector('input.MagicalChk[name="chara"]');
        if (input) input.checked = true;
      }
    }
    window.displayHeightChart('selected', 'organization');
  });
  await page.waitForFunction(() => document.querySelectorAll('.height-point-v2').length >= 4, { timeout: 30000 });
  const exportAudit = await page.evaluate(async () => {
    const canvas = await window.__MAGIRECO_HEIGHT_EXPORT_V10__.renderExportCanvas();
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: Number(canvas.dataset.exportCssWidth),
      cssHeight: Number(canvas.dataset.exportCssHeight),
      scale: Number(canvas.dataset.exportScale),
      leftAxes: Number(canvas.dataset.exportLeftAxes),
      rightAxes: Number(canvas.dataset.exportRightAxes),
      plotted: document.querySelectorAll('.height-point-v2').length
    };
  });
  assert(exportAudit.plotted >= 4 && exportAudit.width >= exportAudit.cssWidth * 1.9
    && exportAudit.height >= exportAudit.cssHeight * 1.9,
  'selected-character scatter chart exports as a high-DPI full-resolution canvas', exportAudit);
  assert(exportAudit.leftAxes === 1 && exportAudit.rightAxes === 1,
    'height export contains only the outer left and right centimetre rulers', exportAudit);
  assert(fatal(errors).length === 0, 'call and height V10 have no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/complete-v10-call-height.png', fullPage: false });
  await page.close();
}

async function storyAuditTest(browser) {
  const { page, errors } = await open(browser, '/story.html', {
    width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true
  });
  await page.waitForFunction(() => document.querySelectorAll('#storyCharacterGrid .suite-character-card').length >= 180,
  { timeout: 60000 });
  const audit = await page.evaluate(async () => {
    const localization = await fetch(`./data/story-v7/localization.json?audit=${Date.now()}`, { cache: 'no-store' }).then((response) => response.json());
    const titleAudit = await fetch(`./data/story-v10/title-audit.json?audit=${Date.now()}`, { cache: 'no-store' }).then((response) => response.json());
    const known = localization.titleExact['神浜スパアドベンチャー ビーチに渦巻く悪魔の怨嗟 3話'] || '';
    return {
      release: document.body.dataset.build,
      unique: localization.titleAuditV10?.uniqueSourceTitles,
      localized: localization.titleAuditV10?.localizedSourceTitles,
      selfCount: localization.titleAuditV10?.selfTranslatedTitles,
      auditCount: titleAudit.selfTranslations?.length,
      auditDocument: localization.titleAuditV10?.auditDocument,
      exactCount: Object.keys(localization.titleExact || {}).length,
      known
    };
  });
  assert(audit.release === EXPECTED_RELEASE && audit.unique === 5710 && audit.localized === 5710
    && audit.exactCount >= 5710,
  'all 5,710 unique story-search titles have a Chinese display mapping', audit);
  assert(audit.selfCount === audit.auditCount && audit.auditDocument === 'docs/story-title-self-translations-v10.md',
    'every self-translated title is recorded in the committed audit list', audit);
  assert(audit.known.startsWith('神滨SPA大冒险'), 'verified Reader/Wiki title remains authoritative', audit.known);
  assert(fatal(errors).length === 0, 'story title V10 has no fatal JavaScript errors', errors);
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 900000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  await ocrTest(browser);
  await callHeightTest(browser);
  await storyAuditTest(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
