# A Dust-owned filesystem

Status: Proposed for staged rollout. Milestone 1 is implemented and has passed
local, live sandbox, and performance tests.

Authors: Flav

Last updated: 2026-08-13

## Decision

Dust should own the file tree used by the product and by sandboxes.

PostgreSQL stores files, directories, names, and parent-child links. GCS stores
immutable versions of file bytes. A Rust process exposes the allowed part of
that tree at `/files` inside a sandbox through FUSE. Product code uses the same
namespace rules through Front.

This replaces gcsfuse for conversation and Pod files. GCS remains the byte
store, but a GCS object name is no longer a user-visible path or a file's
identity.

## Why this change is needed

Today Dust has two models for the same file:

- The sandbox sees a path backed by a GCS object.
- The application may have a Frame or `FileResource` with sharing, preview,
  ownership, and deletion rules.

The path is often the only link between them. This works while the file stays
in place. It breaks down as soon as a person or a program treats the path like
a normal filesystem path.

Consider a Frame stored at `conversation/dashboard.tsx`. A program in the
sandbox moves it to `pod/apps/dashboard.tsx`. The product still considers it
the same Frame. Its shared link, preview, history, and access rules should
continue to work. With a path-based link, however, the old record points to a
file that no longer exists and the new path looks like a different file.

The same problem appears during deletion. Removing a GCS object can leave an
application record behind. Removing a conversation or a Pod can miss objects
whose paths changed. A later cleanup cannot always tell whether a GCS create
and delete were a move, an editor save, or two unrelated operations.

### A path is a location, not an identity

A file keeps its identity when it is renamed or moved. A path does not. Storing
a path in every record that refers to a file makes every move a multi-record
update. Any missed update leaves a dangling record.

GCS gives us an object name and a generation. Neither is a stable file
identity. The object name is the path. The generation identifies one version
of the bytes, not the file across several writes.

### The application and sandbox can both change files

Front can create or delete application records. At the same time, any normal
program in a sandbox can call `rename`, `unlink`, write a temporary file over an
existing file, or move a directory tree.

These calls do not pass through a product-specific command. They come from
shells, editors, compilers, package managers, and agent-written programs. We
therefore need to support normal Linux file operations rather than ask every
program to use a Dust file endpoint.

### GCS events cannot restore the missing intent

An object event reports an object change after it happened. It does not carry
the Linux operation that caused the change. In particular, events cannot
reliably tell the difference between:

- a file move and an unrelated create followed by a delete;
- an editor replacing a file with a temporary file;
- a retried operation and a new operation;
- a cross-root move and a manual copy followed by cleanup.

GCS events are also delivered at least once and may arrive out of order. Object
metadata can help repair a known file, but it is not a safe identity record:
temporary-file replacement and some upload paths replace that metadata.

Events remain useful for audits and repair jobs. They cannot be the source of
truth for the file tree.

### Two mounts split one file tree

The current sandbox has a conversation area and a Pod area. Users expect to
move files between them with `mv`.

With two gcsfuse mounts, Linux sees two mounted filesystems. A `rename` between
them returns `EXDEV`, which means “cross-device link.” Tools then fail or fall
back to copy and delete. Copy and delete changes identity, copies bytes, and can
stop after only half of the work.

Mounting both prefixes through one broad GCS credential would avoid the Linux
mount split, but would give the sandbox wider object access than it needs. It
would also leave GCS paths as the source of truth and would not make the Frame
update part of the move.

### The current model limits the product

The file browser is currently the main way to open a file or Frame. It finds a
GCS path, renders the bytes, and may add sharing information by matching that
path to a `FileResource`.

This couples four separate product concerns:

- where the file is now;
- which file it is;
- which byte version to render;
- what can be shared and with whom.

A stable file identity lets the product separate those concerns. A Frame can
point to a file Node. Moving the Node changes its path, while the Frame and its
shared link stay unchanged. A preview can read the Node's current Blob without
inventing another path-based record.

