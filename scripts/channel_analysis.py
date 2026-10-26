"""Validate and render the metadata-based channel audit for the public analysis."""
from collections import Counter
from html import escape
import hashlib
import json
from urllib.parse import urlencode, urlparse

RISKS = {'low': '낮음', 'moderate': '중간', 'high': '높음'}
STRENGTHS = {
    'explicit_activity_credential_unknown': '활동 확인 · 전문자격 미확인',
    'observed_content_credential_unknown': '표본 콘텐츠 기준 · 전문자격 미확인',
    'explicit_metadata': '영상 메타데이터에 명시',
    'channel_name_only': '채널명 기준 · 추가 확인 필요',
    'channel_name_activity_credential_unknown': '채널명에 활동 명시 · 전문자격 미확인',
    'explicit_metadata_and_official_site': '메타데이터·공식 소개 확인',
    'official_site_supplement': '공식 소개로 보완',
    'explicit_metadata_and_operator_announcement': '메타데이터·운영 측 소개 확인',
}


def rate(n, total):
    return f'{n / total * 100:.2f}'


def claim_link(field, code, *, risk=None, origin='channel-results'):
    params = {'field': field, 'code': code, 'from': origin}
    if risk:
        params['risk'] = risk
    return './claims.html?' + urlencode(params)


