import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRows, grades, csvText, claimTable, youtubeUrl} from '../src/model.js';

const rows = [
  {id:'a',video_id:'abcdefghijk',metadata:{title:'강아지 항암 식단',view_count:42},status:'completed',claim_count:2,grades:{E0:1,E3:1},risks:{high:1,low:1},created_at:'2026-10-20'},
  {id:'b',video_id:'bcdefghijkl',metadata:{title:'고양이 항암 영양',view_count:0},status:'completed',claim_count:1,grades:{E2:1},risks:{moderate:1},created_at:'2026-10-19'},
  {id:'c',metadata:{title:'일반 관리'},status:'completed',claim_count:0,grades:{},risks:{},created_at:'2026-10-18'},
  {id:'d',metadata:{title:'실패 기록'},status:'failed',claim_count:0,grades:{},risks:{},created_at:'2026-10-17'},
  {id:'e',metadata:{title:'가져온 기록'},status:'imported',claim_count:0,grades:{},risks:{},created_at:'2026-10-16'},
];
test('title search, grade OR, risk OR, and AND between filters operate on video rows', () => {
  assert.deepEqual(filterRows(rows,{query:' 항암 ',grades:['E0','E2'],risks:['low','high']}).map(r=>r.id),['a']);
  assert.deepEqual(filterRows(rows,{grades:['E0','E2']}).map(r=>r.id),['a','b']);
  assert.deepEqual(filterRows(rows,{query:'없는제목'}),[]);
});
test('no classification excludes failed and imported rows and differs from not_assessable', () => {
  assert.deepEqual(filterRows(rows,{grades:['__none__']}).map(r=>r.id),['c']);
  assert.deepEqual(grades(rows[3]),['__unavailable__']);
  assert.deepEqual(grades(rows[4]),['__imported__']);
  assert.equal(filterRows(rows,{grades:['__none__'],risks:['high']}).length,0);
});
test('sort does not mutate snapshot; zero and missing statistics are distinct', () => {
  const original = rows.map(row=>row.id);
  assert.deepEqual(filterRows(rows,{sort:'views'}).slice(0,2).map(row=>row.id),['a','b']);
  assert.deepEqual(rows.map(row=>row.id),original);
});
test('CSV preserves Korean, quotes and multiline text while neutralizing formula-like strings', () => {
  const text = csvText(['제목','조회수'],[['한글, "인용"\n두줄',0],[' =HYPERLINK("bad")',42]]);
  assert.ok(text.startsWith('\ufeff'));
  assert.ok(text.includes('"한글, ""인용""\n두줄","0"'));
  assert.ok(text.includes('"\' =HYPERLINK(""bad"")","42"'));
});
test('YouTube links are canonical and reject executable URLs', () => {
  assert.equal(youtubeUrl('abcdefghijk',12.8),'https://www.youtube.com/watch?v=abcdefghijk&t=12');
  assert.equal(youtubeUrl('javascript:alert(1)'),null);
  assert.equal(youtubeUrl('abcdefghijk',null),'https://www.youtube.com/watch?v=abcdefghijk');
});
test('claim export uses one row per matching claim, preserving zero-claim videos', () => {
  const job = {...rows[0],claims:[
    {id:'c1',suggested:{evidence:'E0',risk_level:'low',claim_paraphrase:'첫 주장',claim_text:'AI 인용'},reviewed:null,occurrences:[{source_quote:'실제 전사 원문'}],review_status:'pending_manual_review',validation_report:{warnings:[]}},
    {id:'c2',suggested:{evidence:'E3',risk_level:'moderate',claim_paraphrase:'둘째 주장',claim_text:'둘째 인용'},reviewed:null,occurrences:[]},
  ]};
  const unclassified={...rows[2],claims:[]};
  const result = claimTable([job,unclassified]);
  assert.equal(result.rows.length,3);
  assert.equal(result.rows[0][result.headers.indexOf('증거 전사 자료')],'실제 전사 원문');
  assert.equal(result.rows[1][result.headers.indexOf('위험도')],'중간');
  assert.equal(result.rows[2][result.headers.indexOf('주장')],'분류 없음');
  assert.equal(result.rows[2][result.headers.indexOf('근거')],'분류 없음');
  assert.equal(result.rows[2][result.headers.indexOf('위험도')],'');
  for(const name of ['검토 경고 수','수집 검색어','주장 수','영상 길이(초)'])assert.ok(!result.headers.includes(name));
  const onlyModerate=claimTable([job,unclassified],{grades:['E3'],risks:['moderate']});
  assert.equal(onlyModerate.rows.length,1);
  assert.equal(onlyModerate.rows[0][onlyModerate.headers.indexOf('주장 ID')],'c2');
  assert.equal(claimTable([job],{grades:['E0'],risks:['moderate']}).rows.length,0);
  const detail=claimTable([job],{detailed:true});
  assert.ok(detail.headers.includes('AI 제안 · 원문 인용'));
  assert.ok(detail.headers.includes('사람 확정 · 근거 분류'));
});
test('filtering out all actual claims must not invent an unclassified row', () => {
  const result=claimTable([{...rows[0],claims:[{id:'one',suggested:{evidence:'E3',risk_level:'high'},occurrences:[]}]}],{grades:['__none__']});
  assert.equal(result.rows.length,0);
  assert.equal(result.unclassifiedCount,0);
});
