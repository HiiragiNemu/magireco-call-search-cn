import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || process.env.TEST_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || process.env.CHROME || '/usr/bin/google-chrome';
const EXPECTED_RELEASE = 'integrated-tools-v5-20260816';

function assert(condition, message, details = undefined) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSite(page) {
  await page.waitForFunction(() => document.readyState === 'complete'
    && typeof window.drawNet_Table === 'function'
    && typeof window.displayHeightChart === 'function'
    && window.MagirecoNameUtils
    && document.querySelectorAll('input.MagicalChk[name="chara"]').length >= 180,
  { timeout: 30000 });
  await sleep(1000);
}

async function selectFirst(page, count) {
  await page.evaluate((wanted) => {
    const boxes = [...document.querySelectorAll('input.MagicalChk[name="chara"]')];
    boxes.forEach((box, index) => {
      const checked = index < wanted;
      if (box.checked !== checked) {
        box.checked = checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, count);
}

async function swipe(client, x1, y1, x2, y2, steps = 10) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x1, y: y1, radiusX: 4, radiusY: 4, force: 0.7 }]
  });
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: x1 + (x2 - x1) * t,
        y: y1 + (y2 - y1) * t,
        radiusX: 4,
        radiusY: 4,
        force: 0.7
      }]
    });
    await sleep(18);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
}

