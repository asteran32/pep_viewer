import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {JSDOM, ResourceLoader, VirtualConsole} from 'jsdom';
import {build} from 'esbuild';
import ExcelJS from 'exceljs';

const root = new URL('../', import.meta.url);
const index = JSON.parse(await readFile(new URL('data/index.json', root), 'utf8'));
const result = await build({entryPoints:[fileURLToPath(new URL('src/app.js', root))], bundle:true, write:false, format:'iife',
  define:{'import.meta.url':JSON.stringify('https://pep-viewer.test/research/src/app.js')}});
const code = result.outputFiles[0].text;
const html = (await readFile(new URL('index.html', root), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const waitFor = async (predicate, message = 'condition') => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve=>setTimeout(resolve,20)); }
  throw new Error('Timed out waiting for ' + message);
};

test('actual viewer: search, multi-filters, pagination, detail tabs, links, CSV and XLSX', async () => {
  const errors = [], requests = [], downloads = [];
  class Resources extends ResourceLoader {
    fetch(url) {
      if (url.endsWith('/vendor/exceljs.min.js')) return readFile(new URL('vendor/exceljs.min.js', root));
      return null;
    }
  }
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error=>errors.push(error.message));
  const dom = new JSDOM(html, {url:'https://pep-viewer.test/research/',runScripts:'dangerously',resources:new Resources(),pretendToBeVisual:true,virtualConsole});
  const w = dom.window, d = w.document;
  w.fetch = async input => {
    const url = new URL(input); requests.push(url.pathname);
    const relative = url.pathname.replace('/research/', '');
    return {ok:true,json:async()=>JSON.parse(await readFile(new URL(relative,root),'utf8'))};
  };
  w.CSS = {escape:input=>input};
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.matchMedia = ()=>({matches:true});
  w.HTMLElement.prototype.scrollIntoView = ()=>{};
  w.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  w.HTMLDialogElement.prototype.close = function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.Blob = Blob;
  w.URL.createObjectURL = blob => {downloads.push({blob});return 'blob:download';};
  w.URL.revokeObjectURL = ()=>{};
  const anchorClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function(){if(this.download) downloads.at(-1).filename=this.download;else anchorClick.call(this);};
  w.eval(code);
  const q = id=>d.getElementById(id);
  const change = (id, input) => {const el=q(id);el.value=input;el.dispatchEvent(new w.Event(el.tagName==='INPUT'&&el.type==='search'?'input':'change',{bubbles:true}));};
  const check = id => {q(id).checked=true;q(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  await waitFor(()=>q('jobs-count').textContent===String(index.jobs.length),'initial snapshot');
  assert.equal(d.querySelectorAll('#video-rows tr').length,20);
  assert.equal(q('page-number').textContent,`1 / ${Math.ceil(index.jobs.length/20)}`);
  q('next-page').click();
  assert.equal(q('page-number').textContent,`2 / ${Math.ceil(index.jobs.length/20)}`);

  change('title-search','항암');
  const searched = index.jobs.filter(j=>(j.metadata.title||j.video_id).includes('항암'));
  assert.equal(Number(q('result-count').querySelector('strong').textContent),searched.length);
  check('grades-E0');check('grades-E2');check('risks-high');
  const matches = searched.filter(j=>(j.grades.E0>0||j.grades.E2>0)&&j.risks.high>0);
  assert.ok(matches.length>0);
  assert.equal(Number(q('result-count').querySelector('strong').textContent),matches.length);
  q('download-button').click();
  await waitFor(()=>downloads.length===1&&downloads[0].filename,'CSV download');
  const csv = await downloads[0].blob.text();
  for(const row of matches) assert.ok(csv.includes(row.video_id));
  for(const row of index.jobs.filter(j=>!matches.includes(j))) assert.ok(!csv.includes('"'+row.id+'"'));
  assert.ok(downloads[0].filename.endsWith('.csv'));

  await waitFor(()=>!q('download-button').disabled,'CSV completed');
  change('download-format','xlsx');q('download-button').click();
  await waitFor(()=>downloads.length===2&&downloads[1].filename,'XLSX download');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await downloads[1].blob.arrayBuffer());
  assert.equal(book.getWorksheet('영상 목록').rowCount,matches.length+1);
  assert.equal(book.getWorksheet('주장 상세').rowCount,matches.reduce((sum,j)=>sum+j.claim_count,0)+1);
  assert.equal(book.getWorksheet('영상 목록').getCell('A2').value,matches[0].metadata.title);
  assert.equal(book.getWorksheet('영상 목록').views[0].ySplit,1);

  d.querySelector('#video-rows a.video-title').click();
  await waitFor(()=>q('detail-panel'),'detail loaded');
  assert.ok(q('result-dialog').open);
  const link = d.querySelector('.source-button');
  assert.equal(link.target,'_blank');
  assert.equal(link.href,`https://www.youtube.com/watch?v=${matches[0].video_id}`);
  assert.ok(link.textContent.includes('원본 영상 보기'));
  const first = d.querySelector('[data-claim]');
  first.click();assert.ok(d.querySelector('.claim-expanded').textContent.includes('AI 제안'));
  q('detail-tab-assessment').click();assert.ok(d.querySelector('.field-list'));
  q('detail-tab-transcript').click();assert.ok(d.querySelectorAll('.transcript-text').length>0);
  q('detail-tab-comments').click();assert.ok(q('detail-panel').textContent.trim().length>0);
  q('detail-tab-metadata').click();assert.ok(q('detail-panel').textContent.includes('영상 ID'));
  q('close-detail').click();assert.equal(q('result-dialog').open,false);

  q('reset-filters').click();check('grades-__none__');
  const noClaims = index.jobs.filter(j=>j.status==='completed'&&j.claim_count===0);
  assert.equal(Number(q('result-count').querySelector('strong').textContent),noClaims.length);
  assert.equal(d.querySelectorAll('#video-rows tr').length,20);
  change('download-format','csv');q('download-button').click();
  await waitFor(()=>downloads.length===3&&downloads[2].filename,'all filtered pages exported');
  const allPagesCsv=await downloads[2].blob.text();
  for(const row of noClaims) assert.ok(allPagesCsv.includes('"'+row.id+'"'));
  q('page-size').value='100';q('page-size').dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('#video-rows tr').length,noClaims.length);
  change('title-search','존재하지않는제목_테스트');
  assert.equal(q('empty-state').hidden,false);
  assert.equal(q('download-button').disabled,true);
  q('reset-filters').click();q('tab-collected').click();
  assert.equal(q('tab-collected').getAttribute('aria-selected'),'true');
  assert.equal(d.querySelectorAll('#video-rows tr').length,Math.min(100,index.collected.length));
  assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(requests.every(path=>path.startsWith('/research/data/')));
  dom.window.close();
});

