import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'neo11-height-guide-v4-20260816';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

async function waitForSite(page) {
  await page.waitForFunction(() => document.readyState === 'complete'
    && typeof window.drawAndJump === 'function'
    && typeof window.displayHeightChart === 'function'
    && window.__MAGIRECO_CORRECTION_V4__
    && document.querySelectorAll('input.MagicalChk[name="chara"]').length >= 180,
  { timeout: 30000 });
  await sleep(500);
}

async function jumpAudit(page, buttonSelector, targetSelector, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(150);
  await page.click(buttonSelector);
  await sleep(1150);
  const result = await page.evaluate((selector) => {
    const target = document.querySelector(selector);
    const rect = target?.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      targetTop: rect?.top ?? null,
      targetVisible: Boolean(target && rect && rect.bottom > 0 && rect.top < innerHeight),
      targetDisplay: target ? getComputedStyle(target).display : null
    };
  }, targetSelector);
  assert(result.scrollY > 120, `${label} moves the document down`, result);
  assert(result.targetVisible && result.targetTop >= -20 && result.targetTop <= 110,
    `${label} lands at the correct result interface`, result);
}

async function heightGuideAudit(page, mobile) {
  await page.evaluate(() => window.displayHeightChart('global'));
  await page.waitForSelector('.height-chart-surface-v2[data-v4-enhanced="true"]');
  await page.waitForSelector('[data-height-guide-mode-v4]');
  await sleep(700);

  await page.select('[data-height-guide-mode-v4]', 'visible-nearest');
  await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    viewport.scrollLeft = Math.floor(Math.max(0, viewport.scrollWidth - viewport.clientWidth) * 0.44);
    viewport.dispatchEvent(new Event('scroll'));
  });
  await sleep(350);

  const nearest = await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const plot = document.querySelector('.height-plot-v2');
    const leftAxis = document.querySelector('.height-y-axis-left-v3');
    const rightAxis = document.querySelector('.height-y-axis-right-v3');
    const leftRect = leftAxis.getBoundingClientRect();
    const rightRect = rightAxis.getBoundingClientRect();
    const leftBoundary = leftRect.right;
    const rightBoundary = rightRect.left;
    const points = [...plot.querySelectorAll('.height-point-v2')];
    const audits = [];
    let hiddenOutside = 0;
    for (const point of points) {
      const pairId = point.dataset.heightGuidePairV4;
      const guide = plot.querySelector(`.height-point-guide-v2[data-height-guide-pair-v4="${pairId}"]`);
      const pointRect = point.getBoundingClientRect();
      const guideStyle = getComputedStyle(guide);
      const visible = pointRect.left >= leftBoundary + 1 && pointRect.right <= rightBoundary - 1;
      if (!visible) {
        if (guideStyle.display === 'none' || guide.dataset.v4Visible === 'false') hiddenOutside += 1;
        continue;
      }
      const guideRect = guide.getBoundingClientRect();
      const center = pointRect.left + pointRect.width / 2;
      const expected = Math.abs(center - leftBoundary) <= Math.abs(rightBoundary - center) ? 'left' : 'right';
      const rulerGap = expected === 'left'
        ? Math.abs(guideRect.left - leftBoundary)
        : Math.abs(guideRect.right - rightBoundary);
      const pointGap = expected === 'left'
        ? Math.abs(guideRect.right - pointRect.left)
        : Math.abs(guideRect.left - pointRect.right);
      audits.push({
        name: point.dataset.character,
        expected,
        actual: guide.dataset.v4Direction,
        display: guideStyle.display,
        rulerGap,
        pointGap,
        width: guideRect.width
      });
    }
    return {
      totalPoints: points.length,
      visibleCount: audits.length,
      displayedCount: Number(plot.dataset.v4DisplayedGuides || 0),
      hiddenOutside,
      audits,
      status: document.querySelector('.height-guide-status-v4')?.textContent || '',
      scrollLeft: viewport.scrollLeft
    };
  });

  assert(nearest.visibleCount >= 2, `${mobile ? 'mobile' : 'desktop'} view contains multiple visible height points`, nearest);
  assert(nearest.audits.every((item) => item.display !== 'none' && item.actual === item.expected),
    'every visible character line chooses the nearest visible cm ruler', nearest.audits);
  assert(nearest.audits.every((item) => item.rulerGap <= 5 && item.pointGap <= 7 && item.width > 4),
    'visible character lines physically connect ruler edge to character edge', nearest.audits);
  assert(nearest.displayedCount === nearest.visibleCount,
    'default mode shows exactly the horizontally visible character lines', nearest);

  await page.select('[data-height-guide-mode-v4]', 'all-left');
  await sleep(250);
  const allLeft = await page.evaluate(() => {
    const plot = document.querySelector('.height-plot-v2');
    const guides = [...plot.querySelectorAll('.height-point-guide-v2')];
    return {
      total: guides.length,
      shown: guides.filter((guide) => getComputedStyle(guide).display !== 'none').length,
      directions: [...new Set(guides.map((guide) => guide.dataset.v4Direction))],
      maxLeft: Math.max(...guides.map((guide) => Number.parseFloat(guide.style.left) || 0)),
      status: document.querySelector('.height-guide-status-v4')?.textContent || ''
    };
  });
  assert(allLeft.shown === allLeft.total && allLeft.directions.length === 1 && allLeft.directions[0] === 'left',
    'all-character option displays every line in one leftward direction', allLeft);
  assert(allLeft.maxLeft <= 0.6, 'all-left lines share the plot left ruler origin', allLeft);

  await page.select('[data-height-guide-mode-v4]', 'all-right');
  await sleep(250);
  const allRight = await page.evaluate(() => {
    const plot = document.querySelector('.height-plot-v2');
    const width = plot.offsetWidth;
    const guides = [...plot.querySelectorAll('.height-point-guide-v2')];
    const ends = guides.map((guide) => (Number.parseFloat(guide.style.left) || 0) + (Number.parseFloat(guide.style.width) || 0));
    return {
      width,
      total: guides.length,
      shown: guides.filter((guide) => getComputedStyle(guide).display !== 'none').length,
      directions: [...new Set(guides.map((guide) => guide.dataset.v4Direction))],
      minEnd: Math.min(...ends),
      maxEnd: Math.max(...ends),
      status: document.querySelector('.height-guide-status-v4')?.textContent || ''
    };
  });
  assert(allRight.shown === allRight.total && allRight.directions.length === 1 && allRight.directions[0] === 'right',
    'all-character option displays every line in one rightward direction', allRight);
  assert(Math.abs(allRight.minEnd - allRight.width) <= 0.8 && Math.abs(allRight.maxEnd - allRight.width) <= 0.8,
    'all-right lines share the plot right ruler origin', allRight);

  await page.select('[data-height-guide-mode-v4]', 'visible-nearest');
  await sleep(180);
}

