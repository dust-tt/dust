# Benchmark results

Wall-clock times in seconds. Search rows use `rg -l -F PATTERN . | wc -l`; match counts are files.
macOS search times use the reported `rg` total; Docker search times use the pipeline's `real` time.
Raw output, including CPU timings, is preserved below.

| Requested files | Operation / search pattern | macOS native (s) | GCSFuse in Docker (s) | Matches: macOS / GCS | GCS / macOS |
| ---: | --- | ---: | ---: | ---: | ---: |
| 10,000 | Extract (`tar -xzf`) | 1.669 | 1,135.939 — interrupted | — | — |
| 10,000 | `benchmarkcommon` | 0.307 | 41.081 | 10,000 / 2,646 | — |
| 10,000 | `benchmarkmedium` | 0.226 | 5.185 | 1,000 / 265 | — |
| 10,000 | `benchmarkrare` | 0.200 | 1.365 | 100 / 27 | — |
| 10,000 | `benchmarkneedle` | 0.198 | 4.477 | 10 / 3 | — |
| 100 | Extract (`tar -xzf`) | 0.049 | 73.627 | — | ≈1,503× |
| 100 | `benchmarkcommon` | 0.016 | 7.044 | 100 / 100 | ≈440× |
| 100 | `benchmarkmedium` | 0.013 | 6.595 | 10 / 10 | ≈507× |
| 100 | `benchmarkrare` | 0.012 | 5.185 | 1 / 1 | ≈432× |
| 100 | `benchmarkneedle` | 0.010 | 5.680 | 1 / 1 | ≈568× |
| 100 | Delete (`rm -rf corpus`) | 0.014 | 33.569 | — | ≈2,398× |

**Partial 10,000-file run:** GCS extraction was interrupted after 18m55.939s, having created only
about 2,700 small files. The subsequent GCS searches used that partial corpus and returned 2,646
matches for `benchmarkcommon`; macOS used all 10,000 files. Ratios are therefore shown only for
the complete 100-file runs. These are individual measurements; cache state was not recorded.

# Raw: Benchmark Results 10000 (partial)

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
