import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function findChrome() {
    for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        try {
            return execFileSync('which', [command], { encoding: 'utf8' }).trim();
        } catch {
            // Try the next executable.
        }
    }
    throw new Error('No Chromium-compatible browser found on the runner.');
}

const chromePath = findChrome();
const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/magireco-smoke-profile',
    '--window-size=390,844',
    'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeErrors = '';
chrome.stderr.on('data', (chunk) => {
    chromeErrors += String(chunk);
});

async function getDebuggerPage() {
    for (let attempt = 0; attempt < 80; attempt++) {
        try {
            const pages = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json());
            const page = pages.find((candidate) => candidate.type === 'page');
            if (page && page.webSocketDebuggerUrl) return page;
        } catch {
            // Chrome is still starting.
        }
        await sleep(125);
    }
    throw new Error('Chrome remote debugging endpoint did not become ready.');
}

const page = await getDebuggerPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const runtimeExceptions = [];

socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
        runtimeExceptions.push(message.params.exceptionDetails.text || 'Unknown runtime exception');
    }
});

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || `Evaluation failed: ${expression}`);
    }
    return result.result.value;
}

try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true
    });
    await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });

    for (let attempt = 0; attempt < 100; attempt++) {
        const ready = await evaluate('document.readyState');
        if (ready === 'complete') break;
        await sleep(100);
    }
    await sleep(1000);

    const initial = await evaluate(`(() => ({
        characters: document.querySelectorAll('input.MagicalChk[name="chara"]').length,
        duplicateIds: (() => {
            const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
            return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        })(),
        build: document.body.dataset.build,
        hasUtils: !!window.MagirecoNameUtils,
        hasResponsiveRenderer: typeof window.drawNet_Table === 'function'
    }))()`);
    assert(initial.characters >= 180, `Expected at least 180 character selectors, got ${initial.characters}.`);
    assert(initial.duplicateIds.length === 0, `Duplicate IDs at runtime: ${initial.duplicateIds.join(', ')}`);
    assert(initial.build === 'mobile-overhaul-20260816', `Unexpected build marker: ${initial.build}`);
    assert(initial.hasUtils && initial.hasResponsiveRenderer, 'Production utilities were not loaded.');

    const search = await evaluate(`(() => {
        const input = document.getElementById('ndownword1');
        input.value = 'かずこ';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const teacher = document.getElementById('早乙女和子');
        const teacherVisible = teacher && getComputedStyle(teacher.closest('label.girlbox')).display !== 'none';
        const visibleCount = [...document.querySelectorAll('label.girlbox')]
            .filter((label) => getComputedStyle(label).display !== 'none').length;
        return { teacherVisible, visibleCount };
    })()`);
    assert(search.teacherVisible, 'Searching かずこ did not find 早乙女和子.');
    assert(search.visibleCount > 0 && search.visibleCount < initial.characters, 'Text search did not narrow the selector.');

    const doubleFilter = await evaluate(`(() => {
        ndownReset('call');
        const first = document.querySelector('input.MagicalChk[name="chara"]');
        mgirlCallNarrow(first);
        return [...document.querySelectorAll('label.girlbox')]
            .filter((label) => getComputedStyle(label).display !== 'none').length;
    })()`);
    assert(doubleFilter >= 1, 'Double-click relationship filtering hid every character.');

    await evaluate(`(() => {
        ndownReset('call');
        const boxes = [...document.querySelectorAll('input.MagicalChk[name="chara"]')];
        boxes.forEach((box) => { box.checked = false; });
        boxes.slice(0, 8).forEach((box) => { box.checked = true; });
        drawAndJump();
        return true;
    })()`);
    await sleep(700);

    const relationship = await evaluate(`(() => {
        const host = document.getElementById('mytable');
        const table = document.getElementById('girltable');
        const before = host.scrollLeft;
        host.scrollLeft = host.scrollWidth;
        return {
            rows: table ? table.querySelectorAll('tbody tr').length : 0,
            headers: table ? table.querySelectorAll('thead th').length : 0,
            scrollWidth: host.scrollWidth,
            clientWidth: host.clientWidth,
            scrollLeft: host.scrollLeft,
            before,
            overflowX: getComputedStyle(host).overflowX,
            hint: !!host.querySelector('.relationship-scroll-hint'),
            networkScale: window.network && typeof window.network.getScale === 'function'
                ? window.network.getScale()
                : null
        };
    })()`);
    assert(relationship.rows === 8, `Expected 8 relationship rows, got ${relationship.rows}.`);
    assert(relationship.headers === 11, `Expected 11 relationship headers, got ${relationship.headers}.`);
    assert(relationship.scrollWidth > relationship.clientWidth, 'Mobile relationship table is not horizontally scrollable.');
    assert(relationship.scrollLeft > 0, 'Horizontal scrolling could not move the relationship table.');
    assert(['auto', 'scroll'].includes(relationship.overflowX), `Unexpected overflow-x: ${relationship.overflowX}`);
    assert(relationship.hint, 'Mobile horizontal-scroll hint is missing.');
    assert(Number.isFinite(relationship.networkScale), 'Relationship network did not initialize.');

    const relationshipShot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
    });
    fs.writeFileSync('/tmp/mobile-relationship.png', Buffer.from(relationshipShot.data, 'base64'));

    const grades = await evaluate(`(() => {
        const attrsFor = (name) => {
            const result = new Set();
            for (const [key, attrs] of charaAttribute) {
                if (MagirecoNameUtils.variantBelongsTo(key, name)) {
                    attrs.forEach((value) => result.add(value));
                }
            }
            return [...result];
        };
        return {
            sena: attrsFor('瀬奈みこと'),
            koito: attrsFor('浅古小糸'),
            akira: attrsFor('行方晶')
        };
    })()`);
    assert(grades.sena.includes('中2') && grades.sena.includes('中学生'), '瀬奈みこと exact grade override failed.');
    assert(!grades.sena.includes('高校生'), '瀬奈みこと was incorrectly inferred as a high-school student.');
    assert(grades.koito.includes('中学生') && !grades.koito.includes('高校生'), '浅古小糸 grade override failed.');
    assert(grades.akira.includes('中3') && grades.akira.includes('中学生'), '行方晶 exact grade override failed.');
    assert(!grades.akira.includes('高校生'), '行方晶 was incorrectly inferred as a high-school student.');

    await evaluate(`displayHeightChart('global', 'age')`);
    await sleep(700);
    const height = await evaluate(`(() => {
        const viewport = document.querySelector('.height-chart-viewport');
        const surface = document.querySelector('.height-chart-surface');
        const range = document.querySelector('[data-height-zoom-range]');
        if (range) {
            range.value = '45';
            range.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return {
            viewport: !!viewport,
            controls: !!document.querySelector('.height-zoom-controls'),
            points: document.querySelectorAll('.height-point').length,
            zoom: surface ? surface.style.zoom : '',
            scrollable: viewport ? viewport.scrollWidth >= viewport.clientWidth : false
        };
    })()`);
    assert(height.viewport && height.controls, 'Responsive height chart controls were not rendered.');
    assert(height.points > 0, 'Global height chart contains no character points.');
    assert(height.zoom === '0.45', `Height chart zoom control failed, got ${height.zoom}.`);
    assert(height.scrollable, 'Height chart viewport is not scrollable/adaptive.');

    const heightShot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
    });
    fs.writeFileSync('/tmp/mobile-height.png', Buffer.from(heightShot.data, 'base64'));

    assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(' | ')}`);
    console.log('Browser smoke test passed for 390x844 mobile viewport.');
} finally {
    socket.close();
    chrome.kill('SIGTERM');
    await sleep(250);
    if (runtimeExceptions.length || chrome.exitCode > 0) {
        console.error(chromeErrors.slice(-5000));
    }
}
