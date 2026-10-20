#!/usr/bin/env python3
"""Export a public, read-only snapshot. Only stdlib; never starts the application."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_JOB_KEYS = ('id', 'video_id', 'status', 'created_at', 'updated_at', 'analysis_id', 'transcription_id')
METADATA_KEYS = ('title', 'description', 'channel', 'channel_title', 'channel_id', 'duration', 'view_count',
                 'like_count', 'comment_count', 'published_at', 'retrieved_at', 'availability')


def decoded(value, default=None):
    if value is None:
        return default
    return json.loads(value)


def cached_transcript(target):
    """Match the app's saved-chunk assembly, without importing workers or API clients."""
    manifest = target / 'manifest.json'
    if not manifest.is_file():
        return None
    segments, warnings = [], []
    for chunk in json.loads(manifest.read_text(encoding='utf-8')).get('chunks', []):
        path = target / 'chunks' / f"{int(chunk['index']):04d}.json"
        if not path.is_file():
            continue
        raw = json.loads(path.read_text(encoding='utf-8'))
        saved = raw.get('segments') or ([{'text': raw['text'], 'start': None, 'end': None}] if raw.get('text', '').strip() else [])
        for i, segment in enumerate(saved):
            text = segment['text'].strip()
            if not text:
                continue
            start = end = None
            status = 'unverified'
            try:
                local_start, local_end = float(segment['start']), float(segment['end'])
                if math.isfinite(local_start) and math.isfinite(local_end) and local_end > local_start:
                    bounded_start = max(chunk['start'], chunk['start'] + local_start)
                    bounded_end = min(chunk['end'], chunk['start'] + local_end)
                    if bounded_end > bounded_start:
                        start, end = bounded_start, bounded_end
                        status = 'clipped' if local_start < 0 or local_end > chunk['end'] - chunk['start'] else 'valid'
            except (KeyError, TypeError, ValueError, OverflowError):
                pass
            item = {'id': f"{chunk['index']:04d}-{i:04d}", 'text': text, 'start': start, 'end': end,
                    'boundary_overlap': start is not None and chunk['index'] > 0 and start < chunk['coverage_start']}
            if status != 'valid':
                item['timestamp_status'] = status
                warnings.append({'segment_id': item['id'], 'chunk': chunk['index'], 'code': 'transcript_timestamp_' + status,
                    'message': '전사 시간이 오디오 구간을 벗어나 구간 경계로 제한했습니다. 원문과 시간을 확인하세요.' if status == 'clipped'
                               else '전사 시간이 유효하지 않거나 오디오 구간 밖에 있어 시간 위치를 비웠습니다. 전사문은 보존했습니다.'})
            segments.append(item)
    return {'text': '\n'.join(s['text'] for s in segments), 'segments': segments, 'complete': False,
            'timestamp_warnings': warnings} if segments else None


def saved_transcript(root, transcription_id):
    """Preserve saved text, including partial transcripts, without invoking the pipeline."""
    if not re.fullmatch(r'[A-Za-z0-9_-]+', transcription_id):
        raise ValueError('Invalid transcription id')
    target = root / 'transcripts' / transcription_id
    candidates = []
    for name in ('transcript.json', 'transcript.partial.json'):
        path = target / name
        if path.is_file():
            value = json.loads(path.read_text(encoding='utf-8'))
            if isinstance(value, dict) and isinstance(value.get('text'), str) and value['text'].strip():
                if name == 'transcript.json' and value.get('complete'):
                    candidates = [value]
                    break
                candidates.append(value)
    value = max(candidates, key=lambda item: len(item['text'])) if candidates else None
    if not value or not value.get('complete'):
        recovered = cached_transcript(target)
        if recovered and (not value or len(recovered['text']) >= len(value['text'])):
            value = recovered
    if value is None:
        if (target / 'transcript.txt').is_file():
            value = {'text': (target / 'transcript.txt').read_text(encoding='utf-8'), 'complete': False}
        else:
            return None
    segments = value.get('segments') or [{'id': 'saved-text', 'text': value['text'], 'start': None, 'end': None}]
    cursor = 0
    for segment in segments:
        position = value['text'].find(segment.get('text', ''), cursor)
        if position < 0:
            segments = [{'id': 'saved-text-0', 'text': value['text'], 'start': None, 'end': None}]
            break
        cursor = position + len(segment.get('text', ''))
    clean_segments = []
    for i, segment in enumerate(segments):
        start, end = segment.get('start'), segment.get('end')
        valid = (isinstance(start, (int, float)) and isinstance(end, (int, float))
                 and 0 <= start < end and end < float('inf'))
        clean_segments.append({
            'id': segment.get('id', f'saved-{i}'), 'text': segment.get('text', ''),
            'start': start if valid else None, 'end': end if valid else None,
            'timestamp_status': segment.get('timestamp_status') if valid else 'unverified',
            'boundary_overlap': bool(segment.get('boundary_overlap')),
        })
    return {'text': value['text'], 'complete': bool(value.get('complete')), 'segments': clean_segments,
            'timestamp_warnings': value.get('timestamp_warnings', [])}


def metadata(value):
    return {key: value[key] for key in METADATA_KEYS if key in value}


