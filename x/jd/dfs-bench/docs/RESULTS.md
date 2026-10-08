# Clean SSD extraction results

## Latest full run: buffer-11

[Full filesystem and search tables](FULL_RESULTS.md) include all 24 filesystem rows and all six search cases, with first/warm timings and ratios. Every system passed content hashes and the complete suite. Untar took **3.669 s / 7.882 s / 10.482 s** for RocksDB / FDB / TiKV; subsequent open + fsync + close took **297.782 / 350.272 / 376.749 ms**. The replicated systems remain above the approximately seven-second target.

All runs below used the same corpus, Titanium NVMe fleet, indexing enabled, content/metadata/database cache budgets and per-phase barriers. Buffer-11 increases only the write buffer from 64 nodes/one MiB to 128 nodes/two MiB. Writes and close acknowledge a bounded volatile buffer; fsync and unmount wait for durable publication. These are individual trials, not repeated-trial confidence intervals.

| Iteration | Change | RocksDB untar (s) | FDB untar (s) | TiKV untar (s) | Full suite |
|---|---|---:|---:|---:|---|
| buffer-04 | Partial drains and directory overlays | 3.119 | 12.135 | 16.494 | Passed all three |
| buffer-05 | Grouped transactional reads and bounded key hints | 4.271 | 10.940 | 14.037 | Passed all three |
| buffer-06 | TiKV immutable-key prefetch reuse | 4.622 | 11.134 | 10.683 | Passed all three |
| buffer-07 | Wire-compatible bulk byte encoding | 3.370 | 10.533 | 9.680 | Passed all three |
| buffer-09 | Directory creation and attribute coalescing | 3.820 | 8.329 | 9.931 | Passed all three |
| buffer-10 | Per-record age, HTTP/2 windows and TiKV prefetch | 3.820 | 9.239 | 9.280 | Passed all three |
| buffer-11 | 128-node/two-MiB publication buffer | 3.669 | 7.882 | 10.482 | Passed all three |

Buffer-11 observed zero publication-budget misses during both untar and the filesystem suite. Its maximum untar publication ages were **106.912 / 157.346 / 258.646 ms**. This is observed timing, not a partition-time guarantee.

Buffer-08 was staged but not timed: review caught a lock handoff before directory revision assignment, corrected in buffer-09. Buffer-09 improved FDB but not TiKV relative to buffer-07; the per-operation counters show more small writes escaping the batch. Buffer-10 corrected pending-record age and tested transport/prefetch scheduling, but FDB regressed. Buffer-11 improved FDB while TiKV regressed; larger batches are not a universal win. The latest table is reported as measured, without combining each system’s best iteration.

Each iteration's complete samples, metrics, logs and result records are retained under `results/iterations/<iteration>/`; the [full report](FULL_RESULTS.md#reproducible-records) links the current records and source/binary verification. [The rework design](WRITE_PATH_REWORK.md) explains each change and its correctness checks.

## Real repository workload

[Git clone and repository search](GIT_WORKLOAD.md) records a separate application test. Full clones with `.git` on FUSE failed on all three systems with retained-storage quota exhaustion, after 148.257 / 394.073 / 476.952 seconds. These are failure times, not completed clone performance. The synthetic suite passes but does not establish large-file append scalability.

The separately labeled full-history clone with Git metadata on native client SSD and its working tree on FUSE passed on all three systems at the same commit. Checkout alone took **10.079 / 33.628 / 35.519 seconds**. All 15,461 regular files (316,183,460 bytes), six ripgrep cases and three indexed-literal cases validated. Warm full-repository `useEffect` scans took **1.250 / 7.606 / 5.598 seconds**; indexed top-ten queries took **2.437 / 175.792 / 168.818 milliseconds**. Ripgrep returns all 509 matching paths, so these are different result scopes. The linked report preserves transfer time, checkout time, synchronization, every sample and the changed Git placement/symlink semantics.

## Previous buffered run: buffer-03

All three passed extraction, durable synchronization, every content hash, a fresh-mount 32-thread read check, and literal-search readiness. New-file buffering is enabled with a one-MiB/64-file bound, 100 ms background eligibility and 500 ms metadata TTL. Writes and close can acknowledge volatile client memory; fsync and graceful unmount wait for durable publication. The full filesystem/search timing suite remains outstanding.

| System | Untar (s) | Subsequent open + fsync + close (ms) | Sum of timed extraction and sync (s) | Maximum buffered publication age (ms) | Publication budget misses |
|---|---:|---:|---:|---:|---:|
| RocksDB + Tantivy | 4.120 | 324.618 | 4.445 | 24.652 | 0 |
| 3 FDB + 3 ES | 14.791 | 311.405 | 15.102 | 55.766 | 0 |
| 3 TiKV + 3 ES | 15.840 | 330.201 | 16.171 | 114.210 | 0 |

These are single concurrent samples with the same corpus and SSD fleet. The sum excludes gaps between timed regions. Publication age measures the oldest buffered creation through confirmed commit, with a 500 ms budget; zero misses in this run is not a partition-time guarantee or a complete cross-client freshness proof.

Mutation RPC counts fell from approximately 47,500 to 970 / 945 / 967 for RocksDB / FDB / TiKV. Buffered publications numbered 272 / 268 / 276 and included all 10,001 files. Counters also cover the subsequent synchronization and hash validation. A capacity boundary still publishes the active partial file and sends its remaining writes synchronously; the next iteration retains that file while publishing other buffered files.

