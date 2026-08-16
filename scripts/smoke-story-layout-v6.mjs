import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'story-ocr-layout-v6-20260816';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

async function openPage(browser, route) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}${route}?v6=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { page, errors };
}

function fatal(errors) {
  return errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text));
}

async function testStory(browser) {
  const { page, errors } = await openPage(browser, '/story.html');
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (/script\.google\.com|googleusercontent\.com|drive\.google\.com/iu.test(request.url())) {
      blocked.push(request.url());
      request.abort();
    } else request.continue();
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#storyCharacterGrid .suite-character-card').length >= 180
    && document.querySelectorAll('#storyTypeOptions input').length >= 19,
  { timeout: 30000 });

  const initial = await page.evaluate(async () => {
    const manifest = await fetch('./data/story-v6/manifest.json').then((response) => response.json());
    const first = document.querySelector('#storyCharacterGrid .suite-character-card');
    const starCard = [...document.querySelectorAll('#storyCharacterGrid .suite-character-card')].find((card) => card.querySelector('.suite-star'));
    const cardRect = first.getBoundingClientRect();
    const nameRect = first.querySelector('strong').getBoundingClientRect();
    const starRect = starCard.querySelector('.suite-star').getBoundingClientRect();
    const starCardRect = starCard.getBoundingClientRect();
    return {
      release: document.body.dataset.build,
      rows: manifest.totalRows,
      categories: manifest.categories.length,
      mode: manifest.source?.mode,
      bottomGap: cardRect.bottom - nameRect.bottom,
      starTop: starRect.top - starCardRect.top,
      starRight: starCardRect.right - starRect.right
    };
  });
  assert(initial.release === EXPECTED_RELEASE, 'story release marker', initial);
  assert(initial.rows >= 14000 && initial.categories === 19 && initial.mode === 'manual-static-snapshot',
    'complete local story snapshot loads', initial);
  assert(initial.bottomGap <= 9, 'story character card has no wasteful bottom gap', initial);
  assert(initial.starTop <= 7 && initial.starRight <= 7, 'story star is top-right', initial);

  await page.evaluate(() => {
    for (const input of document.querySelectorAll('#storyTypeOptions input')) input.checked = input.value === 'メイン【第1部】';
    [...document.querySelectorAll('#storyCharacterGrid .suite-character-card')]
      .find((card) => card.dataset.jp === '環いろは').click();
  });
  await page.click('#storySearchButton');
  await page.waitForFunction(() => document.getElementById('storyStatus')?.dataset.kind === 'success', { timeout: 60000 });
  const result = await page.evaluate(() => ({
    rows: document.querySelectorAll('#storyResultsBody tbody tr').length,
    groups: document.querySelectorAll('#storyResultsBody .suite-result-group').length,
    status: document.getElementById('storyStatus').textContent.trim(),
    summary: document.querySelector('#storyResultsBody > .suite-status')?.textContent || ''
  }));
  assert(result.rows > 0 && result.groups === 1, 'local story search returns results', result);
  assert(/快照|本站/u.test(result.status + result.summary), 'story UI reports local snapshot usage', result);
  assert(blocked.length === 0, 'story search makes no remote Google data request', blocked);
  assert(fatal(errors).length === 0, 'story page has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/story-v6-mobile.png', fullPage: true });
  await page.close();
}

async function testStarsAndAttendance(browser) {
  const root = await openPage(browser, '/');
  await root.page.waitForFunction(() => window.__MAGIRECO_LAYOUT_V6__
    && document.querySelectorAll('.main-card-star-v6').length > 20,
  { timeout: 30000 });
  const main = await root.page.evaluate(() => {
    const label = document.querySelector('label.girlbox:has(.main-card-star-v6)');
    const card = label.getBoundingClientRect();
    const star = label.querySelector('.main-card-star-v6').getBoundingClientRect();
    const stray = [...document.querySelectorAll('label.girlbox')].filter((item) => {
      const clone = item.cloneNode(true);
      clone.querySelector('.main-card-star-v6')?.remove();
      return clone.textContent.includes('★');
    }).length;
    return {
      release: document.body.dataset.build,
      count: document.querySelectorAll('.main-card-star-v6').length,
      stray,
      top: star.top - card.top,
      right: card.right - star.right
    };
  });
  assert(main.release === EXPECTED_RELEASE && main.count > 20 && main.stray === 0, 'main stars moved out of inline names', main);
  assert(main.top <= 6 && main.right <= 6, 'main stars are top-right', main);
  assert(fatal(root.errors).length === 0, 'main star layout has no fatal errors', root.errors);
  await root.page.close();

  const attendance = await openPage(browser, '/attendance.html');
  await attendance.page.waitForFunction(() => document.querySelectorAll('#attendanceGrid .suite-character-card').length >= 180,
    { timeout: 30000 });
  const compact = await attendance.page.evaluate(() => {
    const card = document.querySelector('#attendanceGrid .suite-character-card');
    const name = card.querySelector('strong');
    return {
      release: document.body.dataset.build,
      gap: card.getBoundingClientRect().bottom - name.getBoundingClientRect().bottom,
      height: card.getBoundingClientRect().height
    };
  });
  assert(compact.release === EXPECTED_RELEASE && compact.gap <= 9, 'attendance cards are vertically compact', compact);
  assert(fatal(attendance.errors).length === 0, 'attendance compact layout has no fatal errors', attendance.errors);
  await attendance.page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  await testStory(browser);
  await testStarsAndAttendance(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
