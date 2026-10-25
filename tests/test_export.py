import importlib.util
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('public_export', Path(__file__).resolve().parents[1] / 'scripts' / 'export_data.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExportTests(unittest.TestCase):
    def test_public_snapshot_excludes_deletions_and_configuration_and_keeps_partial_text(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir()
            c = sqlite3.connect(root / 'data' / 'app.sqlite3')
            c.executescript('''
                CREATE TABLE jobs (id,video_id,status,created_at,updated_at,analysis_id,transcription_id,metadata,config);
                CREATE TABLE job_deletions (job_id);
                CREATE TABLE claims (id,job_id,batch,suggested,occurrences,review_status);
                CREATE TABLE claim_deletions (claim_id);
                CREATE TABLE reviews (claim_id,labels,reviewer,reason,created_at);
                CREATE TABLE claim_validations (claim_id,report);
                CREATE TABLE video_assessments (job_id,suggested,review_status);
                CREATE TABLE comment_snapshots (video_id,status,retrieved_at,comments);
                CREATE TABLE collections (id,method,query,created_at,query_language);
                CREATE TABLE collected_videos (id,video_id,rank,metadata,collection_id);
            ''')
            for job_id in ('active', 'retired'):
                c.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)', (job_id,'abcdefghijk','completed','2026-10-20','2026-10-20','analysis','text',json.dumps({'title':'공개 제목','view_count':0,'private_path':'secret-path'}),json.dumps({'OPENAI_API_KEY':'secret-key','prompt':'private-prompt'})))
            c.execute('INSERT INTO job_deletions VALUES (?)', ('retired',))
            for claim_id in ('visible', 'deleted'):
                c.execute('INSERT INTO claims VALUES (?,?,?,?,?,?)', (claim_id,'active',0,json.dumps({'evidence':'E2','risk_level':'low'}),'[]','pending_manual_review'))
            c.execute('ALTER TABLE claims ADD COLUMN "gpt-6"')
            original = c.execute('SELECT suggested FROM claims WHERE id="visible"').fetchone()[0]
            review = {'evidence':'E4','risk_level':'high','rationale':'새 판정 근거',
                      'original_suggested_sha256':hashlib.sha256(original.encode()).hexdigest()}
            c.execute('UPDATE claims SET "gpt-6"=? WHERE id="visible"',(json.dumps(review),))
            c.execute('INSERT INTO claim_deletions VALUES (?)',('deleted',))
            c.commit(); c.close()
            target = root / 'transcripts' / 'text'
            target.mkdir(parents=True)
            (target / 'transcript.partial.json').write_text(json.dumps({'text':'저장된 부분 전사','complete':False,'segments':[{'text':'저장된 부분 전사','start':-2,'end':3}]}))
            before = (root / 'data' / 'app.sqlite3').read_bytes()
            report = module.export(root, root / 'public')
            self.assertEqual(report['jobs'],1)
            self.assertEqual(report['claims'],1)
            index = json.loads((root / 'public' / 'index.json').read_text())
            job = index['jobs'][0]
            detail = json.loads((root / 'public' / job['detail']).read_text())
            self.assertEqual(job['grades'],{'E4':1})
            self.assertEqual(job['risks'],{'high':1})
            self.assertEqual(detail['claims'][0]['suggested']['evidence_rationale'],'새 판정 근거')
            self.assertIsNone(detail['video_assessment'])
            self.assertNotIn('original_evidence',json.dumps(detail))
            self.assertFalse(detail['transcript']['complete'])
            self.assertIsNone(detail['transcript']['segments'][0]['start'])
            self.assertEqual(detail['metadata']['view_count'],0)
            text = json.dumps(detail)
            for secret in ('secret-key','private-prompt','secret-path','private_path','retired','deleted'):
                self.assertNotIn(secret,text)
            self.assertEqual(before,(root / 'data' / 'app.sqlite3').read_bytes())
            # A refresh must remove the obsolete public snapshot, including old deleted content.
            old_path = root / 'public' / job['detail']
            c = sqlite3.connect(root / 'data' / 'app.sqlite3')
            review.update(evidence='E3')
            c.execute('UPDATE claims SET "gpt-6"=? WHERE id=?',(json.dumps(review),'visible'))
            c.commit();c.close()
            module.export(root, root / 'public')
            self.assertFalse(old_path.exists())
            published = (root / 'public' / 'index.json').read_bytes()
            c = sqlite3.connect(root / 'data' / 'app.sqlite3')
            c.execute('UPDATE claims SET suggested=? WHERE id="visible"',(json.dumps({'evidence':'E5'}),))
            c.commit()
            with self.assertRaisesRegex(ValueError,'stale'):
                module.export(root, root / 'public')
            self.assertEqual(published,(root / 'public' / 'index.json').read_bytes())
            c.execute('UPDATE claims SET "gpt-6"=NULL WHERE id="visible"')
            c.commit(); c.close()
            with self.assertRaisesRegex(ValueError,'missing'):
                module.export(root, root / 'public')


if __name__ == '__main__':
    unittest.main()
