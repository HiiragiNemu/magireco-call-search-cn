import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.env.CALL_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('public/myfile/reader-optics-v14.css');
const runtime=read('public/myfile/reader-optics-v14.js');
const controls=read('public/myfile/reader-controls-v12.css');
const donor=JSON.parse(read('tests/fixtures/reader-day-material-r20.json'));

test('day grain uses the accepted continuous texture and exposure, not sparse dots or a grey mask',()=>{
 const rule=css.match(/html:root:is\(\[data-call-theme="light"\],\[data-call-theme="paper"\],\[data-call-theme="green"\]\) \{([^}]+)\}/)[1];
 assert.match(rule,/--call-day-noise:\.85/);
 assert.match(rule,/--call-grain-size:160px 160px/);
 assert.match(rule,/--call-grain-background-blend:normal/);
 assert.match(rule,/--call-grain-blend:hard-light/);
 assert.match(css,/background:url\('\.\/reader-textures\/NoiseAndGrain.png'\) 0 0\/var\(--call-grain-size\) repeat/);
 assert.doesNotMatch(css,/daylight-grain|background-color:\s*(?:gray|grey|#808080)|blur\(\.42px\)/);
 const scene=read('public/myfile/theme-mode-v1.css');
 assert.match(scene,/\.call-display-root-v7\{[^}]*isolation:isolate;[^}]*background:var\(--call-field\)/);
 assert.match(scene,/\.call-display-scroll-v7\{[^}]*background:transparent/);
 for(const color of ['#d8d4c6','#f3eacb','#d6e9c4'])assert.ok(scene.includes(color));
});

test('night and cold keep their original grain settings; the scanline is no longer double painted',()=>{
 const defaults=css.match(/html:root\[data-call-theme\] \{([^}]+)\}/)[1];
 for(const token of ['--call-day-noise:.28','--call-grain-size:257px 131px','--call-grain-background-blend:soft-light','--call-grain-blend:soft-light'])assert.ok(defaults.includes(token));
 assert.match(css,/128px 64px repeat,url\('\.\/reader-textures\/PixelOverlay_RGB_16.png'\) 0 0\/4px 4px repeat/);
 assert.match(css,/opacity:\.495!important/);assert.match(css,/opacity:\.66!important/);
 assert.match(css,/--call-reader-raster:linear-gradient\(transparent,transparent\)/);
 assert.equal(css.split('--call-reader-raster:').length,2);
 assert.match(css,/call-fx-frost-grain-v7/);
});

test('scan gradient exactly matches the accepted frozen donor shoulders and 3px pitch',()=>{
 const scan=css.match(/body \.call-fx-scanlines-v7 \{([^}]+)\}/)[1];
 assert.ok(scan.replace(/\r\n/g,'\n').includes('background: '+donor.gradient+'!important'));
 assert.match(scan,/mix-blend-mode:multiply/);assert.match(scan,/opacity:var\(--call-reader-scan\)/);
 assert.doesNotMatch(scan,/blur|filter:|animation/);
});

test('material-only runtime has zero resize observers, scanline descendants or new filters',()=>{
 const materials=runtime.slice(runtime.indexOf('function mountMaterials'),runtime.indexOf('function mount(scene)'));
 assert.doesNotMatch(materials,/ResizeObserver|addEventListener|createElementNS|filter|requestAnimationFrame/);
 assert.match(materials,/document.createElement\('span'\)/);
 assert.match(materials,/if\(!enabled\)\{current\?\.remove\(\);return;\}/);
 assert.match(materials,/d.callFxNoise==='true' && d.callTheme!=='dark'/);
 assert.match(materials,/d.callFxScanlines==='true'/);
});

test('day menus have opaque original colors while frost/night retain their translucent faces',()=>{
 for(const c of ['#edf0e9','#f4e7c6','#d5e7ca'])assert.ok(controls.includes('--call-menu-face:'+c+';'));
 for(const c of ['#091009f5','#18100df5','#08212bf5'])assert.ok(controls.includes('--call-menu-face:'+c+';'));
 assert.match(read('public/myfile/theme-mode-v1.css'),/\.call-fx-window-v7 \{[^}]*background:var\(--call-surface-raised\)/);
 // Call has a dropdown, not Reader's side drawer/scrim. No invented clipping
 // layer or selector: the existing grain continues over the opaque menu.
 assert.doesNotMatch(runtime,/magi-reader-sidebar|mobile-sidebar-open|scrim/);
});

test('green story action colors are scoped away from character selection and other themes',()=>{
 const rule=controls.slice(controls.indexOf("/* Reader's accepted green story surface"),controls.indexOf('/* Parent-story groups are injected'));
 assert.match(rule,/data-call-theme="green"/);assert.match(rule,/--control-face:#b7d0ae/);
 assert.match(rule,/--control-face:#2E7D32/);
 assert.doesNotMatch(rule,/girlbox|suite-character-card|data-call-theme="frost"|data-call-theme="dark"/);
});
