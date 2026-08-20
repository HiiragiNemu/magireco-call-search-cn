import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const CHROME_PATH = process.env.CHROME_PATH;
const OUT = process.env.ARTIFACT_DIR || '/tmp/v22-acceptance';
const RELEASE = 'v22-authoritative-localization-20260820';
if (!CHROME_PATH) throw new Error('CHROME_PATH is required');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const results = [];
const failures = [];
const warnings = [];
const viewports = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];
const pages = ['/', '/story.html', '/story-title-editor.html'];

function cacheBusted(relative) {
  const glue = relative.includes('?') ? '&' : '?';
  return `${BASE_URL}${relative}${glue}v22=${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function inspectPage(relative, viewport) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('requestfailed', request => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' });
  });
  const started = Date.now();
  const response = await page.goto(cacheBusted(relative), { waitUntil: 'networkidle2', timeout: 60000 });
  const elapsedMs = Date.now() - started;
  if (!response || response.status() >= 400) {
    failures.push(`${relative} at ${viewport.name}: HTTP ${response?.status() ?? 'no response'}`);
  }
  await new Promise(resolve => setTimeout(resolve, 600));

  const snapshot = await page.evaluate(({ release, removedTitle }) => {
    const bodyText = document.body?.innerText || '';
    const root = document.documentElement;
    const horizontalOverflow = Math.max(0, root.scrollWidth - innerWidth);
    const marker = document.querySelector('meta[name="v22-release"]')?.content || '';
    const checkbox = document.querySelector('.menu-btn, #menu-btn, input[type="checkbox"][class*="menu"]');
    const menu = document.querySelector('.menu');
    const mainCandidates = [...document.querySelectorAll('main, #main, .main, .container, .content')];
    const mainVisible = mainCandidates.some(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const fixedRight = [...document.body.querySelectorAll('*')].filter(el => {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.width <= 180 && r.height > 0 && r.right >= innerWidth - 36;
    }).length;
    return {
      marker,
      markerOk: marker === release,
      removedTitleInBody: bodyText.includes(removedTitle),
      navTextContainerCount: document.querySelectorAll('.navtext-container').length,
      horizontalOverflow,
      mainVisible,
      hasCheckbox: Boolean(checkbox),
      hasMenu: Boolean(menu),
      fixedRight,
      title: document.title,
    };
  }, { release: RELEASE, removedTitle: '魔法纪录·Magia Exedra 魔法少女称呼搜索' });

  let menuState = null;
  if (snapshot.hasCheckbox && snapshot.hasMenu) {
    menuState = await page.evaluate(() => {
      const checkbox = document.querySelector('.menu-btn, #menu-btn, input[type="checkbox"][class*="menu"]');
      const menu = document.querySelector('.menu');
      const beforeFixed = [...document.body.querySelectorAll('*')].filter(el => {
        const style = getComputedStyle(el);
        if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.width <= 180 && r.height > 0 && r.right >= innerWidth - 36;
      }).length;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      const r = menu.getBoundingClientRect();
      const bodyOverflow = getComputedStyle(document.body).overflow;
      const htmlOverflow = getComputedStyle(document.documentElement).overflow;
      const afterFixed = [...document.body.querySelectorAll('*')].filter(el => {
        const style = getComputedStyle(el);
        if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.width <= 180 && rect.height > 0 && rect.right >= innerWidth - 36;
      }).length;
      return {
        width: r.width,
        height: r.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        bodyOverflow,
        htmlOverflow,
        beforeFixed,
        afterFixed,
        ariaExpanded: checkbox.getAttribute('aria-expanded'),
        ariaControls: checkbox.getAttribute('aria-controls'),
      };
    });
    if (menuState.width >= viewport.width - 2) {
      failures.push(`${relative} at ${viewport.name}: menu still covers full viewport width (${menuState.width}/${viewport.width})`);
    }
    if (menuState.height >= viewport.height - 2) {
      failures.push(`${relative} at ${viewport.name}: menu still covers full viewport height (${menuState.height}/${viewport.height})`);
    }
    if (/hidden|clip/.test(menuState.bodyOverflow) || /hidden|clip/.test(menuState.htmlOverflow)) {
      failures.push(`${relative} at ${viewport.name}: opening menu locks document scrolling`);
    }
    if (menuState.beforeFixed > 0 && menuState.afterFixed === 0) {
      failures.push(`${relative} at ${viewport.name}: opening menu hides the fixed right-side controls`);
    }
    if (!menuState.ariaControls) {
      failures.push(`${relative} at ${viewport.name}: menu control has no aria-controls`);
    }
  }

  if (snapshot.horizontalOverflow > 4) {
    failures.push(`${relative} at ${viewport.name}: horizontal overflow ${snapshot.horizontalOverflow}px`);
  }
  if (relative === '/') {
    if (!snapshot.markerOk) failures.push(`${relative} at ${viewport.name}: V22 release marker missing`);
    if (snapshot.removedTitleInBody) failures.push(`${relative} at ${viewport.name}: removed title remains in body`);
    if (snapshot.navTextContainerCount) failures.push(`${relative} at ${viewport.name}: navtext-container remains`);
  }
  if (!snapshot.mainVisible && relative !== '/') {
    warnings.push(`${relative} at ${viewport.name}: no conventional visible main container was detected`);
  }
  if (elapsedMs > 15000) warnings.push(`${relative} at ${viewport.name}: network-idle load took ${elapsedMs}ms`);

  const localOrigin = new URL(BASE_URL).origin;
  const sameOriginFailures = failedRequests.filter(item => {
    try { return new URL(item.url).origin === localOrigin; } catch { return false; }
  });
  if (sameOriginFailures.length) {
    failures.push(`${relative} at ${viewport.name}: ${sameOriginFailures.length} same-origin requests failed`);
  }
  if (pageErrors.length) failures.push(`${relative} at ${viewport.name}: page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
  if (consoleErrors.length) warnings.push(`${relative} at ${viewport.name}: console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);

  const safeName = relative === '/' ? 'index' : relative.replace(/^\//, '').replace(/\.html$/, '');
  await page.screenshot({
    path: path.join(OUT, `${safeName}-${viewport.name}.png`),
    fullPage: false,
  });
  const item = { relative, viewport, elapsedMs, snapshot, menuState, consoleErrors, pageErrors, failedRequests };
  results.push(item);
  await page.close();
}

for (const viewport of viewports) {
  for (const relative of pages) {
    await inspectPage(relative, viewport);
  }
}

async function fetchJson(relative) {
  const response = await fetch(cacheBusted(relative), { headers: { 'cache-control': 'no-cache, no-store' } });
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  return response.json();
}

let authorityReport;
try {
  authorityReport = await fetchJson('/data/story-title-authority-report-v22.json');
  if (authorityReport.release !== RELEASE) failures.push('authority report release marker mismatch');
  if ((authorityReport.displayStillContainsKanaCount ?? 999999) > 250) {
    failures.push(`authority report still contains too many displayed kana titles: ${authorityReport.displayStillContainsKanaCount}`);
  }
  if ((authorityReport.uniqueTranslations ?? 0) < 1000) {
    failures.push(`authority report has implausibly few title records: ${authorityReport.uniqueTranslations}`);
  }
} catch (error) {
  failures.push(`cannot load authority report: ${error}`);
}

let siteAudit;
try {
  siteAudit = await fetchJson('/data/v22-site-audit.json');
  if (siteAudit.release !== RELEASE) failures.push('site audit release marker mismatch');
  if (siteAudit.state === 'fail') failures.push('site static audit reports fail');
} catch (error) {
  failures.push(`cannot load site audit: ${error}`);
}

function titleOf(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  for (const key of ['titleZh', 'titleCn', 'translation', 'translatedTitle', 'title', 'name']) {
    if (typeof item[key] === 'string') return item[key];
  }
  return '';
}
function inspectNaturalSort(node, trail = [], defects = []) {
  if (Array.isArray(node)) {
    const numbered = node.map((item, index) => {
      const match = titleOf(item).match(/^\s*No\.\s*(\d+)\b/i);
      return match ? { index, number: Number(match[1]) } : null;
    }).filter(Boolean);
    if (numbered.length >= 3 && numbered.length / node.length >= 0.6) {
      for (let i = 1; i < numbered.length; i += 1) {
        if (numbered[i].number < numbered[i - 1].number) {
          defects.push({ trail: trail.join('/'), before: numbered[i - 1].number, after: numbered[i].number });
          break;
        }
      }
    }
    node.forEach((child, index) => inspectNaturalSort(child, [...trail, String(index)], defects));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) inspectNaturalSort(value, [...trail, key], defects);
  }
  return defects;
}

try {
  const groups = await fetchJson('/downloads/story-title-groups.json');
  const defects = inspectNaturalSort(groups);
  if (defects.length) failures.push(`No.n numeric ordering defects remain: ${JSON.stringify(defects.slice(0, 5))}`);
} catch (error) {
  failures.push(`cannot load or validate story-title-groups.json: ${error}`);
}

await browser.close();
const report = {
  release: RELEASE,
  baseUrl: BASE_URL,
  state: failures.length ? 'fail' : 'pass',
  failures,
  warnings,
  authoritySummary: authorityReport ? {
    uniqueTranslations: authorityReport.uniqueTranslations,
    missingAuthoritativeCount: authorityReport.missingAuthoritativeCount,
    displayStillContainsKanaCount: authorityReport.displayStillContainsKanaCount,
    counts: authorityReport.counts,
  } : null,
  siteAuditSummary: siteAudit?.summary || null,
  pages: results,
};
fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  state: report.state,
  failures: report.failures,
  warnings: report.warnings,
  authoritySummary: report.authoritySummary,
  siteAuditSummary: report.siteAuditSummary,
}, null, 2));
if (failures.length) process.exit(1);
