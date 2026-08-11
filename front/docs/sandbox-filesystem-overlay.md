# Sandbox filesystem overlay

## Purpose

Sandboxes must be able to manipulate conversation and pod files with normal
filesystem commands without bypassing Dust's `FileResource` lifecycle. In
particular, deleting or moving a published frame must update both its GCS mount
object and its stable logical file identity.

The overlay deliberately supports only the two writable product mounts exposed
to a sandbox. It is not a general distributed or fully POSIX-compatible
filesystem.

## Architecture

```text
sandbox process
    -> /files (one FUSE filesystem)
       -> hidden conversation gcsfuse mount
       -> hidden pod gcsfuse mount, when present
       -> authenticated Front mutation endpoint
          -> DustFileSystem (canonical GCS namespace)
          -> FileResource lifecycle
```

The hidden gcsfuse mounts continue to own GCS transfer, credentials, and object
storage behavior. The thin Rust `dsbx filesystem` process routes reads to those
mounts and sends semantic mutations synchronously to Front.

One FUSE filesystem is mounted at `/files`. Its canonical entries are:

- `/files/conversation-{conversationId}`;
- `/files/pod-{podId}`, when the conversation has an associated pod.

The overlay also exposes `/files/conversation` and `/files/pod` as synthetic
compatibility symlinks. Other sandbox mounts are not routed through this
overlay.

## Why both mounts share one FUSE filesystem

Linux can issue `rename` only when the source and destination belong to the
same filesystem. With separate conversation and pod mounts, `mv` falls back to
copy followed by unlink. That sequence loses intent: the destination looks like
a new plain object and deleting the source removes the original frame identity.

Putting both directories under one `/files` FUSE superblock lets the kernel
deliver conversation-to-pod and pod-to-conversation moves as one rename. The
request carries both mount identities and Front performs one canonical move,
preserving the `FileResource` sId and updating its mount path, use case, and
frame metadata.

## Mutation semantics

Reads and directory listings pass through to the selected hidden gcsfuse
mount. Mutations use a short-lived sandbox token and an idempotency key:

- `mkdir` and `rmdir` update the canonical namespace through Front;
- `unlink` deletes linked `FileResource` objects and their canonical storage,
  then removes remaining mount objects;
- `rename` moves files or directory trees and reconciles every linked
  `FileResource` below the source path;
- cross-mount `rename` additionally supplies `destinationMount`;
- `content_committed`, sent after final handle release, promotes the written
  mount object to the stable original of an existing linked resource. `fsync`
  persists the backing handle but deliberately does not reconcile Dust state
  before gcsfuse has published the object on close.

An ordinary GCS object remains an ordinary file: filesystem activity does not
create a `FileResource` row for every object. Atomic editor saves are also
handled deliberately: renaming an untracked temporary file over a tracked frame
keeps the destination frame identity and synchronizes its new content.

The mutation endpoint accepts requests only when every source and destination
mount appears in the sandbox token. Omitting `destinationMount` retains the
same-mount behavior used by older sandbox images during rollout.

## Performance evidence (2026-08-11)

The overlay was benchmarked in a disposable E2B sandbox using the locally built
`dust-base_0-8-78` image (Linux x64, 2 vCPU, 2 GiB, Bun 1.3.14). The direct path
was the hidden conversation gcsfuse mount at `/run/dust-fs/data/mount-0`; the
overlay path was the same mount through `/files/conversation-{conversationId}`.
Both paths therefore used the same sandbox, bucket, GCS prefix, credentials, and
network. Distinct same-size objects avoided warming the overlay fixture through
the direct path. Cold-read order was alternated by size.

The tracked gcsfuse mount had list and metadata caches disabled, as it still does
for cross-writer coherence. The benchmarked Rust FUSE revision also returned a
zero kernel attribute and entry TTL. Those settings are central to interpreting
the baseline result; the remediation below changes only the visible overlay TTL.

The repeatable GCS benchmark is
`front/scripts/benchmark_sandbox_filesystem_overlay.ts`. Its phases can be run
independently with `--benchmarkPhase reads`, `metadata`, `write-4096`, or
`mutations`. The `coherence` phase mutates GCS outside the mount and measures
when the overlay observes the create and delete. Independent phases avoid a
local command-runner lifetime limit.
Each phase creates and destroys its own conversation, sandbox, and GCS fixture
prefix.

### Pure local Rust/FUSE cost

A control run used the same `dsbx filesystem` binary with a local `/tmp` backing
directory, a read-only mount, and no Front request on the measured path. This
isolates the extra FUSE dispatch, Rust routing, buffer allocation, and local
backing syscall from GCS and API latency.

