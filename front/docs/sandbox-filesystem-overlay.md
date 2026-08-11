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
storage behavior. The thin `dust-fs-overlay.py` process routes reads to those
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
- `content_committed`, sent after `fsync` or final handle release, promotes the
  written mount object to the stable original of an existing linked resource.

An ordinary GCS object remains an ordinary file: filesystem activity does not
create a `FileResource` row for every object. Atomic editor saves are also
handled deliberately: renaming an untracked temporary file over a tracked frame
keeps the destination frame identity and synchronizes its new content.

The mutation endpoint accepts requests only when every source and destination
mount appears in the sandbox token. Omitting `destinationMount` retains the
same-mount behavior used by older sandbox images during rollout.

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
changes performed by Front.

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

- `front/lib/api/sandbox/image/file_system/dust-fs-overlay.py`: FUSE routing and
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
