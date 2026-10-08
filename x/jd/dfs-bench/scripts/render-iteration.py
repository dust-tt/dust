import argparse
import json
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('iteration')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
evidence = root / 'results/iterations' / args.iteration
backends = ['rocks', 'fdb', 'tikv']
labels = ['RocksDB + Tantivy', '3 FDB + 3 ES', '3 TiKV + 3 ES']
records = {}
for backend in backends:
    record = json.loads((evidence / (backend + '.json')).read_text())
    assert record['passed'] and record['untar']['all_hashes_verified'], backend
    assert record['scope'] == 'untar, filesystem, search', backend
    with tarfile.open(evidence / (backend + '.tar.gz')) as archive:
        for key, name in [('filesystem', 'workloads.json'), ('search', 'search.json'), ('untar_metrics', 'untar-mount-metrics.json'), ('filesystem_metrics', 'filesystem-mount-metrics.json')]:
            record[key] = json.load(archive.extractfile('./' + name))
    assert record['filesystem']['passed'] and len(record['filesystem']['rows']) == 24
    assert record['search']['passed'] and len(record['search']['rows']) == 6
    records[backend] = record
assert len({r['manifest_sha256'] for r in records.values()}) == 1

lines = [
    '# Full three-system SSD benchmark',
    '',
    f'Completed iteration: **{args.iteration}**. All three systems passed extraction, content hashes, the 24-row filesystem suite and all six search cases. Each timed phase started from a shared barrier, on independent clients and servers with indexing enabled.',
    '',
    'The corpus has 10,000 documents, 100 directories and 177,499,149 document bytes; the manifest is one additional file. All data and indexes use dedicated Titanium NVMe Local SSDs. [Topology](TOPOLOGY.md), [method and resource limits](METHOD.md), and [implementation and DDIA rationale](WRITE_PATH_REWORK.md). [Architecture choices](ARCHITECTURE_CHOICES.md) and [Git workload](GIT_WORKLOAD.md) are separate reports.',
    '',
    '## Extraction and durability',
    '',
    'Eligible changes and close may acknowledge a bounded, volatile client buffer; the linked rework design specifies which operations are buffered. Explicit fsync and graceful unmount drain accepted changes and wait for fenced, durable publication. The following synchronization pass opens, fsyncs and closes all 10,001 regular files. The sum excludes gaps between timed regions.',
    '',
    '| System | Untar (s) | Open + fsync + close (ms) | Sum of timed regions (s) | Untar / RocksDB |',
    '|---|---:|---:|---:|---:|',
]
for backend, label in zip(backends, labels):
    value = records[backend]['untar']
    ratio = value['extraction_ms'] / records['rocks']['untar']['extraction_ms']
    lines.append(f"| {label} | {value['extraction_ms']/1000:,.3f} | {value['open_fsync_close_all_files_ms']:,.3f} | {value['extraction_plus_sync_ms']/1000:,.3f} | {ratio:.2f}× |")
lines += ['', '## Filesystem operations', '', 'Times are milliseconds. “First” is the first invocation on a fresh mount, with server/database caches already warmed by ingestion, indexing and validation. “Warm” is the median of three immediate repetitions. Every sample validates its output.', '', '| Filesystem workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |', '|---|---|---:|---:|---:|---:|---:|']
for index, row in enumerate(records['rocks']['filesystem']['rows']):
    values = []
    for backend in backends:
        other = records[backend]['filesystem']['rows'][index]
        assert (other['workload'], other['phase']) == (row['workload'], row['phase'])
        values.append(other['median_ms'])
    label = row['workload'].replace('|', '\\|')
    lines.append(f"| {label} | {row['phase']} | {values[0]:,.2f} | {values[1]:,.2f} | {values[2]:,.2f} | {values[1]/values[0]:.2f}× | {values[2]/values[0]:.2f}× |")
lines += ['', '## Search operations', '', 'Times include HTTPS, index candidate selection, current authorization/revision checks and requested document text. Each query validates completeness and hit counts; rare literal results also validate identities and text. Warm values are medians of ten repetitions over a persistent connection. RocksDB includes its local nginx TLS proxy.', '', '| Search workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |', '|---|---|---:|---:|---:|---:|---:|']
for index, row in enumerate(records['rocks']['search']['rows']):
    for phase, key in [('first', 'first_ms'), ('warm', 'warm_median_ms')]:
        values = []
        for backend in backends:
            other = records[backend]['search']['rows'][index]
            assert other['workload'] == row['workload']
            values.append(other[key])
        label = row['workload'].replace('|', '\\|')
        lines.append(f'| {label} | {phase} | {values[0]:,.2f} | {values[1]:,.2f} | {values[2]:,.2f} | {values[1]/values[0]:.2f}× | {values[2]/values[0]:.2f}× |')
