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

1. **Bounded client delay.** The time a mount holds a change before sending it to the server,
   plus the time it serves a cached reply, is at most `MAX_DELAY` (1 second by default). This
   bound covers only what the mount waits on its own: network and server time come on top. A
   cached reply also outlives a lost read access by at most the cache TTL.
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

- **Send window**: `min(MAX_DELAY / 4, 1 s)`. An acknowledged change is sent to the server within
  it.
- **Cache TTL**: the rest. A cached server reply is served only while less than the TTL has passed
  since its request was sent.

At 1 second, that is 250 ms and 750 ms. Both are measured on the mount's clock, so a change
reaches another mount after at most `MAX_DELAY` of waiting on the two mounts, plus the time the
network and the server take to commit and read it.

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
  its attributes) answers every later lookup and `stat` in that directory, including the names it
  does not hold. Directories known to be larger use `Lookup`, which also returns the attributes.
- **File content** is kept by object and `content_version`, within a fixed memory budget: whole for
  files up to 1 MiB, in 64 KiB blocks for larger ones. It is served only while a live cached
  attribute has the same `content_version`, so bytes outlive the TTL but are never stale: once the
  attribute expires, one `Stat` makes all the cached bytes of the file usable again. A miss on a
  large file reads 1 MiB from the first block it needs.
- **Directory handles**: `opendir` takes the listing once and `readdir` pages through it. A handle
  older than the TTL is refreshed, resuming after the last name it listed.
- **One fetch per file**: a read that needs bytes another request is already fetching waits for
  that fetch instead of sending its own.
- **No older replies**: a reply older than the mount's last committed change to an object is not
  cached for that object.

### Prefetching

Tools such as `rg`, `cat` or a build read many small files from the same directories. A read miss
on a small file from its start fetches that file whole with one `ReadFiles`, and the same call
brings its small siblings:

- Siblings are the files of up to 256 KiB that follow it in the cached listing, wrapping around
  to the start, since parallel walkers do not read in listing order. Files already cached, being
  fetched or changed locally are skipped.
- The first miss in a directory brings up to 16 siblings; later misses there fill the call (256
  files).
- The file and its siblings fit in one `ReadFiles` reply, so a miss still costs one round trip.

A directory walk then costs about one `List` and a few `ReadFiles` per directory, instead of a
`Lookup`, a `Stat` and a `Read` per file.

### Writes

- **Local first**: a change is applied to a local overlay and acknowledged at once. Reads on the
  mount see the overlay over the server's state.
- **Writes read nothing**: opening a file for writing fetches none of it. Reading a file with
  uncommitted changes fetches only the bytes those changes do not cover, so appending to a large
  file, or reading back a new one, downloads nothing. Once a change commits, its overlay is
  dropped and its bytes come from the server again.
- **Buffered writes**: a file's writes collect locally until the file is closed or the next
  `Apply` is formed, and then leave as one operation.
- **One ordered log**: changes become `Apply` operations in a log. One `Apply` is in flight at a
  time, in order, carrying as many operations as fit. Attribute changes fold into the previous
  operation on the same object, and consecutive writes to a file merge.
- **Admission**: a new change waits while the log is full, or while the oldest pending operation
  could not be sent within the send window, since earlier `Apply` calls go first (judging from
  their recent times). A slow server slows writers instead of stretching the delay.
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

## Future work

- **Symlinks**: root entries as symlinks to anchors, as URI.md specifies, and symlinks stored in
  dfs, for which the protocol reserves the `SYMLINK` kind (dust-tt/tasks#11118).
- **Listing revalidation**: checking expired listings with `Stat` versions instead of fetching them
  again, which makes repeated `git status` several times faster.
