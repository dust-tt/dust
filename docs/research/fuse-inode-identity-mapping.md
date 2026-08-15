# Mapping Dust node IDs to FUSE inode numbers

Date: 2026-08-13

## Recommendation

Do not change the PostgreSQL sequence to reserve `file_system_nodes.id = 1`.
Keep Dust's existing region-safe ID allocation and add one small, reversible
translation at the FUSE boundary:

```text
FUSE inode 1                 = synthetic /files root
database node 1             = FUSE inode 0x8000_0000_0000_0001
every other database node N = FUSE inode N
```

The database column is a signed `BIGINT`, while the FUSE protocol carries a
`uint64_t` inode. Setting the high bit therefore creates a collision-free
exception for database node `1` without changing the database allocator or
adding a table. The reverse mapping is equally small. Add tests for database
node `1`, its children, ordinary IDs, rename/move, remount, and rejection of
invalid high-bit values.

This preserves the useful property that `ls -i` equals
`file_system_nodes.id` for every normal row. The single exception should be
documented in the debugging query/helper rather than pushed into regional
sequence configuration.

If Dust later replaces numeric database IDs with UUIDs, add a persistent,
unique `inodeNumber BIGINT` allocated with the node. Do not truncate or hash a
UUID into 64 bits: an unhandled collision makes two different files appear to
be the same inode.

## What FUSE requires

- FUSE reserves node ID `1` for the mounted filesystem's root. Node IDs are
  unsigned 64-bit values. [Linux FUSE protocol](https://github.com/torvalds/linux/blob/master/include/uapi/linux/fuse.h#L387-L390),
  [libfuse low-level API](https://github.com/libfuse/libfuse/blob/master/include/fuse_lowlevel.h#L41-L45)
- An inode number is filesystem identity, not a database identity. Linux only
  requires each file's inode number to be unique within the filesystem; the
  pair `(st_dev, st_ino)` identifies it system-wide. Nothing requires
  `st_ino` to equal an application's primary key.
  [Linux `inode(7)`](https://man7.org/linux/man-pages/man7/inode.7.html)
- Libfuse describes the lookup result's inode as unique. The kernel can keep
  sending requests for an unlinked inode until its lookup count is forgotten,
  so a number cannot be reassigned to a different live object just because its
  path was deleted. [libfuse entry and forget contract](https://github.com/libfuse/libfuse/blob/master/include/fuse_lowlevel.h#L59-L79),
  [libfuse forget contract](https://github.com/libfuse/libfuse/blob/master/include/fuse_lowlevel.h#L238-L264)
- Stability across an ordinary unmount/remount is not a FUSE requirement. On
  unmount, lookup counts implicitly fall to zero. If a filesystem is exported
  over NFS, however, libfuse requires the `(inode, generation)` pair to remain
  unique for the filesystem's lifetime, including when numbers are reused.
  [libfuse generation contract](https://github.com/libfuse/libfuse/blob/master/include/fuse_lowlevel.h#L69-L79),
  [libfuse unmount behavior](https://github.com/libfuse/libfuse/blob/master/include/fuse_lowlevel.h#L257-L264)

Dust wants stronger behavior than FUSE requires: the same durable node should
show the same number after a remount and after a move. Deriving the FUSE number
reversibly from the stable database ID gives that behavior without daemon
state.

## How production implementations choose numbers

### Persistent metadata filesystems use their metadata inode

JuiceFS defines its metadata inode as a `uint64`, reserves `1` as
`RootInode`, and stores parent and link metadata in terms of that inode. It can
return the same number on every client because its metadata model owns the
inode namespace. [JuiceFS metadata types](https://github.com/juicedata/juicefs/blob/main/pkg/meta/interface.go#L111-L130)

This is closest to Dust: `file_system_nodes.id` is already a durable node
identity. The only mismatch is Dust's legitimate database row `1` versus the
synthetic FUSE root.

### Object adapters commonly allocate numbers per mount

Backends such as GCS and S3 expose names and object versions, not POSIX inode
IDs. Their adapters therefore keep a mount-local lookup table:

- Cloud Storage FUSE starts `nextInodeID` at `RootInodeID + 1`, increments it
  when an object is first materialized, and indexes live inode objects by that
  generated number. A new remote object generation can deliberately receive a
  new inode. [gcsfuse initialization](https://github.com/GoogleCloudPlatform/gcsfuse/blob/master/internal/fs/fs.go#L176-L200),
  [gcsfuse allocator](https://github.com/GoogleCloudPlatform/gcsfuse/blob/master/internal/fs/fs.go#L863-L917),
  [gcsfuse generation handling](https://github.com/GoogleCloudPlatform/gcsfuse/blob/master/internal/fs/fs.go#L1000-L1072)
- Mountpoint for S3 creates root inode `1`, starts an atomic counter at `2`,
  and stores generated numbers in an in-memory `HashMap`. It allocates a new
  number when it discovers a new object. [Mountpoint superblock initialization](https://github.com/awslabs/mountpoint-s3/blob/main/mountpoint-s3-fs/src/superblock.rs#L205-L230),
  [Mountpoint allocation](https://github.com/awslabs/mountpoint-s3/blob/main/mountpoint-s3-fs/src/superblock.rs#L1716-L1755),
  [Mountpoint inode map](https://github.com/awslabs/mountpoint-s3/blob/main/mountpoint-s3-fs/src/superblock.rs#L1794-L1809)
- Go-FUSE accepts a caller-provided stable inode number, but when the caller
  supplies `0` it allocates a unique sequential number starting at `2^63`.
  Its contract is only uniqueness among currently live objects unless NFS
  generation semantics are needed. [Go-FUSE `StableAttr`](https://github.com/hanwen/go-fuse/blob/master/fs/inode.go),
  [Go-FUSE inode model](https://github.com/hanwen/go-fuse/blob/master/fs/api.go)

Those mount-local strategies are valid, but they would discard the identity
Dust already has and make `ls -i` change across daemon restarts. A persistent
mapping table would restore stability, at the cost of another allocator and
lookup on every cold node. Dust does not need that table while its node key is
already a positive signed `BIGINT`.

## Collision and hard-link rules

Two paths to the same inode represent hard links: they share content and
metadata, and `st_nlink` reports the number of links. Conversely, two distinct
nodes must never share an inode number. Linux states that inode numbers are
unique within a filesystem, and Go-FUSE models multiple parents as hard links
around one inode object. [Linux `inode(7)`](https://man7.org/linux/man-pages/man7/inode.7.html),
[Go-FUSE inode model](https://github.com/hanwen/go-fuse/blob/master/fs/api.go)

Therefore:

- a plain 64-bit hash of a UUID is insufficient unless collisions are detected
  and resolved through a persistent mapping;
- a per-mount table must keep entries alive through unlink/rename while the
  kernel still holds lookup or open references;
- if Dust adds real hard links, every directory entry for the same Dust node
  must return the same FUSE inode and a correct link count;
- moving a node between conversation and pod paths must retain its inode
  because the node identity did not change.

## Decision

Use a root-only, high-bit escape mapping now. It is smaller than changing the
database schema, respects regional sequence allocation, preserves stable Dust
identity through moves and remounts, and has no collision risk while node IDs
remain positive PostgreSQL `BIGINT`s. Revisit a dedicated persistent inode
column only if the durable node key stops fitting this reversible mapping.
