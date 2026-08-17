import puppeteer from 'puppeteer-core';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const EXPECTED_RELEASE = 'live-reacceptance-v11-20260817';
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

async function openPage(browser, route, viewport = { width: 1440, height: 900, deviceScaleFactor: 1 }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}${route}${route.includes('?') ? '&' : '?'}v11=${Date.now()}`, {
    waitUntil: 'domcontentloaded', timeout: 60000
  });
  return { page, errors };
}

async function testCallHeight(browser) {
  const { page, errors } = await openPage(browser, '/');
  await page.waitForFunction(() => document.body.dataset.build === 'live-reacceptance-v11-20260817'
    && document.documentElement.dataset.liveV11 === 'live-reacceptance-v11-20260817'
    && window.__MAGIRECO_HEIGHT_EXPORT_V11__
    && document.querySelectorAll('label.girlbox input.MagicalChk[name="chara"]').length >= 180,
  { timeout: 40000 });

  const ui = await page.evaluate(() => {
    const nav = document.querySelector('.suite-nav');
    const rail = document.querySelector('.call-quick-rail-v10');
    return {
      release: document.body.dataset.build,
      sticky: getComputedStyle(nav).position,
      glyphs: [...rail.querySelectorAll('button')].map((button) => button.textContent.trim()),
      oldButtonsHidden: ['pagetop','pagemdl','pagebtm'].every((id) => {
        const node = document.getElementById(id);
        return !node || node.hidden || getComputedStyle(node).display === 'none';
      }),
      docWidth: document.documentElement.scrollWidth,
      viewport: innerWidth
    };
  });
  assert(ui.release === EXPECTED_RELEASE && ui.sticky === 'sticky', 'call page uses sticky suite navigation', ui);
  assert(ui.glyphs[0] === '↑' && ui.glyphs.at(-1) === '↓' && ui.glyphs.length >= 9,
    'call quick rail uses arrow top/bottom and keeps the full action set', ui.glyphs);
  assert(ui.oldButtonsHidden, 'legacy three-button rail stays hidden');

  const selected = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/（/g, '(').replace(/）/g, ')').trim();
    const parse = (value) => {
      const match = String(value || '').match(/\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : NaN;
    };
    const table = typeof callTable !== 'undefined' ? callTable : null;
    const boxes = [...document.querySelectorAll('input.MagicalChk[name="chara"]')];
    boxes.forEach((box) => { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); });
    const chosen = [];
    for (const box of boxes) {
      const direct = table instanceof Map ? table.get(box.value) : null;
      const details = direct instanceof Map ? direct : null;
      if (!details || !Number.isFinite(parse(details.get('身高'))) || String(details.get('身高') || '').trim() === '?') continue;
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      chosen.push(normalize(box.value));
      if (chosen.length >= 24) break;
    }
    return chosen;
  });
  assert(selected.length >= 20, 'selected many characters with direct height data', selected.length);
  await sleep(100);

  const selectedOutline = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label.girlbox')].find((node) => node.querySelector('input.MagicalChk:checked'));
    const style = getComputedStyle(label);
    return { width: style.outlineWidth, color: style.outlineColor, selectedClass: label.classList.contains('is-selected-v11') };
  });
  assert(Number.parseFloat(selectedOutline.width) >= 2 && selectedOutline.selectedClass,
    'selected call avatar keeps a persistent pink outline', selectedOutline);

  await page.evaluate(() => window.displayHeightChart('selected', 'organization'));
  await page.waitForSelector('.height-chart-viewport-v2 .height-point-v2', { timeout: 30000 });
  await sleep(500);

  const height = await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const stage = viewport.querySelector('.height-chart-stage-v2');
    const plot = viewport.querySelector('.height-plot-v2');
    const right = viewport.querySelector('.height-y-axis-right-v3');
    const points = [...viewport.querySelectorAll('.height-point-v2')];
    const labels = [...viewport.querySelectorAll('.height-x-label-v2')];
    const categoryCounts = Object.fromEntries(labels.map((label) => [label.dataset.category,
      points.filter((point) => point.dataset.category === label.dataset.category).length]));
    const summary = document.querySelector('.height-selection-summary-v11')?.textContent || '';
    const p = plot.getBoundingClientRect();
    const r = right?.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return {
      points: points.length,
      unique: new Set(points.map((point) => point.dataset.character)).size,
      labels: labels.map((label) => label.textContent.trim()),
      categoryCounts,
      emptyCategories: Object.entries(categoryCounts).filter(([, count]) => count === 0).map(([key]) => key),
      summary,
      plotRight: p.right,
      rightLeft: r?.left,
      rulerDelta: r ? Math.abs(r.left - p.right) : 9999,
      viewportWidth: v.width,
      stageWidth: s.width,
      documentWidth: document.documentElement.scrollWidth,
      innerWidth
    };
  });
  assert(height.unique >= 20, 'selected height chart renders the selected characters instead of only a few', height);
  assert(height.emptyCategories.length === 0, 'selected height chart removes empty organization columns', height);
  assert(/已选\s*2\d\s*名/u.test(height.summary) && /有身高资料/u.test(height.summary),
    'selected height chart reports selected and available-height counts', height.summary);
  assert(height.rulerDelta <= 4, 'right centimeter ruler is clamped to the natural chart-grid edge', height);
  assert(height.viewportWidth <= Math.min(height.innerWidth, height.stageWidth) + 30,
    'short selected height chart does not reserve a giant blank desktop area', height);

  const exported = await page.evaluate(async () => {
    const api = window.__MAGIRECO_HEIGHT_EXPORT_V11__;
    const canvas = await api.renderExportCanvas();
    const geometry = api.geometry();
    return {
      width: canvas.width, height: canvas.height,
      cssWidth: Number(canvas.dataset.exportCssWidth), cssHeight: Number(canvas.dataset.exportCssHeight),
      scale: Number(canvas.dataset.exportScale),
      leftAxes: canvas.dataset.exportLeftAxes, rightAxes: canvas.dataset.exportRightAxes,
      geometryWidth: geometry.width, geometryHeight: geometry.height
    };
  });
  assert(exported.width > exported.cssWidth && exported.height > exported.cssHeight && exported.scale > 1,
    'height export uses a high-resolution direct Canvas renderer', exported);
  assert(exported.leftAxes === '1' && exported.rightAxes === '1', 'height export contains exactly one left and one right ruler', exported);

  assert(fatal(errors).length === 0, 'call/height V11 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/live-v11-call-height.png', fullPage: false });
  await page.close();
}

async function auditSuiteCards(browser, route, gridId, label) {
  const { page, errors } = await openPage(browser, route);
  await page.waitForFunction((gridId) => document.body.dataset.build === 'live-reacceptance-v11-20260817'
    && document.querySelectorAll(`#${gridId} .suite-character-card`).length >= 180,
  {}, gridId);
  const audit = await page.evaluate((gridId) => {
    const cards = [...document.querySelectorAll(`#${gridId} .suite-character-card`)];
    const colored = cards.find((card) => card.classList.contains('umeColor')) || cards[0];
    const before = getComputedStyle(colored).backgroundColor;
    colored.click();
    const after = getComputedStyle(colored).backgroundColor;
    const outline = getComputedStyle(colored).outlineWidth;
    const rect = colored.getBoundingClientRect();
    const grid = document.getElementById(gridId).getBoundingClientRect();
    return {
      count: cards.length,
      width: rect.width,
      backgroundBefore: before,
      backgroundAfter: after,
      outline,
      pressed: colored.getAttribute('aria-pressed'),
      paletteClass: [...colored.classList].find((value) => /Color$/u.test(value)) || '',
      gridWidth: grid.width,
      lastRowUnused: grid.width % Math.max(1, rect.width),
      documentWidth: document.documentElement.scrollWidth,
      innerWidth
    };
  }, gridId);
  assert(audit.width <= 70, `${label} avatar cards are compact like the call directory`, audit);
  assert(audit.paletteClass && audit.backgroundBefore === audit.backgroundAfter,
    `${label} cards reuse call-page background classes and preserve them when selected`, audit);
  assert(Number.parseFloat(audit.outline) >= 2 && audit.pressed === 'true', `${label} selected card keeps a pink outline`, audit);
  assert(audit.documentWidth <= audit.innerWidth + 3, `${label} page has no document-level horizontal overflow`, audit);
  assert(fatal(errors).length === 0, `${label} V11 has no fatal JavaScript errors`, errors);
  await page.close();
}

