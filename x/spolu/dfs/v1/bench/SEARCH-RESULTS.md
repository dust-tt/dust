# dfs v1 search — LanceDB

2026-10-02; Apple M4 Max, macOS 27, release Rust builds, loopback gRPC, real GCS.
jd’s unchanged seed-42 corpus: 10,000 files, 177.5 MB. Native LanceDB 0.39.0.
One new server and session **per cold row**, discarding local caches; ten warm repeats on the same
server/connection. Timings exclude connection setup. Startup performs normal background work.
Shared caches: SlateDB 1 GiB RAM + 16 GiB disk; LanceDB 256 MiB RAM. Permission caches are
**per search only**, with no cross-request reuse. All results matched expectations; none were partial.

| Search | Hits | Cold (ms) | Warm p50 (ms) | Warm p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Rare keyword | 4 | 5042.5 | 375.5 | 388.3 |
| Case-insensitive keyword | 100 | 6274.7 | 862.4 | 931.9 |
| Broad keyword, top 20 | 20 | 6226.3 | 857.1 | 928.2 |
| Metadata + MIME + size | 100 | 3947.6 | 1193.3 | 1383.4 |
| Keyword + xattr equality | 2 | 5412.6 | 320.8 | 526.4 |
| Binary xattr equality | 1 | 2059.8 | 225.2 | 256.3 |
| Rare keyword, selective grant | 1 | 4642.8 | 385.0 | 420.6 |
| Rare keyword, 512 grants | 1 | 4625.9 | 442.0 | 585.5 |

gRPC population: **2.713 s**. Remaining indexing drain: **718.221 s**
(11.97 minutes), then **3.388 s** of shutdown/SlateDB drain. The indexing drain
includes waiting for source durability, extraction, LanceDB commits, and maintenance; it is not
pure SlateDB persistence. This uses direct gRPC population, not FUSE untar.

Initial indexing processed 14,153 jobs for 10,000 files: the resumable backfill can re-enqueue
files already completed by the pending-work scan. Avoiding that overlap and increasing useful work
per remote commit are clear indexing improvements. Current batches contain at most 128 files.

Warm means previously used caches, not zero GCS I/O: the last warm rare-keyword query still made
**5 Lance requests / 75,464 bytes**, despite zero index-cache misses. Repeated column/excerpt reads
are a useful next optimization target. The 512-grant row uses the same selective permission as
the one-grant row, plus 511 unattached grants; no global permission cache was involved.

These are single-client measurements, not a many-workspace throughput test. Warm p95 is the maximum
of ten samples. Retained GCS storage was 474,354,938 bytes across SlateDB and LanceDB versions,
not cumulative uploaded bytes. The benchmark prefix was deleted after successful validation.

Population used `e3a80bc9db`; queries used `5635a28985` (request-cache and table-handle fixes).
Existing filesystem benchmark tables remain in [RESULTS.md](RESULTS.md).
Reproduce with [search.py](search.py); [usage](../SEARCH.md), [raw timings and metrics](search-latest/run.json).
