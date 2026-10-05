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
- [ ] Local deep-subtree untar and filesystem benchmark with cold/warm results and drain.
- [ ] Record commands, configuration, corpus, measurements, and remaining limitations.

## 5. Revision-validated block reuse

- [ ] Finish baseline deep untar + full benchmark at `D = 1000 ms` and `D = 8000 ms`.
- [ ] Retain blocks across snapshot expiry within the existing RAM budget; require a validated
      matching object revision and current authorization before serving them.
- [ ] Test reuse, changed revisions, truncate/extend, permission refresh, and eviction.
- [ ] Commit/push the verified optimization, then rerun untar + the full benchmark at both bounds.
- [ ] Keep all four untar timings and complete tables in `bench/RESULTS.md`, including drain times.

## Local follow-up

- [ ] Retain grant facts across refresh after validating their object revisions.
- [ ] Reusable authority proofs and independently refreshed object bases; same freshness budget.
- [ ] Semantic rebase after a changed target precondition; currently reject the tentative branch.
- [ ] Broader fault/race coverage: late commits, slow fills, FDB outage, remote open-directory moves.
- [ ] 100,000-file corpus comparison.

## Later

- [ ] Networked GCP evaluation after local validation and benchmarking.
