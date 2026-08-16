import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'collapsible-layout-v8-20260816';
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
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}${route}${route.includes('?') ? '&' : '?'}v8=${Date.now()}`, {
    waitUntil: 'domcontentloaded', timeout: 60000
  });
  return { page, errors };
}

async function navAudit(page) {
  return page.evaluate(() => ({
    labels: [...document.querySelectorAll('.suite-nav a')].map((link) => link.textContent.trim()),
    iconSpans: document.querySelectorAll('.suite-nav a > span[aria-hidden="true"]').length,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  }));
}

async function storyTest(browser) {
  const { page, errors } = await open(browser, '/story.html', {
    width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true
  });
  await page.waitForFunction(() => window.__MAGIRECO_LAYOUT_V8__
    && document.querySelectorAll('#storyCharacterGrid .suite-character-card').length >= 180
    && document.querySelector('.story-search-panel-v8')
    && document.querySelector('.story-character-panel-v8')
    && document.querySelector('.story-results-panel-v8'),
  { timeout: 40000 });
  await sleep(300);

  const audit = await page.evaluate(() => {
    const grid = document.getElementById('storyCharacterGrid');
    const characterDetails = document.querySelector('.story-character-panel-v8');
    const avatarDetails = grid.closest('.character-grid-details-v8');
    const attribute = document.querySelector('#storyAttributeFilterV7 .suite-attribute-v7');
    return {
      release: document.body.dataset.build,
      hero: Boolean(document.querySelector('.suite-hero')),
      panelTitles: [...document.querySelectorAll('.suite-panel-details-v8 > summary > span:first-child')]
        .map((node) => node.textContent.trim()),
      characterOpen: characterDetails.open,
      avatarOpen: avatarDetails?.open,
      count: avatarDetails?.querySelector('.character-grid-count-v8')?.textContent || '',
      attributeSeparate: Boolean(attribute && !attribute.closest('.character-grid-details-v8')),
      overflowY: getComputedStyle(grid).overflowY,
      scrollHeight: grid.scrollHeight,
      clientHeight: grid.clientHeight,
      resultOverflow: getComputedStyle(document.getElementById('storyResultsBody')).overflowY
    };
  });
  assert(audit.release === EXPECTED_RELEASE && !audit.hero, 'story removes the duplicate title row', audit);
  assert(['搜索条件', '选择角色', '搜索结果'].every((title) => audit.panelTitles.includes(title)),
    'story search conditions, characters and results are independent collapsible panels', audit.panelTitles);
  assert(audit.characterOpen && audit.avatarOpen && /显示\s+186\/186/u.test(audit.count),
    'story avatar fold shows the live 186/186 count beside its toggle', audit);
  assert(audit.attributeSeparate, 'story attribute selector remains a separate collapsible panel', audit);
  assert(audit.overflowY === 'visible' && audit.scrollHeight <= audit.clientHeight + 3,
    'story avatar directory has no internal scrollbar', audit);

  const searchDetails = await page.$('.story-search-panel-v8');
  await page.click('.story-search-panel-v8 > summary');
  assert(await page.evaluate(() => !document.querySelector('.story-search-panel-v8').open),
    'story search-condition panel can collapse');
  await page.click('.story-search-panel-v8 > summary');
  assert(await page.evaluate(() => document.querySelector('.story-search-panel-v8').open),
    'story search-condition panel can reopen');
  void searchDetails;

  const nav = await navAudit(page);
  assert(nav.labels.includes('共同出场次数排行') && nav.iconSpans === 0,
    'story navigation is text-only and uses 共同出场次数排行', nav);
  assert(nav.documentWidth <= nav.viewportWidth + 3, 'story page has no document-level horizontal overflow', nav);
  assert(fatal(errors).length === 0, 'story V8 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/collapsible-v8-story-mobile.png', fullPage: false });
  await page.close();
}

async function attendanceTest(browser) {
  const { page, errors } = await open(browser, '/attendance.html', {
    width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false
  });
  await page.waitForFunction(() => window.__MAGIRECO_LAYOUT_V8__
    && document.querySelectorAll('#attendanceGrid .suite-character-card').length >= 180
    && document.querySelector('.attendance-workspace-v8'),
  { timeout: 40000 });
  await sleep(300);

  const audit = await page.evaluate(() => {
    const workspace = document.querySelector('.attendance-workspace-v8');
    const left = document.querySelector('.attendance-selection-v8');
    const right = document.querySelector('.attendance-results-v8');
    const grid = document.getElementById('attendanceGrid');
    const controlGrid = document.querySelector('.attendance-control-stack-v8');
    const current = document.getElementById('attendanceSelected')?.closest('.suite-field');
    const avatarDetails = grid.closest('.character-grid-details-v8');
    const styles = getComputedStyle(workspace);
    return {
      release: document.body.dataset.build,
      hero: Boolean(document.querySelector('.suite-hero')),
      workspaceDisplay: styles.display,
      columns: styles.gridTemplateColumns,
      leftWidth: left.getBoundingClientRect().width,
      rightWidth: right.getBoundingClientRect().width,
      workspaceWidth: workspace.getBoundingClientRect().width,
      currentFirst: controlGrid?.firstElementChild === current,
      count: avatarDetails?.querySelector('.character-grid-count-v8')?.textContent || '',
      overflowY: getComputedStyle(grid).overflowY,
      scrollHeight: grid.scrollHeight,
      clientHeight: grid.clientHeight,
      rowColumns: getComputedStyle(document.querySelector('.attendance-row') || document.createElement('div')).gridTemplateColumns
    };
  });
  assert(audit.release === EXPECTED_RELEASE && !audit.hero, 'attendance removes the redundant lower page title', audit);
  assert(audit.workspaceDisplay === 'grid'
    && Math.abs(audit.leftWidth - audit.rightWidth) <= audit.workspaceWidth * 0.08,
  'desktop attendance selection and ranking occupy balanced left/right halves', audit);
  assert(audit.currentFirst, 'attendance current selection is placed at the left/top of its control panel', audit);
  assert(/显示\s+186\/186/u.test(audit.count)
    && audit.overflowY === 'visible'
    && audit.scrollHeight <= audit.clientHeight + 3,
  'attendance avatar directory is fully expanded and independently collapsible', audit);

  await page.click('.attendance-selection-v8 > summary');
  assert(await page.evaluate(() => !document.querySelector('.attendance-selection-v8').open),
    'attendance selection panel can collapse');
  await page.click('.attendance-selection-v8 > summary');
  await page.click('.attendance-results-v8 > summary');
  assert(await page.evaluate(() => !document.querySelector('.attendance-results-v8').open),
    'attendance ranking panel can collapse');
  await page.click('.attendance-results-v8 > summary');

  const nav = await navAudit(page);
  assert(nav.labels.includes('共同出场次数排行') && nav.iconSpans === 0,
    'attendance navigation is text-only and fully renamed', nav);
  assert(nav.documentWidth <= nav.viewportWidth + 3, 'attendance page has no document-level horizontal overflow', nav);
  assert(fatal(errors).length === 0, 'attendance V8 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/collapsible-v8-attendance-desktop.png', fullPage: false });
  await page.close();
}

async function callTest(browser) {
  const { page, errors } = await open(browser, '/', {
    width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true
  });
  await page.waitForFunction(() => window.__MAGIRECO_LAYOUT_V8__
    && document.documentElement.dataset.layoutV8 === 'collapsible-layout-v8-20260816'
    && document.querySelectorAll('input.MagicalChk[name="chara"]').length >= 180
    && document.querySelector('.call-selection-panel-v8')
    && document.querySelector('.call-search-panel-v8')
    && document.querySelector('.call-attribute-panel-v8'),
  { timeout: 40000 });
  await sleep(350);

  const audit = await page.evaluate(() => {
    const grid = document.querySelector('form[name="magicalgirl"] .magicalgirl');
    const avatarDetails = grid.closest('.call-avatar-details-v8');
    const panels = [...document.querySelectorAll('.call-panel-v8 > summary > span:first-child')]
      .map((node) => node.textContent.trim());
    return {
      release: document.body.dataset.build,
      panels,
      count: avatarDetails?.querySelector('.character-grid-count-v8')?.textContent || '',
      selectionContainsIntro: /选择角色后/u.test(document.querySelector('.call-selection-panel-v8')?.textContent || ''),
      selectionContainsGrid: Boolean(document.querySelector('.call-selection-panel-v8 .magicalgirl')),
      attributeSeparate: !document.querySelector('.call-attribute-panel-v8')?.closest('.call-selection-panel-v8'),
      gridOverflow: getComputedStyle(grid).overflowY,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });
  assert(audit.release === EXPECTED_RELEASE, 'call page V8 release marker', audit.release);
  assert(['选择角色', '搜索条件', '按属性选择魔法少女'].every((title) => audit.panels.includes(title)),
    'call page separates selection, search conditions and attributes into collapsible panels', audit.panels);
  assert(audit.selectionContainsIntro && audit.selectionContainsGrid,
    'call selection panel keeps the instructions together with the avatar directory', audit);
  assert(audit.attributeSeparate, 'call attribute panel is independent from role selection', audit);
  assert(/显示\s+186\/186/u.test(audit.count) && audit.gridOverflow === 'visible',
    'call avatar fold displays its live 186/186 count without an internal scrollbar', audit);

  await page.click('.call-search-panel-v8 > summary');
  assert(await page.evaluate(() => !document.querySelector('.call-search-panel-v8').open),
    'call search-condition panel can collapse');
  await page.click('.call-search-panel-v8 > summary');
  await page.click('.call-selection-panel-v8 > summary');
  assert(await page.evaluate(() => !document.querySelector('.call-selection-panel-v8').open),
    'call selection panel can collapse');
  await page.click('.call-selection-panel-v8 > summary');

  const nav = await navAudit(page);
  assert(nav.labels.includes('共同出场次数排行') && nav.iconSpans === 0,
    'call navigation is text-only and fully renamed', nav);
  assert(audit.documentWidth <= audit.viewportWidth + 3, 'call page remains horizontally contained', audit);
  assert(fatal(errors).length === 0, 'call V8 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/collapsible-v8-call-mobile.png', fullPage: false });
  await page.close();
}

async function runesNavTest(browser) {
  const { page, errors } = await open(browser, '/runes.html', {
    width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true
  });
  await page.waitForFunction(() => window.__MAGIRECO_LAYOUT_V8__, { timeout: 30000 });
  const nav = await navAudit(page);
  assert(nav.labels.includes('共同出场次数排行') && nav.iconSpans === 0,
    'OCR navigation also uses text-only labels', nav);
  assert(fatal(errors).length === 0, 'OCR navigation V8 has no fatal errors', errors);
  await page.close();
}

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  await storyTest(browser);
  await attendanceTest(browser);
  await callTest(browser);
  await runesNavTest(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
