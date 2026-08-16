import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const EXPECTED_RELEASE = 'story-ui-translation-ocr-v7-20260816';

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

async function waitResult(page) {
  await page.waitForFunction(() => {
    const status = document.getElementById('runesStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout: 420000 });
  return page.evaluate(() => ({
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    diagnostics: document.getElementById('runesDiagnostics')?.textContent || '',
    processed: {
      width: document.getElementById('runesCanvas').width,
      height: document.getElementById('runesCanvas').height,
      hidden: document.getElementById('runesCanvas').hidden
    }
  }));
}

async function selectGeneratedBorderSample(page) {
  await page.evaluate(async () => {
    const source = new Image();
    source.src = `./mdkOCR/madokarunes.jpg?border=${Date.now()}`;
    await source.decode();
    const cropHeight = Math.max(80, Math.round(source.naturalHeight * .205));
    const temp = document.createElement('canvas');
    temp.width = source.naturalWidth;
    temp.height = cropHeight;
    const tctx = temp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(source, 0, 0, source.naturalWidth, cropHeight, 0, 0, temp.width, temp.height);
    const pixels = tctx.getImageData(0, 0, temp.width, temp.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] * .2126 + pixels.data[index + 1] * .7152 + pixels.data[index + 2] * .0722;
      const value = gray < 135 ? 255 : 0;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    tctx.putImageData(pixels, 0, 0);

    const bordered = document.createElement('canvas');
    bordered.width = temp.width * 3;
    bordered.height = temp.height * 3 + 80;
    const context = bordered.getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, bordered.width, bordered.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(temp, 0, 40, bordered.width, bordered.height - 80);
    context.strokeStyle = '#fff';
    context.lineWidth = 10;
    context.beginPath(); context.moveTo(0, 14); context.lineTo(bordered.width, 14); context.stroke();
    context.beginPath(); context.moveTo(0, bordered.height - 14); context.lineTo(bordered.width, bordered.height - 14); context.stroke();

    const blob = await new Promise((resolve) => bordered.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'bordered-runes.png', { type: 'image/png' }));
    const input = document.getElementById('runesFile');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1120, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}/runes.html?v6=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__RUNE_OCR_V6__ && document.getElementById('runesLayout'), { timeout: 30000 });
  assert(await page.evaluate(() => document.body.dataset.build) === EXPECTED_RELEASE, 'OCR release marker');

  const input = await page.$('#runesFile');
  await input.uploadFile(path.join(REPO_ROOT, 'public', 'mdkOCR', 'madokarunes.jpg'));
  await page.select('#runesPreprocess', 'auto');
  await page.select('#runesLayout', 'chart');
  await page.click('#runesRecognize');
  const chart = await waitResult(page);
  const chartLetters = chart.output.replace(/[^A-Za-z]/g, '');
  const chartUnique = new Set(chartLetters.toLowerCase()).size;
  assert(chart.kind === 'success' && chartLetters.length >= 18 && chartUnique >= 15,
    'full alphabet chart returns a substantial alphabet instead of one z', { ...chart, chartLetters, chartUnique });

  await selectGeneratedBorderSample(page);
  await page.select('#runesPreprocess', 'auto');
  await page.select('#runesLayout', 'line');
  await page.click('#runesRecognize');
  const bordered = await waitResult(page);
  const borderLetters = bordered.output.replace(/[^A-Za-z]/g, '');
  const borderUnique = new Set(borderLetters.toLowerCase()).size;
  assert(bordered.kind === 'success' && borderLetters.length >= 5 && borderUnique >= 4,
    'border-aware preprocessing recovers multiple rune characters', { ...bordered, borderLetters, borderUnique });
  assert(!bordered.processed.hidden && bordered.processed.width > 0 && bordered.processed.height > 0,
    'processed border-free image is available for visual inspection', bordered.processed);
  assert(/去边框|智能|高精度/u.test(bordered.status + bordered.diagnostics),
    'OCR diagnostics identify a smart border-aware path', bordered);
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'OCR run has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/ocr-v6-desktop.png', fullPage: true });
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, chart, bordered }, null, 2));
  await page.close();
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
