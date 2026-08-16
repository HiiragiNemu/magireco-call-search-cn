'use strict';

const fs = require('fs');
const path = require('path');

let failed = false;
function fail(message) {
  failed = true;
  console.error(`VALIDATION ERROR: ${message}`);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function requireFile(file) { if (!fs.existsSync(file)) fail(`required production file missing: ${file}`); }
function requireSize(file, minimum) {
  requireFile(file);
  if (fs.existsSync(file) && fs.statSync(file).size < minimum) fail(`${file} is unexpectedly small: ${fs.statSync(file).size} bytes`);
}
function count(text, pattern) { return (text.match(pattern) || []).length; }

const buildInfoPath = path.join('public', 'build-info.json');
requireFile(buildInfoPath);
const buildInfo = JSON.parse(read(buildInfoPath));
const release = String(buildInfo.release || '');
const RELEASES = Object.freeze({
  V2: 'layout-correction-v2-20260816',
  V3: 'neo11-mobile-interaction-v3-20260816',
  V4: 'neo11-height-guide-v4-20260816',
  V5: 'integrated-tools-v5-20260816',
  V6: 'story-ocr-layout-v6-20260816',
  V7: 'story-ui-translation-ocr-v7-20260816',
  V8: 'collapsible-layout-v8-20260816'
});
const isV8 = release === RELEASES.V8;
const isV7 = release === RELEASES.V7 || isV8;
const isV6 = release === RELEASES.V6 || isV7;
const isV5 = release === RELEASES.V5 || isV6;
const isV4 = release === RELEASES.V4 || isV5;
const isV3 = release === RELEASES.V3 || isV4;
const isV2Family = release === RELEASES.V2 || isV3;

if (!Object.values(RELEASES).includes(release)) fail(`unexpected release identifier: ${release}`);
if (buildInfo.deploymentTarget !== 'magireco-call-search-cn.pages.dev') fail(`unexpected deployment target: ${buildInfo.deploymentTarget}`);

function validateHtml(file, expectedRelease = null) {
  requireFile(file);
  if (!fs.existsSync(file)) return '';
  const text = read(file);
  for (const [pattern, expected, label] of [
    [/<!DOCTYPE html>/gi, 1, 'doctype'],
    [/<html\b[^>]*>/gi, 1, 'opening html'],
    [/<\/html\s*>/gi, 1, 'closing html'],
    [/<head\b[^>]*>/gi, 1, 'opening head'],
    [/<\/head\s*>/gi, 1, 'closing head'],
    [/<body\b[^>]*>/gi, 1, 'opening body'],
    [/<\/body\s*>/gi, 1, 'closing body']
  ]) {
    const actual = count(text, pattern);
    if (actual !== expected) fail(`${file} ${label}: expected ${expected}, found ${actual}`);
  }
  const ids = [...text.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) fail(`${file} duplicate ids: ${duplicateIds.join(', ')}`);
  if (expectedRelease && !text.includes(`data-build="${expectedRelease}"`)) fail(`${file} release marker mismatch`);
  const refs = [...text.matchAll(/(?:src|href)=["'](\.\/[^"'#?]+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.includes('${'));
  for (const reference of [...new Set(refs)]) {
    const target = path.join(path.dirname(file), reference.replace(/^\.\//, ''));
    requireFile(target);
  }
  return text;
}

const htmlPath = path.join('public', 'index.html');
const html = validateHtml(htmlPath, release);
const characterCount = (html.match(/class=["'][^"']*\bMagicalChk\b[^"']*["'][^>]*name=["']chara["']/g) || []).length;
if (characterCount < 180) fail(`expected at least 180 character selectors, found ${characterCount}`);

for (const value of [
  'id="callFilterForm"', 'id="callResultSection"',
  './myfile/site-overhaul.css', './myfile/site-overhaul.js',
  './myfile/gradeOverrides.js', './myfile/grade-classification.js',
  './myfile/jquery-3.6.0.min.js', './myfile/vis-network.min.js', './myfile/html2canvas.min.js',
  'value="まどドラ">Magia Exedra'
]) if (!html.includes(value)) fail(`missing required production marker/reference: ${value}`);

for (const value of [
  'id="callcate"', 'attr.includes("学院")', 'ajax.googleapis.com/ajax/libs/jquery/1.7.1',
  'visjs.github.io/vis-network', './css/style.css', './css/table.css', './css/button.css',
  './img/webp/ファビコン.webp', './img/webp/apple_fabicon.webp',
  'value="まどドラ">小圆前辈', 'data-kana="さおとめ せんせい"'
]) if (html.includes(value)) fail(`obsolete production text remains: ${value}`);

if (count(html, /jquery-3\.6\.0\.min\.js/gi) !== 1) fail('jQuery must be loaded exactly once.');
if (count(html, /vis-network\.min\.js/gi) !== 1) fail('vis-network must be loaded exactly once.');
if (count(html, /site-overhaul\.js/gi) !== 1) fail('site-overhaul.js must be loaded exactly once.');

for (const file of [
  'public/myfile/myCommon.js', 'public/myfile/mgirlNarrow.js', 'public/myfile/mgirlCallNarrow.js',
  'public/myfile/mgirlAtSearch.js', 'public/myfile/gradeOverrides.js', 'public/myfile/grade-classification.js',
  'public/myfile/site-overhaul.css', 'public/myfile/site-overhaul.js',
  'public/myfile/jquery-3.6.0.min.js', 'public/myfile/vis-network.min.js', 'public/myfile/html2canvas.min.js'
]) requireFile(file);

const names = read('public/myfile/NAMELIST.txt');
if (names.includes('早乙女老师')) fail('NAMELIST still exposes the obsolete Saotome translation.');

if (isV2Family) {
  for (const value of ['./myfile/site-correction-v2.css', './myfile/site-correction-v2.js']) {
    if (!html.includes(value)) fail(`V2 production reference missing: ${value}`);
  }
  if (count(html, /site-correction-v2\.js/gi) !== 1) fail('site-correction-v2.js must be loaded exactly once.');
  if (count(html, /site-correction-v2\.css/gi) !== 1) fail('site-correction-v2.css must be loaded exactly once.');
  for (const file of ['public/myfile/site-correction-v2.css', 'public/myfile/site-correction-v2.js', 'public/__acceptance.html']) requireFile(file);

  const overhaul = read('public/myfile/site-overhaul.js');
  const correctionJs = read('public/myfile/site-correction-v2.js');
  const correctionCss = read('public/myfile/site-correction-v2.css');
  const acceptance = read('public/__acceptance.html');
  if (!overhaul.includes('const selectionOrderTracker = {')) fail('selection-order tracker missing');
  for (const marker of ['relationship-table-viewport', 'height-chart-viewport-v2', 'height-chart-stage-v2']) {
    if (!correctionJs.includes(marker) && !correctionCss.includes(marker)) fail(`V2 correction marker missing: ${marker}`);
  }
  if (!acceptance.includes(`const EXPECTED_RELEASE = '${release}';`)) fail('acceptance harness release mismatch');
  if (!acceptance.includes('关系表行顺序保持实际点击顺序')) fail('click-order acceptance assertion missing');
}

if (isV3) {
  const refs = ['./myfile/site-correction-v3.css', './myfile/site-correction-v3-network.js', './myfile/site-correction-v3-height.js'];
  for (const value of refs) if (!html.includes(value)) fail(`V3 production reference missing: ${value}`);
  for (const pattern of [/site-correction-v3\.css/gi, /site-correction-v3-network\.js/gi, /site-correction-v3-height\.js/gi]) {
    if (count(html, pattern) !== 1) fail(`V3 production asset must be loaded exactly once: ${pattern}`);
  }
  for (const file of [
    'public/myfile/site-correction-v3.css', 'public/myfile/site-correction-v3-network.js',
    'public/myfile/site-correction-v3-height.js', 'scripts/smoke-neo11-v3.mjs'
  ]) requireFile(file);
  const v3Css = read('public/myfile/site-correction-v3.css');
  const v3Network = read('public/myfile/site-correction-v3-network.js');
  const v3Height = read('public/myfile/site-correction-v3-height.js');
  for (const marker of ['grid-template-columns: repeat(5', 'overflow-y: hidden !important', 'touch-action: pan-y pinch-zoom', 'height-y-axis-right-v3']) {
    if (!v3Css.includes(marker)) fail(`V3 CSS marker missing: ${marker}`);
  }
  for (const marker of ['node.physics = false', 'network.stopSimulation()', 'selectConnectedEdges: true', 'page-y-inner-x']) {
    if (!v3Network.includes(marker)) fail(`V3 network marker missing: ${marker}`);
  }
  for (const marker of ['CHARACTER_COLORS', 'height-y-axis-right-v3', 'height-active-guide-v3', 'syncRulers']) {
    if (!v3Height.includes(marker)) fail(`V3 height marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeNeo11V3 !== 'rollback/pre-neo11-mobile-v3-20260816') fail('V3 rollback pointer missing or incorrect');
}

if (isV4) {
  const refs = ['./myfile/site-correction-v4.css', './myfile/site-correction-v4.js'];
  for (const value of refs) if (!html.includes(value)) fail(`V4 production reference missing: ${value}`);
  for (const pattern of [/site-correction-v4\.css/gi, /site-correction-v4\.js/gi]) {
    if (count(html, pattern) !== 1) fail(`V4 production asset must be loaded exactly once: ${pattern}`);
  }
  for (const file of ['public/myfile/site-correction-v4.css', 'public/myfile/site-correction-v4.js', 'scripts/smoke-height-guide-v4.mjs']) requireFile(file);
  const v4Css = read('public/myfile/site-correction-v4.css');
  const v4Js = read('public/myfile/site-correction-v4.js');
  for (const marker of ['height-guide-mode-v4', 'data-v4-direction', 'height-guide-status-v4']) if (!v4Css.includes(marker)) fail(`V4 CSS marker missing: ${marker}`);
  for (const marker of ['visible-nearest', 'all-left', 'all-right', 'rulerGeometry', 'scrollTarget', 'callResultSection', 'heightChartContainer']) {
    if (!v4Js.includes(marker)) fail(`V4 JavaScript marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeHeightGuideV4 !== 'rollback/pre-height-guide-v4-20260816') fail('V4 rollback pointer missing or incorrect');
}

if (isV5) {
  for (const value of ['./myfile/tools-suite.css', './myfile/tools-suite.js', './myfile/triple-tap-filter.js']) {
    if (!html.includes(value)) fail(`V5 root reference missing: ${value}`);
  }
  if (html.includes('ondblclick=')) fail('V5 root still contains inline double-click filtering.');
  if (!html.includes('三击图标可以筛选称呼/被称呼的对象')) fail('V5 root triple-tap instruction missing.');
  if (!html.includes('<legend>三击筛选选项</legend>')) fail('V5 root triple-tap legend missing.');
  if (html.includes('https://magireco-chara-search.vercel.app/mdkOCR/index.html')) fail('V5 menu still points to external OCR page.');

  const pageFiles = ['public/story.html', 'public/attendance.html', 'public/runes.html'];
  const pages = pageFiles.map((file) => ({ file, text: validateHtml(file, release) }));
  for (const { file, text } of pages) {
    if (count(text, /class=["']suite-nav["']/gi) !== 1) fail(`${file} suite navigation missing or duplicated.`);
    for (const ref of ['./myfile/tools-suite.css', './myfile/tools-suite.js']) if (!text.includes(ref)) fail(`${file} missing ${ref}`);
  }
  if (!isV7 && !pages[0].text.includes('./myfile/story-app.js')) fail('story.html missing story app.');
  if (!isV7 && !pages[1].text.includes('./myfile/attendance-app.js')) fail('attendance.html missing attendance app.');
  if (isV7 && !pages[0].text.includes('./myfile/story-app-v7.js')) fail('story.html missing V7 story app.');
  if (isV7 && !pages[1].text.includes('./myfile/attendance-app-v7.js')) fail('attendance.html missing V7 attendance app.');
  if (!pages[2].text.includes('./myfile/runes-app.js')) fail('runes.html missing OCR app.');

  for (const file of [
    'public/myfile/tools-suite.css', 'public/myfile/tools-suite.js', 'public/myfile/triple-tap-filter.js',
    'public/myfile/story-app.js', 'public/myfile/attendance-app.js', 'public/myfile/runes-app.js',
    'public/data/character-catalog.json', 'public/data/translation-audit-v5.json',
    'docs/translation-audit-v5.md', 'scripts/audit-translations-v5.py', 'scripts/smoke-integrated-tools-v5.mjs'
  ]) requireFile(file);
  requireSize('public/mdkOCR/mdk.traineddata', 100000);
  requireSize('public/mdkOCR/mdm.traineddata', 100000);
  requireSize('public/mdkOCR/madokarunes.jpg', 10000);
  requireFile('public/mdkOCR/index.html');

  const catalog = JSON.parse(read('public/data/character-catalog.json'));
  if (!Array.isArray(catalog) || catalog.length < 180) fail(`V5 catalog too small: ${catalog?.length}`);
  const jpKeys = catalog.map((item) => item.jp);
  if (new Set(jpKeys).size !== jpKeys.length) fail('V5 catalog contains duplicate Japanese canonical keys.');
  for (const [jp, zh] of [['環いろは', '环彩羽'], ['常盤ななか', '常盘七香'], ['万年桜のウワサ', '万年樱之谣']]) {
    const entry = catalog.find((item) => item.jp === jp);
    if (!entry || entry.zh !== zh) fail(`V5 canonical display mismatch: ${jp} -> ${zh}`);
  }
  const audit = JSON.parse(read('public/data/translation-audit-v5.json'));
  if (!Array.isArray(audit.hardErrors) || audit.hardErrors.length) fail(`translation audit has hard errors: ${JSON.stringify(audit.hardErrors)}`);
  if (buildInfo.rollbackBeforeIntegratedToolsV5 !== 'rollback/pre-integrated-tools-v5-20260816') fail('V5 rollback pointer missing or incorrect.');
  if (buildInfo.updateMode !== 'manual-static-only') fail('V5 update mode must remain manual-static-only.');
  if (!Array.isArray(buildInfo.integratedTools) || buildInfo.integratedTools.length !== 4) fail('V5 integrated tool manifest is incomplete.');
}

if (isV6) {
  for (const file of [
    'public/myfile/layout-v6.css', 'public/myfile/layout-v6.js',
    'public/data/story-v6/manifest.json', 'public/data/story-v6/variant-map.json',
    'scripts/build-story-snapshot-v6.py', 'scripts/integrate-story-ocr-layout-v6.py',
    'scripts/smoke-story-layout-v6.mjs', 'scripts/smoke-ocr-v6.mjs'
  ]) requireFile(file);
  for (const page of ['public/index.html', 'public/story.html', 'public/attendance.html', 'public/runes.html']) {
    const pageText = read(page);
    if (!pageText.includes('./myfile/layout-v6.css')) fail(`${page} missing V6 layout CSS.`);
  }
  if (!read('public/index.html').includes('./myfile/layout-v6.js')) fail('root page missing V6 star layout script.');
  const storyPage = read('public/story.html');
  if (!storyPage.includes('./data/story-v6/manifest.json')) fail('story page missing the local manifest marker.');
  if (storyPage.includes('script.google.com/macros/s/')) fail('story page still exposes a remote Google Apps Script endpoint.');
  const storyApp = read(isV7 ? 'public/myfile/story-app-v7.js' : 'public/myfile/story-app.js');
  for (const marker of ['MANIFEST_URL', './data/story-v6/', 'loadCategory', 'rowMatches']) {
    if (!storyApp.includes(marker)) fail(`V6 story marker missing: ${marker}`);
  }
  if (storyApp.includes('script.google.com/macros/s/')) fail('V6 story app still performs remote GAS searches.');
  const manifest = JSON.parse(read('public/data/story-v6/manifest.json'));
  if (manifest.totalRows < 14000 || manifest.categories.length !== 19) fail('V6 story snapshot is incomplete.');
  if (manifest.source?.mode !== 'manual-static-snapshot') fail('V6 story snapshot mode is not manual-static-snapshot.');
  let countedRows = 0;
  for (const category of manifest.categories) {
    const file = `public/data/story-v6/${category.file}`;
    requireFile(file);
    const data = JSON.parse(read(file));
    if (data.key !== category.key || !Array.isArray(data.rows) || data.rows.length !== category.count) {
      fail(`V6 story category invalid: ${category.key}`);
    }
    countedRows += data.rows.length;
  }
  if (countedRows !== manifest.totalRows) fail(`V6 story row count mismatch: ${countedRows}/${manifest.totalRows}`);
  const runesPage = read('public/runes.html');
  for (const marker of ['id="runesLayout"', 'value="border"', 'id="runesDiagnostics"', '处理后图像']) {
    if (!runesPage.includes(marker)) fail(`V6 OCR UI marker missing: ${marker}`);
  }
  const runesApp = read('public/myfile/runes-app.js');
  for (const marker of ['otsuThreshold', 'clearLongBorders', 'segmentedRecognition', 'SINGLE_BLOCK', '__RUNE_OCR_V6__']) {
    if (!runesApp.includes(marker)) fail(`V6 OCR marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeStoryOcrLayoutV6 !== 'rollback/pre-story-ocr-layout-v6-20260816') {
    fail('V6 rollback pointer missing or incorrect.');
  }
  if (buildInfo.storyBrowserRemoteDependency !== false) fail('V6 story browser must be independent of remote APIs.');
}


if (isV7) {
  for (const file of [
    'public/myfile/suite-v7.css', 'public/myfile/suite-v7.js',
    'public/myfile/story-app-v7.js', 'public/myfile/attendance-app-v7.js',
    'public/myfile/runes-template-v7.js', 'public/data/story-v7/localization.json',
    'scripts/build-story-localization-v7.py', 'scripts/integrate-story-ui-v7.py',
    'scripts/smoke-story-ui-v7.mjs', 'scripts/smoke-rune-v7.mjs'
  ]) requireFile(file);
  const rootV7 = read('public/index.html');
  const storyV7 = read('public/story.html');
  const attendanceV7 = read('public/attendance.html');
  const runesV7 = read('public/runes.html');
  for (const [file, page] of [['index', rootV7], ['story', storyV7], ['attendance', attendanceV7], ['runes', runesV7]]) {
    if (!page.includes('./myfile/suite-v7.css')) fail(`${file} page missing V7 CSS.`);
  }
  for (const marker of ['./myfile/suite-v7.js', './myfile/story-app-v7.js', './myfile/charaAt.js']) {
    if (!storyV7.includes(marker)) fail(`story page missing ${marker}`);
  }
  for (const marker of ['./myfile/suite-v7.js', './myfile/attendance-app-v7.js', './myfile/charaAt.js']) {
    if (!attendanceV7.includes(marker)) fail(`attendance page missing ${marker}`);
  }
  if (!rootV7.includes('./myfile/suite-v7.js')) fail('root page missing V7 quick-rail script.');
  if (!runesV7.includes('./myfile/runes-template-v7.js')) fail('runes page missing V7 template recognizer.');
  for (const forbidden of ['不修改 magi-reader', '中文整合工具', '查询仍使用原始日文角色键', '不再由手机浏览器直接请求 Google Apps Script']) {
    for (const [file, page] of [['story', storyV7], ['attendance', attendanceV7], ['runes', runesV7]]) {
      if (page.includes(forbidden)) fail(`${file} page exposes internal visitor copy: ${forbidden}`);
    }
  }
  const localization = JSON.parse(read('public/data/story-v7/localization.json'));
  if (localization.categoryLabels?.['ピュエラ・ヒストリア'] !== '魔法少女历史篇') fail('V7 Historia label is incorrect.');
  if (localization.categoryOrder?.[0] !== 'メイン【第1部】' || localization.categoryOrder?.[9] !== 'スペシャル') fail('V7 category order does not follow the original page.');
  if (localization.audit?.mappedCastNames !== localization.audit?.castNames || localization.audit?.unresolvedCastNames?.length) fail('V7 cast localization is incomplete.');
  if (!localization.titleExact?.['神浜スパアドベンチャー ビーチに渦巻く悪魔の怨嗟 3話']) fail('V7 verified SPA title translation missing.');
  const storyAppV7 = read('public/myfile/story-app-v7.js');
  for (const marker of ['story-result-list-v7', 'resolveCharacterV7', 'installAttributeFilterV7', 'localizeTitle']) {
    if (!storyAppV7.includes(marker)) fail(`V7 story marker missing: ${marker}`);
  }
  const runeV7 = read('public/myfile/runes-template-v7.js');
  for (const marker of ['ALPHABET_ROWS', 'removeLongLines', 'chartRecognition', 'row-major-chart', 'borderAwareUsable']) {
    if (!runeV7.includes(marker)) fail(`V7 rune marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeStoryUiTranslationOcrV7 !== 'rollback/pre-story-ui-translation-ocr-v7-20260816') fail('V7 rollback pointer missing.');
  if (buildInfo.visitorCopyPolicy !== 'no-internal-project-instructions') fail('V7 visitor-copy policy missing.');
}


if (isV8) {
  for (const file of [
    'public/myfile/layout-v8.css', 'public/myfile/layout-v8.js',
    'scripts/integrate-collapsible-layout-v8.py', 'scripts/smoke-collapsible-layout-v8.mjs'
  ]) requireFile(file);
  for (const page of ['public/index.html', 'public/story.html', 'public/attendance.html', 'public/runes.html']) {
    const pageText = read(page);
    if (!pageText.includes('./myfile/layout-v8.css')) fail(`${page} missing V8 layout CSS.`);
    if (!pageText.includes('./myfile/layout-v8.js')) fail(`${page} missing V8 layout JavaScript.`);
  }
  const layoutV8 = read('public/myfile/layout-v8.js');
  for (const marker of [
    'prepareStoryPage', 'prepareAttendancePage', 'prepareCallPage',
    'installCharacterGridDetails', 'wrapCallResults', '共同出场次数排行'
  ]) {
    if (!layoutV8.includes(marker)) fail(`V8 layout marker missing: ${marker}`);
  }
  const cssV8 = read('public/myfile/layout-v8.css');
  for (const marker of [
    'attendance-workspace-v8', 'character-grid-details-v8',
    'max-height: none !important', 'overflow: visible !important'
  ]) {
    if (!cssV8.includes(marker)) fail(`V8 CSS marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeCollapsibleLayoutV8 !== 'rollback/pre-collapsible-layout-v8-20260816') {
    fail('V8 rollback pointer missing or incorrect.');
  }
  if (buildInfo.characterGridScrollMode !== 'document-flow-no-internal-scrollbar') {
    fail('V8 character-grid scroll policy is incorrect.');
  }
  if (buildInfo.attendanceDisplayName !== '共同出场次数排行') {
    fail('V8 attendance display name is incorrect.');
  }
}

if (failed) process.exit(1);
console.log(`Static validation passed for ${release}: ${characterCount} characters.`);
