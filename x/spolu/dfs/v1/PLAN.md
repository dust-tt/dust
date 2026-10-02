# Implementation

## Uncached baseline

- [x] Shared gRPC schema, validation, errors, and buildable Rust workspace.
- [x] SlateDB setup, configurable caches, cold startup, block reads/writes and atomic metadata.
- [x] Workspace/session authority, inherited grants, dual indexes, root and /shared projection.
- [x] Per-object version checks for namespace edits, attributes, writes, append, truncate, deletion, and fsync (no global/workspace version).
- [x] Real SlateDB tests for isolation, conflicts, concurrent writers, and durable cold reopen.
- [x] Process-crash recovery and cancellation/session-close/revocation race tests.
- [x] Runnable gRPC server, thin async/blocking client, operator CLI, and real transport test.
- [x] Linux FUSE adapter.
- [x] Real gRPC and two-mount filesystem tests, including grants, revocation, and version conflicts.
- [x] Cold GCS benchmark using jd's unchanged corpus/workloads; foreground and drain measurements.
- [x] Usage documentation, results, contract review, formatting, and native/Linux checks.

## Client caching (server unchanged)

- [x] Kernel attribute/entry caching, including negative lookups, root, and shared; `readdirplus`
  reuses list attributes. No freshness timers, authorization expiry, or periodic version polling.
- [x] Bounded metadata/version state, shared file inodes, visible directory parents, and targeted
  invalidation for local mutations. Serialize namespace changes against in-flight fills.
- [x] Kernel page and directory caches, pages retained across opens, and kernel writeback. Buffered
  writes can acknowledge client RAM; fsync confirms server visibility and reports deferred failures.
- [x] Preserve base versions and first writeback errors across handles. Never refresh/retry dirty
  pages after a failure; recover through inode reclamation or remount. Keep unlink-to-ENOENT.
- [x] Support write-only partial-page reads and positioned kernel append writes; rely on kernel
  ordering for writeback/truncate. Reuse returned metadata and remove redundant close/stat RPCs.
- [x] Configurable bounded read-ahead, asynchronous reads, and background concurrency. Collect FUSE
  callback/RPC counts and RPC timings; keep the server and schema unchanged.
- [x] Update design, contracts, documentation, and native adapter tests.
- [ ] Run updated two-mount Linux tests: cached access after edits/revocation, authorized misses,
  remote unlink/deferred failure, local invalidations, conflicts across handles, partial-page writes,
  append, truncate, and fsync/close error propagation. Native checks do not validate kernel behavior.
- [ ] Run jd's benchmark as **dfs v1 [client optimization]** and publish results in `bench/RESULTS.md`.
  Start with fresh server/client caches, then warm repeats; record cache settings and FUSE/RPC counts.
  Measure foreground latency, client writeback to server visibility, and remaining SlateDB drain
  separately. Finish client writeback before measuring persistence drain.

Linux mount validation and benchmarking currently require Docker access outside the restricted
execution sandbox.
