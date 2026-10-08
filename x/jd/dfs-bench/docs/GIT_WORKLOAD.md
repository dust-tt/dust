# Git clone and repository search

The requested source is `git@github.com:dust-tt/dust`. The benchmark VMs have no GitHub SSH identity. After obtaining GitHub's published host keys over HTTPS, SSH preflight returned `Permission denied (publickey)`. Public HTTPS access to `https://github.com/dust-tt/dust.git` succeeded. The measured clone therefore uses that URL, without copying a private key or token to the VMs.

## Method

The three systems run concurrently from a common clone barrier, with the same buffer-11 application binaries, dedicated Titanium SSD placement and resource limits as [the synthetic comparison](FULL_RESULTS.md). Each receives a fresh namespace. Indexing remains enabled. The primary command is a full `git clone https://github.com/dust-tt/dust.git /srv/dfs/mount/files/dust`, including `.git`, history, index-pack and checkout on FUSE. Network transfer is included; this is an end-to-end application workload, not an isolated storage-throughput measurement. No package installation or repository code execution is involved.

Record the clone exit status and elapsed time, and retain stderr and Git Trace2 events. A failed command is an elapsed time to failure, never a successful clone time. Failed or partial checkouts are not used as complete search corpora. Successful clones additionally record the commit, clean Git status and a separate open/fsync/close pass over regular files including `.git`.

For successful clones, an independent native-SSD reference checkout at that exact commit supplies search-output expectations. On a fresh FUSE mount, measure `rg --files`, absent literal, `useEffect`, `dust-tt/dust`, TSX-filtered `useEffect`, and a `front/` subtree search. Report first and median of three warm samples. Every invocation validates its exit status and the sorted output digest against the reference. Search respects Git ignore rules and excludes `.git` by default. It does not search historical Git objects.

After index readiness (ES checkpoint equal to source head, or a complete current-source-validated Tantivy response), measure indexed literal queries for `useEffect`, `dust-tt/dust` and an absent marker, with one first and ten warm samples. Requests include text and current authority/revision validation. Positive queries return the top ten verified matches, not every occurrence; their ranking and output scope differ from exhaustive ripgrep. A final tracked-file hash audit runs outside timed samples. First samples are not globally cold: cloning, indexing, readiness checks and reference preparation precede them.

The [runner](../scripts/iterate.py) and [client workload](../scripts/git-client.py) retain common barrier times, actual phase starts, commands, individual samples and failures. [Architecture choices](ARCHITECTURE_CHOICES.md) explains why large pack files and synchronous lockfile renames can behave differently from buffered small-file extraction.

## Results

### Full clone with `.git` on FUSE

| System | Outcome | Time to command exit (s) |
|---|---|---:|
| RocksDB + Tantivy | Failed (exit 128) | 148.257 |
| 3 FDB + 3 ES | Failed (exit 128) | 394.073 |
| 3 TiKV + 3 ES | Failed (exit 128) | 476.952 |

Failed-command times are times to failure, not completed clone performance. Search is skipped for incomplete checkouts.

