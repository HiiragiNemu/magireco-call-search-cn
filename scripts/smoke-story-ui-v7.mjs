import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
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

const ORIGINAL_ORDER = [
  'メイン【第1部】','メイン【第2部】','アナザー【第1部】','アナザー【第2部】',
  '魔法少女','衣装','ミラーズ','イベント','バトルミュージアム','スペシャル',
  '第1部EDムービー','第2部EDムービー','アニメ【1st】','アニメ【2nd】','アニメ【Final】'
];

async function open(browser, route) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}${route}?v7=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { page, errors };
}

function fatal(errors) {
  return errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text));
}

async function testStory(browser) {
  const { page, errors } = await open(browser, '/story.html');
  await page.waitForFunction(() => window.MagiToolsV7?.resolveCharacterV7
    && document.querySelectorAll('#storyTypeOptions input').length === 19
    && document.querySelectorAll('#storyCharacterGrid .suite-character-card').length >= 180
    && document.querySelector('#storyAttributeFilterV7 .suite-attribute-v7'),
  { timeout: 40000 });

  const initial = await page.evaluate(() => {
    const hero = document.querySelector('.suite-hero');
    const typeInputs = [...document.querySelectorAll('#storyTypeOptions input')];
    const typeTexts = [...document.querySelectorAll('#storyTypeOptions label')].map((label) => label.textContent.trim());
    const card = document.querySelector('#storyCharacterGrid .suite-character-card');
    const name = card.querySelector('strong');
    const image = card.querySelector('img');
    const cardRect = card.getBoundingClientRect();
    const nameRect = name.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    return {
      release: document.body.dataset.build,
      heroText: hero?.textContent.trim() || '',
      heroParagraphs: hero?.querySelectorAll('p').length || 0,
      internalCopy: document.body.textContent.includes('不修改 magi-reader')
        || document.body.textContent.includes('中文整合工具')
        || document.body.textContent.includes('Google Apps Script，因此'),
      values: typeInputs.map((input) => input.value),
      typeTexts,
      historiaText: typeTexts.find((text) => text.includes('历史篇')) || '',
      hasPuellaTransliteration: typeTexts.some((text) => text.includes('普埃拉')),
      bottomGap: cardRect.bottom - nameRect.bottom,
      inlineGap: cardRect.width - imageRect.width,
      cardWidth: cardRect.width,
      gridScrollWidth: document.getElementById('storyCharacterGrid').scrollWidth,
      gridClientWidth: document.getElementById('storyCharacterGrid').clientWidth,
      quickButtons: document.querySelectorAll('.suite-quick-rail-v7 button').length,
      quickLabels: [...document.querySelectorAll('.suite-quick-rail-v7 button')].map((button) => button.textContent.trim()),
      characterNames: [...document.querySelectorAll('#storyCharacterGrid .suite-character-card strong')].map((node) => node.textContent.trim()),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });
  assert(initial.release === EXPECTED_RELEASE, 'story V7 release marker', initial.release);
  assert((!initial.heroText || initial.heroText === '角色故事搜索') && initial.heroParagraphs === 0 && !initial.internalCopy,
    'visitor page contains only the compact title, not internal project instructions', initial);
  const expectedPrefix = ['メイン【第1部】','メイン【第2部】','アナザー【第1部】','アナザー【第2部】','魔法少女','衣装','ミラーズ','イベント','バトルミュージアム'];
  assert(expectedPrefix.every((value, index) => initial.values[index] === value),
    'story categories begin in the original Japanese-page order', initial.values);
  assert(initial.historiaText.includes('魔法少女历史篇') && !initial.hasPuellaTransliteration,
    'Puella Historia uses 魔法少女历史篇 instead of 普埃拉', initial.typeTexts);
  assert(initial.bottomGap <= 4 && initial.inlineGap <= 10 && initial.cardWidth <= 68 && initial.quickButtons >= 5,
    'story character cards are compact and the quick rail is present', initial);
  assert(JSON.stringify(initial.quickLabels) === JSON.stringify(['顶部','筛选','角色','搜索','结果','取消','底部']),
    'story quick rail uses explicit two-character labels and includes cancel below results', initial.quickLabels);
  assert(initial.characterNames.includes('思') && !initial.characterNames.includes('椎'),
    'the character directory uses the authoritative シィ short name 思', initial.characterNames.filter((name) => ['思','椎'].includes(name)));
  assert(initial.documentWidth <= initial.viewportWidth + 3, 'story page has no document-level horizontal overflow', initial);

  const attributeAudit = await page.evaluate(() => {
    const grid = document.getElementById('storyCharacterGrid');
    const before = [...grid.querySelectorAll('.suite-character-card')].filter((card) => !card.hidden).length;
    const input = [...document.querySelectorAll('#storyAttributeFilterV7 input[data-attribute-v7]')]
      .find((candidate) => candidate.value === 'まどドラ')
      || document.querySelector('#storyAttributeFilterV7 input[data-attribute-v7]');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const after = [...grid.querySelectorAll('.suite-character-card')].filter((card) => !card.hidden).length;
    return { before, after, value: input.value };
  });
  assert(attributeAudit.after > 0 && attributeAudit.after < attributeAudit.before,
    'story attribute selection filters the character directory', attributeAudit);

  await page.evaluate(() => {
    document.querySelector('#storyAttributeFilterV7 [data-attribute-reset]').click();
    for (const input of document.querySelectorAll('#storyTypeOptions input')) input.checked = input.value === 'イベント';
    document.getElementById('storyKeyword').value = '神浜スパアドベンチャー';
  });
  await page.click('#storySearchButton');
  await page.waitForFunction(() => document.getElementById('storyStatus')?.dataset.kind === 'success'
    && document.querySelectorAll('#storyResultsBody .story-row-v7').length > 0,
  { timeout: 60000 });

  await sleep(400);
  const result = await page.evaluate(() => {
    const row = document.querySelector('#storyResultsBody .story-row-v7');
    const title = row.querySelector('.story-title-v7 a')?.textContent || '';
    const original = row.querySelector('.story-title-original-v7')?.textContent || '';
    const chips = [...row.querySelectorAll('.story-cast-chip-v7')];
    const chipNames = chips.map((chip) => chip.textContent.trim());
    const brokenImages = [...row.querySelectorAll('img')].filter((img) => !img.complete || img.naturalWidth === 0).length;
    const rowRect = row.getBoundingClientRect();
    const titleRect = row.querySelector('.story-title-v7').getBoundingClientRect();
    const castRect = row.querySelector('.story-cast-v7').getBoundingClientRect();
    return {
      title,
      original,
      chipNames,
      uniqueChips: new Set(chipNames).size,
      brokenImages,
      rowWidth: rowRect.width,
      rowScrollWidth: row.scrollWidth,
      viewportWidth: innerWidth,
      titleVisible: titleRect.right > 0 && titleRect.left < innerWidth,
      castVisible: castRect.right > 0 && castRect.left < innerWidth,
      bodyWidth: document.documentElement.scrollWidth,
      rows: document.querySelectorAll('#storyResultsBody .story-row-v7').length,
      tableCount: document.querySelectorAll('#storyResultsBody table').length,
      japaneseChipCount: chipNames.filter((name) => /[ぁ-んァ-ヶ]/u.test(name)).length,
      fallbackCount: row.querySelectorAll('.story-cast-fallback-v7').length,
      spriteLinks: row.querySelectorAll('.story-sprite-link-v1, a[href*="kyu.gay"]').length,
      clippedNames: chips.filter((chip) => {
        const label = chip.querySelector('span:last-child');
        return label && label.scrollWidth > label.clientWidth + 1;
      }).map((chip) => chip.textContent.trim())
    };
  });
  assert(result.title.includes('神滨SPA大冒险 席卷沙滩的恶魔怨叹') && result.original.includes('神浜スパアドベンチャー'),
    'known story title uses the verified MagiReader translation and preserves the JP original', result);
  assert(result.tableCount === 0 && result.rowScrollWidth <= result.rowWidth + 2 && result.bodyWidth <= result.viewportWidth + 3,
    'story results use responsive cards without horizontal table scrolling', result);
  assert(result.titleVisible && result.castVisible, 'story title and cast remain visible in the same result card', result);
  assert(result.uniqueChips === result.chipNames.length && result.brokenImages === 0,
    'story cast is deduplicated and never shows a broken image icon', result);
  assert(result.japaneseChipCount === 0, 'known story cast names are localized to Chinese', result);
  assert(result.spriteLinks === 0, 'story cast labels do not navigate to the unrelated sprite viewer', result);
  assert(result.clippedNames.length === 0, 'story cast names are fully visible instead of ellipsized', result);
  await page.evaluate(() => [...document.querySelectorAll('.suite-quick-rail-v7 button')]
    .find((button) => button.textContent.trim() === '取消')?.click());
  const resetAudit = await page.evaluate(() => ({
    keyword: document.getElementById('storyKeyword').value,
    selected: document.querySelectorAll('#storyCharacterGrid .suite-character-card[aria-pressed="true"]').length,
    checkedTypes: [...document.querySelectorAll('#storyTypeOptions input')].filter((input) => input.checked).length,
    totalTypes: document.querySelectorAll('#storyTypeOptions input').length,
    resultsText: document.getElementById('storyResultsBody').textContent.trim()
  }));
  assert(resetAudit.keyword === '' && resetAudit.selected === 0
    && resetAudit.checkedTypes === resetAudit.totalTypes && resetAudit.resultsText.includes('尚未执行搜索'),
  'story quick-rail cancel resets filters, roles and results', resetAudit);
  assert(fatal(errors).length === 0, 'story V7 has no fatal JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/story-ui-v7-mobile.png', fullPage: false });
  await page.close();
}

