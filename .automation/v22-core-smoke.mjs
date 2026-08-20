import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const CHROME_PATH = process.env.CHROME_PATH;
const OUT = process.env.ARTIFACT_DIR || '/tmp/v22-core-acceptance';
const RELEASE = 'v22-authoritative-localization-20260820';
if (!CHROME_PATH) throw new Error('CHROME_PATH is required');
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const observations = [];

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const bust = relative => `${BASE_URL}${relative}${relative.includes('?') ? '&' : '?'}v22core=${Date.now()}-${Math.random()}`;
for (const viewport of [{ width: 360, height: 800, name: 'mobile' }, { width: 1440, height: 1000, name: 'desktop' }]) {
  for (const relative of ['/', '/story.html', '/story-title-editor.html']) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const response = await page.goto(bust(relative), { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!response || response.status() >= 400) failures.push(`${relative}/${viewport.name}: HTTP ${response?.status() ?? 'none'}`);
    await new Promise(resolve => setTimeout(resolve, 800));
    const state = await page.evaluate(({ release, relative }) => {
      const root = document.documentElement;
      const checkbox = document.querySelector('.menu-btn, #menu-btn, input[type="checkbox"][class*="menu"]');
      const menu = document.querySelector('.menu');
      const beforeFixed = [...document.body.querySelectorAll('*')].filter(el => {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return s.position === 'fixed' && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.width <= 180 && r.right >= innerWidth - 36;
      }).length;
      let menuState = null;
      if (checkbox && menu) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        const r = menu.getBoundingClientRect();
        const afterFixed = [...document.body.querySelectorAll('*')].filter(el => {
          const s = getComputedStyle(el); const q = el.getBoundingClientRect();
          return s.position === 'fixed' && s.display !== 'none' && s.visibility !== 'hidden' && q.width > 0 && q.width <= 180 && q.right >= innerWidth - 36;
        }).length;
        menuState = {
          width: r.width, height: r.height,
          bodyOverflow: getComputedStyle(document.body).overflow,
          htmlOverflow: getComputedStyle(document.documentElement).overflow,
          beforeFixed, afterFixed,
        };
      }
      return {
        marker: document.querySelector('meta[name="v22-release"]')?.content || '',
        removedTitle: (document.body?.innerText || '').includes('魔法纪录·Magia Exedra 魔法少女称呼搜索'),
        navCount: document.querySelectorAll('.navtext-container').length,
        overflow: Math.max(0, root.scrollWidth - innerWidth),
        menuState,
        relative,
        release,
      };
    }, { release: RELEASE, relative });
    if (relative === '/' && state.marker !== RELEASE) failures.push(`${relative}/${viewport.name}: release marker missing`);
    if (relative === '/' && state.removedTitle) failures.push(`${relative}/${viewport.name}: removed title remains`);
    if (relative === '/' && state.navCount) failures.push(`${relative}/${viewport.name}: navtext-container remains`);
    if (state.overflow > 8) failures.push(`${relative}/${viewport.name}: horizontal overflow ${state.overflow}px`);
    if (state.menuState) {
      if (state.menuState.width >= viewport.width - 2) failures.push(`${relative}/${viewport.name}: menu is full width`);
      if (state.menuState.height >= viewport.height - 2) failures.push(`${relative}/${viewport.name}: menu is full height`);
      if (/hidden|clip/.test(state.menuState.bodyOverflow) || /hidden|clip/.test(state.menuState.htmlOverflow)) failures.push(`${relative}/${viewport.name}: menu locks scrolling`);
      if (state.menuState.beforeFixed > 0 && state.menuState.afterFixed === 0) failures.push(`${relative}/${viewport.name}: fixed right controls disappear`);
    }
    await page.screenshot({ path: path.join(OUT, `${relative === '/' ? 'index' : relative.slice(1).replace('.html', '')}-${viewport.name}.png`), fullPage: false });
    await page.close();
  }
}

async function json(relative) {
  const response = await fetch(bust(relative), { headers: { 'cache-control': 'no-cache, no-store' } });
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  return response.json();
}

let authority = null;
try {
  authority = await json('/data/story-title-authority-report-v22.json');
  if (authority.release !== RELEASE) failures.push('authority report release mismatch');
  if ((authority.uniqueTranslations || 0) < 1000) failures.push(`implausibly few localized titles: ${authority.uniqueTranslations}`);
  if ((authority.displayStillContainsKanaCount ?? 99999) > 500) failures.push(`too many displayed kana titles: ${authority.displayStillContainsKanaCount}`);
} catch (error) { failures.push(String(error)); }

try {
  const groups = await json('/downloads/story-title-groups.json');
  observations.push({ groupsType: Array.isArray(groups) ? 'array' : typeof groups });
} catch (error) { failures.push(String(error)); }

await browser.close();
const report = {
  release: RELEASE,
  baseUrl: BASE_URL,
  state: failures.length ? 'fail' : 'pass',
  failures,
  observations,
  authoritySummary: authority ? {
    uniqueTranslations: authority.uniqueTranslations,
    missingAuthoritativeCount: authority.missingAuthoritativeCount,
    displayStillContainsKanaCount: authority.displayStillContainsKanaCount,
    counts: authority.counts,
  } : null,
};
fs.writeFileSync(path.join(OUT, 'core-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
