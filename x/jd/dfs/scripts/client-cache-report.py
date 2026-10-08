#!/usr/bin/env python3
import argparse
import collections
import hashlib
import json
import pathlib
import statistics

parser = argparse.ArgumentParser()
parser.add_argument('directories', type=pathlib.Path, nargs='+')
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
groups = collections.defaultdict(list)
artifacts = []
provenances = []
synchronization_modes = set()


def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


for directory in args.directories:
    provenance = json.loads((directory / 'provenance.json').read_text())
    assert not provenance['arguments']['phase_metrics'], 'primary timing report requires no blocking phase instrumentation'
    completed = json.loads((directory / 'completed.json').read_text())
    cells = json.loads((directory / 'cells.json').read_text())
    assert completed == {'cells': len(cells), 'passed': True}
    expected = {(round_number, clients, variant)
                for round_number in range(1, provenance['arguments']['rounds'] + 1)
                for clients in provenance['arguments']['clients']
                for variant in provenance['arguments']['variants']}
    assert {(cell['round'], cell['clients'], cell['variant']) for cell in cells} == expected
    assert len(cells) == len(expected)
    provenances.append(provenance)
    for cell in cells:
        assert cell['passed'] and cell['after']['storage_error'] is None
        for index in range(cell['clients']):
            path = directory / cell['label'] / f'client-{index}/result.json'
            run = json.loads(path.read_text())
            if cell['variant'] != 'baseline':
                synchronization_modes.add('publication only' if run['startup']['publication_only_sync'] else 'server persistence')
            assert run['passed'] and not run['sampling_errors'] and len(run['rows']) == 24
            assert run['manifest_sha256'] == provenance['manifest_sha256']
            assert run['memory_bytes'] == provenance['memory_bytes_per_client']
            assert run['after']['memory']['memory.events']['oom'] == 0
            assert run['after']['memory']['memory.events']['oom_kill'] == 0
            assert run['startup']['cache_bytes'] == 0 and run['startup']['counters']['data_calls'] == 0
            assert all(row['result'] == 'OK' for row in run['rows'])
            assert [row['phase'] for row in run['rows']] == ['first', 'warm'] * 10 + ['once'] * 4
            memory = run['memory_samples']
            assert memory
            assert all('before' not in row and 'after' not in row for row in run['rows'])
            summary = {'round': cell['round'], 'client': index, 'rows': run['rows'],
                       'cache_bytes': run['cache_bytes'], 'mount_ready_ms': run['mount_ready_ms'],
                       'peak_memory_bytes': max(sample.get('peak_bytes', sample['current_bytes']) for sample in memory),
                       'peak_file_bytes': max(sample['memory.stat']['file'] for sample in memory),
                       'peak_dirty_bytes': max(sample['memory.stat'].get('file_dirty', 0) for sample in memory),
                       'peak_kernel_writeback_bytes': max(sample['memory.stat'].get('file_writeback', 0) for sample in memory),
                       'peak_daemon_rss_bytes': max(sample.get('daemon_rss_bytes', 0) for sample in memory),
                       'before': run['before']['dfs'], 'after': run['after']['dfs']}
            groups[(run['memory_bytes'] >> 20, cell['clients'], cell['variant'])].append(summary)
            artifacts.append({'path': str(path), 'sha256': digest(path)})

