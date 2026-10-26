#!/usr/bin/env python3
"""Publish the approved RQ1–3 report and aggregate charts as static GitHub Pages files.

Uses the Python standard library and managed Artifact Tool for XLSX generation.
Reads the report folder without changing its files.
Only selected public claim fields are bundled; full transcripts, configuration,
local databases and personal filesystem paths are excluded.
"""
import argparse
from collections import Counter
import hashlib
from html import escape
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlencode

import export_codebook as markdown
from channel_analysis import load_channel_data, render_channel_analysis
from analysis_downloads import export_downloads

SITE = Path(__file__).resolve().parents[1]
SOURCE = SITE.parent / 'outputs' / 'rq1-3-gpt6-2026-10-25'
REVIEW_SOURCE = SITE.parent / 'data' / 'reviews' / 'gpt-6-2026-10-21'
CHANNEL_SOURCE = SITE.parent / 'outputs' / 'channel-risk-2026-10-25'
LABELS = {
    'intervention_type': {
        'supplement': '보충제', 'single_ingredient': '단일 식품·성분', 'general_dietary_advice': '일반 식이 조언',
        'mixed_combination_dietary_intervention': '복합·병용 영양 개입', 'food_avoidance_dietary_exclusion': '특정 음식 회피·제외',
        'commercial_dry_wet_diet': '시판 건식·습식 사료', 'assisted_feeding_nutritional_support': '보조급여·영양 지원',
        'topper_treat': '토퍼·간식', 'feeding_restriction': '급여 제한', 'ketogenic_low_carbohydrate_diet': '케톤·저탄수화물 식단',
        'no_intervention_mentioned': '개입 명시 없음', 'home_cooked_diet': '가정 조리식·수제식',
        'commercial_cooked_fresh_diet': '시판 조리식·신선식', 'prescription_therapeutic_diet': '처방·치료식',
        'raw_diet': '생식', 'unclear': '불명확',
    },
    'claimed_outcome': {
        'disease_or_symptom_mangement': '질환·증상 관리', 'treatment_tolerance': '치료 내약성·치료 중 관리',
        'general_health_or_wellness': '일반 건강·웰니스', 'tumor_shrinkage': '종양 축소',
        'nutritional_adequacy_or_food_safety': '영양 적절성·식품안전', 'immune_boost': '면역 증진',
        'prevention_or_risk_reduction': '암 예방·위험 감소', 'body_condition_or_physical_function': '신체 상태·신체 기능',
        'quality_of_life': '삶의 질', 'inflammation_reduction': '염증 감소', 'survival': '생존',
        'cachexia_prevention': '악액질 예방', 'replacement_of_veterinary_treatment': '수의학적 치료 대체',
        'appetite_improvement': '식욕 개선', 'unclear': '불명확', 'cure': '완치', 'detoxification': '해독',
    },
    'misinformation_theme': {
        'supplement_as_anti_cancer_therapy': '보충제를 항암치료로 제시',
        'single_nutrient_or_ingredient_therapeutic_effect': '단일 영양소·성분의 치료효과',
        'immune_enhancement_as_cancer_therapy': '면역 증진을 암 예방·치료로 연결',
        'commercialized_vague_health_claim': '모호한 상업적 건강효과',
        'commercial_product_potency_or_selection_claim': '제품 효능·선택의 우열 주장',
        'universal_cancer_diet': '모든 암 환자에 식단 일반화',
        'antioxidant_chemotherapy_interaction_claim': '항산화제·항암치료 상호작용 일반화',
        'carbohydrate_sugar_absolutism': '탄수화물·당 절대주의',
        'ingredient_carcinogenicity_or_natural_safety_framing': '성분 발암성·천연 안전성 단정',
        'none_identified': '문제되는 주제 확인 없음', 'not_assessable': '주제 판정 불가',
        'detox_or_alkaline_pseudoscience': '해독·알칼리 치료 주장',
        'raw_natural_diet_as_immune_therapy': '생식·자연식을 면역치료로 제시',
    },
}
EVIDENCE = {'E0': '근거 부합', 'E1': '과잉 일반화', 'E2': '핵심 맥락 누락',
            'E3': '근거 부족 효과 주장', 'E4': '오도·근거 충돌', 'E5': '위험 행동 직접 유도'}
