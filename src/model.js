export const riskNames = {low: '낮음', moderate: '중간', high: '높음', critical: '매우 높음', not_assessable: '판정 불가'};
export const gradeNames = {E0: 'E0', E1: 'E1', E2: 'E2', E3: 'E3', E4: 'E4', E5: 'E5', not_assessable: '판정 불가', not_applicable_out_of_scope: '범위 밖', __none__: '분류 없음', __imported__: '주장 분류 미제공', __unavailable__: '분류 미확정'};
export const statusNames = {completed: '분석 완료', imported: 'CSV 가져옴', failed: '분석 실패', cancelled: '취소됨', interrupted: '중단됨', not_analyzed: '미분석', queued: '대기 중'};
export const fields = {
  classification_basis:'분류 기준', claim_unit_status:'주장 단위 코드', claim_unit_label:'주장 단위 판정', duplicate_of_claim_id:'중복 기준 주장 ID', coding_date:'재검토일', codebook_version:'코드북 버전', e0_reference_detail:'E0 원칙 상세',
  claim_text:'원문 인용',claim_paraphrase:'주장 요약',claim_source:'원문 출처',context_qualifier:'조건 · 맥락',
  claim_eligibility:'주장 적격성',claim_target:'주장 대상',nutrition_claim_mechanism:'영양 주장 기전',
  nutrition_claim_mechanism_other_specified:'기타 기전',claim_orientation:'주장 방향',claim_strength:'주장 강도',
  intervention_type:'영양 중재',claimed_outcome:'주장하는 효과',species:'대상 동물',cancer_specificity:'암 종류',
  cancer_specificity_other_specified:'기타 암 종류',treatment_context:'치료 상황',evidence_source_type:'근거 출처 유형',
  evidence_applicability:'근거 평가 적용성',core_claim_evidence:'핵심 주장 근거',e0_reference_principle:'E0 기준 원칙',
  e0_red_flag:'E0 경고 단서',evidence:'근거 분류',evidence_rationale:'근거 판단 사유',evidence_source:'제시된 근거',
  misinformation_theme:'오정보 주제',risk_modifier:'위험 조절 요인',risk_modifier_direction:'위험 조절 방향',
  risk_modifier_rationale:'위험 판단 사유',risk_domain:'위험 영역',risk_level:'위험도',screening_question:'확인 질문',
  counseling_priority:'상담 우선순위',expert_review_required:'전문가 검토 필요',relevance_status:'주제 관련성',
  exclusion_reason:'제외 사유',content_scope:'콘텐츠 범위',content_scope_candidates:'콘텐츠 범위 후보',content_language:'콘텐츠 언어',
  actor_type:'발신자 유형',actor_evidence:'발신자 판단 근거',contains_commercial_content:'상업성',
  commercial_type:'상업성 유형',commercial_content_type:'상업성 유형',commercial_evidence:'상업성 근거',classification_reason:'분류 사유',
  reviewed_sources:'검토한 출처',unreviewed_sources:'검토하지 않은 출처',review_status:'검토 상태',
  min_views:'조회수 기준',view_count_at_filter:'판정 당시 조회수',statistics_retrieved_at:'통계 수집 시각',
  view_filter_status:'조회수 선별 결과',validation_status:'자동 검사 상태',validation_policy:'검사 정책',
  validation_warnings:'검토 경고',reference_validation:'인용 확인 결과',segment_id:'전사 구간',source:'출처',quote:'인용',
};
export const n = value => value == null ? '—' : Number(value).toLocaleString('ko-KR');
export function date(value, withTime = false) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit', ...(withTime ? {hour:'2-digit', minute:'2-digit'} : {})}).format(new Date(value));
}
export function time(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '시간 미확인';
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = Math.floor(seconds % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
}
export const title = row => row.metadata?.title || row.video_id;
export const channel = row => row.metadata?.channel || row.metadata?.channel_title || '채널 미제공';
export const entryId = row => row.job_id || row.id;
export function grades(row) {
  const present = Object.keys(row.grades || {}).filter(key => row.grades[key] > 0);
  if (present.length) return present;
  return [row.status === 'completed' && row.claim_count === 0 ? '__none__' : row.status === 'imported' ? '__imported__' : '__unavailable__'];
}
export function youtubeUrl(videoId, start) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null;
  return 'https://www.youtube.com/watch?v=' + videoId + (Number.isFinite(start) && start >= 0 ? '&t=' + Math.floor(start) : '');
}
export function filterRows(rows, {query = '', grades: selectedGrades = [], risks = [], sort = 'newest'} = {}) {
  const search = query.trim().normalize('NFC').toLocaleLowerCase('ko-KR');
  const result = rows.filter(row => (!search || title(row).normalize('NFC').toLocaleLowerCase('ko-KR').includes(search))
    && (!selectedGrades.length || grades(row).some(key => selectedGrades.includes(key)))
    && (!risks.length || risks.some(key => (row.risks?.[key] || 0) > 0)));
  return result.sort((a, b) => {
    if (sort === 'title') return title(a).localeCompare(title(b), 'ko', {numeric:true});
    if (sort === 'views') return (b.metadata?.view_count ?? -1) - (a.metadata?.view_count ?? -1);
    if (sort === 'claims') return b.claim_count - a.claim_count;
    return (b.created_at || '').localeCompare(a.created_at || '') || a.id.localeCompare(b.id);
  });
}
export function value(input) {
  if (input == null || input === '') return '—';
  if (typeof input === 'boolean') return input ? '예' : '아니요';
  if (Array.isArray(input)) return input.length ? input.map(value).join(' · ') : '—';
  if (typeof input === 'object') return Object.entries(input).map(([key, item]) => `${fields[key] || key}: ${value(item)}`).join('\n');
  return String(input);
}
export function csvText(headers, rows) {
  const cell = input => {
    let text = input == null ? '' : String(input);
    if (typeof input === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export const claimHeaders = ['영상 제목','주장','증거 전사 자료','근거','위험도','YouTube URL','영상 ID','채널','게시일','조회수','좋아요','댓글 수','분석 상태','분석 요청일','분석 이력 ID','주장 ID','검토 상태'];
export function claimQuote(claim) {
  const quotes = [...new Set((claim.occurrences || []).map(item => item.source_quote).filter(text => typeof text === 'string' && text.trim()))];
  return quotes.length ? quotes.join('\n') : claim.suggested.claim_text || '';
}
export function claimTable(jobs, {grades: selectedGrades = [], risks = [], detailed = false} = {}) {
  const records = [], seen = new Set();
  for (const job of jobs) {
    const key = job.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const claims = job.claims || [];
    if (!claims.length) {
      if (!risks.length && (!selectedGrades.length || grades(job).some(grade => selectedGrades.includes(grade)))) records.push({job, claim:null});
      continue;
    }
    for (const claim of claims) {
      if ((!selectedGrades.length || selectedGrades.includes(claim.suggested.evidence)) && (!risks.length || risks.includes(claim.suggested.risk_level))) records.push({job, claim});
    }
  }
  const keys = detailed ? [...new Set(records.flatMap(({claim}) => claim ? [...Object.keys(claim.suggested)] : []))] : [];
  const headers = [...claimHeaders, '분류 기준','주장 단위 판정','판정 근거', ...(detailed ? ['영상 구간','검토 경고', ...keys.map(key => 'gpt-6 · ' + (fields[key] || key))] : [])];
  const cell = input => input == null ? '' : typeof input === 'object' ? JSON.stringify(input) : input;
  const rows = records.map(({job, claim}) => {
    const labels = claim?.suggested || {}, m = job.metadata || {};
    const core = [title(job), claim ? labels.claim_paraphrase || labels.claim_text || '' : '분류 없음', claim ? claimQuote(claim) : '',
      claim ? gradeNames[labels.evidence] || labels.evidence || '' : '분류 없음', riskNames[labels.risk_level] || labels.risk_level || '',
      youtubeUrl(job.video_id), job.video_id, channel(job), m.published_at ?? '', m.view_count ?? '', m.like_count ?? '', m.comment_count ?? '',
      statusNames[job.status] || job.status, job.created_at || '', job.id, claim?.id || '', claim ? claim.review_status === 'reviewed' ? '검토 확정' : '검토 대기' : ''];
    core.push(claim ? 'gpt-6' : '', labels.claim_unit_label || '', labels.evidence_rationale || '');
    return detailed ? [...core, claim ? JSON.stringify(claim.occurrences || []) : '', claim?.validation_report?.warnings?.map(w => w.message).join('\n') || '',
      ...keys.map(key => cell(labels[key]))] : core;
  });
  return {headers, rows, claimCount:records.filter(record => record.claim).length, unclassifiedCount:records.filter(record => !record.claim).length};
}