## Goals

The filesystem must:

1. Give every file and directory a stable identity.
2. Preserve that identity across rename, conversation-to-Pod move, and daemon
   restart.
3. Present all allowed roots through one Linux mount.
4. Support normal command-line tools and editors without Dust-specific changes.
5. Make the application and sandbox use the same file tree.
6. Keep PostgreSQL and GCS credentials out of the sandbox.
7. Keep file bytes out of Front's request path.
8. Make namespace changes safe to retry after a lost response.
9. Recover committed files after a daemon or sandbox restart.
10. Stay close enough to gcsfuse performance for normal agent work.

## Not goals for the first release

The first release does not aim to implement every Linux filesystem feature. It
does not support user-created symbolic links, hard links, special files,
extended attributes, advisory locks, or per-file Unix owners.

The first release also does not move Frame or `FileResource` records. It creates
the stable Node identity that those records can use in the next step.

## Terms

The design keeps the following terms separate:

- **File tree**: all Nodes and their parent and name links. Linux documentation
  often calls this the filesystem namespace.
- **Root**: the top directory for one conversation or Pod.
- **Node**: one file or directory in the Dust file tree. Its database ID is its
  stable identity.
- **Path**: the names followed from a Root to a Node. A move changes the Path,
  not the Node.
- **Blob**: one immutable version of a file's bytes in GCS.
- **Frame**: a product object with rendering and sharing behavior. A Frame may
  point to a Node. A Frame is not a filesystem inode.

Two Linux terms are also important:

- **Inode number**: the number Linux uses to identify a file inside one mounted
  filesystem. Dust returns the Node ID as this number, with one reserved
  mapping for database ID `1` because FUSE uses inode `1` for the mount root.
- **FUSE**: the Linux protocol that sends filesystem requests from the kernel
  to a process in user space. Our long-running Rust process is the FUSE daemon.
  It uses the `fuser` Rust library to speak this protocol. We do not write a
  kernel module.

## What this enables in the product

The filesystem does not make every product object a file. It gives product
code a stable file identity when one is needed.

A Frame backed by a file can store a Node ID. Opening the Frame resolves that
Node's current name, parent, MIME type, and Blob. Moving the Node requires no
change to the Frame or its shared link.

Preview also stops depending on a `FileResource` found by path. Front can read
the Node's MIME type and current Blob and select the renderer directly. A Frame
that is not backed by a file can keep its own content model; this filesystem
does not force it to create a placeholder GCS path.

Publication remains a separate action. It can snapshot a specific Blob or
Frame version into an immutable published artifact. Moving or editing the live
Node does not silently change an already-published result.

Deletion becomes a product choice that can be stated and tested. If a Node is
deleted while a Frame points to it, the Frame can show a deleted-file state or
retain a published snapshot. We no longer need to infer that choice from a
missing GCS path.

## Product rules

The following rules are the reason to own the namespace:

- Sharing attaches to stable identity, not to a path.
- A rename changes only the Node's name or parent.
- A move between a conversation and a Pod keeps the same Node ID.
- Replacing `report.tsx` with `.report.tsx.tmp` follows Linux rename behavior:
  the temporary Node becomes the visible file and the previous destination
  Node is removed.
- Deleting a name removes that Node from the tree. An already-open Linux file
  descriptor may continue reading its local staged bytes until it closes.
- A Blob never changes. A successful write creates a new Blob and points the
  Node at it.
- Access follows the Root that currently contains the Node. Moving a directory
  tree to another Root updates that Root on every child in the same database
  transaction.

These rules apply whether the change starts in the application or in a
sandbox.

## Proposed design

```text
Application code                         Sandbox programs
       |                                      |
       | namespace operation                  | open/read/write/mv/rm
       v                                      v
Front filesystem namespace <--- HTTPS ---> Rust FUSE daemon
       |                                      |
       | names and identity                   | local staged files
       v                                      |
   PostgreSQL                                 |
                                              |
       signed download/upload URLs -----------+
                       |
                       v
                 immutable GCS Blobs
```

