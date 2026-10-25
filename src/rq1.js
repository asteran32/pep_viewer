import {riskNames, time, youtubeUrl} from './model.js';

const q = id => document.getElementById(id);
const pageSize = 20;
const params = new URLSearchParams(location.search);
const field = params.get('field') || 'intervention_type';
const code = params.get('code') || 'supplement';
const fieldNames = {intervention_type: '영양 개입', claimed_outcome: '주장 결과', evidence: '근거 관계', misinformation_theme: '주제', channel_type: '채널 유형', channel_id: '채널별 결과'};
const sections = {intervention_type: 'RQ1', claimed_outcome: 'RQ1', evidence: 'RQ2', misinformation_theme: 'RQ3', channel_type: 'RQ3', channel_id: 'RQ3'};
const channelOrigins = ['channel-type-distribution', 'channel-composition', 'channel-concentration', 'channel-results'];
const origin = channelOrigins.includes(params.get('from')) ? params.get('from') : null;
const initialRisk = params.get('risk') || '';
const riskCodes = ['low', 'moderate', 'high'];
const section = sections[field] || '분석';
let dataset, selected = [], filtered = [], currentPage = 1;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sourceLink(label, href) {
  const link = element('a', '', label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function claimRow(claim, index) {
  const details = element('details', 'rq1-claim');
  details.dataset.claimId = claim.claim_id;
  const summary = element('summary');
  const video = element('span', 'rq1-video');
  video.append(element('span', 'rq1-video-title', claim.title), element('span', 'rq1-channel', claim.channel));
  const risk = element('span', 'rq1-risk', riskNames[claim.risk_level] || claim.risk_level);
  risk.dataset.risk = claim.risk_level;
  const chevron = element('span', 'rq1-chevron', '›');
  chevron.setAttribute('aria-hidden', 'true');
  summary.append(element('span', 'rq1-claim-number', String(index + 1).padStart(2, '0')),
    element('strong', 'rq1-claim-title', claim.claim_paraphrase || claim.claim_text), video,
    element('span', 'rq1-grade', claim.evidence), risk, chevron);

  const detail = element('div', 'rq1-claim-detail');
  detail.append(element('h2', '', '주장 원문'), element('blockquote', '', claim.claim_text));
  const fields = element('dl', 'rq1-detail-fields');
  for (const key of ['intervention_type', 'claimed_outcome', 'misinformation_theme']) {
    const value = element('dd');
    for (const [i, tag] of claim[key].entries()) {
      if (i) value.append(document.createTextNode(' · '));
      value.append(element('span', key === field && tag === code ? 'rq1-selected-tag' : '', dataset.labels[key][tag] || tag));
    }
    fields.append(element('dt', '', key === 'misinformation_theme' ? '주제 분류' : `${fieldNames[key]} 유형`), value);
  }
  const entries = [
    ['채널 유형', dataset.labels.channel_type?.[claim.channel_type]],
    ['근거 등급', `${claim.evidence} · ${dataset.evidence_labels[claim.evidence]}`],
    ['위험도', riskNames[claim.risk_level] || claim.risk_level],
    ['판정 근거', claim.evidence_rationale],
    ['조건 · 맥락', claim.context_qualifier],
    ['주장 단위', claim.claim_unit_label],
  ];
  for (const [label, value] of entries) {
    if (value) fields.append(element('dt', '', label), element('dd', '', value));
  }
  detail.append(fields);
  const links = element('div', 'rq1-source-links');
  const videoUrl = youtubeUrl(claim.video_id);
  if (videoUrl) links.append(sourceLink('원본 영상 보기 ↗', videoUrl));
  const starts = [...new Set(claim.occurrences.filter(item =>
    ['exact', 'normalized'].includes(item.quote_match) && Number.isFinite(item.start) && item.start >= 0
  ).map(item => Math.floor(item.start)))];
  if (videoUrl) for (const start of starts) links.append(sourceLink(`${time(start)} 구간 보기 ↗`, youtubeUrl(claim.video_id, start)));
  if (!starts.length) links.append(element('span', 'muted', '시간 미확인'));
  detail.append(links, element('p', 'rq1-claim-id', `주장 ID ${claim.claim_id} · 원자료 ${claim.row_number}행`));
  details.append(summary, detail);
  return details;
}

function render() {
  const start = (currentPage - 1) * pageSize;
  const risk = q('claim-risk').value;
  const scoped = selected.filter(claim => !risk || claim.risk_level === risk);
  q('rq1-list').replaceChildren(...filtered.slice(start, start + pageSize).map((claim, i) => claimRow(claim, start + i)));
  q('rq1-status').textContent = `분류된 주장 ${scoped.length.toLocaleString('ko-KR')}건 · 검색 결과 ${filtered.length.toLocaleString('ko-KR')}건`;
  const videos = new Set(scoped.map(claim => claim.video_id)).size;
  const scopeName = field === 'evidence' ? `${code} 등급 전체` : field === 'misinformation_theme' ? '주제 전체' : field === 'channel_id' ? '채널 전체' : '유형 전체';
  q('rq1-scope-note').hidden = field !== 'misinformation_theme' || risk === 'high';
  if (origin && ['channel-composition', 'channel-concentration'].includes(origin) && risk) {
    const total = dataset.primary.risk[risk];
    q('rq1-scope-note').textContent = `전체 ${riskNames[risk]} 위험도 주장 ${total}건 중 ${scoped.length}건 (${(scoped.length / total * 100).toFixed(2)}%)`;
    q('rq1-scope-note').hidden = false;
  }
  q('rq1-description').textContent = risk
    ? `위험도 ${riskNames[risk]} 주장 ${scoped.length}건 · ${videos}개 영상 · ${scopeName} ${selected.length}건 중 ${(scoped.length / selected.length * 100).toFixed(2)}%`
    : `분류된 주장 ${selected.length}건 · ${videos}개 영상 · 전체 ${dataset.primary.n}개 주장 중 ${(selected.length / dataset.primary.n * 100).toFixed(2)}%`;
  const scopeLink = q('rq1-scope-link');
  const scopeUrl = new URL(location.href);
  scopeLink.hidden = !risk && field !== 'misinformation_theme';
  if (risk) {
    scopeUrl.searchParams.delete('risk');
    scopeLink.textContent = `${scopeName} ${selected.length}건 보기 →`;
  } else if (field === 'misinformation_theme') {
    scopeUrl.searchParams.set('risk', 'high');
    scopeLink.textContent = `고위험 ${selected.filter(claim => claim.risk_level === 'high').length}건만 보기 →`;
  }
  scopeLink.href = scopeUrl.href;
  q('rq1-empty').hidden = filtered.length > 0;
  const noScopedClaims = scoped.length === 0 && !q('claim-search').value && !q('claim-evidence').value;
  q('rq1-empty').querySelector('h2').textContent = noScopedClaims ? '해당 위험도의 주장이 없습니다' : '검색 결과가 없습니다';
  q('rq1-empty').querySelector('p').textContent = noScopedClaims ? '전체 주장 보기 또는 다른 위험도를 선택해 주세요.' : '검색어 또는 분류 필터를 변경해 주세요.';
  q('rq1-columns').hidden = !filtered.length;
  q('rq1-pagination').hidden = !filtered.length;
  q('rq1-range').textContent = `${start + 1}–${Math.min(start + pageSize, filtered.length)} / ${filtered.length}건`;
  q('rq1-page-number').textContent = `${currentPage} / ${Math.max(1, Math.ceil(filtered.length / pageSize))}`;
  q('rq1-prev').disabled = currentPage === 1;
  q('rq1-next').disabled = start + pageSize >= filtered.length;
  q('rq1-reset').hidden = !q('claim-search').value && !q('claim-evidence').value && risk === initialRisk;
}

function filterClaims() {
  const query = q('claim-search').value.trim().normalize('NFC').toLocaleLowerCase('ko-KR');
  const evidence = q('claim-evidence').value;
  const risk = q('claim-risk').value;
  filtered = selected.filter(claim => (!risk || claim.risk_level === risk) && (!evidence || claim.evidence === evidence) && (!query ||
    [claim.claim_text, claim.claim_paraphrase, claim.title, claim.channel].some(value => value.normalize('NFC').toLocaleLowerCase('ko-KR').includes(query))));
  currentPage = 1;
  render();
}

async function load() {
  q('rq1-retry').hidden = true;
  q('claim-results').setAttribute('aria-busy', 'true');
  q('rq1-status').textContent = '데이터 불러오는 중…';
  try {
    const response = await fetch(new URL('../assets/analysis/rq1_claims.json', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dataset = await response.json();
    const labels = field === 'evidence' ? dataset.evidence_labels : dataset.labels[field];
    if (!Object.hasOwn(fieldNames, field) || !labels || !Object.hasOwn(labels, code) || (initialRisk && !riskCodes.includes(initialRisk))) {
      q('rq1-title').textContent = '분류를 찾을 수 없습니다';
      q('rq1-description').textContent = '분석 그래프로 돌아가 확인할 분류의 막대를 선택해 주세요.';
      q('rq1-status').textContent = '유효하지 않은 분류입니다.';
      return;
    }
    const label = field === 'evidence' ? `${code} · ${labels[code]}` : labels[code];
    selected = dataset.claims.filter(claim => Array.isArray(claim[field]) ? claim[field].includes(code) : claim[field] === code);
    q('rq1-category').textContent = `${section} · ${field === 'misinformation_theme' ? '잠재적 임상 위험' : fieldNames[field]}`;
    q('rq1-title').textContent = label;
    document.title = `PEP Viewer · ${label} 주장 상세`;
    let backUrl = `./analysis.html#${section.toLowerCase()}`;
    if (field === 'claimed_outcome') backUrl = './analysis.html?rq1=outcome#rq1';
    if (field === 'evidence' && params.get('mode') === 'percent') backUrl = './analysis.html?rq2=percent#rq2';
    if (field === 'channel_type' || field === 'channel_id') backUrl = `./analysis.html#${origin || 'channel-results'}`;
    const backLink = q('rq1-back');
    backLink.href = backUrl;
    backLink.replaceChildren(element('span', '', '←'), document.createTextNode(` ${section} 그래프로 돌아가기`));
    backLink.firstChild.setAttribute('aria-hidden', 'true');
    if (field === 'channel_type' || field === 'channel_id') {
      document.querySelector('.rq1-method').textContent += ' 채널 유형은 메타데이터 기반 잠정 분류입니다.';
    }
    if (field === 'misinformation_theme') {
      const high = selected.filter(claim => claim.risk_level === 'high').length;
      q('rq1-scope-note').textContent = `주제 내 고위험 비율 ${high}/${selected.length} (${(high / selected.length * 100).toFixed(2)}%)`;
      q('rq1-scope-note').hidden = false;
    }
    q('claim-risk').value = initialRisk;
    q('claim-evidence-filter').hidden = field === 'evidence';
    q('rq1-filters').hidden = false;
    q('rq1-list-help').hidden = false;
    filterClaims();
  } catch {
    q('rq1-description').textContent = '주장 데이터를 불러오지 못했습니다.';
    q('rq1-status').textContent = '연결 상태를 확인한 뒤 다시 불러와 주세요.';
    q('rq1-retry').hidden = false;
  } finally {
    q('claim-results').setAttribute('aria-busy', 'false');
  }
}

q('rq1-filters').addEventListener('submit', event => event.preventDefault());
q('claim-search').addEventListener('input', filterClaims);
q('claim-evidence').addEventListener('change', filterClaims);
q('claim-risk').addEventListener('change', () => {
  const url = new URL(location.href);
  if (q('claim-risk').value) url.searchParams.set('risk', q('claim-risk').value);
  else url.searchParams.delete('risk');
  history.replaceState(null, '', url);
  filterClaims();
});
q('rq1-reset').addEventListener('click', () => {
  q('rq1-filters').reset();
  q('claim-risk').value = initialRisk;
  const url = new URL(location.href);
  if (initialRisk) url.searchParams.set('risk', initialRisk);
  else url.searchParams.delete('risk');
  history.replaceState(null, '', url);
  filterClaims();
  q('claim-search').focus();
});
for (const [id, step] of [['rq1-prev', -1], ['rq1-next', 1]]) q(id).addEventListener('click', () => {
  currentPage += step;
  render();
  q('claim-results').focus({preventScroll: true});
  q('claim-results').scrollIntoView({behavior: 'instant', block: 'start'});
});
q('rq1-retry').addEventListener('click', load);
load();
