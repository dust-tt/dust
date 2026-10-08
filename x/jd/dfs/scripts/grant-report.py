#!/usr/bin/env python3
import collections
import hashlib
import json
import pathlib
import statistics

root = pathlib.Path(__file__).resolve().parents[1]
base = root / 'results/grants'
client = base / 'client'
propagation = json.loads((client / 'propagation-2/results.json').read_text())
assert propagation['passed']
records = propagation['records']
order = json.loads((client / 'scans/order.json').read_text())
assert json.loads((client / 'scans/completed.json').read_text()) == {'passed': True, 'runs': 12}


def table(headers, rows):
    values = [headers] + [[str(value) for value in row] for row in rows]
    widths = [max(len(row[i]) for row in values) for i in range(len(headers))]
    border = '+' + '+'.join('-' * (width + 2) for width in widths) + '+'
    lines = [border, '| ' + ' | '.join(value.ljust(width) for value, width in zip(values[0], widths)) + ' |', border]
    lines += ['| ' + ' | '.join(value.ljust(width) for value, width in zip(row, widths)) + ' |' for row in values[1:]]
    lines += [border]
    assert len(set(map(len, lines))) == 1
    return '\n'.join(lines)


def numbers(values):
    return f'{statistics.median(values):,.2f} / {max(values):,.2f}'


cases = [('direct_read_gain', 'Direct read gained'), ('direct_read_revoke', 'Direct read revoked'), ('group_read_write_gain', 'Group read gained'), ('group_write_gain', 'Group write gained'), ('group_write_revoke', 'Group write revoked'), ('group_read_revoke', 'Group read revoked')]
latencies = []
for case, title in cases:
    row = [title]
    for cohort in ['dfs-watch', 'dfs-poll', 'nfs']:
        selected = [r['after_ack_ms'] for r in records if r['kind'] == 'propagation' and r['case'] == case and r['cohort'] == cohort]
        assert len(selected) == (5 if case.startswith('direct') else 10)
        row.append(numbers(selected))
    latencies.append(row)
latency_table = table(['Operation', 'DFS watch ms med/max', 'DFS poll ms med/max', 'NFS ms med/max'], latencies)
retained = []
for cohort in ['dfs-watch', 'dfs-poll', 'nfs']:
    descriptors = [r for r in records if r['kind'] == 'retained_descriptor' and r['cohort'] == cohort]
    mapping = next(r for r in records if r['kind'] == 'retained_mapping' and r['cohort'] == cohort)
    retained.append([cohort, ', '.join(f"{r['after_ack_ms']:.0f}ms:{'readable' if r['allowed'] else 'denied'}" for r in descriptors), 'readable' if mapping['allowed'] else 'SIGBUS'])
