# dfs-mount

`dfs-mount` is the library behind the sandbox FUSE client. It serves one dfs session as a
filesystem: the kernel asks for inodes, attributes and directory entries, and the library answers
from the dfs server. A separate FUSE adapter binary will translate kernel requests into calls to
this library.

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

As specified in [URI.md](../design-docs/URI.md#sandbox-paths), the mount root is not a dfs object.
It lists the symlinks the caller configures, such as
`conversation -> conv-<sId>--<folder-id>`. Looking up a `<label>--<object-id>` name at the root
resolves that object, ignoring the label, so the symlinks work. These anchors are reachable but
not listed. The root is read-only. The server's virtual `root` and `shared` references are not
used.

### The server decides access

The mount has no access rules of its own. Everything it returns about a dfs object comes from a
server reply to its session. An object the session cannot read looks missing (`ENOENT`), as the
server returns `NOT_FOUND` for it.

### Inode numbers

FUSE inode numbers are 64 bits and dfs object IDs are 128 bits, so the mount numbers objects
itself:

- Inode 1 is the root. Each link has its own inode, distinct from the object it points to.
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
- Symlinks stored in dfs: `SYMLINK` is reserved by the protocol.
