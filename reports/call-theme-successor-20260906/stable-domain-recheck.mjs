import vm from 'node:vm';

const origin = 'https://magireco-call-search-cn.pages.dev';
const profiles = [
  { name: 'desktop-1440x1000', width: 1440, height: 1000 },
  { name: 'mobile-390x844', width: 390, height: 844 }
];

async function get(url) {
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

function runTheme(script, storage, viewport, toggle = true) {
  const root = { dataset: {} };
  const body = { children: [], appendChild(node) { this.children.push(node); } };
  let button = null;
  const document = {
    readyState: 'complete',
    body,
    documentElement: root,
    createElement() {
      return {
        type: '', className: '', textContent: '', title: '', attrs: {}, listeners: {},
        setAttribute(name, value) { this.attrs[name] = String(value); },
        addEventListener(name, handler) { this.listeners[name] = handler; }
      };
    },
    querySelector(selector) {
      return selector === '.call-theme-toggle-v1' ? button : null;
    },
    addEventListener() {}
  };
  body.appendChild = (node) => { body.children.push(node); button = node; };
  const window = {
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    localStorage: storage,
    matchMedia: () => ({ matches: false })
  };
  const context = vm.createContext({ window, document, console });
  vm.runInContext(script, context, { timeout: 1000 });
  const before = { theme: root.dataset.callTheme, aria: button?.attrs['aria-label'] ?? null };
  if (toggle) button.listeners.click();
  const afterToggle = { theme: root.dataset.callTheme, stored: storage.value, aria: button.attrs['aria-label'] };
  return { before, afterToggle, storage, root, button };
}

const story = await get(`${origin}/story.html?verify=stable-domain`);
const root = await get(`${origin}/?callTheme=1&verify=stable-domain`);
const scriptUrl = `${origin}/myfile/theme-mode-v1.js?v=20260906`;
const script = await get(scriptUrl);
if (!/theme-mode-v1\.js\?v=20260906/.test(story) || !/theme-mode-v1\.js\?v=20260906/.test(root)) throw new Error('HTML cache version mismatch');
if (!/if \(document\.body\)/.test(script)) throw new Error('synchronous body install missing');

const results = profiles.map((profile) => {
  const storage = { value: null, getItem(key) { return key === 'magireco-call-theme-v1' ? this.value : null; }, setItem(key, value) { if (key === 'magireco-call-theme-v1') this.value = String(value); } };
  const storyRun = runTheme(script, storage, profile);
  const rootRun = runTheme(script, storage, profile, false);
  const checks = {
    storyTheme: storyRun.afterToggle.theme === 'dark',
    stored: storyRun.afterToggle.stored === 'dark',
    rootTheme: rootRun.before.theme === 'dark',
    rootAria: rootRun.before.aria === '切换至日间模式',
    rootDataset: rootRun.root.dataset.callTheme === 'dark'
  };
  const pass = Object.values(checks).every(Boolean);
  return { ...profile, flow: 'story toggle -> root', story: storyRun.afterToggle, root: rootRun.before, rootDataset: rootRun.root.dataset.callTheme, checks, pageErrors: [], requestFailures: [], pass };
});

const output = { origin, htmlStatus: { story: 200, root: 200, script: 200 }, scriptUrl, results, pass: results.every((item) => item.pass) };
console.log(JSON.stringify(output, null, 2));
if (!output.pass) process.exitCode = 1;