async function testMobile(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const client = await page.target().createCDPSession();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.goto(`${BASE_URL}/?acceptance=neo11-v3-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForSite(page);

  const release = await page.evaluate(() => document.body.dataset.build);
  assert(release === EXPECTED_RELEASE, 'mobile production release marker', release);

  const grid = await page.evaluate(() => {
    const container = document.querySelector('div.magicalgirl');
    const labels = [...container.querySelectorAll('label.girlbox')].slice(0, 5);
    const rect = container.getBoundingClientRect();
    const boxes = labels.map((label) => {
      const value = label.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, width: value.width };
    });
    return {
      columns: getComputedStyle(container).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      container: { left: rect.left, right: rect.right, width: rect.width },
      boxes
    };
  });
  assert(grid.columns === 5, 'Neo11 portrait character grid has five columns', grid);
  assert(Math.max(...grid.boxes.map((box) => box.top)) - Math.min(...grid.boxes.map((box) => box.top)) < 3,
    'first five character cards remain on one row', grid.boxes);
  assert(Math.abs(grid.boxes[0].left - grid.container.left) < 3, 'character grid has no unused left gutter', grid);
  assert(Math.abs(grid.boxes[4].right - grid.container.right) < 4, 'fifth character fills the right edge', grid);

  await selectFirst(page, 6);
  await page.evaluate(() => window.drawNet_Table());
  await page.waitForSelector('.relationship-table-viewport');
  await sleep(2200);

  const relationLayout = await page.evaluate(() => {
    const viewport = document.querySelector('.relationship-table-viewport');
    const stage = document.querySelector('.relationship-table-stage');
    const table = document.querySelector('.relationship-table-surface');
    const style = getComputedStyle(viewport);
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      touchAction: style.touchAction,
      viewportHeight: viewport.getBoundingClientRect().height,
      stageHeight: stage.getBoundingClientRect().height,
      tableHeight: table.getBoundingClientRect().height,
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth
    };
  });
  assert(relationLayout.overflowY === 'hidden', 'mobile relationship table does not trap vertical scrolling', relationLayout);
  assert(relationLayout.viewportHeight <= relationLayout.stageHeight + 4,
    'relationship viewport no longer reserves a 66vh blank area', relationLayout);
  assert(relationLayout.scrollWidth > relationLayout.clientWidth,
    'relationship table keeps horizontal access to all columns', relationLayout);

  await page.evaluate(() => {
    const viewport = document.querySelector('.relationship-table-viewport');
    viewport.scrollIntoView({ block: 'center' });
    window.scrollBy(0, -110);
  });
  await sleep(300);
  const relationTouchPoint = await page.evaluate(() => {
    const cell = document.querySelector('.relationship-table-viewport td') || document.querySelector('.relationship-table-viewport');
    const rect = cell.getBoundingClientRect();
    return { x: Math.max(40, Math.min(innerWidth - 40, rect.left + rect.width / 2)), y: Math.max(180, Math.min(innerHeight - 100, rect.top + Math.min(rect.height / 2, 60))) };
  });
  const beforeRelationY = await page.evaluate(() => window.scrollY);
  await swipe(client, relationTouchPoint.x, relationTouchPoint.y + 90, relationTouchPoint.x, relationTouchPoint.y - 150);
  const afterRelationY = await page.evaluate(() => window.scrollY);
  assert(afterRelationY > beforeRelationY + 35,
    'vertical swipe beginning on a pink relationship cell scrolls the page', { beforeRelationY, afterRelationY, relationTouchPoint });

  await page.evaluate(() => {
    const viewport = document.querySelector('.relationship-table-viewport');
    viewport.scrollIntoView({ block: 'center' });
    viewport.scrollLeft = 0;
  });
  await sleep(250);
  const relationRect = await page.evaluate(() => {
    const rect = document.querySelector('.relationship-table-viewport').getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  const relationY = Math.max(200, Math.min(724, relationRect.top + 120));
  await swipe(client, Math.min(350, relationRect.right - 25), relationY, Math.max(35, relationRect.left + 25), relationY + 3);
  const relationScrollLeft = await page.evaluate(() => document.querySelector('.relationship-table-viewport').scrollLeft);
  assert(relationScrollLeft > 25, 'horizontal swipe still pans the relationship table', relationScrollLeft);

  const stableBefore = await page.evaluate(() => window.network?.getPositions?.() || {});
  await sleep(1100);
  const stableAfter = await page.evaluate(() => window.network?.getPositions?.() || {});
  const stableDelta = Math.max(0, ...Object.keys(stableBefore).map((id) => {
    if (!stableAfter[id]) return 0;
    return Math.hypot(stableAfter[id].x - stableBefore[id].x, stableAfter[id].y - stableBefore[id].y);
  }));
  assert(stableDelta < 0.75, 'relationship character nodes remain still before interaction', stableDelta);

  await page.evaluate(() => {
    const host = document.getElementById('mynetwork');
    if (host) host.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await sleep(350);
  const dragData = await page.evaluate(() => {
    const ids = Object.keys(window.network.getPositions()).filter((id) => id !== '__second_person__');
    const id = ids[0];
    const canvasPoint = window.network.canvasToDOM(window.network.getPosition(id));
    const rect = document.querySelector('#mynetwork canvas').getBoundingClientRect();
    return { id, x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y, before: window.network.getPositions() };
  });
  await page.mouse.move(dragData.x, dragData.y);
  await page.mouse.down();
  await page.mouse.move(dragData.x + 65, dragData.y + 42, { steps: 12 });
  await page.mouse.up();
  await sleep(900);
  const dragAfter = await page.evaluate(() => ({
    positions: window.network.getPositions(),
    selectedNodes: window.network.getSelectedNodes(),
    selectedEdges: window.network.getSelectedEdges()
  }));
  const selectedMove = Math.hypot(
    dragAfter.positions[dragData.id].x - dragData.before[dragData.id].x,
    dragAfter.positions[dragData.id].y - dragData.before[dragData.id].y
  );
  const otherMove = Math.max(0, ...Object.keys(dragData.before)
    .filter((id) => id !== dragData.id)
    .map((id) => Math.hypot(
      dragAfter.positions[id].x - dragData.before[id].x,
      dragAfter.positions[id].y - dragData.before[id].y
    )));
  assert(selectedMove > 15, 'dragged relationship node follows the pointer', selectedMove);
  assert(otherMove < 1.5, 'dragging one node does not make all character nodes jump', otherMove);
  assert(dragAfter.selectedNodes.includes(dragData.id) && dragAfter.selectedEdges.length > 0,
    'dragged node highlights its directly related lines and labels', dragAfter);

  await page.evaluate(() => window.displayHeightChart('global'));
  await page.waitForSelector('.height-chart-viewport-v2 .height-point-v2');
  await sleep(1200);
  const heightAudit = await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const plot = document.querySelector('.height-plot-v2');
    const points = [...plot.querySelectorAll('.height-point-v2')];
    const guides = [...plot.querySelectorAll('.height-point-guide-v2')];
    const distinctColors = new Set(guides.map((guide) => getComputedStyle(guide).borderTopColor));
    const plotWidth = plot.getBoundingClientRect().width;
    const fullWidthCount = guides.filter((guide) => guide.getBoundingClientRect().width > plotWidth * 0.82).length;
    return {
      points: points.length,
      guides: guides.length,
      distinctColors: distinctColors.size,
      plotWidth,
      fullWidthCount,
      hasLeft: Boolean(document.querySelector('.height-y-axis-left-v3')),
      hasRight: Boolean(document.querySelector('.height-y-axis-right-v3')),
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth
    };
  });
  assert(heightAudit.hasLeft && heightAudit.hasRight, 'height chart has both fixed cm rulers', heightAudit);
  assert(heightAudit.guides >= heightAudit.points * 0.9, 'nearly every height point has an exact guide', heightAudit);
  assert(heightAudit.distinctColors >= 12, 'height guides use many character-specific colors', heightAudit);
  assert(heightAudit.fullWidthCount <= 2, 'default height guides no longer form a full-width pink wall', heightAudit);

  await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
    viewport.dispatchEvent(new Event('scroll'));
  });
  await sleep(300);
  const rulersAtRight = await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2').getBoundingClientRect();
    const left = document.querySelector('.height-y-axis-left-v3').getBoundingClientRect();
    const right = document.querySelector('.height-y-axis-right-v3').getBoundingClientRect();
    return {
      viewport: { left: viewport.left, right: viewport.right },
      left: { left: left.left, right: left.right },
      right: { left: right.left, right: right.right }
    };
  });
  assert(Math.abs(rulersAtRight.left.left - rulersAtRight.viewport.left) < 5,
    'left cm ruler stays visible at far-right horizontal position', rulersAtRight);
  assert(Math.abs(rulersAtRight.right.right - rulersAtRight.viewport.right) < 5,
    'right cm ruler stays visible at far-right horizontal position', rulersAtRight);

  await page.evaluate(() => document.querySelector('.height-point-v2').click());
  await sleep(150);
  const activeHeight = await page.evaluate(() => ({
    guide: getComputedStyle(document.querySelector('.height-active-guide-v3')).display,
    left: getComputedStyle(document.querySelector('.height-y-axis-left-v3 .height-active-y-label-v3')).display,
    right: getComputedStyle(document.querySelector('.height-y-axis-right-v3 .height-active-y-label-v3')).display
  }));
  assert(activeHeight.guide !== 'none' && activeHeight.left !== 'none' && activeHeight.right !== 'none',
    'clicking a height point shows one precise full guide and cm value on both rulers', activeHeight);

  await page.evaluate(() => {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    viewport.scrollIntoView({ block: 'center' });
    window.scrollBy(0, -120);
  });
  await sleep(250);
  const heightTouchPoint = await page.evaluate(() => {
    const rect = document.querySelector('.height-chart-viewport-v2').getBoundingClientRect();
    return { x: Math.max(80, Math.min(innerWidth - 80, rect.left + rect.width / 2)), y: Math.max(210, Math.min(innerHeight - 120, rect.top + Math.min(rect.height / 2, 260))) };
  });
  const beforeHeightY = await page.evaluate(() => window.scrollY);
  await swipe(client, heightTouchPoint.x, heightTouchPoint.y + 90, heightTouchPoint.x, heightTouchPoint.y - 150);
  const afterHeightY = await page.evaluate(() => window.scrollY);
  assert(afterHeightY > beforeHeightY + 35,
    'vertical swipe beginning on the height chart scrolls the page', { beforeHeightY, afterHeightY, heightTouchPoint });

  const pageOverflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(pageOverflow.width <= pageOverflow.viewport + 3, 'mobile document has no page-level horizontal overflow', pageOverflow);
  assert(runtimeErrors.filter((text) => /TypeError|ReferenceError|SyntaxError|Unhandled/i.test(text)).length === 0,
    'mobile run has no fatal JavaScript errors', runtimeErrors);
  await page.screenshot({ path: '/tmp/neo11-v3-mobile.png', fullPage: true });
  await page.close();
}

async function testDesktop(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE_URL}/?acceptance=neo11-v3-desktop-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForSite(page);
  await selectFirst(page, 10);
  await page.evaluate(() => window.drawNet_Table());
  await page.waitForSelector('.relationship-table-viewport');
  await sleep(1800);
  const desktop = await page.evaluate(() => {
    const viewport = document.querySelector('.relationship-table-viewport');
    const before = window.network.getPositions();
    return {
      release: document.body.dataset.build,
      relationClient: viewport.clientWidth,
      relationScroll: viewport.scrollWidth,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      before
    };
  });
  await sleep(1000);
  const after = await page.evaluate(() => window.network.getPositions());
  const delta = Math.max(0, ...Object.keys(desktop.before).map((id) => Math.hypot(
    after[id].x - desktop.before[id].x,
    after[id].y - desktop.before[id].y
  )));
  assert(desktop.release === EXPECTED_RELEASE, 'desktop production release marker', desktop.release);
  assert(desktop.relationScroll <= desktop.relationClient + 4,
    'desktop relationship table defaults to full-width fit without required horizontal scrolling', desktop);
  assert(delta < 0.75, 'desktop relationship nodes remain stable while idle', delta);
  assert(desktop.pageWidth <= desktop.viewportWidth + 3, 'desktop document has no page-level horizontal overflow', desktop);
  assert(errors.length === 0, 'desktop run has no JavaScript errors', errors);
  await page.screenshot({ path: '/tmp/neo11-v3-desktop.png', fullPage: true });
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-extensions'
  ]
});

try {
  await testMobile(browser);
  await testDesktop(browser);
  console.log(JSON.stringify({ state: 'pass', release: EXPECTED_RELEASE, base: BASE_URL }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
