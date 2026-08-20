import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const chromePath = process.env.CHROME_PATH;
const reportPath = process.env.REPORT_PATH || 'reports/v22-browser-smoke.json';
const build = 'v22-authority-20260820';
if (!chromePath) throw new Error('CHROME_PATH is required');

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const results = [];
const failures = [];
const warnings = [];
const viewports = [
  { name: 'mobile-360', width: 360, height: 800, deviceScaleFactor: 1 },
  { name: 'mobile-390', width: 390, height: 844, deviceScaleFactor: 1 },
  { name: 'mobile-412', width: 412, height: 915, deviceScaleFactor: 1 },
  { name: 'tablet-768', width: 768, height: 1024, deviceScaleFactor: 1 },
  { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1 },
];
const fail = (scope, message, details = {}) => failures.push({ scope, message, ...details });
const warn = (scope, message, details = {}) => warnings.push({ scope, message, ...details });

async function navigate(page, pathname, scope) {
  const separator = pathname.includes('?') ? '&' : '?';
  const response = await page.goto(`${base}${pathname}${separator}v22-smoke=${Date.now()}`, {
    waitUntil: 'networkidle2', timeout: 90_000,
  });
  if (!response || response.status() >= 400) {
    fail(scope, 'Page request failed', { status: response?.status(), url: page.url() });
    return false;
  }
  return true;
}