retained_table = table(['Client', 'Held descriptor after mutation acknowledgment', 'Warmed mapping'], retained)
performance = collections.defaultdict(list)
run_hashes = {}
for round_number, backend, user in order:
    path = client / 'scans' / f'{round_number}-{backend}-{user}' / 'results.json'
    result = json.loads(path.read_text())
    assert result['passed'] and result['memory_limit_bytes'] == 512 << 20
    events = dict(line.split() for line in result['final_memory']['memory.events'].splitlines())
    assert int(events['oom']) == 0 and int(events['oom_kill']) == 0
    assert int(result['final_memory']['memory.peak']) <= (512 << 20) + (1 << 20)
    assert len(result['records']) == 4
    if backend == 'dfs':
        assert result['records'][0]['before']['dfs']['cache_bytes'] == 0
        assert result['records'][0]['before']['dfs']['counters']['data_calls'] == 0
    for record in result['records']:
        if backend == 'dfs':
            assert record['after']['dfs']['cache_bytes'] <= 32 << 20
            record['content_rpc_delta'] = record['after']['dfs']['counters']['data_calls'] - record['before']['dfs']['counters']['data_calls']
    performance[(backend, user)].append(result)
    run_hashes[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
performance_rows = []
traffic_rows = []
for backend, user in [('dfs', 'admin'), ('dfs', 'alice'), ('dfs', 'bob'), ('nfs', 'alice')]:
    runs = performance[(backend, user)]
    assert len(runs) == 3
    label = f'{backend.upper()} {user}' + (' (32 groups)' if user == 'bob' else '')
    performance_rows.append([label] + [f'{statistics.median(run["records"][i]["time_ms"] for run in runs):,.2f}' for i in range(4)] + [f'{max(int(run["final_memory"]["memory.peak"]) for run in runs) / (1 << 20):.1f}'])
    if backend == 'dfs':
        traffic_rows.append([label] + [','.join(str(run['records'][i]['content_rpc_delta']) for run in runs) for i in range(4)])
performance_table = table(['Client', 'First ms', 'Warm ms', 'After policy ms', 'Rewarm ms', 'Peak MiB'], performance_rows)
traffic_table = table(['Client', 'First RPCs (3 runs)', 'Warm RPCs', 'After policy RPCs', 'Rewarm RPCs'], traffic_rows)
scenarios = [r for r in records if r['kind'] == 'scenario']
assert all(r['passed'] for r in scenarios)
assert not any(r.get('timeout') for r in records)
assert len([r for r in records if r['kind'] == 'identity']) == 9
memory = json.loads((client / 'propagation-2/memory.json').read_text())
assert int(memory['memory.max']) == 2 << 30
assert dict(line.split() for line in memory['memory.events'].splitlines())['oom_kill'] == '0'
summary = {'passed': True, 'propagation_observations': sum(r['kind'] == 'propagation' for r in records), 'access_checks': sum(r['kind'] == 'access' for r in records), 'scenario_checks': len(scenarios), 'performance_runs': 12, 'raw_run_hashes': run_hashes, 'propagation_sha256': hashlib.sha256((client / 'propagation-2/results.json').read_bytes()).hexdigest()}
(base / 'verification.json').write_text(json.dumps(summary, indent=2) + '\n')
text = f'''# Multi-user grants and NFS comparison — 30 September 2026

Three ordinary principals (Alice, Bob, Carol), six DFS mounts (notifications enabled or deliberately dropped), and three NFS reader identities. The measured user operations run as Linux UIDs 5101–5103, never root. DFS mounts use separate user credentials; administrative credentials only arrange policy and fixtures. The separate performance control explicitly labels the admin credential.

The final propagation run passed {summary['propagation_observations']} convergence observations and {summary['access_checks']} direct access checks, plus {summary['scenario_checks']} additional scenario assertions. Twelve focused search runs passed. This is bounded correctness/latency evidence, not a revocation SLA or a production-scale load test. Earlier failed attempts are retained and explained below.

## Propagation

Time from receipt of mutation acknowledgment by the client coordinator to observed operation outcome, in milliseconds. Each cell is median / maximum. Five mutation cycles per case; group rows contain two affected users per cycle. Poll probes sleep 5 ms between attempts. A value below that interval means the first probe already observed the result. Control RPC/TLS/process-launch time is excluded from these numbers and retained as `admin_request_ms` in raw records. Acknowledgment can arrive after a client has already begun reconciling; these are post-ack observations, not full server-publication-to-revocation times.

```text
{latency_table}
```

DFS poll deliberately drops notifications and uses the existing one-second fallback. The notification cohort still incurs full authorized-view reconstruction and kernel invalidation. Read gain and write gain are measured separately: observing one does not establish convergence of the other. Successful write probes run sequentially across users to avoid manufacturing concurrent-write conflicts, so their later-user timings also include prior probes. The WRITE-gain row also begins after both DFS read cohorts have converged; it is an observed end-to-end upper bound, not an isolated comparison of notification and polling write latency. Read and denied-write probes run concurrently. Server-side write rejection can precede client view refresh, so a fast denied-write probe is not a complete cache-revocation barrier.

## Retained access

The descriptor and mapping were opened and read before revocation. Descriptor samples follow observed denial of a new open, then another one and three seconds of waiting. Exact times below are since acknowledgment, not those additional waits.

```text
{retained_table}
```

DFS can deny a new open while an older descriptor still reads kernel-cached data until the asynchronous invalidation finishes. A new-open denial is therefore not a cached-access revocation barrier. The settled DFS descriptor checks require denial, and the warmed shared read-only mappings require SIGBUS. NFS retained access is an observed semantic difference, not counted as failure of a DFS-style revocation guarantee. No mechanism can retract bytes already copied into application memory.

## Other checked DFS cases

- Alice and Bob gain group read/write; Carol remains denied.
- Revoking WRITE preserves READ; removing READ then denies new opens.
- Bob's direct READ remains when group membership is removed, while group-derived WRITE disappears. Restoring membership restores WRITE without editing the file grant.
- An inherited folder grant covers existing and newly created children; revoking it removes access to both.
- Revocation denies Bob's retained descriptor even after its pathname was unlinked.
- Carol's direct leaf share exposes `/shared/leaf~id` while hiding ancestor and sibling names.
- Knowing a node ID does not let Carol bypass the server's READ check.
- Alice can delegate READ when granted READ+GRANT, but cannot delegate WRITE she does not hold.

## Search cost of permissions and unrelated policy changes

Same generated corpus: 10,000 files, 177.5 MB of document contents. A focused `rg -l -F BENCH_ABSENT_TOKEN` scan, not the full vendor benchmark. Three fresh mounts per case, randomized order, dropped client caches, no startup content preload, a 32 MiB daemon cache, and a shared 512 MiB cgroup including application, daemon, and kernel pages; swap disabled. Server caches are uncontrolled. The ordinary Alice credential inherits corpus access. Bob inherits access through 32 flat groups; this is DFS authorization stress, not an NFS group-count equivalence.

After first and warm scans, the coordinator changes Carol's permission on an unrelated file outside the corpus. DFS waits for the published head to be observed, then both backends wait two seconds before the next scan. The NFS counterpart is a remote chmod of an unrelated file, not a claim of equivalent ACL expressiveness. All scans check no-match exit status/output, enumerate 10,000 files, and verify four rare matches after timing. Corpus hashes are independently checked on the server and NFS copy.

Median elapsed times across three mounts; peak memory is the maximum observed cgroup peak across those mounts.

```text
{performance_table}
```

Content RPC counts for each individual DFS run:

```text
{traffic_table}
```

Every policy reset currently rebuilds the complete authorized metadata view, clears daemon content blocks, and invalidates all known kernel inodes, including unaffected files. This protects correctness after reconciliation but loses useful warmed data. These measurements quantify that behavior; no production implementation or binary was changed for this experiment. Correctness takes priority over speed. The intended optimization is to invalidate every file whose effective access or content changed, including inherited descendants and retained unlinked handles, while preserving provably unaffected content. A whole-cache reset should be necessary only when the affected scope includes the whole cache. Smaller invalidation sets and incremental authorized-view updates must preserve group unions, inheritance, hidden paths, mappings, in-flight read validation, and retained-handle revocation; these changes are not implemented in this test-only work.

## Comparison boundaries

The NFS service is Zonal Google Filestore, NFSv3, with the client's default close-to-open/attribute/access caching. Owner/group/mode permissions are set from a separate VM, preventing local chmod from directly invalidating the reader's cache. Alice/Bob include supplemental GID 6100; Carol does not. The same NFS mount is shared by the three numeric identities. DFS uses one credential-bound mount per principal.

Zonal Filestore offers basic POSIX owner/group/mode permissions; extended POSIX ACL support is restricted to Basic tiers. Thus overlapping per-user grants, server-side membership propagation, GRANT delegation, and hidden-ancestry sharing have no exact counterpart in this comparison. NFS AUTH_SYS trusts numeric credentials supplied by the client; existing process supplemental groups are not a live DFS-style server membership list. This experiment does not test hostile root clients or claim that `--allow-other` creates user isolation inside one credential-bound DFS mount. See [Filestore access control](https://docs.cloud.google.com/filestore/docs/access-control) and [Linux NFS cache semantics](https://man7.org/linux/man-pages/man5/nfs.5.html).

Disconnected clients, rapid continuous grant churn, tenant-scale fanout, expiry/credential rotation, multi-tenant attacks, and hard upper bounds on stale cached access are not newly tested here. The earlier failure suite is separate evidence. In particular, DFS has no strict freshness lease that can revoke already-cached data while a client is offline.

## Retained development evidence

- `pilot-1`: control service not yet ready; no access measurement.
- `pilot-2`: harness argument-name collision; no access measurement.
- `pilot-3`: stopped when the first descriptor sample remained readable after a new open was denied. This exposed the asynchronous revocation window; the final harness records early samples and asserts settled denial.
- `pilot-4`: completed both backends' common permission/descriptor/mapping probes, then failed an unlink request that supplied a node ID instead of the entry token. The server correctly rejected it as stale.
- `propagation`: stopped on a denied write after a read had succeeded during grant gain. The final harness measures write convergence separately; the denied operation is retained.
- `propagation-2`: final repeated scenarios.

The propagation harness has a shared 2 GiB limit for all six daemons and reader workers together; peak was {int(memory['memory.peak']) / (1 << 20):.1f} MiB, with no OOM kills. This limit is distinct from each 512 MiB search run. Raw records include Linux identity, byte hashes, denial errno, timing, metrics, memory accounting, and mount options. Final checked inputs and binary identities are linked in `source-check.json`; resource removal is recorded in `cleanup-verification.json`.
'''
(base / 'REPORT.md').write_text(text)
print(json.dumps(summary, indent=2))
print(latency_table)
print(performance_table)
