#!/usr/bin/env python3
import hashlib
import gzip
import json
import pathlib
import statistics

root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'results/selective'
scans = output / 'local-scans-4'
evidence = {}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    evidence[str(path.relative_to(root))] = digest(path)
    return json.loads(path.read_text())


def table(headers, rows):
    widths = [max(len(str(row[index])) for row in [headers, *rows]) for index in range(len(headers))]
    border = '+' + '+'.join('-' * (width + 2) for width in widths) + '+'
    lines = [border, '| ' + ' | '.join(str(value).ljust(width) for value, width in zip(headers, widths)) + ' |', border]
    lines += ['| ' + ' | '.join(str(value).ljust(width) for value, width in zip(row, widths)) + ' |' for row in rows]
    return '\n'.join([*lines, border])


assert read(scans / 'completed.json')['passed']
order = read(scans / 'order.json')
assert len(order) == 18 and len({tuple(case) for case in order}) == 18
assert {(user, mode) for _, user, mode in order} == {(user, mode) for user in ['admin', 'alice', 'bob'] for mode in ['old', 'selective']}
groups = {}
misses = []
phases = ['first', 'warm', 'after_unrelated_grant', 'rewarm']
for round_number, user, mode in order:
    data = read(scans / f'{round_number}-{user}-{mode}/results.json')
    assert data['passed'] and data['backend'] == 'dfs' and data['mode'] == mode and data['user'] == user
    assert data['memory_limit_bytes'] == 512 << 20 and data['daemon_cache_budget_bytes'] == 32 << 20
    assert data['initial']['dfs']['cache_bytes'] == data['initial']['dfs']['counters']['data_calls'] == 0
    events = dict(line.split() for line in data['final_memory']['memory.events'].splitlines())
    assert int(events['oom']) == int(events['oom_kill']) == 0
    assert [row['phase'] for row in data['records']] == phases
    for row in data['records']:
        before, after = row['before']['dfs'], row['after']['dfs']
        actual = after['counters']['data_calls'] - before['counters']['data_calls']
        assert actual == row['content_rpcs']
        if row['phase'] == 'first' or (mode == 'old' and row['phase'] == 'after_unrelated_grant'):
            assert actual == 10000
        assert after['cache_bytes'] <= 32 << 20 and before['cache_bytes'] <= 32 << 20
        if row['expected_resident'] and (actual or row['fuse_reads']):
            previous = data['records'][phases.index(row['phase']) - 1]['after']
            stats = [dict(line.split() for line in snapshot['memory']['memory.stat'].splitlines()) for snapshot in [previous, row['before'], row['after']]]
            misses.append({'run': f'{round_number}-{user}-{mode}', 'phase': row['phase'], 'content_rpcs': actual, 'fuse_reads': row['fuse_reads'], 'file_bytes_previous_after_before_after': [int(stat['file']) for stat in stats], 'pgsteal_previous_after_before_after': [int(stat.get('pgsteal', 0)) for stat in stats]})
    groups.setdefault((user, mode), []).append(data)

functional = []
for delivery in ['watch', 'poll']:
    for mode in ['old', 'selective']:
        name = ('local-old-cache-' if mode == 'old' else 'local-cache-') + delivery + '.json'
        result = read(output / name)
        assert result['passed'] and result['mode'] == mode and result['drop_events'] == (delivery == 'poll')
        records = result['records']
        identity = next(row for row in records if row['case'] == 'ordinary_user')
        assert identity['uid'] == identity['gid'] == 5101 and identity['groups'] == []
        for row in records:
            if 'data_calls' in row:
                expected = len(row['paths']) if mode == 'old' else 0
                assert row['data_calls'] == row['fuse_reads'] == expected
                functional.append([delivery, mode, row['case'], str(row['data_calls']), str(row['fuse_reads'])])
            if 'allowed' in row:
                assert not row['allowed']
unix = read(output / 'local-final-unix.json')
assert unix['tests_run'] == 14 and not unix['failures'] and not unix['errors']
assert read(output / 'local-final-policy.json')['passed']
assert read(output / 'local-final-failures.json')['passed']
deployment = read(output / 'local-deployment.json')
assert deployment['client']['memory'] == deployment['client']['memory_swap'] == 512 << 20
assert 'orbstack' in deployment['docker']['kernel']
manifest = read(output / 'local-server/corpus-manifest.json')
assert manifest == json.loads(gzip.decompress((root / 'results/kernel-cache/client/corpus-manifest.json.gz').read_bytes()))
assert len(manifest['paths']) == 10000
corpus_check = read(output / 'local-server/corpus-check.json')
assert corpus_check['passed'] and corpus_check['files'] == 10000
assert corpus_check['manifest_sha256'] == digest(output / 'local-server/corpus-manifest.json')
assert read(output / 'local-cleanup.json')['passed']
roles = read(output / 'local-server/credential-roles.json')
for role in roles:
    assert role['admin'] == (role['subject'] == 'admin')

