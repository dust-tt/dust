# dfs:// v3

See [DESIGN.md](DESIGN.md) for the contract and [PLAN.md](PLAN.md) for implementation progress.
This iteration is local only: Linux FUSE and FoundationDB in Docker, no Elasticsearch or GCP.

From the dfs directory:

```sh
v3/local/run up
v3/local/run exec cargo test --workspace
v3/local/run exec cargo clippy --workspace --all-targets -- -D warnings
v3/local/run stop
```

The local database uses its own persistent Docker volume; stopping preserves it. FDB uses native
7.3.69 defaults. The Linux development container exposes port 18083 on host loopback and has
`/dev/fuse`. Build outputs and Cargo downloads stay in Docker volumes. Server and mounting commands
will be added with the following milestones.
