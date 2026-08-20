import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const chrome = process.env.CHROME_PATH;
const output = process.env.REPORT_PATH || 'reports/v22-core-browser.json';
const build = 'v22-authority-20260820';
if (!chrome) throw new Error('CHROME_PATH is required');

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const failures = [];
const observations = [];
const fail = (scope, message, detail = {}) => failures.push({ scope, message, ...detail });

async function inspect(width, height) {
  const scope = `${width}x${height}`;
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const response = await page.goto(`${base}/?accept=${Date.now()}-${width}`, {
    waitUntil: 'networkidle2', timeout: 90000,
  });
  if (!response || response.status() >= 400) {
    fail(scope, 'index request failed', { status: response?.status() });
    await page.close();
    return;
  }
  await page.waitForFunction((expected) => document.documentElement.dataset.v22Build === expected, { timeout: 30000 }, build);
  const result = await page.evaluate(() => {
    const bodyText = [...document.body.querySelectorAll('*')]
      .filter((element) => !['SCRIPT', 'STYLE'].includes(element.tagName))
      .some((element) => {
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
        const style = getComputedStyle(element);
        return text === '魔法纪录·Magia Exedra 魔法少女称呼搜索'
          && style.display !== 'none' && style.visibility !== 'hidden';
      });
    const checkbox = document.querySelector('input[type="checkbox"].menu-btn, #menu-btn, input[type="checkbox"][id*="menu"]');
    const trigger = document.querySelector('label[for="menu-btn"], .menu-icon, .hamburger, button[aria-label*="菜单"], button[aria-label*="menu" i]');
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (trigger instanceof HTMLElement) {
      trigger.click();
    }
    const panel = document.querySelector('[data-v22-menu-panel="true"], .hamburger-menu .menu, .menu-panel, .drawer-menu, nav.menu, #menu, .menu');
    const panelResult = panel instanceof HTMLElement ? (() => {
      const rect = panel.getBoundingClientRect();
      return {
        found: true,
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflowY,
        text: (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      };
    })() : { found: false };
    return {
      build: document.documentElement.dataset.v22Build,
      marker: document.querySelector('meta[name="magireco-v22-build"]')?.content || '',
      obsoleteVisible: bodyText,
      css: [...document.styleSheets].some((sheet) => String(sheet.href || '').includes('v22-final.css')),
      script: [...document.scripts].some((script) => String(script.src || '').includes('v22-final.js')),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      panel: panelResult,
      hadMenuTrigger: checkbox instanceof HTMLInputElement || trigger instanceof HTMLElement,
    };
  });
  if (result.build !== build || result.marker !== build) fail(scope, 'build marker mismatch', result);
  if (!result.css || !result.script) fail(scope, 'V22 assets not loaded', result);
  if (result.obsoleteVisible) fail(scope, 'obsolete heading remains visible');
  if (result.panel.found) {
    if (result.panel.width >= width * 0.94) fail(scope, 'menu remains viewport-wide', result.panel);
    if (result.panel.height >= height * 0.86) fail(scope, 'menu remains viewport-high', result.panel);
    if (result.panel.bodyOverflow === 'hidden') fail(scope, 'menu locks body scrolling', result.panel);
  } else if (result.hadMenuTrigger) {
    fail(scope, 'menu trigger exists but panel cannot be resolved');
  }
  observations.push({ scope, ...result });
  await page.close();
}

async function inspectAuthority() {
  const page = await browser.newPage();
  const response = await page.goto(`${base}/data/story-title-authority-v22.json?accept=${Date.now()}`, {
    waitUntil: 'networkidle0', timeout: 90000,
  });
  if (!response || response.status() >= 400) {
    fail('authority', 'authority map request failed', { status: response?.status() });
    await page.close();
    return;
  }
  const text = await page.evaluate(() => document.body.innerText);
  let payload;
  try { payload = JSON.parse(text); } catch (error) {
    fail('authority', 'authority map is not JSON', { error: String(error) });
    await page.close();
    return;
  }
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const kana = entries.filter((entry) => /[ぁ-ゖァ-ヺー]/u.test(String(entry?.zh || '')));
  if (entries.length < 50) fail('authority', 'authority map unexpectedly small', { count: entries.length });
  if (kana.length) fail('authority', 'authority values contain kana', { count: kana.length, sample: kana.slice(0, 20) });
  observations.push({ scope: 'authority', entries: entries.length, kana: kana.length });
  await page.close();
}

try {
  await inspect(390, 844);
  await inspect(1440, 900);
  await inspectAuthority();
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
  observations,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
