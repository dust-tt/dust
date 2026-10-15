# dfs:// mount design

The dfs mount serves one dfs session as a read-write filesystem on Linux. Sandboxes are its main
consumer. It has two parts:

- `dfs-mount` (`dfs/mount`): the library. It owns the filesystem logic, the cache and the writes,
  and talks to the dfs server.
- `dfs-fuse` (`dfs/fuse`): the adapter binary. It mounts the library with FUSE and translates
  kernel requests into library calls.

## Goal

Tools such as `tar`, `git` and `rg` should run on the mount at close to local-disk speed, while
every mount of a tenant sees every other mount's changes within a fixed delay. The mount gets there
by answering most requests from memory and by acknowledging writes before they reach the server.

## Guarantees

1. **Bounded delay.** Once a mount acknowledges a change, every request that starts more than
   `MAX_DELAY` later, on any mount, sees it or a later state. `MAX_DELAY` is 1 second by default.
   Losing read access also takes up to `MAX_DELAY` to apply.
2. **Read your writes.** A mount sees its own changes at once.
3. **Whole states.** Each read the mount serves returns bytes of one state of the file, never a
   mix of two writes. A large `read(2)` that the kernel splits may still span two states.
4. **Durable `fsync`.** Writes and metadata changes are acknowledged before they reach the server.
   `fsync` of any file or directory waits until every change the mount acknowledged before it is
   committed, and reports the first failure since the previous `fsync`.
5. **Conflicts.** When two mounts change the same object at once, either may win. The losing change
   is dropped, logged and reported by the next `fsync`.

## Design decisions

### A library without FUSE

The library uses FUSE terms (inode numbers, `lookup`, `forget`, errno) but no FUSE crate. The
adapter translates kernel requests into library calls. The library builds and tests on macOS, and
the choice of FUSE crate stays with the adapter. Operations that may wait for the server are
`async`.

### The delay budget

`MAX_DELAY` is split in two:

- **Commit window**: `min(MAX_DELAY / 4, 1 s)`. Every acknowledged change is committed within it.
- **Cache TTL**: the rest. A cached server reply is served only while less than the TTL has passed
  since its request was sent.

At 1 second, that is 250 ms and 750 ms. A change acknowledged at `t` is committed by `t + window`,
and a reply that misses it was requested before then, so it is served until `t + MAX_DELAY` at the
latest. This holds because the server reads at a version taken after each request arrives.

### No kernel caching

Entries and attributes have a zero TTL, every file is opened with direct I/O, and the mount turns
off readdirplus and the kernel's writeback cache. The kernel asks the mount every time, and the
mount answers from its own cache. Only the library caches, so the budget holds.

The one exception is a private `mmap`, which reads through the page cache even with direct I/O.
The kernel drops a file's page cache on every `open` and `mmap`, so a mapping only holds pages read
after it was made. A shared writable `mmap` fails.

### The cache

- **Attributes, names and listings** are kept with the send time of their request and served
  until the TTL lapses. Names include misses, so a missing file is not asked for again.
- **A lookup miss fetches the whole directory**: one `List` page (up to 4,096 entries, each with
  its attributes) answers every later lookup in that directory. Larger directories use `Lookup`.
- **File content** is kept by object and `content_version`, within a fixed memory budget: whole for
  files up to 1 MiB, in 64 KiB blocks for larger ones. It is served only while a live cached
  attribute has the same `content_version`, so bytes outlive the TTL but are never stale. A miss
  reads 1 MiB from the first block it needs, and reading a small file also fetches its small
  siblings with one `ReadFiles`.
- **No older replies**: a reply older than the mount's last committed change to an object is not
  cached for that object.

### Writes

- **Local first**: a change is applied to a local overlay and acknowledged at once. Reads on the
  mount see the overlay over the server's state.
- **One ordered log**: changes become `Apply` operations in a log. One `Apply` is in flight at a
  time, in order, carrying as many operations as fit. Attribute changes fold into the previous
  operation on the same object, and consecutive writes to a file merge.
- **Admission**: a new change waits while the log is full, or while the oldest pending operation
  would miss the commit window (judging from recent `Apply` times). A slow server slows writers
  instead of stretching the delay.
- **Results**: a committed batch updates the cache with the attributes it returns. A failed
  operation is dropped: the objects it touched are fetched again, and the next `fsync` reports it.
