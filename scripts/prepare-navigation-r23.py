#!/usr/bin/env python3
"""Reproducible, fail-closed r23 patch. Does not publish or change other projects."""
import hashlib, json, re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
release='call-r23-semantic-rail-20260929'
marker=root/'public/call-r23-release.json'
if marker.exists():
    assert json.loads(marker.read_text())['release']==release
    print('r23 already applied; verify the checked-out deployment instead.')
    raise SystemExit(0)

def sha(data): return hashlib.sha256(data).hexdigest()
def blob(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
original={p:p.read_bytes() for p in (root/'public').rglob('*') if p.is_file()}
expected={'suite-v7.js':'10ca5ccf077825bdf52050a9de5603f628152b22','theme-mode-v1.js':'1e4f32f5ad69c1bb4e7a0192ca93039375af3870','theme-mode-v1.css':'61d237594cc8dd5e24bfbd320228f3b02737f2eb'}
for name,digest in expected.items():
    assert blob((root/'public/myfile'/name).read_bytes())==digest, f'{name}: baseline changed; review before patching'

def write(path,text): (root/path).write_text(text,encoding='utf-8',newline='\n')
p='public/myfile/suite-v7.js';s=(root/p).read_text()
a=s.index("    const definitions = tool === 'story'");b=s.index('    const rail =',a)
part=s[a:b]
actions={'↑':'top','↓':'bottom','筛选':'filter','角色':'characters','搜索':'search','结果':'results','取消':'cancel'}
# Each handler now carries its own stable action ID, independent of its label.
for caption,action in actions.items():
    part=part.replace("['"+caption+"',", "['"+action+"','"+caption+"',")
s=s[:a]+part+s[b:]
s=s.replace('for (const [glyph, label, action] of definitions)', 'for (const [actionName, glyph, label, action] of definitions)')
a=s.index("      const actionName = label.includes('顶部')");b=s.index("      button.addEventListener('click', action);",a)
s=s[:a]+"      button.dataset.action = actionName;\n"+s[b:];write(p,s)
p='public/myfile/theme-mode-v1.js';s=(root/p).read_text()
s=s.replace("  function railIcon(action){", """  function railIcon(action){
    // Only executing a search uses the magnifier. Navigation uses one readable
    // character; the button keeps its complete title and accessible name.
    const letters={characters:'选',filter:'筛',attributes:'属',results:'果',cancel:'清',height:'高'};
    if(letters[action]) return `<span class="call-rail-letter" aria-hidden="true">${letters[action]}</span>`;""")
a=s.index('      if(!action){',s.index('  function normalizeRailButtons'));b=s.index('      if(action) button.dataset.action=action;',a)
s=s[:a]+"""      // Exact legacy labels also repair a mixed-cache load of the old suite.
      // Never classify '搜索条件' or '搜索结果' by the substring '搜索'.
      const legacyActions={
        '跳到页面顶部':'top','跳到页面底部':'bottom',
        '角色列表':'characters','选择角色':'characters',
        '搜索条件':'filter','筛选角色':'filter','属性筛选':'attributes',
        '执行搜索':'search','称呼搜索':'search','执行称呼搜索':'search',
        '搜索结果':'results','取消筛选与角色选择':'cancel',
        '取消角色选择':'cancel','取消已选角色并清空关系结果':'cancel','身高图':'height'
      };
      action=legacyActions[label] || action;
"""+s[b:]
s=s.replace("if(action && button.dataset.callIconized!=='true'){", "if(action && button.dataset.callIconAction!==action){")
s=s.replace("        button.dataset.callIconized='true';", "        button.dataset.callIconized='true';\n        button.dataset.callIconAction=action;")
write(p,s)
p='public/myfile/theme-mode-v1.css';s=(root/p).read_text()
s=s.replace('Reader-like compact symbolic rail. No text labels in the visible control.', 'Compact rail. Explicit one-character navigation labels accompany the search icon.')
s+='''\n/* r23: restore readable semantic labels inside legacy font-size:0 buttons.
   Inherit the current palette, typography and shared CRT treatment. */
html:root[data-call-theme] body .call-jump-actions-v7 .call-rail-letter {
  display:block; font-family:inherit; font-size:1rem!important;
  font-weight:600; line-height:1; letter-spacing:0;
  color:inherit; text-shadow:inherit; pointer-events:none;
}
''';write(p,s)
# Invalidate all actual consumers, retaining earlier release query prefixes.
for p in (root/'public').glob('*.html'):
    text=p.read_text();updated=re.sub(r'((?:theme-mode-v1\.(?:js|css)|suite-v7\.js)(?:\?[^"<>]*)?)(?=")',r'\1&amp;rail=r23',text)
    if updated!=text: p.write_text(updated,encoding='utf-8',newline='\n')
# The older release verifier remains active; refresh only overlapping hashes.
p=root/'public/call-r22-release.json';legacy=json.loads(p.read_text())
for name in legacy['sha256']: legacy['sha256'][name]=sha((root/'public'/name).read_bytes())
p.write_text(json.dumps(legacy,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
changed={str(p.relative_to(root/'public')):sha(p.read_bytes()) for p,raw in original.items() if p.read_bytes()!=raw}
marker.write_text(json.dumps({'release':release,'scope':'Call sidebar semantics; downstream routes and data unchanged','sha256':changed},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert not any(name.startswith(('data/','aio/','edge-functions/','img/')) for name in changed)
print('Patched public files:',json.dumps(list(changed),ensure_ascii=False))
