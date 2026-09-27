// Incremental build adapter. Inputs are frozen exports, never a dirty Reader tree.
// node scripts/import-reader-ink-r18.cjs <donor-dir> <Reader-runtime-website> [--check]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const donor=path.resolve(process.argv[2]),req=createRequire(path.resolve(process.argv[3],'package.json'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const acceptance=JSON.parse(fs.readFileSync(path.join(donor,'user-acceptance.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(acceptance.status,'USER_ACCEPTED_COLOUR_BASELINE_ONLY');
for(const f of acceptance.verifiedSourceManifest)assert.equal(sha(fs.readFileSync(path.join(donor,'source',f.path))),f.sha256,f.path);
const ts=req('typescript'),React=req('react'),{renderToStaticMarkup}=req('react-dom/server'),cache=new Map();
function load(rel){
  if(cache.has(rel))return cache.get(rel);
  const filename=path.join(donor,rel==='components/SceneRegistration.tsx'?'source/website':'pinned',rel);
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require(id){
    if(id.endsWith('.css'))return {};
    if(id.startsWith('@/'))return load(id.slice(2)+(id.includes('/components/')?'.tsx':'.ts'));
    return req(id);
  }},{filename});cache.set(rel,module.exports);return module.exports;
}
const {DayTubeFilter,NightTubeFilter}=load('components/TubeOpticalFilters.tsx');
const {SceneRegistrationDefinitions}=load('components/SceneRegistration.tsx');
const baseline=JSON.parse(fs.readFileSync(path.join(donor,'../baseline-reader-optics-graphs-v14.json'),'utf8'));
for(const p of ['components/TubeOpticalFilters.tsx','lib/scene-registration.ts'])assert.equal(sha(fs.readFileSync(path.join(donor,'pinned',p))),baseline.meta.files.find(f=>f.path==='website/'+p).sha256,p);
const graphs={},options={id:'call-tube-template',map:'./myfile/reader-textures/magi-tube-lens-512.png',scale:50};
const render=(Component,props)=>renderToStaticMarkup(React.createElement('svg',null,React.createElement(Component,props))).replace(/^<svg>/,'').replace(/<\/svg>$/,'');
for(const theme of ['light','paper','green','frost'])for(const registration of [false,true]){
  graphs[theme+':'+registration]=theme==='frost'?render(NightTubeFilter,{...options,profile:registration?'day':undefined}):render(DayTubeFilter,{...options,theme,registration});
}
for(const profile of ['green','amber']){
  graphs['dark:'+profile]=render(NightTubeFilter,{...options,profile});
  graphs['flat:'+profile]=render(SceneRegistrationDefinitions,{id:'call-flat-template',profile});
}
graphs['flat:day']=render(SceneRegistrationDefinitions,{id:'call-flat-template',profile:'day'});
for(const key of Object.keys(graphs))if(!key.endsWith(':amber'))assert.equal(graphs[key],baseline.graphs[key],'Untouched graph '+key);
const meta={...baseline.meta,graphHashes:Object.fromEntries(Object.entries(graphs).map(([k,v])=>[k,sha(v)])),independentInk:{revision:'reader-independent-ink-r2',acceptance:acceptance.status,packageSha256:acceptance.packageSha256,files:acceptance.verifiedSourceManifest,changedGraphs:['dark:amber','flat:amber'],preservedGraphs:11,pinnedDependencies:['components/TubeOpticalFilters.tsx','lib/scene-registration.ts'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(donor,'pinned',p)))}))}};
const baselineJS=fs.readFileSync(path.join(donor,'../baseline-reader-optics-graphs-v14.js'),'utf8');
const scan=baselineJS.slice(baselineJS.indexOf('window.CallReaderScanlinesV14='));
const output={'reader-optics-graphs-v14.json':JSON.stringify({meta,graphs},null,2)+'\n','reader-optics-graphs-v14.js':'/* Reader 7bd527d optics + accepted independent-ink-r2 amber pass; scripts/import-reader-ink-r18.cjs. */\nwindow.CallReaderGraphsV14=Object.freeze('+JSON.stringify(graphs)+');\n'+scan};
for(const [name,data] of Object.entries(output)){
  const target=path.resolve(__dirname,'../public/myfile',name);
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),data,name);else fs.writeFileSync(target,data);
}
console.log(JSON.stringify({acceptedSources:5,changedGraphs:meta.independentInk.changedGraphs,preservedGraphs:11,mode:process.argv.includes('--check')?'check':'generate'}));