PostgreSQL is the source of truth for the tree. GCS is the source of truth for
committed bytes. The local staged directory is a cache and write area. It can
be deleted at any time without losing committed data.

The sandbox sees one mount:

```text
/files/
├── conversation-<conversationId>/
├── conversation/ (the same directory under its short name)
├── pod-<podId>/
└── pod/ (the same directory under its short name)
```

The short names keep existing prompts and tools working. The canonical names
make the selected roots clear. These are directory aliases that return the same
inode, not symbolic links. The current token supports one conversation and one
Pod. The Node model and daemon can expose more Roots later by extending the
signed Root list; they do not require another Linux mount.

There are no gcsfuse mounts below this mount. The Rust daemon sends namespace
requests to Front and transfers bytes using short-lived signed GCS URLs.

Application code keeps using `DustFileSystem`. Storage is split below that
interface into `GCSFileSystemBackend` and `DatabaseFileSystemBackend`. The GCS
class is left as the legacy implementation; database behavior does not sit in
`if` branches inside it. Conversation and Pod flags select one backend when the
filesystem object is built. A filesystem with mixed GCS and database Roots is
rejected, because it could not provide one move and identity contract.

Sandbox mounting follows the same split. `GCSSandboxMountAdapter` starts the
legacy gcsfuse mounts. `DatabaseSandboxMountAdapter` starts the one Rust mount.
This keeps rollout and rollback code at the backend boundary instead of
spreading the feature flag through every file operation.

## Data model

### Nodes

`file_system_nodes` stores one row per file or directory.

| Field                | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `id`                 | Stable Node ID and Linux inode number.                |
| `workspaceId`        | Owning workspace.                                     |
| `parentId`           | Parent Node. `NULL` only for a Root.                  |
| `rootKind`, `rootId` | Conversation or Pod that currently contains the Node. |
| `name`               | Name inside the parent directory.                     |
| `kind`               | `file` or `directory`.                                |
| `mode`               | Unix permission bits reported to tools.               |
| `size`               | Size of the committed Blob.                           |
| `contentType`        | MIME type of the committed Blob.                      |
| `blobId`             | Current Blob, or `NULL` for an empty file.            |
| `contentRevision`    | Number increased after each committed content change. |

The database enforces one name per parent with a unique index on
`(workspaceId, parentId, name)`. It also enforces one Root row per conversation
or Pod.

Paths are derived by following parent links. We do not store a full path on the
Node.

Linux reserves FUSE inode `1` for `/files`. PostgreSQL is still allowed to
create Node ID `1`; Rust maps that one ID to
`0x8000_0000_0000_0001`. Every other positive PostgreSQL `BIGINT` is returned
unchanged. The mapping has no table and does not change regional database
sequences.

### Blobs

GCS object names do not contain user paths:

```text
w/<workspaceId>/filesystem/blobs/<nodeId>/<blobId>
```

Moving a Node therefore does not move or copy its bytes. Writing new content
creates a new `blobId`. Old and abandoned Blobs enter a cleanup queue and are
deleted after signed download URLs have expired.

### Mutation receipts

Create, rename, and delete requests carry a random request ID. Front stores the
request ID and the exact result in `file_system_mutations` in the same
transaction as the namespace change.

If the database commits but the HTTP response is lost, Rust repeats the same
request ID. Front returns the saved result instead of applying the change a
second time. Receipts expire after seven days.

### Blob cleanup

`file_system_blob_cleanups` is a durable cleanup queue. A new Blob is registered
before the daemon uploads bytes. Committing the Blob marks it live and retires
the previous Blob. A failed upload, failed commit, replaced Blob, or deleted
Node leaves work for the cleanup job.

This keeps GCS cleanup independent from an interactive filesystem request.

## Filesystem operations

### Lookup and directory listing

Linux sends a parent inode and a name. Rust asks Front for the child Node.
Directory listing asks Front for children in name order. Rust caches Node
metadata and listings for one second, matching the one-second cache time it
reports to Linux.

