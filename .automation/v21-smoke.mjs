import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.BASE_URL;
const fixtures = process.env.FIXTURE_DIR;
const chrome = process.env.CHROME_PATH;
if (!base || !fixtures || !chrome) throw new Error('BASE_URL, FIXTURE_DIR and CHROME_PATH are required');

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});

function assert(value, message, detail = null) {
  if (!value) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
  console.log(`PASS ${message}`);
}

async function open(route) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}${route}?v21=${Date.now()}-${Math.random()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  return { page, errors };
}

async function uploadAndRecognize(page, fileName, preprocess, layout, expected) {
  const input = await page.$('#runesFile');
  await input.uploadFile(path.join(fixtures, fileName));
  await page.select('#runesPreprocess', preprocess);
  await page.select('#runesLayout', layout);
  await page.click('#runesRecognize');
  await page.waitForFunction(
    value => document.getElementById('runesOutput')?.value?.trim() === value
      || document.getElementById('runesStatus')?.dataset.kind === 'error',
    { timeout: 150000 },
    expected
  );
  const result = await page.evaluate(() => ({
    output: document.getElementById('runesOutput')?.value?.trim() || '',
    status: document.getElementById('runesStatus')?.textContent || '',
    diagnostics: document.getElementById('runesDiagnostics')?.textContent || ''
  }));
  assert(result.output === expected, `${fileName} recognition`, result);
}

