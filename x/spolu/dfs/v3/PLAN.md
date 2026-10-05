# v3 implementation

Local first. Do not deploy or benchmark on GCP until the local system works and is measured.
Keep v1/v2 unchanged. Commit and push each verified milestone.

## 1. Local foundation

- [x] Independent Rust workspace, dfs.v3 protocol, tenant terminology, version-free client.
- [x] Isolated Docker FDB and Linux FUSE environment; native FDB defaults, no ES.
- [x] Formal cache, transaction, isolation, and RAM-fsync contracts.

## 2. Filesystem and server cache

- [ ] Reuse namespace, sparse blocks, xattrs, grants, and dual-index /shared semantics.
- [ ] Bounded coherent cached views, parent/grant facts, hinted refresh, absolute expiry.
- [ ] Atomic RAM acceptance and object-scoped coalescing; namespace participant barriers.
- [ ] FDB publication, dependency validation, definite-conflict recovery, ambiguous-outcome errors.
- [ ] Fixed publication deadlines, admission limits, invalidation, RAM fsync, cold recovery.

## 3. Uncached FUSE

- [ ] Direct I/O, zero name/attribute TTL, no writeback or userspace data/xattr cache.
- [ ] Projection-aware inodes, fresh directory pages/cookies/EOF, server-side append.
- [ ] CLI, local startup/mount instructions, and meaningful mounted filesystem checks.

## 4. Local validation and first benchmark

- [ ] Real FDB tests: two servers, tenant/grant isolation, /shared, namespace and block races.
- [ ] RAM fsync, rollback, publication deadlines, cache expiry, and restart tests.
- [ ] Local deep-subtree untar and filesystem benchmark with cold/warm results and drain.
- [ ] Record commands, configuration, corpus, measurements, and remaining limitations.

## Later

- [ ] Networked GCP evaluation after local validation and benchmarking.
