'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
    console.error(`VALIDATION ERROR: ${message}`);
    process.exitCode = 1;
}

const htmlPath = path.join('public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function count(pattern) {
    return (html.match(pattern) || []).length;
}

const expectedCounts = [
    [/<!DOCTYPE html>/gi, 1, 'doctype'],
    [/<html\b[^>]*>/gi, 1, 'opening html'],
    [/<\/html\s*>/gi, 1, 'closing html'],
    [/<head\b[^>]*>/gi, 1, 'opening head'],
    [/<\/head\s*>/gi, 1, 'closing head'],
    [/<body\b[^>]*>/gi, 1, 'opening body'],
    [/<\/body\s*>/gi, 1, 'closing body']
];
for (const [pattern, expected, label] of expectedCounts) {
    const actual = count(pattern);
    if (actual !== expected) fail(`${label}: expected ${expected}, found ${actual}`);
}

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) fail(`duplicate ids: ${duplicateIds.join(', ')}`);

const requiredText = [
    'id="callFilterForm"',
    'id="callResultSection"',
    'data-build="mobile-overhaul-20260816"',
    './myfile/site-overhaul.css',
    './myfile/site-overhaul.js',
    './myfile/gradeOverrides.js',
    './myfile/grade-classification.js',
    './myfile/jquery-3.6.0.min.js',
    './myfile/vis-network.min.js',
    './myfile/html2canvas.min.js',
    'value="まどドラ">Magia Exedra'
];
for (const value of requiredText) {
    if (!html.includes(value)) fail(`missing required production marker/reference: ${value}`);
}

const forbiddenText = [
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
];
for (const value of forbiddenText) {
    if (html.includes(value)) fail(`obsolete production text remains: ${value}`);
}

if (count(/jquery-3\.6\.0\.min\.js/gi) !== 1) fail('jQuery must be loaded exactly once.');
if (count(/vis-network\.min\.js/gi) !== 1) fail('vis-network must be loaded exactly once.');
if (count(/site-overhaul\.js/gi) !== 1) fail('site-overhaul.js must be loaded exactly once.');

const localRefs = [...html.matchAll(/(?:src|href)=["'](\.\/[^"'#?]+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.includes('${'));

for (const reference of [...new Set(localRefs)]) {
    const target = path.join('public', reference.replace(/^\.\//, ''));
    if (!fs.existsSync(target)) fail(`missing local resource: ${reference}`);
}

const names = fs.readFileSync('public/myfile/NAMELIST.txt', 'utf8');
if (names.includes('早乙女老师')) fail('NAMELIST still exposes the obsolete Saotome translation.');

const requiredFiles = [
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
    'public/myfile/html2canvas.min.js',
    'public/build-info.json'
];
for (const file of requiredFiles) {
    if (!fs.existsSync(file)) fail(`required production file missing: ${file}`);
}

if (!process.exitCode) {
    console.log(`Static validation passed: ${ids.length} unique IDs, ${localRefs.length} local references.`);
}
