# Benchmark results — dfs v2 localhost

2026-10-02. Native Linux ARM64 in Docker Desktop on an Apple M4 Max; Rust 1.98.1 release builds.
One FDB 7.3.69 node (single SSD storage), one ES 8.15.3 node (one primary, zero replicas).
The Docker VM has 16 vCPUs and 7.65 GiB RAM.
FDB/ES each have a 3 GiB container limit; ES has a 1 GiB heap. The unchanged v1 Rust client/FUSE
uses kernel metadata/directory/page caching and writeback. No v2 application content cache.
Database data lives on persistent Docker volumes without a separate per-volume disk quota.

These are **local shared-cluster measurements**. Each first search starts a new dfs-server/session
and connection; FDB, ES, and OS caches remain warm. This differs from v1's native macOS server,
remote GCS, and discarded backend caches. No cold-disk or GCP claim is made.

## Filesystem

Same jd workload, unchanged v1 Linux FUSE client. **Every first read row restarts dfs-server and
creates a new session and mount** (ten resets). Warm is one repeat on that mount. FDB/ES caches
and the Docker VM's OS cache are retained; local is the generated corpus on the container filesystem
and is not guaranteed cold. All 24 rows passed the original workload's result checks.

### dfs v2 [FoundationDB + Elasticsearch]

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 8,640.62   | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 154.48     | OK     |
| metadata     | rg --files (10,000 files)                      | first | 387.65     | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 9.04       | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 105,895.74 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 864.01     | OK     |
| metadata     | stat missing (256 paths)                       | first | 3,659.38   | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.37       | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 11,290.74  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 189.75     | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 11,445.11  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 190.92     | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 1,445.76   | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 29.79      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 336.99     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 6.96       | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 202,411.60 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,297.34   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 5,901.04   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 17.06      | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 681.54     | OK     |
| file sync    | fsync (32 files)                               | once  | 448.49     | OK     |
| write        | close (32 files)                               | once  | 1.41       | OK     |
| write        | unlink (32 files)                              | once  | 463.53     | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

Untar: **735.751 s**. The final client `syncfs` took **0.000145 s** after untar and **0.000131 s**
after the suite: these measure only remaining writeback, because file closes already published data
during the timed workload. They are not total client writeback time. Server shutdown: **0.069 s**.
There is no remaining authoritative persistence drain: each accepted mutation already awaited FDB.

The client uses eight FUSE workers, `max_background=32`, 1 MiB requested readahead, kernel writeback,
and effectively unbounded metadata TTL (4,294,967,295 s). See [run metadata](latest/filesystem.json),
[DFS rows](latest/dfs.json), [local rows](latest/local.json), and per-case client RPC counters in
[latest/](latest/). The measured server revision is `ab61baf616`; raw reports include its binary hash.

These measurements expose substantial latency in first-touch per-file operations. Kernel-warm
reads benefit strongly from the unchanged v1 cache behavior. The ripgrep workloads parallelize reads;
the sequential open/read loop pays RPC and authoritative FDB lookup costs repeatedly. No application
metadata/authorization cache or batched filesystem RPCs were added for this comparison.

### Local Linux baseline

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 129.49     | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 133.50     | OK     |
| metadata     | rg --files (10,000 files)                      | first | 7.18       | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 7.30       | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 43.13      | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 42.31      | OK     |
| metadata     | stat missing (256 paths)                       | first | 2.38       | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.65       | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 18.94      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 17.88      | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 17.90      | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 17.99      | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 13.74      | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 10.78      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 5.48       | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 4.39       | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 147.20     | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 142.11     | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 1.78       | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 1.35       | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 0.60       | OK     |
| file sync    | fsync (32 files)                               | once  | 21.89      | OK     |
| write        | close (32 files)                               | once  | 0.02       | OK     |
| write        | unlink (32 files)                              | once  | 0.22       | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

## Keyword search

Same validated jd corpus and v1 query matrix: **10,000 files, 177.5 MB**, ten warm repeats.
All eight cases returned their exact expected results without partial responses. Warm p95 is the
maximum of ten samples. Authorization caching is per request only.

