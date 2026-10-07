# Benchmark results — dfs v5 localhost

Run started **2026-10-07T05:47:05Z** and completed successfully: **all 24 timed checks, both full-content hash passes and final cleanup passed**, exit 0.
Untar: **7.302s + 0.018s remaining durable client drain = 7.320s**.
Unmount including drain: 0.119s. Server success acknowledges an FDB commit; there is no later persistence drain.

## Fixture and method

- Native Linux ARM64 in Docker Desktop on an Apple M4 Max (64 GiB host). The Linux VM has 16 vCPUs and 16 GiB configured RAM (15.60 GiB visible). One DFS server and one local FoundationDB 7.3.69 process, single replication, ssd-2, 8 GiB FDB container limit; existing FDB configuration/data preserved.
- Rust 1.98.1 release builds, Python 3.13.5, ripgrep 14.1.1, Linux 6.12.54-linuxkit. Profiling enabled. Interactive v4 processes paused during timing and restored afterward; no concurrent builds/tests.
- Same jd corpus and workloads as v4: 10,000 files, 100 directories, 177,499,149 document bytes, seed 42. The uncompressed archive also contains manifest.json. Untar runs 13 directories below the tenant root through /shared and an inherited grant.
- Client: 512 MiB shared accounted cap, including 96 MiB transient reserve and all read caches; 200 ms maximum write buffering, 800 ms send-time validity, 25 ms coalescing, 128 in-flight groups, 16 envelopes. One FUSE receiver, at most eight deferred workers. Direct I/O, zero kernel name/attribute TTLs, no kernel data/writeback caching.
- Directory-wide attributes/validation, small-file ReadFiles batching and adaptive read-ahead enabled. Server uses its complete tenant permission tree with the default 30 s maximum proof age and 250 ms polling; all filesystem data and durable mutations use FDB.
- Every first read restarts the server/session/mount; FDB and OS caches remain. Warm is one repeat and may outlast the 800 ms validity. These are single samples, not statistical estimates. The search rows execute filesystem ripgrep, not a search service.

## Full table

| Feature | Workload | Phase | Time (ms) | Result |
| --- | --- | --- | ---: | --- |
| population | untar (10,000 files, 177.5 MB) | once | 7,302.02 | OK |
| writeback | remaining durable client drain | once | 18.00 | OK |
| metadata | scandir + stat (100 dirs, 10,000 files) | first | 6,429.69 | OK |
| metadata | scandir + stat (100 dirs, 10,000 files) | warm | 5,907.52 | OK |
| metadata | rg --files (10,000 files) | first | 277.52 | OK |
| metadata | rg --files (10,000 files) | warm | 15.63 | OK |
| metadata | open + fstat + close (10,000 files) | first | 6,838.44 | OK |
| metadata | open + fstat + close (10,000 files) | warm | 5,979.77 | OK |
| metadata | stat missing (256 paths) | first | 1,561.21 | OK |
| metadata | stat missing (256 paths) | warm | 1,273.40 | OK |
| page cache | rg no-match scan (10,000 files, 177.5 MB) | first | 6,911.69 | OK |
| page cache | rg no-match scan (10,000 files, 177.5 MB) | warm | 3,689.54 | OK |
| search | rg rare literal (10,000 files, 4 matches) | first | 7,191.90 | OK |
| search | rg rare literal (10,000 files, 4 matches) | warm | 3,496.58 | OK |
| path pruning | rg branch glob (981 candidate files) | first | 1,240.90 | OK |
| path pruning | rg branch glob (981 candidate files) | warm | 709.56 | OK |
| path pruning | rg depth-10 subtree (136 files) | first | 388.47 | OK |
| path pruning | rg depth-10 subtree (136 files) | warm | 121.29 | OK |
| page cache | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 24,455.53 | OK |
| page cache | open + read + SHA-256 (10,000 files, 177.5 MB) | warm | 8,244.86 | OK |
| random I/O | open + pread tail (256 files x 4 KiB) | first | 2,923.31 | OK |
| random I/O | open + pread tail (256 files x 4 KiB) | warm | 923.88 | OK |
| write | create + write (32 x 32 KiB files) | once | 14.14 | OK |
| file sync | fsync (32 files) | once | 29.78 | OK |
| write | close (32 files) | once | 0.47 | OK |
| write | unlink (32 files) | once | 11.85 | OK |