Post-validation literal queries took 5.623 / 51.064 / 61.887 ms. Both distributed responses had an index checkpoint equal to the filesystem head. These queries occur after hash validation, so their duration is not total index catch-up time.

Evidence: [common barrier](../results/iterations/buffer-03/barriers.json), [RocksDB](../results/iterations/buffer-03/rocks.json), [FDB](../results/iterations/buffer-03/fdb.json), [TiKV](../results/iterations/buffer-03/tikv.json), [source verification](../results/buffer-03-source-verification.json), [binary hashes](../results/buffer-03-binaries.json), [deployed binary and NVMe verification](../results/buffer-03-runtime.json), and [build features](../results/buffer-03-build.json). Raw metrics and logs are in the corresponding backend archives beside each result.

## Previous unbuffered run: native-03

All three extraction/hash/read-admission/literal-search-readiness checks passed. This run includes native FDB records, indexed literal candidates, and independent index checkpoint updates. It does **not** include the client buffer. The later full buffered results are linked above.

| System | Untar (s) | Subsequent open + fsync + close (ms) | Post-validation literal readiness query (ms) |
|---|---:|---:|---:|
| RocksDB + Tantivy | 21.648 | 292.428 | 5.635 |
| 3 FDB + 3 ES | 428.279 | 348.899 | 63.122 |
| 3 TiKV + 3 ES | 550.704 | 360.444 | 67.113 |

Readiness query time includes the query itself and occurs after hash validation; it is not total index catch-up time. Both distributed responses were complete with their shared index checkpoint equal to the filesystem head. All clients used eight content-read slots. The same dedicated Titanium NVMe fleet, indexing enabled, corpus manifest, cache budgets and common start barrier were used.

Evidence: [barrier](../results/iterations/native-03/barriers.json), [RocksDB](../results/iterations/native-03/rocks.json), [FDB](../results/iterations/native-03/fdb.json), [TiKV](../results/iterations/native-03/tikv.json), [source fingerprints](../results/native-03-source.json), [binary fingerprints](../results/native-03-binaries.json). Raw archives are alongside those records.

## Prior run: native-02

These are validated extraction measurements from the first implementation rework (`native-02`), not a completed filesystem/search suite. The seven-second target has not been achieved. All three systems started concurrently, with indexing enabled, the same 10,000-file / 177,499,149-byte manifest, Titanium NVMe Local SSDs, and unchanged cache budgets. [Method](METHOD.md), [topology](TOPOLOGY.md), [design and changes](WRITE_PATH_REWORK.md).

| System | SSD baseline untar (s) | Rework untar (s) | Rework / baseline | Subsequent open + fsync + close (ms) |
|---|---:|---:|---:|---:|
| RocksDB + Tantivy | 23.049 | 20.796 | 0.90× | 271.182 |
| 3 FDB + 3 ES | 2,276.448 | 418.808 | 0.18× | 325.824 |
| 3 TiKV + 3 ES | 363.978 | 546.803 | 1.50× | 360.787 |

Each durability pass opened, synchronized and closed all 10,001 files including the manifest. Hash validation and a fresh-mount 32-thread no-match scan ran outside extraction timing and passed on all three systems. Mutation acknowledgement remains synchronous; these timings do not hide publication work in an asynchronous client buffer.

FDB improved by about 5.44× after replacing its persistent tree with direct native transactions. TiKV extraction regressed by about 50%; its indexer now performs more work during ingestion, but the run does not isolate a causal attribution. The clients still issued approximately 47,500 mutation RPCs and 10,100 head/delta RPCs. Their phase totals also include 10,000 data RPCs for the subsequent hash audit. These are logical RPC counts, not database network-round-trip counts.

## Search readiness and failures

RocksDB completed its post-validation readiness check in 6.09 ms. TiKV completed the equivalent literal query in 26,039.47 ms. These values include the readiness query itself and exclude extraction and earlier validation; they are not total indexing durations.

FDB returned HTTP 503 on the literal readiness query. Its substring implementation enumerated all documents and fetched each body separately, which is incompatible with the new four-second native snapshot lifetime on this corpus. A separate indexed term query returned four verified matches with `indexed_through == source_head == 47517`, establishing that indexing had caught up. The waiting FDB client was then stopped; its result remains failed, with the successful extraction/hash/read checks preserved. This is not reported as a passed complete iteration. Candidate selection and checkpoint contention are being reworked before the next trial.

The preceding `native-01` attempt failed preflight on an unsupported mount CLI option. No timing barrier was released. Its evidence is retained separately.

## Reproducible evidence

- [Three-system release barrier](../results/iterations/native-02/barriers.json)
- [RocksDB client record](../results/iterations/native-02/rocks.json), [FDB client record](../results/iterations/native-02/fdb.json), [TiKV client record](../results/iterations/native-02/tikv.json)
- [FDB selective-query diagnosis](../results/iterations/native-02/fdb-selective-query.json)
- [Application source hashes](../results/native-01-source.json), [binary hashes](../results/native-01-binaries.json), [runtime binary and NVMe checks](../results/native-01-runtime.json)
- [FDB release correctness tests](../results/native-01-fdb-tests.log), [10,000-entry direct indexing test](../results/native-01-large-index.json)

Raw client logs, counters and workload records are in each backend archive under `results/iterations/native-02/`. Source/binary artifacts retain their `native-01` build label: the preflight retry changed only the driver and used fresh namespaces. The full 24-row filesystem suite and search timing suite remain outstanding for the optimized implementation.
