# Search implementation

Implement [DESIGN-SEARCH.md](DESIGN-SEARCH.md) in milestones; commit and push each completed group.

## 1. API and indexing obligations

- [ ] Add bounded protobuf search filters, hits, and workspace-authorized status; wire Rust clients/CLI.
- [ ] Define contracts for live authorization, per-request caches, durable indexing, and replay.
- [ ] Add atomic coalescing pending work to every file mutation, including replacement/deletion.
- [ ] Test that rejected mutations enqueue nothing and newer pending work survives old completions.

## 2. Embedded LanceDB and background processing

- [ ] Pin the OSS Rust dependency; configure GCS/local search storage, bounded shared caches/handles.
- [ ] Implement file rows, byte-exact xattr labels, text extraction limits, FTS and scalar indexes.
- [ ] Implement one in-process worker with bounded batches, durable snapshots, and ordered upsert/delete.
- [ ] Persist completion/failure status, fair retry scheduling, and resumable initial/rebuild backfills.
- [ ] Integrate startup/shutdown, index maintenance, and progress metrics without blocking fsync.
- [ ] Verify actual LanceDB insert/update/delete, new terms, skipped content, and crash/replay boundaries.

## 3. Authorized search

- [ ] Compile typed filters into LanceDB expressions; reject invalid or unbounded requests.
- [ ] Search a pinned table version, expand candidates, and report candidate/time budget exhaustion.
- [ ] Recheck object versions and current grants with bounded per-search metadata/permission caches.
- [ ] Return stable URIs, current metadata, basename, and bounded excerpts; expose no hidden ancestry.
- [ ] Test grants, moves, revocation, sessions, cross-workspace isolation, filters, and stale rows.
- [ ] Test real gRPC search/status and preserve existing filesystem/client behavior.

## 4. End-to-end validation and benchmark

- [ ] Run native Rust checks and Linux FUSE regression tests with indexing enabled.
- [ ] Add a reproducible search benchmark using jd's unchanged 10,000-file corpus and real GCS.
- [ ] Measure indexing time/drain, cold searches after restart, warm repeats, metadata/xattr filters,
      and selective permissions; verify expected hits and record cache state and raw measurements.
- [ ] Publish cold/warm results, usage instructions, and any measured limitations.
- [ ] Audit the complete implementation against the design and contracts; mark only verified work done.
