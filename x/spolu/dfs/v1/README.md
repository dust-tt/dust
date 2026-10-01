# dfs:// v1

Rust, gRPC, and SlateDB backed by GCS. See [DESIGN.md](DESIGN.md) for semantics and
[PLAN.md](PLAN.md) for implementation progress. The Linux FUSE adapter and benchmarks are in progress.

## Server and operator client

Requires modern Rust (edition 2024) and `protoc`. Run commands from this directory.

```sh
cargo build --release -p dfs-server -p dfs-client
umask 077
python3 -c 'import secrets; open("server.key", "x").write(secrets.token_hex(32))'
gcloud auth application-default login --project=dust-dev
./target/release/dfs-server \
  --bucket dust-dev-dfs-poc-spolu-20260930 --prefix dfs-v1/development \
  --server-key-file server.key
```

Use a fresh prefix for v1; v0 data is incompatible. For offline tests, replace `--bucket …` with
`--local-store /tmp/dfs-v1-store`. The latter is a development object-store backend, not a cache.
Every start clears its own local cache and recovers from the configured object store.

In another terminal, create a workspace, session, and writable folder:

```sh
umask 077
export DFS_ENDPOINT=http://127.0.0.1:8080
printf '%s' '{"workspace_id":"example","root_grants":["owner"]}' |
  ./target/release/dfs --key-file server.key create-workspace --output workspace.json
python3 -c 'import json; open("workspace.key", "x").write(json.load(open("workspace.json"))["workspace_key"])'
printf '%s' '{"workspace_id":"example","grants":["owner"]}' |
  ./target/release/dfs --key-file workspace.key create-session --output session.json
python3 -c 'import json; open("session.key", "x").write(json.load(open("session.json"))["session_key"])'
python3 -c 'import json; w=json.load(open("workspace.json")); print(json.dumps({"parent_id":w["root_id"],"name":"work","directory":True,"mode":493,"expected_parent_version":1}))' |
  ./target/release/dfs --key-file session.key create
```

Set `umask 077` in both terminals. Key files must have mode `0600`. Keep server/workspace keys out
of sandboxes; give a sandbox only its session key. Session grants are fixed, expire after one hour,
and are lost on restart. Create a fresh session after restart; workspace keys persist when durable.
Do not repeat workspace creation for an existing workspace.

The `dfs` CLI accepts a JSON request on stdin or `--input file`; field names match
[the protobuf schema](protocol/proto/dfs.proto). Omitted fields take protobuf defaults. Methods
use kebab-case, such as `update-grants` or `current-session`. Responses containing credentials require
`--output` and are written to a new private file. Binary fields use JSON byte arrays in this debugging
CLI; the gRPC clients transfer binary bytes directly, bounded to 1 MiB per read/write.

Listen on loopback by default. For a local Docker VM, use `--listen 0.0.0.0:8080 --allow-insecure` and
connect to `http://host.docker.internal:8080`. Use `--tls-cert` and `--tls-key` beyond local development;
HTTPS clients validate server certificates using native trust roots.

## Guarantees and limits

Writes and `fsync` acknowledge server visibility, not GCS durability. `SIGINT`/`SIGTERM` drain accepted
requests and SlateDB, then log `drain_ms`; shutdown times out after 300 seconds by default. A forced
kill can lose recent acknowledged writes. Never automatically retry an ambiguous mutation.

Caches default to 1 GiB RAM and 16 GiB disk; unflushed write backpressure starts at 512 MiB. Set
`--cache-memory-mib`, `--cache-disk-gib`, `--max-unflushed-mib`, and `--cache-dir` to override them.
The server admits at most 64 concurrent RPCs. Atomic mutation batches are limited to 8 MiB and
65,536 changed keys; oversized truncate/unlink operations fail without partial publication.

## Checks

```sh
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
```

Tests use real SlateDB with memory/local object-store backends; the transport test runs real gRPC.
