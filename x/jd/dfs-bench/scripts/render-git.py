import argparse
import json
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('full_iteration')
parser.add_argument('--worktree-iteration')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
backends = ['rocks', 'fdb', 'tikv']
labels = ['RocksDB + Tantivy', '3 FDB + 3 ES', '3 TiKV + 3 ES']


def records(iteration):
    directory = root / 'results/iterations' / iteration
    return {backend: json.loads((directory / (backend + '.json')).read_text()) for backend in backends}


full = records(args.full_iteration)
lines = ['## Results', '', '### Full clone with `.git` on FUSE', '', '| System | Outcome | Time to command exit (s) |', '|---|---|---:|']
for backend, label in zip(backends, labels):
    value = full[backend]['clone']
    outcome = 'Clone command succeeded' if value['successful'] else 'Failed (exit ' + str(value['exit_code']) + ')'
    lines.append(f"| {label} | {outcome} | {value['elapsed_ms']/1000:,.3f} |")
lines += ['', 'Failed-command times are times to failure, not completed clone performance. Search is skipped for incomplete checkouts.', '', 'RocksDB reached 8,589,925,675 retained bytes against the 8 GiB application quota, while 365,606,854,656 bytes remained available on its SSD. It issued 64,453 synchronous write RPCs, totaling 140.531 seconds of client-observed write RPC time. The growing per-file manifest and retained generations explain why a much smaller live pack can exhaust that quota. [Quota evidence](../results/git-01-rocks-quota.json), [SSD space](../results/git-01-rocks-disk.txt), [mount counters](../results/git-01-rocks-metrics.json), [architecture diagnosis](ARCHITECTURE_CHOICES.md#large-file-metadata-amplification).', '']
for backend, label in zip(backends, labels):
    with tarfile.open(root / 'results/iterations' / args.full_iteration / (backend + '.tar.gz')) as archive:
        stderr = archive.extractfile('./clone.stderr').read().decode(errors='replace')
    fatal = [line for line in stderr.splitlines() if 'fatal:' in line]
    lines.append(f"- {label}: " + '; '.join('`' + line.replace('`', "'") + '`' for line in fatal))
lines += ['', '| System | Synchronous write RPCs | Summed write RPC time (s) | Buffered publications |', '|---|---:|---:|---:|']
for backend, label in zip(backends, labels):
    with tarfile.open(root / 'results/iterations' / args.full_iteration / (backend + '.tar.gz')) as archive:
        metrics = json.load(archive.extractfile('./clone-mount-metrics.json'))
    write = metrics['client']['timings']['write']
    lines.append(f"| {label} | {write['calls']:,} | {write['elapsed_us']/1e6:,.3f} | {metrics['fuse']['buffered']['batches']} |")
