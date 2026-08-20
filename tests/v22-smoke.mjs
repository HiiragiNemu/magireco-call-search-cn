import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const chromePath = process.env.CHROME_PATH;
const reportPath = process.env.REPORT_PATH || 'reports/v22-browser-smoke.json';
const build = 'v22-authority-20260820';

if (!chromePath) {
  throw new Error('CHROME_PATH is required');
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const results = [];
const failures = [];
const viewports = [
  { name: 'mobile-360', width: 360, height: 800, deviceScaleFactor: 1 },
  { name: 'mobile-390', width: 390, height: 844, deviceScaleFactor: 1 },
  { name: 'mobile-412', width: 412, height: 915, deviceScaleFactor: 1 },
  { name: 'tablet-768', width: 768, height: 1024, deviceScaleFactor: 1 },
  { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1 },
];

function fail(scope, message, details = {}) {
  failures.push({ scope, message, ...details });
}

async function inspectIndex(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const consoleErrors = [];
  const requestFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!/google-analytics|googletagmanager|doubleclick|favicon/i.test(url)) {
      requestFailures.push({ url, error: request.failure()?.errorText || 'unknown' });
    }
  });

  const url = `${base}/?v22-smoke=${Date.now()}-${viewport.name}`;
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
  if (!response || !response.ok()) fail(viewport.name, 'Index request failed', { status: response?.status() });
  await page.waitForFunction((expected) => document.documentElement.dataset.v22Build === expected, { timeout: 30_000 }, build);

  const before = await page.evaluate(() => ({
    marker: document.querySelector('meta[name="magireco-v22-build"]')?.content || '',
    obsoleteVisible: [...document.querySelectorAll('body *')].some((element) => {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      const style = getComputedStyle(element);
      return text === '魔法纪录·Magia Exedra 魔法少女称呼搜索' && style.display !== 'none' && style.visibility !== 'hidden';
    }),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }));

  if (before.marker !== build) fail(viewport.name, 'Missing V22 build marker', before);
  if (before.obsoleteVisible) fail(viewport.name, 'Obsolete site title remains visible');
  if (before.scrollWidth > before.clientWidth + 4) fail(viewport.name, 'Unexpected page-level horizontal overflow', before);

  const menuResult = await page.evaluate(() => {
    const checkbox = document.querySelector('input[type="checkbox"].menu-btn, #menu-btn, input[type="checkbox"][id*="menu"]');
    const clickTarget = document.querySelector('label[for="menu-btn"], .menu-icon, .hamburger, button[aria-label*="菜单"], button[aria-label*="menu" i]');
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (clickTarget instanceof HTMLElement) {
      clickTarget.click();
    }
    const panel = document.querySelector('[data-v22-menu-panel="true"], .hamburger-menu .menu, .menu-panel, .drawer-menu, nav.menu, #menu, .menu');
    if (!(panel instanceof HTMLElement)) return { found: false };
    const rect = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const bodyStyle = getComputedStyle(document.body);
    const main = document.querySelector('main, #main, .main, .content, #content');
    const mainStyle = main instanceof HTMLElement ? getComputedStyle(main) : null;
    return {
      found: true,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      display: style.display,
      position: style.position,
      bodyOverflowY: bodyStyle.overflowY,
      mainVisible: !mainStyle || (mainStyle.display !== 'none' && mainStyle.visibility !== 'hidden' && Number(mainStyle.opacity || '1') !== 0),
      text: (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    };
  });

  if (menuResult.found) {
    if (menuResult.width >= menuResult.viewportWidth * 0.96) fail(viewport.name, 'Menu still spans the viewport', menuResult);
    if (menuResult.height >= menuResult.viewportHeight * 0.98) fail(viewport.name, 'Menu still replaces the full page', menuResult);
    if (menuResult.bodyOverflowY === 'hidden') fail(viewport.name, 'Menu locks body scrolling', menuResult);
    if (!menuResult.mainVisible) fail(viewport.name, 'Opening menu hides the page content', menuResult);
  }

  if (requestFailures.length) fail(viewport.name, 'Static request failures', { requestFailures });
  const relevantConsoleErrors = consoleErrors.filter((text) => !/favicon|ResizeObserver loop|third.party|analytics/i.test(text));
  if (relevantConsoleErrors.length) fail(viewport.name, 'Console errors', { consoleErrors: relevantConsoleErrors });

  results.push({ scope: viewport.name, before, menu: menuResult, requestFailures, consoleErrors: relevantConsoleErrors });
  await page.close();
}