measured = read(output / 'local-source.json')['files']
old = read(root / 'results/kernel-cache/source-check.json')['files']
core_paths = [path for path in measured if path.startswith(('src/', 'tests/', 'proto/')) or path in ['Cargo.toml', 'Cargo.lock', 'build.rs']]
for path in core_paths:
    assert digest(root / path) == measured[path], path
    assert digest(root / 'runtime/selective-old-source' / path) == old[path], path
for name in ['local-binaries.sha256', 'local-old-binaries.sha256', 'local-server/binaries.sha256', 'local-server/old-binaries.sha256']:
    path = output / name
    evidence[str(path.relative_to(root))] = digest(path)
    for line in path.read_text().splitlines():
        expected, relative = line.split()
        assert digest(root / relative) == expected, relative
for name in ['selective-scan.py', 'selective-cache-scenarios.py', 'local-selective-matrix.py', 'local-selective-server.sh']:
    path = root / 'scripts' / name
    evidence[str(path.relative_to(root))] = digest(path)

rows = []
traffic_rows = []
for user in ['admin', 'alice', 'bob']:
    for mode in ['old', 'selective']:
        runs = groups[user, mode]
        assert len(runs) == 3
        times = [f'{statistics.median(run["records"][index]["time_ms"] for run in runs):,.2f}' for index in range(4)]
        peak = max(int(run['final_memory']['memory.peak']) for run in runs) / 2**20
        rows.append([user, mode, *times, f'{peak:.1f}'])
        traffic_rows.append([user, mode, *[str([run['records'][index]['content_rpcs'] for run in runs]) for index in range(4)]])
