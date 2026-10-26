// Browser checks for the published analysis, served at a GitHub Pages-style subpath.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.svg':'image/svg+xml','.png':'image/png','.md':'text/markdown; charset=utf-8',
  '.csv':'text/csv; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};

(async () => {
  const artifacts = path.join(root, 'artifacts', 'analysis');
  await fs.mkdir(artifacts, {recursive:true});
  const aggregate = JSON.parse(await fs.readFile(path.join(root,'assets/analysis/summary.json'),'utf8'));
  const rq1 = JSON.parse(await fs.readFile(path.join(root,'assets/analysis/rq1_claims.json'),'utf8'));
  const channelAudit = JSON.parse(await fs.readFile(path.join(root,'assets/analysis/channel_analysis.json'),'utf8'));
  const errors = [], missing = [];
  // A real local HTTP response also exercises native anchor downloads (mock routes cannot).
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url,'http://127.0.0.1').pathname;
    if (!pathname.startsWith('/pep_viewer/')) { response.writeHead(404); response.end(); return; }
    const relative = decodeURIComponent(pathname.slice('/pep_viewer/'.length)) || 'index.html';
    const target = path.resolve(root,relative);
    if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try { const body = await fs.readFile(target); response.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream'}); response.end(body); }
    catch { missing.push(relative); response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}/pep_viewer/`;
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    const route = async context => context.route('**/*', request => request.request().url().startsWith(origin) ? request.continue() : request.abort());
    const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'});
    await route(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const backToAnalysis = async () => {
      await page.locator("#rq1-back").click();
      await page.waitForFunction(()=>document.documentElement.classList.contains('analysis-enhanced'));
    };
    await page.goto(origin);
    assert.deepEqual(await page.locator('.header-nav a').allTextContents(),['공개 데이터','코드북','분석']);
    await page.locator('.header-nav').getByRole('link',{name:'분석',exact:true}).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('analysis-enhanced'));
    assert.equal(await page.locator('.header-nav [aria-current="page"]').textContent(),'분석');
    assert.deepEqual(await page.locator('.cohort-metric strong').allTextContents(),['309','49','23']);
    assert.equal(await page.locator('#methods, .sensitivity-table').count(),0);
    assert.equal(await page.getByRole('heading',{name:'분모가 바뀌면 결과는 어떻게 달라지는가?',exact:true}).count(),0);
    assert.equal(await page.locator('.analysis-toc a[href="#methods"]').count(),0);
    assert.equal(await page.locator('.analysis-toc a[href="#report"]').textContent(),'04보고서 전문');
    // Native downloads must resolve under a GitHub Pages subpath and preserve every byte.
    assert.equal(await page.locator('.analysis-data-downloads a[download]').count(),1);
    assert.equal(await page.locator('a[download][href$=".csv"]').count(),0);
    const dataDownloads = [
      ['analysis_data.xlsx','.analysis-data-downloads'],
      ['claims.xlsx','#rq1 > .section-heading-row'],
      ['channel_summary.xlsx','#rq3 .channel-analysis-heading'],
      ['type_summary.xlsx','#rq3 > .section-heading-row'],
    ];
    for (const [name, section] of dataDownloads) {
      const event = page.waitForEvent('download');
      await page.locator(`${section} a[href$="/${name}"]`).click();
      const file = await event;
      assert.equal(file.suggestedFilename(),name);
      const saved = path.join(artifacts,name);
      await file.saveAs(saved);
      assert.equal(await file.failure(),null);
      assert.deepEqual(await fs.readFile(saved),await fs.readFile(path.join(root,'assets/analysis',name)));
    }
    await page.locator('#rq1 > .section-heading-row').screenshot({path:path.join(artifacts,'rq1-download-heading.png')});
    await page.locator('#rq3 > .section-heading-row').screenshot({path:path.join(artifacts,'rq3-download-heading.png')});
    await page.locator('.channel-analysis-heading').screenshot({path:path.join(artifacts,'channel-download-heading.png')});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(artifacts,'desktop-overview.png')});

    // The rendered bars preserve actual numerators and denominators, including multi-label outcomes.
    for (const [chart,field] of [['intervention-chart','intervention_type'],['outcome-chart','claimed_outcome'],['theme-chart','misinformation_theme']]) {
      const rows = await page.locator(`#${chart} .bar-row`).evaluateAll(els=>els.map(el=>({...el.dataset})));
      for (const row of rows) {
        const group = aggregate.groupings[field][row.code];
        assert.equal(Number(row.count),chart==='theme-chart'?group.high_n:group.n);
        assert.equal(Number(row.denominator),chart==='theme-chart'?group.n:aggregate.primary.n);
      }
    }
    assert.equal(await page.locator('#intervention-chart .bar-row:visible').count(),8);
    await page.getByRole('tab',{name:'주장 결과',exact:true}).click();
    assert.equal(await page.locator('#outcome-chart .bar-row:visible').count(),8);
    await page.locator('[data-expand-chart="outcome-chart"]').click();
    assert.equal(await page.locator('#outcome-chart .bar-row:visible').count(),17);
    await page.locator('[data-expand-chart="outcome-chart"]').click();
    assert.equal(await page.locator('#outcome-chart .bar-row:visible').count(),8);
    await page.getByRole('tab',{name:'주장 결과',exact:true}).focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#tab-intervention').getAttribute('aria-selected'),'true');
    await page.locator('[data-expand-chart="intervention-chart"]').click();
    assert.equal(await page.locator('#intervention-chart .bar-row:visible').count(),16);
    await page.locator('[data-expand-chart="intervention-chart"]').click();

    // Every RQ1 bar links to the exact category, including collapsed rare types.
    for (const [chart,field] of [['intervention-chart','intervention_type'],['outcome-chart','claimed_outcome']]) {
      const bars = await page.locator(`#${chart} .bar-row`).evaluateAll(rows=>rows.map(row=>({code:row.dataset.code,count:Number(row.dataset.count),href:row.querySelector('a').href})));
      for (const bar of bars) {
        const target = new URL(bar.href);
        assert.equal(target.pathname,'/pep_viewer/rq1.html');
        assert.equal(target.searchParams.get('field'),field);
        assert.equal(target.searchParams.get('code'),bar.code);
        assert.equal(rq1.claims.filter(claim=>claim[field].includes(bar.code)).length,bar.count);
      }
    }
    await page.locator('#intervention-chart [data-code="supplement"] a').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('#rq1-title').textContent(),'보충제');
    assert.match(await page.locator('#rq1-description').textContent(),/213건 · 37개 영상.*68.93%/);
    assert.equal(await page.locator('.rq1-claim').count(),20);
    await page.locator('.rq1-claim summary').first().focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('.rq1-claim[open] blockquote').textContent());
    assert.ok(await page.locator('.rq1-claim[open] .rq1-detail-fields').textContent());
    assert.match(await page.locator('.rq1-claim[open] .rq1-source-links a').first().getAttribute('href'),/^https:\/\/www.youtube.com\/watch\?v=/);
    await page.screenshot({path:path.join(artifacts,'rq1-supplement-desktop.png')});
    const ids = new Set();
    for (let i=0;i<11;i++) {
      for (const id of await page.locator('.rq1-claim').evaluateAll(rows=>rows.map(row=>row.dataset.claimId))) {
        assert.ok(!ids.has(id),'duplicate claim across pages');
        ids.add(id);
      }
      if (i<10) await page.locator('#rq1-next').click();
    }
    assert.deepEqual([...ids].sort(),rq1.claims.filter(c=>c.intervention_type.includes('supplement')).map(c=>c.claim_id).sort());
    assert.equal(await page.locator('.rq1-claim').count(),13);
    assert.equal(await page.locator('#rq1-next').isDisabled(),true);
    await page.locator('#claim-evidence').selectOption('E0');
    assert.equal(await page.locator('.rq1-claim').count(),13);
    assert.equal(await page.locator('#rq1-page-number').textContent(),'1 / 1');
    await page.locator('#claim-search').fill('일치하지 않는 검색어 987654321');
    assert.equal(await page.locator('#rq1-empty').isVisible(),true);
    await page.locator('#rq1-reset').click();
    assert.equal(await page.locator('.rq1-claim').count(),20);
    for (const width of [768,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.locator('.rq1-claim summary').first().click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`RQ1 detail overflow at ${width}`);
      await page.screenshot({path:path.join(artifacts,`rq1-detail-${width}.png`)});
      await page.locator('.rq1-claim summary').first().click();
    }
    await page.setViewportSize({width:1440,height:1000});
    await backToAnalysis();
    await page.getByRole('tab',{name:'주장 결과',exact:true}).click();
    await page.locator('#outcome-chart .bar-link').first().click();
    await page.waitForFunction(()=>document.getElementById('rq1-title').textContent==='질환·증상 관리');
    assert.match(await page.locator('#rq1-description').textContent(),/85건/);
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('rq1-title').textContent==='질환·증상 관리');
    await backToAnalysis();
    await page.waitForFunction(()=>document.getElementById('tab-outcome').getAttribute('aria-selected')==='true');
    assert.equal(await page.locator('#tab-outcome').getAttribute('aria-selected'),'true');
    await page.getByRole('tab',{name:'영양 개입',exact:true}).click();
    await page.locator('[data-expand-chart="intervention-chart"]').click();
    await page.locator('#intervention-chart [data-code="raw_diet"] a').click();
    await page.waitForFunction(()=>document.getElementById('rq1-title').textContent==='생식');
    assert.equal(await page.locator('.rq1-claim').count(),1);
    assert.equal(await page.locator('#rq1-next').isDisabled(),true);
    await page.goto(origin+'rq1.html?field=invalid&code=supplement');
    await page.waitForFunction(()=>document.getElementById('rq1-title').textContent==='분류를 찾을 수 없습니다');
    assert.equal(await page.locator('.rq1-claim').count(),0);
    await page.route('**/rq1_claims.json',route=>route.fulfill({status:503,body:'Unavailable'}));
    await page.goto(origin+'rq1.html?field=intervention_type&code=supplement');
    await page.locator('#rq1-retry').waitFor({state:'visible'});
    await page.unroute('**/rq1_claims.json');
    await page.locator('#rq1-retry').click();
    await page.waitForFunction(()=>document.getElementById('rq1-title').textContent==='보충제');
    assert.equal(await page.locator('.rq1-claim').count(),20);
    await backToAnalysis();

    await page.getByRole('button',{name:'등급 내 위험 비율',exact:true}).click();
    assert.equal(await page.locator('#evidence-chart').getAttribute('data-mode'),'percent');
    const widths = await page.locator('.evidence-stack').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));
    assert.ok(Math.max(...widths)-Math.min(...widths) < 1);
    assert.match(await page.locator('.evidence-row[data-code="E2"] .evidence-breakdown').textContent(),/낮음 52개.*중간 55개.*높음 2개/);
    // Every stacked segment targets exactly its grade × risk intersection.
    const evidenceLinks = await page.locator('#evidence-chart .risk-segment').evaluateAll(links=>links.map(link=>({
      code:link.closest('.evidence-row').dataset.code,risk:link.dataset.risk,count:Number(link.dataset.count),href:link.href
    })));
    for (const link of evidenceLinks) {
      const target = new URL(link.href);
      assert.equal(target.pathname,'/pep_viewer/claims.html');
      assert.equal(target.searchParams.get('field'),'evidence');
      assert.equal(target.searchParams.get('code'),link.code);
      assert.equal(target.searchParams.get('risk'),link.risk);
      assert.equal(link.count,aggregate.evidence_risk[link.code][link.risk]);
      assert.equal(link.count,rq1.claims.filter(claim=>claim.evidence===link.code&&claim.risk_level===link.risk).length);
    }
    // Grade labels open the whole grade; even a two-claim segment is keyboard reachable.
    await page.locator('.evidence-row[data-code="E3"] .evidence-label').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-description').textContent(),/107건/);
    assert.ok((await page.locator('.rq1-grade').allTextContents()).every(text=>text==='E3'));
    assert.equal(await page.locator('#claim-evidence-filter').isVisible(),false);
    await backToAnalysis();
    assert.equal(await page.locator('#evidence-chart').getAttribute('data-mode'),'percent');
    await page.locator('.evidence-row[data-code="E2"] .risk-segment.high').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-category').textContent(),/RQ2/);
    assert.match(await page.locator('#rq1-description').textContent(),/높음 주장 2건.*E2 등급 전체 109건 중 1.83%/);
    assert.equal(await page.locator('.rq1-claim').count(),2);
    assert.deepEqual((await page.locator('.rq1-claim').evaluateAll(rows=>rows.map(row=>row.dataset.claimId))).sort(),
      rq1.claims.filter(claim=>claim.evidence==='E2'&&claim.risk_level==='high').map(claim=>claim.claim_id).sort());
    await page.locator('.rq1-claim summary').first().click();
    assert.ok(await page.locator('.rq1-claim[open] blockquote').textContent());
    await page.screenshot({path:path.join(artifacts,'rq2-e2-high-detail.png')});
    await page.locator('#rq1-scope-link').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-description').textContent(),/109건/);
    assert.equal(await page.locator('#claim-risk').inputValue(),'');
    await backToAnalysis();
    await page.locator('.evidence-row[data-code="E3"] .risk-segment.high').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-description').textContent(),/높음 주장 40건.*107건 중 37.38%/);
    await page.locator('#claim-risk').selectOption('low');
    assert.equal(await page.locator('.rq1-claim').count(),5);
    assert.equal(new URL(page.url()).searchParams.get('risk'),'low');
    await page.locator('#rq1-reset').click();
    assert.equal(await page.locator('#claim-risk').inputValue(),'high');
    assert.equal(new URL(page.url()).searchParams.get('risk'),'high');
    await page.locator('#claim-search').fill('없는 검색어 987654321');
    assert.equal(await page.locator('#rq1-empty').isVisible(),true);
    await page.locator('#rq1-reset').click();
    await backToAnalysis();
    await page.getByRole('button',{name:'주장 수',exact:true}).click();
    await page.locator('#rq2').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'desktop-evidence.png')});

    const themes = await page.locator('#theme-chart .bar-row').evaluateAll(rows=>rows.map(row=>({
      code:row.dataset.code,count:Number(row.dataset.count),total:Number(row.dataset.denominator),href:row.querySelector('a').href
    })));
    assert.equal(themes.length,9);
    for (const theme of themes) {
      const target = new URL(theme.href);
      assert.equal(target.searchParams.get('field'),'misinformation_theme');
      assert.equal(target.searchParams.get('risk'),'high');
      const expected = rq1.claims.filter(claim=>claim.misinformation_theme.includes(theme.code)&&claim.risk_level==='high');
      assert.equal(expected.length,theme.count);
      await page.locator(`#theme-chart [data-code="${theme.code}"] a`).click();
      await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
      assert.match(await page.locator('#rq1-category').textContent(),/RQ3/);
      assert.ok((await page.locator('#rq1-scope-note').textContent()).includes(`${theme.count}/${theme.total}`));
      assert.equal(await page.locator('.rq1-claim').count(),Math.min(expected.length,20));
      assert.deepEqual(await page.locator('.rq1-claim').evaluateAll(rows=>rows.map(row=>row.dataset.claimId)),expected.slice(0,20).map(claim=>claim.claim_id));
      if (theme.count===0) {
        assert.equal(await page.locator('#rq1-empty').isVisible(),true);
        assert.equal(await page.locator('#rq1-pagination').isVisible(),false);
        await page.locator('#rq1-scope-link').click();
        await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('.rq1-claim').count(),11);
      }
      await backToAnalysis();
    }
    await page.locator('#theme-chart [data-code="supplement_as_anti_cancer_therapy"] a').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-description').textContent(),/높음 주장 44건.*전체 108건 중 40.74%/);
    const highIds = [];
    for(let i=0;i<3;i++) {
      highIds.push(...await page.locator('.rq1-claim').evaluateAll(rows=>rows.map(row=>row.dataset.claimId)));
      if(i<2) await page.locator('#rq1-next').click();
    }
    assert.deepEqual(highIds,rq1.claims.filter(claim=>claim.misinformation_theme.includes('supplement_as_anti_cancer_therapy')&&claim.risk_level==='high').map(claim=>claim.claim_id));
    await page.locator('#rq1-scope-link').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-description').textContent(),/108건/);
    await page.locator('#rq1-scope-link').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    await page.locator('.rq1-claim summary').first().click();
    assert.match(await page.locator('.rq1-claim[open] .rq1-selected-tag').textContent(),/보충제를 항암치료로 제시/);
    await page.screenshot({path:path.join(artifacts,'rq3-supplement-high-detail.png')});
    for(const width of [768,390,320]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`RQ3 detail overflow at ${width}`);
      await page.screenshot({path:path.join(artifacts,`rq3-detail-${width}.png`)});
    }
    await backToAnalysis();
    for(const width of [768,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.locator('#rq2').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`RQ2 chart overflow at ${width}`);
      await page.screenshot({path:path.join(artifacts,`rq2-chart-${width}.png`)});
      await page.locator('.evidence-row[data-code="E3"] .risk-segment.high').click();
      await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
      await page.locator('.rq1-claim summary').first().click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`RQ2 detail overflow at ${width}`);
      await page.screenshot({path:path.join(artifacts,`rq2-detail-${width}.png`)});
      await backToAnalysis();
    }
    await page.setViewportSize({width:1440,height:1000});

    await page.locator('.analysis-toc a[href="#rq3"]').click();
    await page.waitForFunction(()=>document.querySelector('.analysis-toc a[href="#rq3"]').getAttribute('aria-current')==='location');
    await page.screenshot({path:path.join(artifacts,'desktop-risk.png')});
    const openFigure = page.locator('#rq3 .figure-open');
    await openFigure.click();
    await page.waitForFunction(()=>document.getElementById('figure-image').naturalWidth>0);
    assert.equal(await page.locator('#figure-dialog').evaluate(el=>el.open),true);
    await page.getByRole('button',{name:'원본 크기',exact:true}).click();
    assert.ok(await page.locator('#figure-viewport').evaluate(el=>el.scrollWidth>el.clientWidth));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#figure-dialog').evaluate(el=>el.open),false);
    assert.equal(await openFigure.evaluate(el=>document.activeElement===el),true);

    // The channel audit follows the original concentration summary in RQ3.
    assert.equal(await page.locator('#channel-analysis').evaluate(el=>el.previousElementSibling.classList.contains('concentration')),true);
    assert.deepEqual(await page.locator('#channel-analysis .channel-section h4').allTextContents(),
      ['유형 내 위험 분포','각 위험도 집합의 채널 구성','위험도별 집중도','채널별 결과']);
    assert.equal(await page.locator('.channel-distribution>li').count(),5);
    assert.equal(await page.locator('.channel-composition-table tbody tr').count(),5);
    assert.equal(await page.locator('.channel-concentration-chart>li').count(),3);
    assert.equal(await page.locator('[data-channel-row]:visible').count(),23);
    assert.equal(await page.locator('#channel-type-filter option[value="pharmacist"]').count(),0);
    for (const [code, group] of Object.entries(channelAudit.types)) {
      const cells = await page.locator(`.channel-composition-table tr[data-channel-type="${code}"] td`).evaluateAll(els=>els.map(el=>({...el.dataset})));
      for (const cell of cells) {
        assert.equal(Number(cell.count),group[cell.risk]);
        assert.equal(Number(cell.total),channelAudit.primary[cell.risk]);
      }
    }
    for (const channel of channelAudit.channels) {
      const row = page.locator(`[data-channel-row="${channel.channel_label}"]`);
      assert.equal(await row.getAttribute('data-high'),String(channel.high));
      assert.equal(await row.getAttribute('data-claims'),String(channel.claims));
      assert.equal(await row.getAttribute('data-type'),channel.channel_type);
    }
    await page.locator('#channel-type-distribution').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'channel-distribution-desktop.png')});
    await page.locator('#channel-composition').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'channel-composition-desktop.png')});
    await page.locator('#channel-concentration').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'channel-concentration-desktop.png')});
    await page.locator('#channel-search').fill('C01');
    assert.equal(await page.locator('[data-channel-row]:visible').count(),1);
    assert.match(await page.locator('#channel-results-status').textContent(),/1개 채널 · 101개 주장/);
    await page.locator('[data-channel-evidence="C01"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#channel-evidence-C01').isVisible(),true);
    assert.match(await page.locator('#channel-evidence-C01').textContent(),/전문자격 미확인/);
    await page.locator('#channel-reset').click();
    await page.locator('#channel-type-filter').selectOption('media_education');
    assert.equal(await page.locator('[data-channel-row]:visible').count(),2);
    await page.locator('#channel-search').fill('없는 채널 987654321');
    assert.equal(await page.locator('#channel-empty').isVisible(),true);
    await page.locator('#channel-reset').click();
    await page.locator('#channel-sort').selectOption('rate');
    assert.equal(await page.locator('[data-channel-row]:visible').first().getAttribute('data-channel-row'),'C19');
    await page.locator('#channel-sort').selectOption('code');
    assert.equal(await page.locator('[data-channel-row]:visible').first().getAttribute('data-channel-row'),'C01');
    await page.locator('#channel-reset').click();
    await page.locator('[data-channel-evidence="C18"]').click();
    assert.match(await page.locator('#channel-evidence-C18').textContent(),/Trina Hazzah/);
    await page.locator('#channel-results').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'channel-results-desktop.png')});

    // New bars and table cells preserve both the selected claims and the chart's denominator.
    await page.locator('.channel-distribution [data-channel-type="caregiver_creator"] .channel-segment.legend-high').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-title').textContent(),/보호자 경험/);
    assert.match(await page.locator('#rq1-description').textContent(),/높음 주장 46건.*110건 중 41.82%/);
    assert.equal(await page.locator('#rq1-back').getAttribute('href'),'./analysis.html#channel-type-distribution');
    await backToAnalysis();
    await page.locator('.channel-composition-table [data-channel-type="caregiver_creator"] td[data-risk="high"] a').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-scope-note').textContent(),/62건 중 46건 \(74.19%\)/);
    await backToAnalysis();
    await page.locator('.channel-concentration-chart [data-risk="high"] .channel-concentration-bar').click();
    await page.waitForFunction(()=>document.getElementById('claim-results').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#rq1-title').textContent(),/세상의 모든 고양이/);
    assert.match(await page.locator('#rq1-description').textContent(),/높음 주장 45건/);
    assert.match(await page.locator('#rq1-scope-note').textContent(),/62건 중 45건 \(72.58%\)/);
    await backToAnalysis();
    await page.locator('.channel-leading [data-channel-jump="C01"]').first().click();
    assert.equal(await page.locator('#channel-evidence-C01').isVisible(),true);
    assert.equal(await page.locator('#channel-evidence-C01').evaluate(el=>el.previousElementSibling.id),'channel-C01');
    for (const width of [768,390,320]) {
      await page.setViewportSize({width,height:900});
      for (const section of ['channel-type-distribution','channel-composition','channel-concentration','channel-results']) {
        await page.locator('#'+section).scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${section} overflow at ${width}`);
        await page.screenshot({path:path.join(artifacts,`${section}-${width}.png`)});
      }
      assert.ok(await page.locator('.channel-results-scroll').evaluate(el=>innerWidth>760||el.scrollWidth>el.clientWidth));
      if (width <= 650) {
        assert.equal(await page.locator('#channel-C01 .channel-mobile-risk').isVisible(),true);
        assert.match(await page.locator('#channel-C01 .channel-mobile-risk').textContent(),/45개.*44.55%/);
      }
    }
    await page.setViewportSize({width:1440,height:1000});

    await page.locator('#rq1 [data-report-link]').click();
    assert.equal(await page.locator('#full-report').evaluate(el=>el.open),true);
    assert.equal(await page.locator('.report-document table').count(),20);
    assert.equal(await page.locator('.report-document img').count(),3);
    const localLinks = await page.locator('a[href]').evaluateAll(els=>els.map(el=>el.getAttribute('href')).filter(href=>!href.startsWith('#')));
    for (const href of localLinks) {
      const url = new URL(href,origin+'analysis.html');
      if (!url.href.startsWith(origin)) { assert.equal(url.protocol,'https:',url.href); continue; }
      await fs.access(path.join(root,decodeURIComponent(url.pathname.replace('/pep_viewer/','')) || 'index.html'));
    }
    const downloadEvent = page.waitForEvent('download');
    await page.locator('.analysis-download').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(),'RQ1-3_analysis.md');
    await download.saveAs(path.join(artifacts,'report.md'));
    assert.equal(await download.failure(),null);
    const downloaded = await fs.readFile(path.join(artifacts,'report.md'),'utf8');
    assert.ok(downloaded.includes('213/309 (68.93%)'));
    assert.ok(!downloaded.includes('/Users/'));
    await page.locator('#full-report > summary').click();

    for (const width of [768,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>scrollTo(0,0));
      for (const link of await page.locator('.analysis-data-downloads a').all()) assert.ok(await link.isVisible());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
      await page.screenshot({path:path.join(artifacts,`overview-${width}.png`)});
      await page.locator('.analysis-toc a[href="#rq3"]').click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(artifacts,`risk-${width}.png`)});
      await page.locator('#rq3 .figure-open').click();
      await page.getByRole('button',{name:'원본 크기',exact:true}).click();
      await page.getByRole('button',{name:'그래프 닫기',exact:true}).click();
      await page.locator('#full-report > summary').click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`expanded report overflow at ${width}`);
      await page.locator('#full-report > summary').click();
    }
    for (const file of ['index.html','codebook.html']) {
      await page.goto(origin+file);
      assert.deepEqual(await page.locator('.header-nav a').allTextContents(),['공개 데이터','코드북','분석']);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${file} header overflow`);
    }
    const plainContext = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    await route(plainContext);
    const plain = await plainContext.newPage();
    await plain.goto(origin+'analysis.html');
    assert.equal(await plain.locator('a[download][href$=".xlsx"]:visible').count(),4);
    const plainDownload = plain.waitForEvent('download');
    await plain.locator('.analysis-data-downloads a[href$="/analysis_data.xlsx"]').click();
    const plainFile = await plainDownload;
    assert.equal(plainFile.suggestedFilename(),'analysis_data.xlsx');
    assert.equal(await plainFile.failure(),null);
    assert.equal(await plain.locator('#intervention-chart .bar-row:visible').count(),8);
    assert.equal(await plain.locator('[data-channel-row]:visible').count(),23);
    assert.equal(await plain.locator('.channel-distribution>li').count(),5);
    await plain.locator('#full-report > summary').click();
    assert.equal(await plain.locator('.report-document table').count(),20);
    assert.ok(await plain.locator('.analysis-download').isVisible());
    assert.deepEqual(errors,[]);
    assert.deepEqual(missing,[]);
    console.log(JSON.stringify({passed:true,viewports:[1440,768,390,320],charts:3,reportTables:20,keyboard:true,
      noJavaScript:true,subpath:true,downloads:true,rq1Categories:33,rq1Claims:309,supplementClaims:ids.size,
      rq2Grades:6,rq2RiskSegments:evidenceLinks.length,rq3Themes:themes.length,rq3HighClaims:highIds.length,
      channelTypes:5,channelRows:23,channelSections:4,artifacts}));
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
