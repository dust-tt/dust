# Filesystem search corpus

Generate a reproducible corpus with Python's standard library:

```sh
python3 x/spolu/dfs/bench/generate.py
python3 x/spolu/dfs/bench/generate.py --files 100
```

The script writes `corpus-<files>.tar.gz` beside itself. `--files` must be positive and defaults to
10,000, producing `corpus-10000.tar.gz`. The second command creates `corpus-100.tar.gz`:

| Group | Files (10,000 total) | Files (100 total) | Size per file |
| --- | ---: | ---: | ---: |
| Small | 8,000 | 80 | 1–8 KiB |
| Medium | 1,800 | 18 | 32–128 KiB |
| Large | 200 | 2 | 1–4 MiB |

The distribution is 80% small, 18% medium, and 2% large. Counts are rounded down, with remaining
files assigned to the small group. Sizes are sampled uniformly within each group, for roughly
675 MiB of uncompressed text with 10,000 files. Files contain randomized extended lorem ipsum and
English vocabulary in short, 6–12 word sentences.
The generator samples fresh word combinations throughout each file instead of repeating a fixed
lorem ipsum block. The last sentence may be truncated to reach the exact byte size.

Files are grouped under `corpus/{small,medium,large}/NN/`, with up to 100 files per directory. Each file
has a unique `document-id: doc-NNNNN`. Known search phrases appear once in each matching file, with
their placement rotating between the beginning, middle, and end:

| Literal phrase | Matches (10,000 files) | Matches (100 files) |
| --- | ---: | ---: |
| `benchmarkcommon lorem ipsum dolor sit amet` | 10,000 | 100 |
| `benchmarkmedium amber lantern silent harbor` | 1,000 | 10 |
| `benchmarkrare cobalt heron violet meadow` | 100 | 1 |
| `benchmarkneedle quartz zephyr velvet compass` | 10 | 1 |
| `benchmarkmissing` | 0 | 0 |

The default seed is `42`; change it with `--seed`. Use `--output /path/to/corpus.tar.gz` to choose
another output location. The generator holds only one file's content at a time and writes entries
directly into the tarball. No intermediate files are left on disk. Archive timestamps and ownership
are fixed so repeated runs with the same file count, seed, and Python/zlib versions produce
identical bytes.

Extract and try ripgrep. Use a fresh extraction directory when switching corpus sizes so files
from a previous archive do not remain:

```sh
cd x/spolu/dfs/bench
tar -xzf corpus-10000.tar.gz

rg --no-ignore -l -F 'benchmarkneedle quartz zephyr velvet compass' corpus | wc -l
rg --no-ignore -l -F 'benchmarkrare cobalt heron violet meadow' corpus | wc -l
rg --no-ignore -l -F 'benchmarkmedium amber lantern silent harbor' corpus | wc -l
rg --no-ignore -l -F 'benchmarkcommon lorem ipsum dolor sit amet' corpus | wc -l
rg --no-ignore -n -i 'lorem.{0,40}ipsum' corpus
rg --no-ignore -l 'benchmarkmissing' corpus
```

`--no-ignore` includes the generated corpus despite its `.gitignore` entry. The final command has
no matches and exits with status 1. Both the tarball and the extracted `corpus/` directory are ignored.
