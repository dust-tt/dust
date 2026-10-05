#!/usr/bin/env python3
import json
import pathlib
import statistics

root = pathlib.Path(__file__).resolve().parents[1]
results = root / 'results/demand'
small = json.loads((results / 'final-corpus-summary.json').read_text())
large = json.loads((results / 'final-large-summary.json').read_text())

def table(headers, rows, numeric=()):
    rows = [[str(v) for v in row] for row in rows]
    widths = [max(len(headers[i]), *(len(row[i]) for row in rows)) for i in range(len(headers))]
    border = '+' + '+'.join('-' * (n + 2) for n in widths) + '+'
    def line(row):
        return '| ' + ' | '.join(v.rjust(widths[i]) if i in numeric else v.ljust(widths[i]) for i, v in enumerate(row)) + ' |'
    return '\n'.join([border, line(headers), border, *(line(row) for row in rows), border])

def number(value):
    return f'{value:,.2f}'

def group(data, workload, backend):
    return next(r for r in data if r['workload'] == workload and r['backend'] == backend)

full = group(small, 'full', 'adjacent')
original = table(['Feature', 'Workload', 'Phase', 'Time (ms)', 'Result'], [[r['feature'], r['workload'], r['phase'], number(r['median_ms']), 'OK'] for r in full['rows']], (3,))
(results / 'benchmark.txt').write_text(original + '\n')
text = ['# Demand-read optimization', '', 'The measurements below use zero startup content prefetch and a 32 MiB DFS content cache. The selected reader uses asynchronous 64 KiB demand blocks and access-triggered background read-ahead capped at 256 KiB per task. It does not preload workspace contents. All times are medians of three independent mounts; raw samples retain the range.', '', '## Unchanged 10,000-file benchmark', '', 'Original generator (seed 42), 177.5 MB of document content. Each mount runs the unchanged vendor benchmark with three warm repetitions. “First” means the first invocation of that row, not a fresh cache: preceding rows can warm it. The independent probes below resolve that ambiguity. Mount startup is excluded from this original-format table and reported separately.', '', '```text', original, '```', '', '## Same-client full-suite controls', '', 'The old DFS adapter is also forced to zero preload and a 32 MiB cache. All backends use the same mount path on an n2-standard-8 client. DFS runs on a separate n2-standard-8 server with a 200 GiB pd-ssd; native ext4 uses its own 200 GiB pd-ssd attached to the client. NFS is ZONAL Filestore, 1 TiB, 6,000 IOPS, using NFSv3/TCP. DFS RPC uses TLS. Client caches are dropped before each mount; server caches are uncontrolled. NFS/ext4 repeats retain their normal kernel caches and are not constrained to DFS’s memory budget. DFS metadata advances asynchronously through notifications and periodic reconciliation; NFS retains its normal close-to-open behavior. These are different coherence policies; see the [Linux NFS cache-coherence documentation](https://man7.org/linux/man-pages/man5/nfs.5.html).', '']
backends = ['before', 'adjacent', 'nfs', 'ext4']
rows = []
for i, r in enumerate(full['rows']):
    rows.append([r['workload'], r['phase'], *(number(group(small, 'full', b)['rows'][i]['median_ms']) for b in backends)])
