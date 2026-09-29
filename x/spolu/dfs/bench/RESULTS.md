# Benchmark results

Wall-clock times in seconds. Search rows use `rg -l -F PATTERN . | wc -l`; match counts are files.
macOS search times use the reported `rg` total; Docker and VM search times use the pipeline's `real` time.
Raw output, including CPU timings, is preserved below.

| Requested files | Operation / search pattern | macOS native (s) | GCSFuse in Docker (s) | Filestore from VM (s) | Matches: macOS / GCS / Filestore | GCS / macOS | Filestore / macOS |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | Extract (`tar -xzf`) | 1.669 | 1,135.939 — interrupted | 163.836 | — | — | ≈98× |
| 10,000 | `benchmarkcommon` | 0.307 | 41.081 | 28.482 | 10,000 / 2,646 / 10,000 | — | ≈93× |
| 10,000 | `benchmarkmedium` | 0.226 | 5.185 | 13.214 | 1,000 / 265 / 1,000 | — | ≈58× |
| 10,000 | `benchmarkrare` | 0.200 | 1.365 | 4.808 | 100 / 27 / 100 | — | ≈24× |
| 10,000 | `benchmarkneedle` | 0.198 | 4.477 | 4.003 | 10 / 3 / 10 | — | ≈20× |
| 100 | Extract (`tar -xzf`) | 0.049 | 73.627 | 1.906 | — | ≈1,503× | ≈39× |
| 100 | `benchmarkcommon` | 0.016 | 7.044 | 0.366 | 100 / 100 / 100 | ≈440× | ≈23× |
| 100 | `benchmarkmedium` | 0.013 | 6.595 | 0.119 | 10 / 10 / 10 | ≈507× | ≈9.2× |
| 100 | `benchmarkrare` | 0.012 | 5.185 | 0.055 | 1 / 1 / 1 | ≈432× | ≈4.6× |
| 100 | `benchmarkneedle` | 0.010 | 5.680 | 0.054 | 1 / 1 / 1 | ≈568× | ≈5.4× |
| 100 | Delete (`rm -rf corpus`) | 0.014 | 33.569 | 0.421 | — | ≈2,398× | ≈30× |

**Partial 10,000-file run:** GCS extraction was interrupted after 18m55.939s, having created only
about 2,700 small files. The subsequent GCS searches used that partial corpus and returned 2,646
matches for `benchmarkcommon`; macOS and Filestore used all 10,000 files. GCS/macOS ratios are
therefore shown only for the complete 100-file runs; Filestore/macOS ratios cover both corpus sizes.

**Filestore setup:** NFSv3 from an Ubuntu 24.04 `e2-small` VM (2 GiB RAM) in `us-east4-a` to a
100 GiB Regional Filestore instance in `us-east4`, configured for 2,000 IOPS. Ratios compare the
measured environments, including their different client hardware. These are individual measurements;
cache state was not recorded.

# Raw: Benchmark Results 10000 (GCS partial)

## `tar -xzf`

```
time tar -xzf /tmp/corpus-10000.tar.gz
```
10,000 files, 1 KiB–4 MiB each, totaling 661.8 MiB, compressed to 233.5 MiB

### MacOSX native

```
tar -xzf corpus.tar.gz  0.58s user 1.01s system 95% cpu 1.669 total
```

### GCSFuse under Docker

Interrupted after ~20mn+
```
root@5b4cebcb1015:/mnt/gcs/spolu-bench# time tar -xzf /tmp/corpus.tar.gz
^C

real    18m55.939s
user    0m0.435s
sys     0m1.241s
```

Only craeted ~2700 small files

### Filestore from VM

```
spolu@spolu-dfs-bench-vm:/mnt/filestore/spolu-bench$ time tar -xzf corpus-10000.tar.gz

real    2m43.836s
user    0m8.606s
sys     0m5.486s
```

## rg

```
time rg -l -F 'benchmarkcommon' . | wc -l
time rg -l -F 'benchmarkmedium' . | wc -l
time rg -l -F 'benchmarkrare' . | wc -l
time rg -l -F 'benchmarkneedle' . | wc -l
```

### MacOSX native

