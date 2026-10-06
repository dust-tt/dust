# v4 implementation

Local only. Preserve v1–v3; commit and push each verified milestone.

## 1. Direct FDB server

- [x] Independent Rust workspace, protocol, and local FDB/FUSE fixture.
- [x] Durable minimal-object transactions, client-assigned create IDs, exposed object revisions.
- [x] Batched mutation groups with independent streamed outcomes and transactional authorization.
- [x] Conditional block reads, bounded metadata refresh and full-attribute directory pages.
- [x] Real FDB tests for atomicity, isolation, grants, concurrency, and independent batch failures.

## 2. Client cache and writeback

- [ ] Accounted 1 GiB cache, 256 MiB dirty cap, bounded queues and backpressure.
- [ ] One-second metadata/name/authorization validity; version-validated retained blocks.
- [ ] Object-scoped async coalescing, namespace dependencies, create plus initial-write bundling.
- [ ] Object-only fsync, deferred failures, coherent local reads, orderly shutdown drain.
- [ ] Bounded directory attribute prefetch; direct I/O and zero kernel cache TTLs.

## 3. Validation and measurements

- [ ] Cache expiry, concurrent writers, failed prerequisites, and memory-pressure tests.
- [ ] Mounted filesystem tests including two clients, grants, rename, unlink, sparse files, and fsync.
- [ ] Release build, full local deep-subtree 10k untar and existing filesystem benchmark.
- [ ] `bench/RESULTS.md` with the full table, untar, client drain, configuration, and limitations.
- [ ] Local run instructions and final design/code-contract consistency review.
