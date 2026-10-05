#!/usr/bin/env python3
import collections
import hashlib
import json
import pathlib
import statistics

root = pathlib.Path(__file__).resolve().parents[1]
base = root / 'results/selective'
client = base / 'client'
server = base / 'server'
evidence = {}


def read(path):
    evidence[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return json.loads(path.read_text())


def table(headers, rows):
    values = [headers] + [[str(value) for value in row] for row in rows]
    widths = [max(len(row[i]) for row in values) for i in range(len(headers))]
    border = '+' + '+'.join('-' * (width + 2) for width in widths) + '+'
    lines = [border, '| ' + ' | '.join(value.ljust(width) for value, width in zip(values[0], widths)) + ' |', border]
    numeric = [header in ['Time (ms)', 'First ms', 'Warm ms', 'Post-policy ms', 'Rewarm ms', 'Peak MiB', 'Content RPCs', 'FUSE reads'] for header in headers]
    lines += ['| ' + ' | '.join(value.rjust(width) if right else value.ljust(width) for value, width, right in zip(row, widths, numeric)) + ' |' for row in values[1:]]
    lines.append(border)
    assert len(set(map(len, lines))) == 1
    return '\n'.join(lines)


assert read(base / 'cloud-source-check.json')['passed']
unix = read(server / 'cloud-build/unix.json')
assert unix['tests_run'] == 14 and not unix['failures'] and not unix['errors']
assert read(server / 'cloud-build/policy.json')['passed']
assert read(server / 'cloud-build/failures.json')['passed']
retention = []
for mode in ['old', 'selective']:
    for delivery in ['watch', 'poll']:
        data = read(client / f'cache-{mode}-{delivery}.json')
        assert data['passed'] and data['mode'] == mode and data['drop_events'] == (delivery == 'poll')
        for row in data['records']:
            if 'data_calls' in row:
                expected = len(row['paths']) if mode == 'old' else 0
                assert row['data_calls'] == row['fuse_reads'] == expected
                retention.append([mode, delivery, row['case'], expected, row['fuse_reads']])
            if 'allowed' in row:
                assert not row['allowed']

propagation = read(client / 'propagation/results.json')
assert propagation['passed'] and propagation['repeats'] == 5
records = propagation['records']
assert not any(row.get('timeout') for row in records)
assert len([row for row in records if row['kind'] == 'identity']) == 9
assert all(row['uid'] != 0 for row in records if row['kind'] == 'identity')
assert all(row['passed'] for row in records if row['kind'] == 'scenario')
latencies = []
for case, title in [('direct_read_gain', 'Direct READ gained'), ('direct_read_revoke', 'Direct READ revoked'), ('group_read_write_gain', 'Group READ gained'), ('group_write_gain', 'Group WRITE gained'), ('group_write_revoke', 'Group WRITE revoked'), ('group_read_revoke', 'Group READ revoked')]:
    row = [title]
    for cohort in ['dfs-watch', 'dfs-poll', 'nfs']:
        values = [record['after_ack_ms'] for record in records if record['kind'] == 'propagation' and record['case'] == case and record['cohort'] == cohort]
        assert len(values) == (5 if case.startswith('direct') else 10)
        row.append(f'{statistics.median(values):,.2f} / {max(values):,.2f}')
    latencies.append(row)
held = []
for cohort in ['dfs-watch', 'dfs-poll', 'nfs']:
    descriptors = [row for row in records if row['kind'] == 'retained_descriptor' and row['cohort'] == cohort]
    mapping = next(row for row in records if row['kind'] == 'retained_mapping' and row['cohort'] == cohort)
    if cohort.startswith('dfs'):
        assert not descriptors[-1]['allowed'] and mapping['returncode'] == -7
    held.append([cohort, ', '.join(f"{row['after_ack_ms']:.0f}ms:{'readable' if row['allowed'] else 'denied'}" for row in descriptors), 'readable' if mapping['allowed'] else 'SIGBUS'])
memory = read(client / 'propagation/memory.json')
assert int(memory['memory.max']) == 2 << 30
assert dict(line.split() for line in memory['memory.events'].splitlines())['oom_kill'] == '0'

assert read(client / 'scans/completed.json') == {'passed': True, 'runs': 21}
order = read(client / 'scans/order.json')
assert len(order) == 21 and len({tuple(row) for row in order}) == 21
groups = collections.defaultdict(list)
misses = []
for round_number, backend, user, mode in order:
    name = f'{round_number}-{backend}-{user}-{mode}'
    data = read(client / 'scans' / name / 'results.json')
    assert data['passed'] and data['memory_limit_bytes'] == 512 << 20
    assert (data['backend'], data['user'], data['mode']) == (backend, user, mode)
    assert [row['phase'] for row in data['records']] == ['first', 'warm', 'after_unrelated_grant', 'rewarm']
    events = dict(line.split() for line in data['final_memory']['memory.events'].splitlines())
    assert int(events['oom']) == int(events['oom_kill']) == 0
    if backend == 'dfs':
        assert data['initial']['dfs']['cache_bytes'] == data['initial']['dfs']['counters']['data_calls'] == 0
        for row in data['records']:
            assert row['content_rpcs'] == row['after']['dfs']['counters']['data_calls'] - row['before']['dfs']['counters']['data_calls']
            assert row['after']['dfs']['cache_bytes'] <= 32 << 20
            if row['phase'] == 'first' or (mode == 'old' and row['phase'] == 'after_unrelated_grant'):
                assert row['content_rpcs'] == 10000
            if row['expected_resident'] and (row['content_rpcs'] or row['fuse_reads']):
                misses.append({'run': name, 'phase': row['phase'], 'content_rpcs': row['content_rpcs'], 'fuse_reads': row['fuse_reads']})
    groups[backend, user, mode].append(data)
performance = []
traffic = []
for backend, user, mode in [('dfs', user, mode) for user in ['admin', 'alice', 'bob'] for mode in ['old', 'selective']] + [('nfs', 'alice', 'selective')]:
    runs = groups[backend, user, mode]
    assert len(runs) == 3
    label = 'NFS reader' if backend == 'nfs' else f'DFS {mode} {user}' + (' (32 groups)' if user == 'bob' else '')
    performance.append([label, *[f'{statistics.median(run["records"][index]["time_ms"] for run in runs):,.2f}' for index in range(4)], f'{max(int(run["final_memory"]["memory.peak"]) for run in runs) / 2**20:.1f}'])
    if backend == 'dfs':
        traffic.append([label, *[','.join(str(run['records'][index]['content_rpcs']) for run in runs) for index in range(4)]])

completion = read(client / 'full/completed.json')
assert completion['passed'] and completion['runs'] == 9
full_order = read(client / 'full/order.json')
assert len(full_order) == 9 and len({tuple(row) for row in full_order}) == 9
full = collections.defaultdict(list)
for round_number, mode in full_order:
    data = read(client / 'full' / f'{round_number}-{mode}' / 'result.json')
    assert data['passed'] and not data['sampling_errors'] and data['memory_bytes'] == 512 << 20
    assert data['cold_client'] and data['round'] == round_number and data['workload'] == 'full'
    assert data['backend'] == ('nfs' if mode == 'nfs' else 'kernel')
    assert data['manifest_sha256'] == read(base / 'cloud-source-check.json')['corpus_manifest_sha256']
    assert len(data['rows']) == 24 and all(row['result'] == 'OK' for row in data['rows'])
    assert data['after']['memory']['memory.events']['oom_kill'] == data['after']['memory']['memory.events']['oom'] == 0
    if mode != 'nfs':
        assert data['startup']['cache_bytes'] == data['startup']['counters']['data_calls'] == 0
        assert data['startup']['kernel_content_cache']
        assert all(data[stage]['dfs']['cache_bytes'] <= 32 << 20 for stage in ['before', 'after'])
        assert data['bin'] == ('runtime/grants/bin-old' if mode == 'old' else 'runtime/grants/bin')
    full[mode].append(data)
full_tables = []
full_memory = []
for mode in ['old', 'selective', 'nfs']:
    runs = full[mode]
    assert len(runs) == 3
    rows = []
    for index, reference in enumerate(runs[0]['rows']):
        assert all((run['rows'][index]['feature'], run['rows'][index]['workload'], run['rows'][index]['phase']) == (reference['feature'], reference['workload'], reference['phase']) for run in runs)
        rows.append([reference['feature'], reference['workload'], reference['phase'], f'{statistics.median(run["rows"][index]["time_ms"] for run in runs):,.2f}', 'OK'])
    full_tables.append(('NFS' if mode == 'nfs' else 'Old DFS' if mode == 'old' else 'Selective DFS', table(['Feature', 'Workload', 'Phase', 'Time (ms)', 'Result'], rows)))
    samples = [sample for run in runs for sample in [run['before']['memory'], run['after']['memory'], *run['memory_samples']]]
    full_memory.append([full_tables[-1][0], f'{statistics.median(run["mount_ready_ms"] for run in runs):,.2f}', f'{max(sample["peak_bytes"] for sample in samples) / 2**20:.1f}', f'{max(sample["memory.stat"]["file"] for sample in samples) / 2**20:.1f}', f'{max(sample.get("daemon_rss_bytes", 0) for sample in samples) / 2**20:.1f}' if mode != 'nfs' else 'n/a'])
summary = {'passed': True, 'scan_runs': 21, 'full_suite_runs': 9, 'focused_retention_runs': 4, 'propagation_observations': sum(row['kind'] == 'propagation' for row in records), 'access_checks': sum(row['kind'] == 'access' for row in records), 'additional_scenarios': sum(row['kind'] == 'scenario' for row in records), 'resident_phase_misses': misses, 'evidence_sha256': evidence}
(base / 'cloud-verification.json').write_text(json.dumps(summary, indent=2) + '\n')


def median_row(mode, index):
    return statistics.median(run['rows'][index]['time_ms'] for run in full[mode])


text = f'''# Selective grant invalidation — cloud evaluation

This compares the old measured DFS client, selective DFS, and NFS on one dedicated client VM. The grant-retention checks, multi-user propagation suite, 21 focused search runs, and nine unchanged full-suite runs passed their stated assertions. Raw evidence and hashes are in [cloud-verification.json](cloud-verification.json); source, binary, and corpus checks are in [cloud-source-check.json](cloud-source-check.json).

The [design snapshot](../../REIMPLEMENTATION_DESIGN.md) describes the target architecture, including mechanisms beyond this build. This evaluation covers selective cache invalidation and existing filesystem behavior. It does not establish implementation of paged metadata, scoped server policy deltas, durable fsync, freshness leases, Product integration, or the other target mechanisms listed in the [local report](REPORT.md).

## Environment and measurement boundaries

Separate n2-standard-8 server/client VMs in us-central1-a, with 200 GB pd-ssd data disks. NFS uses Zonal Filestore, NFSv3, a 1 TiB share and configured 6,000 IOPS. Configuration exports are [instances.json](instances.json) and [filestore.json](filestore.json). Both DFS clients use the same selective-build server; the server authorization/storage implementation is unchanged. The old client binaries match the previous measured release hashes.

The corpus contains 10,000 generated documents, 177.5 MB, with the original seed-42 manifest. Source and NFS document hashes match the oracle. Each performance case uses a fresh mount, dropped dedicated-client caches, zero DFS startup content preload, and a shared **512 MiB** cgroup for application, daemon, and kernel pages, with swap disabled. The daemon block allowance remains **32 MiB**. Server caches are uncontrolled; first access is not a claim of cold physical storage.

## Search after an unrelated grant change

Median elapsed milliseconds across three randomized mounts per case. Alice is an ordinary principal; Bob inherits READ through 32 groups; admin is an explicitly labeled DFS credential control. Search processes use unprivileged Linux UIDs. NFS uses numeric owner/group/mode permissions; the search UID reads the corpus through its existing world-readable file modes. Its unrelated remote chmod is the comparable cache-disturbance probe, not an equivalent rich-grant operation.

```text
{table(['Client', 'First ms', 'Warm ms', 'Post-policy ms', 'Rewarm ms', 'Peak MiB'], performance)}
```

Content RPC counts for every DFS repetition:

```text
{table(['Client', 'First RPCs', 'Warm RPCs', 'Post-policy RPCs', 'Rewarm RPCs'], traffic)}
```

There are {len(misses)} expected-resident phases with content RPCs or FUSE reads; they are retained in the aggregates and listed in the verification JSON. Every first scan and every old-client post-policy scan fetches all 10,000 files. Mount initialization, policy mutation, metadata reconciliation, metrics collection, and a two-second settling wait are outside these scan timers. Policy refresh still rebuilds a complete authorized metadata view. Background head/metadata RPCs continue even when content RPCs are zero.

## Grant correctness and propagation

Three ordinary principals, six DFS mounts (notification and dropped-notification cohorts), and three unprivileged NFS identities produced {summary['propagation_observations']} convergence observations, {summary['access_checks']} direct access checks, and {summary['additional_scenarios']} additional scenario assertions. The multi-mount functional scope has a 2 GiB cgroup limit; it is separate from the 512 MiB single-mount performance cases.

Time from receipt of administration acknowledgment to observed operation outcome, median / maximum in milliseconds:

```text
{table(['Operation', 'DFS watch med/max', 'DFS poll med/max', 'NFS med/max'], latencies)}
```

Polling drops notifications and uses the default one-second reconciliation interval. Probes poll every 5 ms. Administration RPC/process time is excluded and retained separately in raw records. Read gain and WRITE gain are separate observations. Successful write probes run sequentially to avoid conflicting writes; WRITE-gain timing starts after READ convergence, so it is not an isolated notification-versus-polling comparison. These are bounded observations, not latency SLAs or a throughput-under-load test.

Cached descriptors and mappings were warmed before revocation:

```text
{table(['Client', 'Held descriptor since acknowledgment', 'Warmed mapping'], held)}
```

A new-open denial is not a completed kernel-invalidation barrier. The settled DFS checks require denial of retained descriptors and SIGBUS from revoked mappings. NFS retained access is recorded as a semantic difference. The suite also checks overlapping direct/group rights, membership loss/restoration, inherited existing/new children, hidden shared ancestry, limited delegation, known-ID authorization, and retained unlinked handles.

Four focused old/new scenarios independently enforce content retention and revocation after completed reconciliation, with notifications and dropped notifications:

```text
{table(['DFS', 'Delivery', 'Case', 'Content RPCs', 'FUSE reads'], retention)}
```

These small retention scenarios use a 100 ms reconciliation interval and are correctness checks, not the default propagation-latency experiment. Unchanged names retain dentries; affected inode pages and parent directory pages are still invalidated. Unlinked handles whose authority cannot be established are invalidated conservatively. Global authorization-generation checks still reject obsolete in-flight replies. Restart and credential loss invalidate broadly.

## Unchanged full benchmark

The following tables are medians of three fresh mounts per backend. Each run uses the unchanged vendor benchmark, with three warm repetitions per read workload. All 24 rows pass the benchmark's path, match, byte/hash, and write checks. These are DFS tenant-admin and root-process controls; the ordinary-user measurements are above. All backends are bound at the identical benchmark path.

`first` inherits earlier phases of that run. The separate search probes above supply fresh-content-cache measurements. **DFS fsync acknowledges publication, not durable persistence**, so its fsync row is not equivalent to a durable NFS acknowledgment. The target design's durable barrier is not implemented or measured here.

The full suite does not show a general cold-read speedup from selective invalidation. Its first SHA-256 pass is **{median_row('selective', 16):,.2f} ms versus {median_row('old', 16):,.2f} ms old**, a **{(median_row('selective', 16) / median_row('old', 16) - 1) * 100:.1f}% regression** in this three-run comparison; warm hashing is {median_row('selective', 17):,.2f} versus {median_row('old', 17):,.2f} ms. First depth-10 search also rises from {median_row('old', 14):,.2f} to {median_row('selective', 14):,.2f} ms. These observations remain in the tables; their cause has not been isolated. The principal improvement is retaining authorized content across policy refreshes. NFS still wins create/write ({median_row('nfs', 20):,.2f} versus {median_row('selective', 20):,.2f} ms), close, and unlink in this run, with the separate durability semantics above.

Mount readiness is measured separately from the benchmark. Memory peaks include the entire client cgroup; the file-backed charge also includes executable and oracle pages, not just filesystem content. Component peaks need not occur at the same instant and must not be added together.

```text
{table(['Client', 'Mount ready ms', 'Peak MiB', 'Peak file MiB', 'Peak daemon RSS MiB'], full_memory)}
```
'''
for title, rendered in full_tables:
    text += f'\n### {title}\n\n```text\n{rendered}\n```\n'
text += '''
## Evidence and limits

The cloud build runs Rust integration tests, Clippy with warnings denied, formatting, 14 mounted Unix test methods, the policy suite, and six failure scenarios. Build logs and JSON records are under `server/cloud-build`. The four focused retention results, propagation records, full benchmark output, metrics, memory samples, and individual scans are under `client`.

The improvement preserves already-demanded authorized content. It does not preload a workspace, remove cold authorization cost, promise cache residency under memory pressure, or eliminate full metadata refreshes. Revocation remains asynchronous and disconnected reads have no strict freshness lease. Product integration and durable acknowledgments remain outside this measured implementation.

The earlier local failed attempts and reclaim observations remain in [REPORT.md](REPORT.md). The initial cloud provisioning attempt failed authentication before creating resources; `provision-resumed.log` records the successful retry. The cloud build, correctness suites, and both performance matrices completed on their first execution in this resumed deployment. Cleanup status is recorded separately in `cloud-cleanup-verification.json` after evidence export.
'''
(base / 'CLOUD_REPORT.md').write_text(text)
(base / 'TABLES.md').write_text('# Selective invalidation: old DFS, DFS, and NFS\n\nSame client VM, separate DFS server and Filestore; 512 MiB total client memory, 32 MiB daemon block allowance, zero startup content preload. Median of three mounts. First rows inherit prior benchmark phases. DFS fsync is publication-only. [Methodology and evidence](CLOUD_REPORT.md).\n' + ''.join(f'\n## {title}\n\n```text\n{rendered}\n```\n' for title, rendered in full_tables))
print(table(['Client', 'First ms', 'Warm ms', 'Post-policy ms', 'Rewarm ms', 'Peak MiB'], performance))
print(json.dumps({key: value for key, value in summary.items() if key != 'evidence_sha256'}, indent=2))