RISK = {'low': '낮음', 'moderate': '중간', 'high': '높음'}


def percent(n, total):
    return f'{n / total * 100:.2f}'


def figure_link(name, title):
    return (f'<a class="figure-open" href="./assets/analysis/figures/{name}.png" '
            f'data-figure="{name}" data-figure-title="{escape(title)}">원본 그래프 ↗</a>')


def report_href(url):
    mapping = {'../../codebook.html': './codebook.html', '../../index.html': './index.html',
               'summary.json': './assets/analysis/summary.json', 'manifest.json': './assets/analysis/manifest.json'}
    if url.startswith('figures/'):
        return './assets/analysis/' + url
    if url in mapping:
        return mapping[url]
    raise ValueError('Unexpected link in public report: ' + url)


def report_inline(text):
    result = []
    for token in re.split(r'(!?\[[^\]]*\]\([^)]*\)|`[^`]+`|\*\*[^*]+\*\*)', text):
        link = re.fullmatch(r'(!?)\[([^\]]*)\]\(([^)]*)\)', token)
        if link:
            is_image, label, target = link.groups()
            href = report_href(target.strip('<>'))
            if is_image:
                stem = Path(target).stem
                result.append(f'<a class="report-figure" href="{href}" data-figure="{escape(stem)}" '
                              f'data-figure-title="{escape(label)}"><img src="{href}" alt="{escape(label)}" '
                              f'loading="lazy" decoding="async"><span>그래프 확대 보기 ↗</span></a>')
            else:
                result.append(f'<a href="{href}">{escape(label)}</a>')
        elif token.startswith('`') and token.endswith('`'):
            result.append('<code>' + escape(token[1:-1]) + '</code>')
        elif token.startswith('**') and token.endswith('**'):
            result.append('<strong>' + report_inline(token[2:-2]) + '</strong>')
        else:
            result.append(escape(token))
    return ''.join(result)


def bar_chart(groups, labels, total, chart_id, *, risk=False, limit=None, detail_field=None):
    items = [(code, values) for code, values in groups.items() if code in labels]
    if risk:
        items.sort(key=lambda item: (-item[1]['high_n']/item[1]['n'], -item[1]['n'], item[0]))
    else:
        items.sort(key=lambda item: (-item[1]['n'], item[0]))
    rows = []
    for i, (code, values) in enumerate(items):
        n, denominator = (values['high_n'], values['n']) if risk else (values['n'], total)
        rate = percent(n, denominator)
        visible = f'{n}<small>/{denominator} <span class="bar-percent">{rate}%</span></small>'
        label = labels[code]
        accessible = f'{label}: {denominator}개 중 {n}개, {rate}%'
        extra = ' data-extra hidden' if limit and i >= limit else ''
        content = (f'<span class="bar-label" aria-hidden="true">{escape(label)}</span>'
                    f'<span class="bar-track" aria-hidden="true"><span class="bar-fill" '
                    f'style="--bar-width:{n/denominator*100:.6f}%;--bar-delay:{min(i,7)*35}ms"></span></span>'
                    f'<span class="bar-number" aria-hidden="true">{visible}</span>')
        if detail_field:
            page = 'claims.html' if risk else 'rq1.html'
            filters = {'field': detail_field, 'code': code}
            if risk:
                filters['risk'] = 'high'
            href = f'./{page}?' + urlencode(filters)
            content = (f'<a class="bar-link" href="{escape(href)}" '
                       f'aria-label="{escape(accessible)}. 분류된 주장 보기">{content}</a>')
            row_label = ''
        else:
            row_label = f' aria-label="{escape(accessible)}"'
        rows.append(f'<li class="bar-row{" bar-linked" if detail_field else ""}" data-code="{code}" '
                    f'data-count="{n}" data-denominator="{denominator}"{row_label}{extra}>{content}</li>')
    return (f'<ul id="{chart_id}" class="bar-chart{ " risk-chart" if risk else ""}" '
            f'aria-label="{ "주제별 고위험 비율" if risk else "주장 유형별 빈도"}">' + ''.join(rows) + '</ul>'
            '<div class="bar-axis" aria-hidden="true"><span></span><div class="axis-ticks">'
            '<span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div><span></span></div>')


