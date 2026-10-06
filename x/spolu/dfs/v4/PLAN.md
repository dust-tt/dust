# v4 implementation

Local implementation, followed by evaluation on the existing dust-dev nodes.
Preserve v1–v3; commit and push each verified milestone.

## 1. Direct FDB server

- [x] Independent Rust workspace, protocol, and local FDB/FUSE fixture.
- [x] Durable minimal-object transactions, client-assigned create IDs, exposed object revisions.
- [x] Batched mutation groups with independent streamed outcomes and transactional authorization.
- [x] Conditional block reads, bounded metadata refresh and full-attribute directory pages.
- [x] Real FDB tests for atomicity, isolation, grants, concurrency, and independent batch failures.
- [x] Bounded server ancestry/grant hints without TTLs; fresh parallel FDB validation and stale fallback.

## 2. Client cache and writeback

- [x] Accounted cache including FUSE identities/cursors, bounded queues and backpressure (512 MiB default).
- [x] One-second metadata/name/authorization validity; version-validated retained blocks.
- [x] Object-scoped async coalescing, namespace dependencies, create plus initial-write bundling.
- [x] Object-only fsync, deferred failures, coherent local reads, orderly shutdown drain.
- [x] Bounded directory attribute prefetch; direct I/O and zero kernel cache TTLs.
- [x] Fresh listing ranges and new-directory absence checks, preserving TTLs across local edits.
- [x] Independent TTLs for tentative objects; overlay-aware expiry without forcing queued publication.
- [x] Validate refresh races, transactional failures and postcommit response reuse; repeat the 10k untar.
- [x] Share one budget across clean/dirty state; remove the dirty cap and validate memory pressure.
- [x] Reduce the default shared budget from 1 GiB to 512 MiB, including the 96 MiB transient reserve.
- [x] Repeat the 10k untar at 512 MiB: 6.140s foreground + 4.710s drain; negligible memory admission wait.
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
  parent diagnostics. The unsplit record favored
  serialization: two/four amplified retries and regressed the many-parent case. This motivated the
  directory split below.

Run the same deep 10k untar after each step; retain only total-completion wins without correctness
regressions. Validate concurrent clients, same-name collisions, moves, revocations and object fsync.

## 5. Directory records

- [x] Split directory core and mutable revision/timestamps; preserve wire API and file layout.
- [x] Blindly replace parent state without rewriting authority cores.
- [x] Schedule creates by new target ID; retain all transaction and admission bounds.
- [x] Test independent and conflicting namespace/grant transactions across two server states.
- [x] Reset local v4 FDB, run mounted checks and compare the deep 10k untar at 512 MiB:
  6.814s + 0.414s drain, versus 6.116s + 3.998s before. All persisted file hashes verified.

## Follow-up evaluation

- [x] Directory-revision membership reuse, independent child-attribute refresh, and demand-driven
  one-page-ahead prefetch. Local/replicated FDB and mounted checks passed; cold GCP open/fstat/close
  fell from 35.921s to 10.348s, with 4,975 → 474 workload RPCs. See [gcp/RESULTS.md](gcp/RESULTS.md).
- [x] Repeat the full local suite after directory-cache changes: 6.626s untar + 0.437s drain;
  all 24 timed checks passed, final cleanup still failed with `EIO`. New full table in
  [bench/RESULTS.md](bench/RESULTS.md), preserving prior measurements and noting the larger FDB limit.
- [x] Existing dust-dev nodes: latest 10k untar and full filesystem benchmark, with durable drain.
  12.869s untar + 0.479s drain; all 24 timed checks passed, final cleanup failed with `EIO`.
  Full table and profiling: [gcp/RESULTS.md](gcp/RESULTS.md).
- [x] Fix recursive scratch cleanup `EIO`: stabilize directory publication after a raced listing,
  preserve queued overlays and atomically project the response. Real FDB race tests and deep mounted
  cleanup checks pass; the old local/GCP benchmark failures remain recorded as historical results.
- [x] Repeat the full local suite with the cleanup fix: all 24 timed checks and final cleanup pass,
  exit 0; 6.523s untar + 0.450s drain. Full table and diagnosis in [bench/RESULTS.md](bench/RESULTS.md).
- [ ] 100k-file and multi-server contention benchmarks.
- [ ] Fault injection for process crashes, lost commit replies, and partitions; no automatic uncertain-write replay.
- [ ] Git workload profiling and metadata-refresh batching beyond the current bounded directory prefetch.