lines += ['', 'All `clone.successful` fields are false in this trial. The top-level `passed` field in git-01 records describes completion of the diagnostic driver, including its failed-clone branch; it does not certify clone success. Write RPC totals include protocol encoding, retries and network time; they are not physical database round-trip counts.']
if args.worktree_iteration:
    worktree = records(args.worktree_iteration)
    assert all(r['passed'] and r['clone']['successful'] and r['checkout_validation']['passed'] and r['search']['passed'] and r['indexed_search']['passed'] for r in worktree.values())
    assert len({r['commit'] for r in worktree.values()}) == 1
    assert len({r['checkout_validation']['manifest_sha256'] for r in worktree.values()}) == 1
    first = worktree['rocks']
    lines += ['', '### Full-history transfer to native SSD; working tree on FUSE', '', f"All three checked out commit `{first['commit']}`. The validated working tree contains **{first['checkout_validation']['regular_files']:,} regular files** totaling **{first['checkout_validation']['bytes']:,} bytes**, including two symlink placeholders. Git status was clean and all tracked regular-file hashes matched the independent reference.", '', 'This is a different workload: `--separate-git-dir` keeps Git objects and its index on the native client SSD; `core.symlinks=false` materializes symlink targets as ordinary text files. A full-history `--no-checkout` clone is followed by checkout of the pinned commit. Total time includes HTTPS transfer and checkout. The synchronization pass covers only the FUSE working tree, not durability of the external Git database.', '', '| System | Clone --no-checkout (s) | Checkout (s) | Combined elapsed (s) | Working-tree open + fsync + close (ms) |', '|---|---:|---:|---:|---:|']
    for backend, label in zip(backends, labels):
        r = worktree[backend]
        lines.append(f"| {label} | {r['transfer']['elapsed_ms']/1000:,.3f} | {r['checkout']['elapsed_ms']/1000:,.3f} | {r['clone']['elapsed_ms']/1000:,.3f} | {r['durability']['open_fsync_close_ms']:,.2f} |")
    lines += ['', '### Repository ripgrep', '', 'Milliseconds; first invocation followed by the median of three warm repetitions. Commands report matching paths, not matching lines. Every output digest matches the native reference. The first file-content scan is the absent-literal case, after path enumeration.', '', '| Workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |', '|---|---|---:|---:|---:|---:|---:|']
    for index, row in enumerate(first['search']['rows']):
        for phase, key in [('first', 'first_ms'), ('warm', 'warm_median_ms')]:
            values = [worktree[b]['search']['rows'][index][key] for b in backends]
            assert all(worktree[b]['search']['rows'][index]['validated'] == row['validated'] for b in backends)
            lines.append(f"| {row['workload']} ({row['validated']['lines']:,} paths) | {phase} | {values[0]:,.2f} | {values[1]:,.2f} | {values[2]:,.2f} | {values[1]/values[0]:.2f}× | {values[2]/values[0]:.2f}× |")
    lines += ['', '### Indexed literal search', '', 'Milliseconds including HTTPS, candidate retrieval, current authorization/revision validation and returned text. Positive queries return ten matching documents, while ripgrep reports every matching path; they are not equivalent result sets. Warm is the median of ten repetitions.', '', '| Literal | Phase | RocksDB + Tantivy (ms) | FDB + ES (ms) | TiKV + ES (ms) |', '|---|---|---:|---:|---:|']
    for index, row in enumerate(first['indexed_search']['rows']):
        for phase, key in [('first', 'first_ms'), ('warm', 'warm_median_ms')]:
            values = [worktree[b]['indexed_search']['rows'][index][key] for b in backends]
            lines.append(f"| `{row['literal']}` | {phase} | {values[0]:,.2f} | {values[1]:,.2f} | {values[2]:,.2f} |")
    lines += ['', '### Buffered publication during checkout', '', '| System | Buffered publications | Maximum publication age (ms) | 500 ms budget misses |', '|---|---:|---:|---:|']
    for backend, label in zip(backends, labels):
        with tarfile.open(root / 'results/iterations' / args.worktree_iteration / (backend + '.tar.gz')) as archive:
            metrics = json.load(archive.extractfile('./clone-mount-metrics.json'))
        buffer = metrics['fuse']['buffered']
        lines.append(f"| {label} | {buffer['batches']} | {buffer['max_publication_age_us']/1000:,.3f} | {buffer['publication_budget_misses']} |")
    lines += ['', 'These are observed publication ages, not a partition-time visibility guarantee. The working tree is larger than the 256 MiB content cache, unlike the synthetic document corpus; warm full scans can still fetch remote content. Narrow TSX and subtree scans have a smaller working set. The distributed indexed-search implementation also retains sequential candidate validation and per-document text fetches. [Architecture findings and limits of attribution](ARCHITECTURE_CHOICES.md#what-repository-search-adds-to-the-diagnosis).', '', '### Read-path evidence', '', 'Counters cover the repository search phase and its final hash audit, not one query. Durations are summed over concurrent calls and are not wall time. Each mount served 240,557 opens and closes with zero mutation RPCs.', '', '| System | Data RPCs | Received chunk bytes (GB, decimal) | Mean data RPC (ms) | Metadata delta RPCs | Mutation RPCs |', '|---|---:|---:|---:|---:|---:|']
    for backend, label in zip(backends, labels):
        with tarfile.open(root / 'results/iterations' / args.worktree_iteration / (backend + '.tar.gz')) as archive:
            metrics = json.load(archive.extractfile('./search-mount-metrics.json'))
        client = metrics['client']
        timing = client['timings']['data']
        lines.append(f"| {label} | {client['data_calls']:,} | {client['block_chunk_bytes']/1e9:,.3f} | {timing['elapsed_us']/1000/timing['calls']:,.3f} | {client['head_calls']} | {client['mutation_calls']} |")
lines += ['', '### Evidence', '', 'Single concurrent trials; neither repeated fresh-clone confidence intervals nor a globally cold-cache experiment. GitHub transfer latency is included. Application binaries are the tested buffer-11 release. [Source and binary provenance](../results/git-01-source-reference.json).', '']
for iteration in [args.full_iteration, *([args.worktree_iteration] if args.worktree_iteration else [])]:
    lines.append(f'- {iteration}: [phase barriers](../results/iterations/{iteration}/barriers.json), [runtime verification](../results/{iteration}-runtime.json), [exact client harness](../results/{iteration}-harness.py).')
    for backend in backends:
        lines.append(f'  - {backend}: [result](../results/iterations/{iteration}/{backend}.json), [logs, traces and metrics](../results/iterations/{iteration}/{backend}.tar.gz).')
path = root / 'docs/GIT_WORKLOAD.md'
prefix = path.read_text().split('## Results\n')[0]
path.write_text(prefix + '\n'.join(lines) + '\n')
print(path)
