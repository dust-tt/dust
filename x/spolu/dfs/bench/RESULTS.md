# Benchmark Results

## `tar -xzf`

```
time tar -xzf /tmp/corpus.tar.gz
```
10,000 files, 1 KiB–4 MiB each, totaling 661.8 MiB, compressed to 233.5 MiB

### MacOSX native

tar -xzf corpus.tar.gz  0.58s user 1.01s system 95% cpu 1.669 total

### GCSFuse under Docker

10mn+

## tg

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
