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
const TITLE_RELEASE = 'canonical-title-authority-v1';
const READER_REVISION = '35944c2ba0ae7bdaf3b0f05ff01c972b247c3fb0';
const RELEASES = Object.freeze({
  V2: 'layout-correction-v2-20260816',
  V3: 'neo11-mobile-interaction-v3-20260816',
  V4: 'neo11-height-guide-v4-20260816',
  V5: 'integrated-tools-v5-20260816',
  V6: 'story-ocr-layout-v6-20260816',
  V7: 'story-ui-translation-ocr-v7-20260816',
  V8: 'collapsible-layout-v8-20260816',
  V9: 'rune-mask-v9-20260816',
  V10: 'height-export-title-call-rune-v10-20260817',
  V11: 'live-reacceptance-v11-20260817',
  V26: 'v26-converged-20260822'
});
const isV26 = release === RELEASES.V26;
const isV11 = release === RELEASES.V11;
const isV10 = release === RELEASES.V10 || isV11;
const isV9 = release === RELEASES.V9 || isV10;
const isV8 = release === RELEASES.V8 || isV9;
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

if (isV26) {
  const manifestPath = path.join('public', 'data', 'titles', 'manifest.json');
  const authorityPath = path.join('data', 'titles', 'authority.json');
  const storyPath = path.join('public', 'story.html');
  const editorPath = path.join('public', 'story-title-editor.html');
  const runtimePath = path.join('public', 'myfile', 'story-title-runtime-v2.js');
  const routeBridgePath = path.join('public', 'myfile', 'story-route-bridge-v1.js');
  const readerLinksPath = path.join('public', 'data', 'titles', 'reader-links.json');
  const storyRouterPath = path.join('public', 'data', 'story-router-v1.json');
  const menuScript = './myfile/hamburger-menu-v23.js?v=20260822-v26-final3';
  for (const file of [manifestPath, authorityPath, storyPath, editorPath, runtimePath, routeBridgePath, readerLinksPath, storyRouterPath]) requireFile(file);
  const manifest = JSON.parse(read(manifestPath));
  if (manifest.release !== TITLE_RELEASE || manifest.dataArchitecture !== 'plain-json') fail('V26 title manifest mismatch.');
  if (manifest.counts?.groupCount !== 2166 || manifest.counts?.mappedTitles !== 5826) fail('V26 title counts mismatch.');
  const readerLinks = JSON.parse(read(readerLinksPath));
  const storyRouter = JSON.parse(read(storyRouterPath));
  if (readerLinks.release !== TITLE_RELEASE || readerLinks.reader?.head !== READER_REVISION || readerLinks.summary?.entries !== 1196) fail('Reader title linkage mismatch.');
  if (storyRouter.targets?.reader?.readerRevision !== READER_REVISION || storyRouter.routes?.length !== 5327) fail('Reader story router mismatch.');
  if (storyRouter.targets?.adv?.handoffReady !== false) fail('ADV route must remain fail-closed before production handoff.');
  if (html.includes('navtext-container')) fail('V26 legacy top title node is still present.');
  if (!html.includes(menuScript)) fail('V26 hamburger behavior script is not loaded.');
  for (const file of [storyPath, editorPath]) {
    if (!read(file).includes(`data-build="${release}"`)) fail(`${file} V26 release marker mismatch.`);
  }
  const runtime = read(runtimePath);
  for (const name of ['manifest.json', 'parents.json', 'suffixes.json', 'titles.json']) {
    if (!runtime.includes(name)) fail(`V26 runtime missing ${name}.`);
  }
  if (runtime.includes('DecompressionStream') || runtime.includes('v25-title-delta')) fail('V26 runtime still contains V25 compressed loading.');
  if (!runtime.includes('magireco-story-title-overrides:')) fail('V26 release-scoped local storage key is missing.');
  if (!read(storyPath).includes('story-route-bridge-v1.js')) fail('Story route bridge is not loaded.');
  for (const forbidden of ['public/__acceptance.html', 'public/json_open_old.html', 'public/oldfile']) {
    if (fs.existsSync(forbidden)) fail(`V26 public legacy path still exists: ${forbidden}`);
  }
  if (failed) process.exit(1);
  console.log(`Static V26 validation passed for ${release}: ${characterCount} characters, ${manifest.counts.mappedTitles} titles.`);
  process.exit(0);
}

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


