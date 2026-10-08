# Benchmark results — dfs v5 localhost

Run started **2026-10-07T07:10:20Z** and completed successfully: **all 24 timed checks, both full-content hash passes and final cleanup passed**, exit 0.
Untar: **6.402s + 0.014s remaining durable client drain = 6.416s**, versus 7.320s before the cleanup fix (**12.4% faster**).
Unmount including drain: 0.070s. Server success acknowledges an FDB commit; there is no later persistence drain.

The same FUSE binary passed both 5,000-file recursive deletion cases with zero errors; see the [cleanup investigation](CLEANUP.md).

## Fixture and method

- Native Linux ARM64 in Docker Desktop on an Apple M4 Max (64 GiB host). The Linux VM has 16 vCPUs and 16 GiB configured RAM (15.60 GiB visible). One DFS server and one local FoundationDB 7.3.69 process, single replication, ssd-2, 8 GiB FDB container limit; existing FDB configuration/data preserved.
- Rust 1.98.1 release builds, Python 3.13.5, ripgrep 14.1.1, Linux 6.12.54-linuxkit. Profiling enabled. Interactive v4 processes paused during timing and restored afterward; no concurrent local builds/tests. Separate v5 demo mounts and their FDB process remained running for user access; the original baseline did not have those demo services.
- Same jd corpus and workloads as v4: 10,000 files, 100 directories, 177,499,149 document bytes, seed 42. The uncompressed archive also contains manifest.json. Untar runs 13 directories below the tenant root through /shared and an inherited grant.
- Client: 512 MiB shared accounted cap, including 96 MiB transient reserve and all read caches; 200 ms maximum write buffering, 800 ms send-time validity, 25 ms coalescing, 128 queued/in-flight groups combined, 16 reserved envelopes. Each group reserves capacity before acknowledgment; full envelope occupancy bypasses coalescing for eligible groups. One FUSE receiver, at most eight deferred workers. Direct I/O, zero kernel name/attribute TTLs, no kernel data/writeback caching.
- Directory-wide attributes/validation, small-file ReadFiles batching and adaptive read-ahead enabled. Server uses its complete tenant permission tree with the default 30 s maximum proof age and 250 ms polling; all filesystem data and durable mutations use FDB.
- Every first read restarts the server/session/mount; FDB and OS caches remain. Warm is one repeat and may outlast the 800 ms validity. These are single samples, not statistical estimates. The search rows execute filesystem ripgrep, not a search service.

## Full table

Previous v5 is the 2026-10-07T05:47:05Z local run, before the cleanup fix. All results below are OK; times are milliseconds. Each row is a single measured invocation.

| Feature | Workload | Phase | Previous v5 (ms) | Latest v5 (ms) | Change |
| --- | --- | --- | ---: | ---: | ---: |
| population | untar (10,000 files, 177.5 MB) | once | 7,302.02 | 6,401.67 | -12.3% |
| writeback | remaining durable client drain | once | 18.00 | 14.00 | — |
| metadata | scandir + stat (100 dirs, 10,000 files) | first | 6,429.69 | 6,321.85 | -1.7% |
| metadata | scandir + stat (100 dirs, 10,000 files) | warm | 5,907.52 | 5,624.24 | -4.8% |
| metadata | rg --files (10,000 files) | first | 277.52 | 269.56 | -2.9% |
| metadata | rg --files (10,000 files) | warm | 15.63 | 13.88 | -11.2% |
| metadata | open + fstat + close (10,000 files) | first | 6,838.44 | 6,324.96 | -7.5% |
| metadata | open + fstat + close (10,000 files) | warm | 5,979.77 | 5,503.57 | -8.0% |
| metadata | stat missing (256 paths) | first | 1,561.21 | 1,489.36 | -4.6% |
| metadata | stat missing (256 paths) | warm | 1,273.40 | 1,254.11 | -1.5% |
| page cache | rg no-match scan (10,000 files, 177.5 MB) | first | 6,911.69 | 6,915.71 | +0.1% |
| page cache | rg no-match scan (10,000 files, 177.5 MB) | warm | 3,689.54 | 4,412.55 | +19.6% |
| search | rg rare literal (10,000 files, 4 matches) | first | 7,191.90 | 6,244.42 | -13.2% |
| search | rg rare literal (10,000 files, 4 matches) | warm | 3,496.58 | 3,033.68 | -13.2% |
| path pruning | rg branch glob (981 candidate files) | first | 1,240.90 | 1,232.49 | -0.7% |
| path pruning | rg branch glob (981 candidate files) | warm | 709.56 | 721.41 | +1.7% |
| path pruning | rg depth-10 subtree (136 files) | first | 388.47 | 341.51 | -12.1% |
| path pruning | rg depth-10 subtree (136 files) | warm | 121.29 | 122.74 | +1.2% |
| page cache | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 24,455.53 | 21,900.45 | -10.4% |
| page cache | open + read + SHA-256 (10,000 files, 177.5 MB) | warm | 8,244.86 | 8,316.06 | +0.9% |
| random I/O | open + pread tail (256 files x 4 KiB) | first | 2,923.31 | 2,552.23 | -12.7% |
| random I/O | open + pread tail (256 files x 4 KiB) | warm | 923.88 | 702.54 | -24.0% |
| write | create + write (32 x 32 KiB files) | once | 14.14 | 23.24 | +64.4% |
| file sync | fsync (32 files) | once | 29.78 | 25.89 | -13.1% |
| write | close (32 files) | once | 0.47 | 0.57 | +21.3% |
| write | unlink (32 files) | once | 11.85 | 6.60 | -44.3% |

