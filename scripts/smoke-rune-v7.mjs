import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'height-export-title-call-rune-v10-20260817';
const EXPECTED_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

async function waitResult(page, timeout = 300000) {
  await page.waitForFunction(() => {
    const status = document.getElementById('runesStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout });
  return page.evaluate(() => ({
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    diagnostics: document.getElementById('runesDiagnostics')?.textContent || '',
    processedHidden: document.getElementById('runesCanvas').hidden,
    processedWidth: document.getElementById('runesCanvas').width,
    processedHeight: document.getElementById('runesCanvas').height
  }));
}

async function assignBlobToInput(page, expression) {
  await page.evaluate(async (factory) => {
    const blob = await (0, eval)(`(${factory})`)();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'runes-v7-sample.png', { type: 'image/png' }));
    const input = document.getElementById('runesFile');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, expression.toString());
  await page.waitForFunction(() => !document.getElementById('runesRecognize').disabled, { timeout: 10000 });
}

async function alphabetBlob() {
  const response = await fetch(`./mdkOCR/madokarunes.jpg?alphabet=${Date.now()}`, { cache: 'no-store' });
  return response.blob();
}

async function decoratedLineBlob() {
  const source = new Image();
  source.src = `./mdkOCR/madokarunes.jpg?line=${Date.now()}`;
  await source.decode();
  const sourceHeight = Math.max(60, Math.round(source.naturalHeight * .205));
  const crop = document.createElement('canvas');
  crop.width = source.naturalWidth;
  crop.height = sourceHeight;
  crop.getContext('2d').drawImage(source, 0, 0, source.naturalWidth, sourceHeight, 0, 0, crop.width, crop.height);

  const output = document.createElement('canvas');
  output.width = crop.width * 3;
  output.height = crop.height * 3 + 160;
  const context = output.getContext('2d');
  context.fillStyle = '#09070a';
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(crop, 0, 80, output.width, output.height - 160);
  context.strokeStyle = '#fff';
  context.lineWidth = 12;
  context.beginPath(); context.moveTo(0, 26); context.lineTo(output.width, 26); context.stroke();
  context.beginPath(); context.moveTo(0, output.height - 26); context.lineTo(output.width, output.height - 26); context.stroke();
  context.fillStyle = '#fff';
  for (const x of [35, output.width - 105]) {
    context.beginPath(); context.arc(x, 52, 18, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(x + 38, output.height - 52, 18, 0, Math.PI * 2); context.fill();
  }
  return new Promise((resolve) => output.toBlob(resolve, 'image/png'));
}

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
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
  await page.goto(`${BASE_URL}/runes.html?v7=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__RUNE_TEMPLATE_V7__ && document.getElementById('runesRecognize'), { timeout: 30000 });

  const initial = await page.evaluate(() => ({
    release: document.body.dataset.build,
    hero: document.querySelector('.suite-hero')?.textContent.trim(),
    heroParagraphs: document.querySelector('.suite-hero')?.querySelectorAll('p').length,
    quickRail: document.querySelectorAll('.suite-quick-rail-v7').length
  }));
  assert(initial.release === EXPECTED_RELEASE && initial.hero === '魔女文字解读'
    && initial.heroParagraphs === 0 && initial.quickRail === 0,
  'OCR page is compact and has no quick rail', initial);

  await assignBlobToInput(page, alphabetBlob);
  await page.select('#runesLayout', 'chart');
  await page.click('#runesRecognize');
  const alphabet = await waitResult(page);
  const normalizedAlphabet = alphabet.output.toLowerCase().replace(/[^a-z]/g, '');
  assert(alphabet.kind === 'success' && normalizedAlphabet === EXPECTED_ALPHABET,
    'alphabet chart is emitted in strict top-to-bottom, left-to-right order', { ...alphabet, normalizedAlphabet });
  assert(/自上而下、从左到右/u.test(alphabet.status), 'alphabet status states the ordered reading rule', alphabet.status);

  await assignBlobToInput(page, decoratedLineBlob);
  await page.select('#runesLayout', 'line');
  await page.click('#runesRecognize');
  const bordered = await waitResult(page);
  const letters = bordered.output.replace(/[^A-Za-z]/g, '');
  const unique = new Set(letters.toLowerCase()).size;
  const removedMatch = bordered.diagnostics.match(/移除长横线：(\d+)/u);
  const removedRows = Number(removedMatch?.[1] || 0);
  assert(bordered.kind === 'success' && letters.length >= 5 && unique >= 4,
    'decorated bordered image yields a multi-character line', { ...bordered, letters, unique });
  assert(removedRows > 0 && !bordered.processedHidden && bordered.processedWidth > 0,
    'border lines are removed and the processed image is shown', { removedRows, ...bordered });
  assert(!/^([A-Za-z])\1{3,}$/u.test(letters), 'border/decorations do not collapse into repeated-character noise', letters);

  const fatal = errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text));
  assert(fatal.length === 0, 'rune V7 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/rune-v7-desktop.png', fullPage: false });
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, alphabet, bordered }, null, 2));
  await page.close();
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
