# dfs-mount

`dfs-mount` is the library behind the dfs FUSE client, which mounts dfs as a filesystem on Linux.
Sandboxes are its main consumer. The library serves one dfs session as a filesystem: the kernel
asks for inodes, attributes and directory entries, and the library answers from the dfs server. A
separate FUSE adapter binary will translate kernel requests into calls to this library.

This crate only holds the API shape for now. Functions are `todo!()`; their doc comments and code
contracts say what they must do. See [CONTRACTS](CONTRACTS) for the rules that apply to the whole
crate.

## Plan

We build the client in small vertical slices:

1. **Shape**: the types, functions and contracts in this crate.
2. **Basics**: a mount that works, with no caching: every operation goes to the server.
3. **Features**: writes, renames, deletes and the rest of the filesystem operations, as the server
   implements the RPCs they need.
4. **Optimizations**: the caching and batching of the prototype in `x/henry/dfs` (attribute cache,
   local overlay of pending writes, ordered commit log, content cache), within the 1s consistency
   target of [the master proposal](../design-docs/INDEX.md).

## Design decisions

### A library without FUSE

The library knows nothing about FUSE. Its operations use FUSE terms (inode numbers, `lookup`,
`forget`, errno) but plain Rust types. This keeps it buildable and testable on macOS, and leaves
the choice of FUSE crate to the adapter.

### The caller owns the connection

`Remote::new` takes a ready gRPC `Channel` and a session key. The caller picks the endpoint and
TLS settings. Sessions expire one hour after their last refresh; the caller will refresh them with
`Remote::refresh_session`. Only `remote.rs` talks to the server.

### A synthetic root

The mount root is not a dfs object. It lists the folders the caller configures, each under a name
of its choice, such as `conversation`. Each entry is the folder itself: `/mnt/dfs/conversation/` is
the conversation folder. The root is read-only. The server's virtual `root` and `shared` references
are not used.

[URI.md](../design-docs/URI.md#sandbox-paths) specifies root entries as symlinks to anchors
(`conversation -> conv-<sId>--<folder-id>`), which make a sandbox path directly a URI. The first
iteration has no symlinks (see [Future work](#future-work)), so the caller maps a root name back
to its folder ID.

### Missing or forbidden

The mount has no access rules of its own: everything it returns about a dfs object comes from a
server reply to its session. It hides what the session cannot read, as the server does:

- `ENOENT`: the object does not exist, or the session cannot read it. The server answers
  `NOT_FOUND` in both cases, so the mount cannot tell them apart, and neither can the process.
- `EACCES`: the session can read the object but not do what was asked, such as writing without
  `w` (`FORBIDDEN`), or the session has expired.

The root follows the same rule: listing it checks the configured folders with one `Stat` and
leaves out the ones the session cannot read.

### Inode numbers

FUSE inode numbers are 64 bits and dfs object IDs are 128 bits, so the mount numbers objects
itself:

- Inode 1 is the root.
- An object gets a number on its first lookup and keeps it while the kernel remembers it.
- The kernel tells the mount when it forgets lookups. The mount drops the object when every lookup
  is forgotten.
- Numbers are never reused during the life of the mount, so a stale kernel reference can never
  reach another object.

### Errors

Each dfs `ErrorCode` maps to one errno. Calls that fail without dfs error details (transport
errors) map to `EIO`. Operations that are not supported yet return `EOPNOTSUPP`, never `ENOSYS`:
FUSE reads `ENOSYS` as "never supported" and stops sending that operation for the rest of the
mount.

### Async operations

Operations that may call the server are `async`, so the adapter can serve several kernel requests
at once and a slow request does not block the others.

## Not supported yet

- Operations inside dfs directories (`lookup`, `readdir`): they need the `Lookup` and `List` RPCs.
- Reads and writes: they need `Read` and `Apply`.
- Executable files: the protocol has no mode on create or update.

## Future work

- **Symlinks.** Two kinds: root entries as symlinks to anchors, as URI.md specifies, and symlinks
  stored in dfs, for which the protocol reserves the `SYMLINK` kind (dust-tt/tasks#11118). Both
  need `readlink`, a symlink kind in `Kind`, and their own inode numbers so a directory never has
  two names.
