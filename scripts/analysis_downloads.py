"""Prepare public, cohort-matched CSVs and the analysis workbook."""
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess


# Only the fields already published in rq1_claims.json are exported.
CLAIM_COLUMNS = [
    ('claim_id', '주장 ID'), ('title', '영상 제목'),
    ('claim_paraphrase', '주장 요약'), ('claim_text', '주장 원문'),
    ('evidence', '근거 등급'), ('risk_level', '위험도 코드'),
    ('channel', '채널명'), ('channel_type', '채널 유형 코드'),
    ('intervention_type', '영양 개입 코드'), ('claimed_outcome', '주장 결과 코드'),
    ('misinformation_theme', '주제 코드'), ('evidence_rationale', '판정 근거'),
    ('context_qualifier', '조건·맥락'), ('claim_unit_label', '주장 단위'),
    ('url', 'YouTube URL'), ('occurrences', '인용 구간 JSON'),
    ('row_number', '원자료 행 번호'), ('job_id', '분석 이력 ID'),
    ('video_id', '영상 ID'), ('channel_id', '채널 ID'), ('channel_label', '채널 코드'),
]


def flat_value(value):
    if isinstance(value, list):
        if all(isinstance(item, str) for item in value):
            return '; '.join(value)
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return '' if value is None else value


def csv_value(value):
    # Match the viewer's protection for spreadsheet formula-like text and IDs.
    if isinstance(value, str) and re.match(r'^\s*[=+\-@\t\r]', value):
        return "'" + value
    return value


def claim_table(data):
    return {
        'name': '주장 309건', 'table_name': 'AnalysisClaims',
        'headers': [label for _, label in CLAIM_COLUMNS],
        'rows': [[flat_value('https://www.youtube.com/watch?v=' + row['video_id']
                             if key == 'url' else row.get(key)) if key != 'occurrences'
                  else json.dumps(row.get(key, []), ensure_ascii=False, separators=(',', ':'))
                  for key, _ in CLAIM_COLUMNS] for row in data['claims']],
        'source': 'assets/analysis/rq1_claims.json',
        'scope': '영상별 최신 이력의 적격 주장 309건. 다중 태그는 세미콜론으로 구분.',
    }


def read_csv_table(path, name, table_name):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.reader(handle)
        headers = next(reader)
        rows = list(reader)
    for row in rows:
        for i, header in enumerate(headers):
            if re.fullmatch(r'(영상수|주장수|채널수|낮음|중간|높음)', header):
                row[i] = int(row[i])
            elif header.endswith('_pct') and row[i] != '':
                row[i] = float(row[i])
    return {'name': name, 'table_name': table_name, 'headers': headers, 'rows': rows,
            'source': 'assets/analysis/' + path.name,
            'scope': '309개 적격 주장 기준. pct 열은 0–100 단위의 백분율.'}


def export_downloads(site, claims, channel_source):
    assets = site / 'assets' / 'analysis'
    table = claim_table(claims)
    with (assets / 'claims.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(table['headers'])
        writer.writerows([[csv_value(value) for value in row] for row in table['rows']])
    shutil.copyfile(channel_source / 'type_summary.csv', assets / 'type_summary.csv')
    tables = [table,
              read_csv_table(assets / 'channel_summary.csv', '채널별 집계', 'ChannelSummary'),
              read_csv_table(assets / 'type_summary.csv', '유형별 집계', 'TypeSummary')]
    tables[2]['scope'] += ' 관측값이 없는 유형도 원본대로 포함.'
    output_dir = Path(__file__).resolve().parents[2] / 'outputs' / 'analysis-downloads-2026-10-26'
    subprocess.run(['node', str(Path(__file__).with_name('build_analysis_workbook.mjs')),
                    '--site', str(site.resolve()), '--output-dir', str(output_dir)],
                   input=json.dumps({'analysis_date': claims['analysis_date'],
                                     'review_id': claims['review_id'], 'tables': tables}, ensure_ascii=False),
                   text=True, check=True)
    names = ['claims.csv', 'channel_summary.csv', 'type_summary.csv', 'analysis_data.xlsx',
             'claims.xlsx', 'channel_summary.xlsx', 'type_summary.xlsx']
    return {'claims': len(table['rows']), 'channels': len(tables[1]['rows']),
            'type_rows': len(tables[2]['rows']),
            'sha256': {name: hashlib.sha256((assets / name).read_bytes()).hexdigest() for name in names}}
