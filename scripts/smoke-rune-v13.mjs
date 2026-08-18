import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'https://magireco-call-search-cn.pages.dev';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EXPECTED = 'rune-engine-router-v13-20260818';

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  console.log(`PASS: ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE_URL}/runes.html?v13=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__RUNE_ENGINE_V13__ && document.getElementById('runesRecognizeV7') && document.getElementById('runesRecognizeLegacyV7'), { timeout: 30000 });

  const release = await page.evaluate(() => ({ body: document.body.dataset.build, engine: window.__RUNE_ENGINE_V13__.release }));
  assert(release.body === EXPECTED && release.engine === EXPECTED, 'live page is V13', release);

  const routing = await page.evaluate(async () => {
    const preprocess = document.getElementById('runesPreprocess');
    const layout = document.getElementById('runesLayout');
    const model = document.getElementById('runesModel');
    const templateButton = document.getElementById('runesRecognizeV7');
    const classicButton = document.getElementById('runesRecognizeLegacyV7');
    let classicClicks = 0;
    let templateBubble = 0;
    classicButton.addEventListener('click', () => { classicClicks += 1; }, true);
    templateButton.addEventListener('click', () => { templateBubble += 1; });

    model.value = 'mdk';
    layout.value = 'auto';
    preprocess.value = 'auto';
    const defaultUsesTemplate = window.__RUNE_ENGINE_V13__.shouldUseTemplate();
    templateButton.click();
    await new Promise(resolve => setTimeout(resolve, 80));
    const afterDefault = { classicClicks, templateBubble };

    preprocess.value = 'original';
    layout.value = 'line';
    const originalUsesTemplate = window.__RUNE_ENGINE_V13__.shouldUseTemplate();
    templateButton.click();
    await new Promise(resolve => setTimeout(resolve, 80));
    const afterOriginal = { classicClicks, templateBubble, override: Boolean(window.__RUNE_INPUT_OVERRIDE_V9__) };

    preprocess.value = 'auto';
    layout.value = 'chart';
    const chartUsesTemplate = window.__RUNE_ENGINE_V13__.shouldUseTemplate();

    preprocess.value = 'original';
    const originalChartUsesTemplate = window.__RUNE_ENGINE_V13__.shouldUseTemplate();
    return { defaultUsesTemplate, originalUsesTemplate, chartUsesTemplate, originalChartUsesTemplate, afterDefault, afterOriginal };
  });

  assert(routing.defaultUsesTemplate === false && routing.afterDefault.classicClicks >= 1 && routing.afterDefault.templateBubble === 0,
    'default auto mode is routed away from the instant V7 template path', routing);
  assert(routing.originalUsesTemplate === false && routing.afterOriginal.classicClicks >= 2 && routing.afterOriginal.templateBubble === 0 && routing.afterOriginal.override === false,
    'keep-original mode routes to classic OCR without a synthetic/blank override', routing);
  assert(routing.chartUsesTemplate === true && routing.originalChartUsesTemplate === false,
    'template engine is isolated to explicit chart+auto only', routing);

  const focused = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 500;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 18, c.width, 9); ctx.fillRect(0, c.height - 27, c.width, 9);
    for (const y of [80, 405]) for (const x of [80, 180, 280, 620, 720, 820]) {
      ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = 'bold 72px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('A B C D E F G', c.width / 2, c.height / 2);
    const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'decorated-runes.png', { type: 'image/png' });
    const output = await window.__RUNE_ENGINE_V13__.buildFocusedInput(file, 'auto');
    if (!output) return { exists: false };
    const bmp = await createImageBitmap(output);
    const out = document.createElement('canvas'); out.width = bmp.width; out.height = bmp.height;
    out.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
    const data = out.getContext('2d').getImageData(0, 0, out.width, out.height).data;
    let dark = 0, sampled = 0;
    const step = Math.max(1, Math.floor(Math.sqrt((out.width * out.height) / 120000)));
    for (let y = 0; y < out.height; y += step) for (let x = 0; x < out.width; x += step) {
      const i = (y * out.width + x) * 4;
      const lum = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
      if (lum < 128) dark += 1;
      sampled += 1;
    }
    return { exists: true, width: out.width, height: out.height, darkRatio: dark / Math.max(1, sampled) };
  });
  assert(focused.exists && focused.width > 80 && focused.height > 40 && focused.darkRatio > .005 && focused.darkRatio < .65,
    'auto focus preprocessing produces a nonblank text image instead of the near-white failure', focused);

  const fatal = errors.filter(text => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(text));
  assert(fatal.length === 0, 'V13 has no fatal browser errors', fatal);
  await page.screenshot({ path: '/tmp/rune-v13-mobile.png', fullPage: false });
  console.log(JSON.stringify({ state: 'pass', release, routing, focused }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, details: error.details, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