async function setInputBlob(page, factorySource, name) {
  await page.evaluate(async (factorySource, name) => {
    const factory = (0, eval)(`(${factorySource})`);
    const blob = await factory();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, { type: 'image/png' }));
    const input = document.getElementById('runesFile');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, factorySource, name);
  await page.waitForFunction(() => !document.getElementById('runesRecognize')?.disabled, { timeout: 10000 });
}

async function testRunes(browser) {
  const { page, errors } = await openPage(browser, '/runes.html', { width: 1180, height: 920, deviceScaleFactor: 1 });
  page.setDefaultTimeout(360000);
  await page.waitForFunction(() => document.body.dataset.build === 'live-reacceptance-v11-20260817'
    && document.documentElement.dataset.runeV11 === 'live-reacceptance-v11-20260817'
    && window.__RUNE_V10__ && document.getElementById('runesRecognize'),
  { timeout: 40000 });

  const input = await page.$('#runesFile');
  await input.uploadFile(path.join(REPO_ROOT, 'public', 'mdkOCR', 'madokarunes.jpg'));
  await page.select('#runesLayout', 'auto');
  await page.select('#runesModel', 'mdk');
  await page.evaluate(() => { const mask = document.getElementById('runesMaskEnabled'); if (mask) mask.checked = false; });
  await page.click('#runesRecognize');
  await page.waitForFunction(() => document.getElementById('runesStatus')?.dataset.kind === 'success'
    || document.getElementById('runesStatus')?.dataset.kind === 'error', { timeout: 360000 });
  const alphabet = await page.evaluate(() => ({
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    layout: document.getElementById('runesLayout').value
  }));
  const alphabetLetters = alphabet.output.toUpperCase().replace(/[^A-Z]/g, '');
  assert(alphabet.kind === 'success' && alphabetLetters === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'auto OCR routes the tall registered alphabet to strict A-Z grid recognition', { ...alphabet, alphabetLetters });

  await setInputBlob(page, `async function () {
    const bank = await window.__RUNE_V10__.buildTemplateBank();
    const phrase = 'LCH TSTE MICH';
    const scale = 2.4;
    const glyph = 64 * scale;
    const gap = 18;
    const space = 58;
    let width = 130;
    for (const ch of phrase) width += ch === ' ' ? space : glyph + gap;
    width += 130;
    const height = 520;
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width); canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff7d2';
    // Decorative corner motifs deliberately make this a non-grid wide image.
    for (const [cx,cy] of [[70,70],[canvas.width-70,70],[70,height-70],[canvas.width-70,height-70]]) {
      ctx.beginPath(); ctx.arc(cx,cy,42,0,Math.PI*2); ctx.strokeStyle='#fff7d2'; ctx.lineWidth=10; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx,cy,18,0,Math.PI*2); ctx.stroke();
    }
    let x = 130; const y0 = 180;
    for (const raw of phrase) {
      if (raw === ' ') { x += space; continue; }
      const mask = bank.get(raw.toUpperCase())[0];
      for (let y=0;y<64;y++) for (let xx=0;xx<64;xx++) if (mask[y * Math.round(Math.sqrt(mask.length)) + xx]) {
        ctx.fillRect(x + xx*scale, y0 + y*scale, Math.ceil(scale), Math.ceil(scale));
      }
      x += glyph + gap;
    }
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }`, 'decorated-lch.png');
  await page.select('#runesLayout', 'auto');
  await page.select('#runesModel', 'mdk');
  await page.evaluate(() => {
    const mask = document.getElementById('runesMaskEnabled'); if (mask) mask.checked = false;
    document.getElementById('runesOutput').value = '';
    const status = document.getElementById('runesStatus'); status.dataset.kind = ''; status.textContent = '';
  });
  await page.click('#runesRecognize');
  await page.waitForFunction(() => document.getElementById('runesStatus')?.dataset.kind === 'success'
    || document.getElementById('runesStatus')?.dataset.kind === 'error', { timeout: 360000 });
  const line = await page.evaluate(() => ({
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    diagnostics: document.getElementById('runesDiagnostics')?.textContent || '',
    autoDiag: window.__RUNE_V11_AUTO_DIAG__ || null
  }));
  const lineLetters = line.output.toUpperCase().replace(/[^A-Z]/g, '');
  assert(line.kind === 'success' && lineLetters.includes('LCHTSTEMICH'),
    'auto OCR routes a wide decorated LCH TSTE MICH image to the proven character path', { ...line, lineLetters });
  assert(!/BEZBZBBO|BBBCBCBBB/u.test(line.output), 'decorative wide image is not falsely forced through alphabet-grid recognition', line.output);

  assert(fatal(errors).length === 0, 'rune V11 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/live-v11-runes.png', fullPage: false });
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  protocolTimeout: 600000,
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
});

try {
  await testCallHeight(browser);
  await auditSuiteCards(browser, '/story.html', 'storyCharacterGrid', 'story');
  await auditSuiteCards(browser, '/attendance.html', 'attendanceGrid', 'attendance');
  await testRunes(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