The cache has fixed limits and is cleared for affected directories after local
create, rename, and delete calls. Another writer becomes visible after the
short cache window.

### Read

On the first `open`:

1. Rust asks Front for the Node's current Blob.
2. Front returns a short-lived signed GCS download URL.
3. Rust downloads the Blob to a private local staged file.
4. Later `read` calls use that local file.

Front and GCS are not used again for reads on that open file descriptor. A
Front outage therefore does not stop reads from an already-open file.

Closed staged files are kept in a bounded least-recently-used cache. Open files
stay pinned even if the cache is over its limit, because Linux expects an open
file descriptor to remain usable.

### Write and `fsync`

Writes change the local staged file. To commit:

1. Rust asks Front to prepare a Blob, including the Blob ID that was current
   when the file was opened.
2. Front checks write access and returns a signed GCS upload URL.
3. Rust uploads the staged file directly to GCS.
4. Front checks the object's size and MIME type.
5. Front changes the Node to the new Blob only if the old Blob ID still
   matches.

The last check is compare-and-swap. If another writer committed first, the late
writer receives `ESTALE` instead of overwriting newer content.

When `fsync` returns success, the new Blob is in GCS and the Node points to it
in PostgreSQL. Front never carries the file bytes.

Only one writable open is allowed per Node inside one daemon. Two separate
daemons can still race; compare-and-swap chooses the first commit and rejects
the other.

### Truncating writes

Linux uses the `O_TRUNC` open flag for commands such as `echo value > file`.
The mount negotiates `FUSE_ATOMIC_O_TRUNC`, so truncation happens on the staged
write handle. It does not first publish an empty Blob.

`flush` may be called more than once, and Linux ignores errors returned by the
final `release`. The daemon therefore makes commit calls safe to repeat and
reports write failures at `flush` or `fsync` while the caller can still receive
them. A truncate with no later write is committed when the last handle closes.

### Rename and move

Rename changes `parentId` and `name` in PostgreSQL. The Node ID and Blob do not
change.

Because all allowed Roots are directories in one mounted filesystem, Linux can
send a normal `rename` when a file moves from a conversation to a Pod. Front
updates the moved subtree's `rootKind` and `rootId` in the same transaction so
later access checks use the destination Root.

If a destination already exists, rename removes that destination and puts the
source Node at the destination name. This matches the behavior editors rely on
for atomic save. An open descriptor for the old destination keeps its local
staged file until close, but it can no longer commit into the removed Node.

### Delete

`unlink` removes a file Node and retires its current Blob. `rmdir` removes only
an empty directory. Recursive deletion remains a sequence of normal directory
and file removals, as it is on Linux.

An open descriptor survives unlink locally until close. Writes made after the
unlink are not uploaded, because the Node no longer has a name or product
owner.

When Frames attach to Nodes, product deletion rules must use the Node ID. That
work is separate from this first filesystem milestone. The filesystem should
not guess Frame ownership from a path.

## Ordering and retries

Front serializes namespace writes per workspace with a PostgreSQL transaction
advisory lock. This keeps a directory move and a concurrent child change from
leaving different `rootKind` values in one subtree. Reads do not take this
lock.

The lock is intentionally simple for the first rollout. Namespace calls are a
small part of file byte traffic, and current measurements are well below a
workspace-level limit. Canary metrics must show whether large workspaces need
finer locks later.

Rust retries short network failures, rate limits, and server errors only when
the operation is safe to repeat. Namespace writes reuse their mutation request
ID. Content commits reuse the prepared Blob ID.

## Access and credentials

The sandbox receives a signed Dust token in a root-owned mode-`0600` file. The
token names the workspace, sandbox, and allowed conversation and Pod Roots.
Front builds the read and write scope from those signed claims, not from IDs in
the request body.

The sandbox receives:

- no PostgreSQL credential;
- no GCS service-account credential;
- no ability to list the workspace bucket;
- short-lived signed URLs for one exact Blob upload or download.

The daemon runs as root so it can mount FUSE, while sandbox programs use the
mounted tree. The token file and local staged directory are owned by root and
are not readable by other users.

Local opens use `O_NOFOLLOW` for the token and staged cache files. A replaced
symbolic link therefore cannot redirect the daemon to another host path.

Unix mode bits are stored for tool compatibility. They are not the security
check. The signed Root scope is the security check.

## Crash and outage behavior

### Daemon crash

The daemon does not keep any committed state only in memory. After a crash it
removes old staged files, reads the tree from PostgreSQL, and downloads current
Blobs again when files open.

The Rust supervisor restarts a mount child that exits and lazily detaches a
dead mount before creating a new one. systemd restarts the supervisor itself.
An existing Linux file descriptor cannot survive a FUSE remount; callers must
reopen the path. This is normal FUSE behavior and is why daemon restarts should
be rare.

### Front outage

Already-open files continue local reads and writes. Namespace calls and new
opens need Front and may fail or wait. `fsync` cannot report success until Front
and GCS commit the new Blob.

At most 32 Front-backed operations run at once in one daemon. Calls beyond that
limit receive `EAGAIN`, which prevents an outage from filling memory with
blocked work.

### Lost response

Mutation receipts make namespace writes safe after a lost HTTP response. Blob
registration and compare-and-swap make content commits safe after a lost
response. Cleanup jobs remove uploads that never became live.

### Sandbox pause and resume

The tree and committed bytes live outside the sandbox. On wake, Front refreshes
the signed token. Before rollout, the wake path must also check that `/files`
answers a filesystem request and restart the mount if it does not.

## Why a Dust FUSE daemon

The daemon is the one place where an ordinary Linux operation becomes a Dust
namespace operation. Without it, we would need special commands for every
shell, editor, compiler, and agent-written program.

The implementation is smaller than a general filesystem because Dust already
owns the metadata and does not implement disks, block allocation, user
accounts, hard links, or a distributed cache. Rust handles Linux requests,
local staged files, and signed transfers. Front handles identity, names,
access, and database transactions.

The daemon is also not sandbox-specific storage. A sandbox is one client of the
Dust file tree. Product endpoints, background jobs, and future previews should
use the same Node IDs and namespace rules through Front.

## Options considered

### Keep paths and repair records from GCS events

This is the smallest code change, but it cannot preserve identity exactly.
Rename intent, temporary-file replacement, and retries are missing from the
event stream. The product remains eventually repaired rather than correct when
the filesystem call returns.

### Keep two gcsfuse mounts

This keeps narrow credentials, but conversation-to-Pod rename remains a
cross-filesystem copy and delete. Product records still need path repair.

### Use one broad gcsfuse mount

This can make Linux rename possible when both prefixes share a bucket. GCS
can also issue one downscoped credential limited to a small set of prefixes, so
the credential does not have to cover the whole bucket. It still leaves the
object name as file identity and does not update a Frame or other product record
in the rename operation. We would still need an event-based repair path for the
main problem in this document.

### Put a Dust FUSE layer over gcsfuse

We built and measured this shape. It can see rename and delete calls, but it
stacks our FUSE process over gcsfuse and adds a second cache system to the read
path. It must translate open handles while the lower mount changes, and paths
remain the storage identity. Owning the Node tree is smaller once we accept
that the application needs stable identity.

### Fork gcsfuse

gcsfuse does not expose a supported runtime plugin for namespace calls. A fork
would make every gcsfuse upgrade a merge task while still starting from an
object-name model. This is a poor place for Dust product rules.

### Use JuiceFS or another full filesystem

JuiceFS provides stable inodes and normal rename behavior, but its client needs
broader metadata and object-store access than we want inside a sandbox. It also
stores bytes in its own block layout, which makes exit and direct GCS tools
harder. Other full filesystems add servers or storage formats that Dust would
have to run without removing the need to link Nodes to Frames.