try {
  let { page, errors } = await open('/');
  await page.waitForFunction(() => document.querySelectorAll('input.MagicalChk').length > 180, { timeout: 60000 });
  const callState = await page.evaluate(async () => {
    const search = document.querySelector('.call-search-panel-v8');
    const selection = document.querySelector('.call-selection-panel-v8');
    const menuButton = document.getElementById('menu-btn');
    const menuIcon = document.querySelector('label[for="menu-btn"]');
    menuIcon.click();
    await new Promise(resolve => setTimeout(resolve, 450));
    const fixed = [...document.querySelectorAll('#pagetop,#pagemdl,#pagebtm,.call-quick-rail-v10')]
      .map(node => {
        const style = getComputedStyle(node);
        return {
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          pointerEvents: style.pointerEvents
        };
      });
    const opened = menuButton.checked;
    menuIcon.click();
    await new Promise(resolve => setTimeout(resolve, 450));
    return {
      build: document.body.dataset.build || '',
      searchOpen: search?.open,
      searchBefore: Boolean(search && selection && (search.compareDocumentPosition(selection) & Node.DOCUMENT_POSITION_FOLLOWING)),
      helpCount: document.querySelectorAll('.call-help-toggle-v10,.call-help-details-v10').length,
      intro: document.body.innerText.includes('点击右侧的“搜”')
        && document.body.innerText.includes('或此处的“称呼搜索”按钮'),
      editorMenu: [...document.querySelectorAll('.menu a')].some(a => /story-title-editor\.html/.test(a.getAttribute('href') || '')),
      nav: [...document.querySelectorAll('.suite-nav a')].map(a => a.textContent.trim()),
      opened,
      closed: !menuButton.checked,
      fixedHidden: fixed.every(item => item.display === 'none'
        || item.visibility === 'hidden'
        || item.opacity === 0
        || item.pointerEvents === 'none')
    };
  });
  assert(callState.build === 'safe-call-layout-v21-20260819', 'call build marker', callState);
  assert(callState.searchOpen === false && callState.searchBefore, 'search conditions first and collapsed', callState);
  assert(callState.helpCount === 0, 'operation help removed', callState);
  assert(callState.intro, 'call instruction updated', callState);
  assert(callState.editorMenu, 'editor hamburger entry', callState);
  assert(callState.nav.includes('魔女文翻译'), 'rune nav renamed', callState);
  assert(callState.opened && callState.closed && callState.fixedHidden, 'hamburger covers fixed arrows', callState);

  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label.girlbox')]
      .find(node => (node.textContent || '').includes('蓝家姬奈'));
    const input = label?.querySelector('input.MagicalChk');
    if (!input) throw new Error('Aika Himena was not found');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('input[name="call_search"]')?.click();
  });
  await page.waitForFunction(
    () => document.getElementById('mytable')?.innerText?.includes('私チャン (Watashi-chan / 我酱【直译】/人家)'),
    { timeout: 60000 }
  );
  assert(errors.length === 0, 'call page has no JS errors', errors);
  await page.close();

  ({ page, errors } = await open('/story-title-editor.html'));
  await page.waitForFunction(
    () => document.querySelectorAll('#titleEditorList tr[data-group-id]').length > 1000,
    { timeout: 120000 }
  );
  const editorState = await page.evaluate(() => ({
    build: document.body.dataset.build || '',
    rows: document.querySelectorAll('#titleEditorList tr[data-group-id]').length,
    columns: document.querySelectorAll('.story-title-table-v2 thead th').length,
    notes: document.querySelectorAll('textarea,[data-title-field="note"],[data-title-field="status"]').length,
    pagination: document.querySelectorAll('[class*="pagination"],#titlePrevPage,#titleNextPage').length,
    cards: document.querySelectorAll('.story-title-card,.story-title-group-card').length,
    inputs: document.querySelectorAll('#titleEditorList input[data-title-field="translation"]').length,
    emptyValues: [...document.querySelectorAll('#titleEditorList input[data-title-field="translation"]')]
      .filter(input => !input.value.trim()).length
  }));
  assert(editorState.build === 'story-title-dense-v21-20260819', 'editor build marker', editorState);
  assert(editorState.rows > 1000 && editorState.columns === 2, 'dense two-column editor', editorState);
  assert(editorState.notes === 0 && editorState.pagination === 0 && editorState.cards === 0, 'old editor fields removed', editorState);
  assert(editorState.inputs === editorState.rows && editorState.emptyValues === 0, 'current translations prefilled', editorState);
  assert(errors.length === 0, 'editor has no JS errors', errors);
  await page.close();

  ({ page, errors } = await open('/runes.html'));
  await page.waitForFunction(
    () => window.__RUNE_COLOR_V14__ && window.__RUNE_GLYPH_V16__
      && window.__RUNE_MASK_V9__ && window.__RUNE_MASK_GLYPH_V19__,
    { timeout: 60000 }
  );
  const runeState = await page.evaluate(() => ({
    build: document.body.dataset.build || '',
    nav: [...document.querySelectorAll('.suite-nav a')].map(a => a.textContent.trim()),
    title: document.title,
    refWidth: document.querySelector('#runesReferenceDetailsV9 img,.runes-reference-details-v9 img')?.getBoundingClientRect().width || 0
  }));
  assert(runeState.build === 'rune-glyph-color-chart-v21-20260819', 'rune build marker', runeState);
  assert(runeState.nav.length === 4 && runeState.nav.includes('魔女文翻译'), 'rune four-button navigation', runeState);
  assert(runeState.title.includes('魔女文翻译') && runeState.refWidth <= 700, 'rune title and compact chart', runeState);

  await uploadAndRecognize(page, 'charlotte.png', 'decorated', 'line', 'CHARLOTTE');
  await page.click('#runesClear');

  const fileInput = await page.$('#runesFile');
  await fileInput.uploadFile(path.join(fixtures, 'charlotte.png'));
  await page.waitForFunction(() => window.__RUNE_MASK_V9__?.state?.workingFile, { timeout: 30000 });
  await page.evaluate(() => {
    const api = window.__RUNE_MASK_V9__;
    const enabled = document.getElementById('runesMaskEnabled');
    if (!enabled.checked) enabled.click();
    api.clear();
    for (const y of [184, 202, 220]) {
      api.addStroke([{ x: 0, y }, { x: 396, y }], 52, 'paint');
    }
  });
  await page.select('#runesPreprocess', 'decorated');
  await page.select('#runesLayout', 'line');
  await page.click('#runesRecognize');
  await page.waitForFunction(
    () => document.getElementById('runesOutput')?.value?.trim() === 'CHARLOTTE'
      || document.getElementById('runesStatus')?.dataset.kind === 'error',
    { timeout: 150000 }
  );
  const maskResult = await page.evaluate(() => ({
    output: document.getElementById('runesOutput')?.value?.trim() || '',
    status: document.getElementById('runesStatus')?.textContent || ''
  }));
  assert(maskResult.output === 'CHARLOTTE', 'painted mask CHARLOTTE', maskResult);
  await page.click('#runesClear');

  await uploadAndRecognize(page, 'alphabet.jpg', 'auto', 'chart', 'abcdefg\nhijklmn\nopqrstu\nvwxyz');
  assert(errors.length === 0, 'runes page has no JS errors', errors);
  await page.close();

  await browser.close();
  console.log(JSON.stringify({ state: 'pass' }));
} catch (error) {
  await browser.close().catch(() => {});
  console.error(error);
  process.exit(1);
}