```
   10000
rg -l -F 'benchmarkcommon' .  0.07s user 1.31s system 447% cpu 0.307 total
wc -l  0.00s user 0.02s system 8% cpu 0.304 total
    1000
rg -l -F 'benchmarkmedium' .  0.05s user 2.15s system 970% cpu 0.226 total
wc -l  0.00s user 0.00s system 2% cpu 0.226 total
     100
rg -l -F 'benchmarkrare' .  0.05s user 2.19s system 1119% cpu 0.200 total
wc -l  0.00s user 0.00s system 1% cpu 0.199 total
      10
rg -l -F 'benchmarkneedle' .  0.05s user 2.16s system 1117% cpu 0.198 total
wc -l  0.00s user 0.00s system 0% cpu 0.197 total
```

### GCSFuse under Docker

2700 files only, not 10k

```
root@5b4cebcb1015:/mnt/gcs/spolu-bench/corpus# time rg -l -F 'benchmarkcommon' . | wc -l
time rg -l -F 'benchmarkmedium' . | wc -l
time rg -l -F 'benchmarkrare' . | wc -l
time rg -l -F 'benchmarkneedle' . | wc -l
2646

real    0m41.081s
user    0m0.157s
sys     0m1.049s
265

real    0m5.185s
user    0m0.063s
sys     0m0.524s
27

real    0m1.365s
user    0m0.029s
sys     0m0.284s
3

real    0m4.477s
user    0m0.045s
sys     0m0.485s

```

### Filestore from VM

```
10000

real    0m28.482s
user    0m0.587s
sys     0m2.270s
1000

real    0m13.214s
user    0m0.358s
sys     0m1.342s
100

real    0m4.808s
user    0m0.272s
sys     0m0.660s
10

real    0m4.003s
user    0m0.233s
sys     0m0.611s
```

# Raw: Benchmark results 100

## `tar -xzf`

```
time tar -xzf /tmp/corpus-100.tar.gz
```

### MacOSX native

```
tar -xzf corpus-100.tar.gz  0.01s user 0.03s system 88% cpu 0.049 total
```

### GCSFuse under Docker

```
time tar -xzf /tmp/corpus-100.tar.gz

real    1m13.627s
user    0m0.062s
sys     0m0.103s
```

### Filestore from VM

```
spolu@spolu-dfs-bench-vm:/mnt/filestore/spolu-bench$ time tar -xzf ~/corpus-100.tar.gz

real    0m1.906s
user    0m0.081s
sys     0m0.069s
```

## rg

### MacOSX native

```
     100
rg -l -F 'benchmarkcommon' .  0.01s user 0.05s system 311% cpu 0.016 total
wc -l  0.00s user 0.00s system 27% cpu 0.015 total
      10
rg -l -F 'benchmarkmedium' .  0.01s user 0.01s system 123% cpu 0.013 total
wc -l  0.00s user 0.00s system 21% cpu 0.012 total
       1
rg -l -F 'benchmarkrare' .  0.00s user 0.03s system 282% cpu 0.012 total
wc -l  0.00s user 0.00s system 20% cpu 0.011 total
       1
rg -l -F 'benchmarkneedle' .  0.00s user 0.03s system 292% cpu 0.010 total
wc -l  0.00s user 0.00s system 20% cpu 0.010 total
```

### GCSFuse under Docker

```
100

real    0m7.044s
user    0m0.049s
sys     0m0.440s
10

real    0m6.595s
user    0m0.048s
sys     0m0.555s
1

real    0m5.185s
user    0m0.024s
sys     0m0.423s
1

real    0m5.680s
user    0m0.066s
sys     0m0.300s
```

### Filestore from VM

```
100

real    0m0.366s
user    0m0.014s
sys     0m0.042s
10

real    0m0.119s
user    0m0.010s
sys     0m0.017s
1

real    0m0.055s
user    0m0.001s
sys     0m0.018s
1

real    0m0.054s
user    0m0.007s
sys     0m0.012s
```

## rm -rf

### MacOSX native

```
rm -rf corpus  0.00s user 0.01s system 86% cpu 0.014 total
```

### GCSFuse under Docker

```
root@5b4cebcb1015:/mnt/gcs/spolu-bench/test# time rm -rf corpus

real    0m33.569s
user    0m0.003s
sys     0m0.023s
```

### Filestore from VM