The 22.149s untar from the first cleanup-fix attempt was a real regression: reserved envelopes sat idle during coalescing while new writes waited for admission. Dispatching eligible groups when all envelopes are reserved removed that bottleneck without extending the 200 ms deadline. A focused untar rerun took 6.335s before this complete 6.416s run.

The sum of the 20 timed read rows fell 6.0%. Small create/write calls still took 9.10ms longer for 32 files; create/write + fsync + close took 49.70ms versus 44.39ms (+12.0%). Pre-acknowledgment backpressure makes that admission-only row less directly comparable to the old, much larger queue. The warm no-match scan was 19.6% slower in this sample; a focused repeat is recorded below. These results do not establish that every operation is faster.

Focused no-match repeat (`/tmp/dfs-v5-local-rg-repeat-20261007-f/run.json`, same source/binaries): first **8,043.47ms**, warm **3,258.81ms**, both OK with zero errors. The slower warm result did not reproduce (repeat was 11.7% faster than the old baseline); the first result varied upward. Both samples are retained rather than selecting only the faster one. Single-run read timings remain sensitive to cache expiry and scheduling.

## Comparison with the latest v4 local run

[v4 reference](../../v4/bench/RESULTS.md#latest-full-table--paired-rerun): 2026-10-06, source 4ad853b432, same enlarged local fixture and corpus. V4 used 1 s cache validity and 1 s maximum buffering; v5 uses 800 ms and 200 ms. These compare complete implementations, not an isolated optimization.

| Workload | v4 (s) | Latest v5 (s) | v5 / v4 |
| --- | ---: | ---: | ---: |
| Untar + durable drain | 7.037 | 6.416 | 0.91× |
| Scandir + stat, first | 11.771 | 6.322 | 0.54× |
| Scandir + stat, warm | 21.119 | 5.624 | 0.27× |
| rg --files, first | 0.340 | 0.270 | 0.79× |
| Open + fstat + close, first | 10.656 | 6.325 | 0.59× |
| rg no-match, first | 4.246 | 6.916 | 1.63× |
| rg no-match, warm | 2.102 | 4.413 | 2.10× |
| Full SHA-256 read, first | 64.177 | 21.900 | 0.34× |
| Full SHA-256 read, warm | 15.484 | 8.316 | 0.54× |
| Random tail reads, first | 1.988 | 2.552 | 1.28× |
| Fsync 32 files | 0.148 | 0.026 | 0.17× |

Metadata traversal and full sequential hash reads remain faster than v4. Parallel whole-corpus ripgrep scans and first random-tail reads remain slower than v4; the cleanup fix does not resolve those older differences.

## Memory and correctness

- Maximum accounted client peak across mounts: **362.75 MiB / 512 MiB**, including the entire 96 MiB transient reservation. Scratch peaked at its enforced 52 MiB limit. Maximum observed process peak RSS: **218.75 MiB**; allocator/runtime/stacks are outside the accounted cap.
- No recorded client/RPC/writeback errors, dispatch expirations, exhausted listing retries or inline waits after effects. Both full-content hash passes and final cleanup passed.
- The exact benchmark binary also passed GNU `rm -rf` and Python `shutil.rmtree` on separate directories of 5,000 durable 16 KiB files: 24.340s and 24.333s, plus 0.014s and 0.015s remaining parent drain. Independent RPC checks confirmed empty directories; there were no deferred errors.
- Rust workspace tests (including real FDB and blocked-capacity/delayed-listing regressions), strict clippy, contract syntax checks and unprivileged mounted tests passed on the final build. Interactive v4 processes were resumed after every run; FDB remained available with zero restarts or OOM kills.
- The original v5 baseline's unrelated-commit listing failure was fixed before its recorded timing, using bounded per-object commit fences. Those regressions remain covered.

## Reproducibility

- Base commit: `476c6429d9a66b1d188d52b993f8cb41804ad189+uncommitted-cleanup-fix`. The run measured uncommitted cleanup changes on this base; source and binary digests identify the measured build.
- Source SHA-256: `4381ed46632e92d4c76513a071e1171741cd4ae3de8db22f21e3cb8c88d04257`.
- Source digest covers sorted relative paths and bytes of v5 .rs/.proto/.toml/.py files and Cargo.lock, excluding target; each path and payload is NUL-delimited. Markdown-only report changes do not alter it.
- Server SHA-256: `ab09c43bf033329eb06d977ce1012033c4b4973459e6e57ca29f8f582e3db06e`.
- FUSE SHA-256: `036a81bf77252d82c3b76b78addaf3b5762954a9fbbd707feb125d8be42c8279`.
- Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
- Raw full report: `/tmp/dfs-v5-local-full-20261007-e/run.json` inside `dfs-v4-dev-1`; environment and per-phase metrics are alongside it. Focused final cleanup: `/tmp/dfs-v5-cleanup-final-20261007-e/run.json`. Credentials and generated artifacts remain outside Git.
- Previous v5 baseline: source `761f2e9773991a9f8872e28c822f7cfbfe52c2a6f1725f256aadc26cd6e69570`, server `738f41360fcfc1640752d743b4e8cb3647f0e128b98ae421e968e3e21ca6d516`, FUSE `2075816e7c94fed6624487040ab0915ed5252b05f6e37d2155176f5c2c197f67`; raw `/tmp/dfs-v5-local-full-20261007-b/run.json`. It was measured before commit `476c6429d9`, which included that implementation.
- The [full GCP report](../gcp/RESULTS.md) measures the previous v5 implementation. The subsequent focused GCP cleanup checks are documented separately; they are not a full GCP rerun of this final batching change.
