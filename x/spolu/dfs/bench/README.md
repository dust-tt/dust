# Filesystem search corpus

Generate a reproducible corpus with Python's standard library:

```sh
python3 x/spolu/dfs/bench/generate.py
```

The script writes `corpus.tar.gz` beside itself, containing exactly 10,000 text files:

| Group | Files | Size per file |
| --- | ---: | ---: |
| Small | 8,000 | 1–8 KiB |
| Medium | 1,800 | 32–128 KiB |
| Large | 200 | 1–4 MiB |

Sizes are sampled uniformly within each group, for roughly 675 MiB of uncompressed text. Files
contain randomized extended lorem ipsum and English vocabulary in short, 6–12 word sentences.
The generator samples fresh word combinations throughout each file instead of repeating a fixed
lorem ipsum block. The last sentence may be truncated to reach the exact byte size.

Files are grouped under `corpus/{small,medium,large}/NN/`, with 100 files per directory. Each file
has a unique `document-id: doc-NNNNN`. Known search phrases appear once in each matching file, with
their placement rotating between the beginning, middle, and end:

| Literal phrase | Matching files |
| --- | ---: |
| `benchmarkcommon lorem ipsum dolor sit amet` | 10,000 |
| `benchmarkmedium amber lantern silent harbor` | 1,000 |
| `benchmarkrare cobalt heron violet meadow` | 100 |
| `benchmarkneedle quartz zephyr velvet compass` | 10 |
| `benchmarkmissing` | 0 |

The default seed is `42`; change it with `--seed`. Use `--output /path/to/corpus.tar.gz` to choose
another output location. The generator holds only one file's content at a time and writes entries
directly into the tarball. No intermediate files are left on disk. Archive timestamps and ownership
are fixed so repeated runs with the same seed and Python/zlib versions produce identical bytes.

Extract and try ripgrep:

```sh
cd x/spolu/dfs/bench
tar -xzf corpus.tar.gz

rg --no-ignore -l -F 'benchmarkneedle quartz zephyr velvet compass' corpus | wc -l
rg --no-ignore -l -F 'benchmarkrare cobalt heron violet meadow' corpus | wc -l
rg --no-ignore -l -F 'benchmarkmedium amber lantern silent harbor' corpus | wc -l
rg --no-ignore -l -F 'benchmarkcommon lorem ipsum dolor sit amet' corpus | wc -l
rg --no-ignore -n -i 'lorem.{0,40}ipsum' corpus
rg --no-ignore -l 'benchmarkmissing' corpus
```

`--no-ignore` includes the generated corpus despite its `.gitignore` entry. The final command has
no matches and exits with status 1. Both the tarball and the extracted `corpus/` directory are ignored.
