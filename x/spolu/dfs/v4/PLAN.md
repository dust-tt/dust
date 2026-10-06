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

- [x] Accounted 1 GiB cache including FUSE identities/cursors, bounded queues and backpressure.
- [x] One-second metadata/name/authorization validity; version-validated retained blocks.
- [x] Object-scoped async coalescing, namespace dependencies, create plus initial-write bundling.
- [x] Object-only fsync, deferred failures, coherent local reads, orderly shutdown drain.
- [x] Bounded directory attribute prefetch; direct I/O and zero kernel cache TTLs.
- [x] Fresh listing ranges and new-directory absence checks, preserving TTLs across local edits.
- [x] Independent TTLs for tentative objects; overlay-aware expiry without forcing queued publication.
- [x] Validate refresh races, transactional failures and postcommit response reuse; repeat the 10k untar.
- [x] Share one 1 GiB budget across clean/dirty state; remove the dirty cap and validate memory pressure.
- [x] Repeat the 10k untar with shared memory; report foreground time, remaining drain and admission waits.

## 3. Validation and measurements

- [x] Real-network tests for cache expiry/revocation, stalled unrelated RPCs, failed prerequisites, and memory pressure.
- [x] Real FDB concurrent-writer tests and mounted rename, unlink, sparse files, xattrs, fsync, and external-server edits.
- [x] Release build, full local deep-subtree 10k untar and existing filesystem benchmark.
- [x] `bench/RESULTS.md` with the full table, untar, client drain, configuration, and limitations.
- [x] Local run instructions and final design/code-contract consistency review.

## 4. Transaction throughput — proposed

Optimize **untar + remaining drain**, preserving the API, fresh transactional authorization, independent
writers and minimal atomic groups. Do not merge sibling creates into a shared transaction. No server
writeback, weaker durability or FDB consistency tuning in this work.

- [ ] **Locate serialization.** Measure client ready-queue/envelope waits, server batch/admission/parent
  waits, active FDB transactions, read/commit time and retries. Compare one busy directory with several
  directories; current aggregate group timings include queuing and cannot separate these costs.
- [ ] **Keep independent work running.** Stop parent-lock waiters consuming transaction permits and
  filling each batch's 16-worker window. Schedule ready groups across parents fairly; refill client
  capacity as groups complete instead of letting slow envelope tails limit new work. Keep explicit
  group/byte/RPC bounds. The shared-memory run spends 10.121s at the 4,096-group queue limit: acquire
  slots only for new groups (currently every edit reserves one before checking coalescing), and
  distinguish queue-capacity changes from throughput wins. Sweep concurrency after measuring occupancy.
- [ ] **Shorten each create transaction.** Start the new UUID collision read alongside the existing
  ancestry/name prefetch, and remove measured sequential/duplicate reads. Keep all authority and
  uniqueness checks in the same FDB transaction; no root-specific shortcuts.
- [ ] **Evaluate same-parent concurrency last.** Compare serialized creates with a small concurrency
  bound, including retry amplification. Every create currently reads and rewrites the same parent
  record, so removing the mutex alone may only replace waiting with conflicts. If this remains the
  limit, separately design a split between stable directory authority and membership revision/time
  fields; prove create/remove/rename and grant races before changing the storage layout.

Run the same deep 10k untar after each step; retain only total-completion wins without correctness
regressions. Validate concurrent clients, same-name collisions, moves, revocations and object fsync.

## Follow-up evaluation

- [ ] 100k-file and multi-server contention benchmarks, then the separately authorized GCP evaluation.
- [ ] Fault injection for process crashes, lost commit replies, and partitions; no automatic uncertain-write replay.
- [ ] Git workload profiling and metadata-refresh batching beyond the current bounded directory prefetch.
