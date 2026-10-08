#!/usr/bin/env python3
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1] / 'results'
summary = {}
for path in sorted(root.rglob('*.json')):
    if any(part in ('first-benchmark', 'delta-benchmark', 'cloud-server') for part in path.parts):
        continue
    try:
        data = json.loads(path.read_text())
    except (ValueError, OSError):
        continue
    if isinstance(data, dict) and 'samples' in data:
        summary[str(path.relative_to(root))] = {key: value for key, value in data.items() if key not in ('samples', 'before', 'after', 'counters')}
for path in sorted(root.rglob('*resources.jsonl')):
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    valid = [row for row in rows if row.get('metrics')]
    if not valid:
        continue
    metrics = [row['metrics']['Metrics'] for row in valid]
    processes = {}
    for row in rows:
        for pid, values in row.get('processes', {}).items():
            if values is None:
                continue
            item = processes.setdefault(pid, {'max_rss_bytes': 0, 'first_cpu_seconds': values['cpu_seconds'], 'first_io': values.get('io')})
            item['max_rss_bytes'] = max(item['max_rss_bytes'], values['rss_bytes'])
            item['cpu_seconds'] = values['cpu_seconds'] - item['first_cpu_seconds']
            item['last_io'] = values.get('io')
    summary[str(path.relative_to(root))] = {
        'samples': len(rows), 'span_seconds': (rows[-1]['time_ms']-rows[0]['time_ms'])/1000,
        'max_pending_bytes': max(row['pending_bytes'] for row in metrics),
        'max_persistence_age_ms': max(row['persistence_age_ms'] for row in metrics),
        'max_head_lag': max(row['published']-row['persisted'] for row in metrics),
        'max_pending_compaction_bytes': max(row['pending_compaction_bytes'] for row in metrics),
        'max_sst_bytes': max(row['live_sst_bytes'] for row in metrics),
        'max_wal_bytes': max(row.get('wal_bytes', 0) for row in rows),
        'min_disk_free_bytes': min((row['disk_free_bytes'] for row in rows if 'disk_free_bytes' in row), default=None),
        'processes': processes,
    }
print(json.dumps(summary, indent=2))
