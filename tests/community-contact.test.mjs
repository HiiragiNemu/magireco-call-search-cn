import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read = file => fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');

test('all shared menu entrypoints load the current group label and preserve the invitation', () => {
  const menu = read('myfile/hamburger-menu-v23.js'); const index = read('index.html');
  for (const text of [menu, index]) { assert(text.includes('858083286')); assert(!text.includes('928098518')); assert(text.includes('inviteCode=2oaXZG3lL1g')); }
  const release = JSON.parse(read('call-r24-release.json'));
  assert.equal(release.communityUpdate.group, '858083286');
  for (const file of ['attendance.html','call_png.html','cnt.html','gachasim.html','index.html','index_png.html','json_open.html','runes.html','story-title-editor.html','story.html']) {
    const content = read(file);
    assert.equal(content.split('hamburger-menu-v23.js?v=ui-r15-community-858083286').length, 2, file);
    assert.equal(createHash('sha256').update(content).digest('hex'), release.sha256[file], file + ' release checksum');
  }
  assert.equal(createHash('sha256').update(menu).digest('hex'), release.sha256['myfile/hamburger-menu-v23.js']);
});
