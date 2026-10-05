# Search implementation

Implement [DESIGN-SEARCH.md](DESIGN-SEARCH.md) in milestones; commit and push each completed group.

## 1. API and indexing obligations

- [x] Add bounded protobuf search filters, hits, and workspace-authorized status; wire Rust clients/CLI.
- [x] Define contracts for live authorization, per-request caches, durable indexing, and replay.
- [x] Add atomic coalescing pending work to every file mutation, including replacement/deletion.
- [x] Test that rejected mutations enqueue nothing and newer pending work survives old completions.

## 2. Embedded LanceDB and background processing

- [x] Pin the OSS Rust dependency; configure GCS/local search storage, bounded shared caches/handles.
- [x] Implement file rows, byte-exact xattr labels, text extraction limits, FTS and scalar indexes.
- [x] Implement one in-process worker with bounded batches, durable snapshots, and ordered upsert/delete.
- [x] Persist completion/failure status, fair retry scheduling, and resumable initial/rebuild backfills.
- [x] Integrate startup/shutdown, index maintenance, and progress metrics without blocking fsync.
- [x] Verify actual LanceDB insert/update/delete, new terms, skipped content, and crash/replay boundaries.

## 3. Authorized search

- [x] Compile typed filters into LanceDB expressions; reject invalid or unbounded requests.
- [x] Search a pinned table version, expand candidates, and report candidate/time budget exhaustion.
- [x] Recheck object versions and current grants with bounded per-search metadata/permission caches.
- [x] Return stable URIs, current metadata, basename, and bounded excerpts; expose no hidden ancestry.
- [x] Test grants, moves, revocation, sessions, cross-workspace isolation, filters, and stale rows.
- [x] Test real gRPC search/status and preserve existing filesystem/client behavior.

## 4. End-to-end validation and benchmark

- [x] Run native Rust checks and Linux FUSE regression tests with indexing enabled.
- [x] Add a reproducible search benchmark using jd's unchanged 10,000-file corpus and real GCS.
- [x] Measure indexing time/drain, cold searches after restart, warm repeats, metadata/xattr filters,
      and selective permissions; verify expected hits and record cache state and raw measurements.
- [x] Publish cold/warm results, usage instructions, and any measured limitations.
- [x] Audit the complete implementation against the design and contracts; mark only verified work done.

## 5. Indexing and object-cache optimization

- [x] Finish backfill before consuming work; enlarge bounded batches and parallelize extraction.
- [x] Defer bulk maintenance until the queue pass ends, with periodic maintenance under sustained load.
- [x] Add phase timings and regression coverage for duplicate work, rebuilds, and exact full batches.
- [x] Add a bounded Arrow object-store read cache for Lance files, discarded at every startup.
- [x] Verify range reads, eviction, cache failures, mutation bypass, isolation, and live grants.
- [x] Rerun the unchanged GCS corpus; preserve the original results and publish the comparison.
