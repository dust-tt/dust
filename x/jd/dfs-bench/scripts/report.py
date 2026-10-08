from datetime import datetime, timezone
import json
from pathlib import Path
import socket

root = Path(__file__).resolve().parents[1]
backends = ['rocks', 'fdb', 'tikv']
names = ['RocksDB + Tantivy', 'FDB + ES', 'TiKV + ES']


def read(path):
    return json.loads(path.read_text())


def evidence(backend):
    return root / 'results/hosts' / (backend + '-client') / 'evidence/client'


def utc(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec='milliseconds')


results = {backend: read(evidence(backend) / 'result.json') for backend in backends}
workloads = {backend: read(evidence(backend) / 'workloads.json') for backend in backends}
search = {backend: read(evidence(backend) / 'search.json') for backend in backends}
assert all(result['passed'] and result['untar']['all_hashes_verified'] for result in results.values())
assert len({result['manifest_sha256'] for result in results.values()}) == 1
assert all(result['files'] == 10000 and result['document_bytes'] == 177499149 for result in results.values())
assert all(value['passed'] and len(value['rows']) == 24 for value in workloads.values())
assert all(value['passed'] and len(value['rows']) == 6 for value in search.values())
for i, row in enumerate(workloads['rocks']['rows']):
    for backend in backends:
        peer = workloads[backend]['rows'][i]
        assert (row['workload'], row['phase']) == (peer['workload'], peer['phase'])
        assert len(peer['samples_ms']) == (3 if row['phase'] == 'warm' else 1)
for i, row in enumerate(search['rocks']['rows']):
    assert all(search[backend]['rows'][i]['workload'] == row['workload'] and len(search[backend]['rows'][i]['samples_ms']) == 11 for backend in backends)

lines = ['# Clean parallel benchmark results', '', 'All three systems completed extraction, the 24-row filesystem suite and six search workloads. Every recorded sample passed its validator. This is one clean run on sixteen dedicated `c4-standard-8-lssd` VMs with Titanium NVMe Local SSDs in `us-east4`; previous results were deleted.', '', '[Method and resource limits](METHOD.md) · [host topology](TOPOLOGY.md) · [phase barriers](../results/barriers.json) · [source identity](../results/source.json)', '', '## Untar', '', 'Each client extracted an independently generated local uncompressed archive of the same corpus through its FUSE mount: 10,000 documents, 100 directories, 177,499,149 document bytes, plus the manifest. All document sizes and SHA-256 hashes passed. Indexing remained enabled. The separate sync row includes opening, fsync and closing all 10,001 regular files after tar returned; it does not measure directory-entry durability.', '', '| Workload | RocksDB + Tantivy (ms) | FDB + ES (ms) | TiKV + ES (ms) | FDB / RocksDB | TiKV / RocksDB |', '|---|---:|---:|---:|---:|---:|']


def timing_row(label, values):
    return '| ' + label + ' | ' + ' | '.join(f'{value:,.2f}' for value in values) + f' | {values[1] / values[0]:.2f}× | {values[2] / values[0]:.2f}× |'


for label, key in [('untar', 'extraction_ms'), ('open + fsync + close (10,001 files)', 'open_fsync_close_all_files_ms')]:
    lines.append(timing_row(label, [results[backend]['untar'][key] for backend in backends]))
lines += ['', '## Filesystem', '', '“First” is the first invocation on a fresh mount, with storage already warmed by extraction, indexing and validation. Warm values are medians of three immediate repetitions. Once values contain one validated sample. Times are milliseconds.', '', '| Filesystem workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |', '|---|---|---:|---:|---:|---:|---:|']
for i, row in enumerate(workloads['rocks']['rows']):
    lines.append(timing_row(row['workload'] + ' | ' + row['phase'], [workloads[backend]['rows'][i]['median_ms'] for backend in backends]))
lines += ['', '## Search', '', 'These are complete HTTPS API requests, including authorization and content verification. Each case has one first sample and ten warm samples; warm values are their median. A persistent connection is reused, so only the first query also includes connection setup. RocksDB search includes its same-host nginx TLS proxy. Search started only after all indexes caught up.', '', '| Search workload | Phase | Tantivy (ms) | FDB + ES (ms) | TiKV + ES (ms) | FDB / RocksDB | TiKV / RocksDB |', '|---|---|---:|---:|---:|---:|---:|']
for i, row in enumerate(search['rocks']['rows']):
    for label, key in [('first', 'first_ms'), ('warm', 'warm_median_ms')]:
        lines.append(timing_row(row['workload'] + ' | ' + label, [search[backend]['rows'][i][key] for backend in backends]))
lines += ['', '## Timing boundaries and index readiness', '', '| Phase | RocksDB start (UTC) | FDB start (UTC) | TiKV start (UTC) |', '|---|---|---|---|']
for phase in ('untar', 'filesystem', 'search'):
    lines.append('| ' + phase + ' | ' + ' | '.join(utc(results[backend]['phases'][phase]['actual_start_time']) for backend in backends) + ' |')
lines += ['', 'The coordinator published a common future timestamp at each barrier. Recorded guest-clock starts demonstrate overlapping launches; they are not a claim of physical microsecond clock accuracy. Faster systems waited before the next phase.', '', '| Setup measurement | RocksDB (ms) | FDB (ms) | TiKV (ms) |', '|---|---:|---:|---:|']
for label, key in [('Initial empty-mount startup', 'untar_mount_startup_ms'), ('Fresh populated-mount startup', 'filesystem_mount_startup_ms')]:
    lines.append('| ' + label + ' | ' + ' | '.join(f"{results[backend][key]:,.2f}" for backend in backends) + ' |')
