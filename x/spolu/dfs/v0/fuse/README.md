# Linux FUSE client

`dfs-fuse` uses `fuser` 0.18, matching `cli/dust-sandbox`. Mounting requires Linux, `/dev/fuse`, and
mount permissions. The shared `dfs-protocol` and blocking `dfs-client` build on macOS without a FUSE
driver. macFUSE is excluded for now.

Run the commands below from `x/spolu/dfs/v0`.

## Mount

Provision a workspace and session through the [server API](../README.md#workspaces-and-sessions).
Put **only the session key** in a mode-0600 file; keep workspace/server keys with the trusted caller.
The synthetic mount root and `/shared` are read-only. Create a workspace-root working directory via
`POST /objects/mkdir` using the real root ID before mounting; ordinary descendants are writable.

On Linux, with `fuse3` installed:

```sh
cargo build --locked -p dfs-fuse
mkdir -p /mnt/dfs
chmod 600 /run/secrets/dfs-session
./target/debug/dfs-fuse --endpoint http://127.0.0.1:8080 \
  --session-key-file /run/secrets/dfs-session /mnt/dfs
```

The process stays in the foreground. Interrupt it to unmount, or use `fusermount3 -u /mnt/dfs`.
`--read-only` rejects mutations. `--threads` bounds concurrent blocking kernel/HTTP workers
(default eight, range 1–32). `DFS_ENDPOINT` and `DFS_SESSION_KEY_FILE` are also accepted. Use HTTPS
outside local development. HTTP redirects are disabled; errors never contain credentials.

A session lasts one hour and is invalidated by closure or server restart. Create a new session and
remount; the client never silently changes scope under existing inodes or file descriptors. One
session per mount also avoids sharing the server's 256-file-handle session limit across mounts.

## Develop from macOS

Build the Linux client in Docker with separate Cargo caches:

```sh
docker build -t dfs-fuse-dev -f fuse/Dockerfile fuse
docker run --rm \
  --mount type=bind,src="$PWD",dst=/dfs \
  --mount type=volume,src=dfs-linux-cargo,dst=/usr/local/cargo \
  --mount type=volume,src=dfs-linux-target,dst=/dfs/target-linux \
  -e CARGO_TARGET_DIR=/dfs/target-linux dfs-fuse-dev \
  cargo build --locked -p dfs-fuse
```

Run the server natively, listening on an address reachable from Docker (`--listen 0.0.0.0:8080`
for local development). Open a container with the session file mounted read-only:

```sh
docker run --rm -it --device /dev/fuse --cap-add SYS_ADMIN \
  --security-opt apparmor=unconfined \
  --mount type=volume,src=dfs-linux-target,dst=/dfs/target-linux,readonly \
  --mount type=bind,src=/absolute/path/session.key,dst=/run/dfs-session,readonly \
  dfs-fuse-dev bash
```

Inside it, `mkdir /mnt/dfs`, then run `/dfs/target-linux/debug/dfs-fuse` with endpoint
`http://host.docker.internal:8080`, key file `/run/dfs-session`, and mountpoint `/mnt/dfs`.
Use another container shell for filesystem commands. Mount access is restricted to the mounting UID;
no `allow_other` option is enabled.

For rapid local iteration without GCS, use the explicit local object-store fixture:

```sh
# Supply an operator-generated DFS_SERVER_KEY in the environment.
cargo run -p dfs-server --example local_server -- \
  --store /tmp/dfs-local-store --listen 0.0.0.0:8080
```

It uses real SlateDB and a filesystem object store, through the same API/authentication paths. The
production server still requires explicit GCS configuration; it never falls back to local storage.

## Behavior and limits

- Lookup/stat, directory paging, open/read, create/mkdir, random writes, append, truncate, rename,
  unlink/rmdir, chmod, timestamps, and `user.*` xattrs use the existing server API. `/shared` aliases
  retain visible parents and the mandatory `--<id>` suffix. Custom session mounts remain deferred.
- Kernel positive/negative entry and attribute TTLs share the client freshness deadline, captured
  before reading metadata, so layering caches never extends the one-second bound. File handles use
  direct I/O without writeback.
  Session-scoped LRUs hold 32 MiB of metadata and 256 MiB of immutable 1 MiB content blocks.
  Directory pages prefill lookup/stat entries; read-only opens need no server handle. Background
  revision checks keep metadata fresh, starting at least 100 ms apart even during write bursts,
  with at most one second of stale authorization. A revision
  change, check failure, or freshness expiry clears metadata; immutable bytes remain until eviction
  and are selected through authorized metadata. Writes never wait for invalidation and immediately
  clear the writing mount's metadata. Session closure fails closed within the same one-second bound.
  Already-started reads may finish. Targeted invalidation and Product integration remain pending.
- Streams preserve backpressure. Kernel read/write buffers are capped at 1 MiB; JSON responses are
  capped at 8 MiB. File bytes are never accumulated into a complete client-side file. The synchronous
  server still rewrites the entire immutable blob per write; this baseline favors correctness over
  extraction speed.
- Live inode mappings cap at 100,000; file and directory handles cap at 256 each. Parents survive
  while children/handles reference them. Kernel `forget` and handle release reclaim mappings; inode
  numbers are never reused. An unlooked-up `readdir` entry may report inode zero until lookup.
- Directory enumeration stores only a page cursor and partial-page position. Backward seeks replay
  from the beginning. Pages reauthorize; concurrent directory edits can cause skips/repeats. `..`
  follows the last observed visible parent, updated on lookup/local rename; remote directory moves
  have no push invalidation yet.
- Every write completes server publication before returning. Flush waits behind handle edits and
  reports their sticky errors locally; explicit fsync also uses the server sequence barrier. An ambiguous edit retries once with identical ID/sequence/bytes; an unresolved error
  remains sticky on that handle, including flush/fsync. Close it and inspect server state before
  resuming; an error is not proof that nothing committed. Namespace operations are not retried.
- Release frees handles; Linux ignores its errors for `close()`, so flush reports write failures.
  Directory fsync checks access and relies on preceding namespace operations already being acknowledged.
  Rename preserves open handles; unlink/replacement invalidates them, as in the server PoC.
- Symlinks, hard links, special files, ownership changes, extra mode bits, ACLs, advisory locks, and
  fallocate return unsupported errors. Mapped/executable content is outside the supported baseline;
  use ordinary read/write I/O. The kernel checks mode bits locally; server grants remain the access authority.
  `statfs` reports unknown capacity as zero, so `df` does not estimate available GCS storage.

## Verification

Native tests exercise model/inode lifetimes and an 80 MiB real-HTTP stream with range reads and
retry receipts. The mounted harness runs Linux containers against the native server; it creates
isolated workspaces, mounts owner/reader sessions simultaneously, verifies shared visibility and
revocation, and checks edits, xattrs, read-only mounts, quotas/sticky errors, unsupported locks,
and local multi-page directories. It then kills the server, deletes scratch, recreates sessions,
and repeats reads after remounting. The GCS variant requires working ADC and uses a fresh test
prefix, cleaning only that prefix on success. Failed cloud runs retain their prefix for inspection.
No credentials are copied into the image or retained in reports.

```sh
cargo test --locked --workspace
cargo build --locked -p dfs-server --bin dfs-server --example local_server
# Build the Linux image/client above first.
python3 tests/fuse_e2e.py
python3 tests/fuse_e2e.py --bucket dust-dev-dfs-poc-spolu-20260930 --prefix dfs-dev/spolu
```

The harness prints report paths and timings. [Recorded baseline](../bench/FUSE.md).

Use `--write-mode cached` on the server to acknowledge server visibility without waiting for GCS or
SlateDB durability. The FUSE mount settings do not change. `tests/fuse_e2e.py --write-mode cached`
verifies two mounts and recovery after a graceful persistence drain; focused storage tests separately
exercise loss of the pending suffix. See [cache benchmarks](../bench/CACHE.md).
