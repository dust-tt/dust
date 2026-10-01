# Cached write evaluation

Measured 2026-09-30 with a native macOS debug server, a Linux Docker FUSE client, and real GCS
(`dust-dev-dfs-poc-spolu-20260930`, isolated test prefixes). Client entry/attribute TTLs remain zero,
direct I/O is enabled, and kernel writeback is disabled. Each run uses fresh workspaces and two
sessions/mounts; extracted files are checked for size and SHA-256 through the second mount.
These are individual development-machine runs, not production capacity or latency guarantees.

## Synchronous versus cached

Same 12 × 4 KiB mounted fixture and current metadata block cache:

| Operation | Synchronous | Cached |
| --- | ---: | ---: |
| Untar | 21.254 s | 0.127 s |
| Edit 4 KiB + fsync | 1.371 s | 0.001 s |

The synchronous timings include remote durability. Cached timings acknowledge server visibility;
the background worker persists later. The cached fixture also validates revocation, rename/delete,
xattrs, sticky failures, unsupported operations, and a remount after a graceful persistence drain.
Storage tests separately kill cached writer processes before and after persistence and inject loss
at upload/WAL boundaries. These validate suffix loss and consistent recovered references/indexes.

## Corpus results with coalescing

Defaults: 256 MiB staging RAM, 4 GiB spill disk, 128 MiB pending metadata accounting, 100 ms persistence
interval, and 16 background uploads. Foreground transfers have their own budget. The benchmark uses
a 300-second shutdown drain timeout, rather than the server default of 60 seconds.

| Measurement | 100 files | 1,000 files |
| --- | ---: | ---: |
| Extracted content | 7,000,350 B | 71,954,144 B |
| Untar | 2.527 s | 41.278 s |
| `ls -lR` | 1.249 s | 22.488 s |
| `find` | 0.056 s | 0.210 s |
| Read and SHA-256 verify all files | 1.563 s | 16.144 s |
| Edit 4 KiB + fsync | 0.002 s | 0.003 s |
| Remaining drain after the above operations | 1.711 s | 2.509 s |
| Uploaded content versions | 102 | 1,014 |
| Coalesced intermediate versions | 778 | 7,982 |
| Uploaded content bytes | 7,012,756 B | 90,949,462 B |
| Content upload amplification | 1.001× | 1.264× |
| Sampled staging RAM peak | 26,834,718 B | 104,920,542 B |
| Sampled spill disk peak | 0 B | 0 B |

All requested mutations reached durable storage before successful shutdown. Drain time is the
backlog remaining **after reads and verification**, not the time from untar completion to durability.
Staging measurements are payload-accounting samples, not process RSS or guaranteed exact peaks;
metadata, page-map overhead, transfer buffers, TLS, and runtime memory are additional. Disk spill
and capacity rejection are covered by targeted tests, but these workloads fit the RAM budget.

Amplification is summed logical content bytes uploaded in completed persistence batches divided by
extracted bytes plus the 4 KiB edit. It excludes SlateDB WAL/SST/compaction writes, HTTP overhead,
temporary-object copies for multipart uploads, and transport retries. Thus it is not total GCS I/O.
The 1,000-file run overlapped briefly with the smaller mounted verification fixture.

Before coalescing, the 100-file run with the same 16-upload limit took 3.099 s to extract and still
needed 46.937 s to drain after verification. Coalescing removes most redundant content work; it does
not remove per-operation network/metadata costs. The slow `ls -lR` result remains a performance target.

## What a version means

The file's object UUID stays stable. Each accepted content edit creates a fresh content-version UUID
for an immutable snapshot; rename, chmod, MIME, and xattr changes do not create content versions.

- **Local:** Versions share unchanged 64 KiB pages in RAM/disk. Small edits copy touched pages, not
  the entire file. Read snapshots/streams pin selected versions across overwrites and retirement.
- **Persistence selection:** After the interval, the worker captures a contiguous prefix of up to
  4096 mutations and merges its rows. Only blobs referenced by final object rows are uploaded.
  Intermediate versions and create-then-delete content can disappear without ever reaching GCS.
- **GCS:** Each selected version is still one full immutable file object under
  `blobs/v1/<workspace-hex>/<object-id>/<content-version-id>`. Local pages are not individual GCS
  objects. Large transfers may use temporary multipart objects before create-only finalization.
- **SlateDB:** Current object/version pointers, directory entries, attributes, grant indexes, every
  request receipt, and every change event persist atomically after required blobs exist. SlateDB's
  own WAL/SST/manifest objects live under `metadata/` in the same GCS prefix. File bytes never enter it.

For queued writes `v1 → v2 → v3`, one batch can upload only `v3`. Receipts for all three writes remain;
they describe original results, not a historical content-reading API. If `v1` was already selected by
an earlier persistence batch, that upload can still complete and a later batch uploads `v3` in full.

Consequently, repeatedly editing a large file across persistence batches still uploads full snapshots.
Persistent chunking/deltas are not implemented. Previously uploaded versions are retained because
blob reclamation (section 8) is deferred. Metadata also retains receipts/events per operation and has
SlateDB's own write amplification. Fsync does not wait for any of this background durability work.

## Reproduce

Build the server and Linux client as described in [the FUSE guide](../fuse/README.md), with working ADC.
Run these commands from `x/spolu/dfs/v0`:

```sh
RUSTC_WRAPPER= cargo build --locked -p dfs-server --bin dfs-server --example local_server
python3 tests/fuse_e2e.py --bucket dust-dev-dfs-poc-spolu-20260930
python3 tests/fuse_e2e.py --write-mode cached --bucket dust-dev-dfs-poc-spolu-20260930
python3 bench/cache.py --write-mode cached
python3 ../bench/generate.py --files 1000
python3 bench/cache.py --archive ../bench/corpus-1000.tar.gz
```

`bench/cache.py` prints a report directory with JSON timings and server progress logs. It deletes only
its unique GCS test prefix after a completed measurement, including an explicitly reported incomplete
drain. Failed runs retain their prefix for inspection. Credentials are removed from retained reports.
No existing development server, mount, or storage prefix is reused.