async function testAttendance(browser) {
  const { page, errors } = await open(browser, '/attendance.html');
  await page.waitForFunction(() => window.MagiToolsV7?.resolveCharacterV7
    && document.querySelectorAll('#attendanceGrid .suite-character-card').length >= 180
    && document.querySelector('#attendanceAttributeFilterV7 .suite-attribute-v7'),
  { timeout: 40000 });
  const audit = await page.evaluate(() => {
    const hero = document.querySelector('.suite-hero');
    const card = document.querySelector('#attendanceGrid .suite-character-card');
    const name = card.querySelector('strong');
    const image = card.querySelector('img');
    const cardRect = card.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const grid = document.getElementById('attendanceGrid');
    const before = [...grid.querySelectorAll('.suite-character-card')].filter((item) => !item.hidden).length;
    const input = [...document.querySelectorAll('#attendanceAttributeFilterV7 input[data-attribute-v7]')]
      .find((candidate) => candidate.value === 'まどドラ')
      || document.querySelector('#attendanceAttributeFilterV7 input[data-attribute-v7]');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const after = [...grid.querySelectorAll('.suite-character-card')].filter((item) => !item.hidden).length;
    return {
      release: document.body.dataset.build,
      heroText: hero?.textContent.trim() || '',
      heroParagraphs: hero?.querySelectorAll('p').length || 0,
      forbidden: document.body.textContent.includes('界面统一使用本站中文角色名')
        || document.body.textContent.includes('查询仍使用原始日文角色键'),
      gap: cardRect.bottom - name.getBoundingClientRect().bottom,
      inlineGap: cardRect.width - imageRect.width,
      cardWidth: cardRect.width,
      before,
      after,
      quickButtons: document.querySelectorAll('.suite-quick-rail-v7 button').length,
      quickLabels: [...document.querySelectorAll('.suite-quick-rail-v7 button')].map((button) => button.textContent.trim()),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });
  assert(audit.release === EXPECTED_RELEASE && (!audit.heroText || audit.heroText === '共同出场次数排行')
    && audit.heroParagraphs === 0 && !audit.forbidden,
  'attendance visitor header contains no implementation commentary', audit);
  assert(audit.gap <= 4 && audit.inlineGap <= 10 && audit.cardWidth <= 68 && audit.after > 0 && audit.after < audit.before,
    'attendance cards are compact and attribute filtering works', audit);
  assert(audit.quickButtons >= 4 && audit.documentWidth <= audit.viewportWidth + 3,
    'attendance quick rail is present without page overflow', audit);
  assert(JSON.stringify(audit.quickLabels) === JSON.stringify(['顶部','筛选','角色','表格','取消','底部']),
    'attendance quick rail uses explicit labels and includes cancel below the table action', audit.quickLabels);
  await page.click('#attendanceGrid .suite-character-card');
  await page.evaluate(() => [...document.querySelectorAll('.suite-quick-rail-v7 button')]
    .find((button) => button.textContent.trim() === '取消')?.click());
  const attendanceReset = await page.evaluate(() => ({
    selected: document.querySelectorAll('#attendanceGrid .suite-character-card[aria-pressed="true"]').length,
    filter: document.getElementById('attendanceFilter').value,
    attributes: document.querySelectorAll('#attendanceAttributeFilterV7 input[data-attribute-v7]:checked').length,
    resultsText: document.getElementById('attendanceResultsBody').textContent.trim()
  }));
  assert(attendanceReset.selected === 0 && attendanceReset.filter === ''
    && attendanceReset.attributes === 0 && attendanceReset.resultsText.includes('尚未选择角色'),
  'attendance quick-rail cancel resets filters, role selection and results', attendanceReset);
  assert(fatal(errors).length === 0, 'attendance V7 has no fatal JavaScript errors', errors);
  await page.close();
}

async function testRootAndRunes(browser) {
  const root = await open(browser, '/');
  await root.page.waitForFunction(() => document.querySelectorAll('label.girlbox').length >= 180, { timeout: 30000 });
  const rootAudit = await root.page.evaluate(() => {
    const card = document.querySelector('label.girlbox');
    const avatar = card.querySelector('input.MagicalChk');
    const cardRect = card.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    return {
      release: document.body.dataset.build,
      existingControls: ['pagetop','pagemdl','pagebtm'].filter((id) => document.getElementById(id)).length,
      duplicateRail: document.querySelectorAll('.suite-quick-rail-v7').length,
      quickLabels: [...document.querySelectorAll('.call-quick-rail-v10 button')].map((button) => button.textContent.trim()),
      cardWidth: cardRect.width,
      inlineGap: cardRect.width - avatarRect.width,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });
  assert(rootAudit.release === EXPECTED_RELEASE && rootAudit.existingControls === 3 && rootAudit.duplicateRail === 0,
    'root page keeps its established pink controls without a duplicate rail', rootAudit);
  assert(rootAudit.cardWidth <= 68 && rootAudit.inlineGap <= 10,
    'root character cards keep the avatar and label tightly packed', rootAudit);
  assert(JSON.stringify(rootAudit.quickLabels) === JSON.stringify(['顶部','选人','筛选','属性','搜索','关系','表格','取消','身高','底部']),
    'root quick rail keeps explicit two-character labels and all existing actions', rootAudit.quickLabels);
  assert(rootAudit.documentWidth <= rootAudit.viewportWidth + 3, 'root page remains horizontally contained', rootAudit);
  await root.page.close();

  const runes = await open(browser, '/runes.html');
  await runes.page.waitForFunction(() => window.__RUNE_TEMPLATE_V7__, { timeout: 30000 });
  const runesAudit = await runes.page.evaluate(() => ({
    release: document.body.dataset.build,
    heroText: document.querySelector('.suite-hero').textContent.trim(),
    heroParagraphs: document.querySelector('.suite-hero').querySelectorAll('p').length,
    rail: document.querySelectorAll('.suite-quick-rail-v7').length
  }));
  assert(runesAudit.release === EXPECTED_RELEASE && runesAudit.heroText === '魔女文字解读'
    && runesAudit.heroParagraphs === 0 && runesAudit.rail === 0,
  'OCR page is compact and deliberately has no quick rail', runesAudit);
  await runes.page.close();
}

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
});

try {
  await testStory(browser);
  await testAttendance(browser);
  await testRootAndRunes(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