| Operation | Direct p50 | Overlay p50 | Absolute overhead |
| --- | ---: | ---: | ---: |
| Read 4 KiB | 0.009 ms | 0.265 ms | 0.256 ms |
| Read 1 MiB | 0.210 ms | 1.123 ms | 0.913 ms |
| Read 8 MiB | 1.902 ms | 6.885 ms | 4.983 ms |
| `stat` | 0.001 ms | 0.111 ms | 0.110 ms |
| `readdir`, 20 entries | 0.005 ms | 0.309 ms | 0.304 ms |

This supports the intended architecture: the Rust process itself is a thin local
adapter. It adds a memory copy and FUSE round trip, but not seconds of CPU work.

### GCS-backed reads

| Warm read | Direct p50 | Overlay p50 | Overlay/direct |
| --- | ---: | ---: | ---: |
| 4 KiB | 728 ms | 2,463 ms | 3.38x |
| 1 MiB | 444 ms | 2,208 ms | 4.98x |
| 8 MiB | 434 ms (18.4 MiB/s) | 2,196 ms (3.64 MiB/s) | 5.06x |

Cold reads showed the same shape: direct/overlay were 1,185/5,622 ms for 4 KiB,
1,057/4,670 ms for 1 MiB, and 1,347/3,119 ms for 8 MiB. At concurrency 1, 4,
and 8, median batches of 1 MiB reads were respectively 750/2,912 ms,
2,431/11,004 ms, and 5,476/13,909 ms.

The multi-second delta is not Rust transfer overhead. With two zero-cache layers,
the kernel's lookup/getattr/open sequence becomes additional synchronous calls
through gcsfuse. The adapter still delegates byte transfer to gcsfuse, but it can
amplify gcsfuse metadata traffic before the transfer starts.

### Metadata and mutations

| Operation | Direct p50 | Overlay p50 | Overlay/direct |
| --- | ---: | ---: | ---: |
| `stat` | 441 ms | 1,851 ms | 4.20x |
| `readdir`, 20 entries | 331 ms | 24,227 ms | 73.3x |
| Same-mount rename | 1,729 ms | 6,792 ms | 3.93x |
| Unlink | 1,416 ms | 3,724 ms | 2.63x |

The directory result has a concrete implementation cause:
`read_backing_directory` currently calls `symlink_metadata` for every returned
entry to derive its type. With the backing metadata cache disabled, a 20-entry
listing becomes one GCS list plus roughly 20 metadata operations. It should use
the type returned by `readdir` when available and fall back to a stat only for
unknown types.

Rename and unlink are not equivalent workloads. The direct path only mutates
gcsfuse; the overlay path synchronously calls Front and reconciles canonical GCS
objects and `FileResource` state. Their extra latency buys the semantic guarantee
the overlay exists to provide, so it should be monitored separately from the
read-path forwarding cost.

### Write correctness finding

A newly created 4 KiB overlay file failed `fsync` with `EIO`, so committed-write
latency was not reported. Front logs showed repeated `content_committed` requests
failing with `Committed file not found`. The adapter calls Front after
`File::sync_all`, while gcsfuse does not expose a newly created object to the GCS
namespace until its backing handle closes. The later FUSE release is therefore
too late to make the fsync callback succeed.

This is a correctness blocker, not a benchmark artifact. The commit notification
must happen after gcsfuse has finalized the object (or fsync must deliberately
close/reopen the backing handle while preserving POSIX handle behavior). The
chosen behavior needs a live test proving that a newly created file succeeds and
that its canonical resource is synchronized only after the new bytes are visible.

### Implemented remediation

This branch addresses the measured causes at their ownership boundaries:

- `entry_for_key` reuses its first backing metadata result instead of issuing a
  second `symlink_metadata` for the same lookup;
- `read_backing_directory` uses the file type returned by `readdir`, allowing the
  standard library to fall back only when a backing filesystem reports an
  unknown type instead of issuing one unconditional stat per child;
- the visible Rust FUSE mount returns a five-second kernel attribute/entry TTL,
  while the hidden gcsfuse metadata and list caches remain disabled. Sandbox
  mutations update the same kernel namespace immediately; an external Front or
  UI writer has an explicit five-second kernel stale-dentry window (plus GCS
  propagation and caller round-trip time);
- `fsync` synchronizes only the open backing handle. `release` closes that handle
  first and then sends `content_committed`, ensuring Front reads the published
  bytes. Dirty state remains set across fsync so release cannot skip the commit.

The cache TTL is intentionally named and documented in `fuse.rs`, the post-close
publication boundary is documented in `core.rs`, and the hidden-mount zero-cache
decision is documented beside the gcsfuse flags. Focused Linux tests cover
post-release commit ordering and directory entry types.

### Post-remediation live validation