## Comparison with the latest v4 local run

[v4 reference](../../v4/bench/RESULTS.md#latest-full-table--paired-rerun): 2026-10-06, source 4ad853b432, same enlarged local fixture and corpus. V4 used 1 s cache validity and 1 s maximum buffering; v5 uses 800 ms and 200 ms. These measurements compare complete implementations with their stated configurations, not an isolated optimization.

| Workload | v4 (s) | v5 (s) | v5 / v4 |
| --- | ---: | ---: | ---: |
| Untar + durable drain | 7.037 | 7.320 | 1.04× |
| Scandir + stat, first | 11.771 | 6.430 | 0.55× |
| Scandir + stat, warm | 21.119 | 5.908 | 0.28× |
| rg --files, first | 0.340 | 0.278 | 0.82× |
| Open + fstat + close, first | 10.656 | 6.838 | 0.64× |
| rg no-match, first | 4.246 | 6.912 | 1.63× |
| rg no-match, warm | 2.102 | 3.690 | 1.76× |
| Full SHA-256 read, first | 64.177 | 24.456 | 0.38× |
| Full SHA-256 read, warm | 15.484 | 8.245 | 0.53× |
| Random tail reads, first | 1.988 | 2.923 | 1.47× |
| Fsync 32 files | 0.148 | 0.030 | 0.20× |

Metadata traversal and full sequential hash reads improved in this run. Parallel whole-corpus ripgrep scans and first random-tail reads regressed; v5 is not uniformly faster. The counters do not by themselves establish the cause of those regressions.

## Memory and correctness

- Maximum accounted client peak across mounts: **359.62 MiB / 512 MiB**, including the entire 96 MiB transient reservation. Scratch peaked at its enforced 52 MiB limit. Maximum observed process peak RSS: **220.30 MiB**; allocator/runtime/stacks are outside the accounted cap.
- No recorded client/RPC/writeback errors, no exhausted listing retries and no inline waits after effects. Untar completed 10,209 successful independent write groups. Final cleanup encountered one listing race and completed after stabilization.
- All interactive process states were restored. FDB remained running with zero container restarts and OOMKilled=false.
- Rust workspace tests (including real FDB), strict clippy, contract syntax checks and unprivileged release-mounted tests passed before timing.
- The earlier attempt failed during untar when unrelated commits invalidated directory snapshots repeatedly. It produced no valid timing/table. The measured implementation uses bounded per-object commit fences, tested for related/unrelated commits and discarded-record fallback.

## Reproducibility

- Base commit: `6b884d481877cced78b3d27bfe36338ebd8692da+uncommitted-v5`. Runtime changes are uncommitted; the source digest identifies the measured tree.
- Source SHA-256: `761f2e9773991a9f8872e28c822f7cfbfe52c2a6f1725f256aadc26cd6e69570`.
- Source digest covers sorted relative paths and bytes of v5 .rs/.proto/.toml/.py files and Cargo.lock, excluding target; each path and payload is NUL-delimited. Markdown-only report changes do not alter it.
- Server SHA-256: `738f41360fcfc1640752d743b4e8cb3647f0e128b98ae421e968e3e21ca6d516`.
- FUSE SHA-256: `2075816e7c94fed6624487040ab0915ed5252b05f6e37d2155176f5c2c197f67`.
- Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
- Raw report: `/tmp/dfs-v5-local-full-20261007-b/run.json` inside `dfs-v4-dev-1`; environment and per-phase metrics are alongside it. Credentials and generated artifacts remain outside Git.
- The same source completed the [GCP measurement](../gcp/RESULTS.md) after remote validation.