```
spolu@spolu-dfs-bench-vm:/mnt/filestore/spolu-bench$ time rm -rf corpus

real    0m0.421s
user    0m0.004s
sys     0m0.013s
```

# Filesystem VFS benchmark — 2026-09-29

The corpus is `gs://dust-test-data/dfs-bench/corpus/` (10,000 files, 177.5 MB). The macOS run used
the local copy at `x/jd/filesystem-benchmark/corpus/`; its manifest SHA-256 matches the GCS manifest:
`67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
Both runs use `x/jd/filesystem-benchmark/benchmark.py --warm-runs 1`. A `first` invocation is not
necessarily a cold OS or GCS cache; the `warm` entry is one repeated invocation. These runs use
different Python and ripgrep versions, so wall-clock ratios also include runtime differences.

## macOS native filesystem

```text
Tool versions
+-----------+-----------------------+----------------------------------------------+
| Tool      | Version               | Executable                                   |
+-----------+-----------------------+----------------------------------------------+
| Python    | CPython 3.14.7        | /opt/homebrew/opt/python@3.14/bin/python3.14 |
| ripgrep   | ripgrep 15.2.0        | /opt/homebrew/Cellar/ripgrep/15.2.0/bin/rg   |
| OS kernel | Darwin 25.6.0 (arm64) | -                                            |
+-----------+-----------------------+----------------------------------------------+

Benchmark results
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 153.87    | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 166.10    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 14.32     | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 12.92     | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 227.17    | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 191.40    | OK     |
| metadata     | stat missing (256 paths)                       | first | 1.93      | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.57      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 236.40    | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 203.79    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 187.71    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 192.77    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 72.32     | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 48.80     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 22.26     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 19.36     | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 334.11    | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 321.77    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 5.78      | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 7.07      | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 1.72      | OK     |
| file sync    | fsync (32 files)                               | once  | 1.52      | OK     |
| write        | close (32 files)                               | once  | 0.18      | OK     |
| write        | unlink (32 files)                              | once  | 1.11      | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
First = first measured invocation, not guaranteed cold OS cache; warm = median repeat.
Final result comparisons are outside timings; in-loop checks are included.
Run on a fresh mount for first-touch comparisons.
```

## Docker (OrbStack) + gcsfuse

The container uses image `sha256:148373b79b6c33104967dd56aa9d08ab9c83507e8073e21c4e7678d38c20e15a`
built from `x/spolu/dfs/gcsfuse/Dockerfile`. It mounted the `dfs-bench/corpus` prefix of
`dust-test-data` at `/mnt/gcs` using `gcsfuse --implicit-dirs --only-dir dfs-bench/corpus`.
All workloads passed, including the scratch-object write, file-fsync, close, and unlink tests.
File `fsync` timings do not establish crash-safe directory entries.

```text
gcsfuse version 3.12.0 (Go version go1.27.0)
Tool versions
+-----------+-----------------------------------------------------+------------------+
| Tool      | Version                                             | Executable       |
+-----------+-----------------------------------------------------+------------------+
| Python    | CPython 3.12.3                                      | /usr/bin/python3 |
| ripgrep   | ripgrep 14.1.0                                      | /usr/bin/rg      |
| OS kernel | Linux 7.0.14-orbstack-00380-ga7e0a2dc9535 (aarch64) | -                |
+-----------+-----------------------------------------------------+------------------+

Benchmark results
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 21,517.58  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 11,339.68  | OK     |
| metadata     | rg --files (10,000 files)                      | first | 845.45     | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 685.27     | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 8,133.09   | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 6,783.52   | OK     |
| metadata     | stat missing (256 paths)                       | first | 14,573.08  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 17,608.19  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 54,335.80  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 46,947.81  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 27,389.66  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 40,995.62  | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 1,596.47   | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 4,493.96   | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 345.79     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 432.04     | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 429,601.66 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 471,042.63 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 19,544.84  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 724.18     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 2,104.33   | OK     |
| file sync    | fsync (32 files)                               | once  | 3,138.87   | OK     |
| write        | close (32 files)                               | once  | 420.93     | OK     |
| write        | unlink (32 files)                              | once  | 1,955.41   | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
First = first measured invocation, not guaranteed cold OS cache; warm = median repeat.
Final result comparisons are outside timings; in-loop checks are included.
Run on a fresh mount for first-touch comparisons.
```
