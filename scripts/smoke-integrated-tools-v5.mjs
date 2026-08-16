import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const EXPECTED_RELEASE = 'rune-mask-v9-20260816';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

async function openPage(browser, route, viewport = { width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${BASE_URL}${route}${route.includes('?') ? '&' : '?'}acceptance=${Date.now()}`, {
    waitUntil: 'domcontentloaded', timeout: 60000
  });
  return { page, errors };
}

async function testRootAndTripleTap(browser) {
  const { page, errors } = await openPage(browser, '/');
  await page.waitForFunction(() => document.readyState === 'complete'
    && window.MagirecoTripleTapFilter
    && window.MagiTools
    && document.querySelectorAll('input.MagicalChk[name="chara"]').length >= 180,
  { timeout: 30000 });

  const root = await page.evaluate(() => ({
    release: document.body.dataset.build,
    nav: [...document.querySelectorAll('.suite-nav a')].map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim() })),
    ondblclick: document.querySelectorAll('[ondblclick]').length,
    text: document.body.textContent.includes('三击图标可以筛选称呼/被称呼的对象'),
    legend: document.querySelector('#callFilterForm')?.closest('fieldset')?.querySelector('legend')?.textContent.trim()
  }));
  assert(root.release === EXPECTED_RELEASE, 'root release marker', root.release);
  assert(root.nav.length === 4 && root.nav.every((item) => item.href?.startsWith('./')), 'root has four internal suite modes', root.nav);
  assert(root.ondblclick === 0, 'all inline double-click filters were removed', root.ondblclick);
  assert(root.text && root.legend === '三击筛选选项', 'instructions and legend describe triple-click filtering', root);

  await page.evaluate(() => {
    window.__tripleCalls = 0;
    const original = window.mgirlCallNarrow;
    window.mgirlCallNarrow = function (...args) {
      window.__tripleCalls += 1;
      return original.apply(this, args);
    };
    const first = document.querySelector('input.MagicalChk[name="chara"]');
    first.scrollIntoView({ block: 'center' });
  });
  const selector = 'input.MagicalChk[name="chara"]';
  await page.click(selector);
  await sleep(120);
  await page.click(selector);
  await sleep(180);
  const afterTwo = await page.evaluate(() => window.__tripleCalls);
  assert(afterTwo === 0, 'two taps do not activate relationship filtering', afterTwo);
  await page.click(selector);
  await sleep(450);
  const afterThree = await page.evaluate(() => ({ calls: window.__tripleCalls, visible: [...document.querySelectorAll('label.girlbox')].filter((label) => getComputedStyle(label).display !== 'none').length }));
  assert(afterThree.calls === 1, 'third tap activates relationship filtering exactly once', afterThree);
  assert(afterThree.visible > 0, 'triple-tap filter leaves a visible result set', afterThree);

  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'root/triple-tap run has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/integrated-v5-root-mobile.png', fullPage: false });
  await page.close();
}

async function testStory(browser) {
  const { page, errors } = await openPage(browser, '/story.html');
  await page.waitForFunction(() => window.MagiTools && document.querySelectorAll('#storyCharacterGrid .suite-character-card').length >= 180,
    { timeout: 30000 });
  const initial = await page.evaluate(() => ({
    release: document.body.dataset.build,
    cards: document.querySelectorAll('#storyCharacterGrid .suite-character-card').length,
    first: document.querySelector('#storyCharacterGrid .suite-character-card strong')?.textContent,
    types: document.querySelectorAll('#storyTypeOptions input').length,
    nav: document.querySelectorAll('.suite-nav a').length
  }));
  assert(initial.release === EXPECTED_RELEASE && initial.cards >= 180 && initial.types >= 19 && initial.nav === 4,
    'story page loads Chinese catalog and complete options', initial);
  assert(initial.first && !/^[ぁ-ヿ]+$/u.test(initial.first), 'story cards display Chinese-first names', initial.first);

  await page.evaluate(() => {
    const types = [...document.querySelectorAll('#storyTypeOptions input')];
    types.forEach((input, index) => { input.checked = index === 0; });
    document.querySelector('#storyCharacterGrid .suite-character-card').click();
  });
  await page.click('#storySearchButton');
  await page.waitForFunction(() => {
    const status = document.getElementById('storyStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout: 60000 });
  const result = await page.evaluate(() => ({
    status: document.getElementById('storyStatus').textContent.trim(),
    kind: document.getElementById('storyStatus').dataset.kind,
    groups: document.querySelectorAll('#storyResultsBody .suite-result-group').length,
    tableRows: document.querySelectorAll('#storyResultsBody tbody tr').length
  }));
  assert(result.kind === 'success' && result.groups === 1, 'local story snapshot returns a renderable result', result);
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'story run has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/integrated-v5-story-mobile.png', fullPage: false });
  await page.close();
}

async function testAttendance(browser) {
  const { page, errors } = await openPage(browser, '/attendance.html');
  await page.waitForFunction(() => document.querySelectorAll('#attendanceGrid .suite-character-card').length >= 180,
    { timeout: 30000 });
  await page.click('#attendanceGrid .suite-character-card');
  await page.waitForFunction(() => {
    const status = document.getElementById('attendanceStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout: 60000 });
  const result = await page.evaluate(() => ({
    release: document.body.dataset.build,
    status: document.getElementById('attendanceStatus').textContent.trim(),
    kind: document.getElementById('attendanceStatus').dataset.kind,
    rows: document.querySelectorAll('.attendance-row').length,
    first: document.querySelector('.attendance-person strong')?.textContent || '',
    nav: document.querySelectorAll('.suite-nav a').length
  }));
  assert(result.release === EXPECTED_RELEASE && result.kind === 'success' && result.rows > 0 && result.nav === 4,
    'co-appearance service returns a Chinese ranking', result);
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'attendance run has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/integrated-v5-attendance-mobile.png', fullPage: false });
  await page.close();
}

async function testRunes(browser) {
  const { page, errors } = await openPage(browser, '/runes.html', { width: 1024, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.waitForFunction(() => window.MagiTools && document.getElementById('runesFile'), { timeout: 30000 });
  const assets = await page.evaluate(async () => {
    const result = {};
    for (const name of ['mdk.traineddata', 'mdm.traineddata', 'madokarunes.jpg']) {
      const response = await fetch(`./mdkOCR/${name}?test=${Date.now()}`, { cache: 'no-store' });
      result[name] = { ok: response.ok, size: Number(response.headers.get('content-length') || 0), type: response.headers.get('content-type') || '' };
    }
    return result;
  });
  assert(Object.values(assets).every((item) => item.ok), 'OCR traineddata and reference image are served locally', assets);

  await page.evaluate(async () => {
    const source = new Image();
    source.src = `./mdkOCR/madokarunes.jpg?sample=${Date.now()}`;
    await source.decode();
    const crop = document.createElement('canvas');
    crop.width = source.naturalWidth * 3;
    crop.height = 165;
    const context = crop.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, crop.width, crop.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, source.naturalWidth, 55, 0, 0, crop.width, crop.height);
    const blob = await new Promise((resolve) => crop.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'known-runes-A-G.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.getElementById('runesPreprocess').value = 'contrast';
    const input = document.getElementById('runesFile');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => !document.getElementById('runesRecognize').disabled, { timeout: 10000 });
  await page.click('#runesRecognize');
  await page.waitForFunction(() => {
    const status = document.getElementById('runesStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout: 120000 });
  const result = await page.evaluate(() => ({
    release: document.body.dataset.build,
    kind: document.getElementById('runesStatus').dataset.kind,
    status: document.getElementById('runesStatus').textContent.trim(),
    output: document.getElementById('runesOutput').value.trim(),
    nav: document.querySelectorAll('.suite-nav a').length
  }));
  assert(result.release === EXPECTED_RELEASE && result.kind === 'success' && result.output.length > 0 && result.nav === 4,
    'browser-local witch-rune OCR initializes and returns text', { ...result, output: result.output.slice(0, 100) });
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'OCR run has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/integrated-v5-runes-desktop.png', fullPage: false });
  await page.close();
}

async function testDesktopNav(browser) {
  for (const route of ['/', '/story.html', '/attendance.html', '/runes.html']) {
    const { page, errors } = await openPage(browser, route, { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.waitForSelector('.suite-nav a');
    const audit = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      nav: document.querySelectorAll('.suite-nav a').length,
      current: document.querySelectorAll('.suite-nav a[aria-current="page"]').length
    }));
    assert(audit.width <= audit.viewport + 4 && audit.nav === 4 && audit.current === 1,
      `desktop suite layout is contained for ${route}`, audit);
    assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
      `desktop page has no fatal JavaScript errors for ${route}`, errors);
    await page.close();
  }
}

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-extensions'
  ]
});

try {
  await testRootAndTripleTap(browser);
  await testStory(browser);
  await testAttendance(browser);
  await testRunes(browser);
  await testDesktopNav(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