def evidence_chart(data):
    total = data['primary']['n']
    peak = max(data['primary']['evidence'].values())
    scale = ((peak + 19) // 20) * 20
    rows = []
    for code, label in EVIDENCE.items():
        n = data['primary']['evidence'][code]
        risks = data['evidence_risk'][code]
        href = './claims.html?' + urlencode({'field': 'evidence', 'code': code})
        segments = []
        breakdown = []
        for risk in RISK:
            count = risks.get(risk, 0)
            risk_href = href + '&risk=' + risk
            description = f'{code} {label}, 위험도 {RISK[risk]} {count}개. 분류된 주장 보기'
            if count:
                segments.append(f'<a class="risk-segment {risk} legend-{risk}" href="{escape(risk_href)}" '
                                f'data-risk="{risk}" data-count="{count}" '
                                f'aria-label="{escape(description)}" title="{RISK[risk]} {count}개 · 주장 보기" '
                                f'style="width:{count/n*100:.6f}%"><span aria-hidden="true">'
                                f'{count if count >= 5 else ""}</span></a>')
            text = f'{RISK[risk]} <strong>{count}개</strong> · {percent(count,n)}%'
            breakdown.append(f'<a href="{escape(risk_href)}" aria-label="{escape(description)}">{text}</a>'
                             if count else f'<span>{text}</span>')
        rows.append(f'<li class="evidence-row" data-code="{code}"><div class="evidence-grid">'
                    f'<a class="evidence-label" href="{escape(href)}" aria-label="{code} {label}, 전체 {n}개 주장 보기"><b>{code}</b>{label}</a>'
                    f'<div class="evidence-stack" style="--count-width:{n/scale*100:.6f}%">{ "".join(segments)}</div>'
                    f'<a class="bar-number" href="{escape(href)}" aria-label="{code} 전체 {n}개 주장 보기">'
                    f'{n}<small>개 <span class="bar-percent">{percent(n,total)}%</span></small></a>'
                    '</div><div class="evidence-breakdown">' + ''.join(breakdown) + '</div></li>')
    ticks = ''.join(f'<span>{v}</span>' for v in range(0,scale+1,scale//4))
    return (f'<ul id="evidence-chart" class="evidence-chart" data-mode="count" aria-label="근거 등급별 위험도">{ "".join(rows)}</ul>'
            '<div class="bar-axis" aria-hidden="true"><span></span><div id="evidence-axis" class="axis-ticks" '
            f'data-count-ticks="{ ",".join(str(v) for v in range(0,scale+1,scale//4))}">{ticks}</div><span></span></div>')


def rq1_claim_data(source, review_source, data):
    """Join the frozen RQ1/RQ3 tags to reviewed grades using the report's exact cohort."""
    inputs = {}
    for name in ['input_snapshot.json', 'review_results.json']:
        raw = (review_source / name).read_bytes()
        expected = data['source_hashes'][f'data/reviews/{data["review_id"]}/{name}']
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError(f'RQ1 source hash mismatch: {name}')
        inputs[name] = json.loads(raw)
    snapshots = {row['id']: row for row in inputs['input_snapshot.json']}
    reviews = {row['claim_id']: row for row in inputs['review_results.json']}
    membership = json.loads((source / 'cohort_membership.json').read_text(encoding='utf-8'))
    claims = []
    for member in membership:
        if not member['in_primary']:
            continue
        claim_id = member['claim_id']
        snapshot, review = snapshots[claim_id], reviews[claim_id]
        assert member['is_latest_completed'] and review['claim_unit_status'] == 'eligible'
        assert snapshot['job_id'] == review['job_id'] == member['job_id']
        assert snapshot['video_id'] == review['video_id'] == member['video_id']
        suggested, metadata = snapshot['suggested'], snapshot['metadata']
        claims.append({
            'claim_id': claim_id, 'row_number': member['row_number'], 'job_id': snapshot['job_id'],
            'video_id': snapshot['video_id'], 'title': metadata.get('title') or snapshot['video_id'],
            'channel': metadata.get('channel') or metadata.get('channel_title') or '채널 미제공',
            'channel_id': metadata['channel_id'], 'claim_text': suggested['claim_text'],
            'claim_paraphrase': suggested.get('claim_paraphrase', ''),
            'context_qualifier': suggested.get('context_qualifier', ''),
            **{field: suggested[field] for field in ['intervention_type', 'claimed_outcome', 'misinformation_theme']},
            'evidence': review['evidence'], 'risk_level': review['risk_level'],
            'evidence_rationale': review['rationale'], 'claim_unit_label': review['claim_unit_label'],
            'occurrences': [{key: occurrence.get(key) for key in ['start', 'end', 'source_quote', 'quote_match']}
                            for occurrence in snapshot.get('occurrences', [])],
        })
    claims.sort(key=lambda row: row['row_number'])
    assert len(claims) == len({row['claim_id'] for row in claims}) == data['primary']['n']
    assert len({row['video_id'] for row in claims}) == data['primary']['videos']
    assert len({row['channel_id'] for row in claims}) == data['primary']['channels']
    for field in ['evidence', 'risk_level']:
        assert dict(Counter(row[field] for row in claims)) == data['primary']['risk' if field == 'risk_level' else field]
    for grade, risks in data['evidence_risk'].items():
        for risk, expected in risks.items():
            assert sum(row['evidence'] == grade and row['risk_level'] == risk for row in claims) == expected
    for field in ['intervention_type', 'claimed_outcome', 'misinformation_theme']:
        for code, expected in data['groupings'][field].items():
            selected = [row for row in claims if code in row[field]]
            assert len(selected) == expected['n'], (field, code)
            assert len({row['video_id'] for row in selected}) == expected['videos'], (field, code)
            assert sum(row['risk_level'] == 'high' for row in selected) == expected['high_n'], (field, code)
    return {'analysis_date': data['analysis_date'], 'review_id': data['review_id'],
            'cohort_rule': data['cohort_rule'], 'primary': data['primary'],
            'labels': {field: LABELS[field] for field in ['intervention_type', 'claimed_outcome', 'misinformation_theme']},
            'evidence_labels': EVIDENCE, 'claims': claims}


def export_analysis(source, site, review_source=REVIEW_SOURCE, channel_source=CHANNEL_SOURCE):
    original = (source / 'RQ1-3_analysis.md').read_text(encoding='utf-8')
    data = json.loads((source / 'analysis_summary.json').read_text(encoding='utf-8'))
    n = data['primary']['n']
    # These narrative conclusions refer to this reviewed snapshot; reject a mismatched input.
    assert data['review_id'] == 'gpt-6-2026-10-21' and n == 309
    assert data['primary']['risk']['high'] == 62 and data['high_risk_channel_counts']['C01'] == 45
    assert '213/309 (68.93%)' in original and '62/309 (20.06%)' in original
    rq1_data = rq1_claim_data(source, review_source, data)
    channel_data = load_channel_data(channel_source, rq1_data)
    channel_html = render_channel_analysis(channel_data)
    assets = site / 'assets' / 'analysis'
    (assets / 'figures').mkdir(parents=True, exist_ok=True)
    (assets / 'rq1_claims.json').write_text(json.dumps(rq1_data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (assets / 'channel_analysis.json').write_text(json.dumps(channel_data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    shutil.copyfile(channel_source / 'channel_summary.csv', assets / 'channel_summary.csv')
    downloads = export_downloads(site, rq1_data, channel_source)
    names = ['rq1_interventions', 'rq2_evidence_risk', 'rq3_theme_risk']
    for name in names:
        shutil.copyfile(source / 'figures' / (name + '.png'), assets / 'figures' / (name + '.png'))

    # Retain every result, table, figure and limitation. Replace local-only source links with public resources.
    report = original.split('## 부록 C. 자료 출처와 재현 방법')[0].rstrip() + '''

## 부록 C. 자료 출처와 공개 자료

분석 기준은 `gpt-6-2026-10-21` 동결 재검토 데이터와 코드북 v2.2이다. 원자료 연결과 검산 방법은 본문의 분석 기준과 한계에 설명되어 있다.

- [코드북 v2.2](../../codebook.html)
- [공개 데이터 뷰어](../../index.html)
- [분석 집계 JSON](summary.json)
- [보고서 원본 해시와 공개본 정보](manifest.json)

이 공개본은 원 보고서의 결과·표·그림·해석을 유지하고, 연구 환경에서만 접근 가능한 파일 경로와 실행 명령을 공개 자료 링크로 대체했다.
'''
    (assets / 'RQ1-3_analysis.md').write_text(report, encoding='utf-8')
    public_data = {key: data[key] for key in ['analysis_date','review_id','cohort_rule','all_rows','latest_rows','all_eligible',
                   'primary','latest_unit_status','groupings','evidence_risk','sensitivity','high_risk_channel_counts','audit']}
    (assets / 'summary.json').write_text(json.dumps(public_data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    provenance = {'analysis_date': data['analysis_date'], 'review_id': data['review_id'],
                  'original_report_sha256': hashlib.sha256(original.encode()).hexdigest(),
                  'public_report_sha256': hashlib.sha256(report.encode()).hexdigest(),
                  'publication_change': 'Results unchanged; local-only source paths and run command replaced with public links.'}
    provenance['channel_audit'] = {'analysis_date': channel_data['analysis_date'],
                                 'displayed_types': len(channel_data['types']),
                                 'channels': len(channel_data['channels']),
                                 'source_sha256': channel_data['source_sha256']}
    provenance['downloads'] = downloads
    (assets / 'manifest.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    markdown.inline = report_inline
    body, _ = markdown.render(report)
    body = body.replace('id="codebook-', 'id="report-')
    report_anchors = {}
    for match in re.finditer(r'<h2 id="([^"]+)">([^<]+)</h2>',body):
        text = match[2]
        if 'RQ1' in text: report_anchors['rq1'] = match[1]
        if 'RQ2' in text: report_anchors['rq2'] = match[1]
        if 'RQ3' in text: report_anchors['rq3'] = match[1]
    assert set(report_anchors) == {'rq1','rq2','rq3'}
    header = re.search(r'<header class="site-header">.*?</header>', (site/'index.html').read_text(encoding='utf-8'),re.S)[0]
    header = header.replace(' aria-current="page"','').replace('href="./analysis.html"','href="./analysis.html" aria-current="page"')

    intervention = bar_chart(data['groupings']['intervention_type'], LABELS['intervention_type'], n, 'intervention-chart',limit=8,detail_field='intervention_type')
    outcome = bar_chart(data['groupings']['claimed_outcome'], LABELS['claimed_outcome'], n, 'outcome-chart',limit=8,detail_field='claimed_outcome')
    themes = {key:value for key,value in data['groupings']['misinformation_theme'].items()
              if value['n'] >= 10 and key not in {'none_identified', 'not_assessable'}}
    risk_chart = bar_chart(themes,LABELS['misinformation_theme'],n,'theme-chart',risk=True,detail_field='misinformation_theme')
    page = f'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#174e40">
  <meta name="description" content="49개 영상, 309개 적격 주장의 영양 개입·근거 관계·잠재적 임상 위험을 RQ1–3 그래프와 보고서로 확인하세요.">
  <title>PEP Viewer · RQ1–3 분석</title>
  <link rel="icon" href="./assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./src/styles.css">
  <link rel="stylesheet" href="./src/analysis.css">
  <link rel="stylesheet" href="./src/channel-analysis.css">
</head>
<body class="analysis-body">
  <a class="skip-link" href="#analysis-content">분석 본문으로 이동</a>
  {header}
  <main class="analysis-page">
    <section class="analysis-heading" aria-labelledby="analysis-title">
      <div><p class="eyebrow">반려동물 종양 영양 · 연구 결과</p><h1 id="analysis-title">RQ1–3 분석</h1>
      <p class="subtitle">YouTube 영양 주장의 유형, 근거 관계, 잠재적 임상 위험을 살펴봅니다.</p></div>
      <div class="analysis-heading-actions"><time datetime="2026-10-25">분석일 2026.10.25</time>
      <a class="analysis-download" href="./assets/analysis/RQ1-3_analysis.md" download>보고서 다운로드 <span aria-hidden="true">↓</span></a></div>
    </section>
    <nav class="analysis-data-downloads" aria-label="분석 자료 다운로드">
      <div class="analysis-data-scope"><strong>분석 자료 다운로드</strong><span>주장 309건 · 채널 23개 · XLSX는 집계 포함</span></div>
      <div class="analysis-data-links">
        <a class="analysis-data-excel" href="./assets/analysis/analysis_data.xlsx" download>전체 자료 XLSX <span aria-hidden="true">↓</span></a>
        <a href="./assets/analysis/claims.csv" download>주장 CSV <span aria-hidden="true">↓</span></a>
        <a href="./assets/analysis/channel_summary.csv" download>채널 CSV <span aria-hidden="true">↓</span></a>
        <a href="./assets/analysis/type_summary.csv" download>유형 CSV <span aria-hidden="true">↓</span></a>
      </div>
    </nav>
    <div class="analysis-layout">
      <nav class="analysis-toc" aria-label="분석 목차"><p class="analysis-toc-label">이 페이지에서</p>
        <a href="#overview" aria-current="location"><span>00</span>분석 개요</a>
        <a href="#rq1"><span>RQ1</span>주장 유형</a>
        <a href="#rq2"><span>RQ2</span>근거 관계</a>
        <a href="#rq3"><span>RQ3</span>임상 위험</a>
        <a href="#report"><span>04</span>보고서 전문</a>
        <p class="analysis-toc-note">재검토 기준<br>2026.10.21<br><br>AI 코딩 결과<br>사람 검토 대기</p>
      </nav>
      <div id="analysis-content" class="analysis-content" tabindex="-1">
        <section id="overview" class="analysis-section analysis-overview" aria-labelledby="overview-title">
          <div class="analysis-overview-top"><h2 id="overview-title">주분석 표본</h2><span class="analysis-source-label">영상별 최신 이력 · 적격 주장만 포함</span></div>
          <div class="cohort-metrics" aria-label="분석 표본"><div class="cohort-metric"><strong>309</strong><span>적격 주장</span></div><div class="cohort-metric"><strong>49</strong><span>영상</span></div><div class="cohort-metric"><strong>23</strong><span>채널</span></div></div>
          <p class="cohort-flow"><span>재검토 434행</span><span class="arrow" aria-hidden="true">→</span><span>최신 이력 400행</span><span class="arrow" aria-hidden="true">→</span><strong>적격 주장 309개</strong></p>
          <p class="analysis-note">이전 분석 이력 34행과 중복·비적격·불확실 91행을 제외했습니다. 모든 비율은 이 표본의 기술통계이며, 사람·전문가 합의로 확정된 결과는 아닙니다.</p>
        </section>
        <section id="rq1" class="analysis-section" aria-labelledby="rq1-title">
          <p class="section-kicker">RQ1 · 주장 유형</p><h2 id="rq1-title" class="section-title">어떤 영양 관련 주장이 나타나는가?</h2>
          <p class="section-deck">보충제와 개별 식품·성분에 관한 주장이 많습니다. 한 주장에 여러 유형이 부여될 수 있습니다.</p>
          <p class="chart-interaction-hint">막대를 클릭하면 해당 유형으로 분류된 주장과 세부 정보를 볼 수 있습니다. <span aria-hidden="true">↗</span></p>
          <div class="section-takeaway"><p class="takeaway-number">68.93<small>%</small></p><p class="takeaway-caption"><strong>보충제 관련 주장 213/309개</strong><br>37/49개 영상에서 등장</p></div>
          <div class="chart-toolbar"><div class="chart-tabs js-only" role="tablist" aria-label="RQ1 그래프 유형">
            <button id="tab-intervention" type="button" role="tab" aria-selected="true" aria-controls="panel-intervention" data-chart-tab="intervention">영양 개입</button>
            <button id="tab-outcome" type="button" role="tab" aria-selected="false" aria-controls="panel-outcome" tabindex="-1" data-chart-tab="outcome">주장 결과</button>
          </div><div class="chart-actions"><span class="chart-label">주장 수 / 309 · 비율</span>{figure_link('rq1_interventions','RQ1 영양 개입 유형')}</div></div>
          <div id="panel-intervention" class="chart-panel" role="tabpanel" aria-labelledby="tab-intervention" tabindex="0">
            {intervention}<div class="chart-foot"><p>상위 8개 유형 · 기존 모델 분류<br>다중 태그이므로 비율의 합이 100%를 넘을 수 있습니다.</p><button class="chart-expand js-only" type="button" data-expand-chart="intervention-chart" aria-expanded="false" aria-controls="intervention-chart" data-total="16">전체 16개 유형 보기 ↓</button></div>
          </div>
          <div id="panel-outcome" class="chart-panel" role="tabpanel" aria-labelledby="tab-outcome" tabindex="0" hidden>
            {outcome}<div class="chart-foot"><p>상위 8개 결과 · 기존 모델 분류<br>결과 태그에는 효과를 반박·교정하는 주장도 포함됩니다.</p><button class="chart-expand js-only" type="button" data-expand-chart="outcome-chart" aria-expanded="false" aria-controls="outcome-chart" data-total="17">전체 17개 유형 보기 ↓</button></div>
          </div>
          <a class="analysis-detail-link" href="#{report_anchors['rq1']}" data-report-link>RQ1 세부 표와 해석 <span aria-hidden="true">→</span></a>
        </section>
        <section id="rq2" class="analysis-section" aria-labelledby="rq2-title">
          <p class="section-kicker">RQ2 · 근거 관계</p><h2 id="rq2-title" class="section-title">주장은 근거와 어떤 관계를 맺는가?</h2>
          <p class="section-deck">핵심 맥락이 빠진 E2와 효과를 지지할 근거가 부족한 E3에 집중되어 있습니다.</p>
          <p class="chart-interaction-hint">등급명·전체 건수는 등급 전체, 막대의 색상 구간은 해당 위험도의 주장으로 연결됩니다. <span aria-hidden="true">↗</span></p>
          <div class="section-takeaway"><p class="takeaway-number">69.90<small>%</small></p><p class="takeaway-caption"><strong>E2 + E3 주장 216/309개</strong><br>맥락 누락 109개 · 근거 부족 효과 주장 107개</p></div>
          <div class="chart-toolbar"><div class="chart-mode js-only" role="group" aria-label="근거 등급 그래프 표시 기준"><button type="button" data-evidence-mode="count" aria-pressed="true">주장 수</button><button type="button" data-evidence-mode="percent" aria-pressed="false">등급 내 위험 비율</button></div>{figure_link('rq2_evidence_risk','근거 등급에 따른 위험도 분포')}</div>
          <div class="risk-legend" aria-label="위험도 범례"><span><i class="legend-swatch legend-low" aria-hidden="true"></i>낮음 97</span><span><i class="legend-swatch legend-moderate" aria-hidden="true"></i>중간 150</span><span><i class="legend-swatch legend-high" aria-hidden="true"></i>높음 62</span></div>
          {evidence_chart(data)}
          <div class="chart-foot"><p id="evidence-mode-help" role="status">가로축: 주장 수. 오른쪽은 등급별 전체 주장 수와 309개 중 비율입니다.<br>등급명·전체 건수 또는 위험도별 막대·건수를 누르면 해당 주장 목록으로 이동합니다.</p></div>
          <p class="analysis-note">근거 등급과 위험도는 서로 다른 변수입니다. E1–E5 전체를 ‘명백한 허위’로 해석하거나, 등급의 평균을 계산하지 않았습니다.</p>
          <a class="analysis-detail-link" href="#{report_anchors['rq2']}" data-report-link>RQ2 주제 분류와 판정 예시 <span aria-hidden="true">→</span></a>
        </section>
        <section id="rq3" class="analysis-section" aria-labelledby="rq3-title">
          <p class="section-kicker">RQ3 · 잠재적 임상 위험</p><h2 id="rq3-title" class="section-title">어떤 주장 유형의 위험도가 높은가?</h2>
          <p class="section-deck">보충제를 항암치료로 제시하는 주제와 제품 효능·선택의 우열 주장에서 높은 고위험 비율이 나타납니다.</p>
          <p class="chart-interaction-hint">막대를 클릭하면 해당 주제의 고위험 주장을 볼 수 있습니다. 상세 페이지에서 주제 전체로 전환할 수 있습니다. <span aria-hidden="true">↗</span></p>
          <div class="section-takeaway"><p class="takeaway-number">20.06<small>%</small></p><p class="takeaway-caption"><strong>고위험 주장 62/309개</strong><br>16/49개 영상 · 7/23개 채널</p></div>
          <div class="chart-toolbar"><span class="chart-label">주제 내 고위험 주장 수 / 전체 · 비율</span>{figure_link('rq3_theme_risk','주제별 고위험 비율')}</div>
          {risk_chart}
          <div class="chart-foot"><p>10개 이상인 주제만 표시 · 다중 태그 · 기존 주제 분류 × GPT-6 위험도<br>교정 발화도 포함되며, 작은 범주를 포함한 전체 결과는 보고서 전문에서 확인할 수 있습니다.</p></div>
          <div class="chart-denominator"><span>고위험 중 보충제 유형 <strong>55/62 (88.71%)</strong></span><span>치료 지연·거부 영역 <strong>36/62 (58.06%)</strong></span></div>
          <div class="concentration"><div class="concentration-heading"><h3>고위험 주장의 채널 집중도</h3><p class="concentration-number">72.58<small>%</small></p><p class="concentration-caption">한 채널에서 45/62개</p></div>
            <div class="concentration-content"><p>채널 C01의 101개 주장 중 45개가 고위험입니다.<br>이 채널을 제외하면 전체 고위험률은 <strong>8.17% (17/208)</strong>입니다.</p><div class="concentration-strip" aria-hidden="true"><span></span></div><div class="concentration-legend"><span>C01 · 45개</span><span>나머지 채널 · 17개</span></div><p class="concentration-caveat">표본 구성의 영향이 큽니다. 이 결과를 YouTube 전체의 고위험 비율로 일반화할 수 없습니다.</p></div>
          </div>
          {channel_html}
          <a class="analysis-detail-link" href="#{report_anchors['rq3']}" data-report-link>RQ3 위험 영역과 세부 표 <span aria-hidden="true">→</span></a>
        </section>
        <section id="report" class="analysis-section" aria-labelledby="report-title">
          <h2 id="report-title" class="section-title">보고서 전문</h2>
          <details id="full-report" class="report-disclosure"><summary>전체 보고서와 세부 표 읽기</summary><article class="report-document" aria-label="RQ1–3 보고서 전문">{body}</article></details>
          <div class="report-resources"><a href="./assets/analysis/RQ1-3_analysis.md" download>보고서 Markdown <span aria-hidden="true">↓</span></a><a href="./assets/analysis/summary.json" download>분석 집계 JSON <span aria-hidden="true">↓</span></a><a href="./codebook.html">코드북 2.2 <span aria-hidden="true">↗</span></a></div>
        </section>
      </div>
    </div>
    <footer class="site-footer analysis-footer"><span>PEP · 반려동물 영양 주장 분석</span><span>2026.10.21 재검토 데이터 · 2026.10.25 분석</span></footer>
  </main>
  <dialog id="figure-dialog" class="figure-dialog" aria-labelledby="figure-title"><div class="dialog-header"><h2 id="figure-title">분석 그래프</h2><div class="figure-dialog-actions"><button id="figure-zoom" type="button" aria-pressed="false">원본 크기</button><a id="figure-download" download>PNG 다운로드 ↓</a><button id="figure-close" class="icon-button" type="button" aria-label="그래프 닫기">✕</button></div></div><div id="figure-viewport" class="figure-viewport" data-zoom="false"><img id="figure-image" alt=""></div></dialog>
  <script type="module" src="./src/analysis.js"></script>
</body>
</html>
'''
    assert '/Users/' not in page and 'file://' not in page
    (site/'analysis.html').write_text(page,encoding='utf-8')
    # Both routes share the same detail UI; retain existing RQ1 bookmarks.
    detail = (site/'rq1.html').read_text(encoding='utf-8')
    detail = detail.replace('RQ1 주장 상세', 'RQ1–3 주장 상세').replace('RQ1 · 주장 유형', 'RQ1–3 · 분류된 주장')
    detail = detail.replace('RQ1 그래프에서 선택한 영양 개입·주장 결과의', '분석 그래프에서 선택한 분류의')
    detail = detail.replace('RQ1 그래프로 돌아가기', '분석 그래프로 돌아가기').replace('./analysis.html#rq1', './analysis.html')
    detail = detail.replace('RQ1 주장 데이터 다운로드', '분석 주장 데이터 다운로드')
    (site/'claims.html').write_text(detail,encoding='utf-8')
    print(json.dumps({'page':str(site/'analysis.html'),'claims':n,'figures':len(names),
                      'report_tables':body.count('<table>'),'rq1_detail_claims':len(rq1_data['claims'])},ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=SOURCE)
    parser.add_argument('--site',type=Path,default=SITE)
    parser.add_argument('--review-source',type=Path,default=REVIEW_SOURCE)
    parser.add_argument('--channel-source',type=Path,default=CHANNEL_SOURCE)
    args = parser.parse_args()
    export_analysis(args.source,args.site,args.review_source,args.channel_source)