### Run a central NFS server

A Dust NFS server could own the same Node model, but every metadata call and
every byte would cross a shared server fleet. The per-sandbox FUSE daemon keeps
open-file I/O local and transfers bytes directly to GCS.

## Performance results

We ran the same workload twice on fresh `dust-base_0-8-80` sandboxes. Each run
used one sandbox with two gcsfuse mounts and one sandbox with Dust FUSE. The
table shows the range of the two run medians (p50 wall time), rather than
choosing the faster run.

| Operation                | Two gcsfuse mounts |      Dust FUSE |
| ------------------------ | -----------------: | -------------: |
| Cold read, 1 MiB         |       773–1,034 ms |     778–864 ms |
| Warm read, 1 MiB         |       1.30–1.67 ms |   1.57–1.79 ms |
| Write and `fsync`, 1 MiB |     1,089–1,355 ms | 1,252–1,307 ms |
| Create                   |         356–515 ms |       78–81 ms |
| Rename                   |         777–893 ms |     183–186 ms |
| Delete                   |         401–662 ms |     143–152 ms |
| Conversation-to-Pod move |       877–1,129 ms |     175–183 ms |

The two filesystems were close on large writes. Eight concurrent 1 MiB writes
and `fsync` calls took 5.83–7.50 seconds with gcsfuse and 7.76–7.94 seconds with
Dust FUSE. This is the clearest current performance gap and needs a real agent
workload before rollout. Peak filesystem-process memory was 247–248 MiB for two
gcsfuse processes and 11.7 MiB for one Dust process.

The other trade-off is warm transfer of larger cached files. An 8 MiB warm read
took 3.06–3.39 ms with gcsfuse and 8.88–9.32 ms with Dust FUSE. The added time
is small in wall-clock terms, but it is consistent and should remain in the
canary dashboard.

### The same Pod in two sandboxes

We also mounted the same Pod through two separate Dust daemons. Before each
change, the reader sandbox opened the file and listed its parent so both the
Linux and daemon caches were warm. The writer then changed the file and called
`fsync`; the reader reopened it every 10 ms until it saw the new bytes.

Across ten overwrites, committed bytes became visible in the second sandbox in
258–1,189 ms, with a median of about 515 ms. A new non-empty file was readable
after 893 ms. Rename was visible after 1–25 ms, and delete after 569 ms in both
runs. This lag comes from the current one-second metadata cache. It is bounded,
but it is not instant shared-memory behavior.

The identity and write checks passed in both runs:

- each overwrite moved `contentRevision` by exactly one;
- a new non-empty file ended at revision one;
- rename kept the same Node ID and did not change the content revision;
- when both sandboxes wrote from the same revision, one `fsync` succeeded, the
  other returned `ESTALE`, and the revision moved by exactly one;
- after the race, both sandboxes reopened the winning bytes.

These results show that owning the namespace does not require putting Front in
the byte path. Namespace changes are faster, durable writes stay close to
gcsfuse, and memory use is lower. They also make the shared-Pod contract clear:
open handles stay local, reopened paths converge within the metadata-cache
window, and conflicting commits do not silently overwrite each other. This
does not replace a production canary for Front and PostgreSQL load.

## Work completed

Milestone 1 includes:

- one FUSE mount with conversation and Pod Roots;
- stable Node IDs across moves and restarts;
- direct signed GCS reads and writes;
- bounded local content and metadata caches;
- create, rename, replace, delete, directory move, `chmod`, truncate, and
  `statfs`;
- open-rename and open-unlink behavior;
- retry receipts and Blob cleanup records;
- one-writer checks and cross-daemon content compare-and-swap;
- signed Root scope with no database or bucket credential in the sandbox;
- systemd and Rust process supervision;
- local tests, Linux builds, live sandbox tests, and a gcsfuse comparison.

The lower-level implementation record is in
[`cli/dust-sandbox/docs/database-filesystem.md`](../cli/dust-sandbox/docs/database-filesystem.md).