| Search | Hits | Server cold (ms) | Warm p50 (ms) | Warm p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Rare keyword | 4 | 34.30 | 31.34 | 40.86 |
| Case-insensitive keyword | 100 | 168.94 | 155.27 | 202.13 |
| Broad keyword, top 20 | 20 | 117.88 | 95.53 | 134.07 |
| Metadata + MIME + size | 100 | 78.72 | 80.08 | 97.72 |
| Keyword + xattr equality | 2 | 13.71 | 10.96 | 13.44 |
| Binary xattr equality | 1 | 10.68 | 8.84 | 9.88 |
| Rare keyword, selective grant | 1 | 21.21 | 27.78 | 35.09 |
| Rare keyword, 512 grants | 1 | 116.44 | 101.63 | 106.29 |

gRPC population: **260.474 s**; remaining indexing drain:
**1.448 s**. Indexing overlaps population, so this drain is not
standalone indexing throughput. The worker processed **10,117 file versions** in
**250 batches**; coalescing can still index intermediate versions during a slow import.
Shutdown took **0.034 s**. All acknowledged mutations already committed to FDB;
there is no SlateDB-style persistence drain after acknowledgement.

The recurring Linux socket delay was removed by enabling `TCP_NODELAY` on accepted connections.
For example, rare-keyword warm p50 fell from 67.56 to 31.34 ms. The remaining query cost
is mostly live metadata/authorization reads in FDB, rather than ES query execution. Inspect the
per-request phase timings in [raw results](latest/search.json); the earlier run is retained in
[initial results](initial/search.json). Backend topology and write durability differ substantially
from [v1](../../v1/bench/SEARCH-RESULTS.md), so these are not an isolated ES-versus-LanceDB comparison.

## Multiple workspaces and grants

Two active workspaces (32 files each) and 16 idle workspaces share the same server, FDB prefix,
and ES index. This is a small correctness/performance sample, not a tenant-scale capacity test.
Each directly granted file remains in `/shared` alongside its granted folder, even though all are
also reachable through the main tree. Duplicate grants do not duplicate entries.

| Workload | Result | Time (ms) |
| --- | --- | ---: |
| `/shared`, 1 grant, pages of 7 | 33 distinct entries | 39.17 |
| `/shared`, 2 grants, pages of 7 | 33 distinct entries | 32.67 |
| `/shared`, 512 grants, pages of 7 | 33 distinct entries | 1,554.63 |
| Search workspace 1 | 32 own-workspace hits | 71.45 |
| Search workspace 2 | 32 own-workspace hits | 66.53 |
| Two concurrent writers, 50 × 1 KiB writes each | 100 writes, verified final bytes | 298.42 |

Debug commit logging was enabled only for this run. Across **376** successful transactions,
commit wait was **1.718 ms p50**, **3.096 ms p95**, and **8.334 ms maximum**;
there were **11** aborted attempts retried before successful commits. This includes filesystem,
indexer, and empty commits; it excludes transaction preparation/read time and is not per-RPC latency.
Both writers completed in approximately 0.296 s. Grant scans still grow with session grant count.
See [raw multi-workspace results](latest/workspaces.json).

## Validation and limits

Rust filesystem/storage/search/transport tests, the unchanged v1 two-mount FUSE workload, and the
ES failure-injection suite pass. Coverage includes partial/ambiguous indexing publication, restart
before queue completion, grant revocation during an expired search read view, and ES downtime.
A live FDB/ES restart preserved all 100 acknowledged multi-block writes, kept metadata/content
coherent, and resumed indexing without restarting dfs-server. That run returned no interrupted RPC
errors; it is not proof that an ambiguous FDB commit can never occur. Such errors are surfaced
without automatic replay.

These are single runs on single-node development databases, without machine-failure redundancy.
No backend/OS cache flush, large-tenant load, replicated cluster, or cloud benchmark was performed.

[Reproduction](../README.md). Successful benchmark runs clean only their generated FDB prefix/ES index.
