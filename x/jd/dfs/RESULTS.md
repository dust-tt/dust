# DFS PoC results

## Cleanup verification — 2026-10-05

Current DFS + embedded Tantivy passed on GCP `dust-dev` after removing experimental backend and standalone-search dependencies. [Full evidence and source fingerprints](results/prototype-cleanup-verified/README.md). Historical timings below retain their original measurement dates and source snapshots.

| Check | Result | Test / driver |
| --- | --- | --- |
| Default / search-enabled Rust suites | 93 / 114 passed | [scripts/server-implementation-check.py](scripts/server-implementation-check.py); exact test names: [default log](results/prototype-cleanup-verified/tests-default.log), [search log](results/prototype-cleanup-verified/tests-search.log); [source map](DESIGN.md#12-verification-observability-and-remaining-work) |
| Strict Clippy, format, release build, contracts | Passed | [scripts/server-implementation-check.py](scripts/server-implementation-check.py) |
| Two real FUSE mounts | 14 Unix scenario groups passed | [scripts/unix_scenarios.py](scripts/unix_scenarios.py), launched by [scripts/smoke.sh](scripts/smoke.sh) |
| RPC import + HTTP filename/body queries + server restart/index rebuild | Passed; same file identity and content after restart | [results/prototype-cleanup-verified/http-smoke.py](results/prototype-cleanup-verified/http-smoke.py) |

## Earlier campaigns

Newer campaign: [server foundation and concurrency results, 2026-10-05](results/server-implementation/summary.json), including the operation matrix, 2,448 RPC race trials, 72 two-mount trials, and the usual filesystem benchmark. Results identify the exact tested source snapshot.

Test paths below identify the drivers for each campaign; current files may have evolved since those measurements. Archived source manifests remain authoritative for the measured version.

- Server campaign: [scripts/server-implementation-campaign.py](scripts/server-implementation-campaign.py); RPC races: [src/bin/dfs-race-bench.rs](src/bin/dfs-race-bench.rs), [tests/support/namespace_races.rs](tests/support/namespace_races.rs); mounted races: [scripts/namespace-mount-races.py](scripts/namespace-mount-races.py); filesystem timings: [vendor/benchmark.py](vendor/benchmark.py).

## Selective grant invalidation

- Test files: [scripts/selective-scan.py](scripts/selective-scan.py), [scripts/selective-cache-scenarios.py](scripts/selective-cache-scenarios.py), [scripts/grant-scenarios.py](scripts/grant-scenarios.py). Cloud runner: [scripts/run-selective-cloud.sh](scripts/run-selective-cloud.sh); full-suite timings: [vendor/benchmark.py](vendor/benchmark.py); local study: [scripts/local-selective-matrix.py](scripts/local-selective-matrix.py).

The current implementation compares old/new authorized views and retains daemon blocks and kernel pages for unchanged readable files. It invalidates affected permissions, versions, namespace projections, and known inodes absent from the new view, including unlinked handles. Restart and credential loss still invalidate broadly. Unchanged directory names retain their dentries, avoiding unnecessary eviction of authorized descendants.

The fresh controlled cloud search comparison passed all 21 randomized runs: three repetitions each for old/selective clients with admin, ordinary, and 32-group credentials, plus NFS. For the ordinary user, median post-grant search falls from **2,489.08 to 124.64 ms**; for the 32-group user, from **4,681.04 to 126.14 ms**. Every selective post-grant scan issues **zero content RPCs and zero FUSE reads**. All first scans demand-fetch the 10,000 files. The cloud matrix records no unexpected repeat-phase cache misses or OOM events. Each case has a **512 MiB total client limit**, including application, daemon, and kernel pages; the daemon block allowance is **32 MiB**. Content preload is zero.

Cold ordinary-user search remains similar: 2,464.60 ms old versus 2,510.63 ms selective. The change preserves demand-filled caches; it does not remove cold authorization cost or the complete authorized metadata refresh. Mutation, reconciliation, and the two-second settling wait are outside the post-grant search timer.

The current-build multi-user suite passes 176 convergence observations, 149 direct access checks, and five additional scenario assertions. Direct-read revocation has a 123.71 ms notification median and a 610.16 ms dropped-notification median, versus 1.71 ms for comparable NFS mode changes. Both DFS cohorts deny warmed descriptors and fault revoked mappings after reconciliation; NFS retained descriptors/mappings remain readable during the observation window. New-open convergence and completed kernel invalidation remain separate observations, not a strict revocation SLA.

[Cloud report, grant scenarios, and raw evidence](results/selective/CLOUD_REPORT.md). [The three full ASCII tables](results/selective/TABLES.md) use nine unchanged benchmark runs, three per backend, all passing. Selective DFS peaks at 337.4 MiB across the focused search cases and 333.6 MiB across full-suite cases. The full suite's first SHA-256 pass regresses from 1,225.82 to 1,389.32 ms (+13.3%); warm hashing remains close, 1,114.89 versus 1,126.47 ms. The cause of that first-pass difference has not been isolated. NFS still wins create/write, close, and unlink. DFS fsync remains publication-only, so its low timing does not establish durable persistence.

The separate [18-run local ARM64 study](results/selective/REPORT.md) is retained independently. It records the same retention improvement and two kernel-reclaim misses in other repeat phases; those timings remain in its aggregates. The [current implementation snapshot](DESIGN.md) describes the retained prototype.

[Cleanup verification](results/selective/cloud-cleanup-verification.json) confirms all owned cloud resources are removed. Source/binary/corpus provenance, credential scanning, and aligned ASCII formatting are recorded beside the report.

## Earlier multi-user grants and propagation

- Test files: [scripts/grant-scenarios.py](scripts/grant-scenarios.py), [scripts/grant-worker.py](scripts/grant-worker.py), [scripts/grant-scan.py](scripts/grant-scan.py). Search runner: [scripts/grant-scan-matrix.py](scripts/grant-scan-matrix.py).

The follow-up uses three non-admin principals and unchanged DFS binaries. It passed 176 convergence observations, 149 direct access checks, five additional scenario assertions, and twelve focused search runs. Tests cover direct/group grants, read versus write, membership removal with an overlapping direct grant, inheritance, hidden-ancestry sharing, limited delegation, known-node-ID authorization, and warmed descriptors/mappings, including unlinked files. [Full ASCII tables and raw evidence](results/grants/REPORT.md).

Direct-read gain/revocation medians were 162/137 ms with DFS notifications, 490/614 ms with notifications dropped, and 3.55/1.56 ms for remote NFS owner-mode changes. These are post-acknowledgment new-open observations, not a revocation SLA. A polling DFS descriptor still read cached bytes at 584 ms after acknowledgment, even though a new open had been denied; it was denied at the 1,584 ms sample. Both settled DFS mappings faulted with SIGBUS. NFS retained descriptors and mappings remained readable during the observation window, reflecting different semantics.

Under a shared 512 MiB limit, ordinary-user cold search took 2,481 ms versus 2,266 ms for the admin control; 32-group search took 5,201 ms. All three DFS modes warmed to about 121 ms. Changing Carol's grant on an unrelated file forced every DFS client to fetch all 10,000 files again: ordinary-user search returned to 2,467 ms and the 32-group case to 5,213 ms. Each first/post-policy pass issued 10,000 content RPCs; warm and rewarm issued zero. NFS stayed near its warm search timing after the unrelated chmod, with a 1,429 ms post-change scan. These focused probes are separate from the unchanged full benchmark below.

That measured build used conservative whole-view invalidation and unnecessarily discarded unaffected files. The selective implementation described above addresses this behavior; these historical timings are not measurements of the fix. Earlier failed harness attempts and asynchronous propagation observations are retained in the report.

## Demand-filled kernel caching

- Test files: [scripts/kernel-cache-run.py](scripts/kernel-cache-run.py), [vendor/benchmark.py](vendor/benchmark.py). Matrix runner: [scripts/kernel-cache-matrix.py](scripts/kernel-cache-matrix.py). Correctness: [tests/reader.rs](tests/reader.rs), [tests/core.rs](tests/core.rs), [scripts/unix_scenarios.py](scripts/unix_scenarios.py), [scripts/policy-scenarios.py](scripts/policy-scenarios.py), [scripts/failure-scenarios.py](scripts/failure-scenarios.py).

That measured mount retains read-only content pages in the Linux kernel cache after application access. Startup fetches zero file contents. Changed content is invalidated explicitly; permission resets in that build also clear retained pages, and server restarts retire old file inodes. Writable handles retain direct I/O and publication-only fsync.

The new comparison uses the same build with `--direct-io` as its control, plus NFS and native ext4. Application and daemon memory, including kernel pages, share an explicit cgroup limit with swap disabled. The main tables use 512 MiB; additional probes test 192 MiB and a 2.77 GB corpus under 512 MiB and 4 GiB limits. [Full tables and raw measurements](results/kernel-cache/TABLES.md).

The DFS performance matrix uses tenant-admin credentials, which bypass ordinary user/group grant aggregation on server operations. These timings do not measure non-admin authorization cost, many-group workloads, or grant changes under load. Separate mounted tests cover regular-user grant/revocation correctness, including cached descriptors and mappings. In that measured build, policy changes reset views across the tenant, rebuild authorized metadata, and invalidate all known kernel inodes on each reconciling mount; the historical follow-up above measures bounded multi-user propagation and search impact, while tenant-scale throughput and tail latency remain unmeasured.

All **75 randomized runs** passed their data checks, with three independent mounts per case and no OOM events or kills. The unchanged full suite gives these median warm times:

```text
+---------------------+-----------------+------------------+----------+
| Workload            | DFS direct (ms) | DFS cached (ms)  | NFS (ms) |
+---------------------+-----------------+------------------+----------+
| rg no-match scan    |        1,829.30 |            98.53 |   648.32 |
| rg rare literal     |        1,836.88 |            99.43 |   657.11 |
| Read all + SHA-256  |        4,123.58 |           944.59 | 5,768.50 |
+---------------------+-----------------+------------------+----------+
```

Warm rare search is **18.5× faster than direct-I/O DFS and 6.6× faster than NFS**. Independent fresh-mount search probes confirm the mechanism: every first pass fetches 10,000 files on demand, while both repeats produce **zero content RPCs and zero FUSE read callbacks** in all three mounts. Background reconciliation RPCs still occur. First search remains essentially unchanged versus direct I/O: **1,883 ms versus 1,871 ms**, compared with **5,914 ms for NFS**, excluding mount setup. DFS setup takes about 160 ms and NFS about 62 ms in these probes. Metadata still initializes eagerly; content preload is zero.

This uses additional memory. Full-suite peak usage is **336.6 MiB** for cached DFS, **169.5 MiB** for direct DFS, and **270.0 MiB** for NFS. Cached DFS's peak file-backed charge is 219.7 MiB; this is outside the 32 MiB daemon content allowance and includes other file-backed pages in the scope. At a **192 MiB** limit, the small-corpus repeat scan takes **1.87 s** again. For a **2.77 GB** corpus under **512 MiB**, repeated DFS scans take **16.33 s**, versus **17.13 s** direct and **22.80 s** NFS. At an explicit 4 GiB allowance, demand-filled pages can remain resident: DFS repeats take about 145 ms and peak total usage is 2,824.9 MiB. Nothing preloads those pages before the first scan. Pressure runs briefly recorded peaks up to 0.77 MiB above `memory.max` during allocation/reclaim; the raw measurements retain this overshoot.

There are significant regressions. Under 512 MiB, large-corpus first hashing takes **57.03 s versus 43.19 s** direct, a **32% increase**, and **53.83 s** NFS. Second repeats remain **56.99 s**, versus **43.48 s** direct and **45.12 s** NFS. First sparse prefix reads take **620.85 ms versus 380.79 ms** direct and fetch **32 MiB versus 16 MiB** to satisfy 1 MiB of application reads. The cached hashing path issues about 30,000 content RPCs per pass, versus about 18,100 direct; reducing request fragmentation and excess read-ahead is the next optimization target. These counters suggest the cause, but do not isolate it experimentally. `--direct-io` remains available for workloads that prefer this tradeoff.

This is also not native-ext4 search speed: native warm rare search is **19.88 ms**, about five times faster than cached DFS. DFS's asynchronous view advancement differs from NFS close-to-open validation, so its lower open/read validation cost is part of the comparison. The full three ASCII tables, individual repetitions, traffic, startup, and memory accounting are in [TABLES.md](results/kernel-cache/TABLES.md); source/binary/corpus identity checks are in [source-check.json](results/kernel-cache/source-check.json).

The cloud build passed **25 Rust integration tests**, Clippy/format checks, **14 mounted Unix scenario groups**, dropped-event policy/revocation checks, and **six failure scenarios**, including server restart with cached old handles. See [VALIDATION.md](VALIDATION.md). [Cleanup verification](results/kernel-cache/cleanup-verification.json) confirms all owned cloud resources have been removed.

## Earlier demand reads with direct I/O

- Test files: [scripts/demand-probe.py](scripts/demand-probe.py) for fresh probes, [vendor/benchmark.py](vendor/benchmark.py) for the table below. Matrix runner: [scripts/demand-controlled.py](scripts/demand-controlled.py); correctness: [scripts/demand-correctness.sh](scripts/demand-correctness.sh).

The figures and implementation notes below describe earlier measured builds. Their archived source and raw results remain available; the kernel-cache comparison above describes the current read path.

The preceding measured implementation starts with **zero content preload**, uses **64 KiB demand blocks**, and limits retained content to **32 MiB** (24 MiB demand / 8 MiB speculative). One background task can read ahead up to 256 KiB after observed sequential access. The FUSE read callback does not wait for content network I/O or speculative neighbors.

The comparison covers **171 checked runs**, three rounds each, on 10,000-file corpora of **177.5 MB and 2.77 GB**. The old adapter is measured with the same zero-preload setting and cache budget. Same-client NFS and native ext4 controls use the identical path. [Full comparison, startup/traffic/memory accounting, and raw evidence](results/demand/REPORT.md).

On independent fresh small-corpus probes, the new reader is **3.20× faster on full scans**, **4.42× faster on scattered tail reads**, and takes **15.2% less time for SHA-256 reads** than the old adapter. Including mount startup, a full scan falls from **7.56 s to 2.49 s**, and 256 tail reads from **1.34 s to 0.50 s**.

There are material limits. Read-ahead adds 23.3% content traffic to the small-corpus hashing probe. Metadata initialization remains eager: approximately **3.4 MB** and **218 ms** per mount. Peak daemon RSS was **109.8 MiB**, beyond the content-cache allowance. NFS wins repeated bulk reads and fresh single-file access including startup. On the large corpus, DFS first hashing is **48.0 s versus NFS’s 42.8 s**. The unchanged suite’s first branch-search row regresses from **75 ms to 227 ms**, while the separate fresh branch probe improves from **526 ms to 269 ms**. These are different inherited cache states, and both are reported.

Below is the unchanged small-corpus benchmark: median of three independent mounts, with three warm repetitions per read workload. Its `first` rows inherit earlier phases; they are not separate cold probes. Mount startup is reported above and in the independent-probe tables. **DFS fsync acknowledges publication, not durable persistence.** Server caches are uncontrolled. NFS retains normal kernel caching and [close-to-open behavior](https://man7.org/linux/man-pages/man5/nfs.5.html); DFS serves metadata from its asynchronously advancing view.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first |    793.71 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  |    706.29 | OK     |
| metadata     | rg --files (10,000 files)                      | first |     10.64 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |      7.69 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first |    295.50 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  |    295.59 | OK     |
| metadata     | stat missing (256 paths)                       | first |      8.74 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |     13.00 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  2,245.55 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  2,231.76 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  2,237.05 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  2,233.48 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |    226.98 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |     36.92 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |      8.49 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |      8.43 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first |  4,184.19 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  |  4,453.48 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |    186.54 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |     11.98 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |    205.74 | OK     |
| file sync    | fsync (32 files)                               | once  |      0.48 | OK     |
| write        | close (32 files)                               | once  |     13.50 | OK     |
| write        | unlink (32 files)                              | once  |     76.56 | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

## Historical preloaded measurements

The results below prefetched the entire corpus before timing. They establish warm-cache performance only and do not support fresh-sandbox or larger-than-cache claims. They are retained as historical evidence; the demand-read results above supersede them for the current goal. No new GCSFuse comparison is claimed.

## Same-client optimization follow-up

- Test file for both timing tables: [vendor/benchmark.py](vendor/benchmark.py). RPC assertions: [scripts/benchmark-observed.py](scripts/benchmark-observed.py); runners: [scripts/controlled-dfs.sh](scripts/controlled-dfs.sh), [scripts/controlled-nfs.sh](scripts/controlled-nfs.sh), [scripts/controlled-baselines.sh](scripts/controlled-baselines.sh).

The original metadata regression is fixed. On the unchanged 10,000-file benchmark, warm metadata is now **835.68 ms versus 826.18 ms on native ext4**: 1.1% overhead. Name listing is **9.39 versus 8.46 ms**. File-content operations still carry direct-I/O FUSE overhead, so the entire suite has not reached native performance. The revised target keeps the original benchmark and uses native ext4 as the overhead reference.

All backends use the same `n2-standard-8` client, Python 3.12.3, ripgrep 14.1.0, Linux 6.8.0-142, seed-42 corpus, and exact bind path `/home/dfs/x/jd/dfs/runtime/controlled/bench`. DFS has a separate `n2-standard-8` server with a 200 GiB `pd-ssd` disk in `us-central1-a`. NFS is a fresh ZONAL 1 TiB Filestore instance with 6,000 provisioned IOPS, NFSv3 and normal attribute caching. Resource descriptions and mount options are exported.

The table is the median of three full runs; each warm cell within a run is itself the median of three repeats. Each round interleaves DFS, NFS and ext4 in a recorded seeded order. These are warm, correctness-checked measurements, not cold-storage claims. Every measured read-only DFS phase asserts zero per-file data, metadata and mutation RPCs. Initial snapshot/content preparation took **3.471 s** for 10,104 nodes and 180.6 MB, before benchmark timing. DFS uses a 256 MiB daemon content cache plus kernel metadata/listing caches; file contents still bypass the kernel page cache.

| Warm workload, milliseconds | DFS final | NFS | Native ext4 | NFS / DFS |
| --- | ---: | ---: | ---: | ---: |
| scandir + stat (100 dirs, 10,000 files) | 835.68 | 916.56 | 826.18 | 1.10× |
| rg --files (10,000 files) | 9.39 | 16.85 | 8.46 | 1.79× |
| open + fstat + close (10,000 files) | 365.69 | 3,950.97 | 153.06 | 10.80× |
| stat missing (256 paths) | 11.60 | 5.63 | 5.41 | 0.49× |
| rg no-match scan (10,000 files, 177.5 MB) | 397.75 | 670.69 | 28.00 | 1.69× |
| rg rare literal (10,000 files, 4 matches) | 399.09 | 670.18 | 27.87 | 1.68× |
| rg branch glob (981 candidate files) | 40.51 | 73.07 | 14.46 | 1.80× |
| rg depth-10 subtree (136 files) | 9.50 | 13.73 | 6.70 | 1.45× |
| open + read + SHA-256 (10,000 files, 177.5 MB) | 1,552.33 | 4,692.68 | 679.96 | 3.02× |
| open + pread tail (256 files x 4 KiB) | 13.99 | 100.11 | 4.37 | 7.16× |

A ratio above 1 means DFS is faster than NFS. Metadata and name listing are close to native; branch pruning remains 2.80× native and full no-match scanning remains 14.21× native. Deep-subtree search is 9.50 ms versus 6.70 ms native. These remaining costs are visible in the original benchmark and are not hidden by the diagnostic loops.

| Write workload, milliseconds; median of three once-only phases | DFS final | NFS | Native ext4 |
| --- | ---: | ---: | ---: |
| create + write (32 x 32 KiB files) | 175.94 | 112.04 | 1.61 |
| fsync (32 files) | 0.72 | 89.81 | 44.20 |
| close (32 files) | 14.75 | 0.10 | 0.07 |
| unlink (32 files) | 67.92 | 50.87 | 0.78 |

**The fsync figures have different durability contracts.** DFS writes already perform their publication RPC before returning. `fsync` checks the handle and any prior publication error locally; it does not sync the server WAL or wait for stable storage. Background WAL sync still defaults to 100 ms, without a guaranteed loss bound. The 0.72 ms total for 32 calls is therefore not a durable-storage speedup. The earlier guest-reset loss result below remains evidence of this distinction; no new power-loss claim is made for the client optimization.

DFS views advance asynchronously and cached read-only opens avoid per-file server validation. NFS uses its normal [close-to-open validation](https://man7.org/linux/man-pages/man5/nfs.5.html). These consistency/cache behaviors matter when interpreting the 10.80× open/fstat/close advantage.

Full tables and raw repetitions: [final DFS run](results/optimization/directory-cache/1-dfs.txt), [final-stage NFS](results/optimization/directory-cache/1-nfs.txt), [final-stage ext4](results/optimization/directory-cache/1-ext4.txt), [all samples and aggregates](results/optimization/summary.json), [run order](results/optimization/directory-cache/order.txt), [zero-RPC evidence](results/optimization/directory-cache/1-dfs-rpcs.json), and [initialization log](results/optimization/directory-cache/dfs-mount.log).

### GCSFuse on the same client

- Test file: [vendor/benchmark.py](vendor/benchmark.py). Matched-path runner: [scripts/controlled-equal-path.sh](scripts/controlled-equal-path.sh).

GCSFuse 3.12.0 was measured at default settings and with a 256 MiB file cache, using a dedicated `us-central1` bucket. These three-round results came from the earlier interleaved metadata-cache stage on the same host and bind path. Final DFS is shown alongside them; they were not interleaved with the final candidate. NFS and ext4 were rerun alongside every later DFS candidate.

| Warm workload, milliseconds | DFS final | GCSFuse default | GCSFuse 256 MiB file cache |
| --- | ---: | ---: | ---: |
| scandir + stat (100 dirs, 10,000 files) | 835.68 | 8,165.66 | 8,031.54 |
| rg --files (10,000 files) | 9.39 | 677.26 | 723.52 |
| open + fstat + close (10,000 files) | 365.69 | 4,386.56 | 4,347.44 |
| stat missing (256 paths) | 11.60 | 7,482.45 | 7,686.02 |
| rg no-match scan (10,000 files, 177.5 MB) | 397.75 | 1,379.68 | 1,513.13 |
| rg rare literal (10,000 files, 4 matches) | 399.09 | 1,419.32 | 1,403.75 |
| rg branch glob (981 candidate files) | 40.51 | 805.66 | 807.47 |
| rg depth-10 subtree (136 files) | 9.50 | 152.98 | 151.27 |
| open + read + SHA-256 (10,000 files, 177.5 MB) | 1,552.33 | 5,762.47 | 5,779.96 |
| open + pread tail (256 files x 4 KiB) | 13.99 | 112.67 | 123.99 |

[Default GCSFuse raw run](results/optimization/equal-path/1-gcs-default.txt), [file-cache raw run](results/optimization/equal-path/1-gcs-cached.txt), [all-backend order](results/optimization/equal-path/order.json), and [GCSFuse version](results/optimization/gcsfuse-version.txt). Each first invocation is labeled as such; caches were not globally purged between runs.

### What changed and what the CPU floor means

- Diagnostic files: [scripts/metadata-bookkeeping.py](scripts/metadata-bookkeeping.py), [scripts/metadata-syscalls.py](scripts/metadata-syscalls.py), [scripts/profile-metadata.py](scripts/profile-metadata.py). Original timing oracle: [vendor/benchmark.py](vendor/benchmark.py).

The initial adapter gave names and attributes zero TTL, so repeated path resolution and stat operations crossed the kernel/daemon boundary despite a fully prefetched working set. The matched-path preliminary A/B on this client reduced metadata from **3,947.33 to 968.74 ms**, branch pruning from **779.23 to 79.36 ms**, and deep-subtree search from **208.85 to 11.70 ms** after the first metadata-cache fix. Those A/B paths match each other but differ from the final bind path. [Original binary](results/optimization/dfs-before/benchmark.txt), [metadata fix](results/optimization/dfs-metadata/benchmark.txt).

The delivered mount uses one-hour name/attribute TTLs with explicit invalidation, adaptive `readdirplus`, cached directory listings, and lazy directory snapshots rebuilt on rewind. Namespace changes invalidate both parent listings, including previously empty directories. Read-only opens skip redundant flush callbacks; writable closes and explicit fsync retain error checks. Shared chunk references remove an extra full-chunk copy. File contents remain direct I/O, which [bypasses the kernel page cache](https://docs.kernel.org/filesystems/fuse/fuse-io.html); reducing that remaining read cost requires a separately coherent, bounded content-cache design. [Implementation diff](results/optimization/implementation.diff).

The final diagnostic measured **750.74 ms** for the original Python path conversion/dictionary work with all filesystem operations removed from its timed region. The complete unchanged metadata benchmark takes 835.68 ms. Conversely, removing that path bookkeeping gives **40.01 ms DFS, 37.40 ms ext4, and 91.18 ms NFS** for the checked scandir/stat loop. The optimized filesystem work itself is therefore close to native here. These diagnostics explain the limit of the original metric for this Python version and absolute path; they do not replace its reported timing or prove a universal lower bound. Likewise, the native 6.70 ms deep-search result includes process startup and search work that filesystem caching cannot eliminate. [Python-only diagnostic](results/optimization/directory-cache/1-dfs-metadata-bookkeeping.json), [DFS filesystem loop](results/optimization/directory-cache/1-dfs-metadata-diagnostic.json), [ext4 loop](results/optimization/directory-cache/1-ext4-metadata-diagnostic.json), [NFS loop](results/optimization/directory-cache/1-nfs-metadata-diagnostic.json).

### Validation and provenance

- Test files: [tests/core.rs](tests/core.rs), [tests/recovery.rs](tests/recovery.rs), [scripts/unix_scenarios.py](scripts/unix_scenarios.py), [scripts/policy-scenarios.py](scripts/policy-scenarios.py), [scripts/failure-scenarios.py](scripts/failure-scenarios.py). Mounted runner: [scripts/smoke.sh](scripts/smoke.sh).

The final code passes 16 Rust integration tests, clippy with warnings denied, formatting, ten actual Unix scenario groups on both Linux ARM and cloud Linux x86, dropped-event authorization reconciliation, and restart/quota/failure scenarios. The new cases cover cached empty directories, multi-page listings, directory-handle rewind, remote chmod/resize/rename/delete, and repeated atomic replacement. Cache testing exposed a replaced-inode race; invalidating names first and returning ESTALE for obsolete getattr requests permits kernel path revalidation. A separate exploratory failure caught the need to preserve the empty synthetic `/files` directory for principals without an owned root. Both are fixed and the failed attempts remain labeled in the logs.

[Final cloud Unix checks](results/optimization/directory-cache-correctness/smoke/unix.log), [cloud policy checks](results/optimization/directory-cache-correctness/policy/policy.json), [cloud failure checks](results/optimization/directory-cache-correctness/failures/failure.json), [Rust/clippy/failure log](results/optimization/directory-cache-rust-failures.log), and [contract validation](results/optimization/contracts-format-final.log). Dropped-notification grant/revoke observations remain below one second in this run. The original load/guest-reset experiments below are historical server-validation evidence and were not repeated as part of this client-performance comparison.

[Production-source verification](results/optimization/production-source-check.json) checks every intermediate source archive, the final measured executable, unchanged server implementation, and unchanged vendor benchmark/generator. The final source matches the cloud build across all 17 production/build/protocol files. The historical drivers are [scripts/controlled-dfs.sh](scripts/controlled-dfs.sh) and [scripts/controlled-equal-path.sh](scripts/controlled-equal-path.sh). [scripts/analyze-controlled.py](scripts/analyze-controlled.py) reproduces the aggregates; [scripts/verify-controlled-sources.py](scripts/verify-controlled-sources.py) checks provenance.

After exporting and checking the evidence, the two VMs, their boot disks, data disk, Filestore instance, firewall rules, image, two buckets, and dedicated service account were deleted from `dust-dev`. Soft delete was cleared before removing the active corpus/image objects. [Cleanup log](results/optimization/cleanup.log) and [absence verification](results/optimization/cleanup-verification.json) confirm no owned active resources remain. [Final audit](results/optimization/final-audit.json) and [export scan](results/optimization/export-audit.json) record validation and credential checks.

## Original validation phase

The following measurements describe the implementation before this optimization. Its production source is preserved in `results/optimization/source-before.tar.gz`; its original raw evidence is retained.

DFS's core publication, authorization, and recovery model works in the tested envelope. Warm reads make zero per-file RPCs, and an uncontended 4 KiB publication takes one RPC without a foreground sync. The initial FUSE adapter was substantially slower than a local filesystem even with all bytes prefetched. This prototype validates the consistency approach; it does not establish the hoped-for tenfold filesystem speedup.

The complete implementation, locked dependencies, correctness tests, load generators, deployment scripts, and raw evidence are under this directory. See [reproduction and operations](DEPLOYMENT.md), [implementation overview](README.md), and the [design](DESIGN.md). `fsync` is explicitly a publication barrier, **not a durability barrier**.

### Results at a glance

| Measurement | Result | Evidence | Test / driver |
| --- | --- | --- | --- |
| Colocated TLS API publication, 2,000 × 4 KiB | p50 0.580 ms, p99 0.831 ms; 1,600 successful/s; zero errors | [raw samples](results/colocated-final/publication.json) | [src/bin/dfs-load.rs](src/bin/dfs-load.rs), [scripts/colocated-experiment.sh](scripts/colocated-experiment.sh) |
| Warm read-only suite | 0 data, metadata, or mutation RPCs after initialization; periodic control traffic remains | [counter snapshots](results/colocated-final/readonly-rpcs.json) | [scripts/benchmark-observed.py](scripts/benchmark-observed.py), [vendor/benchmark.py](vendor/benchmark.py) |
| Initial 10,104-node view + 180.6 MB content | 4.020 s; 628 read packs + one metadata snapshot | [mount log](results/colocated-final/mount.log) | [scripts/colocated-experiment.sh](scripts/colocated-experiment.sh) |
| Dropped-notification grant/revocation tests | 831–987 ms in four scenarios with 1 s reconciliation | [policy observations](results/policy-final/policy.json) | [scripts/policy-scenarios.py](scripts/policy-scenarios.py) |
| Clean process redeploy | All 6 published mutations recovered | [failure scenarios](results/failures-final/failure.json) | [scripts/failure-scenarios.py](scripts/failure-scenarios.py) |
| 4 MiB syscall under 2 MiB retained quota | Short write 1,048,528 bytes; subsequent fsync returns EDQUOT | [failure scenarios](results/failures-final/failure.json) | [scripts/failure-scenarios.py](scripts/failure-scenarios.py) |
| Server process disconnect / killed mount | ETIMEDOUT after 64.0 ms / ENOTCONN; old editing handle ESTALE after restart | [failure scenarios](results/failures-final/failure.json) | [scripts/failure-scenarios.py](scripts/failure-scenarios.py) |
| Guest reset, 92,413 acknowledged recorder writes | 46 lost; 2,944 bytes; 70 ms acknowledgment span; consistent recovered prefix | [verification](results/network-final/power-verification.json) | [src/bin/dfs-recovery.rs](src/bin/dfs-recovery.rs), [scripts/power-client.sh](scripts/power-client.sh) |
| Half-open RPC during reset | ETIMEDOUT in 15.10 s; 55.18 s from failure detection to service readiness | [derived timing checks](results/power-derived.json) | [scripts/power-client.sh](scripts/power-client.sh), [scripts/analyze-power.py](scripts/analyze-power.py) |

### Controlled filesystem comparison

- Test file for every table row: [vendor/benchmark.py](vendor/benchmark.py). Runner and RPC checks: [scripts/colocated-experiment.sh](scripts/colocated-experiment.sh), [scripts/benchmark-observed.py](scripts/benchmark-observed.py).

Same N2 server, Linux 6.8.0-142, Python 3.12.3, ripgrep 14.1.0, seed-42 corpus, and benchmark code. The corpus contains 10,000 documents (177.5 MB) plus its manifest, totaling 180,554,364 bytes and 10,104 initial visible nodes including DFS roots. Warm figures are the median of three repeats; writes run once. DFS content was explicitly prefetched into a 256 MiB daemon cache. Native filesystem caches were warm. “First” in the raw benchmark is only its first invocation, never proof of cold disk.

| Workload, milliseconds | DFS, colocated TLS | Native ext4, 200 GiB pd-ssd | Native ext4, 50 GiB boot pd-balanced | DFS / pd-ssd |
| --- | ---: | ---: | ---: | ---: |
| Scan + stat, 10,000 files | 3,930.09 | 871.14 | 802.72 | 4.51× slower |
| `rg --files` | 38.49 | 8.28 | 8.45 | 4.65× slower |
| Open + fstat + close, 10,000 files | 3,397.47 | 154.97 | 151.11 | 21.92× slower |
| No-match scan, 177.5 MB | 1,526.40 | 26.53 | 27.10 | 57.53× slower |
| Open + read + SHA-256 | 4,718.27 | 698.55 | 688.58 | 6.75× slower |
| 256 tail reads, 4 KiB each | 92.96 | 4.46 | 4.31 | 20.84× slower |
| Create + write, 32 × 32 KiB | 105.70 | 1.59 | 1.52 | 66.48× slower |
| File fsync, 32 files | 0.59 | 52.65 | 57.02 | Different durability contracts |
| Unlink, 32 files | 35.00 | 0.60 | 0.64 | 58.33× slower |

Full validated outputs: [DFS](results/colocated-final/dfs.txt), [data disk](results/colocated-final/pd-ssd-baseline.txt), [boot disk](results/colocated-final/boot-baseline.txt). SHA-256 content verification, search-result oracles, file counts, and write correctness all pass. The fsync difference follows the intentionally weaker contract and is not an equal-durability performance win. Historical GCSFuse/NFS figures in the design are not controlled baselines for this run.

Zero remote work is insufficient to obtain native warm performance. The initial adapter used direct I/O, zero attribute TTL, and a single FUSE dispatch thread; it repeatedly crosses the kernel/daemon boundary and copies bytes. These are source-backed explanations to profile next, not a measured attribution of every millisecond. Do not buy faster storage before isolating this cost.

### Separate-VM visibility, contention, and cache behavior

- Test files: [scripts/visibility.py](scripts/visibility.py), [src/bin/dfs-load.rs](src/bin/dfs-load.rs), [vendor/benchmark.py](vendor/benchmark.py). Runner: [scripts/network-experiment.sh](scripts/network-experiment.sh); resource sampling: [scripts/sample-metrics.py](scripts/sample-metrics.py).

The storage VM has eight vCPUs; the separate client VM has four. Both are in `us-central1-a`, using persistent TLS connections over private IP and independent authenticated mount sessions. Two mounts run on the client. Each visibility trial publishes an 8-byte value through `pwrite` + `fsync`, then polls the other mount every 0.5 ms. Send-to-observation includes publication and polling, so it is a conservative upper bound on commit-to-visible latency without assuming synchronized cross-host clocks. Ack-to-observation is reported separately. Ten fresh API byte checks pass in each 1,000-sample trial.

| Metric | Idle | Eight competing writers in another tenant |
| --- | ---: | ---: |
| Send-to-visible p50 / p99 | 2.55 / 4.30 ms | 14.38 / 81.36 ms |
| Ack-to-visible p50 / p99 | 1.31 / 2.53 ms | 1.55 / 2.80 ms |
| Maximum send-to-visible | 5.13 ms | 194.18 ms |
| Upper-bound samples over 100 ms | 0 / 1,000 | 7 / 1,000 |
| Independent 4 KiB API probe p50 / p99 | 0.805 / 3.678 ms | 12.561 / 120.061 ms |

[Idle visibility](results/network-final/visibility-idle.json), [loaded visibility](results/network-final/visibility-busy.json), [idle API probe](results/network-final/probe-idle.json), [loaded API probe](results/network-final/probe-busy.json). Both visibility p99s meet the experimental 100 ms target; the maximum does not. The other tenant performs 24,000 random 64 KiB writes across eight workers in 53.18 s: 451/s, p50 13.83 ms, p99 124.75 ms, zero errors. The probe's p99 degrades 32.6×. It is paced by 2 ms only during the loaded case, so its throughput is not a controlled throughput ratio. [Busy-tenant samples](results/network-final/busy-tenant.json) preserve timings for overlap analysis. Publication contention dominates the loaded visibility increase; delivery after acknowledgment remains under 3 ms at p99.

Client-side samples observed a persistence age of **311 ms** despite the 100 ms timer, a 3.97 MB pending-byte peak, and 766 MB of estimated compaction debt. Thus the timer is not an RPO bound, and this is a workload with compaction interference rather than an empty-engine microbenchmark. [Resource samples](results/network-final/client-resources.jsonl) contain timestamps, heads, debt, and process CPU/RAM. The two mount RSS peaks were 223.0 MB and 220.6 MB; CPU consumption over 129.7 s was 44.9 and 4.13 CPU-seconds respectively, with the first mount running the read benchmark. These totals include combined phases, not CPU attribution to one syscall. Sampling is every 200 ms and can miss peaks.

Warm separate-VM reads again add zero per-file RPCs. Open/fstat/close takes 3,673.14 ms versus 149.91 ms on the same client's local filesystem; no-match search takes 1,507.61 versus 45.94 ms. [DFS warm suite](results/network-final/dfs-warm.txt), [same-client baseline](results/network-final/client-baseline.txt), [RPC evidence](results/network-final/readonly-rpcs.json).

The controlled **client-content-cold / server-warm** run disables initial prefetch and starts with zero cached content, while retaining the authorized metadata snapshot. Preparation takes 149 ms. Its first document no-match scan takes 8,779 ms, then 1,507 ms warm. Directory-local miss packs are bounded to 16 ranges / 1 MiB; the entire suite, including write verification, issues 5,411 data calls. Full initial prefetch uses 628 packs for this corpus but pays about four seconds before mounting. This is evidence of the startup/first-access tradeoff, not a pure batching A/B comparison. The server's page/block caches are warm, and earlier metadata phases have run; only the first document-content scan is labeled cold. [Cold timings](results/network-final/dfs-client-cold.txt), [empty-cache counter](results/network-final/cold-before.json), [final counter](results/network-final/cold-after.json), [preparation log](results/network-final/cold.log).

### Correctness and Unix compatibility

- Test files: [tests/core.rs](tests/core.rs) and [tests/recovery.rs](tests/recovery.rs) for Rust checks; [scripts/unix_scenarios.py](scripts/unix_scenarios.py) for the Unix table; [scripts/policy-scenarios.py](scripts/policy-scenarios.py) for sharing; [scripts/failure-scenarios.py](scripts/failure-scenarios.py) for mounted faults; [scripts/auth-negative.py](scripts/auth-negative.py) for TLS/authentication rejection.

Sixteen Rust integration tests cover same-base contention, sparse ranges/truncation/append, history authorization, shared projections, direct/group/inherited grants, replacement identity, open-unlinked files, retry binding, restart incarnation, scopes/tenants, quota/backpressure/storage errors, journal filtering, subtree policy changes, and depth bounds. Actual Linux tests cover eight groups of Unix operations plus sharing/policy and failure suites. [Cloud validation log](results/network-prepare.log), [native validation log](results/tests-final-native.log), [Unix results](results/smoke-final/unix.json), [policy results](results/policy-final/policy.json), and [failure results](results/failures-final/failure.json) contain the evidence. Live network checks also reject an invalid bearer credential and an untrusted TLS issuer: [authentication results](results/auth-negative.json).

| Behavior | Observed result |
| --- | --- |
| `cp`, `mv`, shell redirection, truncate, append, sparse reads, directory fsync | Pass |
| Two editing handles based on the same version | One publishes; competing handle returns ESTALE |
| Reopen after an earlier read; temp-file replacement | Can overwrite newer work, as documented; no editing-session transaction |
| Atomic replacement | Source identity/grants survive; replaced identity is retained only through existing handles |
| Open-unlinked files | Existing readers/writers work; new lookup fails; restart invalidates handles |
| chmod and executable binary/script | Pass; mode bits do not expand server grants |
| Hidden file share, duplicate basenames, group directory share, overlapping access | Pass; no hidden ancestry or sibling exposure |
| Unlink/rename projected `/shared` root | EACCES; operations inside a granted directory work |
| Move subtree between inherited policies | Atomic; requires policy administration; no artificial EXDEV |
| Read-only and writable mmap | Both ENODEV (19) with this direct-I/O adapter |
| Symlinks / hard links | EPERM (1) |
| xattrs / flock / POSIX locks / statfs | Explicit unsupported implementation; observed xattr/flock/statfs EOPNOTSUPP (95) |
| Ownership changes / non-UTF-8 names | Unsupported / EILSEQ; UID/GID are mount-local presentation |

No distributed locks are implemented. Advertising FUSE lock capabilities and returning EOPNOTSUPP avoids silently accepting mount-local locks as cross-client coordination. No garbage collector or backup is implemented. Current authorization protects retained versions; history retention does not confer access.

The fault-injection tests recover exact accepted-state digests, including namespace, bytes, policy indexes, journal, and retry outcomes. [Boundary injection](results/recovery-boundaries.json) covers before/after publication and persistence. [SIGKILL and offline torn-WAL models](results/recovery-prefix.json) distinguish process termination (36/36 recovered in this run) from deliberately truncating copied WALs (34, 31, 17, and 4 of 36 recovered). Every result is a complete prefix. The truncations are models of missing/torn WAL suffixes, not measured physical-host loss windows. Recovery uses pinned RocksDB 10.4.2 with [point-in-time recovery](https://github.com/facebook/rocksdb/wiki/WAL-Recovery-Modes) and then validates application-level invariants before serving.

### Guest reset and recovery

- Recorder and recovery oracle: [src/bin/dfs-recovery.rs](src/bin/dfs-recovery.rs). Runner: [scripts/power-client.sh](scripts/power-client.sh); timing analysis: [scripts/analyze-power.py](scripts/analyze-power.py).

The final trial reset the storage VM through GCE while the independent client logged 64-byte write attempts and acknowledgments. A VM reset discards guest memory and forces an abrupt guest shutdown; it is distinct from SIGKILL and does not simulate loss of the underlying Persistent Disk replicas. [Google's reset semantics](https://docs.cloud.google.com/compute/docs/instances/reset-instance) describe that distinction.

The recorder acknowledged **92,413 writes** over about 151 seconds. Recovery retained 92,367 of them and lost a suffix of **46 writes / 2,944 payload bytes**, covering **70 ms between the first and last lost acknowledgments**. That span is one observed suffix, not a guaranteed RPO or a precise timestamp of the physical failure. The last unacknowledged attempt was also absent: 47 old requests returned unknown/ESTALE, and none was replayed. Every retained retry matched its recorded original outcome; the recovered file matched the final retained bytes. Full startup validation checked the existing namespace, manifests/checksums, grant/member indexes, journal and retry coverage before the server listened.

[Raw attempt/ack log, gzip](results/network-final/power-attempts.jsonl.gz), [verification](results/network-final/power-verification.json), [reset request](results/power-reset-request.json), [failure/ready timing and incarnation checks](results/power-derived.json), and [server journal](results/server-final/systemd-journal.txt) provide the evidence. The two incarnations differ. Per-tenant recovered head is 162,823; shard-wide recovered head is 186,832. The verification oracle took 229.45 s to check all recorded outcomes; that is separate from service readiness.

The client failed the half-open call after **15.10 s**, consistent with three five-second attempts plus short backoffs. It observed service readiness **55.18 s after failure detection**, on the same client clock. Reset-request-to-readiness was approximately **71.7 s**, using wall clocks on the controller and client, so it is an operational estimate rather than a clock-synchronized latency measurement. Systemd started the server at 08:52:40 UTC; startup/integrity validation completed at 08:53:25.45 UTC. This exceeds the proposed future 60 s recovery objective.

An earlier reset exposed that the transport's configured timeout did not bound a half-open channel. It was fixed with outer deadlines covering complete calls, login/connect, and snapshot parts. The new TCP blackhole integration test and this final reset verify the fix. Earlier performance folders with `before-deadline-fix` are exploratory and are not used for final acceptance. One later warm-counter attempt also included the preceding test's asynchronous file close; the measurement harness now settles before taking its baseline, and the successful rerun asserts zero per-file traffic.

### Tested scale and storage

- Test driver: [scripts/large-tenant.sh](scripts/large-tenant.sh); publication workload: [src/bin/dfs-load.rs](src/bin/dfs-load.rs). Storage observations also come from [scripts/network-experiment.sh](scripts/network-experiment.sh).

The principal working-set case has 10,000 documents / 180.6 MB including the manifest, two mounts, and two tenants. The contention case adds eight 64 KiB API writers in the second tenant plus a 4 KiB probe and visibility writes in the first. The large namespace case separately adds 40,000 empty files in 40 directories: **50,154 visible nodes at initialization, 50,156 after its load setup**. This is a metadata-scale test, not a claim about 50,000 large documents or a combined worst-case capacity.

Large-view metadata-only preparation took **667 ms** and transferred **16.58 MB** in one snapshot stream. Walking the 40,000 new files without per-file stat took **117 ms**. Its 1,000 4 KiB API writes measured p50 **0.601 ms**, p99 **0.855 ms**, and **1,520/s**, with zero errors. [Preparation](results/large-final/mount.log), [walk](results/large-final/count.json), [publication samples](results/large-final/publication.json), [process memory](results/large-final/mount-status.txt), and [import resource usage](results/large-final/import-time.txt).

No history is reclaimed. The first competing-tenant case writes 1.573 GB of payload although its eight live files total only 512 KiB. The database occupied **1.753 GB after that load** and **1.748 GB after the larger namespace case**; compaction/compression makes physical size nonmonotonic even though retained logical quota usage grows. It occupied **1.704 GB after the reset and recovery**, which also excludes the lost suffix. These are whole-database observations, not per-file storage attribution. [After-load size](results/server-final/storage-after-load.txt), [large-case size](results/large-final/storage.txt), [recovered size](results/server-final/storage-after-recovery.txt), and RocksDB logs retain the measurements.

### Complete server resource profile

- Load generator: [src/bin/dfs-load.rs](src/bin/dfs-load.rs). Drivers: [scripts/resource-followup.sh](scripts/resource-followup.sh), [scripts/resource-followup-client.sh](scripts/resource-followup-client.sh); samples and analysis: [scripts/sample-metrics.py](scripts/sample-metrics.py), [scripts/analyze-resources.py](scripts/analyze-resources.py).

The original server sampler stopped when a WAL file disappeared between directory enumeration and `stat`. The main client samples and latency tests completed, but the original server trace cannot support whole-run CPU/I/O claims. After fixing that sampling race, a separate follow-up repeated 24,000 noisy-tenant 64 KiB writes and 2,000 paced 4 KiB probe writes on the recovered, history-rich database. This is a different database state and contains no simultaneous visibility trial.

All 26,000 writes succeeded. The noisy tenant achieved **378/s**, p50 **13.61 ms**, p99 **178.87 ms**; the probe measured p50 **12.75 ms**, p99 **211.09 ms**. Over 371 samples spanning 74.04 s, server RSS peaked at **562.8 MB**, CPU consumption was **79.02 CPU-seconds**, pending bytes peaked at **3.95 MB**, persistence age at **361 ms**, and estimated compaction debt at **1.262 GB**. WAL size peaked at **135.2 MB**; the configured 128 MiB WAL setting is a soft target. Free disk remained above 193 GB. [Noisy-tenant samples](results/resource-followup-client/busy.json), [probe samples](results/resource-followup-client/probe.json), [server resource samples](results/resource-followup-server/resources.jsonl).

Database size grew from **1.704 GB to 3.298 GB** for **1.581 GB** of application payload. The server's `/proc/PID/io` write-byte counter grew by **13.997 GB**, or **8.85× payload**, during the monitored interval. This is a kernel write-accounting proxy covering WAL, SST and compaction activity, not measured physical NAND write amplification. The RocksDB event log contains 74 completed flushes and 41 completed compactions in the sampling window. [Derived analysis](results/resource-followup-server/analysis.json), [before I/O](results/resource-followup-server/io-before.txt), [after I/O](results/resource-followup-server/io-after.txt), [RocksDB log](results/resource-followup-server/rocksdb.log).

The first improvement experiments should isolate FUSE syscall/copy overhead, then tenant admission and compaction interference, then recovery validation cost. Integrated [RocksDB BlobDB](https://github.com/facebook/rocksdb/wiki/BlobDB) is a concrete storage experiment: keeping large values outside SSTs can reduce repeated compaction rewrites, at the cost of blob-file space management and garbage collection. It is not enabled here; compare it at equal history retention and cache budgets before attributing a latency benefit.

### Implementation choices and bounds

One ordered writer validates and publishes a cross-column-family atomic RocksDB batch with WAL enabled and `sync=false`. Reads use coherent snapshots. Blocking DB work runs outside Tokio's network workers. Each successful publication includes retry outcome and journal head. Background WAL sync serializes with the writer and reports a covered shard prefix; published/persisted counters are shard-wide, while authorization/journal heads are per tenant.

Limits are 1 MiB logical I/O, 4 MiB RPC frames, 64 global calls, eight admitted calls per tenant, 64 streams with two queued frames, 100,000 lifetime nodes per tenant, 8 GiB retained logical batch bytes per tenant, 256 MiB unsynced pending bytes, 256 sessions, and 100,000 server handles. Sessions and retry epochs expire after one hour. Content caches default to 256 MiB per mount; metadata has a 100,000-node client bound. A single file's sparse size is not physical allocation. Quota accounting intentionally charges retained batches/history, not just live file sizes.

These are configured bounds, not demonstrated capacity claims. Admission rejects overflow instead of queuing unlimited work. The ordered writer is still shared by tenants. Policy/subtree moves trigger tenant view resets; ordinary changes use filtered journal deltas, with resnapshot after more than 128 missed records. Snapshot consumers have a five-second send timeout; watch consumers have two seconds. RPC attempts are bounded to three, each with a five-second request deadline; observed fast disconnects fail sooner.

The wire design uses a control-only watermark subscription followed by a filtered `Changes` RPC, rather than pushing each delta directly down the subscription. Content uses authorized range/pack RPCs. A complete loss of access is represented by an empty authorized snapshot; that data stream terminates, while the control channel can remain available for later access gains. There is no dedicated `ACCESS_LOST` enum message. Independent requests currently publish separate batches; ready-request coalescing is a tuning lever, not an implemented throughput claim. These protocol choices preserve the tested publication, authorization, and convergence behavior but differ from the design's suggested dispatcher/message shape.

The initial exploratory implementation rebuilt the entire view on every update. On local Linux ARM, moving to journal deltas reduced create+write for 32 files from 2,656 ms to 68.7 ms and unlink from 1,247 ms to 20.8 ms. These [before](results/first-benchmark) and [after](results/delta-benchmark) runs used [vendor/benchmark.py](vendor/benchmark.py) and guided implementation; they predate the final lifecycle fixes and are not the acceptance results. Failure tests found and fixed shutdown waiting on active watch streams and an asynchronous FUSE unmount/remount race. Performance reporting above uses the corrected implementation.

### Path forward

The [client cache ownership and writeback proposal](design/CLIENT_CACHE_DESIGN.md) records the current mount baseline and future changes: kernel-owned content residency, daemon prefetch feeding kernel pages, independent fetch budgets, retained authorized metadata, and optional kernel writeback with explicit conflict and fsync semantics. These changes are proposed; they are not benchmark results or implemented behavior.

| Limitation and evidence | Concrete solution and tradeoff | Next validation |
| --- | --- | --- |
| One tenant remains on one shard; full authorized initialization scales with namespace size | Place subtrees/ranges on shards; route stable node IDs through a versioned placement directory. Cache ancestor-policy summaries with epochs, checking authoritative policy on mutations. Initially reject cross-shard moves with EXDEV; later use a coordinator with durable prepare/commit records. This introduces routing and policy-consistency costs. | Split one tenant across two shards; move a hot subtree under continuous reads and revocations. Inject coordinator/owner failure and prove no identity or permission gaps. |
| Busy tenants share the writer, CPU, WAL sync, and compaction; follow-up probe p99 is 211 ms with 1.26 GB compaction debt | Use bounded deficit-round-robin admission weighted by bytes and operation cost, per-tenant memory/history quotas, and separate compaction budgets or shard processes for heavy tenants. Compare integrated BlobDB against the measured 8.85× kernel write-accounting proxy. Rebalance after sustained p99 latency or pending-byte thresholds, not tenant count alone. Fairness may reduce peak aggregate throughput; value separation adds GC work. | Sweep 1/8/32 writers, payload sizes, and tenant weights. Require a probe p99 below 10 ms at a declared offered load, report rejection rates, then compare isolated shards and storage layouts. |
| Publication precedes persistence; process survival does not prove durable acknowledgment | Adapt WAL sync to both elapsed age and unsynced bytes, backpressure at explicit lag limits, and offer an optional durable-prefix barrier. Persist policy administration synchronously when revocation rollback is unacceptable. Replicate a committed log only for workloads needing failure-domain durability; it adds latency/cost. | Repeat randomized guest resets over many sync phases and storage stalls; report loss distributions in operations/bytes/ack age. Compare 10/100/1000 ms timers, byte thresholds, and durable policy barriers. |
| Recovery relies on one disk owner and full startup validation | Maintain an owner epoch in an external strongly consistent control record; fence the old VM before disk reattachment, bind sessions and requests to the epoch, and automate the documented single-owner procedure. Keep fail-closed validation. Checkpoints/incremental verified manifests can reduce startup scan cost but need corruption coverage. | Demonstrate replacement-VM recovery with a fenced old owner and two competing takeover attempts. Set and measure a recovery-time objective (initial candidate: 60 s for this envelope) before advertising it. |
| All versions, chunks, retry outcomes, and journal records accumulate | Keep recent versions for a configured history window and pin versions for live readers, open-unlinked handles, and completed backup checkpoints. Expire crashed sessions with bounded leases. Use epoch-based mark/sweep with a grace period and atomic retention floors; compaction alone cannot identify unreachable application content. | Run repeated edits/deletes and killed readers through two GC cycles; verify no pinned chunk disappears and storage reaches a steady state. Test old cursor reset and expired retry rejection while pruning. |
| Delivered cache data remains readable offline; connected revocation takes reconciliation time | Make offline policy explicit per deployment: current cached-read availability, or fail-closed reads after a short freshness lease. For stronger local revocation, isolate the daemon, prevent workload access to its cache/credentials, invalidate kernel pages, and terminate workloads if required. Copied data remains outside recall. | Disconnect immediately before revocation, exercise existing descriptors and copied bytes, and measure connected eviction and lease expiry independently. Avoid claims that remote policy can erase already delivered data. |
| Direct-I/O FUSE is slow; mmap/links/locks are absent | Add read-only kernel caching with generation-tagged invalidation and measured TTLs, then parallelize safe FUSE reads and reduce copies. Implement links only with explicit identity/link-count rules. If locks are needed, start with the design's whole-session fencing, then use operation-scoped fencing tokens for finer recovery. More caching and finer fencing increase coherence complexity. | Profile syscall/context-switch/copy costs first. Rerun the same integrity, stale-handle, revoke, mmap, fork/dup/last-close and lockfile tests after each optimization. Never trade correctness for benchmark cache hits. |
| Workload assumptions (10:1 reads/writes, 99% directory locality, rare contention) remain hypotheses | Instrument authorized access locality, conflict rate, working-set churn and pack utilization. Tune pack byte/count limits, metadata TTL, chunk size, compression, ready-request batch coalescing, and direct delta delivery from profiles. Set separate targets: visibility p99 ≤100 ms, missed-event recovery around 1 s, and publication p99 ≤10 ms at a stated workload; do not call these SLAs yet. | Replay measured traces plus adversarial random-directory access and competing same-file edits. Sweep 64 KiB/256 KiB chunks and pack sizes at equal cache budgets, recording wasted bytes and CPU as well as latency. |
| Backup and object access are deferred | Export a consistent RocksDB checkpoint to a dedicated GCS prefix with a manifest/checksums and publish its completion marker last. Retain the last verified backup and pin its referenced chunks. Expose authenticated versioned object/range reads through the existing stable IDs/manifests before designing a portable archive. | Restore into an isolated fenced server, verify complete namespace/policy/retry/content digests, and measure backup age and restore time. No backup coverage until that experiment passes. |

### Evidence and reproducibility

Use [DEPLOYMENT.md](DEPLOYMENT.md) to start the current prototype; use the campaign drivers linked beside each result to reproduce historical workloads with their recorded source snapshots. The benchmark is vendored unchanged with its original source revision, manifest oracle, and six unit tests. Per-run source manifests contain SHA-256 for individual files; binary hashes identify the executable actually measured. The surrounding repository revision is recorded separately because the PoC is delivered as local changes. Experimental credentials/images/databases remain ignored under `runtime/` and `cloud/`; exported results omit secrets.

All 17 original production source/build/protocol files, preserved in `results/optimization/source-before.tar.gz`, match the original colocated, network, and server manifests: [comparison](results/production-source-check.json). AppleDouble `._` packaging metadata is excluded from that comparison. Client binaries had debug sections stripped for transfer; their hashes differ from the server's unstripped executables. Analysis scripts and documentation were finalized after measurement; [SOURCE_MANIFEST.json](results/SOURCE_MANIFEST.json) identifies the delivered source and [ARTIFACT_MANIFEST.json](results/ARTIFACT_MANIFEST.json) covers the complete exported package. Run `python3 scripts/artifact-manifest.py --verify` to check it.

After exporting the evidence, both VMs, both boot disks, the data disk, both firewall rules, the imported image, and the staging bucket were deleted from `dust-dev`. [Deletion log](results/cloud-cleanup.log) and [absence checks](results/cloud-cleanup-verification.json) confirm cleanup. Reproduction requires provisioning a new scratch deployment; no running service or cloud backup is retained.

The test disk is a compatible fallback, not Hyperdisk Extreme. The published maximum for 200 GiB zonal pd-ssd on this N2 configuration is limited by disk size to 12,000 IOPS and 336 MiB/s, below the 8-vCPU VM's 15,000 IOPS/800 MiB/s cap. The 50 GiB balanced boot disk's size limit is 3,300 IOPS/154 MiB/s. These are provider ceilings, not achieved application throughput. [Google's sizing formulas and VM limits](https://docs.cloud.google.com/compute/docs/disks/performance) support these numbers.

## Shared rename optimization (2026-10-02)

- Benchmark: [src/bin/dfs-rename-bench.rs](src/bin/dfs-rename-bench.rs); runner: [scripts/bench-rename-comparison.sh](scripts/bench-rename-comparison.sh); assertions: [tests/core/rename.rs](tests/core/rename.rs), [scripts/unix_scenarios.py](scripts/unix_scenarios.py). Exact paired sources, including the separate SlateDB GCS recovery test, are in [compiled-source.tar.gz](results/rename-optimization/rename-optimization-export/compiled-source.tar.gz).

The [paired comparison and validation evidence](results/rename-optimization/rename-optimization-export/results) records the newly authorized RocksDB run on a fresh GCP VM, together with matched SlateDB measurements. For a 10,000-file lateral move, median RPC latency fell from 30.287 to 0.475 ms on RocksDB and from 88.819 to 0.676 ms on SlateDB. The other tenant's write p99 during those moves fell from 31.140 to 0.795 ms and from 101.465 to 0.963 ms respectively. Deeper directory moves retain the original entry-prefix walk and remain proportional to subtree size.

All 40 default tests per backend/variant, the separate real-GCS crash-boundary test, 14 mounted Unix scenario groups, and all 24 final cells passed. The cells retain 12,960 successful renames, 5,040 expected rejections, and 32,092 writer samples, with per-cell restart verification. The report preserves the discarded candidate, the final source and binary hashes, lint diagnostics and narrow configuration allowances, credential-scan evidence, and cloud cleanup verification. These warm administrator RPC measurements do not replace the historical FUSE corpus timings. All execution remained on GCP `dust-dev`.

## Depth-limit removal — 2026-10-03

- Benchmark: [src/bin/dfs-rename-bench.rs](src/bin/dfs-rename-bench.rs); archived runner: [results/unbounded-depth/depth-export/run.sh](results/unbounded-depth/depth-export/run.sh); tests: [tests/core/rename.rs](tests/core/rename.rs), [tests/lexical.rs](tests/lexical.rs), [scripts/unix_scenarios.py](scripts/unix_scenarios.py).

A fresh paired experiment in `dust-dev` removes the arbitrary 128-level limit and all source-subtree rename traversal for both backends. For a 10,000-file directory moved deeper, median RPC publication latency changed from 28.889 to 0.453 ms on RocksDB and from 90.038 to 0.671 ms on SlateDB. All 24 cells and restart checks passed. See [the comparison](results/unbounded-depth/comparison.json) and [raw evidence](results/unbounded-depth/depth-export/results) for the full four-direction table, writer contention, deep-tree/authority/cycle tests, protocol, and limits.