## Rollout

Conversation and Pod records each have a filesystem flag. A sandbox must not
mix a legacy GCS Root with a database Root. Both sides of a conversation and
Pod pair change together.

The proposed rollout is:

1. Keep the feature behind the two existing flags.
2. Run internal and test workspaces on Dust FUSE.
3. Canary new conversations and Pods while tracking mount, Front, PostgreSQL,
   and GCS errors and latency.
4. Add a migration job for existing Roots. Stop writes, import the GCS tree as
   Nodes and Blobs, verify names and bytes, then change both flags.
5. Make Frames and `FileResource` records point to Node IDs.
6. Default new workspaces to Dust FUSE.
7. Export any remaining legacy roots and remove the two gcsfuse mounts.

There should be no dual-writer period for one Root. If rollback is needed after
new writes, export the current Node tree back to path-shaped GCS objects before
changing the flags. Changing only the flag would hide files written to the new
store.

## Production checks

Before a broad rollout we need dashboards and alerts for:

- mount start, restart, and disconnected-mount count;
- Front filesystem operation count, latency, and error code;
- PostgreSQL lock wait and query latency;
- signed GCS download and upload failures;
- `fsync` latency and stale-write count;
- local cache size, hit rate, and eviction count;
- Blob cleanup queue age and failure count;
- namespace receipt count and cleanup age.

The wake path should verify the mounted filesystem, not only refresh its token.
The canary should include sandbox pause and resume, Front outage, GCS failure,
daemon crash, and concurrent moves in a large directory tree.

## Risks and follow-up work

### PostgreSQL load

Cold metadata calls now reach Front and PostgreSQL. The one-second cache removes
most repeated calls, and the first benchmark is healthy, but a production
canary must measure query count and workspace lock waits.

### Daemon maintenance

The Rust code handles a small set of Linux operations, but those operations
must be correct. We should keep the supported set explicit, test it through the
mounted filesystem, and resist adding Linux features without a product need.

### Frame and file migration

Stable Nodes solve the identity problem but do not migrate existing Frame and
`FileResource` references by themselves. The next milestone must define which
product object owns the association, how sharing resolves a Node, and what a
shared link displays after the Node is deleted.

### Open files during restart

Linux cannot keep an open FUSE file descriptor working after the mount process
is replaced. Process supervision restores the path for new opens, not old file
descriptors. We should deploy daemon changes by replacing sandboxes or during
an idle window rather than restarting active mounts in place.

## Success criteria

We should consider the migration successful when:

- a Frame keeps working after its file moves between a conversation and a Pod;
- application and sandbox listings show the same Nodes;
- deleting a Node leaves no live Blob after the cleanup delay;
- no sandbox has database or bucket credentials;
- normal editor save, move, delete, and build workflows pass without Dust-aware
  code;
- durable write latency stays within the agreed gcsfuse range;
- a daemon crash loses no committed bytes or Node identity;
- the old path-based join is no longer used for sharing or deletion.

## Final reason

The key choice is not Rust versus Go or FUSE versus a file endpoint. It is
whether Dust treats a file as a stable product object or as a GCS path.

Once files can be created and moved by normal programs, a path cannot safely
carry identity, sharing, and cleanup rules. Owning the Node tree gives Dust one
place to apply those rules. FUSE makes that tree usable by existing Linux
programs, while signed GCS transfers keep the byte path simple and fast.

## Supporting notes and code

- [Current implementation and full benchmark](../cli/dust-sandbox/docs/database-filesystem.md)
- [Linux atomic truncate behavior](research/fuse-atomic-o-trunc.md)
- [Node ID to FUSE inode mapping](research/fuse-inode-identity-mapping.md)
- [Reproducible gcsfuse comparison](../front/scripts/benchmark_sandbox_filesystems.ts)
- [Two-sandbox shared-Pod workload](../cli/dust-sandbox/tests/filesystem_shared_namespace_benchmark.ts)