text += ['```text', table(['Workload', 'Phase', 'Old DFS ms', 'DFS ms', 'NFS ms', 'ext4 ms'], rows, (2, 3, 4, 5)), '```', '', '**The fsync rows are not durability-equivalent.** DFS acknowledges server publication; it does not wait for durable persistence. A low DFS fsync time is not a durable-storage performance win.', '']
for label, data, directory in [('177.5 MB corpus', small, 'final-corpus'), ('2.77 GB corpus', large, 'final-large')]:
    text += [f'## Independent fresh-mount probes: {label}', '', 'Each workload starts from a new mount with empty DFS content cache and zero content RPCs, then runs three passes. The table shows first access and the first repeat. Startup + first includes measured mount readiness plus the timed workload; interpreter/oracle preparation is excluded. The raw mount-and-workload wall time includes that preparation.', '']
    rows = []
    for r in data:
        if r['workload'] == 'full':
            continue
        samples = r['samples']
        rows.append([r['workload'], r['backend'].replace('adjacent', 'DFS'), number(r['mount_ready_median_ms']), number(r['rows'][0]['median_ms']), number(r['rows'][1]['median_ms']), number(statistics.median(s['startup_plus_first_ms'] for s in samples))])
    text += ['```text', table(['Workload', 'Backend', 'Mount ms', 'First ms', 'Repeat ms', 'Startup + first ms'], rows, (2, 3, 4, 5)), '```', '', 'DFS resource accounting across each complete probe (three passes) or full benchmark suite, including startup transport bytes. Peak RSS covers the whole mount, including startup and validation; content cache capacity is not total process memory. Transport counters count serialized RPC payloads, not Ethernet/TLS framing. Promoted bytes count whole speculative blocks touched by a demand read, rather than exact application bytes consumed.', '']
    rows = []
    for r in data:
        if r['backend'] != 'adjacent':
            continue
        samples = r['samples']
        runs = [json.loads((results / directory / f"{s['round']}-{r['workload']}-adjacent.json").read_text()) for s in samples]
        median = lambda key: statistics.median(s[key] for s in samples)
        prefetch = statistics.median(s['reads']['prefetch_bytes'] for s in samples)
        used = statistics.median(run['after']['prefetch_used_bytes'] for run in runs)
        rows.append([r['workload'], number(median('total_received_bytes') / 1e6), int(median('data_calls')), number(prefetch / 1e6), number(used / 1e6), number(max(s['daemon_peak_rss_kib'] for s in samples) / 1024)])
    text += ['```text', table(['Workload', 'Received MB', 'Data RPCs', 'Speculative MB', 'Promoted MB', 'Peak RSS MiB'], rows, (1, 2, 3, 4, 5)), '```', '']
text += ['## Interpretation and limits', '', '- Startup still downloads the authorized metadata snapshot. Sparse cold access must account for it; this implementation does not provide lazy metadata initialization.', '- Background read-ahead requires observed sequential reads or completed adjacent files. It has one task, at most 16 ranges, no recursive scheduling, and at most one quarter of the cache (24 MiB demand and 8 MiB speculative with these defaults). It backs off when demand network slots are busy and cannot evict the demand partition.', '- A sparse read can fetch a full 64 KiB block: reading a 4 KiB prefix can therefore transfer 16 times the requested content bytes. The cache bounds residency, not read amplification.', '- Content requests have four network slots and 128 outstanding replies; admission saturation returns EBUSY. Concurrent missing-block requests share bounded striped locks. Cached replies avoid scheduling a network task. Prefetch can transfer duplicate or unused data; the tables expose its cost.', '- A cache smaller than the corpus means repeated full scans can still require network reads. NFS/native warm results can retain the whole corpus in kernel memory; warm results are therefore operational comparisons, not equal-memory comparisons.', '- No claim of physical cold storage, durable-fsync equivalence, a universal NFS win, or production readiness is supported by these runs.', '', '## Evidence', '', 'Raw per-mount files are in `final-corpus/` and `final-large/`: benchmark output, timing/resource logs, before/after DFS counters, mount identity, cache state, startup time, process memory, and NFS mount statistics. Summaries preserve all three samples. `correctness-cloud-final/` contains the selected reader’s Unix, policy, and failure evidence. Source archives and binary hashes identify the measured implementations.', '', 'Exploratory failures are retained. `pilot-candidate-invalid-alias/` and `pilot-baselines/` are invalid evidence: a bind-mount detection bug allowed reference/target aliasing. The corrected runner uses `/proc/self/mountinfo`, private propagation, reference identity checks, and cleanup assertions. The stale-build failure is also retained; subsequent archive builds explicitly clean the Cargo package.', '']
scan_before = group(small, 'scan', 'before')['rows'][0]['median_ms']
scan_after = group(small, 'scan', 'adjacent')['rows'][0]['median_ms']
tails_before = group(small, 'tails', 'before')['rows'][0]['median_ms']
tails_after = group(small, 'tails', 'adjacent')['rows'][0]['median_ms']
sha_before = group(small, 'sha', 'before')['rows'][0]['median_ms']
sha_after = group(small, 'sha', 'adjacent')['rows'][0]['median_ms']
samples = [sample for data in (small, large) for row in data if row['backend'] == 'adjacent' for sample in row['samples']]
startup = statistics.median(sample['mount_ready_ms'] for sample in samples)
peak_rss = max(sample['daemon_peak_rss_kib'] for sample in samples) / 1024
amplification = {}
for corpus, data in [('corpus', small), ('large', large)]:
    logical = json.loads((results / f'final-{corpus}/1-sha-adjacent.probe.json').read_text())['document_bytes'] * 3
    measured = group(data, 'sha', 'adjacent')['samples']
    amplification[corpus] = statistics.median(sample['reads']['demand_bytes'] + sample['reads']['prefetch_bytes'] for sample in measured) / logical
