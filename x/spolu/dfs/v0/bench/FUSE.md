# Synchronous dfs FUSE baseline

Measured 2026-09-30: native macOS ARM64 Rust 1.98.1 server, Linux ARM64 Docker FUSE client, eight
blocking workers, `fuser` 0.18. Two live mounts use different grants. Entry/attribute TTLs are zero;
file handles use direct I/O, with kernel mode checks. No dfs server content cache or metadata overlay is enabled. SlateDB,
transport, and OS caches can still be warm. The local fixture also creates/removes 80 long-named
directories to check pagination before these measurements.

GCS bucket: `dust-dev-dfs-poc-spolu-20260930` in `dust-dev`, under a fresh disposable test prefix.
The comparison backend is a local filesystem object store using the same SlateDB/API code. These
are individual wall-clock samples, not a throughput study or a comparison to the larger corpus in
[RESULTS.md](RESULTS.md).

| Operation | Local object store (s) | GCS (s) |
| --- | ---: | ---: |
| Untar twelve 4 KiB files, including create/write/close/attributes | 4.179 | 17.886 |
| Overwrite 4 KiB through an open file, then fsync | 0.080 | 0.572 |
| `ls -la` on twelve files | 0.226 | 0.244 |
| `find` through the shared subtree | 0.019 | 0.019 |
| `cat` one 4 KiB file | 0.009 | 0.166 |
| After crash/restart/remount: `ls -la` | 0.187 | 0.170 |
| After crash/restart/remount: `find` | 0.017 | 0.017 |
| After crash/restart/remount: `cat` 4 KiB | 0.008 | 0.316 |

The harness checks file contents, grants, and invalidation of old sessions after SIGKILL. It deletes
server scratch before restarting. The GCS run recovers using only remote metadata/blobs; the local
comparison retains its object-store directory, which represents the durable backend. Client mounts
and their inode/handle tables are recreated. The smaller restart timings do not imply globally cold
cloud or OS caches.

Each small-file write currently waits for a fresh immutable blob and durable metadata; tar also
issues attribute updates. These timings establish the synchronous baseline before server staging,
asynchronous persistence, and subscriptions. Reproduce with [the mount harness](../fuse/README.md#verification).
