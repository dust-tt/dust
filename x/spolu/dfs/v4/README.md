# dfs:// v4

[Design](DESIGN.md) and [implementation progress](PLAN.md).
Local Rust/Linux FUSE and FoundationDB; no Elasticsearch or GCP resources.

```sh
v4/local/run up
v4/local/run exec cargo test --workspace
v4/local/run exec cargo clippy --workspace --all-targets -- -D warnings
v4/local/run exec cargo build --workspace --release
v4/local/run exec python3 /dfs/v4/tests/mounted.py
v4/local/run exec python3 /dfs/v4/local/mount.py
```

The demo prints its server address and mount path inside `dfs-v4-dev-1`. In another terminal:

```sh
v4/local/run exec ls -la /tmp/dfs-v4-demo/mount
v4/local/run exec env DFS_PROFILE=1 python3 /dfs/v4/bench/run.py
v4/local/run stop
```

For an interactive shell, use `docker exec -it dfs-v4-dev-1 bash`. The image includes Git, SSH,
tab completion, `less`, and `ll` (`ls -alh --color=auto`).

Interrupt the demo to unmount, drain client writes, and stop its server. Its fixture and database
survive restart. Benchmark fixtures use distinct FDB prefixes; credentials, JSON and logs stay in
`/tmp` inside the container. The full table is in [bench/RESULTS.md](bench/RESULTS.md).

Client settings (environment variables or equivalent `dfs-fuse` flags):

| Variable | Default | Meaning |
| --- | ---: | --- |
| `DFS_CLIENT_CACHE_MIB` | 512 | Accounted RAM budget; includes a 96 MiB bounded-I/O/bookkeeping reserve. |
| `DFS_CLIENT_CACHE_TTL_MS` | 1000 | Metadata, names, listings and authorization validity. |
| `DFS_CLIENT_WRITE_DELAY_MS` | 25 | Coalescing window, capped at the 1000ms write-buffer budget. |
| `DFS_CLIENT_WRITE_CONCURRENCY` | 128 | In-flight mutation groups; capacity returns per result (1–128). |

Clean entries and pending writes share the total budget. Writes evict clean entries before waiting
for memory; there is no separate dirty cap or `DFS_CLIENT_DIRTY_MIB` setting.

Blocks survive metadata expiry when a freshly authorized revision matches. Fsync waits for the
object's FDB commits; ordinary writes acknowledge client RAM. Deferred failures remain visible on
fsync and subsequent edits. There is no client disk recovery, automatic replay after uncertain
commits, server writeback, or kernel data cache. Directory prefetch fetches attributes only.

Server `DFS_PRIMARY_CONCURRENCY` (default **1**, range 1–4) controls simultaneous transactions per
local scheduling key. Creates use the new target ID, so sibling creates run concurrently. This is an experiment knob: larger
values can increase FDB conflicts; correctness and cross-server concurrency always rely on FDB.

The fixture uses separate Docker volumes and host port 18084, preserving v1–v3 and GCP.
The demo/benchmark choose ephemeral loopback gRPC ports inside the container; the published port
is available for a manually started server on `0.0.0.0:8080` with `--allow-insecure`.
Stopping preserves the database. This is a single-node local FDB evaluation, not an HA test.

Local FDB has an **8 GiB container limit** (`DFS_V4_FDB_MEMORY`) and keeps its native **2 GiB disk-page
cache**, with automatic restart unless explicitly stopped. Allocate at least **16 GiB to Docker
Desktop** for FDB alongside the development container and other local services. The former 3 GiB
FDB limit caused an OOM kill during a large Git clone. Failed/uncertain DFS writes are not replayed;
after an outage, start a fresh mount before retrying failed operations.

Validated with a 2 GiB streamed write, fsync and matching SHA-256 read through a fresh server/mount.
FDB peaked at 3.44 GiB of container memory with no OOM events or restarts; the full Git clone was
not rerun. Existing database volumes and the interrupted clone were preserved.

Storage format `dfs-v4-fdb-2` splits directory core/state. Older prefixes are rejected; this PoC has
no migration. After an operator resets FDB, start the demo with a fresh `--work` directory because its
saved tenant credentials refer to the erased fixture.
