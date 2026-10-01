# dfs:// v1

Rust, gRPC, and SlateDB backed by GCS. See [DESIGN.md](DESIGN.md) for semantics and
[PLAN.md](PLAN.md) for implementation progress. The server and CLI run natively on macOS; mounting requires Linux.

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

GCS uses ADC (`GOOGLE_APPLICATION_CREDENTIALS`, local ADC, or an attached service identity); unrelated
`SERVICE_ACCOUNT` settings are ignored. Use a fresh prefix for v1; v0 data is incompatible. For offline tests, replace `--bucket …` with
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

## Linux FUSE

Build the client in Docker on macOS, then mount with an existing session key:

```sh
docker build -t dfs-v1-fuse-dev -f fuse/Dockerfile .
docker run --rm -v "$PWD:/dfs" -v dfs-linux-cargo:/usr/local/cargo \
  -v dfs-v1-linux-target:/target -e CARGO_TARGET_DIR=/target \
  dfs-v1-fuse-dev cargo build --release -p dfs-fuse -p dfs-client
docker run --rm -it --device /dev/fuse --cap-add SYS_ADMIN \
  --security-opt apparmor=unconfined \
  -v dfs-v1-linux-target:/target:ro -v "$PWD/session.key:/run/session.key:ro" \
  dfs-v1-fuse-dev /bin/bash
```

Inside that container (server started with the Docker listener options above):

```sh
mkdir /mnt/dfs
/target/release/dfs-fuse --endpoint http://host.docker.internal:8080 \
  --session-key-file /run/session.key /mnt/dfs &
ls /mnt/dfs/work
```

The synthetic root and `/shared` cannot be mutated; create a real folder such as `work` through the
API first. Files use direct I/O, zero metadata TTLs, and eight FUSE workers (configurable with
`--threads`, maximum 32). No client content cache. Handles are local and capped at 256 files plus
256 directory handles. Inode numbers and pins track visible parents and references only.

`user.*` xattrs, modes, and timestamps are supported. MIME types and arbitrary xattr names are
available through the API. Symlinks, hard links, locks, ownership changes, and open-after-unlink
semantics are deferred. Concurrent write conflicts surface as `EAGAIN`; retry is the application's
choice, never automatic. Errors from a handle's writes also reach its next flush/fsync.

Run the two-mount integration test from the host after building both platforms:

```sh
python3 tests/fuse_e2e.py
python3 tests/crash.py
```

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

## Performance benchmark

Latest measurements: [bench/RESULTS.md](bench/RESULTS.md).

With ADC access to the development bucket, run:

```sh
python3 bench/vfs.py
```

This runs jd's unchanged 10,000-file corpus and 24 workload measurements on local Linux storage,
then dfs backed by a fresh GCS prefix. It measures untar and remaining persistence drain separately,
restarts the server with discarded local caches, and mounts a fresh session before the DFS suite.
The server restarts once before the suite, not between rows; later rows benefit from prior reads.
Successful runs remove their own GCS fixture. Reports contain timings and logs, with credentials
removed. `--local-store` runs the same harness with a local object-store backend for offline checks.
Retained remote bytes measure the final object-store footprint, not cumulative upload amplification.
