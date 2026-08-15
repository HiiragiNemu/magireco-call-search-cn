'use strict';

const fs = require('fs');
const path = require('path');

let failed = false;
function fail(message) {
    failed = true;
    console.error(`VALIDATION ERROR: ${message}`);
}

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function requireFile(file) {
    if (!fs.existsSync(file)) fail(`required production file missing: ${file}`);
}

const htmlPath = path.join('public', 'index.html');
const buildInfoPath = path.join('public', 'build-info.json');
requireFile(htmlPath);
requireFile(buildInfoPath);

const html = read(htmlPath);
const buildInfo = JSON.parse(read(buildInfoPath));
const release = String(buildInfo.release || '');
const isV2 = release === 'layout-correction-v2-20260816';

function count(pattern) {
    return (html.match(pattern) || []).length;
}

for (const [pattern, expected, label] of [
    [/<!DOCTYPE html>/gi, 1, 'doctype'],
    [/<html\b[^>]*>/gi, 1, 'opening html'],
    [/<\/html\s*>/gi, 1, 'closing html'],
    [/<head\b[^>]*>/gi, 1, 'opening head'],
    [/<\/head\s*>/gi, 1, 'closing head'],
    [/<body\b[^>]*>/gi, 1, 'opening body'],
    [/<\/body\s*>/gi, 1, 'closing body']
]) {
    const actual = count(pattern);
    if (actual !== expected) fail(`${label}: expected ${expected}, found ${actual}`);
}

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) fail(`duplicate ids: ${duplicateIds.join(', ')}`);

const characterCount = (html.match(/class=["'][^"']*\bMagicalChk\b[^"']*["'][^>]*name=["']chara["']/g) || []).length;
if (characterCount < 180) fail(`expected at least 180 character selectors, found ${characterCount}`);

for (const value of [
    'id="callFilterForm"',
    'id="callResultSection"',
    `data-build="${release}"`,
    './myfile/site-overhaul.css',
    './myfile/site-overhaul.js',
    './myfile/gradeOverrides.js',
    './myfile/grade-classification.js',
    './myfile/jquery-3.6.0.min.js',
    './myfile/vis-network.min.js',
    './myfile/html2canvas.min.js',
    'value="まどドラ">Magia Exedra'
]) {
    if (!html.includes(value)) fail(`missing required production marker/reference: ${value}`);
}

for (const value of [
    'id="callcate"',
    'attr.includes("学院")',
    'ajax.googleapis.com/ajax/libs/jquery/1.7.1',
    'visjs.github.io/vis-network',
    './css/style.css',
    './css/table.css',
    './css/button.css',
    './img/webp/ファビコン.webp',
    './img/webp/apple_fabicon.webp',
    'value="まどドラ">小圆前辈',
    'data-kana="さおとめ せんせい"'
]) {
    if (html.includes(value)) fail(`obsolete production text remains: ${value}`);
}

if (count(/jquery-3\.6\.0\.min\.js/gi) !== 1) fail('jQuery must be loaded exactly once.');
if (count(/vis-network\.min\.js/gi) !== 1) fail('vis-network must be loaded exactly once.');
if (count(/site-overhaul\.js/gi) !== 1) fail('site-overhaul.js must be loaded exactly once.');

const localRefs = [...html.matchAll(/(?:src|href)=["'](\.\/[^"'#?]+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.includes('${'));
for (const reference of [...new Set(localRefs)]) {
    requireFile(path.join('public', reference.replace(/^\.\//, '')));
}

for (const file of [
    'public/myfile/myCommon.js',
    'public/myfile/mgirlNarrow.js',
    'public/myfile/mgirlCallNarrow.js',
    'public/myfile/mgirlAtSearch.js',
    'public/myfile/gradeOverrides.js',
    'public/myfile/grade-classification.js',
    'public/myfile/site-overhaul.css',
    'public/myfile/site-overhaul.js',
    'public/myfile/jquery-3.6.0.min.js',
    'public/myfile/vis-network.min.js',
    'public/myfile/html2canvas.min.js'
]) requireFile(file);

if (buildInfo.deploymentTarget !== 'magireco-call-search-cn.pages.dev') {
    fail(`unexpected deployment target: ${buildInfo.deploymentTarget}`);
}

const names = read('public/myfile/NAMELIST.txt');
if (names.includes('早乙女老师')) fail('NAMELIST still exposes the obsolete Saotome translation.');

if (isV2) {
    for (const value of ['./myfile/site-correction-v2.css', './myfile/site-correction-v2.js']) {
        if (!html.includes(value)) fail(`V2 production reference missing: ${value}`);
    }
    if (count(/site-correction-v2\.js/gi) !== 1) fail('site-correction-v2.js must be loaded exactly once.');
    if (count(/site-correction-v2\.css/gi) !== 1) fail('site-correction-v2.css must be loaded exactly once.');

    for (const file of [
        'public/myfile/site-correction-v2.css',
        'public/myfile/site-correction-v2.js',
        'public/__acceptance.html'
    ]) requireFile(file);

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

if (failed) process.exit(1);
console.log(`Static validation passed for ${release}: ${ids.length} unique IDs, ${characterCount} characters, ${localRefs.length} local references.`);
