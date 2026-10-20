// Full browser QA without a local HTTP server. Route only the viewer's static files.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = 'https://pep-viewer.test/research/';
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};

(async()=>{
  const snapshot = JSON.parse(await fs.readFile(path.join(root,'data/index.json'),'utf8'));
  const artifacts = path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url = route.request().url();
    if (!url.startsWith(origin)) return route.abort();
    let relative=decodeURIComponent(url.slice(origin.length).split(/[?#]/)[0]) || 'index.html';
    const target = path.resolve(root,relative);
    if (!target.startsWith(root+path.sep)) return route.abort();
    try {await route.fulfill({body:await fs.readFile(target),contentType:mime[path.extname(target)]||'application/octet-stream'});}
    catch {await route.fulfill({status:404,body:'Not found'});}
  });
  try {
    await page.goto(origin);
    await page.locator('#video-rows tr').first().waitFor();
    assert.equal(await page.locator('#video-rows tr').count(),20);
    await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
    await page.getByLabel('영상 제목 검색').fill('항암');
    await page.locator('#filter-grades summary').click();
    await page.locator('#grades-E0').check();await page.locator('#grades-E2').check();
    await page.locator('#filter-risks summary').click();await page.locator('#risks-high').check();
    await page.getByRole('heading',{name:'영상 분석 데이터'}).click();
    const matching=snapshot.jobs.filter(j=>(j.metadata.title||'').includes('항암')&&(j.grades.E0>0||j.grades.E2>0)&&j.risks.high>0);
    assert.ok(matching.length>0);
    assert.equal(Number(await page.locator('#result-count strong').innerText()),matching.length);
    for (const format of ['csv','xlsx']) {
      await page.locator('#download-format').selectOption(format);
      const waiting=page.waitForEvent('download');await page.locator('#download-button').click();
      const download=await waiting;await download.saveAs(path.join(artifacts,'filtered.'+format));
      assert.equal(await download.failure(),null);
    }
    await page.locator('#video-rows a.video-title').first().click();
    await page.getByRole('link',{name:'원본 영상 보기'}).waitFor();
    assert.equal(await page.locator('.source-button').getAttribute('href'),'https://www.youtube.com/watch?v='+matching[0].video_id);
    await page.locator('[data-claim]').first().click();
    await page.screenshot({path:path.join(artifacts,'detail.png'),fullPage:true});
    for (const tab of ['assessment','transcript','comments','metadata']) await page.locator('#detail-tab-'+tab).click();
    await page.getByRole('button',{name:'상세 결과 닫기'}).click();
    await page.locator('#reset-filters').click();
    await page.locator('#filter-grades summary').click();await page.locator('#grades-__none__').check();
    assert.equal(Number(await page.locator('#result-count strong').innerText()),snapshot.jobs.filter(j=>j.status==='completed'&&j.claim_count===0).length);
    await page.locator('#reset-filters').click();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#video-rows a.video-title').first().click();
    await page.getByRole('link',{name:'원본 영상 보기'}).waitFor();
    await page.screenshot({path:path.join(artifacts,'mobile-detail.png'),fullPage:true});
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({passed:true,filtered:matching.length,artifacts}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