scan_table = table(['Principal', 'DFS', 'First ms', 'Warm ms', 'Post-grant ms', 'Rewarm ms', 'Peak MiB'], rows)
traffic_table = table(['Principal', 'DFS', 'First RPCs', 'Warm RPCs', 'Post-grant RPCs', 'Rewarm RPCs'], traffic_rows)
retention_table = table(['Delivery', 'DFS', 'Scenario', 'Content RPCs', 'FUSE reads'], functional)
report = f'''# Selective grant invalidation: local evaluation

The implementation preserves content for unchanged, still-readable files across grant refreshes. Changed permissions, versions, namespace projections, and retained inodes missing from the new view still trigger invalidation. Restart and credential loss retain broad invalidation.

**Status:** implementation and local validation completed. The separate [cloud/NFS evaluation](CLOUD_REPORT.md) is also complete. Local timings are not pooled with cloud measurements. See [the reconstruction design](../../REIMPLEMENTATION_DESIGN.md) for the target architecture and workload assumptions.

The design snapshot includes behavior beyond this measured build: paged metadata and scoped policy deltas, dependency-validated server authorization caching, cross-request read coalescing and pressure-aware cache admission, durable fsync/policy barriers, supervised freshness leases, retention/GC, external owner fencing, weighted tenant scheduling, and the Product adapter. This evaluation does not establish implementation or validation of those target mechanisms. Its implementation claims cover selective cache invalidation and the existing tested filesystem behavior.

## Controlled local search comparison

Eighteen randomized runs: three independent fresh mounts for each client build and principal. Linux ARM64 containers on OrbStack, separate server/client containers on one Docker network. [Recorded deployment](local-deployment.json): kernel `{deployment['docker']['kernel']}`, {deployment['docker']['cpus']} virtual CPUs, ripgrep 13.0.0. Old clients are rebuilt from the prior measured kernel-cache source; selective clients use the current source. Both talk to the same current server; server behavior is unchanged. The server has a 2 GiB allowance. Each client container puts the application, mount, and charged kernel pages under **512 MiB**, swap disabled. The daemon block allowance is **32 MiB**, additional kernel pages are included in the 512 MiB limit. No concurrent build ran during these measurements.

The unchanged seed-42 generator supplies 10,000 documents, 177.5 MB. Each fresh mount starts with zero content preload, asserted by the runner. The workload lists 10,000 paths, searches for a missing literal, changes Carol's grant on an unrelated file, waits for reconciliation, and searches again. Every run checks the four rare-literal matches. Scans run as unprivileged Linux users; `admin` refers to the DFS credential, not the process UID. Alice has an ordinary direct grant; Bob gets corpus access through 32 groups. Both have LIST/TRAVERSE on the tenant root so they use the same path as admin.

Client mount startup, grant mutation, reconciliation, and the two-second post-change settling wait are **outside** the scan timer. Policy refresh still transfers/rebuilds a complete authorized metadata view; this table does not measure its latency or traffic. Server and shared host caches are uncontrolled, and host caches are not dropped. `First` means an empty client FUSE content cache, not cold physical storage. There is no local NFS measurement.

Median scan times, with maximum observed cgroup peak across each three-run group:

```text
{scan_table}
```

Content RPC counts for all three repetitions, including misses rather than filtering them out:

```text
{traffic_table}
```

Every first scan issues exactly **10,000 content RPCs**. Every old-client post-grant scan issues **10,000** again; all nine selective post-grant scans issue **zero content RPCs and zero FUSE reads**. There are **{len(misses)}** otherwise-expected-resident phases with content RPCs or FUSE reads; [verification.json](verification.json) lists them individually, including kernel reclaim counters. Background metadata/head RPCs still occur. No client records an OOM or OOM kill. See [randomized order](local-scans-4/order.json) and the per-run `results.json` files beside it. Performance-run success means workload/data checks passed, not that every cache-retention expectation passed; focused tests below enforce retention directly.

## Grant correctness and retention

Ordinary UID/GID 5101, no supplementary groups, separate Alice credential. Five small files span two folders. A direct share overlaps a group grant. Both notifications and dropped-notification polling runs compare old and selective clients. After group removal, revoked new opens, warmed retained linked/unlinked descriptors, and a warmed mapping must fail after completed reconciliation; the mapping receives SIGBUS. Restoring membership must restore access. The polling interval in these focused tests is 100 ms; these are functional checks, not production propagation-latency measurements.

```text
{retention_table}
```

The selective build also passes 27 Rust integration tests, Clippy with warnings denied, formatting, 14 mounted Unix test methods, the existing policy suite, and six failure scenarios. Core/reader regression coverage checks effective grant unions, projected ancestry changes, versions/removal/incarnation, LRU and speculative accounting, and rejection of old-generation reads even when unaffected resident bytes survive. Mounted suites cover same-size edits, truncation, directory updates, restart, and old handles. Linux build/check logs and JSON results are retained in this directory. The separate [cloud report](CLOUD_REPORT.md) adds current-build multi-user propagation and NFS comparisons; production-scale tail latency under load remains unmeasured.

## Failures and limitations retained

- `local-final-checks.log`: parallel linking under a 4 GiB build-container limit was killed. Rebuilding with two jobs and no compile-container limit passed. Runtime client measurements remain limited to 512 MiB.
- `local-retention.log`: the harness raced metrics-file replacement on a Docker bind mount. A bounded FileNotFoundError retry fixed collection.
- `local-retention-2.log`: a real extra FUSE read after group removal exposed unnecessary invalidation of an unchanged directory entry. The implementation now retains unchanged projected dentries while invalidating affected inode/parent pages.
- `local-final-mounted.log`: one restoration observation had zero content RPCs but three FUSE reads while a baseline compilation was running. Memory reclaim is a possible explanation, not a proven diagnosis. Strict zero-FUSE assertions passed in the subsequent quiet old/new notification/polling runs; the failed observation is retained.
- `local-matrix.log` / `local-scans`: the initial standalone setup lacked root traversal/list grants, so ordinary-user paths were projected under `/shared`; the expected `/files/corpus/docs` path did not exist. Explicit ancestor grants fixed the setup.
- `local-matrix-2.log` / `local-scans-2`: the first retry reused an isolated server filename and failed with EEXIST. Run-specific names fixed the harness. Failed attempts are excluded from timing aggregates and preserved.
- `local-matrix-3.log` / `local-scans-3`: five completed cases and one partial case are retained. The partial 32-group selective run refetched all 10,000 files on its warm scan. Between scans, file-backed charge fell from 205,426,688 to 3,895,296 bytes, while the view head, snapshot count, and daemon block residency stayed unchanged. No cgroup-limit or OOM event was recorded. The same phase of the final matrix experienced 50,152 reclaimed pages (`pgsteal`) between scans, with unchanged DFS head/snapshot/cache state: kernel reclaim accounts for that page loss, though its host trigger is unresolved. The final complete randomized matrix records misses rather than aborting on them, while retaining workload correctness checks. All final runs enter the aggregate; none are discarded for poor cache performance. Focused functional retention assertions remain strict.
- `provision.log`: cloud authentication failed before the first bucket creation, so this attempt created no cloud resources. The successful retry and resulting cloud/NFS evaluation are recorded separately in [CLOUD_REPORT.md](CLOUD_REPORT.md).
- The matrix completion file's static `Docker Desktop` deployment label was mistaken. The actual Docker API/kernel inspection in `local-deployment.json` identifies OrbStack; that captured environment is used here. The runner's future completion label is corrected without rewriting the recorded measurements.

Cache retention does not prevent memory-pressure eviction. Revocation remains asynchronous and has no disconnected-client freshness lease. A full metadata view is still rebuilt after unrelated policy changes. Unix fsync still confirms publication rather than WAL persistence. This change does not address those separate costs or guarantees.

The generated source corpus matches the previous manifest exactly and all 10,000 source document hashes were checked before cleanup. [Cleanup verification](local-cleanup.json) confirms the owned local server/client containers, network, and data volume are absent. Staged binaries, source archives, and public results remain under this experiment directory; credentials remain in ignored runtime storage.
'''
(output / 'REPORT.md').write_text(report)
(output / 'verification.json').write_text(json.dumps({'passed': True, 'local_scan_runs': 18, 'focused_retention_runs': 4, 'resident_phase_misses': misses, 'core_source_inputs_checked': len(core_paths), 'cloud_nfs_evaluation': 'completed separately; see cloud-verification.json', 'evidence_sha256': evidence}, indent=2) + '\n')
print(scan_table)
