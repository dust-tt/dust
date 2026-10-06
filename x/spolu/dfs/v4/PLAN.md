# v4 implementation

Local only. Preserve v1–v3; commit and push each verified milestone.

## 1. Direct FDB server

- [x] Independent Rust workspace, protocol, and local FDB/FUSE fixture.
- [x] Durable minimal-object transactions, client-assigned create IDs, exposed object revisions.
- [x] Batched mutation groups with independent streamed outcomes and transactional authorization.
- [x] Conditional block reads, bounded metadata refresh and full-attribute directory pages.
- [x] Real FDB tests for atomicity, isolation, grants, concurrency, and independent batch failures.
- [x] Bounded server ancestry/grant hints without TTLs; fresh parallel FDB validation and stale fallback.

## 2. Client cache and writeback

- [x] Accounted 1 GiB cache including FUSE identities/cursors, 256 MiB dirty cap, bounded queues and backpressure.
- [x] One-second metadata/name/authorization validity; version-validated retained blocks.
- [x] Object-scoped async coalescing, namespace dependencies, create plus initial-write bundling.
- [x] Object-only fsync, deferred failures, coherent local reads, orderly shutdown drain.
- [x] Bounded directory attribute prefetch; direct I/O and zero kernel cache TTLs.
- [x] Fresh listing ranges and new-directory absence checks, preserving TTLs across local edits.
- [x] Independent TTLs for tentative objects; overlay-aware expiry without forcing queued publication.
- [ ] Validate refresh races, transactional failures and postcommit response reuse; repeat the 10k untar.

## 3. Validation and measurements

- [x] Real-network tests for cache expiry/revocation, stalled unrelated RPCs, failed prerequisites, and memory pressure.
- [x] Real FDB concurrent-writer tests and mounted rename, unlink, sparse files, xattrs, fsync, and external-server edits.
- [x] Release build, full local deep-subtree 10k untar and existing filesystem benchmark.
- [x] `bench/RESULTS.md` with the full table, untar, client drain, configuration, and limitations.
- [x] Local run instructions and final design/code-contract consistency review.

## Follow-up evaluation

- [ ] 100k-file and multi-server contention benchmarks, then the separately authorized GCP evaluation.
- [ ] Fault injection for process crashes, lost commit replies, and partitions; no automatic uncertain-write replay.
- [ ] Git workload profiling and metadata-refresh batching beyond the current bounded directory prefetch.
