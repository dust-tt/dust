# Benchmark results — dfs v5 dust-dev

Run started **2026-10-07T06:08:32Z** and completed successfully: **all 24 timed checks, both full-content hash passes and final cleanup passed**, exit 0.
Untar: **14.660s + 0.088s remaining durable client drain = 14.748s**.
Unmount including drain: 0.165s. Server mutation success means FDB committed; no later persistence drain is required.

## Fixture and method

- Existing dust-dev fixture: five n2-standard-8 VMs (8 vCPU / 32 GiB each). FUSE and DFS share the workload VM in us-central1-a and communicate over loopback. FDB traffic crosses the VPC.
- FDB 7.3.69: 18 processes across four hosts and three zones (us-central1-a, b, f), double replication, three coordinators, ssd-2. Cluster configuration is identical before/after and remained healthy. No cloud resources or FDB settings were changed; existing data and v2/v3/v4 sources/binaries were preserved.
- Rust 1.98.1 release, Linux 7.0.0-1011-gcp x86-64, Python 3.13.5, ripgrep 14.1.1. Sources and build output are isolated in /opt/dfs/v5 and /target/v5. Tests, clippy, release build and unprivileged mounted checks passed before timing. No builds/tests overlapped measurements.
- Same source and jd corpus as the [local run](../bench/RESULTS.md): 10,000 files, 100 directories, 177,499,149 document bytes, seed 42. Untar uses the uncompressed archive including manifest.json, 13 directories deep through /shared and an inherited grant.
- Client: 512 MiB shared accounted cap including read caches and 96 MiB transient reserve; 200 ms maximum write buffering + 800 ms send-time validity, 25 ms coalescing, 128 in-flight groups and 16 envelopes. One FUSE receiver, at most eight deferred workers; direct I/O and zero kernel name/attribute TTLs, no kernel data/writeback cache. Directory validation, small-file ReadFiles batching and adaptive read-ahead enabled.
- Server permission trees use the default 30 s maximum proof age and 250 ms polling. Each first read starts a new server/session/mount while FDB/OS caches remain. Warm is one repeat and can outlast the validity period. Profiling enabled. Single-run results, not statistical estimates. Search rows execute ripgrep through the filesystem.
- Active dfs-play-server and dfs-v3-play-server/mount services were stopped during timing and restored. The previously inactive dfs-play-mount stayed inactive. The supervisor confirmed exact prior active states, with no restoration errors.

## Full table

| Feature | Workload | Phase | Time (ms) | Result |
| --- | --- | --- | ---: | --- |
| population | untar (10,000 files, 177.5 MB) | once | 14,660.31 | OK |
| writeback | remaining durable client drain | once | 88.00 | OK |
| metadata | scandir + stat (100 dirs, 10,000 files) | first | 6,635.48 | OK |
| metadata | scandir + stat (100 dirs, 10,000 files) | warm | 4,782.59 | OK |
| metadata | rg --files (10,000 files) | first | 846.39 | OK |
| metadata | rg --files (10,000 files) | warm | 156.33 | OK |
| metadata | open + fstat + close (10,000 files) | first | 5,296.81 | OK |
| metadata | open + fstat + close (10,000 files) | warm | 4,832.47 | OK |
| metadata | stat missing (256 paths) | first | 2,325.96 | OK |
| metadata | stat missing (256 paths) | warm | 1,725.61 | OK |
| page cache | rg no-match scan (10,000 files, 177.5 MB) | first | 18,928.18 | OK |
| page cache | rg no-match scan (10,000 files, 177.5 MB) | warm | 7,640.43 | OK |
| search | rg rare literal (10,000 files, 4 matches) | first | 18,088.72 | OK |
| search | rg rare literal (10,000 files, 4 matches) | warm | 6,280.26 | OK |
| path pruning | rg branch glob (981 candidate files) | first | 3,017.56 | OK |
| path pruning | rg branch glob (981 candidate files) | warm | 1,522.91 | OK |
| path pruning | rg depth-10 subtree (136 files) | first | 661.83 | OK |
| path pruning | rg depth-10 subtree (136 files) | warm | 445.58 | OK |
| page cache | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 21,866.62 | OK |
| page cache | open + read + SHA-256 (10,000 files, 177.5 MB) | warm | 6,640.34 | OK |
| random I/O | open + pread tail (256 files x 4 KiB) | first | 3,675.97 | OK |
| random I/O | open + pread tail (256 files x 4 KiB) | warm | 996.97 | OK |
| write | create + write (32 x 32 KiB files) | once | 11.49 | OK |
| file sync | fsync (32 files) | once | 38.26 | OK |
| write | close (32 files) | once | 0.59 | OK |
| write | unlink (32 files) | once | 7.68 | OK |

## Local and GCP comparison

Seconds. Both runs use the same source, corpus and client settings. Machines, CPU architecture and FDB topology differ; this does not isolate network latency.

