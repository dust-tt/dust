# Selective sandbox namespace overlay

## Decision

Dust exposes the conversation and pod directories through one small FUSE
filesystem. The hidden mounts remain gcsfuse mounts and continue to own all byte
I/O, caching, uploads, and downloads.

The overlay exists for one product invariant: a Frame has a stable Dust identity
that must survive filesystem namespace operations. Its GCS path is mutable
location, not identity.

This is deliberately not a general distributed filesystem and does not create a
database row for every GCS object.

## Shape

```text
sandbox process
    -> /files (one Rust FUSE superblock)
       -> hidden conversation gcsfuse mount
       -> hidden pod gcsfuse mount, when present
       -> Front for rename and unlink only
          -> canonical GCS namespace operation
          -> stable Frame/FileResource binding update or deletion
```

One superblock is required because Linux otherwise turns a conversation-to-pod
`mv` into copy plus unlink. That loses the rename intent needed to preserve a
Frame's identity. The visible roots are:

- `/files/conversation-{conversationId}`;
- `/files/pod-{podId}`, when the conversation has a pod;
- `/files/conversation` and `/files/pod` compatibility symlinks.

Only those two product mounts participate in the overlay.

## Ownership boundary

The Rust layer forwards lookup, listing, open, read, write, create, truncate,
flush, fsync, release, mkdir, and empty rmdir to the corresponding hidden
gcsfuse mount. It adds no remote call on those paths.

It synchronously sends two identity-sensitive operations to Front:

- `rename`, including conversation-to-pod and pod-to-conversation moves;
- `unlink`, so deleting a path can delete an attached Frame and its resources.

The request contains the source mount, relative path, idempotency key, and, for a
rename, destination mount and path. The sandbox token must authorize every
referenced mount.

Front records the operation before changing GCS or application state. A retry
with the same idempotency key is safe, and stale claims can be reclaimed. An
ordinary file remains path-native; only an existing application binding is
updated or removed.

Editor atomic-save is intentional: renaming an untracked temporary file over a
tracked Frame keeps the destination Frame identity while replacing the bytes at
its path.

## Content and publication

There is no `content_committed` callback. Copying each sandbox write back into a
second canonical object would restore the dual-source drift this design removes.
GCS object generations should identify content revisions; the stable Frame ID
identifies the product object; its current mount and path identify location.

Published Frame builds remain separate immutable artifacts. A filesystem write
or move does not silently republish one.

The current branch establishes the namespace seam while `FileResource` remains
the existing Frame binding. Migrating preview/publication reads to exact
path-plus-generation is a separate product migration and is required before the
old canonical-original copy can be retired.

## Failure and security model

The overlay runs as `dust-fs`; workload code runs as `agent` and cannot access
the hidden mounts or mutation token. If the overlay cannot start or pass its
liveness check, the sandbox is recreated rather than exposing an untracked
writable directory.

The visible FUSE layer uses a five-second kernel entry/attribute TTL. The hidden
gcsfuse mounts keep metadata and list caches disabled, so Front/UI writes have a
bounded visible stale-dentry window instead of two compounded cache windows.

Mutation failures are logged to `/run/dust-fs/overlay.log` and returned to the
calling syscall. The database journal is the recovery source of truth; storage
events and object metadata may be used only as repair hints.

## Explicit limits

- no hard links, symlink creation, special nodes, or extended attributes;
- no general distributed locking or universal POSIX namespace;
- directory-tree moves remain a journaled GCS operation, not an atomic
  transaction with PostgreSQL;
- ordinary files have no Dust identity and no namespace row;
- open-handle behavior across a lower-mount-changing rename must remain covered
  by Linux integration tests.

## Code ownership

- `cli/dust-sandbox/src/commands/filesystem/`: local routing and syscall
  translation;
- `front/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter.ts`: hidden
  mounts, credentials, startup, and liveness;
- `front/lib/api/sandbox/file_system_mutations.ts`: durable rename/unlink
  execution;
- `front/lib/api/files/file_system_ops.ts`: GCS operation plus stable binding
  reconciliation;
- `front-api/routes/v1/w/[wId]/sandbox/filesystem/mutations.ts`: authenticated
  internal endpoint.

## Production gates

- use the atomic GCS object-move API for same-bucket single-file rename and keep
  the journal for the GCS/PostgreSQL boundary;
- add an autonomous repair loop for incomplete journal rows;
- pin and qualify gcsfuse 3.2 or newer;
- qualify dirty open handles across conversation-to-pod rename;
- migrate Frame rendering and publication to path-plus-generation semantics;
- retain focused cross-mount identity, unlink, editor-save, cache-coherence, and
  recovery tests in image qualification.
