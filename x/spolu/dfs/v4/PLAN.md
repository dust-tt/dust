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

## 4. Transaction throughput

Optimize **untar + remaining drain**, preserving the API, fresh transactional authorization, independent
writers and minimal atomic groups. Do not merge sibling creates into a shared transaction. No server
writeback, weaker durability or FDB consistency tuning in this work.

- [x] **Locate serialization.** Measure client ready-queue/envelope waits, server batch/admission/parent
  waits, active FDB transactions, read/commit time and retries. Compare one busy directory with several
  directories; current aggregate group timings include queuing and cannot separate these costs.
- [x] **Keep independent work running.** Parent waiters stay outside transaction admission; bounded
  batches start all groups, ready groups rotate across parents, and capacity returns per outcome.
  Only new groups reserve queue slots. A 32/64/128-group sweep selected 128: total deep 10k completion
  fell from 32.230s to 10.175s. Tests stall a parent/batch tail while unrelated work and fsync complete.
- [x] **Shorten each create transaction.** UUID collision prefetch now overlaps ancestry/name reads;
  the semantic collision check still registers a conflict and preserves error precedence. Real FDB
  tests cover a raced UUID and unauthorized collision. The single-parent diagnostic improved from
  10.475s to 9.276s; untar has no separately established gain from this small change.
- [x] **Evaluate same-parent concurrency last.** Tested bounds 1/2/4 with the deep untar and one/many
  parent diagnostics. Keep the default at one: two/four amplify retries and regress the many-parent
  case. The bounded experiment setting remains available. The separate
  [directory layout proposal](DESIGN-DIRECTORY.md) records the authority/membership split and race
  obligations; no storage layout changed. Adoption requires deterministic two-server race tests.

Run the same deep 10k untar after each step; retain only total-completion wins without correctness
regressions. Validate concurrent clients, same-name collisions, moves, revocations and object fsync.

## Follow-up evaluation

- [ ] Validate and benchmark the proposed directory authority/membership split before adoption.
- [ ] 100k-file and multi-server contention benchmarks, then the separately authorized GCP evaluation.
- [ ] Fault injection for process crashes, lost commit replies, and partitions; no automatic uncertain-write replay.
- [ ] Git workload profiling and metadata-refresh batching beyond the current bounded directory prefetch.
