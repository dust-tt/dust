# Full three-system SSD benchmark

Completed iteration: **buffer-11**. All three systems passed extraction, content hashes, the 24-row filesystem suite and all six search cases. Each timed phase started from a shared barrier, on independent clients and servers with indexing enabled.

The corpus has 10,000 documents, 100 directories and 177,499,149 document bytes; the manifest is one additional file. All data and indexes use dedicated Titanium NVMe Local SSDs. [Topology](TOPOLOGY.md), [method and resource limits](METHOD.md), and [implementation and DDIA rationale](WRITE_PATH_REWORK.md). [Architecture choices](ARCHITECTURE_CHOICES.md) and [Git workload](GIT_WORKLOAD.md) are separate reports.

## Extraction and durability

Eligible changes and close may acknowledge a bounded, volatile client buffer; the linked rework design specifies which operations are buffered. Explicit fsync and graceful unmount drain accepted changes and wait for fenced, durable publication. The following synchronization pass opens, fsyncs and closes all 10,001 regular files. The sum excludes gaps between timed regions.

| System | Untar (s) | Open + fsync + close (ms) | Sum of timed regions (s) | Untar / RocksDB |
|---|---:|---:|---:|---:|
| RocksDB + Tantivy | 3.669 | 297.782 | 3.967 | 1.00× |
| 3 FDB + 3 ES | 7.882 | 350.272 | 8.232 | 2.15× |
| 3 TiKV + 3 ES | 10.482 | 376.749 | 10.859 | 2.86× |

## Filesystem operations

Times are milliseconds. “First” is the first invocation on a fresh mount, with server/database caches already warmed by ingestion, indexing and validation. “Warm” is the median of three immediate repetitions. Every sample validates its output.

| Filesystem workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |
|---|---|---:|---:|---:|---:|---:|
| scandir + stat (100 dirs, 10,000 files) | first | 439.54 | 461.67 | 428.75 | 1.05× | 0.98× |
| scandir + stat (100 dirs, 10,000 files) | warm | 413.88 | 455.99 | 408.61 | 1.10× | 0.99× |
| rg --files (10,000 files) | first | 15.19 | 27.15 | 15.24 | 1.79× | 1.00× |
| rg --files (10,000 files) | warm | 13.98 | 27.23 | 15.80 | 1.95× | 1.13× |
| open + fstat + close (10,000 files) | first | 194.81 | 228.69 | 210.26 | 1.17× | 1.08× |
| open + fstat + close (10,000 files) | warm | 225.82 | 256.44 | 236.41 | 1.14× | 1.05× |
| stat missing (256 paths) | first | 11.28 | 12.22 | 4.53 | 1.08× | 0.40× |
| stat missing (256 paths) | warm | 2.74 | 2.84 | 2.74 | 1.04× | 1.00× |
| rg no-match scan (10,000 files, 177.5 MB) | first | 798.80 | 4,913.78 | 3,300.87 | 6.15× | 4.13× |
| rg no-match scan (10,000 files, 177.5 MB) | warm | 260.25 | 283.56 | 242.90 | 1.09× | 0.93× |
| rg rare literal (10,000 files, 4 matches) | first | 234.66 | 301.09 | 236.37 | 1.28× | 1.01× |
| rg rare literal (10,000 files, 4 matches) | warm | 260.40 | 294.56 | 257.61 | 1.13× | 0.99× |
| rg branch glob (981 candidate files) | first | 34.40 | 46.09 | 33.38 | 1.34× | 0.97× |
| rg branch glob (981 candidate files) | warm | 32.60 | 48.69 | 33.67 | 1.49× | 1.03× |
| rg depth-10 subtree (136 files) | first | 5.84 | 7.49 | 7.10 | 1.28× | 1.22× |
| rg depth-10 subtree (136 files) | warm | 5.91 | 8.05 | 5.71 | 1.36× | 0.97× |
| open + read + SHA-256 (10,000 files, 177.5 MB) | first | 1,497.54 | 1,105.43 | 1,663.86 | 0.74× | 1.11× |
| open + read + SHA-256 (10,000 files, 177.5 MB) | warm | 1,419.74 | 914.36 | 1,446.44 | 0.64× | 1.02× |
| open + pread tail (256 files x 4 KiB) | first | 16.45 | 22.89 | 18.79 | 1.39× | 1.14× |
| open + pread tail (256 files x 4 KiB) | warm | 6.96 | 7.65 | 6.98 | 1.10× | 1.00× |
| create + write (32 x 32 KiB files) | once | 3.49 | 3.66 | 3.53 | 1.05× | 1.01× |
| fsync (32 files) | once | 23.54 | 36.32 | 28.58 | 1.54× | 1.21× |
| close (32 files) | once | 0.30 | 0.46 | 0.72 | 1.54× | 2.42× |
| unlink (32 files) | once | 22.50 | 409.51 | 266.13 | 18.20× | 11.83× |

## Search operations

Times include HTTPS, index candidate selection, current authorization/revision checks and requested document text. Each query validates completeness and hit counts; rare literal results also validate identities and text. Warm values are medians of ten repetitions over a persistent connection. RocksDB includes its local nginx TLS proxy.

