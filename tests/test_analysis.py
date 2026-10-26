import importlib.util
import csv
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / 'scripts'))
spec = importlib.util.spec_from_file_location('analysis_export', SITE / 'scripts' / 'export_analysis.py')
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)
from analysis_downloads import claim_table, csv_value


class AnalysisExportTests(unittest.TestCase):
    def setUp(self):
        self.summary = json.loads((SITE / 'assets/analysis/summary.json').read_text())

    def test_download_csv_preserves_the_public_cohort_and_all_claim_fields(self):
        data = json.loads((SITE / 'assets/analysis/rq1_claims.json').read_text())
        table = claim_table(data)
        with (SITE / 'assets/analysis/claims.csv').open(encoding='utf-8-sig', newline='') as handle:
            exported = list(csv.reader(handle))
        self.assertEqual(exported[0], table['headers'])
        self.assertEqual(exported[1:], [[str(csv_value(value)) for value in row] for row in table['rows']])
        self.assertEqual(len(exported) - 1, self.summary['primary']['n'])
        self.assertEqual({row[0] for row in exported[1:]}, {row['claim_id'] for row in data['claims']})
        for name, digest in json.loads((SITE / 'assets/analysis/manifest.json').read_text())['downloads']['sha256'].items():
            self.assertEqual(hashlib.sha256((SITE / 'assets/analysis' / name).read_bytes()).hexdigest(), digest)

    def test_combined_and_individual_workbooks_preserve_all_csv_values_and_missing_rates(self):
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        data = json.loads((SITE / 'assets/analysis/rq1_claims.json').read_text())
        table = claim_table(data)
        expected = [[table['headers'], *table['rows']]]
        for name in ['channel_summary.csv', 'type_summary.csv']:
            with (SITE / 'assets/analysis' / name).open(encoding='utf-8-sig', newline='') as handle:
                expected.append(list(csv.reader(handle)))
        datasets = list(zip(['주장 309건', '채널별 집계', '유형별 집계'], expected))
        files = [('analysis_data.xlsx', datasets)] + [
            (name, [dataset]) for name, dataset in zip(
                ['claims.xlsx', 'channel_summary.xlsx', 'type_summary.xlsx'], datasets)]
        for filename, tables in files:
          with self.subTest(filename=filename), zipfile.ZipFile(SITE / 'assets/analysis' / filename) as archive:
            shared = ET.fromstring(archive.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in archive.namelist() else []
            strings = [''.join(item.itertext()) for item in shared]
            workbook = ET.fromstring(archive.read('xl/workbook.xml'))
            self.assertEqual([sheet.get('name') for sheet in workbook.find('s:sheets', ns)],
                             [name for name, _ in tables])
            for index, (_, rows) in enumerate(tables, 1):
                sheet = ET.fromstring(archive.read(f'xl/worksheets/sheet{index}.xml'))
                cells = {}
                for cell in sheet.findall('.//s:sheetData/s:row/s:c', ns):
                    value = cell.find('s:v', ns)
                    text = value.text if value is not None and value.text is not None else ''
                    if cell.get('t') == 's': text = strings[int(text)]
                    if cell.get('t') == 'inlineStr': text = ''.join(cell.find('s:is', ns).itertext())
                    self.assertIsNone(cell.find('s:f', ns), cell.get('r'))
                    self.assertNotEqual(cell.get('t'), 'e', cell.get('r'))
                    cells[cell.get('r')] = text
                for r, values in enumerate(rows, 1):
                    for c, value in enumerate(values, 1):
                        column, number = '', c
                        while number:
                            number, digit = divmod(number - 1, 26)
                            column = chr(65 + digit) + column
                        actual = cells.get(f'{column}{r}', '')
                        # CSV percentages/counts are strings; XLSX retains numeric types.
                        if r > 1 and rows[0][c - 1].endswith('_pct') and value != '':
                            self.assertEqual(float(actual), float(value))
                        else:
                            self.assertEqual(actual, str(value), (index, r, c))
                self.assertEqual(sheet.find('.//s:pane', ns).get('state'), 'frozen')

    def test_detail_cohort_matches_every_chart_and_reviewed_grade(self):
        data = json.loads((SITE / 'assets/analysis/rq1_claims.json').read_text())
        self.assertEqual(len(data['claims']), 309)
        self.assertEqual(len({row['claim_id'] for row in data['claims']}), 309)
        for field in ['intervention_type', 'claimed_outcome', 'misinformation_theme']:
            self.assertEqual(set(data['labels'][field]), set(self.summary['groupings'][field]))
            for code, group in self.summary['groupings'][field].items():
                rows = [row for row in data['claims'] if code in row[field]]
                self.assertEqual(len(rows), group['n'], (field, code))
                self.assertEqual(len({row['video_id'] for row in rows}), group['videos'])
                self.assertEqual(sum(row['risk_level'] == 'high' for row in rows), group['high_n'])
                for grade, count in group['evidence'].items():
                    self.assertEqual(sum(row['evidence'] == grade for row in rows), count)
        for grade, group in self.summary['evidence_risk'].items():
            for risk in ['low', 'moderate', 'high']:
                self.assertEqual(sum(row['evidence'] == grade and row['risk_level'] == risk for row in data['claims']), group.get(risk, 0))
        supplements = [row for row in data['claims'] if 'supplement' in row['intervention_type']]
        self.assertEqual(len(supplements), 213)
        self.assertEqual(len({row['video_id'] for row in supplements}), 37)
        # The public detail export is an allowlist, not a copy of private snapshots.
        serialized = json.dumps(data)
        for private in ['transcript_source', 'context_segments', 'transcription_id', 'config', '/Users/', 'original_evidence']:
            self.assertNotIn(private, serialized)

    def test_channel_audit_and_detail_links_share_the_exact_cohort(self):
        data = json.loads((SITE / 'assets/analysis/channel_analysis.json').read_text())
        claims = json.loads((SITE / 'assets/analysis/rq1_claims.json').read_text())
        self.assertEqual(len(data['channels']), 23)
        self.assertEqual(len(data['types']), 5)
        self.assertNotIn('pharmacist', data['types'])
        self.assertEqual(set(data['types']), set(claims['labels']['channel_type']))
        for channel in data['channels']:
            rows = [row for row in claims['claims'] if row['channel_id'] == channel['channel_id']]
            self.assertEqual(len(rows), channel['claims'])
            self.assertTrue(all(row['channel_type'] == channel['channel_type'] for row in rows))
            for risk in ['low', 'moderate', 'high']:
                self.assertEqual(sum(row['risk_level'] == risk for row in rows), channel[risk])
        for code, group in data['types'].items():
            rows = [row for row in claims['claims'] if row['channel_type'] == code]
            self.assertEqual(len(rows), group['claims'])
            for risk in ['low', 'moderate', 'high']:
                self.assertEqual(sum(row['risk_level'] == risk for row in rows), group[risk])
        self.assertEqual(data['concentration']['high']['top_channel_share_pct'], 72.58)
        self.assertEqual(data['concentration']['high']['top_two_share_pct'], 83.87)

    @unittest.skipUnless(analysis.SOURCE.exists(), 'Frozen research inputs are only available in the source project')
    def test_modified_review_input_is_rejected(self):
        summary = json.loads((analysis.SOURCE / 'analysis_summary.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            review = Path(temp)
            (review / 'input_snapshot.json').write_text('[]')
            with self.assertRaisesRegex(ValueError, 'source hash mismatch'):
                analysis.rq1_claim_data(analysis.SOURCE, review, summary)


if __name__ == '__main__':
    unittest.main()
