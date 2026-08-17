import fs from 'node:fs';

const RELEASE = 'live-regression-repair-v12-20260818';
const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const build = JSON.parse(read('public/build-info.json'));
assert(build.release === RELEASE, `release mismatch: ${build.release}`);
assert(build.deploymentTarget === 'magireco-call-search-cn.pages.dev', 'wrong deployment target');
assert(build.rollbackBeforeLiveRegressionRepairV12 === 'rollback/pre-live-fix-v12-20260818', 'V12 rollback pointer missing');
assert(build.callQuickRail === 'nine-actions-replaces-legacy-three', 'V12 quick rail marker missing');
assert(build.suiteNavigation === 'document-sticky-body-level-call-nav', 'V12 sticky nav marker missing');
assert(build.heightViewport === 'scaled-stage-auto-height-no-reserved-vh', 'V12 height marker missing');
assert(build.runeRecognitionTechnology === 'rollback-to-first-paint-mask-v9', 'V12 OCR rollback marker missing');
assert(JSON.stringify(build.runeActiveRecognizerScripts) === JSON.stringify([
  'runes-app.js', 'runes-template-v7.js', 'runes-mask-v9.js'
]), 'V12 active OCR stack is not the first mask stack');

for (const file of [
  'public/myfile/live-fixes-v12.css',
  'public/myfile/live-fixes-v12.js',
  'public/myfile/runes-app.js',
  'public/myfile/runes-template-v7.js',
  'public/myfile/runes-mask-v9.js',
  'public/myfile/runes-mask-v9.css',
  'public/myfile/call-ui-v10.js',
  'public/myfile/height-export-v11.js',
  'scripts/smoke-live-v12.mjs'
]) assert(exists(file), `missing V12 production/test file: ${file}`);

const pages = ['public/index.html', 'public/story.html', 'public/attendance.html', 'public/runes.html'];
for (const file of pages) {
  const text = read(file);
  assert(text.includes(`data-build="${RELEASE}"`), `${file} release marker mismatch`);
  assert(text.includes('./myfile/live-fixes-v12.css'), `${file} missing V12 CSS`);
  assert(text.includes('./myfile/live-fixes-v12.js'), `${file} missing V12 JS`);
  assert(text.includes('./myfile/layout-v8.css'), `${file} lost V8 layout`);
}

const root = read('public/index.html');
assert((root.match(/class=["'][^"']*\bMagicalChk\b[^"']*["'][^>]*name=["']chara["']/g) || []).length >= 180,
  'root character directory is incomplete');
for (const marker of ['./myfile/call-ui-v10.js', './myfile/height-export-v11.js', './myfile/live-fixes-v11.js']) {
  assert(root.includes(marker), `root lost established feature: ${marker}`);
}

const css = read('public/myfile/live-fixes-v12.css');
for (const marker of ['#pagetop', '#pagemdl', '#pagebtm', 'height: auto !important', 'resize: none !important', 'body:not(.suite-page) > .suite-nav']) {
  assert(css.includes(marker), `V12 CSS marker missing: ${marker}`);
}
const js = read('public/myfile/live-fixes-v12.js');
for (const marker of ['promoteCallSuiteNav', 'hideLegacyCallRail', 'fitHeightViewports', '__MAGIRECO_LIVE_V12__']) {
  assert(js.includes(marker), `V12 JS marker missing: ${marker}`);
}

const runes = read('public/runes.html');
for (const marker of ['./myfile/runes-app.js', './myfile/runes-template-v7.js', './myfile/runes-mask-v9.js']) {
  assert(runes.includes(marker), `runes page lost restored OCR layer: ${marker}`);
}
for (const forbidden of ['./myfile/runes-v10.js', './myfile/runes-line-v10.js', './myfile/runes-v11.js']) {
  assert(!runes.includes(forbidden), `later OCR override is still active: ${forbidden}`);
}
assert(read('public/myfile/runes-template-v7.js').includes('global.__RUNE_INPUT_OVERRIDE_V9__ || fileInput.files?.[0]'),
  'V9 template bridge missing');
assert(read('public/myfile/runes-app.js').includes('const recognitionFile = global.__RUNE_INPUT_OVERRIDE_V9__ || file;'),
  'V9 classic bridge missing');
assert(read('public/myfile/runes-mask-v9.js').includes('buildMaskedFile'), 'V9 mask builder missing');

const localization = JSON.parse(read('public/data/story-v7/localization.json'));
assert(localization.audit.mappedCastNames === localization.audit.castNames, 'cast localization regressed');
assert(localization.audit.unresolvedCastNames.length === 0, 'unresolved cast names regressed');
assert(localization.titleAuditV10.uniqueSourceTitles === 5710 && localization.titleAuditV10.localizedSourceTitles === 5710,
  'story title localization regressed');

console.log(`Static V12 validation passed: ${RELEASE}.`);