if (isV9) {
  for (const file of [
    'public/myfile/runes-mask-v9.css', 'public/myfile/runes-mask-v9.js',
    'scripts/integrate-rune-mask-v9.py', 'scripts/smoke-rune-mask-v9.mjs'
  ]) requireFile(file);
  const runes = read('public/runes.html');
  for (const marker of ['./myfile/runes-mask-v9.css', './myfile/runes-mask-v9.js']) {
    if (!runes.includes(marker)) fail(`V9 runes page missing ${marker}`);
  }
  const mask = read('public/myfile/runes-mask-v9.js');
  for (const marker of [
    'runesMaskEnabled', 'runesMaskCanvas', 'buildMaskedFile', 'maskMetrics',
    '__RUNE_INPUT_OVERRIDE_V9__', 'runes-preview-pair-v9', 'runesReferenceDetailsV9'
  ]) if (!mask.includes(marker)) fail(`V9 mask marker missing: ${marker}`);
  const maskCss = read('public/myfile/runes-mask-v9.css');
  for (const marker of ['grid-template-columns: repeat(2', 'touch-action: none', 'max-width: min(100%, 860px)', '@media (max-width: 720px)']) {
    if (!maskCss.includes(marker)) fail(`V9 mask CSS marker missing: ${marker}`);
  }
  const template = read('public/myfile/runes-template-v7.js');
  const classic = read('public/myfile/runes-app.js');
  if (!template.includes('global.__RUNE_INPUT_OVERRIDE_V9__ || fileInput.files?.[0]')) fail('V9 template OCR bridge missing.');
  if (!classic.includes('const recognitionFile = global.__RUNE_INPUT_OVERRIDE_V9__ || file;')) fail('V9 classic OCR bridge missing.');
  if (buildInfo.rollbackBeforeRuneMaskV9 !== 'rollback/pre-rune-mask-v9-20260816') fail('V9 rollback pointer missing.');
  if (buildInfo.runeMaskMode !== 'paint-to-keep') fail('V9 paint-to-keep mode missing.');
  if (buildInfo.runeReferenceLayout !== 'collapsed-size-capped') fail('V9 reference layout marker missing.');
}


if (isV10) {
  for (const file of [
    'public/myfile/call-ui-v10.js', 'public/myfile/site-correction-v10.css',
    'public/myfile/height-export-v10.js', 'public/myfile/runes-v10.js',
    'public/myfile/runes-line-v10.js', 'public/myfile/runes-v10.css',
    'public/data/story-v10/title-audit.json',
    'docs/story-title-self-translations-v10.md', 'scripts/build-story-titles-v10.py',
    'scripts/assemble-runes-v10.py', 'scripts/integrate-height-export-title-call-v10.py',
    'scripts/integrate-complete-v10.py', 'scripts/finalize-height-v10-source.py',
    'scripts/smoke-complete-v10.mjs'
  ]) requireFile(file);

  const rootV10 = read('public/index.html');
  for (const marker of ['./myfile/site-correction-v10.css', './myfile/call-ui-v10.js', './myfile/height-export-v10.js']) {
    if (!rootV10.includes(marker)) fail(`V10 root page missing ${marker}`);
  }
  const callUiV10 = read('public/myfile/call-ui-v10.js');
  for (const marker of ['call-table-details-v10', 'call-help-details-v10', 'call-quick-rail-v10', '执行称呼搜索']) {
    if (!callUiV10.includes(marker)) fail(`V10 call UI marker missing: ${marker}`);
  }
  const heightV10 = read('public/myfile/height-export-v10.js');
  for (const marker of ['renderExportCanvas', 'exportLeftAxes', 'exportRightAxes', 'MAX_CANVAS_AREA']) {
    if (!heightV10.includes(marker)) fail(`V10 height-export marker missing: ${marker}`);
  }
  const heightSourceV10 = read('public/myfile/site-correction-v2.js');
  for (const marker of ['__NO_AGE__', '__NO_SCHOOL__', '__NO_ORGANIZATION__', "range.max = '250'", 'heightState.scale * 200']) {
    if (!heightSourceV10.includes(marker)) fail(`V10 height-source marker missing: ${marker}`);
  }

  const runesV10Page = read('public/runes.html');
  for (const marker of ['./myfile/runes-v10.css', './myfile/runes-v10.js', './myfile/runes-line-v10.js']) {
    if (!runesV10Page.includes(marker)) fail(`V10 runes page missing ${marker}`);
  }
  const runesV10 = read('public/myfile/runes-v10.js');
  for (const marker of ['detectAlphabetGrid', 'recognizeAlphabet', 'buildSmartMaskedFile', 'expanded-rectangular-selection', '__RUNE_V10__', '较慢但更准确']) {
    if (!runesV10.includes(marker)) fail(`V10 rune marker missing: ${marker}`);
  }
  const runesLineV10 = read('public/myfile/runes-line-v10.js');
  for (const marker of ['recognizePaintedLine', 'painted-line-dp', 'paint-guided line segmentation', 'skipCost']) {
    if (!runesLineV10.includes(marker)) fail(`V10 painted-line marker missing: ${marker}`);
  }

  const localizationV10 = JSON.parse(read('public/data/story-v7/localization.json'));
  const titleAuditV10 = JSON.parse(read('public/data/story-v10/title-audit.json'));
  if (localizationV10.titleAuditV10?.uniqueSourceTitles !== 5710
      || localizationV10.titleAuditV10?.localizedSourceTitles !== 5710) {
    fail('V10 story-title localization does not cover all 5,710 source titles.');
  }
  if (localizationV10.titleAuditV10?.selfTranslatedTitles !== titleAuditV10.selfTranslations?.length) {
    fail('V10 self-translation audit count is inconsistent.');
  }
  if (Object.keys(localizationV10.titleExact || {}).length < 5710) {
    fail('V10 titleExact map is unexpectedly incomplete.');
  }
  if (!read('docs/story-title-self-translations-v10.md').includes('## 助手自译清单')) {
    fail('V10 self-translation Markdown audit is incomplete.');
  }

  if (buildInfo.rollbackBeforeHeightExportTitleCallRuneV10 !== 'rollback/pre-height-export-title-call-v10-20260817') {
    fail('V10 rollback pointer is missing or incorrect.');
  }
  if (!isV11 && buildInfo.callQuickRail !== 'nine-Chinese-actions') fail('V10 call quick rail marker is incorrect.');
  if (buildInfo.heightScaleDisplayedRange !== '50-250-percent') fail('V10 height scale marker is incorrect.');
  if (buildInfo.runeMaskMeaning !== 'expanded-selection-region-not-exact-pixel-clipping') fail('V10 mask semantics marker is incorrect.');
  if (buildInfo.runePaintedLineDecoder !== 'template-dynamic-programming-with-noise-skips') fail('V10 painted-line decoder marker is incorrect.');
}


