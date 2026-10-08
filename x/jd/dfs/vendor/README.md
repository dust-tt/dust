# Filesystem / VFS benchmark

Generates a disposable tree of **10,000 UTF-8 text documents**: 10 directories at each
of 10 depths (10 independent ten-deep branches). Each directory has a seeded random
60–140 documents. Each document is roughly 18 KB (about 180 MB total) by default. Lorem-ipsum
filler and known search markers are deterministic for
a given seed. `manifest.json` records each path, expected size, SHA-256 digest,
and exact tail bytes for sampled reads outside `docs/`, so the searchable tree
contains only text files. The corpus is not committed.

Requires Python 3.10+ and `rg` (ripgrep) on `PATH`.

```sh
cd x/jd/filesystem-benchmark
python3 generate.py corpus --seed 42
python3 benchmark.py corpus --warm-runs 3
python3 -m unittest test_benchmark.py
```

Use `--filler-lines 1024` when generating a new corpus to make documents about
four times larger; the manifest records the choice. Marker line numbers stay fixed.

Mount or copy the **same** generated `docs/` and `manifest.json` into each VFS,
then run the benchmark against each mount. It prints ASCII tables to stdout:
the running Python and ripgrep versions (with executable paths) and OS kernel,
then workload times. Each workload label includes the number of files, paths,
or bytes involved; there is no throughput column. It exits nonzero if a check fails.
The feature-oriented workloads are run in this order:

| Feature | Workload | What it exercises |
| --- | --- | --- |
| Metadata | `scandir` + `stat` tree | Directory enumeration and attribute lookup across all depths. |
| Metadata | `rg --files` | Ripgrep traversal and file discovery. |
| Metadata | `open` + `fstat` + `close` | Per-file open and descriptor metadata, without reading content. |
| Metadata | `stat` missing paths | Negative lookup and negative-dentry caching at 256 sampled document locations. |
| Page cache | `rg` no-match full scan | Forces a full read of every document; first vs repeated scan. |
| Search | `rg` rare literal | Selective match reporting with exact path checks. |
| Path pruning | `rg` branch glob and depth-10 subtree | Glob filtering vs explicit deep-directory search. |
| Page cache | `open` + full read + SHA-256 | Sequential reads with digest comparison to the manifest. |
| Random I/O | `open` + `pread` tail | 256 deterministic files read at nonzero offsets. |
| Write/file sync | Create/write, file `fsync`, close, unlink | 32 separate 32 KiB files; measures each stage separately and verifies contents. |

Each read-only workload runs once as `first`, then `--warm-runs` times as `warm`
(the median is reported). `first` means *first measured invocation of that workload*;
it does **not** guarantee a cold kernel, client, or server cache. Start with a fresh
mount/process and, if needed, clear external caches yourself to compare cold behavior.
Workloads share one mount and run in the documented order, so later ones inherit
earlier cache effects. For read-only mounts, pass `--skip-writes`. Writes use a
temporary directory inside `docs/`, created only after all reads and removed on exit.
The `fsync` result measures file-fsync latency only. It does not sync the scratch
directory or demonstrate that new filenames survive a crash.

The manifest is the trusted reference: search results, file sizes, SHA-256 hashes
for every document, exact bytes for sampled `pread` tails, and scratch writes are
checked. The full-read workload hashes the bytes it actually read *during* the
timed pass; only comparison with the manifest happens afterward. Its timing
therefore includes hashing CPU time. Keep the original manifest
unchanged when copying the corpus between mounts. Older corpora without integrity
metadata must be regenerated into a new directory.
Run the generator with a **new** output directory for each seed or run.
