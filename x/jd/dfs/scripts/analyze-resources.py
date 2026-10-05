#!/usr/bin/env python3
import collections
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1] / 'results'
run = root / 'resource-followup-server'
samples = [json.loads(line) for line in (run / 'resources.jsonl').read_text().splitlines()]
metrics = [sample['metrics']['Metrics'] for sample in samples if sample['metrics']]
processes = [next(iter(sample['processes'].values())) for sample in samples]
assert all(processes)
assert len({tuple(sample['processes']) for sample in samples}) == 1
loads = [json.loads((root / 'resource-followup-client' / name).read_text()) for name in ('busy.json', 'probe.json')]
assert all(load['errors'] == 0 for load in loads)
payload = sum(load['successful'] * load['payload_bytes'] for load in loads)


def io(name):
    return {key: int(value) for key, value in (line.split(':') for line in (run / name).read_text().splitlines())}


written = io('io-after.txt')['write_bytes'] - io('io-before.txt')['write_bytes']
events = collections.Counter()
for line in (run / 'rocksdb.log').read_text().splitlines():
    if 'EVENT_LOG_v1 ' not in line:
        continue
    event = json.loads(line.split('EVENT_LOG_v1 ', 1)[1])
    if samples[0]['time_ms'] <= event['time_micros'] / 1000 <= samples[-1]['time_ms']:
        events[event['event']] += 1
result = {
    'application_payload_bytes': payload,
    'kernel_write_bytes': written,
    'kernel_write_accounting_amplification': written / payload,
    'event_counts': dict(events),
    'window_start_ms': samples[0]['time_ms'],
    'window_end_ms': samples[-1]['time_ms'],
    'sample_count': len(samples),
    'cpu_seconds': processes[-1]['cpu_seconds'] - processes[0]['cpu_seconds'],
    'max_rss_bytes': max(p['rss_bytes'] for p in processes),
    'max_pending_bytes': max(m['pending_bytes'] for m in metrics),
    'max_persistence_age_ms': max(m['persistence_age_ms'] for m in metrics),
    'max_head_lag': max(m['published'] - m['persisted'] for m in metrics),
    'max_compaction_debt_bytes': max(m['pending_compaction_bytes'] for m in metrics),
    'max_wal_bytes': max(s['wal_bytes'] for s in samples),
    'min_disk_free_bytes': min(s['disk_free_bytes'] for s in samples),
    'database_before_bytes': int((run / 'storage-before.txt').read_text().split()[0]),
    'database_after_bytes': int((run / 'storage-after.txt').read_text().split()[0]),
}
print(json.dumps(result, indent=2))