The same disposable E2B setup was rebuilt with the remediated local Rust binary.
The comparison below uses p50 values from independent phases; GCS latency varies
between runs, so the direct path in each row remains the control.

| Operation | Direct p50 | Remediated overlay p50 | Overlay/direct |
| --- | ---: | ---: | ---: |
| Warm read, 4 KiB | 779 ms | 1,254 ms | 1.61x |
| Warm read, 1 MiB | 457 ms | 1,018 ms | 2.23x |
| Warm read, 8 MiB | 438 ms | 1,101 ms | 2.52x |
| `stat` | 820 ms | 0.011 ms | <0.001x |
| `readdir`, 20 entries | 702 ms | 1,890 ms | 2.69x |

The 20-entry overlay listing fell from 24,227 ms to 1,890 ms, a 12.8x
improvement. Cached `stat` became a local kernel operation. The remaining
listing and read deltas are consistent with one extra Rust/FUSE traversal over
the uncached backing mount rather than N additional GCS metadata requests.

Two newly created 4 KiB overlay files completed open, write, `fsync`, and close
without `EIO`; the corresponding post-close `content_committed` requests both
returned HTTP 200 after gcsfuse had published the objects. The `coherence` phase
observed an external GCS create after 925 ms and an externally deleted,
positively cached file after 6,400 ms. The latter includes the five-second
kernel TTL plus repeated remote command and GCS observation latency, and stayed
inside the explicit seven-second end-to-end test envelope.

### Remaining rollout gates

The original correctness and metadata-amplification blockers are fixed and live
validated. Before rollout:

- run the complete write-size matrix and assert canonical resource contents, in
  addition to the HTTP-success check used for the 4 KiB regression;
- keep the `coherence` phase in image qualification so a TTL or gcsfuse flag
  change cannot silently widen external-writer staleness;
- keep the 20-entry listing near one backing list operation and investigate any
  regression toward the original per-entry metadata shape;
- set an accepted read-path overhead budget from a larger sample of production-
  shaped objects and directories;
- retain mutation latency as a separate semantic-API SLO rather than hiding it
  inside the local forwarding budget.

The five-second TTL is a bounded experiment, not an invisible implementation
detail. Front and UI writers may change GCS outside the overlay process, so this
coherence window is part of the product behavior and must stay covered by live
tests whenever the value changes.

## Failure and security model

The overlay runs as the dedicated `dust-fs` service account. Workload code runs
as `agent`, can access the visible mount through FUSE, and cannot access the
hidden gcsfuse mounts or token under `/run/dust-fs`.

Front durably records each mutation before applying it. Retries reuse the same
idempotency key, completed requests are replay-safe, and abandoned claims can
be reclaimed. The helper re-reads its token for every attempt so credential
rotation does not interrupt an open sandbox.

The mount fails closed. If the overlay cannot start, or its `/files` FUSE
liveness check fails during credential refresh or wake, Front requests sandbox
recreation instead of exposing an untracked writable directory. Tracked hidden
gcsfuse mounts disable list and metadata caches so they observe namespace
changes performed by Front. The visible overlay keeps only the bounded
five-second kernel attribute/entry TTL documented above; the two cache layers
must not both be enabled because their stale windows would compound.

The service writes structured startup and failure events to
`/run/dust-fs/overlay.log`, including rejected mutations, exhausted retries, and
unexpected backing-store I/O errors.

## Deliberate limitations

- At most one conversation mount and one pod mount are routed by the overlay.
- Hard links, symlink creation, special nodes, and extended attributes are not
  supported.
- The design does not provide broad distributed locking or multi-writer cache
  coherence.
- GCS remains the byte store, so applications that require stronger local-disk
  semantics must be tested explicitly.

These constraints should remain explicit. Expanding them would turn the thin
semantic adapter into a general distributed filesystem and should trigger a
new architecture decision.

## Code ownership

- `cli/dust-sandbox/src/commands/filesystem/`: FUSE routing and
  syscall-to-mutation translation;
- `front/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter.ts`: hidden mounts,
  `/files` startup, credentials, and liveness;
- `front/lib/api/sandbox/file_system_mutations.ts`: idempotent mutation execution;
- `front/lib/api/files/file_system_ops.ts`: canonical GCS and `FileResource`
  reconciliation;
- `front-api/routes/v1/w/[wId]/sandbox/filesystem/mutations.ts`: authenticated
  internal mutation endpoint.

The executable cross-mount test is
`front/scripts/test_sandbox_cross_mount_frame.ts`. It verifies that moving a frame
from a conversation to a pod preserves its sId, stable original, and updated
pod metadata while removing the source mount object.

The executable performance harness is
`front/scripts/benchmark_sandbox_filesystem_overlay.ts`. It compares the hidden
gcsfuse mount with the visible overlay and cleans up all disposable resources.
