import {riskNames, gradeNames, statusNames, fields, n, date, time, title, channel, grades, filterRows, value, youtubeUrl} from './model.js';
import {exportRows} from './export.js';

const $ = id => document.getElementById(id);
const escape = input => String(input ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state = {data:null, dataset:'jobs', query:'', grades:[], risks:[], sort:'newest', page:1, size:20, downloading:false};
const details = new Map();
let activeDetail = null, detailTab = 'claims', detailSerial = 0, expandedClaims = new Set(), selectedSegment = '';

const badge = (label, kind = '', count) => `<span class="badge ${escape(kind)}">${escape(label)}${count != null ? `<span class="badge-count">${n(count)}</span>` : ''}</span>`;
const gradeBadges = row => grades(row).map(key => badge(gradeNames[key] || key, key.startsWith('__') ? 'muted-badge' : 'grade-badge', row.grades?.[key])).join('');
const riskBadges = row => Object.keys(riskNames).filter(key => row.risks?.[key] > 0).map(key => badge(riskNames[key], 'risk-' + key, row.risks[key])).join('') || '<span class="muted">—</span>';
const reviewBadge = claim => badge(claim.review_status === 'reviewed' ? '검토 확정' : '검토 대기', claim.review_status === 'reviewed' ? 'grade-badge' : 'muted-badge');
const sourceLink = (videoId, label, start, className = '') => {
  const url = youtubeUrl(videoId, start);
  return url ? `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} <span aria-hidden="true">↗</span></a>` : '';
};
const empty = (heading, text = '') => `<span class="empty-icon" aria-hidden="true">≡</span><h3>${escape(heading)}</h3><p>${escape(text)}</p>`;

function rows() { return state.data?.[state.dataset] || []; }
function filtered() { return filterRows(rows(), state); }
function reset() {
  state.query = ''; state.grades = []; state.risks = []; state.page = 1;
  $('title-search').value = '';
  renderMain();
}
function renderStats() {
  const jobs = state.data.jobs;
  const items = [['전체 분석', jobs.length, '건'], ['주장 감지', jobs.filter(job => job.claim_count > 0).length, '건'],
    ['분류 없음', jobs.filter(job => grades(job).includes('__none__')).length, '건'], ['저장된 주장', jobs.reduce((sum, job) => sum + job.claim_count, 0), '개']];
  $('stats').innerHTML = items.map(([label, number, unit]) => `<div class="stat"><span>${label}</span><strong>${n(number)}<small>${unit}</small></strong></div>`).join('');
  $('updated-at').textContent = date(state.data.generated_at, true);
  $('updated-at').dateTime = state.data.generated_at;
  $('jobs-count').textContent = n(jobs.length);
  $('collected-count').textContent = n(state.data.collected.length);
}
function renderFilters() {
  const open = [...document.querySelectorAll('.filter-popover[open]')].map(el => el.id);
  const focused = document.activeElement?.id;
  $('filters').innerHTML = [['grades', '근거 분류', gradeNames], ['risks', '위험도', riskNames]].map(([key, label, names]) => {
    const count = state[key].length;
    return `<details class="filter-popover" id="filter-${key}" ${open.includes('filter-' + key) ? 'open' : ''}>
      <summary class="filter-trigger ${count ? 'is-filtered' : ''}">${label}<span>${count ? count + '개 선택' : '전체'}</span><span class="chevron" aria-hidden="true">⌄</span></summary>
      <div class="filter-options"><div class="filter-option-title"><strong>${label}</strong><button class="text-button" data-clear="${key}" type="button">초기화</button></div>
        ${Object.entries(names).map(([code, text]) => {
          const total = rows().filter(row => key === 'grades' ? grades(row).includes(code) : row.risks?.[code] > 0).length;
          return `<label class="filter-option" for="${key}-${code}"><input id="${key}-${code}" type="checkbox" data-filter="${key}" value="${code}" ${state[key].includes(code) ? 'checked' : ''}><span>${escape(text)}</span><small>${n(total)}</small></label>`;
        }).join('')}
        <p class="popover-help">같은 필터 안에서는 선택한 값 중 하나라도 포함하면 표시합니다.</p>
      </div></details>`;
  }).join('');
  if (focused) document.getElementById(focused)?.focus({preventScroll:true});
}
function renderMain() {
  if (!state.data) return;
  const matches = filtered(), pages = Math.max(1, Math.ceil(matches.length / state.size));
  state.page = Math.min(pages, state.page);
  const offset = (state.page - 1) * state.size;
  $('video-rows').innerHTML = matches.slice(offset, offset + state.size).map((row, i) => `<tr>
    <td class="row-no">${String(offset + i + 1).padStart(2, '0')}</td>
    <td class="video-column"><a class="video-title" href="#result/${state.dataset}/${encodeURIComponent(row.id)}">${escape(title(row))}</a><div class="video-subtitle"><span>${escape(channel(row))}</span><span class="dot">·</span><span>${escape(state.dataset === 'collected' ? row.query || 'URL 직접 수집' : statusNames[row.status] || row.status)}</span></div></td>
    <td><div class="badge-list">${gradeBadges(row)}</div></td><td><div class="badge-list">${riskBadges(row)}</div></td>
    <td class="numeric count-cell">${n(row.claim_count)}</td><td class="numeric">${n(row.metadata?.view_count)}</td><td class="date-cell">${date(row.created_at)}</td>
  </tr>`).join('');
  $('result-count').innerHTML = `<strong>${n(matches.length)}</strong> / ${n(rows().length)}건${state.query || state.grades.length || state.risks.length ? ' · 검색·필터 적용됨' : ''}`;
  $('reset-filters').hidden = !(state.query || state.grades.length || state.risks.length);
  $('empty-state').hidden = matches.length > 0;
  $('empty-state').innerHTML = empty('조건에 맞는 영상이 없습니다', '검색어나 필터를 변경해 보세요.');
  $('page-summary').textContent = matches.length ? `${n(offset + 1)}–${n(Math.min(offset + state.size, matches.length))} / ${n(matches.length)}건` : '0건';
  $('page-number').textContent = `${state.page} / ${pages}`;
  $('previous-page').disabled = state.page <= 1;
  $('next-page').disabled = state.page >= pages;
  $('download-button').disabled = !matches.length || state.downloading;
  $('download-button').querySelector('span').textContent = state.downloading ? '파일 생성 중…' : `결과 다운로드 (${n(matches.length)}건)`;
  $('date-heading').textContent = state.dataset === 'collected' ? '수집일' : '분석 요청일';
  $('video-panel').setAttribute('aria-labelledby', 'tab-' + state.dataset);
  for (const button of document.querySelectorAll('[data-dataset]')) {
    const selected = button.dataset.dataset === state.dataset;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  }
  renderFilters();
}
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`데이터를 불러오지 못했습니다 (${response.status}).`);
  return response.json();
}
async function loadDetail(id) {
  const row = state.data.jobs.find(job => job.id === id);
  if (!row) return null;
  if (!details.has(id)) {
    const promise = json(new URL('../data/' + row.detail, import.meta.url));
    details.set(id, promise);
    promise.catch(() => details.delete(id));
  }
  return details.get(id);
}
function renderFields(input) {
  return `<dl class="field-list">${Object.entries(input || {}).map(([key, item]) => `<dt>${escape(fields[key] || key)}</dt><dd class="${key === 'claim_text' || key === 'claim_paraphrase' ? 'emphasis' : ''}">${escape(key === 'risk_level' ? riskNames[item] || value(item) : key === 'evidence' ? gradeNames[item] || value(item) : value(item))}</dd>`).join('')}</dl>`;
}
function claimExpanded(claim) {
  const warnings = claim.validation_report?.warnings || [];
  return `<tr class="expanded-row"><td colspan="7"><div class="claim-expanded">
    <p class="detail-eyebrow">원문 인용 · AI 제안</p><blockquote>${escape(claim.suggested.claim_text || '원문 인용 없음')}</blockquote>
    ${warnings.length ? `<div class="warning-notice"><strong>검토 경고 ${n(warnings.length)}건</strong><ul>${warnings.map(w => `<li>${escape(w.message)}</li>`).join('')}</ul></div>` : ''}
    ${(claim.occurrences || []).flatMap(item => item.segment_ids || []).length ? `<div class="source-segments">전사 연결 ${(claim.occurrences || []).flatMap(item => item.segment_ids || []).map(id => `<button class="text-button" data-segment="${escape(id)}">${escape(id)} ↗</button>`).join('')}</div>` : ''}
    <h4>AI 제안</h4>${renderFields(claim.suggested)}
    <h4>사람 확정</h4>${claim.reviewed ? renderFields(claim.reviewed) : '<p class="muted">저장된 사람 확정값이 없습니다.</p>'}
    ${claim.reviews?.length ? `<h4>검토 이력</h4>${claim.reviews.map(review => `<p class="review-history"><strong>${escape(review.reviewer)}</strong> · ${date(review.created_at, true)}<br>${escape(review.reason)}</p>`).join('')}` : ''}
  </div></td></tr>`;
}
function claimsPanel(job) {
  const claims = job.claims || [];
  if (!claims.length) return `<div class="empty-state">${empty(job.status === 'completed' ? '분류된 주장이 없습니다' : '저장된 주장 분류가 없습니다', job.status === 'completed' ? '이 분석에서 추출된 주장은 0개입니다. 영상 분류와 전사문은 다른 탭에서 확인할 수 있습니다.' : '영상 분류와 전사문이 있는 경우 해당 탭에서 확인할 수 있습니다.')}</div>`;
  return `<div class="detail-context"><span>전체 주장 <strong>${n(claims.length)}</strong>개</span><span>‘상세’를 누르면 모든 분류 필드와 검토 경고를 확인할 수 있습니다.</span></div>
    <div class="table-scroll"><table class="claims-table"><caption class="sr-only">선택한 영상의 주장 분류</caption><thead><tr><th class="row-no">번호</th><th>주장</th><th>영상 구간</th><th>근거</th><th>위험도</th><th>검토 상태</th><th>상세</th></tr></thead><tbody>${claims.map((claim, i) => {
      const occurrence = claim.occurrences?.[0];
      const range = occurrence?.start != null && occurrence?.end != null ? sourceLink(job.video_id, time(occurrence.start) + '–' + time(occurrence.end), occurrence.start) : '<span class="muted">시간 미확인</span>';
      return `<tr class="${expandedClaims.has(claim.id) ? 'is-expanded' : ''}"><td class="row-no">${String(i + 1).padStart(2, '0')}</td><td class="claim-title-cell"><strong>${escape(claim.suggested.claim_paraphrase || claim.suggested.claim_text)}</strong><p class="quote-preview">${escape(claim.suggested.claim_text)}</p></td><td class="timestamp-cell">${range}</td><td>${badge(gradeNames[claim.suggested.evidence] || claim.suggested.evidence, 'grade-badge')}</td><td>${badge(riskNames[claim.suggested.risk_level] || claim.suggested.risk_level, 'risk-' + claim.suggested.risk_level)}</td><td>${reviewBadge(claim)}${claim.validation_report?.warnings.length ? `<small class="warning-count">경고 ${n(claim.validation_report.warnings.length)}건</small>` : ''}</td><td><button class="expand-claim text-button" data-claim="${escape(claim.id)}" aria-expanded="${expandedClaims.has(claim.id)}" aria-label="주장 ${i + 1} 상세">${expandedClaims.has(claim.id) ? '접기 −' : '상세 +'}</button></td></tr>${expandedClaims.has(claim.id) ? claimExpanded(claim) : ''}`;
    }).join('')}</tbody></table></div>`;
}
function transcriptPanel(job) {
  const transcript = job.transcript;
  if (!transcript) return `<div class="empty-state">${empty('저장된 전사문이 없습니다')}</div>`;
  return `<div class="detail-context"><span>${transcript.complete ? '전체 전사 저장됨' : '부분 전사 · 저장된 범위만 표시'}</span><span>시간을 누르면 해당 구간의 원본 영상이 열립니다.</span></div>
    <div class="table-scroll"><table class="transcript-table"><caption class="sr-only">저장된 전사문</caption><thead><tr><th class="row-no">번호</th><th>영상 구간</th><th>전사 원문</th><th>시간 확인</th></tr></thead><tbody>${transcript.segments.map((segment, i) => `<tr id="segment-${escape(segment.id)}" class="${selectedSegment === segment.id ? 'highlight-row' : ''}"><td class="row-no">${i + 1}</td><td class="timestamp-cell">${segment.start != null && segment.end != null ? sourceLink(job.video_id, time(segment.start) + '–' + time(segment.end), segment.start) : '<span class="muted">시간 미확인</span>'}</td><td class="transcript-text">${escape(segment.text)}</td><td class="muted">${segment.timestamp_status === 'unverified' ? '시간 미확인' : segment.timestamp_status === 'clipped' ? '구간 경계로 제한' : segment.boundary_overlap ? '경계 겹침' : '저장됨'}</td></tr>`).join('')}</tbody></table></div>`;
}
function commentsPanel(job) {
  const comments = job.comments;
  if (!comments || !comments.items.length) return `<div class="empty-state">${empty(comments?.status === 'disabled' ? '댓글이 사용 중지된 영상입니다' : '저장된 댓글이 없습니다')}</div>`;
  return `<div class="detail-context"><span>수집일 ${date(comments.retrieved_at, true)}</span><span>관련성 순 · 영상당 최대 10개 · 답글 제외</span></div><ol class="comments-list">${comments.items.map(item => `<li><div class="comment-meta"><strong>${escape(item.author || '작성자 미제공')}</strong><time>${date(item.published_at)}</time><span>좋아요 ${n(item.like_count)} · 답글 ${n(item.reply_count)}</span></div><p>${escape(item.text)}</p></li>`).join('')}</ol>`;
}
function metadataPanel(job) {
  const m = job.metadata || {};
  const items = [['영상 ID',job.video_id],['분석 상태',statusNames[job.status] || job.status],['채널',channel(job)],['채널 ID',m.channel_id],['게시일',date(m.published_at, true)],['수집일',date(m.retrieved_at, true)],['조회수',n(m.view_count)],['좋아요',n(m.like_count)],['댓글 수',n(m.comment_count)],['영상 길이',m.duration == null ? '—' : time(m.duration)],['분석 요청일',date(job.created_at, true)],['분석 이력 ID',job.job_id || job.id]];
  return `<div class="info-panel"><dl class="field-list">${items.map(([label, item]) => `<dt>${label}</dt><dd>${escape(item || '—')}</dd>`).join('')}</dl>${m.description ? `<h3>영상 설명</h3><p class="description-text">${escape(m.description)}</p>` : ''}${job.collections?.length ? `<h3>수집 이력</h3><ul class="collection-list">${job.collections.map(item => `<li>${date(item.created_at, true)} · ${escape(item.query || 'URL 직접 수집')} · 순위 ${n(item.rank)}</li>`).join('')}</ul>` : ''}</div>`;
}
function renderDetailPanel() {
  if (!activeDetail) return;
  for (const button of document.querySelectorAll('[data-detail-tab]')) {
    const selected = button.dataset.detailTab === detailTab;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  }
  const panel = $('detail-panel');
  panel.setAttribute('aria-labelledby', 'detail-tab-' + detailTab);
  if (detailTab === 'claims') panel.innerHTML = claimsPanel(activeDetail);
  else if (detailTab === 'transcript') panel.innerHTML = transcriptPanel(activeDetail);
  else if (detailTab === 'assessment') panel.innerHTML = activeDetail.video_assessment
    ? `<div class="info-panel"><p class="panel-note">저장된 영상 단위 분류입니다.</p>${renderFields(activeDetail.video_assessment.suggested)}</div>`
    : `<div class="empty-state">${empty('저장된 영상 분류가 없습니다')}</div>`;
  else if (detailTab === 'comments') panel.innerHTML = commentsPanel(activeDetail);
  else panel.innerHTML = metadataPanel(activeDetail);
}
async function handleHash() {
  if (!state.data) return;
  const match = location.hash.match(/^#result\/(jobs|collected)\/([A-Za-z0-9_-]+)$/);
  if (!match) { if ($('result-dialog').open) $('result-dialog').close(); ++detailSerial; return; }
  const row = state.data[match[1]].find(item => item.id === match[2]);
  if (!row) return;
  const serial = ++detailSerial;
  activeDetail = null; detailTab = 'claims'; expandedClaims = new Set(); selectedSegment = '';
  $('detail-content').innerHTML = `<div class="detail-heading"><h2 id="detail-title">${escape(title(row))}</h2></div><div class="empty-state">${empty('상세 결과를 불러오는 중입니다')}</div>`;
  if (!$('result-dialog').open) $('result-dialog').showModal();
  document.body.classList.add('dialog-open');
  try {
    const job = await loadDetail(row.job_id || row.id);
    if (serial !== detailSerial) return;
    activeDetail = job || {...row, claims:[], transcript:null, video_assessment:null, comments:null};
    const tabs = [['claims', '주장 분류', activeDetail.claim_count], ['assessment', '영상 분류'], ['transcript', '전사문'], ['comments', '댓글'], ['metadata', '영상 정보']];
    $('detail-content').innerHTML = `<div class="detail-heading"><h2 id="detail-title">${escape(title(activeDetail))}</h2><p>${escape(channel(activeDetail))}<span class="dot">·</span>${escape(statusNames[activeDetail.status] || activeDetail.status)}</p><div class="detail-heading-actions"><div class="badge-list">${gradeBadges(activeDetail)}${riskBadges(activeDetail)}</div>${sourceLink(activeDetail.video_id, '원본 영상 보기', undefined, 'source-button')}</div></div>
      <div class="detail-tabs" role="tablist" aria-label="상세 결과 종류">${tabs.map(([key, label, count]) => `<button id="detail-tab-${key}" role="tab" aria-selected="${detailTab === key}" aria-controls="detail-panel" tabindex="${detailTab === key ? 0 : -1}" data-detail-tab="${key}">${label}${count != null ? `<span>${n(count)}</span>` : ''}</button>`).join('')}</div><div id="detail-panel" role="tabpanel" tabindex="0" aria-labelledby="detail-tab-claims"></div>`;
    renderDetailPanel();
  } catch (error) {
    if (serial === detailSerial) $('detail-content').innerHTML = `<div class="detail-heading"><h2 id="detail-title">${escape(title(row))}</h2></div><div class="empty-state" role="alert">${empty('상세 결과를 불러오지 못했습니다', error.message)}<button class="secondary" data-retry-detail>다시 시도</button></div>`;
  }
}
function closeDetail() {
  ++detailSerial;
  $('result-dialog').close();
  history.replaceState(null, '', location.pathname + location.search);
}
function switchDataset(dataset) {
  state.dataset = dataset; state.page = 1;
  renderMain();
}
function tabKeys(event, selector, current, action) {
  const tabs = [...document.querySelectorAll(selector)], index = tabs.indexOf(current);
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  if (next != null) { event.preventDefault(); action(tabs[next]); tabs[next].focus(); }
}
$('title-search').addEventListener('input', event => { state.query = event.target.value; state.page = 1; renderMain(); });
$('sort-order').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; renderMain(); });
$('page-size').addEventListener('change', event => { state.size = Number(event.target.value); state.page = 1; renderMain(); });
$('reset-filters').addEventListener('click', reset);
for (const [id, change] of [['previous-page', -1], ['next-page', 1]]) $(id).addEventListener('click', () => { state.page += change; renderMain(); });
$('filters').addEventListener('change', event => {
  const key = event.target.dataset.filter;
  if (!key) return;
  state[key] = [...$('filters').querySelectorAll(`[data-filter="${key}"]:checked`)].map(input => input.value);
  state.page = 1; renderMain();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.filter-popover')) for (const item of document.querySelectorAll('.filter-popover[open]')) item.open = false;
  const dataset = event.target.closest('[data-dataset]');
  if (dataset) switchDataset(dataset.dataset.dataset);
  const clear = event.target.closest('[data-clear]');
  if (clear) { state[clear.dataset.clear] = []; state.page = 1; renderMain(); }
  const tab = event.target.closest('[data-detail-tab]');
  if (tab) { detailTab = tab.dataset.detailTab; renderDetailPanel(); }
  const claim = event.target.closest('[data-claim]');
  if (claim) {
    const key = claim.dataset.claim;
    expandedClaims.has(key) ? expandedClaims.delete(key) : expandedClaims.add(key);
    renderDetailPanel();
    document.querySelector(`[data-claim="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
  }
  const segment = event.target.closest('[data-segment]');
  if (segment) {
    selectedSegment = segment.dataset.segment; detailTab = 'transcript'; renderDetailPanel();
    document.getElementById('segment-' + selectedSegment)?.scrollIntoView({block:'center', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  if (event.target.closest('[data-retry-detail]')) handleHash();
  if (event.target.closest('[data-retry]')) boot();
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !$('result-dialog').open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); $('title-search').focus(); }
  if (event.key === 'Escape') for (const item of document.querySelectorAll('.filter-popover[open]')) item.open = false;
  const dataset = event.target.closest('[data-dataset]');
  if (dataset) tabKeys(event, '[data-dataset]', dataset, button => switchDataset(button.dataset.dataset));
  const tab = event.target.closest('[data-detail-tab]');
  if (tab) tabKeys(event, '[data-detail-tab]', tab, button => { detailTab = button.dataset.detailTab; renderDetailPanel(); });
});
$('close-detail').addEventListener('click', closeDetail);
$('result-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
$('result-dialog').addEventListener('close', () => { document.body.classList.remove('dialog-open'); });
$('result-dialog').addEventListener('click', event => {
  if (event.target !== $('result-dialog')) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
});
window.addEventListener('hashchange', handleHash);
$('download-button').addEventListener('click', async () => {
  const matches = filtered(), format = $('download-format').value;
  if (!matches.length || state.downloading) return;
  state.downloading = true; $('download-button').setAttribute('aria-busy', 'true'); renderMain();
  $('download-notice').classList.remove('error-text');
  $('download-notice').textContent = `조건에 맞는 주장으로 ${format.toUpperCase()} 파일을 생성하고 있습니다.`;
  try {
    const result = await exportRows(matches, format, loadDetail, {grades:[...state.grades], risks:[...state.risks]});
    $('download-notice').textContent = `${format.toUpperCase()} ${n(result.rowCount)}행 다운로드 · 주장 ${n(result.claimCount)}건 · 분류 없음 ${n(result.unclassifiedCount)}건`;
  } catch (error) {
    $('download-notice').classList.add('error-text');
    $('download-notice').textContent = '다운로드 실패: ' + error.message;
  } finally {
    state.downloading = false; $('download-button').removeAttribute('aria-busy'); renderMain();
  }
});
async function boot() {
  try {
    const data = await json(new URL('../data/index.json', import.meta.url));
    if (data.schema_version !== 1 || !Array.isArray(data.jobs) || !Array.isArray(data.collected)) throw new Error('지원하지 않는 데이터 형식입니다.');
    state.data = data;
    renderStats(); renderMain(); handleHash();
  } catch (error) {
    $('result-count').textContent = '데이터 로딩 실패';
    $('empty-state').hidden = false;
    $('empty-state').innerHTML = `${empty('데이터를 불러오지 못했습니다', location.protocol === 'file:' ? '파일을 직접 열지 말고 README의 로컬 실행 방법을 사용하세요.' : error.message)}<button class="secondary" data-retry>다시 시도</button>`;
  }
}
boot();