RocksDB reached 8,589,925,675 retained bytes against the 8 GiB application quota, while 365,606,854,656 bytes remained available on its SSD. It issued 64,453 synchronous write RPCs, totaling 140.531 seconds of client-observed write RPC time. The growing per-file manifest and retained generations explain why a much smaller live pack can exhaust that quota. [Quota evidence](../results/git-01-rocks-quota.json), [SSD space](../results/git-01-rocks-disk.txt), [mount counters](../results/git-01-rocks-metrics.json), [architecture diagnosis](ARCHITECTURE_CHOICES.md#large-file-metadata-amplification).

- RocksDB + Tantivy: `fatal: write error: Disk quota exceeded`; `fatal: fetch-pack: invalid index-pack output`
- 3 FDB + 3 ES: `fatal: write error: Disk quota exceeded`; `fatal: fetch-pack: invalid index-pack output`
- 3 TiKV + 3 ES: `fatal: write error: Disk quota exceeded`; `fatal: fetch-pack: invalid index-pack output`

| System | Synchronous write RPCs | Summed write RPC time (s) | Buffered publications |
|---|---:|---:|---:|
| RocksDB + Tantivy | 64,453 | 140.531 | 13 |
| 3 FDB + 3 ES | 49,672 | 386.049 | 13 |
| 3 TiKV + 3 ES | 51,109 | 468.475 | 13 |

All `clone.successful` fields are false in this trial. The top-level `passed` field in git-01 records describes completion of the diagnostic driver, including its failed-clone branch; it does not certify clone success. Write RPC totals include protocol encoding, retries and network time; they are not physical database round-trip counts.

### Full-history transfer to native SSD; working tree on FUSE

All three checked out commit `d12961dd26b05e97c0c6145d2e80ea8a0ce776b5`. The validated working tree contains **15,461 regular files** totaling **316,183,460 bytes**, including two symlink placeholders. Git status was clean and all tracked regular-file hashes matched the independent reference.

This is a different workload: `--separate-git-dir` keeps Git objects and its index on the native client SSD; `core.symlinks=false` materializes symlink targets as ordinary text files. A full-history `--no-checkout` clone is followed by checkout of the pinned commit. Total time includes HTTPS transfer and checkout. The synchronization pass covers only the FUSE working tree, not durability of the external Git database.

| System | Clone --no-checkout (s) | Checkout (s) | Combined elapsed (s) | Working-tree open + fsync + close (ms) |
|---|---:|---:|---:|---:|
| RocksDB + Tantivy | 663.761 | 10.079 | 673.840 | 683.66 |
| 3 FDB + 3 ES | 350.208 | 33.628 | 383.837 | 1,087.74 |
| 3 TiKV + 3 ES | 507.614 | 35.519 | 543.133 | 873.43 |

### Repository ripgrep

Milliseconds; first invocation followed by the median of three warm repetitions. Commands report matching paths, not matching lines. Every output digest matches the native reference. The first file-content scan is the absent-literal case, after path enumeration.

| Workload | Phase | RocksDB (ms) | FDB (ms) | TiKV (ms) | FDB / RocksDB | TiKV / RocksDB |
|---|---|---:|---:|---:|---:|---:|
| rg --files (15,176 paths) | first | 114.92 | 142.74 | 115.39 | 1.24× | 1.00× |
| rg --files (15,176 paths) | warm | 60.94 | 78.08 | 61.04 | 1.28× | 1.00× |
| rg absent literal (0 paths) | first | 1,305.63 | 7,802.18 | 5,266.71 | 5.98× | 4.03× |
| rg absent literal (0 paths) | warm | 1,133.75 | 7,821.98 | 4,338.47 | 6.90× | 3.83× |
| rg useEffect (509 paths) | first | 1,277.28 | 7,678.57 | 5,652.87 | 6.01× | 4.43× |
| rg useEffect (509 paths) | warm | 1,249.92 | 7,605.66 | 5,598.39 | 6.08× | 4.48× |
| rg repository literal (43 paths) | first | 1,144.18 | 6,823.58 | 4,866.01 | 5.96× | 4.25× |
| rg repository literal (43 paths) | warm | 1,245.87 | 7,472.13 | 5,670.31 | 6.00× | 4.55× |
| rg TSX useEffect (399 paths) | first | 181.00 | 501.47 | 175.59 | 2.77× | 0.97× |
| rg TSX useEffect (399 paths) | warm | 106.74 | 145.04 | 109.10 | 1.36× | 1.02× |
| rg front subtree (348 paths) | first | 316.53 | 1,065.14 | 845.21 | 3.37× | 2.67× |
| rg front subtree (348 paths) | warm | 211.44 | 262.84 | 228.36 | 1.24× | 1.08× |

### Indexed literal search

Milliseconds including HTTPS, candidate retrieval, current authorization/revision validation and returned text. Positive queries return ten matching documents, while ripgrep reports every matching path; they are not equivalent result sets. Warm is the median of ten repetitions.

| Literal | Phase | RocksDB + Tantivy (ms) | FDB + ES (ms) | TiKV + ES (ms) |
|---|---|---:|---:|---:|
| `useEffect` | first | 5.49 | 203.77 | 202.69 |
| `useEffect` | warm | 2.44 | 175.79 | 168.82 |
| `dust-tt/dust` | first | 2.74 | 183.88 | 179.25 |
| `dust-tt/dust` | warm | 1.91 | 186.48 | 177.70 |
| `DFS_ABSENT_40b5c32e5ff649f18005` | first | 1.85 | 112.87 | 99.07 |
| `DFS_ABSENT_40b5c32e5ff649f18005` | warm | 1.31 | 114.91 | 104.33 |

### Buffered publication during checkout

| System | Buffered publications | Maximum publication age (ms) | 500 ms budget misses |
|---|---:|---:|---:|
| RocksDB + Tantivy | 237 | 178.989 | 0 |
| 3 FDB + 3 ES | 249 | 136.461 | 0 |
| 3 TiKV + 3 ES | 249 | 164.075 | 0 |

These are observed publication ages, not a partition-time visibility guarantee. The working tree is larger than the 256 MiB content cache, unlike the synthetic document corpus; warm full scans can still fetch remote content. Narrow TSX and subtree scans have a smaller working set. The distributed indexed-search implementation also retains sequential candidate validation and per-document text fetches. [Architecture findings and limits of attribution](ARCHITECTURE_CHOICES.md#what-repository-search-adds-to-the-diagnosis).

### Read-path evidence

Counters cover the repository search phase and its final hash audit, not one query. Durations are summed over concurrent calls and are not wall time. Each mount served 240,557 opens and closes with zero mutation RPCs.

| System | Data RPCs | Received chunk bytes (GB, decimal) | Mean data RPC (ms) | Metadata delta RPCs | Mutation RPCs |
|---|---:|---:|---:|---:|---:|
| RocksDB + Tantivy | 164,026 | 3.091 | 0.375 | 50 | 0 |
| 3 FDB + 3 ES | 158,747 | 3.283 | 3.595 | 263 | 0 |
| 3 TiKV + 3 ES | 172,367 | 3.293 | 2.459 | 167 | 0 |

### Evidence

Single concurrent trials; neither repeated fresh-clone confidence intervals nor a globally cold-cache experiment. GitHub transfer latency is included. Application binaries are the tested buffer-11 release. [Source and binary provenance](../results/git-01-source-reference.json).

- git-01: [phase barriers](../results/iterations/git-01/barriers.json), [runtime verification](../results/git-01-runtime.json), [exact client harness](../results/git-01-harness.py).
  - rocks: [result](../results/iterations/git-01/rocks.json), [logs, traces and metrics](../results/iterations/git-01/rocks.tar.gz).
  - fdb: [result](../results/iterations/git-01/fdb.json), [logs, traces and metrics](../results/iterations/git-01/fdb.tar.gz).
  - tikv: [result](../results/iterations/git-01/tikv.json), [logs, traces and metrics](../results/iterations/git-01/tikv.tar.gz).
- git-02: [phase barriers](../results/iterations/git-02/barriers.json), [runtime verification](../results/git-02-runtime.json), [exact client harness](../results/git-02-harness.py).
  - rocks: [result](../results/iterations/git-02/rocks.json), [logs, traces and metrics](../results/iterations/git-02/rocks.tar.gz).
  - fdb: [result](../results/iterations/git-02/fdb.json), [logs, traces and metrics](../results/iterations/git-02/fdb.tar.gz).
  - tikv: [result](../results/iterations/git-02/tikv.json), [logs, traces and metrics](../results/iterations/git-02/tikv.tar.gz).
