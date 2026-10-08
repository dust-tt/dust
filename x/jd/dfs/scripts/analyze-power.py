#!/usr/bin/env python3
import gzip
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1] / 'results'
run = root / 'network-final'
first = last = None
acknowledged = 0
with gzip.open(run / 'power-attempts.jsonl.gz', 'rt') as source:
    for line in source:
        record = json.loads(line)
        if first is None:
            first = record
        last = record
        acknowledged += record['outcome'] is not None
verification = json.loads((run / 'power-verification.json').read_text())
failure = json.loads((run / 'power-failure-time.json').read_text())['writer_stopped_ms']
ready = json.loads((run / 'power-ready-time.json').read_text())['ready_ms']
reset = json.loads((root / 'power-reset-request.json').read_text())['reset_requested_ms']
assert first['request']['incarnation'] != verification['incarnation']
assert acknowledged == verification['acknowledged']
assert last['outcome'] is None
assert verification['retained_retries'] + verification['lost_acknowledged'] == acknowledged
assert verification['unknown_retries'] == verification['lost_acknowledged'] + 1
result = {
    'old_incarnation': first['request']['incarnation'],
    'new_incarnation': verification['incarnation'],
    'acknowledged_records': acknowledged,
    'failed_call_elapsed_ms': failure - last['time_ms'],
    'same_client_failure_to_ready_ms': ready - failure,
    'reset_request_to_ready_ms_cross_host_wall_clocks': ready - reset,
    'recorder_span_ms': last['time_ms'] - first['time_ms'],
    'complete_prefix_and_no_replay_assertions': True,
}
print(json.dumps(result, indent=2))