assert len({provenance['manifest_sha256'] for provenance in provenances}) == 1
args.output.mkdir(parents=True, exist_ok=True)
tables = []
summaries = []
resources = ['# Client-cache resource observations', '',
             'Memory columns are maxima across the group. Counter columns are medians of per-mount before/after differences over the complete 24-row workload, including untimed validation and repeated warm invocations. Received bytes include metadata and protocol payloads. Notification bytes do not establish residency or useful kernel hits. Missing baseline instrumentation is reported as unavailable.', '',
             '| MiB/client | Clients | Variant | Peak cgroup MiB | Peak daemon RSS MiB | Peak file MiB | Data RPCs | Received MiB | FUSE reads | Kernel notified MiB | Refetched MiB |',
             '| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
buffers = ['', '## Retained and transient payloads', '',
           'Content is median end-of-workload residency. Reply/write columns are maximum instrumented reservations, not RSS. Dirty/writeback columns are cgroup peaks and can include benchmark log writes. Daemon speculative-use counters exclude kernel page hits; kernel usefulness is separately established by the zero-residency correctness test. All raw counters remain in summary.json.', '',
           '| MiB/client | Clients | Variant | End content MiB | Peak reply MiB | Peak retained writes MiB | Peak dirty MiB | Peak writeback MiB | Daemon speculative bytes used |',
           '| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |']


def counter_delta(runs, section, key, divisor=1):
    values = []
    for run in runs:
        before = run['before'].get(section) or {}
        after = run['after'].get(section) or {}
        if key not in before or key not in after:
            return 'unavailable'
        values.append((after[key] - before[key]) / divisor)
    return f'{statistics.median(values):,.2f}'


def maximum_counter(runs, section, key):
    values = [(run['after'].get(section) or {}).get(key) for run in runs]
    return 'unavailable' if None in values else f'{max(values) / 2**20:.2f}'


for (memory_mib, clients, variant), runs in sorted(groups.items()):
    assert len({run['round'] for run in runs}) == 3 and len(runs) == 3 * clients
    rows = []
    for index in range(24):
        first = runs[0]['rows'][index]
        assert all((run['rows'][index]['feature'], run['rows'][index]['workload'], run['rows'][index]['phase']) ==
                   (first['feature'], first['workload'], first['phase']) for run in runs)
        times = [run['rows'][index]['time_ms'] for run in runs]
        rows.append({**{key: first[key] for key in ('feature', 'workload', 'phase')},
                     'median_ms': statistics.median(times), 'min_ms': min(times), 'max_ms': max(times),
                     'samples_ms': times, 'result': 'OK'})
    summary = {'memory_mib': memory_mib, 'clients': clients, 'variant': variant, 'runs': len(runs),
               'cache_bytes': runs[0]['cache_bytes'], 'rows': rows,
               'peak_memory_bytes': max(run['peak_memory_bytes'] for run in runs),
               'peak_file_bytes': max(run['peak_file_bytes'] for run in runs),
               'peak_dirty_bytes': max(run['peak_dirty_bytes'] for run in runs),
               'peak_kernel_writeback_bytes': max(run['peak_kernel_writeback_bytes'] for run in runs),
               'peak_daemon_rss_bytes': max(run['peak_daemon_rss_bytes'] for run in runs),
               'observations': runs}
    summaries.append(summary)
    resources.append(f"| {memory_mib} | {clients} | {variant} | {summary['peak_memory_bytes'] / 2**20:.2f} | "
                     f"{summary['peak_daemon_rss_bytes'] / 2**20:.2f} | {summary['peak_file_bytes'] / 2**20:.2f} | "
                     f"{counter_delta(runs, 'counters', 'data_calls')} | {counter_delta(runs, 'counters', 'received_bytes', 2**20)} | "
                     f"{counter_delta(runs, 'fuse_operations', 'read')} | {counter_delta(runs, 'kernel_prefetch', 'store_notification_bytes', 2**20)} | "
                     f"{counter_delta(runs, 'kernel_prefetch', 'refetch_bytes', 2**20)} |")
    content = statistics.median(run['after']['cache_bytes'] for run in runs) / 2**20
    useful = 'unavailable'
    if all('prefetch_used_bytes' in run['before'] and 'prefetch_used_bytes' in run['after'] for run in runs):
        useful = f"{statistics.median(run['after']['prefetch_used_bytes'] - run['before']['prefetch_used_bytes'] for run in runs):,.0f}"
    buffers.append(f"| {memory_mib} | {clients} | {variant} | {content:.2f} | "
                   f"{maximum_counter(runs, 'reads', 'peak_reply_reserved_bytes')} | "
                   f"{maximum_counter(runs, 'fuse_operations', 'peak_retained_write_bytes')} | "
                   f"{summary['peak_dirty_bytes'] / 2**20:.2f} | {summary['peak_kernel_writeback_bytes'] / 2**20:.2f} | {useful} |")
    tables += [f'## {variant}, {memory_mib} MiB per client, {clients} concurrent client(s)', '',
               '| Feature | Workload | Phase | Median ms | Range ms | Result |',
               '| --- | --- | --- | ---: | ---: | --- |']
    tables += [f"| {row['feature']} | {row['workload']} | {row['phase']} | {row['median_ms']:,.2f} | {row['min_ms']:,.2f}–{row['max_ms']:,.2f} | OK |" for row in rows]
    tables += ['']

(args.output / 'summary.json').write_text(json.dumps(summaries, indent=2) + '\n')
(args.output / 'verification.json').write_text(json.dumps({'passed': True, 'client_runs': len(artifacts),
                                                        'rows': 24 * len(artifacts), 'artifacts': artifacts}, indent=2) + '\n')
synchronization = 'Current variants confirm ' + ' / '.join(sorted(synchronization_modes)) + '. Baseline confirms publication only.'
intro = ['# Client-cache benchmark tables', '',
         'All 24 requested rows passed. Timings exclude result validation. First means the first invocation of that row, after preceding rows; it does not mean a globally cold cache. Warm rows use the median of three invocations within a mount. These tables report the median across three independent rounds (six client observations for two-client cells); paired observations share a server and are not six independent deployments.', '',
         'Each client has a separate application-plus-daemon cgroup with the stated memory limit and zero swap. Server memory is outside those cgroups. Runs use a fresh mount and a fresh copy of the same persisted seed database per cell. Host caches are uncontrolled. All processes run on one dedicated GCP dust-dev VM over loopback using tenant-admin credentials. No indexer or HA replica runs.', '',
         'Primary timings perform no blocking metric reads between workload rows. Two-client cells rendezvous between rows to keep writes from overlapping the other client’s corpus traversal. Separate instrumented diagnostic runs retain per-row RPC/FUSE/cache observations; their extra idle gaps can change fsync and prefetch timing, so they are not pooled here.', '',
         synchronization + ' The original 24-row workload does not time directory synchronization. Kernel notification success does not prove page residency.', '',
         'Peak memory includes kernel pages and daemon/application allocations. Kernel reclamation may record transient peaks above memory.max; raw peaks are preserved. All reported runs recorded zero OOM events and OOM kills. Explicit 32 MiB caching, a smaller 4 MiB fallback, zero residency, direct I/O, and opt-in writeback remain separate variants. The matrix fixes these settings independently of the CLI default.', '']
(args.output / 'tables.md').write_text('\n'.join(intro + tables))
(args.output / 'resources.md').write_text('\n'.join(resources + buffers) + '\n')
selected = {(group['memory_mib'], group['variant']): group for group in summaries if group['clients'] == 1}
columns = [(512, 'baseline'), (512, 'kernel-small'), (256, 'baseline'), (256, 'kernel-small')]
if all(column in selected for column in columns):
    comparison = ['# Requested 24-row comparison', '',
                  'Milliseconds, median of three single-client rounds. Current uses the selected 4 MiB fallback; baseline uses the preserved historical mount. Each memory limit includes application and daemon. All results passed. ' + synchronization + ' See tables.md for ranges and all concurrent-client/control variants, and resources.md for memory and counters.', '',
                  '| Feature | Workload | Phase | Baseline 512 MiB | Current 512 MiB | Baseline 256 MiB | Current 256 MiB | Result |',
                  '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |']
    for index in range(24):
        row = selected[columns[0]]['rows'][index]
        times = ' | '.join(f"{selected[column]['rows'][index]['median_ms']:,.2f}" for column in columns)
        comparison.append(f"| {row['feature']} | {row['workload']} | {row['phase']} | {times} | OK |")
    (args.output / 'comparison.md').write_text('\n'.join(comparison) + '\n')
print(json.dumps({'passed': True, 'client_runs': len(artifacts), 'rows': 24 * len(artifacts), 'groups': len(summaries)}))