async function inspectIndex(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const consoleErrors = [];
  const requestFailures = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  if (!(await navigate(page, '/', viewport.name))) { await page.close(); return; }
  await page.waitForFunction((expected) => document.documentElement.dataset.v22Build === expected, { timeout: 30_000 }, build);

  const state = await page.evaluate(() => ({
    marker: document.querySelector('meta[name="magireco-v22-build"]')?.content || '',
    obsoleteVisible: [...document.querySelectorAll('body *')].some((element) => {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      const style = getComputedStyle(element);
      return text === '魔法纪录·Magia Exedra 魔法少女称呼搜索' && style.display !== 'none' && style.visibility !== 'hidden';
    }),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (state.marker !== build) fail(viewport.name, 'Missing V22 build marker', state);
  if (state.obsoleteVisible) fail(viewport.name, 'Obsolete title remains visible');
  if (state.scrollWidth > state.clientWidth + 12) fail(viewport.name, 'Page-level horizontal overflow', state);

  const menu = await page.evaluate(() => {
    const checkbox = document.querySelector('input[type="checkbox"].menu-btn, #menu-btn, input[type="checkbox"][id*="menu"]');
    const trigger = document.querySelector('label[for="menu-btn"], .menu-icon, .hamburger, button[aria-label*="菜单"], button[aria-label*="menu" i]');
    const hadTrigger = checkbox instanceof HTMLInputElement || trigger instanceof HTMLElement;
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (trigger instanceof HTMLElement) trigger.click();
    const panel = document.querySelector('[data-v22-menu-panel="true"], .hamburger-menu .menu, .menu-panel, .drawer-menu, nav.menu, #menu, .menu');
    if (!(panel instanceof HTMLElement)) return { found: false, hadTrigger };
    const rect = panel.getBoundingClientRect();
    const main = document.querySelector('main, #main, .main, .content, #content');
    const mainStyle = main instanceof HTMLElement ? getComputedStyle(main) : null;
    return {
      found: true, hadTrigger, width: rect.width, height: rect.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      mainVisible: !mainStyle || (mainStyle.display !== 'none' && mainStyle.visibility !== 'hidden' && Number(mainStyle.opacity || '1') !== 0),
      text: (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    };
  });
  if (menu.hadTrigger && !menu.found) fail(viewport.name, 'Menu trigger exists but panel was not resolved', menu);
  if (menu.found) {
    if (menu.width >= menu.viewportWidth * 0.96) fail(viewport.name, 'Menu spans the viewport', menu);
    if (menu.height >= menu.viewportHeight * 0.90) fail(viewport.name, 'Menu covers almost the whole viewport', menu);
    if (menu.bodyOverflowY === 'hidden') fail(viewport.name, 'Opening menu locks body scrolling', menu);
    if (!menu.mainVisible) fail(viewport.name, 'Opening menu hides page content', menu);
  }

  const relevantRequests = requestFailures.filter(({ url }) => !/google-analytics|googletagmanager|doubleclick|favicon|chrome-extension/i.test(url));
  const relevantConsole = consoleErrors.filter((text) => !/favicon|ResizeObserver loop|analytics|third.party/i.test(text));
  if (relevantRequests.length) warn(viewport.name, 'Non-critical failed requests discovered', { items: relevantRequests.slice(0, 30) });
  if (relevantConsole.length) warn(viewport.name, 'Pre-existing console errors discovered', { items: relevantConsole.slice(0, 30) });
  results.push({ scope: viewport.name, state, menu, requestFailures: relevantRequests, consoleErrors: relevantConsole });
  await page.close();
}

async function inspectAuthority() {
  const page = await browser.newPage();
  await page.setViewport(viewports[1]);
  if (!(await navigate(page, '/', 'authority-host'))) { await page.close(); return; }
  const payload = await page.evaluate(async () => {
    const response = await fetch(`/data/story-title-authority-v22.json?v=${Date.now()}`, { cache: 'no-store' });
    return { status: response.status, data: await response.json() };
  });
  const entries = Array.isArray(payload.data?.entries) ? payload.data.entries : [];
  if (payload.status !== 200) fail('authority-map', 'Authority map request failed', { status: payload.status });
  if (entries.length < 50) fail('authority-map', 'Authority map is unexpectedly small', { entries: entries.length });
  const kana = entries.filter((entry) => /[ぁ-ゖァ-ヺー]/u.test(entry.zh || ''));
  if (kana.length) fail('authority-map', 'Chinese authority values contain kana', { count: kana.length, sample: kana.slice(0, 20) });
  for (const [prefix, expected] of [
    ['No.739', '决不让意志消失'],
    ['No.740', '无感情的放学后'],
    ['No.749', '我要抽出4星'],
  ]) {
    const entry = entries.find((item) => String(item.ja || '').startsWith(prefix));
    if (entry && !String(entry.zh || '').includes(expected)) fail('authority-map', `Official title mismatch for ${prefix}`, { entry, expected });
  }
  results.push({ scope: 'authority-map', status: payload.status, entries: entries.length, kanaTranslations: kana.length });
  await page.close();
}

async function inspectEditor() {
  const page = await browser.newPage();
  await page.setViewport(viewports[1]);
  const response = await page.goto(`${base}/story-title-editor.html?v22=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  if (!response || response.status() >= 400) {
    results.push({ scope: 'story-title-editor', skipped: true, status: response?.status() });
    await page.close(); return;
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
    for (let index = 1; index < numbers.length; index += 1) if (numbers[index] < numbers[index - 1]) inversions += 1;
    return {
      inputs: inputs.length, populated: values.length, kanaValues: kana.length,
      kanaSample: kana.slice(0, 20), numericRows: numbers.length,
      numericInversions: inversions, scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  if (state.scrollWidth > state.clientWidth + 16) fail('story-title-editor', 'Mobile editor overflows the viewport', state);
  if (state.numericRows >= 10 && state.numericInversions > 0) fail('story-title-editor', 'No.n rows are not naturally sorted', state);
  if (state.kanaValues) warn('story-title-editor', 'Visible low-authority values still contain kana', { count: state.kanaValues, sample: state.kanaSample });
  results.push({ scope: 'story-title-editor', ...state });
  await page.close();
}

try {
  for (const viewport of viewports) await inspectIndex(viewport);
  await inspectAuthority();
  await inspectEditor();
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1, build, base, generatedAt: new Date().toISOString(),
  state: failures.length ? 'fail' : 'pass', failures, warnings, results,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
