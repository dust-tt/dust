# dfs v1 — 2026-10-01

Unchanged jd corpus/workloads: 10,000 files, 177.5 MB. Release Rust server on macOS 27.0;
Linux Docker FUSE client, eight workers, gRPC, direct I/O, zero metadata TTL, no client data cache.
SlateDB/GCS with 1 GiB RAM cache, 16 GiB disk cache, and 512 MiB unflushed-write backpressure.

The server restarted once before the suite and discarded its previous local caches. `first` means
first invocation, not a restart per row; later workloads benefit from earlier reads. One warm repeat.
All 24 checks passed. `fsync` acknowledges server visibility, not remote durability.

Population: **84.828 s**, then **8.544 s** remaining persistence drain. After the benchmark, shutdown
drain took **2.964 s**. Final retained GCS objects occupied **353,358,268 bytes**; this is storage
footprint, not cumulative uploaded bytes or measured write amplification. The remote fixture was
cleaned after success.

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 97,905.32  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 101,370.08 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 335.09     | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 334.53     | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 136,556.78 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 95,620.17  | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,788.37   | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,778.22   | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 20,431.00  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 19,480.47  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 20,629.36  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 20,324.48  | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 8,752.26   | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 9,030.07   | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 2,631.90   | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 2,547.20   | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 106,534.78 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 97,979.34  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,523.86   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 2,248.82   | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 135.59     | OK     |
| file sync    | fsync (32 files)                               | once  | 9.89       | OK     |
| write        | close (32 files)                               | once  | 8.14       | OK     |
| write        | unlink (32 files)                              | once  | 120.43     | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

Metadata-heavy operations remain expensive even warm; uncached path/stat RPCs are a likely bottleneck.
The corresponding local Linux baseline is in [local.json](latest/local.json). See
[run metadata](latest/run.json), [raw DFS measurements](latest/dfs.json), and
[reproduction instructions](../README.md#performance-benchmark).