def youtube_url(video_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ValueError('Invalid YouTube video id')
    return f'https://www.youtube.com/watch?v={video_id}'


def counter(claims, field):
    return dict(sorted(Counter(claim['suggested'].get(field) for claim in claims
                               if claim['suggested'].get(field)).items()))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    os.replace(temp, path)


def export(root, output):
    db_path = root / 'data' / 'app.sqlite3'
    con = sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA query_only=ON')
    con.execute('BEGIN')
    try:
        details, rows, latest = {}, [], {}
        for raw in con.execute('''SELECT j.* FROM jobs j LEFT JOIN job_deletions d ON d.job_id=j.id
                                 WHERE d.job_id IS NULL ORDER BY j.created_at DESC, j.id'''):
            job = {key: raw[key] for key in PUBLIC_JOB_KEYS}
            if not re.fullmatch(r'[A-Za-z0-9_-]+', job['id']):
                raise ValueError('Invalid job id')
            job['url'] = youtube_url(job['video_id'])
            job['metadata'] = metadata(decoded(raw['metadata'], {}))
            claims = []
            for claim in con.execute('''SELECT cl.* FROM claims cl LEFT JOIN claim_deletions d ON d.claim_id=cl.id
                                        WHERE cl.job_id=? AND d.claim_id IS NULL ORDER BY cl.batch, cl.rowid''', (job['id'],)):
                reviews = [{'labels': decoded(r['labels'], {}), 'reviewer': r['reviewer'], 'reason': r['reason'],
                            'created_at': r['created_at']} for r in con.execute(
                                'SELECT labels,reviewer,reason,created_at FROM reviews WHERE claim_id=? ORDER BY created_at,rowid', (claim['id'],))]
                report = con.execute('SELECT report FROM claim_validations WHERE claim_id=?', (claim['id'],)).fetchone()
                claims.append({'id': claim['id'], 'suggested': decoded(claim['suggested'], {}),
                               'occurrences': decoded(claim['occurrences'], []), 'review_status': claim['review_status'],
                               'reviewed': reviews[-1]['labels'] if reviews else None, 'reviews': reviews,
                               'validation_report': decoded(report['report']) if report else {'status': 'not_checked', 'warnings': []}})
            assessment = con.execute('SELECT suggested,review_status FROM video_assessments WHERE job_id=?', (job['id'],)).fetchone()
            transcript = saved_transcript(root, job['transcription_id'])
            comment = con.execute('''SELECT status,retrieved_at,comments FROM comment_snapshots
                                     WHERE video_id=? AND status!='failed' ORDER BY rowid DESC LIMIT 1''', (job['video_id'],)).fetchone()
            contexts = [dict(row) for row in con.execute('''SELECT c.id,c.method,c.query,c.query_language,c.created_at,v.rank
                FROM collected_videos v JOIN collections c ON c.id=v.collection_id
                WHERE v.video_id=? ORDER BY c.created_at DESC''', (job['video_id'],))]
            summary = {'claim_count': len(claims), 'grades': counter(claims, 'evidence'),
                       'risks': counter(claims, 'risk_level'),
                       'warning_count': sum(len(c['validation_report'].get('warnings', [])) for c in claims)}
            rows.append({**job, **summary})
            details[job['id']] = {**job, **summary, 'claims': claims, 'transcript': transcript,
                'video_assessment': {'suggested': decoded(assessment['suggested']), 'review_status': assessment['review_status']} if assessment else None,
                'comments': {'status': comment['status'], 'retrieved_at': comment['retrieved_at'],
                             'items': decoded(comment['comments'], [])} if comment else None,
                'collections': contexts}
            latest.setdefault(job['video_id'], job['id'])
        collected = []
        for raw in con.execute('''SELECT v.id,v.video_id,v.rank,v.metadata,c.id AS collection_id,c.method,c.query,c.created_at
                                 FROM collected_videos v JOIN collections c ON c.id=v.collection_id
                                 ORDER BY c.created_at DESC,v.rank,v.id'''):
            item = dict(raw)
            item['metadata'] = metadata(decoded(raw['metadata'], {}))
            item['url'] = youtube_url(item['video_id'])
            item['job_id'] = latest.get(item['video_id'])
            linked = details.get(item['job_id'], {})
            item.update({key: linked.get(key, default) for key, default in
                         [('status', 'not_analyzed'), ('claim_count', 0), ('grades', {}), ('risks', {}), ('warning_count', 0)]})
            collected.append(item)
        payload = {'jobs': rows, 'collected': collected, 'details': details}
        snapshot = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()[:20]
        for job_id, detail in details.items():
            write_json(output / 'snapshots' / snapshot / 'jobs' / f'{job_id}.json', detail)
        index = {'schema_version': 1, 'generated_at': datetime.now(timezone.utc).isoformat(), 'snapshot': snapshot,
                 'jobs': [{**row, 'detail': f'snapshots/{snapshot}/jobs/{row["id"]}.json'} for row in rows],
                 'collected': collected}
        # Publish index last. Its detail paths are immutable, including across updates.
        write_json(output / 'index.json', index)
        # Retired snapshots must not keep deleted results accessible at old URLs.
        for old in (output / 'snapshots').iterdir():
            if old.name != snapshot and re.fullmatch(r'[0-9a-f]{20}', old.name) and old.is_dir() and not old.is_symlink():
                shutil.rmtree(old)
        return {'jobs': len(rows), 'claims': sum(row['claim_count'] for row in rows),
                'collected': len(collected), 'transcripts': sum(d['transcript'] is not None for d in details.values()), 'snapshot': snapshot}
    finally:
        con.rollback()
        con.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data')
    args = parser.parse_args()
    print(json.dumps(export(args.root.resolve(), args.output.resolve()), ensure_ascii=False))
