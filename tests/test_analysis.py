import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / 'scripts'))
spec = importlib.util.spec_from_file_location('analysis_export', SITE / 'scripts' / 'export_analysis.py')
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class AnalysisExportTests(unittest.TestCase):
    def setUp(self):
        self.summary = json.loads((SITE / 'assets/analysis/summary.json').read_text())

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
