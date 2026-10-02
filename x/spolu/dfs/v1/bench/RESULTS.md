# dfs v1 [client optimization]

2026-10-02. Unchanged jd corpus/workloads: 10,000 files, 177.5 MB. Release Rust server on macOS 27.0;
Linux Docker FUSE client with eight workers, gRPC, kernel metadata/directory/page caching and
writeback, no cache freshness deadline, 1 MiB requested read-ahead, and 32 background requests.
Server settings unchanged: SlateDB/GCS, 1 GiB RAM cache, 16 GiB disk cache, 512 MiB unflushed writes.

The server restarted once before the suite, discarded its local caches, and used a fresh mount.
`first` means first invocation, not a restart per row; later workloads benefit from earlier reads.
One warm repeat. All 24 checks passed. `fsync` confirms server visibility, not GCS durability.

Population (untar): **17.084 s**, then **5.570 s** remaining SlateDB persistence drain. After the
benchmark, remaining persistence drain took **2.377 s**. The final client writeback check (`syncfs`)
took **0.068 ms** after each phase: workloads had already closed/fsynced all files, publishing their
content. These checks do not measure total writeback time or provide a barrier for arbitrary open
writers. Persistence drain starts after client publication and unmount.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,287.11  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 147.39    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 7.33      | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 7.41      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 604.61    | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 870.13    | OK     |
| metadata     | stat missing (256 paths)                       | first | 241.12    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 2.90      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 11,198.16 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 192.67    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 190.51    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 187.56    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 27.15     | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 27.52     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 8.09      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 7.57      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 1,344.12  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,333.86  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 17.54     | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 9.96      | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 167.55    | OK     |
| file sync    | fsync (32 files)                               | once  | 27.29     | OK     |
| write        | close (32 files)                               | once  | 1.40      | OK     |
| write        | unlink (32 files)                              | once  | 45.03     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Compared with the [uncached baseline](uncached/dfs.json), untar improved from 84.828 s to 17.084 s
(~5×), warm traversal from 101.370 s to 0.147 s (~688×), and warm no-match scan from 19.480 s to
0.193 s (~101×). Small create/write and fsync timings increased (135.59 → 167.55 ms and
9.89 → 27.29 ms); writeback changes where work is paid. These are single-run comparisons.

The suite issued 211 listing RPCs and one stat RPC. [Client counters](latest/benchmark-client-metrics.json)
include expected negative-lookup errors; RPC timings sum concurrent requests, not wall time.
Final GCS footprint: **377,896,263 bytes**, not cumulative upload traffic or write amplification.
The successful run's remote fixture was cleaned.

[Run metadata](latest/run.json) · [DFS measurements](latest/dfs.json) ·
[Local Linux baseline](latest/local.json) · [Population metrics](latest/populate-client-metrics.json) ·
[Uncached run metadata](uncached/run.json) · [Reproduction](../README.md#performance-benchmark).
