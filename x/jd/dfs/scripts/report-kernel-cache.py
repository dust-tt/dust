#!/usr/bin/env python3
import argparse
import collections
import hashlib
import json
import pathlib
import statistics

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
order = json.loads((args.directory / 'order.json').read_text())
assert len(order) == 75 and len({tuple(case) for case in order}) == 75
groups = collections.defaultdict(list)
verified = []
for round_number, corpus, workload, memory_mib, backend in order:
    name = f'{round_number}-{corpus}-{workload}-{memory_mib}-{backend}'
    path = args.directory / name / 'result.json'
    run = json.loads(path.read_text())
    assert run['passed'] and not run['sampling_errors']
    assert run['cold_client']
    assert (run['round'], run['corpus'], run['workload'], run['memory_bytes'], run['backend']) == (round_number, corpus, workload, memory_mib << 20, backend)
    assert run['after']['memory']['memory.events']['oom_kill'] == 0
    assert run['after']['memory']['memory.events']['oom'] == 0
    assert len(run['rows']) == (24 if workload == 'full' else 3)
    assert all(row['result'] == 'OK' for row in run['rows'])
    if backend in ('kernel', 'direct'):
        assert run['startup']['counters']['data_calls'] == 0 and run['startup']['cache_bytes'] == 0
        assert run['startup']['kernel_content_cache'] == (backend == 'kernel')
        points = [run['before'], run['after']]
        points += [row[stage] for row in run['rows'] for stage in ('before', 'after') if stage in row]
        assert all(point['dfs']['cache_bytes'] <= run['daemon_cache_budget_bytes'] for point in points)
    groups[(corpus, workload, memory_mib, backend)].append(run)
    verified.append({'path': str(path.relative_to(args.directory)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
assert json.loads((args.directory / 'completed.json').read_text()) == {'runs': len(order), 'passed': True}
summary = []
for (corpus, workload, memory_mib, backend), runs in sorted(groups.items()):
    assert len(runs) == 3 and {run['round'] for run in runs} == {1, 2, 3}
    assert len({run['manifest_sha256'] for run in runs}) == 1
    rows = []
    for index, first in enumerate(runs[0]['rows']):
        samples = [run['rows'][index] for run in runs]
        times = [sample['time_ms'] for sample in samples]
        row = {key: first[key] for key in ('feature', 'workload', 'phase', 'result') if key in first}
        row.update(median_ms=statistics.median(times), min_ms=min(times), max_ms=max(times), samples_ms=times)
        if backend in ('direct', 'kernel') and workload != 'full':
            for key in ('data_calls', 'received_bytes'):
                row[key] = [sample['after']['dfs']['counters'][key] - sample['before']['dfs']['counters'][key] for sample in samples]
            row['fuse_reads'] = [sample['after']['dfs']['fuse_operations']['read'] - sample['before']['dfs']['fuse_operations']['read'] for sample in samples]
        rows.append(row)
    summary.append(dict(corpus=corpus, workload=workload, memory_mib=memory_mib, backend=backend, rows=rows,
                        mount_ms=statistics.median(run['mount_ready_ms'] for run in runs),
                        peak_memory_mib=max(sample['peak_bytes'] for run in runs for sample in run['memory_samples']) / (1 << 20),
                        peak_file_cache_mib=max(sample['memory.stat']['file'] for run in runs for sample in run['memory_samples']) / (1 << 20),
                        peak_daemon_rss_mib=max(sample.get('daemon_rss_bytes', 0) for run in runs for sample in run['memory_samples']) / (1 << 20)))
args.output.mkdir(parents=True, exist_ok=True)
(args.output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
(args.output / 'verification.json').write_text(json.dumps({'passed': True, 'runs': len(verified), 'artifacts': verified}, indent=2) + '\n')


def table(headers, rows, numeric=()):
    widths = [max(len(row[index]) for row in [headers, *rows]) for index in range(len(headers))]
    border = '+' + '+'.join('-' * (width + 2) for width in widths) + '+'
    def line(row):
        assert len(row) == len(widths)
        return '| ' + ' | '.join(value.rjust(width) if index in numeric else value.ljust(width) for index, (value, width) in enumerate(zip(row, widths))) + ' |'
    lines = [border, line(headers), border, *map(line, rows), border]
    assert len({len(line) for line in lines}) == 1
    return '\n'.join(lines)


sections = ['# Demand-filled kernel cache measurements', '',
            'Three independent mounts per case, with client caches dropped before each mount. Both DFS modes fetch zero startup content. All backends run at the same path on the same client. Server caches are uncontrolled.', '',
            'The main tables use a 512 MiB total memory limit, shared by the application, DFS daemon, and kernel pages, with swap disabled. The 32 MiB setting limits only the daemon block cache, which both DFS modes retain. Cached DFS additionally uses demand-filled kernel content pages; direct-I/O DFS bypasses that layer. Kernel content pages have no separate fixed capacity here: they compete with other memory inside the shared limit and are reclaimed under pressure. Thus 32 MiB is not the total DFS cache or memory budget. The pressure probes explicitly change the shared limit to 192 MiB or 4 GiB.', '',
            'The full suite is the unchanged 10,000-file, 177.5 MB benchmark. Each warm cell is the median of three repeats within a mount; the table reports the median across three mounts. First means first invocation of that row; preceding rows can warm it. Mount startup is excluded. DFS fsync confirms publication, not durable persistence.', '',
            'Direct I/O is a control using the same current binary with kernel content caching disabled; it is not the historical OLD DFS binary. DFS observes changes through asynchronous notifications and periodic reconciliation; NFS uses its normal close-to-open validation. Permission/view resets conservatively invalidate every known inode. These consistency differences also affect performance.', '']
sections += ['The DFS performance runs use tenant-admin credentials. They enforce session/tenant/scope checks but bypass ordinary user/group grant aggregation on server operations. These tables do not establish the cost of non-admin authorization or grant changes under load. Separate regular-user mounted policy tests validate grant/revocation correctness, including cached descriptors and mappings; see ../../VALIDATION.md and server/cloud-policy.json.', '']
for backend, title in [('direct', 'DFS direct I/O'), ('kernel', 'DFS kernel cache'), ('nfs', 'NFS')]:
    group = next(group for group in summary if (group['corpus'], group['workload'], group['memory_mib'], group['backend']) == ('corpus', 'full', 512, backend))
    rows = [(row['feature'], row['workload'], row['phase'], f"{row['median_ms']:,.2f}", row['result']) for row in group['rows']]
    sections += [f'## {title}: 512 MiB total memory limit', '', '```text', table(('Feature', 'Workload', 'Phase', 'Time (ms)', 'Result'), rows, (3,)), '```', '']
rows = []
for group in summary:
    if group['workload'] != 'full':
        continue
    rows.append((group['backend'], f"{group['mount_ms']:,.2f}", f"{group['peak_memory_mib']:.1f}", f"{group['peak_file_cache_mib']:.1f}", f"{group['peak_daemon_rss_mib']:.1f}" if group['backend'] in ('direct', 'kernel') else '-'))
sections += ['## Full-suite startup and memory', '', 'Mount time is the median; memory values are maxima across all three runs. Native ext4 rows are retained in summary.json as an additional control.', '', '```text', table(('Backend', 'Mount ms', 'Peak MiB', 'File MiB', 'Daemon RSS MiB'), rows, (1, 2, 3, 4)), '```', '']
peak_overage_mib = max(group['peak_memory_mib'] - group['memory_mib'] for group in summary)
sections += [f'All runs recorded zero OOM events and zero OOM kills. Pressure runs recorded transient memory.peak values up to {peak_overage_mib:.2f} MiB above memory.max during allocation/reclaim; the tables retain those measured peaks.', '']
rows = []
for group in summary:
    if group['workload'] == 'full':
        continue
    first, repeat, second_repeat = group['rows']
    rows.append((group['corpus'], group['workload'], str(group['memory_mib']), group['backend'], f"{first['median_ms']:,.2f}", f"{repeat['median_ms']:,.2f}", f"{second_repeat['median_ms']:,.2f}", f"{group['peak_memory_mib']:.1f}", f"{group['peak_file_cache_mib']:.1f}"))
sections += ['## Fresh-mount probes and memory pressure', '',
             '`corpus` is 177.5 MB; `large` is 2.77 GB. Each probe performs three passes. Each time is the median across three mounts for the corresponding pass. Memory and file-cache columns are the maximum observed across all three mounts. File cache includes all file-backed pages charged to the scope, including oracle access, not only DFS content; it is outside the 32 MiB daemon block-cache allowance. The cgroup peak is the total memory measurement. Do not add file-cache usage to daemon RSS: file-backed mappings can appear in both.', '', '```text',
             table(('Corpus', 'Workload', 'Limit MiB', 'Backend', 'First ms', 'Repeat 1 ms', 'Repeat 2 ms', 'Peak MiB', 'File MiB'), rows, (2, 4, 5, 6, 7, 8)), '```', '',
             'Raw rows, all repetitions, startup times, DFS RPC/FUSE counters, NFS mount statistics, cgroup samples, and source/binary fingerprints accompany this report. See `summary.json` and `verification.json`.']
rows = []
for group in summary:
    if group['workload'] == 'full' or group['backend'] not in ('direct', 'kernel'):
        continue
    first, repeat, _ = group['rows']
    rows.append((group['corpus'], group['workload'], str(group['memory_mib']), group['backend'],
                 f"{statistics.median(first['data_calls']):,.0f}", f"{statistics.median(repeat['data_calls']):,.0f}",
                 f"{statistics.median(first['received_bytes']) / (1 << 20):,.2f}", f"{statistics.median(repeat['received_bytes']) / (1 << 20):,.2f}",
                 f"{statistics.median(repeat['fuse_reads']):,.0f}"))
sections += ['', '## DFS demand traffic', '',
             'Counters are medians across three mounts. Repeat refers to the first repeat. Received bytes count serialized RPC response payloads, including reply fields and background control responses, but exclude gRPC/TLS/transport overhead. Zero content RPCs does not mean zero background reconciliation RPCs: the zero-content repeats still recorded 64 response bytes, which round to 0.00 MiB here. The sparse heads probe consumes 256 × 4 KiB = 1 MiB per pass; extra payload exposes block/read-ahead amplification.', '',
             '```text', table(('Corpus', 'Workload', 'Limit MiB', 'Backend', 'First RPC', 'Repeat RPC', 'First MiB', 'Repeat MiB', 'Repeat FUSE reads'), rows, (2, 4, 5, 6, 7, 8)), '```', '',
             'Development pilots and superseded or failed attempts are retained separately; only the 75 runs listed in client/matrix/order.json contribute to these tables.']
(args.output / 'TABLES.md').write_text('\n'.join(sections) + '\n')
