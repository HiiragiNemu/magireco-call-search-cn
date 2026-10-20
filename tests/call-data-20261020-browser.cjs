// Isolated browser regression. Pass a deployed base URL to repeat against production.
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.CALL_DATA_EVIDENCE_DIR || path.join(root, '_sources/call-update-20261020/verification'));
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const visibleNames = page => page.locator('label.girlbox:visible input.MagicalChk').evaluateAll(ns => ns.map(n => n.id));
let server;
(async () => {
  fs.mkdirSync(out, {recursive:true});
  let base = process.argv[2];
  if (!base) {
    server = http.createServer((req,res) => {
      let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (rel === '/') rel = '/index.html';
      if (!path.extname(rel)) rel += '.html';
      const file = path.resolve(root, 'public', '.' + rel);
      if (!file.startsWith(path.join(root,'public') + path.sep)) {res.writeHead(403); return res.end();}
      fs.readFile(file, (e,b) => {res.writeHead(e?404:200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});res.end(e?'not found':b);});
    });
    await new Promise(r => server.listen(0,'127.0.0.1',r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const results=[];
  try {
    for (const viewport of [{width:1440,height:900},{width:412,height:915}]) {
      const context = await browser.newContext({viewport});
      await context.addInitScript(() => {localStorage.setItem('magireco-call-theme-v2','light');sessionStorage.setItem('magireco-call-magius-boot-v1','1');});
      const page = await context.newPage(), errors=[];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(base+'/', {waitUntil:'load', timeout:90000});
      await page.waitForFunction(() => document.documentElement.dataset.callBootReleased==='true', null, {timeout:45000});
      assert.equal(await page.locator('input.MagicalChk').count(),195);
      await page.evaluate(() => {for(const d of document.querySelectorAll('details'))d.open=true;});
      for (const [query,jp] of [['索拉娜的母亲','そらなの母'],['Sorana no Haha','そらなの母'],['そらなのはは','そらなの母'],['莉娜','リナ'],['Rina','リナ'],['リナ','リナ']]) {
        await page.locator('#ndownword1').fill(query);
        assert.ok((await visibleNames(page)).includes(jp), query);
      }
      await page.locator('#ndownword1').fill('リナ');
      const both=await visibleNames(page); assert.ok(both.includes('リナ')&&both.includes('人見リナ'));
      for (const [query,jp] of [['索拉娜的母亲','そらなの母'],['莉娜','リナ']]) {
        await page.locator('#ndownword1').fill(query);
        await page.locator(`label.girlbox:has(input[id="${jp}"])`).click();
        assert.equal(await page.locator(`input[id="${jp}"]`).isChecked(),true);
      }
      await page.locator('#ndownword1').fill('');
      await page.evaluate(() => {
        document.querySelectorAll('input.MagicalChk').forEach(n=>n.checked=['そらなの母','リナ','凪星そらな','リリー・キャンディー'].includes(n.id));
        drawNet_Table();
      });
      await page.waitForFunction(() => document.querySelector('.relationship-table-stage')?.offsetHeight>1);
      const table=await page.locator('.relationship-table-stage').innerText();
      for (const word of ['索拉娜的母亲','莉娜','ママ','リナ母さん','リナちゃん']) assert.ok(table.includes(word),word);
      assert.ok(await page.locator('#mynetwork canvas').count());
      await page.evaluate(() => {displayHeightChart('selected','school');});
      assert.ok((await page.locator('#heightChartContainer').innerText()).includes('当前范围内没有可用的身高数据'));
      await page.evaluate(() => {displayHeightChart('global','school');});
      assert.ok((await page.locator('#heightChartContainer').innerText()).includes('海平线国际高等学校'));
      for (const [school,names] of [['宝崎市立第一中学校',['環いろは','くろ']],['シー・ホライズン国際高等学校',['凪星そらな']]]) {
        await page.evaluate(school => {
          document.querySelectorAll('input.at_attribute').forEach(n=>n.checked=n.value===school);
          magicalGirlAttributeSearch('call');
        }, school);
        assert.deepEqual((await visibleNames(page)).sort(),names.sort());
      }
      await page.evaluate(() => {document.querySelectorAll('input.at_attribute').forEach(n=>n.checked=false);magicalGirlAttributeSearch('call');});
      await page.locator('#ndownword1').fill('索拉娜 莉娜 莉莉');
      await page.locator('input[id="そらなの母"]').evaluate(n=>n.parentElement.scrollIntoView({block:'center',behavior:'instant'}));
      for(const c of ['索拉娜的母亲','莉娜']) {
        const response=await context.request.get(base+'/img/png/'+encodeURIComponent(c)+'.png'); assert.equal(response.status(),200);
      }
      await page.screenshot({path:path.join(out,`${process.argv[2]?'production':'local'}-${viewport.width}.png`)});
      for (const route of ['story.html','attendance.html']) {
        await page.goto(base+'/'+route,{waitUntil:'load',timeout:90000});
        await page.waitForFunction(() => document.documentElement.dataset.callBootReleased==='true',null,{timeout:45000});
        await page.waitForFunction(() => document.querySelector('.suite-character-card[data-jp="リナ"]'));
        for (const jp of ['そらなの母','リナ','人見リナ']) assert.equal(await page.locator(`.suite-character-card[data-jp="${jp}"]`).count(),1);
        assert.ok((await page.locator('label:has(input[data-attribute-v7][value="シー・ホライズン国際高等学校"])').textContent()).includes('海平线国际高等学校'));
      }
      assert.deepEqual(errors,[]);
      const item={width:viewport.width,selectors:195,searchLanguages:true,identitySeparation:true,clickSelection:true,relationTable:true,schoolFilters:true,heightAxisChinese:true,portraits:true,sharedRosters:true,pageErrors:0};
      results.push(item);console.log(JSON.stringify(item));await context.close();
    }
    fs.writeFileSync(path.join(out,process.argv[2]?'production-browser.json':'local-browser.json'), JSON.stringify({base,pass:true,results},null,2)+'\n');
  } finally {await browser.close(); if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);if(server)server.close();process.exitCode=1;});