test('XLSX preserves long strings, formula-like text, numeric zero, and absent values', async () => {
  const w = new JSDOM('<html><head></head><body></body></html>',{url:'https://pep-viewer.test/research/',runScripts:'dangerously'}).window;
  w.Blob = Blob; w.TextEncoder=TextEncoder; w.TextDecoder=TextDecoder;
  w.eval(await readFile(new URL('vendor/exceljs.min.js',root),'utf8'));
  let blob;
  w.URL.createObjectURL = input=>{blob=input;return 'blob:export';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=()=>{};
  const bundled = await build({entryPoints:[fileURLToPath(new URL('src/export.js',root))],bundle:true,write:false,format:'iife',globalName:'Exporter',define:{'import.meta.url':JSON.stringify('https://pep-viewer.test/research/src/export.js')}});
  w.eval(bundled.outputFiles[0].text);
  const long = '🦊'.repeat(18000) + '긴문장'.repeat(15000);
  const row = {id:'test',video_id:'abcdefghijk',metadata:{title:'=SUM(A1:A2)',view_count:0},status:'completed',claim_count:1,grades:{E2:1},risks:{low:1}};
  await w.Exporter.exportRows([row],'xlsx',async()=>({...row,claims:[{id:'claim',suggested:{claim_text:long},occurrences:[],review_status:'pending_manual_review',validation_report:{warnings:[]}}]}));
  const workbook = new ExcelJS.Workbook();await workbook.xlsx.load(await blob.arrayBuffer());
  const videos=workbook.getWorksheet('영상 목록'),claims=workbook.getWorksheet('주장 상세');
  assert.equal(videos.getCell('A2').value,'=SUM(A1:A2)');assert.equal(videos.getCell('A2').type,ExcelJS.ValueType.String);
  assert.equal(videos.getCell('F2').value,0);
  assert.equal(videos.getCell('G2').value,'');
  let full='';claims.getRow(1).eachCell((cell,i)=>{if(String(cell.value).startsWith('AI 제안 · 원문 인용'))full+=claims.getRow(2).getCell(i).value;});
  assert.equal(full,long);
  w.close();
});