async function mobileTest(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE_URL}/?v4-mobile=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForSite(page);
  const release = await page.evaluate(() => document.body.dataset.build);
  assert(release === EXPECTED_RELEASE, 'mobile release marker', release);

  await page.evaluate(() => {
    [...document.querySelectorAll('input.MagicalChk[name="chara"]')].forEach((box, index) => {
      box.checked = index < 5;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await jumpAudit(page, 'input[name="call_search"]', '#callResultSection', '称呼搜索');
  await jumpAudit(page, 'input[name="height_search_global"]', '#heightChartContainer', '身高搜索');
  await heightGuideAudit(page, true);

  const pageWidth = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  assert(pageWidth.scrollWidth <= pageWidth.innerWidth + 3, 'mobile page has no document-level horizontal overflow', pageWidth);
  assert(errors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text)).length === 0,
    'mobile run has no fatal JavaScript error', errors);
  await page.screenshot({ path: '/tmp/height-guide-v4-mobile.png', fullPage: true });
  await page.close();
}

async function desktopTest(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 6000, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE_URL}/?v4-desktop=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForSite(page);
  const release = await page.evaluate(() => document.body.dataset.build);
  assert(release === EXPECTED_RELEASE, 'desktop release marker', release);

  await page.evaluate(() => window.displayHeightChart('global'));
  await page.waitForSelector('.height-chart-surface-v2[data-v4-enhanced="true"]');
  await page.select('[data-height-guide-mode-v4]', 'visible-nearest');
  await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    viewport.scrollLeft = 0;
    viewport.dispatchEvent(new Event('scroll'));
  });
  await sleep(450);

  const fitAudit = await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const plot = document.querySelector('.height-plot-v2');
    const left = document.querySelector('.height-y-axis-left-v3').getBoundingClientRect().right;
    const right = document.querySelector('.height-y-axis-right-v3').getBoundingClientRect().left;
    const points = [...plot.querySelectorAll('.height-point-v2')];
    const visible = points.filter((point) => {
      const rect = point.getBoundingClientRect();
      return rect.left >= left + 1 && rect.right <= right - 1;
    });
    const displayed = [...plot.querySelectorAll('.height-point-guide-v2')]
      .filter((guide) => getComputedStyle(guide).display !== 'none');
    return {
      points: points.length,
      visible: visible.length,
      displayed: displayed.length,
      viewportScrollWidth: viewport.scrollWidth,
      viewportClientWidth: viewport.clientWidth,
      scale: window.__MAGIRECO_CORRECTION_V2__.heightState.scale
    };
  });
  assert(fitAudit.visible === fitAudit.points,
    'desktop scale can place every character inside the visible ruler span', fitAudit);
  assert(fitAudit.displayed === fitAudit.points,
    'when desktop can see every character, every character line is displayed', fitAudit);
  assert(fitAudit.viewportScrollWidth <= fitAudit.viewportClientWidth + 4,
    'desktop all-visible state does not require horizontal scrolling', fitAudit);
  assert(errors.length === 0, 'desktop run has no JavaScript error', errors);
  await page.screenshot({ path: '/tmp/height-guide-v4-desktop.png', fullPage: true });
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
});

try {
  await mobileTest(browser);
  await desktopTest(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
