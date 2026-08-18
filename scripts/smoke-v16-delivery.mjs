import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'https://magireco-call-search-cn.pages.dev';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
});

function logPass(name, details = null) {
  console.log(`PASS: ${name}${details == null ? '' : ` ${JSON.stringify(details)}`}`);
}

async function waitForSuccess(page, timeout = 120000) {
  await page.waitForFunction(() => {
    const status = document.getElementById('runesStatus');
    return status?.dataset.kind === 'success' || status?.dataset.kind === 'error';
  }, { timeout });
  return page.evaluate(() => ({
    output: document.getElementById('runesOutput')?.value || '',
    status: document.getElementById('runesStatus')?.textContent || '',
    kind: document.getElementById('runesStatus')?.dataset.kind || '',
    diagnostics: document.getElementById('runesDiagnostics')?.textContent || '',
    build: document.body.dataset.build || '',
    glyph: document.documentElement.dataset.runeGlyphAcceptedV16 || '',
    chart: document.documentElement.dataset.runeChartV15 || ''
  }));
}

async function installSyntheticFile(page, kind) {
  await page.evaluate(async (fixtureKind) => {
    const input = document.getElementById('runesFile');
    let blob;
    let filename;
    if (fixtureKind === 'alphabet') {
      const response = await fetch('./mdkOCR/madokarunes.jpg', { cache: 'no-store' });
      if (!response.ok) throw new Error(`alphabet fixture HTTP ${response.status}`);
      blob = await response.blob();
      filename = 'alphabet.jpg';
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = fixtureKind === 'charlotte' ? 900 : 1000;
      canvas.height = fixtureKind === 'charlotte' ? 500 : 560;
      const ctx = canvas.getContext('2d');
      if (fixtureKind === 'charlotte') {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#8d4d55');
        gradient.addColorStop(.45, '#d58599');
        gradient.addColorStop(1, '#e68ba8');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#3f2029';
        for (let x = 0; x < canvas.width; x += 120) {
          ctx.beginPath(); ctx.roundRect(x, 0, 76, 170 + (x % 240 ? 45 : 0), 28); ctx.fill();
        }
        ctx.fillStyle = '#24131b';
        ctx.beginPath(); ctx.roundRect(350, 95, 200, 270, 80); ctx.fill();
        ctx.fillStyle = '#f4e7df';
        ctx.beginPath(); ctx.arc(450, 175, 92, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6d4c46'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(418, 158, 25, 0, Math.PI * 2); ctx.arc(482, 158, 25, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(450, 196, 48, .15, Math.PI - .15); ctx.stroke();
        ctx.fillStyle = 'rgba(213,90,139,.82)';
        ctx.roundRect(30, 350, 840, 126, 34); ctx.fill();
        const line = window.__RUNE_GLYPH_V16__.renderTextCanvas('charlotte', {
          scale: 1.05, gap: 15, padding: 0, foreground: '#f5d9df', background: 'transparent'
        });
        ctx.drawImage(line, (canvas.width - line.width) / 2, 372);
        filename = 'synthetic-charlotte.png';
      } else {
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#dac990'; ctx.lineWidth = 7;
        for (const [x, y] of [[95,90],[905,90],[95,470],[905,470]]) {
          ctx.beginPath(); ctx.arc(x, y, 54, 0, Math.PI * 2); ctx.stroke();
          for (let i = 0; i < 6; i += 1) {
            const angle = i * Math.PI / 3;
            ctx.beginPath(); ctx.arc(x + Math.cos(angle) * 34, y + Math.sin(angle) * 34, 13, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.fillStyle = '#eadcaa';
        for (const x of [230,310,390,610,690,770]) {
          ctx.beginPath(); ctx.arc(x, 88, 30, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - 18, 107); ctx.lineTo(x + 20, 126); ctx.lineTo(x + 12, 94); ctx.fill();
        }
        for (const x of [230,310,390,610,690,770]) {
          ctx.beginPath(); ctx.arc(x, 472, 28, 0, Math.PI * 2); ctx.fill();
        }
        const line = window.__RUNE_GLYPH_V16__.renderTextCanvas('ichtotemich', {
          scale: .88, gap: 14, padding: 0, foreground: '#f1e1b9', background: 'transparent'
        });
        ctx.drawImage(line, (canvas.width - line.width) / 2, 235);
        filename = 'synthetic-ornamental.png';
      }
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, kind);
}

async function runeCase(page, kind, layout, preprocess, expected) {
  await page.goto(`${BASE_URL}/runes.html?smoke=${Date.now()}-${kind}`, {
    waitUntil: 'domcontentloaded', timeout: 90000
  });
  await page.waitForFunction(() => window.__RUNE_COLOR_V14__ && window.__RUNE_CHART_V15__ && window.__RUNE_GLYPH_V16__, { timeout: 60000 });
  await installSyntheticFile(page, kind);
  await page.select('#runesLayout', layout);
  await page.select('#runesPreprocess', preprocess);
  await page.click('#runesRecognize');
  const result = await waitForSuccess(page);
  assert.equal(result.kind, 'success', result.status);
  assert.equal(result.output.trim(), expected);
  assert.equal(result.build, 'rune-glyph-color-chart-v16-20260818');
  logPass(`rune ${kind}`, result);
  return result;
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const fatal = [];
  page.on('pageerror', error => fatal.push(error.message));

  const charlotte = await runeCase(page, 'charlotte', 'line', 'decorated', 'CHARLOTTE');
  assert.equal(charlotte.glyph, 'true');
  const ornamental = await runeCase(page, 'ornamental', 'line', 'decorated', 'ICHTOTEMICH');
  assert.equal(ornamental.glyph, 'true');
  const alphabet = await runeCase(page, 'alphabet', 'chart', 'auto', 'abcdefg\nhijklmn\nopqrstu\nvwxyz');
  assert.ok(alphabet.chart.includes('rune-chart-structure-v15'));

  await page.goto(`${BASE_URL}/story-title-editor.html?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.documentElement.dataset.storyTitleEditorV1 && Number(document.getElementById('titleTotalGroups')?.textContent?.replace(/,/g, '')) > 100, { timeout: 90000 });
  const editor = await page.evaluate(async () => {
    const data = await window.__STORY_TITLE_RUNTIME_V1__.loadGroups();
    const aquarium = data.groups.find(group => group.category === 'イベント' && group.source_base === 'ウワサアクアリウムへようこそ');
    const response = await fetch('./downloads/story-title-groups.json', { cache: 'no-store' });
    const download = await response.json();
    const xlsx = await fetch('./downloads/story-title-groups.xlsx', { cache: 'no-store' });
    const xlsxBytes = new Uint8Array(await xlsx.arrayBuffer());
    return {
      groups: data.groups.length,
      children: data.groups.reduce((sum, group) => sum + (group.children || []).length, 0),
      aquariumChildren: aquarium?.children?.length || 0,
      aquariumEpisode5: Boolean(aquarium?.children?.some(child => /5話$/u.test(child.source_title))),
      downloadStatus: response.status,
      downloadType: response.headers.get('content-type') || '',
      downloadGroups: download.groups?.length || 0,
      xlsxStatus: xlsx.status,
      xlsxType: xlsx.headers.get('content-type') || '',
      xlsxZip: xlsxBytes[0] === 0x50 && xlsxBytes[1] === 0x4b,
      locked: document.documentElement.dataset.storyTitleEditorLocked,
      saveDisabled: document.getElementById('titleSaveLocal')?.disabled,
      importDisabled: document.getElementById('titleImportFile')?.disabled
    };
  });
  assert.ok(editor.groups > 100 && editor.children > 1000, JSON.stringify(editor));
  assert.ok(editor.aquariumChildren >= 10 && editor.aquariumEpisode5, JSON.stringify(editor));
  assert.equal(editor.downloadStatus, 200);
  assert.equal(editor.downloadGroups, editor.groups);
  assert.equal(editor.xlsxStatus, 200);
  assert.equal(editor.xlsxZip, true);
  assert.equal(editor.locked, 'true');
  assert.equal(editor.saveDisabled, true);
  assert.equal(editor.importDisabled, true);
  logPass('parent-story editor/data/download/password gate', editor);

  await page.goto(`${BASE_URL}/index.html?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.header .menu a')].some(link => /story-title-editor\.html/u.test(link.getAttribute('href') || '')), { timeout: 30000 });
  const menu = await page.evaluate(() => ({
    editor: [...document.querySelectorAll('.header .menu a')].find(link => /story-title-editor\.html/u.test(link.getAttribute('href') || ''))?.textContent?.trim() || '',
    runes: [...document.querySelectorAll('.header .menu a')].find(link => /runes\.html/u.test(link.getAttribute('href') || ''))?.textContent?.trim() || ''
  }));
  assert.equal(menu.editor, '母故事标题翻译清单（管理员）');
  assert.equal(menu.runes, '魔女文翻译');
  logPass('homepage hamburger menu integration', menu);

  const fatalErrors = fatal.filter(message => /TypeError|ReferenceError|SyntaxError|Unhandled/iu.test(message));
  assert.deepEqual(fatalErrors, []);
  console.log(JSON.stringify({ state: 'pass', charlotte, ornamental, alphabet, editor, menu }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'fail', message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
