# dfs-mount

`dfs-mount` is the library behind the dfs FUSE client, which mounts dfs as a filesystem on Linux.
It serves one dfs session as a filesystem. Sandboxes are its main consumer.

## Design decisions

### A library without FUSE

The library uses FUSE terms (inode numbers, `lookup`, `forget`, errno) but no FUSE crate. A
separate adapter binary translates kernel requests into library calls. The library builds and
tests on macOS, and the choice of FUSE crate stays with the adapter.

### The caller owns the connection

`Remote::new` takes a ready gRPC `Channel` and a session key. The caller picks the endpoint and
TLS settings, and refreshes the session (it expires one hour after its last refresh).

### A synthetic root

The mount root is not a dfs object. It lists the folders the caller configures, each under a name
of its choice: `/mnt/dfs/conversation/` is the conversation folder itself. The root is read-only.
The server's virtual `root` and `shared` references are not used.

[URI.md](../design-docs/URI.md#sandbox-paths) specifies root entries as symlinks to anchors
(`conversation -> conv-<sId>--<folder-id>`), so that a sandbox path is directly a URI. Without
symlinks (see [Future work](#future-work)), the caller maps a root name back to its folder ID.

### Missing or forbidden

The mount has no access rules of its own: everything it returns about a dfs object comes from a
server reply to its session. Like the server, it hides what the session cannot read:

- `ENOENT`: the object does not exist, or the session cannot read it. The server answers
  `NOT_FOUND` in both cases.
- `EACCES`: the session can read the object but not do what was asked (`FORBIDDEN`), or the
  session is invalid (expired, revoked or unknown).

Listing the root checks the configured folders with one `Stat` and leaves out the ones the session
cannot read.

### Inode numbers

FUSE inode numbers are 64 bits and dfs object IDs are 128 bits, so the mount numbers objects
itself. Inode 1 is the root. An object gets a number on its first lookup, keeps it until the
kernel forgets every lookup of it, and the number is never reused during the life of the mount.

### Errors

Failures without dfs error details, such as transport errors, map from their gRPC code, and are
`EIO` when no closer errno fits. Unsupported operations return `EOPNOTSUPP`, never `ENOSYS`: FUSE
reads `ENOSYS` as "never supported" and stops sending that operation for the rest of the mount.

### Async operations

Operations that may call the server are `async`, so the adapter can serve several kernel requests
at once.

## Future work

- **Symlinks**: root entries as symlinks to anchors, as URI.md specifies, and symlinks stored in
  dfs, for which the protocol reserves the `SYMLINK` kind (dust-tt/tasks#11118).