- **New objects get their ID from the mount**, so they can be used before their creation commits.
- **No replays**: `Apply` has no idempotency key, so a lost reply fails its operations instead of
  sending them again.
- **Unmounting waits** until the log is committed.

### One FUSE thread

The kernel spreads requests over idle FUSE threads, and each hand-off between CPUs costs more than
answering from memory. The adapter reads requests on one thread and runs each one there until it
would wait for the server, then finishes it on the Tokio runtime. A slow request never holds the
others.

### Permissions

The mount has no access rules of its own: everything it returns about a dfs object comes from a
server reply to its session, and the server checks grants again when it commits a change. The
mount checks the cached mode bits itself on `access`, on opening a file or directory, and before
each change. It does not use `default_permissions`: with a zero TTL, the kernel would fetch
attributes again before each check.

Like the server, it hides what the session cannot read:

- `ENOENT`: the object does not exist, or the session cannot read it. The server answers
  `NOT_FOUND` in both cases.
- `EACCES`: the session can read the object but not do what was asked (`FORBIDDEN`), or the
  session is invalid (expired, revoked or unknown).

Every user that can reach the mount acts as the session, so only the user running the adapter can
use it (no `allow_other`), and it owns every inode.

### A synthetic root

The mount root is not a dfs object. It lists the folders the caller configures, each under a name
of its choice: `/mnt/dfs/conversation/` is the conversation folder itself. The root is read-only.
The server's virtual `root` and `shared` references are not used. Listing the root checks the
configured folders with one `Stat` and leaves out the ones the session cannot read.

[URI.md](URI.md#sandbox-paths) specifies root entries as symlinks to anchors
(`conversation -> conv-<sId>--<folder-id>`), so that a sandbox path is directly a URI. Without
symlinks (see [Future work](#future-work)), the caller maps a root name back to its folder ID.

### Inode numbers

FUSE inode numbers are 64 bits and dfs object IDs are 128 bits, so the mount numbers objects
itself. Inode 1 is the root. An object gets a number on its first lookup, keeps it until the
kernel forgets every lookup of it, and the number is never reused during the life of the mount.

### Errors

Failures without dfs error details, such as transport errors, map from their gRPC code, and are
`EIO` when no closer errno fits. `symlink` and `link` fail with `EPERM`, as POSIX asks of a
filesystem without them. Locks stay in the kernel. The adapter answers `ENOSYS` only where the
kernel then does the work itself (`lseek`, `copy_file_range`) or fails with `EOPNOTSUPP` (extended
attributes, `fallocate`): for any other operation, the kernel stops asking for the rest of the mount, and for
`fsync`, `flush` and `access` it then reports success.

### The connection

`Remote::new` takes a ready gRPC `Channel` and a session key. The adapter mounts with `fuser`, in
pure Rust through `fusermount3`. It picks the endpoint (HTTPS with the system's root certificates
outside local development), reads the key from a file that only its owner can access, never from
the command line, and takes the root folders as `--folder NAME=OBJECT_ID`. It refreshes the
session every 15 minutes (it expires one hour after its last refresh), and unmounts on SIGINT or
SIGTERM.

## Plan

Each step is a small pull request with its tests, and leaves the mount working. The server answers
`UNSUPPORTED` to `Lookup`, `List`, `ReadFiles` and `Apply` today: each step lands after the server
calls it uses.

1. **Read path, uncached**: `lookup`, `getattr`, `readdir`, `open` and `read` inside folders, with
   the server's `Lookup`, `List` and `Read`. The adapter mounts it.
2. **Cache and budget**: attributes, names and listings under the TTL, and whole listings on a
   lookup miss.
3. **Content cache**: blocks, whole small files, and `ReadFiles` for small siblings.
4. **One FUSE thread**: answers from memory on the FUSE thread.
5. **Writes**: the overlay, the log and its committer, `fsync`, and draining on unmount, with the
   server's `Apply`.
6. **Admission**: changes wait for the commit window.
7. **Proof**: a visibility test that checks `MAX_DELAY` for every kind of change, and benchmarks
   (untar, `git clone` and `git status`, `rg`, `stat`) against local disk.

## Future work

- **Symlinks**: root entries as symlinks to anchors, as URI.md specifies, and symlinks stored in
  dfs, for which the protocol reserves the `SYMLINK` kind (dust-tt/tasks#11118).
- **Listing revalidation**: checking expired listings with `Stat` versions instead of fetching them
  again, which makes repeated `git status` several times faster.
