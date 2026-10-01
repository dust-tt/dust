# Implementation

- [x] Shared gRPC schema, validation, errors, and buildable Rust workspace.
- [x] SlateDB setup, configurable caches, cold startup, block reads/writes and atomic metadata.
- [x] Workspace/session authority, inherited grants, dual indexes, root and /shared projection.
- [x] Versioned namespace, attributes, writes, append, truncate, deletion, and fsync.
- [x] Real SlateDB tests for isolation, conflicts, concurrent writers, and durable cold reopen.
- [ ] Process-crash recovery and cancellation/session-close race tests.
- [ ] gRPC server, thin client, operator CLI, and Linux FUSE adapter.
- [ ] Real gRPC and two-mount filesystem tests, including grants, revocation, and version conflicts.
- [ ] Cold GCS benchmark using jd's unchanged corpus/workloads; foreground and drain measurements.
- [ ] Usage documentation, results, contract review, formatting, and native/Linux checks.