text[4:4] = [
    f'Against the old adapter with the same 32 MiB cache and zero preload, isolated first scans improved {scan_before / scan_after:.2f}×, scattered tail reads {tails_before / tails_after:.2f}×, and SHA-256 reads took {(1 - sha_after / sha_before) * 100:.1f}% less time on the small corpus.',
    '',
    f"On the 2.77 GB corpus, first full scans took {group(large, 'scan', 'adjacent')['rows'][0]['median_ms'] / 1000:.1f} s on DFS versus {group(large, 'scan', 'nfs')['rows'][0]['median_ms'] / 1000:.1f} s on NFS. First hashing took {group(large, 'sha', 'adjacent')['rows'][0]['median_ms'] / 1000:.1f} s versus {group(large, 'sha', 'nfs')['rows'][0]['median_ms'] / 1000:.1f} s. Repeated full scans took {group(large, 'scan', 'adjacent')['rows'][1]['median_ms'] / 1000:.1f} s versus {group(large, 'scan', 'nfs')['rows'][1]['median_ms'] / 1000:.2f} s.",
    '',
    f'The median DFS mount startup across these runs was {startup:.1f} ms, including an approximately 3.4 MB metadata snapshot. Peak daemon RSS reached {peak_rss:.1f} MiB despite the 32 MiB content-cache limit. No content was fetched before mount readiness.',
    '',
    f"Read-ahead is not free: the small-corpus hashing probe transferred {amplification['corpus']:.2f}× its logical content bytes across three passes. The large-corpus hashing probe transferred {amplification['large']:.4f}×. Sparse prefixes and tails triggered zero speculative bytes, but demand reads still use 64 KiB blocks.",
    '',
    f"The unchanged suite also exposes a regression: its first branch-search row is {group(small, 'full', 'adjacent')['rows'][12]['median_ms']:.0f} ms versus {group(small, 'full', 'before')['rows'][12]['median_ms']:.0f} ms on the old adapter. That row inherits earlier cache state; the separate fresh branch probe is {group(small, 'branch', 'adjacent')['rows'][0]['median_ms']:.0f} ms versus {group(small, 'branch', 'before')['rows'][0]['median_ms']:.0f} ms. Repeated full scans lose to NFS after its kernel cache fills, and startup makes a fresh single-file access and a small deep-subtree query slower end-to-end than NFS on the small corpus. The tables retain these losses.",
    '',
]
text += ['The selected build passed 24 Rust integration tests, Clippy with warnings denied, formatting, 11 mounted Unix scenario groups, policy reconciliation checks, and five failure scenarios. `source-check.json` verifies source/binary/vendor provenance; `results-check.json` recomputes all 171 measurements from the exported raw files.', '']
cleanup_path = results / 'cleanup-verification.json'
if cleanup_path.exists() and not any(json.loads(cleanup_path.read_text())['remaining'].values()):
    text += ['`cleanup-verification.json` confirms that no owned cloud resources remain in dust-dev.', '']
(results / 'REPORT.md').write_text('\n'.join(text))
