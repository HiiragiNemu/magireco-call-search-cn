import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const url = 'https://universal-adv-reader.pages.dev/apps/web';
const label = '通用 ADV 剧情阅读网站';
const version = 'ui-r16-universal-adv-20261019';
const shared = JSON.parse(read('public/myfile/hamburger-menu-v23.js').match(/const MENU = ("(?:\\.|[^"\\])*");/)[1]);

for (const [name, html] of [['home menu', read('public/index.html')], ['shared menu', shared]]) {
  test(`${name} includes one Universal ADV link in other tools and preserves existing destinations`, () => {
    const section = html.slice(html.indexOf('■ 我的其他工具与动态'), html.indexOf('■ 赞助支持'));
    const anchors = [...section.matchAll(/<a\b([^>]+)>([^<]*)<\/a>/g)];
    const links = anchors.filter(([, attrs]) => attrs.includes(`href="${url}"`));
    assert.equal(links.length, 1, 'Universal ADV link must appear exactly once');
    assert.equal(links[0][2], label);
    assert.match(links[0][1], /target="_blank"/);
    assert.match(links[0][1], /rel="noopener noreferrer"/);
    for (const existing of ['https://magireader.pages.dev/', 'https://magiaexedralive2dviewer.pages.dev/',
      'https://space.bilibili.com/625821', 'https://magius3dviewer.pages.dev/', 'https://madeinmagius-site.pages.dev/']) {
      assert.ok(section.includes(`href="${existing}"`), existing);
    }
    assert.ok(section.includes('加入QQ交流群 (858083286)'));
    assert.ok(html.includes('https://afdian.com/a/madeinmagius'));
  });
}

test('every page using the shared menu requests its new cache version', () => {
  let pages = 0;
  for (const file of fs.readdirSync(new URL('public/', root)).filter(x => x.endsWith('.html'))) {
    const html = read(`public/${file}`);
    if (!html.includes('hamburger-menu-v23.js')) continue;
    pages++;
    assert.ok(html.includes(`hamburger-menu-v23.js?v=${version}`), file);
  }
  assert.equal(pages, 10);
});
