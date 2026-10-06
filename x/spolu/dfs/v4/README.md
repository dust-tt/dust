# dfs:// v4

[Design](DESIGN.md) and [implementation progress](PLAN.md).
Local Rust/Linux FUSE and FoundationDB; no Elasticsearch or GCP resources.

```sh
v4/local/run up
v4/local/run exec cargo test --workspace
v4/local/run exec cargo clippy --workspace --all-targets -- -D warnings
v4/local/run stop
```

The direct FDB server and versioned/batched protocol are implemented and tested against real FDB.
Client caching, mounted validation, and benchmarks are in progress; see the plan.
The fixture uses separate Docker volumes and host port 18084. Stopping preserves its database.