| Workload | Phase | Local (s) | GCP (s) |
| --- | --- | ---: | ---: |
| Untar | once | 7.302 | 14.660 |
| Remaining durable drain | once | 0.018 | 0.088 |
| Untar + drain | once | 7.320 | 14.748 |
| scandir + stat (100 dirs, 10,000 files) | first | 6.430 | 6.635 |
| scandir + stat (100 dirs, 10,000 files) | warm | 5.908 | 4.783 |
| rg --files (10,000 files) | first | 0.278 | 0.846 |
| rg --files (10,000 files) | warm | 0.016 | 0.156 |
| open + fstat + close (10,000 files) | first | 6.838 | 5.297 |
| open + fstat + close (10,000 files) | warm | 5.980 | 4.832 |
| stat missing (256 paths) | first | 1.561 | 2.326 |
| stat missing (256 paths) | warm | 1.273 | 1.726 |
| rg no-match scan (10,000 files, 177.5 MB) | first | 6.912 | 18.928 |
| rg no-match scan (10,000 files, 177.5 MB) | warm | 3.690 | 7.640 |
| rg rare literal (10,000 files, 4 matches) | first | 7.192 | 18.089 |
| rg rare literal (10,000 files, 4 matches) | warm | 3.497 | 6.280 |
| rg branch glob (981 candidate files) | first | 1.241 | 3.018 |
| rg branch glob (981 candidate files) | warm | 0.710 | 1.523 |
| rg depth-10 subtree (136 files) | first | 0.388 | 0.662 |
| rg depth-10 subtree (136 files) | warm | 0.121 | 0.446 |
| open + read + SHA-256 (10,000 files, 177.5 MB) | first | 24.456 | 21.867 |
| open + read + SHA-256 (10,000 files, 177.5 MB) | warm | 8.245 | 6.640 |
| open + pread tail (256 files x 4 KiB) | first | 2.923 | 3.676 |
| open + pread tail (256 files x 4 KiB) | warm | 0.924 | 0.997 |
| create + write (32 x 32 KiB files) | once | 0.014 | 0.011 |
| fsync (32 files) | once | 0.030 | 0.038 |
| close (32 files) | once | 0.000 | 0.001 |
| unlink (32 files) | once | 0.012 | 0.008 |

## Comparison with v4 on GCP

[V4 reference](../../v4/gcp/RESULTS.md#latest-full-table--paired-rerun): 2026-10-06, source 4ad853b432, same fixture and corpus. V4 used 1 s cache validity and 1 s maximum buffering; v5 uses 800 ms and 200 ms. These are comparisons of complete implementations and configurations.

| Workload | v4 (s) | v5 (s) | v5 / v4 |
| --- | ---: | ---: | ---: |
| Untar + durable drain | 13.303 | 14.748 | 1.11× |
| Scandir + stat, first | 12.133 | 6.635 | 0.55× |
| Scandir + stat, warm | 19.003 | 4.783 | 0.25× |
| Open + fstat + close, first | 11.230 | 5.297 | 0.47× |
| Full SHA-256 read, first | 80.022 | 21.867 | 0.27× |
| Full SHA-256 read, warm | 17.670 | 6.640 | 0.38× |
| rg no-match, first | 11.958 | 18.928 | 1.58× |
| rg no-match, warm | 3.516 | 7.640 | 2.17× |
| Random tail reads, first | 3.140 | 3.676 | 1.17× |
| Fsync 32 files | 0.216 | 0.038 | 0.18× |

Metadata traversal and sequential hash reads improved; whole-corpus ripgrep, first random-tail reads and total untar/drain regressed. No controlled experiment has yet isolated the causes.

## Memory and reproducibility

- Peak accounted client memory: **360.54 MiB / 512 MiB**, including the full 96 MiB reserve. Peak observed process RSS: **221.00 MiB**. Allocator/runtime/stacks are outside the accounted cap; scratch remained within its 52 MiB admission limit.
- No recorded client/RPC/writeback errors, exhausted listing retries or inline waits after effects. Full content checks and final cleanup passed.
- Base revision: `6b884d481877cced78b3d27bfe36338ebd8692da+uncommitted-v5`; implementation is uncommitted.
- Source SHA-256: `761f2e9773991a9f8872e28c822f7cfbfe52c2a6f1725f256aadc26cd6e69570` (identical to local; digest definition is in the local report).
- Server SHA-256: `45ea6c50fbc8d396ed07dd3322427001cdce261b4302e5e89dd273bfaa62f4c2`.
- FUSE SHA-256: `05dd381cb9746956693e9343899278b6dc9c33593a74c5d3016cd6c85abc7369`.
- Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
- Raw report: `/var/log/dfs-bench/v5/full-20261007-a/run.json` on dfs-v2-spolu-workload. The directory also contains benchmark.log, environment.json, driver-result.json, per-phase metrics and FDB status before/after. Validation logs and nodes.json are under /var/log/dfs-bench/v5. Generated artifacts and credentials remain outside Git.
