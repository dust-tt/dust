# v3 implementation

Local first. Do not deploy or benchmark on GCP until the local system works and is measured.
Keep v1/v2 unchanged. Commit and push each verified milestone.

## 1. Local foundation

- [x] Independent Rust workspace, dfs.v3 protocol, tenant terminology, version-free client.
- [x] Isolated Docker FDB and Linux FUSE environment; native FDB defaults, no ES.
- [x] Formal cache, transaction, isolation, and RAM-fsync contracts.

## 2. Filesystem and server cache

- [x] Reuse namespace, sparse blocks, xattrs, grants, and dual-index /shared semantics.
- [x] Bounded coherent cached views, parent/grant facts, hinted refresh, absolute expiry.
- [x] Atomic RAM acceptance and object-scoped coalescing; namespace participant barriers.
- [x] FDB publication, dependency validation, definite retry or rejection, ambiguous-outcome errors.
- [x] Fixed publication deadlines, admission limits, invalidation, RAM fsync, cold recovery.

## 3. Uncached FUSE

- [x] Direct I/O, zero name/attribute TTL, no writeback or userspace data/xattr cache.
- [x] Projection-aware inodes, fresh directory pages/cookies/EOF, server-side append.
- [x] CLI, local startup/mount instructions, and meaningful mounted filesystem checks.

## 4. Local validation and first benchmark

- [x] Real FDB tests: two servers, tenant/grant isolation, /shared, namespace and block races.
- [x] RAM fsync, rollback, publication deadlines, cache expiry, and cold recovery tests.
- [x] Create + initial-write bundling, separate sibling transactions, capacity before acknowledgment.
- [x] Lost commit reply: report deferred failure and reload without replay; independent writes continue.
- [x] Local deep-subtree untar and filesystem benchmark with cold/warm results and drain.
- [x] Record commands, configuration, corpus, measurements, and remaining limitations.

## 5. RAM access optimization (priority)

Completed and verified before resuming the full benchmark suites below.

- [x] Attribute the longer-window slowdown with client/server/FDB profiles.
- [x] Index key history and file-scoped clears; pin sequence cuts without copying the journal.
- [x] Index local conflict checks and pending participants; retire history incrementally.
- [x] Skip speculative warming of hot base cells without bypassing semantic validation.
- [x] Skip hint construction for hot objects; borrow lookup keys and avoid duplicate ancestor decoding.
- [x] Retry definite publication conflicts within the original deadline; preserve all preconditions.
- [x] Test pinned point/range views, truncation ordering, and stale local acceptance against FDB.
- [x] Verify mounted behavior and compare focused 1s/8s untar CPU profiles before another suite.

## 6. Revision-validated block reuse

- [x] Finish baseline deep untar + full benchmark at `D = 1000 ms` and `D = 8000 ms`.
- [x] Profile why untar is slower at 8s before attributing the difference to mutation-history scans.
- [x] Rerun both full baselines with client/server/FDB timing breakdowns; preserve original results.
- [x] Retain blocks across snapshot expiry within the existing RAM budget; require a validated
      matching object revision and current authorization before serving them.
- [x] Test reuse, changed revisions, truncate/extend, permission refresh, and eviction.
- [x] Commit/push the verified optimization, then rerun untar + the full benchmark at both bounds.
- [x] Keep all four untar timings and complete tables in `bench/RESULTS.md`, including drain times.
- [x] Compare like-for-like profiled runs and retain block reuse only if measurements improve.
- [x] Record the latest client/server/FDB timing breakdown for both bounds.

## 7. Create and directory-listing optimizations

- [x] Reuse create response metadata only within that FUSE callback; preserve fresh ordinary opens.
- [x] Test handle modes and mounted behavior; benchmark 10k untar at both bounds and decide.
- [x] Use scanned child IDs and bounded concurrent metadata reads within each listing snapshot.
- [x] Test pagination, namespace changes, and grants; benchmark listings at both bounds and decide.
- [x] Record separate comparisons and retain only justified changes; commit and push each milestone.

## 8. Networked GCP evaluation

- [x] Reuse the existing dust-dev nodes and native FDB configuration; isolate v3 builds and reports.
- [x] Build and test natively on the workload VM; validate mounts at both freshness bounds.
- [x] Run the full 10k untar/filesystem benchmark sequentially at 1s and 8s.
- [x] Record both tables, drain, profiles, and topology; restore the interactive v2 services.

## Local follow-up

- [ ] Retain grant facts across refresh after validating their object revisions.
- [ ] Reusable authority proofs and independently refreshed object bases; same freshness budget.
- [ ] Semantic rebase after a changed target precondition; currently reject the tentative branch.
- [ ] Broader fault/race coverage: late commits, slow fills, FDB outage, remote open-directory moves.
- [ ] 100,000-file corpus comparison.
