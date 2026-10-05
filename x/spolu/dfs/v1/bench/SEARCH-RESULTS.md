# dfs v1 search — LanceDB

2026-10-02; Apple M4 Max, macOS 27, release Rust builds, loopback gRPC, real GCS.
jd’s unchanged seed-42 corpus: **10,000 files, 177.5 MB**. Native LanceDB 0.39.0.
One new server and session **per cold row**, discarding every local cache; ten warm repeats on the
same server/connection. Timings exclude connection setup. Startup performs normal background work.
All eight cases matched expected hits; none were partial. Warm p95 is the maximum of ten samples.
Permission caches are **per search only**. Existing filesystem tables remain in [RESULTS.md](RESULTS.md).

## Optimized indexing + object cache

Revision `f1893e80e8`. Native caches: SlateDB 1 GiB RAM + 16 GiB disk; LanceDB 256 MiB RAM.
Additional Arrow object-store cache: **128 MiB RAM + 16 GiB disk**, Foyer, 256 KiB ranges.
Object headers have no TTL; this sole writer invalidates them on mutation. All caches start empty.

| Search | Hits | Cold (ms) | Warm p50 (ms) | Warm p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Rare keyword | 4 | 6266.53 | 2.13 | 5.12 |
| Case-insensitive keyword | 100 | 6122.86 | 5.16 | 11.68 |
| Broad keyword, top 20 | 20 | 6597.92 | 4.29 | 9.05 |
| Metadata + MIME + size | 100 | 3491.25 | 4.80 | 9.74 |
| Keyword + xattr equality | 2 | 5949.34 | 2.53 | 3.71 |
| Binary xattr equality | 1 | 2965.59 | 2.02 | 4.40 |
| Rare keyword, selective grant | 1 | 5727.18 | 3.72 | 5.10 |
| Rare keyword, 512 grants | 1 | 6074.14 | 44.01 | 47.23 |

gRPC population: **2.618 s**. Remaining indexing drain: **71.709 s**
(previously 718.221 s, **10.0× faster**), followed by **5.544 s** of shutdown/SlateDB drain.
The worker processed exactly **10,000 jobs in ten batches**, with no backfill duplicates.
Indexing drain includes source durability, extraction, commits, and maintenance; it is not pure
SlateDB persistence. Population uses direct gRPC, not FUSE untar.

Summed batch phase timers: **2.023 s** waiting for source durability, **0.437 s** extracting text,
**30.153 s** committing Lance data, and **22.352 s** checking/updating indexes and maintenance.
One final full maintenance pass accounts for 21.707 s. These timers exclude table initialization,
backfill, worker scheduling, and polling, so they do not sum to the entire indexing drain.

All **80 warm searches** made **zero remote fetches through the object cache**. Its counters cover
HEAD/range misses; listings and explicit historical-version reads bypass that counter. Request cache
counter deltas can include concurrent worker activity. The last rare-keyword search spent 0.781 ms
awaiting Lance and 0.494 ms on metadata/authorization. The last 512-grant search spent 42.767 ms on
metadata/authorization; no global permission cache was introduced.

**Cold latency remains 3–7 seconds and regressed on several cases.** The cache starts empty and adds
HEAD/range population work. Warm latency improved substantially; cold latency still needs work.
This corpus/query working set fits comfortably in RAM. Unit tests separately force reads from the
disk tier; this benchmark does not measure sustained disk-cache pressure or many-workspace throughput.

Raw results and phase/cache counters: [search-latest/run.json](search-latest/run.json).
The benchmark deleted its generated GCS prefix after validation.

## Initial implementation

Native caches only: SlateDB 1 GiB RAM + 16 GiB disk; LanceDB 256 MiB RAM. No Lance object-byte cache.
Population used `e3a80bc9db`; queries used `5635a28985`.

| Search | Hits | Cold (ms) | Warm p50 (ms) | Warm p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Rare keyword | 4 | 5042.51 | 375.53 | 388.25 |
| Case-insensitive keyword | 100 | 6274.66 | 862.37 | 931.91 |
| Broad keyword, top 20 | 20 | 6226.33 | 857.13 | 928.15 |
| Metadata + MIME + size | 100 | 3947.59 | 1193.27 | 1383.44 |
| Keyword + xattr equality | 2 | 5412.63 | 320.85 | 526.40 |
| Binary xattr equality | 1 | 2059.83 | 225.15 | 256.29 |
| Rare keyword, selective grant | 1 | 4642.82 | 385.05 | 420.65 |
| Rare keyword, 512 grants | 1 | 4625.93 | 442.04 | 585.52 |

gRPC population: **2.713 s**. Remaining indexing drain: **718.221 s** (11.97 minutes),
followed by **3.388 s** of shutdown/SlateDB drain. Initial indexing processed **14,153 jobs** for
10,000 files because backfill re-enqueued completed files. Batches contained at most 128 files.
The last warm rare-keyword query still made five Lance requests / 75,464 bytes with zero index misses.

Original raw measurements: [search-initial/run.json](search-initial/run.json).
Retained GCS storage was 474,354,938 bytes across SlateDB and LanceDB versions, not cumulative upload.
That benchmark prefix was also deleted after validation.

Reproduce with [search.py](search.py); [usage and configuration](../SEARCH.md).