delays = []
observations = [json.loads(line) for line in (root / 'results/run.log').read_text().splitlines() if line.startswith('{')]
for backend in backends:
    ready = read(root / 'results/hosts' / (backend + '-client') / 'control/ready-filesystem.json')
    first_ready = min([ready['time'], *[row['time'] for row in observations if row.get('waiting') == 'filesystem' and row['states'][backend]['ready']]])
    tar_return = results[backend]['phases']['untar']['actual_start_time'] + results[backend]['untar']['extraction_ms'] / 1000
    delays.append((first_ready - tar_return) * 1000)
lines.append('| Tar return → first observed readiness for filesystem suite | ' + ' | '.join(f'{delay:,.2f}' for delay in delays) + ' |')
lines += ['', 'The last row includes file sync, full hash validation, unmount, index catch-up, any earlier harness resumption, fresh mount startup and coordinator observation delay. For RocksDB it uses the first readiness observed in the coordinator log, before its idle mount was recreated; the later wait for the other systems is excluded. It is an upper bound on post-extraction index catch-up, not an isolated index latency measurement. The existing distributed indexer processes at most 16 journal events per pass and sleeps 500 ms between passes; Elasticsearch refresh and object reads add work. This implementation limit remains in the tested binaries.', '', 'The index-readiness deadline was extended after extraction without changing backend code or rerunning extraction. RocksDB’s idle populated mount was also recreated before the one-hour session lifetime expired, before any timed filesystem sample. The original untar driver is [retained](../results/harness/untar-client.py); the [current driver](../scripts/client.py) supports resumption. The initial signal-file race failed before timed work and was fixed with atomic replacement. These setup events are retained separately from the successful samples.', '', '## Evidence and limits', '', '| System | Client result | Filesystem samples | Search samples | Resource-counter interval |', '|---|---|---|---|---|']
for backend, name in zip(backends, names, strict=True):
    prefix = '../results/hosts/' + backend + '-client/evidence/client/'
    scope = results[backend].get('resources_scope')
    if scope is None:
        assert backend == 'rocks' and 'resumed_after_untar' not in results[backend]
        scope = 'all phases (original driver)'
    lines.append(f"| {name} | [result]({prefix}result.json) | [24 rows]({prefix}workloads.json) | [six cases]({prefix}search.json) | {scope} |")
lines += ['', '## Request counts and interpretation', '', 'These mount counters cover each complete mount lifetime. The untar mount includes extraction, the separate file-sync loop and full hash validation; its read counts are not extraction-only counts.', '', '| Mount lifetime / counter | RocksDB | FDB | TiKV |', '|---|---:|---:|---:|']
for phase in ('untar', 'filesystem'):
    metrics = {backend: read(evidence(backend) / (phase + '-mount-metrics.json')) for backend in backends}
    for key in ('rpc_calls', 'mutation_calls', 'head_calls', 'metadata_calls', 'snapshot_calls', 'data_calls', 'block_batches'):
        lines.append('| ' + phase + ' / ' + key + ' | ' + ' | '.join(f"{metrics[backend]['client'][key]:,}" for backend in backends) + ' |')
lines += ['', 'The FUSE extraction performs many mutations per file: create, data writes and metadata changes. Each published mutation can expose transaction and replication latency. FDB additionally retains immutable-tree uploads and a tenant-root transaction; uncached object reads open separate native transactions. Its index checkpoints also publish through that tenant root, adding a competing writer while extraction runs. TiKV uses direct records with shared tenant state/journal dependencies. These are source-supported mechanisms, not a profile attributing every millisecond. SSDs do not eliminate those serialized application round trips.', '', 'In DDIA terms, this comparison includes both replication cost (chapter 5) and application transaction/conflict boundaries (chapters 6–7). Search is separately maintained derived state (chapter 11). [Decision record](../../dfs-tikv/docs/DECISIONS.md), [FDB adapter](../../dfs-fdb/docs/IMPLEMENTATION.md), [TiKV transactions](../../dfs-tikv/docs/TXNKV_IMPLEMENTATION.md).']
lines += ['', 'All clients used the same 256 MiB content/manifest/hint cache, 128 MiB metadata limit, one-second metadata/revision/authority bound, and a 6 GiB application-plus-mount cgroup. Mount metrics and final service/container identities are preserved under each host’s evidence directory. The manifest SHA-256 is `' + results['rocks']['manifest_sha256'] + '`.', '', 'Fsync timing must be read alongside create/write: replicated publication already pays commit cost, and the mount coalesces persistence receipts. The file-sync loops do not imply one independent database commit or WAL flush per file.', '', 'RocksDB/Tantivy is one server with one storage copy. FDB and TiKV have three database hosts across three zones, plus three dedicated Elasticsearch hosts; Elasticsearch has three primary shards and one replica per shard. Frontend and database cache budgets are documented in the method. This compares the requested complete architectures, not equal aggregate resources or equal durability.', '', 'FDB status reports zero zone failures tolerated for availability in the requested three-host triple configuration; see the [native diagnostic](../results/hosts/fdb-a/evidence/fdb-during-untar.json). This benchmark includes no failure injection.', '', 'One client per system and one full extraction trial do not establish multiwriter scaling, failure tolerance, tail-latency distributions or statistical significance. Warm repetitions share caches and are not independent full trials. No HDD measurements or historical results are included.', '']
(root / 'docs/RESULTS.md').write_text('\n'.join(lines))
(root / 'results/report-validation.json').write_text(json.dumps({'passed': True, 'host': socket.getfqdn(), 'filesystem_rows_per_backend': 24, 'search_cases_per_backend': 6, 'manifest_sha256': results['rocks']['manifest_sha256']}, indent=2) + '\n')
print('Validated and generated complete three-system report')
