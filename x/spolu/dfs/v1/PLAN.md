# Implementation

- [x] Shared gRPC schema, validation, errors, and buildable Rust workspace.
- [x] SlateDB setup, configurable caches, cold startup, block reads/writes and atomic metadata.
- [x] Workspace/session authority, inherited grants, dual indexes, root and /shared projection.
- [x] Per-object version checks for namespace edits, attributes, writes, append, truncate, deletion, and fsync (no global/workspace version).
- [x] Real SlateDB tests for isolation, conflicts, concurrent writers, and durable cold reopen.
- [x] Process-crash recovery and cancellation/session-close/revocation race tests.
- [x] Runnable gRPC server, thin async/blocking client, operator CLI, and real transport test.
- [x] Linux FUSE adapter.
- [x] Real gRPC and two-mount filesystem tests, including grants, revocation, and version conflicts.
- [x] Cold GCS benchmark using jd's unchanged corpus/workloads; foreground and drain measurements.
- [x] Usage documentation, results, contract review, formatting, and native/Linux checks.