lines += ['', '## Publication and validation evidence', '', 'Metadata, revision and cached authority expire within 500 ms of validation start. Publication has a separate 500 ms budget, with a worker eligible at 100 ms. These are healthy-system visibility budgets; unpublished bytes cannot become remotely visible during a partition. Publication age runs from acceptance through confirmed publication. Before buffer-10, partial drains conservatively retained the old batch origin; buffer-10 tracks the original acceptance time of each pending record.', '', '| System / phase | Buffered batches | Node updates in batches | Maximum publication age (ms) | Budget misses | Mutation RPCs | Metadata delta RPCs |', '|---|---:|---:|---:|---:|---:|---:|']
for backend, label in zip(backends, labels):
    for phase in ['untar', 'filesystem']:
        metrics = records[backend][phase + '_metrics']
        buffer = metrics['fuse']['buffered']
        client = metrics['client']
        lines.append(f"| {label} / {phase} | {buffer['batches']} | {buffer['files']} | {buffer['max_publication_age_us']/1000:,.3f} | {buffer['publication_budget_misses']} | {client['mutation_calls']} | {client['head_calls']} |")
if all('timings' in records[b]['untar_metrics']['client'] for b in backends):
    lines += ['', '## Write-path RPC durations', '', 'Client-observed durations include encoding, retries, network and decoding. Counts also cover untar mount setup and validation. Summed durations can overlap and are not a decomposition of wall time.', '', '| System | RPC operation | Calls | Total duration (ms) | Mean (ms) | Maximum (ms) |', '|---|---|---:|---:|---:|---:|']
    for backend, label in zip(backends, labels):
        timings = records[backend]['untar_metrics']['client']['timings']
        for kind in ['create', 'setattr', 'write', 'put_files']:
            timing = timings[kind]
            count = timing['calls']
            mean = f"{timing['elapsed_us']/1000/count:,.3f}" if count else '—'
            lines.append(f"| {label} | {kind} | {count} | {timing['elapsed_us']/1000:,.3f} | {mean} | {timing['max_us']/1000:,.3f} |")
lines += ['', 'The historical `files` counter counts node-update records, including directory changes where batching is enabled; it is not a distinct-file count. Untar counters also include its subsequent synchronization and content audit. Filesystem counters cover the whole suite. Neither is a count of physical database round trips. Zero publication-budget misses establishes the observed timing only, not a general failure-time guarantee.', '', '## Scope and limitations', '', 'These are single concurrent trials, with repeated warm operations rather than repeated fresh full runs. Each system has one unscoped administrative client. The distributed architectures have three database hosts and three separate Elasticsearch hosts; RocksDB has one server with embedded Tantivy. This does not compare equal total hardware, establish concurrent-writer scaling, or measure fine-grained permission overhead.', '', f'The shared tenant journal still serializes publication. Publication buffering is bounded to {"128 node updates and two MiB" if args.iteration == "buffer-11" else "64 node updates and one MiB"} of file payload. Existing-file data writes, root attributes, rename and unlink retain synchronous publication. Initial/reset metadata views still materialize the tenant. Search visibility is asynchronous and is checked separately from filesystem durability. This trial does not inject client crashes, partitions or host loss.', '', '## Reproducible records', '']
for backend, label in zip(backends, labels):
    lines.append(f'- {label}: [result](../results/iterations/{args.iteration}/{backend}.json), [raw samples, logs and metrics](../results/iterations/{args.iteration}/{backend}.tar.gz).')
lines += [f'- [Phase barriers](../results/iterations/{args.iteration}/barriers.json), [source fingerprints](../results/{args.iteration}-source.json), [source verification](../results/{args.iteration}-source-verification.json), [binary fingerprints](../results/{args.iteration}-binaries.json), [deployed binaries and NVMe verification](../results/{args.iteration}-runtime.json).', '', 'All individual timing samples are retained in the raw archives. Earlier iterations and failed preflights remain separately labeled in [the results history](RESULTS.md).', '']
if (root / 'results' / (args.iteration + '-source.tar.gz')).exists():
    lines += [f'[Exact source archive](../results/{args.iteration}-source.tar.gz).', '']
(root / 'docs/FULL_RESULTS.md').write_text('\n'.join(lines))
print(root / 'docs/FULL_RESULTS.md')