| Search workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |
|---|---|---:|---:|---:|---:|---:|
| exact basename | first | 4.55 | 44.84 | 43.96 | 9.86× | 9.67× |
| exact basename | warm | 1.18 | 18.49 | 14.71 | 15.64× | 12.45× |
| basename prefix | first | 0.88 | 18.08 | 15.44 | 20.49× | 17.49× |
| basename prefix | warm | 1.47 | 16.11 | 12.63 | 10.99× | 8.61× |
| rare literal | first | 2.43 | 26.68 | 23.30 | 10.98× | 9.59× |
| rare literal | warm | 1.97 | 22.75 | 20.13 | 11.52× | 10.19× |
| absent literal | first | 1.02 | 12.14 | 9.14 | 11.86× | 8.93× |
| absent literal | warm | 0.57 | 12.11 | 9.00 | 21.34× | 15.86× |
| rare terms | first | 0.72 | 21.08 | 20.02 | 29.15× | 27.69× |
| rare terms | warm | 0.69 | 21.25 | 18.68 | 30.71× | 26.99× |
| common phrase top 10 | first | 1.72 | 65.71 | 52.81 | 38.29× | 30.77× |
| common phrase top 10 | warm | 1.23 | 61.30 | 51.70 | 49.64× | 41.87× |

## Publication and validation evidence

Metadata, revision and cached authority expire within 500 ms of validation start. Publication has a separate 500 ms budget, with a worker eligible at 100 ms. These are healthy-system visibility budgets; unpublished bytes cannot become remotely visible during a partition. Publication age runs from acceptance through confirmed publication. Before buffer-10, partial drains conservatively retained the old batch origin; buffer-10 tracks the original acceptance time of each pending record.

| System / phase | Buffered batches | Node updates in batches | Maximum publication age (ms) | Budget misses | Mutation RPCs | Metadata delta RPCs |
|---|---:|---:|---:|---:|---:|---:|
| RocksDB + Tantivy / untar | 92 | 10202 | 106.912 | 0 | 201 | 17 |
| RocksDB + Tantivy / filesystem | 1 | 33 | 24.207 | 0 | 34 | 55 |
| 3 FDB + 3 ES / untar | 98 | 10205 | 157.346 | 0 | 217 | 85 |
| 3 FDB + 3 ES / filesystem | 1 | 33 | 36.098 | 0 | 34 | 65 |
| 3 TiKV + 3 ES / untar | 101 | 10204 | 258.646 | 0 | 252 | 53 |
| 3 TiKV + 3 ES / filesystem | 1 | 33 | 27.143 | 0 | 34 | 63 |

## Write-path RPC durations

Client-observed durations include encoding, retries, network and decoding. Counts also cover untar mount setup and validation. Summed durations can overlap and are not a decomposition of wall time.

| System | RPC operation | Calls | Total duration (ms) | Mean (ms) | Maximum (ms) |
|---|---|---:|---:|---:|---:|
| RocksDB + Tantivy | create | 0 | 0.000 | — | 0.000 |
| RocksDB + Tantivy | setattr | 6 | 3.175 | 0.529 | 0.669 |
| RocksDB + Tantivy | write | 103 | 74.953 | 0.728 | 1.830 |
| RocksDB + Tantivy | put_files | 92 | 1,035.512 | 11.256 | 18.205 |
| 3 FDB + 3 ES | create | 0 | 0.000 | — | 0.000 |
| 3 FDB + 3 ES | setattr | 10 | 68.557 | 6.856 | 11.158 |
| 3 FDB + 3 ES | write | 109 | 835.659 | 7.667 | 17.508 |
| 3 FDB + 3 ES | put_files | 98 | 3,990.281 | 40.717 | 75.678 |
| 3 TiKV + 3 ES | create | 0 | 0.000 | — | 0.000 |
| 3 TiKV + 3 ES | setattr | 23 | 123.714 | 5.379 | 9.882 |
| 3 TiKV + 3 ES | write | 128 | 912.061 | 7.125 | 41.818 |
| 3 TiKV + 3 ES | put_files | 101 | 6,635.061 | 65.694 | 159.372 |

The historical `files` counter counts node-update records, including directory changes where batching is enabled; it is not a distinct-file count. Untar counters also include its subsequent synchronization and content audit. Filesystem counters cover the whole suite. Neither is a count of physical database round trips. Zero publication-budget misses establishes the observed timing only, not a general failure-time guarantee.

## Scope and limitations

These are single concurrent trials, with repeated warm operations rather than repeated fresh full runs. Each system has one unscoped administrative client. The distributed architectures have three database hosts and three separate Elasticsearch hosts; RocksDB has one server with embedded Tantivy. This does not compare equal total hardware, establish concurrent-writer scaling, or measure fine-grained permission overhead.

The shared tenant journal still serializes publication. Publication buffering is bounded to 128 node updates and two MiB of file payload. Existing-file data writes, root attributes, rename and unlink retain synchronous publication. Initial/reset metadata views still materialize the tenant. Search visibility is asynchronous and is checked separately from filesystem durability. This trial does not inject client crashes, partitions or host loss.

## Reproducible records

- RocksDB + Tantivy: [result](../results/iterations/buffer-11/rocks.json), [raw samples, logs and metrics](../results/iterations/buffer-11/rocks.tar.gz).
- 3 FDB + 3 ES: [result](../results/iterations/buffer-11/fdb.json), [raw samples, logs and metrics](../results/iterations/buffer-11/fdb.tar.gz).
- 3 TiKV + 3 ES: [result](../results/iterations/buffer-11/tikv.json), [raw samples, logs and metrics](../results/iterations/buffer-11/tikv.tar.gz).
- [Phase barriers](../results/iterations/buffer-11/barriers.json), [source fingerprints](../results/buffer-11-source.json), [source verification](../results/buffer-11-source-verification.json), [binary fingerprints](../results/buffer-11-binaries.json), [deployed binaries and NVMe verification](../results/buffer-11-runtime.json).

All individual timing samples are retained in the raw archives. Earlier iterations and failed preflights remain separately labeled in [the results history](RESULTS.md).

[Exact source archive](../results/buffer-11-source.tar.gz).