async function inspectData() {
  const page = await browser.newPage();
  const payload = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    return { status: response.status, data: await response.json() };
  }, `${base}/data/story-title-authority-v22.json?v=${Date.now()}`);
  const entries = Array.isArray(payload.data?.entries) ? payload.data.entries : [];
  const map = new Map(entries.map((entry) => [entry.ja, entry]));
  if (payload.status !== 200) fail('authority-map', 'Authority map request failed', { status: payload.status });
  if (entries.length < 500) fail('authority-map', 'Authority map is unexpectedly small', { entries: entries.length });
  const kanaTranslations = entries.filter((entry) => /[ぁ-ゖァ-ヺー]/u.test(entry.zh || ''));
  if (kanaTranslations.length) fail('authority-map', 'Chinese authority values still contain kana', { count: kanaTranslations.length, sample: kanaTranslations.slice(0, 20) });

  const officialSamples = [
    ['No.739', '决不让意志消失'],
    ['No.740', '无感情的放学后'],
    ['No.749', '我要抽出4星'],
  ];
  for (const [prefix, expected] of officialSamples) {
    const entry = entries.find((item) => String(item.ja || '').startsWith(prefix));
    if (entry && !String(entry.zh || '').includes(expected)) {
      fail('authority-map', `Official memory title mismatch for ${prefix}`, { entry, expected });
    }
  }

  results.push({ scope: 'authority-map', status: payload.status, entries: entries.length, kanaTranslations: kanaTranslations.length, sampleKeys: [...map.keys()].slice(0, 20) });
  await page.close();
}

async function inspectEditor() {
  const page = await browser.newPage();
  await page.setViewport(viewports[1]);
  const response = await page.goto(`${base}/story-title-editor.html?v22=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  if (!response || response.status() >= 400) {
    results.push({ scope: 'story-title-editor', skipped: true, status: response?.status() });
    await page.close();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const state = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="text"], textarea')];
    const values = inputs.map((input) => input.value || '').filter(Boolean);
    const kana = values.filter((value) => /[ぁ-ゖァ-ヺー]/u.test(value));
    const rows = [...document.querySelectorAll('tr, li, .row, .result-row, .story-row')];
    const numbers = rows.map((row) => {
      const match = (row.textContent || '').match(/^\s*No\.\s*(\d+)\b/i);
      return match ? Number(match[1]) : null;
    }).filter((value) => value !== null);
    let inversions = 0;
    for (let index = 1; index < numbers.length; index += 1) {
      if (numbers[index] < numbers[index - 1]) inversions += 1;
    }
    return {
      inputs: inputs.length,
      populated: values.length,
      kanaValues: kana.length,
      kanaSample: kana.slice(0, 20),
      numericRows: numbers.length,
      numericInversions: inversions,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  if (state.scrollWidth > state.clientWidth + 4) fail('story-title-editor', 'Mobile editor overflows the viewport', state);
  if (state.numericRows >= 10 && state.numericInversions > 0) fail('story-title-editor', 'No.n rows are not naturally sorted', state);
  results.push({ scope: 'story-title-editor', ...state });
  await page.close();
}

try {
  for (const viewport of viewports) await inspectIndex(viewport);
  await inspectData();
  await inspectEditor();
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  build,
  base,
  generatedAt: new Date().toISOString(),
  state: failures.length ? 'fail' : 'pass',
  failures,
  results,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