if (isV11) {
  for (const file of [
    'public/myfile/live-fixes-v11.css', 'public/myfile/live-fixes-v11.js',
    'public/myfile/height-export-v11.js', 'public/myfile/runes-v11.js',
    'scripts/smoke-live-v11.mjs'
  ]) requireFile(file);
  const rootV11 = read('public/index.html');
  const storyV11 = read('public/story.html');
  const attendanceV11 = read('public/attendance.html');
  const runesPageV11 = read('public/runes.html');
  for (const page of [rootV11, storyV11, attendanceV11, runesPageV11]) {
    if (!page.includes('./myfile/live-fixes-v11.css')) fail('V11 page missing shared live fixes CSS.');
  }
  for (const marker of ['./myfile/live-fixes-v11.js', './myfile/height-export-v11.js']) {
    if (!rootV11.includes(marker)) fail(`V11 root page missing ${marker}`);
  }
  if (!runesPageV11.includes('./myfile/runes-v11.js')) fail('V11 runes page missing auto-routing wrapper.');
  const liveJs = read('public/myfile/live-fixes-v11.js');
  const liveCss = read('public/myfile/live-fixes-v11.css');
  for (const marker of ['is-selected-v11', 'pagetop', 'character-catalog.json']) {
    if (!liveJs.includes(marker)) fail(`V11 live-fixes marker missing: ${marker}`);
  }
  for (const marker of ['grid-template-columns: repeat(auto-fill, 68px)', '.suite-character-card.umeColor', 'position: sticky', 'label.girlbox.is-selected-v11']) {
    if (!liveCss.includes(marker)) fail(`V11 CSS marker missing: ${marker}`);
  }
  const heightV11 = read('public/myfile/height-export-v11.js');
  for (const marker of ['renderExportCanvas', 'exportLeftAxes', 'exportRightAxes', 'MAX_PIXELS']) {
    if (!heightV11.includes(marker)) fail(`V11 height-export marker missing: ${marker}`);
  }
  if (heightV11.includes('html2canvas(')) fail('V11 direct export must not call html2canvas.');
  const heightSourceV11 = read('public/myfile/site-correction-v2.js');
  for (const marker of ['missingHeight', 'visibleCategories = categories.filter', 'height-selection-summary-v11']) {
    if (!heightSourceV11.includes(marker)) fail(`V11 selected-height marker missing: ${marker}`);
  }
  const rulerV11 = read('public/myfile/site-correction-v3-height.js');
  if (!rulerV11.includes('Math.min(rightAxis.offsetLeft, viewportRight)')) fail('V11 right-ruler clamp missing.');
  const toolsV11 = read('public/myfile/tools-suite.js');
  if (!toolsV11.includes('...(entry.classes || [])')) fail('V11 suite cards do not inherit call-page palette classes.');
  const runeV11 = read('public/myfile/runes-v11.js');
  for (const marker of ["aspect <= 1.25 ? 'chart' : 'character'", '横向装饰文字', 'runesRecognizeV10Final']) {
    if (!runeV11.includes(marker)) fail(`V11 rune routing marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeLiveReacceptanceV11 !== 'release/height-export-title-call-rune-v10-20260817') fail('V11 rollback pointer missing or incorrect.');
  if (buildInfo.heightExport !== 'direct-canvas-high-dpi-no-html2canvas') fail('V11 direct export marker incorrect.');
  if (buildInfo.suiteNavigation !== 'sticky-all-four-tools-including-call-page') fail('V11 sticky navigation marker incorrect.');
}

if (failed) process.exit(1);
console.log(`Static validation passed for ${release}: ${characterCount} characters.`);