def safe_url(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.netloc:
        raise ValueError('Channel evidence requires a public HTTPS source')
    return escape(url)


def load_channel_data(source, claim_data):
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    loaded = {}
    for name in ['analysis_summary.json', 'channel_coding.json', 'channel_summary.csv']:
        raw = (source / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest['output_sha256'][name]:
            raise ValueError(f'Channel audit hash mismatch: {name}')
        if name.endswith('.json'):
            loaded[name] = json.loads(raw)
    summary = loaded['analysis_summary.json']
    channels = loaded['channel_coding.json']['channels']
    claims = claim_data['claims']
    primary = summary['primary']
    assert primary['claims'] == len(claims) == 309
    assert primary['channels'] == len(channels) == 23
    assert primary['videos'] == len({row['video_id'] for row in claims}) == 49
    assert len({ch['channel_id'] for ch in channels}) == 23
    assert len({ch['channel_label'] for ch in channels}) == 23
    by_id = {ch['channel_id']: ch for ch in channels}
    assert {row['channel_id'] for row in claims} == set(by_id)
    # The zero-case occupation is not part of the public comparison.
    types = {code: group for code, group in summary['channel_types'].items()
             if code != 'pharmacist' and group['claims'] > 0}
    assert len(types) == 5 and sum(group['claims'] for group in types.values()) == 309
    for ch in channels:
        rows = [row for row in claims if row['channel_id'] == ch['channel_id']]
        assert ch['channel_type'] in types
        assert ch['claims'] == len(rows)
        assert ch['videos'] == len({row['video_id'] for row in rows})
        assert ch['evidence_strength'] in STRENGTHS
        for risk in RISKS:
            assert ch[risk] == sum(row['risk_level'] == risk for row in rows)
        safe_url(ch['url'])
        for item in ch['evidence'] + ch['external_sources']:
            safe_url(item['url'])
    for code, group in types.items():
        selected = [ch for ch in channels if ch['channel_type'] == code]
        assert group['channels'] == len(selected)
        assert group['claims'] == sum(ch['claims'] for ch in selected)
        assert group['videos'] == sum(ch['videos'] for ch in selected)
        for risk in RISKS:
            assert group[risk] == sum(ch[risk] for ch in selected)
    for risk in RISKS:
        assert primary[risk] == sum(ch[risk] for ch in channels)
        counts = Counter({ch['channel_label']: ch[risk] for ch in channels if ch[risk]})
        concentration = summary['risk_concentration'][risk]
        assert concentration['channels'] == len(counts)
        assert concentration['claims'] == primary[risk]
        assert concentration['top_channel_count'] == counts.most_common(1)[0][1]
        assert concentration['top_channel'] == counts.most_common(1)[0][0]
        assert concentration['top_channel_share_pct'] == round(counts.most_common(1)[0][1] / primary[risk]*100, 2)
        assert concentration['top_two_share_pct'] == round(sum(n for _, n in counts.most_common(2)) / primary[risk]*100, 2)
    claim_data['labels']['channel_type'] = {code: group['label'] for code, group in types.items()}
    claim_data['labels']['channel_id'] = {ch['channel_id']: ch['name'] for ch in channels}
    for row in claims:
        ch = by_id[row['channel_id']]
        row.update(channel_type=ch['channel_type'], channel_label=ch['channel_label'])
    return {'analysis_date': summary['analysis_date'], 'coding_status': 'preliminary_single_coder',
            'primary': primary, 'types': types, 'channels': channels,
            'concentration': summary['risk_concentration'],
            'source_sha256': {name: manifest['output_sha256'][name]
                              for name in ['analysis_summary.json', 'channel_coding.json', 'channel_summary.csv']}}


def render_distribution(data):
    rows = []
    for index, (code, group) in enumerate(data['types'].items()):
        label, total = group['label'], group['claims']
        segments, breakdown = [], []
        for risk, name in RISKS.items():
            count = group[risk]
            share = rate(count, total)
            href = escape(claim_link('channel_type', code, risk=risk, origin='channel-type-distribution'))
            accessible = escape(f'{label}, 위험도 {name} {count}개, 유형 전체 {total}개 중 {share}%. 주장 보기')
            if count:
                segments.append(f'<a class="channel-segment legend-{risk}" href="{href}" '
                    f'data-risk="{risk}" data-count="{count}" style="width:{share}%" aria-label="{accessible}">'
                    f'<span aria-hidden="true">{count if float(share) >= 8 else ""}</span></a>')
            text = f'{name} <strong>{count}</strong><span>{share}%</span>'
            breakdown.append(f'<a href="{href}">{text}</a>' if count else f'<span>{text}</span>')
        full = escape(claim_link('channel_type', code, origin='channel-type-distribution'))
        high = escape(claim_link('channel_type', code, risk='high', origin='channel-type-distribution'))
        rows.append(f'<li data-channel-type="{code}"><div class="channel-type-label"><a href="{full}">{escape(label)}</a>'
            f'<span>{group["channels"]}개 채널 · {group["videos"]}개 영상 · {total}개 주장</span></div>'
            f'<div class="channel-type-stack" style="--bar-delay:{index*40}ms">{"".join(segments)}</div>'
            f'<a class="channel-high-rate" href="{high}" aria-label="{escape(label)} 고위험 {group["high"]}개 주장 보기">'
            f'{rate(group["high"],total)}<small>%</small></a>'
            f'<div class="channel-type-breakdown">{"".join(breakdown)}</div></li>')
    return '<ul class="channel-distribution" aria-label="유형 내 위험도별 주장 분포">' + ''.join(rows) + '</ul>'


def render_composition(data):
    rows = []
    for code, group in data['types'].items():
        cells = []
        for risk, name in RISKS.items():
            count, total = group[risk], data['primary'][risk]
            share = rate(count, total)
            href = escape(claim_link('channel_type', code, risk=risk, origin='channel-composition'))
            accessible = escape(f'{group["label"]}, {name} 위험도 전체 {total}개 중 {count}개, {share}%. 주장 보기')
            text = f'<strong>{count}<small>개</small></strong><span>{share}%</span>'
            content = f'<a href="{href}" aria-label="{accessible}">{text}</a>' if count else f'<span class="composition-zero">{text}</span>'
            cells.append(f'<td data-risk="{risk}" data-count="{count}" data-total="{total}">{content}'
                f'<span class="composition-meter" aria-hidden="true"><i class="legend-{risk}" style="width:{share}%"></i></span></td>')
        rows.append(f'<tr data-channel-type="{code}"><th scope="row">{escape(group["label"])}</th>{"".join(cells)}</tr>')
    headings = ''.join(f'<th scope="col"><span class="channel-risk-dot legend-{risk}" aria-hidden="true"></span>{name}'
        f'<small>전체 {data["primary"][risk]}개 주장</small></th>' for risk, name in RISKS.items())
    return ('<table class="channel-composition-table"><caption class="sr-only">위험도별 전체 주장 중 채널 유형의 건수와 비율</caption>'
            '<colgroup><col style="width:34%"><col style="width:22%"><col style="width:22%"><col style="width:22%"></colgroup>'
            f'<thead><tr><th scope="col">채널 유형</th>{headings}</tr></thead><tbody>{"".join(rows)}</tbody></table>')


def render_concentration(data):
    channels = {ch['channel_label']: ch for ch in data['channels']}
    rows = []
    for index, (risk, name) in enumerate(RISKS.items()):
        group = data['concentration'][risk]
        ch = channels[group['top_channel']]
        href = escape(claim_link('channel_id', ch['channel_id'], risk=risk, origin='channel-concentration'))
        share = rate(group['top_channel_count'], group['claims'])
        accessible = escape(f'{name} 위험도, {ch["name"]}의 주장 {group["top_channel_count"]}개, 전체 {group["claims"]}개 중 {share}%. 주장 보기')
        rows.append(f'<li data-risk="{risk}"><div class="channel-risk-heading"><strong><i class="channel-risk-dot legend-{risk}" aria-hidden="true"></i>{name}</strong>'
            f'<span>{group["claims"]}개 주장 · {group["channels"]}개 채널</span></div>'
            f'<div class="channel-leading"><a href="#channel-{ch["channel_label"]}" data-channel-jump="{ch["channel_label"]}">'
            f'<small>{ch["channel_label"]}</small>{escape(ch["name"])}</a><span>최다 채널 · {group["top_channel_count"]}/{group["claims"]}개</span></div>'
            f'<a class="channel-concentration-bar" href="{href}" aria-label="{accessible}"><span class="channel-concentration-track" aria-hidden="true">'
            f'<i class="channel-meter-fill legend-{risk}" style="width:{share}%;--bar-delay:{index*50}ms"></i></span><strong aria-hidden="true">{share}<small>%</small></strong></a>'
            f'<div class="channel-top-two"><span>상위 2개 채널</span><strong>{group["top_two_share_pct"]:.2f}<small>%</small></strong></div></li>')
    return '<ul class="channel-concentration-chart" aria-label="위험도별 채널 집중도 비교">' + ''.join(rows) + '</ul>'


def channel_evidence(ch):
    labels = {'channel': '채널명', 'description': '영상 설명', 'title': '영상 제목'}
    quotes = ''.join(f'<li><span>{labels.get(item["field"], "메타데이터")}</span> “{escape(item["quote"])}” '
        f'<a href="{safe_url(item["url"])}" target="_blank" rel="noopener noreferrer">원본 영상 ↗</a></li>' for item in ch['evidence'])
    sources = ''.join(f'<a href="{safe_url(ref["url"])}" target="_blank" rel="noopener noreferrer">{escape(ref["title"])} ↗</a>' for ref in ch['external_sources'])
    guest = f'<p class="channel-guest-note">초청 전문가: <strong>{escape(ch["guest_name"])}</strong> · 채널 운영자의 직업과 구분합니다.</p>' if ch['guest_name'] else ''
    href = escape(claim_link('channel_id', ch['channel_id']))
    note = ch['notes'].replace('actor_type=veterinarian_clinic', '발신자 분류').replace('actor_type', '발신자 분류')
    return (f'<div class="channel-evidence-content"><div class="channel-evidence-heading"><h5>{escape(ch["name"])} · 분류 근거</h5>'
        f'<a href="{href}">주장 {ch["claims"]}개 보기 →</a></div>'
        f'<dl><dt>역할·자격 설명</dt><dd>{escape(ch["declared_or_supported_role"])}</dd>'
        f'<dt>확인 수준</dt><dd>{STRENGTHS[ch["evidence_strength"]]} · 면허 등록기관 조회 미실시</dd></dl>'
        f'{guest}<ul class="channel-source-quotes">{quotes}</ul>'
        + (f'<p class="channel-evidence-note">{escape(note)}</p>' if note else '')
        + (f'<div class="channel-external-sources">{sources}</div>' if sources else '') + '</div>')


def render_results(data):
    rows = []
    channels = sorted(data['channels'], key=lambda ch: (-ch['high'], ch['channel_label']))
    for ch in channels:
        code, cid = ch['channel_label'], ch['channel_id']
        search = escape(' '.join([code, ch['name'], ch['channel_type_label'], ch['declared_or_supported_role'], ch['guest_name'] or '']))
        cells = []
        for risk in RISKS:
            value = ch[risk]
            href = escape(claim_link('channel_id', cid, risk=risk))
            cells.append(f'<td data-risk="{risk}"><a href="{href}" aria-label="{escape(ch["name"])} 위험도 {RISKS[risk]} {value}개 주장 보기">{value}</a></td>' if value else f'<td data-risk="{risk}" class="channel-zero">0</td>')
        full = escape(claim_link('channel_id', cid))
        high_href = escape(claim_link('channel_id', cid, risk='high'))
        mobile_high = (f'<a href="{high_href}" aria-label="{escape(ch["name"])} 고위험 {ch["high"]}개 주장 보기">고위험 <strong>{ch["high"]}개</strong></a>'
                       if ch['high'] else '<span>고위험 0개</span>')
        rows.append(f'<tr id="channel-{code}" data-channel-row="{code}" data-type="{ch["channel_type"]}" data-search="{search}" '
            f'data-high="{ch["high"]}" data-rate="{ch["high_rate_pct"]}" data-claims="{ch["claims"]}">'
            f'<th scope="row"><div class="channel-name"><span>{code}</span><a href="{safe_url(ch["url"])}" target="_blank" rel="noopener noreferrer">{escape(ch["name"])} ↗</a></div>'
            f'<span class="channel-row-type">{escape(ch["channel_type_label"])}</span>'
            f'<span class="channel-mobile-risk">{mobile_high}<span>{ch["high_rate_pct"]:.2f}%</span></span></th>'
            f'<td>{ch["videos"]}</td><td><a href="{full}">{ch["claims"]}</a></td>{"".join(cells)}'
            f'<td class="channel-rate-cell">{ch["high_rate_pct"]:.2f}<small>%</small></td>'
            f'<td><button type="button" class="channel-evidence-toggle js-only" data-channel-evidence="{code}" '
            f'aria-expanded="false" aria-controls="channel-evidence-{code}" aria-label="{escape(ch["name"])} 분류 근거">근거 <span aria-hidden="true">›</span></button></td></tr>'
            f'<tr id="channel-evidence-{code}" class="channel-evidence-row" hidden><td colspan="8">{channel_evidence(ch)}</td></tr>')
    options = ''.join(f'<option value="{code}">{escape(group["label"])}</option>' for code, group in data['types'].items())
    return f'''<form id="channel-controls" class="channel-controls js-only" role="search">
      <label class="channel-search"><span class="sr-only">채널명·코드 검색</span><input id="channel-search" type="search" placeholder="채널명·코드 검색" autocomplete="off"></label>
      <label>유형<select id="channel-type-filter"><option value="">전체 유형</option>{options}</select></label>
      <label>정렬<select id="channel-sort"><option value="high">고위험 건수순</option><option value="rate">고위험률순</option><option value="code">채널 코드순</option></select></label>
      <button id="channel-reset" type="button" hidden>초기화</button>
    </form><div class="channel-results-meta"><p id="channel-results-status" role="status" aria-live="polite">23개 채널 · 309개 주장</p><span>건수를 누르면 해당 주장 목록으로 이동합니다.<span class="channel-scroll-hint"> · 표 좌우 스크롤</span></span></div>
    <div class="channel-results-scroll" role="region" aria-label="23개 채널별 위험도 결과 표" tabindex="0"><table class="channel-results-table">
      <caption class="sr-only">채널별 유형, 영상과 주장 수, 낮음·중간·높음 건수 및 채널 내 고위험률</caption>
      <colgroup><col style="width:36%"><col style="width:7%"><col style="width:7%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:13%"><col style="width:13%"></colgroup>
      <thead><tr><th scope="col">채널 · 유형</th><th scope="col">영상</th><th scope="col">주장</th><th scope="col">낮음</th><th scope="col">중간</th><th scope="col">높음</th><th scope="col">고위험률</th><th scope="col"><span class="sr-only">분류 근거</span></th></tr></thead>
      <tbody id="channel-result-rows">{"".join(rows)}<tr id="channel-empty" hidden><td colspan="8">검색 결과가 없습니다. 검색어 또는 유형을 변경해 주세요.</td></tr></tbody>
    </table></div><p class="channel-table-help">고위험률의 분모는 각 채널의 전체 주장 수입니다. 작은 표본의 비율은 건수와 함께 확인하세요.<span> 표는 좌우로 스크롤할 수 있습니다.</span></p>'''


def render_channel_analysis(data):
    return f'''<section id="channel-analysis" class="channel-analysis" aria-labelledby="channel-analysis-title">
      <div class="channel-analysis-heading section-heading-row">
        <div class="section-heading-copy"><p class="section-kicker">RQ3 · 채널 메타데이터 분석</p><h3 id="channel-analysis-title">채널 유형과 위험 분포</h3><p class="channel-analysis-count">23개 채널 · 49개 영상 · 309개 주장</p></div>
        <div class="section-heading-actions"><a class="section-data-download" href="./assets/analysis/channel_summary.xlsx" download>채널 XLSX <span aria-hidden="true">↓</span></a></div>
      </div>
      <p class="channel-coding-note">제목·설명·채널명과 일부 공식 소개에 따른 잠정 분류입니다. 채널 운영자와 출연 전문가를 구분했으며, 개인 면허 확인을 뜻하지 않습니다.</p>
      <nav class="channel-section-nav" aria-label="채널 분석 바로가기"><a href="#channel-type-distribution">유형 내 분포</a><a href="#channel-composition">위험도별 구성</a><a href="#channel-concentration">집중도 비교</a><a href="#channel-results">채널별 결과</a></nav>
      <section id="channel-type-distribution" class="channel-section" aria-labelledby="channel-type-title"><div class="channel-section-heading"><span>03</span><div><h4 id="channel-type-title">유형 내 위험 분포</h4><p>각 유형의 전체 주장을 100%로 놓고 낮음·중간·높음의 비율을 비교합니다.</p></div></div>
        <div class="channel-distribution-toolbar"><div class="risk-legend"><span><i class="legend-swatch legend-low" aria-hidden="true"></i>낮음</span><span><i class="legend-swatch legend-moderate" aria-hidden="true"></i>중간</span><span><i class="legend-swatch legend-high" aria-hidden="true"></i>높음</span></div><span>오른쪽 수치: 유형 내 고위험률</span></div>
        {render_distribution(data)}<p class="channel-footnote">막대·건수를 누르면 해당 주장을 볼 수 있습니다. 수의사 관련 유형에는 수의사팀을 내세운 브랜드도 포함됩니다.</p>
      </section>
      <section id="channel-composition" class="channel-section" aria-labelledby="channel-composition-title"><div class="channel-section-heading"><span>04</span><div><h4 id="channel-composition-title">각 위험도 집합의 채널 구성</h4><p>각 위험도에 속한 주장 중 어떤 채널 유형이 차지하는 비중이 큰지 확인합니다.</p></div></div>
        {render_composition(data)}<p class="channel-footnote">비율은 각 열의 전체 주장 수를 분모로 계산합니다. 건수는 채널 수가 아닌 주장 수입니다.</p>
      </section>
      <section id="channel-concentration" class="channel-section" aria-labelledby="channel-concentration-title"><div class="channel-section-heading"><span>05</span><div><h4 id="channel-concentration-title">위험도별 집중도</h4><p>각 위험도에서 최다 채널과 상위 2개 채널에 주장이 얼마나 집중되는지 비교합니다.</p></div></div>
        {render_concentration(data)}<p class="channel-footnote">한 채널이 여러 위험도에 나타날 수 있으므로 위험도별 채널 수를 합산하지 않습니다.</p>
      </section>
      <section id="channel-results" class="channel-section" aria-labelledby="channel-results-title"><div class="channel-section-heading"><span>06</span><div><h4 id="channel-results-title">채널별 결과</h4><p>23개 채널의 위험도별 건수와 채널 유형의 분류 근거를 확인합니다.</p></div></div>
        {render_results(data)}
      </section>
      <div class="channel-resources"><a class="section-data-download" href="./assets/analysis/channel_analysis.json" download>분류 근거·집계 JSON <span aria-hidden="true">↓</span></a></div>
    </section>'''
