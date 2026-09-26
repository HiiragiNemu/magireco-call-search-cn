// Build-time adapter only. Reader is read-only; no React or TS runtime ships to Call.
// Usage: node scripts/import-reader-optics.cjs <Reader website> <handoff inventory>
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2]);
const inventory = JSON.parse(fs.readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, ''));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
for (const file of inventory.files) {
  if (hash(fs.readFileSync(path.join(root, '..', file.path))) !== file.sha256)
    throw new Error('Donor changed: ' + file.path);
}
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const cache = new Map();
function sourceModule(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require(id) {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/')) {
      const base = id.slice(2);
      return sourceModule(fs.existsSync(path.join(root, base + '.tsx')) ? base + '.tsx' : base + '.ts');
    }
    return req(id);
  } }, { filename });
  cache.set(relative, module.exports);
  return module.exports;
}
const { DayTubeFilter, NightTubeFilter } = sourceModule('components/TubeOpticalFilters.tsx');
const { SceneRegistrationDefinitions } = sourceModule('components/SceneRegistration.tsx');
const { scanlinePattern } = sourceModule('lib/scanline-pattern.ts');
const graphs = {};
const renderFilter = element => renderToStaticMarkup(React.createElement('svg',null,element)).replace(/^<svg>/,'').replace(/<\/svg>$/,'');
const options = { id: 'call-tube-template', map: './myfile/reader-textures/magi-tube-lens-512.png', scale: 50 };
for (const theme of ['light','paper','green','frost']) for (const registration of [false,true]) {
  // Cold follows ReaderTubeSurface: the actual night path, with day registration.
  graphs[theme + ':' + registration] = renderFilter(theme === 'frost'
    ? React.createElement(NightTubeFilter, {...options, profile: registration ? 'day' : undefined})
    : React.createElement(DayTubeFilter, {...options, theme, registration}));
}
for (const profile of ['green','amber']) {
  graphs['dark:' + profile] = renderFilter(React.createElement(NightTubeFilter, {...options, profile}));
  graphs['flat:' + profile] = renderToStaticMarkup(React.createElement(SceneRegistrationDefinitions, {id:'call-flat-template',profile}));
}
graphs['flat:day'] = renderToStaticMarkup(React.createElement(SceneRegistrationDefinitions, {id:'call-flat-template',profile:'day'}));
const meta = { donorCommit: inventory.commit, files: inventory.files, graphHashes: Object.fromEntries(Object.entries(graphs).map(([k,v])=>[k,hash(v)])) };
const out = path.resolve(__dirname,'../public/myfile');
const check = process.argv.includes('--check');
const publish = (name, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const filename = path.join(out,name);
  if (check) {
    if (!fs.readFileSync(filename).equals(bytes)) throw new Error('Imported output differs: '+name);
  } else fs.writeFileSync(filename,bytes);
};
publish('reader-optics-graphs-v14.json',JSON.stringify({meta,graphs},null,2)+'\n');
publish('reader-optics-graphs-v14.js',
  '/* Generated verbatim from Reader '+inventory.commit+'; see scripts/import-reader-optics.cjs. */\n'+
  'window.CallReaderGraphsV14=Object.freeze('+JSON.stringify(graphs)+');\n'+
  'window.CallReaderScanlinesV14='+scanlinePattern.toString()+';\n');
// The same decoded lens and textures, not visually similar replacements.
for (const file of inventory.files.filter(f=>f.path.startsWith('website/public/textures/'))) {
  publish(path.join('reader-textures',path.basename(file.path)),fs.readFileSync(path.join(root,'..',file.path)));
}
console.log(JSON.stringify({donor:inventory.commit, verifiedFiles:inventory.files.length,graphs:Object.keys(graphs).length, mode:check?'read-only comparison':'generate'}));
