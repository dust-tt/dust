# How FUSE filesystems handle `open(O_TRUNC)`

Date: 2026-08-13

## Conclusion

Dust's staged-write daemon should negotiate `FUSE_ATOMIC_O_TRUNC`, interpret
`O_TRUNC` in `open` by setting the staged file's logical length to zero, and
keep that truncation in the same dirty write handle as subsequent writes. It
should publish one backend revision at the handle's existing commit boundary
(and on `fsync` when durability is explicitly requested), rather than publishing
an empty object during `open` and another object after the writes.

`FUSE_ATOMIC_O_TRUNC` makes **open plus truncate** one FUSE operation. It does
not make the later `write`/`close` sequence a single kernel transaction. The
daemon is responsible for grouping those changes in its staged handle.

## Protocol behavior

- The kernel protocol describes `FUSE_ATOMIC_O_TRUNC` as meaning that the
  filesystem handles the `O_TRUNC` open flag. In the kernel's open path,
  `fuse_send_open()` strips `O_TRUNC` unless the connection negotiated that
  capability; when negotiated, a successful open also updates the inode size
  and page cache to zero. [Linux protocol definition](https://github.com/torvalds/linux/blob/master/include/uapi/linux/fuse.h#L467-L503),
  [Linux open implementation](https://github.com/torvalds/linux/blob/master/fs/fuse/file.c#L16-L31)
- Libfuse states the externally visible consequence directly: with the
  capability disabled, FUSE calls `truncate()` first and then `open()` with
  `O_TRUNC` removed. Current libfuse enables the capability by default when the
  kernel supports it. Its low-level initialization includes
  `FUSE_CAP_ATOMIC_O_TRUNC` in the default requested capabilities.
  [libfuse capability contract](https://github.com/libfuse/libfuse/blob/master/include/fuse_common.h#L194-L203),
  [libfuse detection](https://github.com/libfuse/libfuse/blob/master/lib/fuse_lowlevel.c#L2670-L2676),
  [default request](https://github.com/libfuse/libfuse/blob/master/lib/fuse_lowlevel.c#L2751-L2766),
  [INIT reply](https://github.com/libfuse/libfuse/blob/master/lib/fuse_lowlevel.c#L2830-L2836)

Therefore the two-request behavior is the compatibility path, not a semantic
requirement. A daemon that can truncate its staged file while opening the write
handle should use the negotiated path.

## Established implementation patterns

### BlobFuse: stage locally, upload on close

BlobFuse 2.4.0 explicitly enabled `atomic_o_trunc` so libfuse would deliver
`O_TRUNC` to `open`. Its release notes also call out the important empty-write
case: when an `O_TRUNC` handle is closed without later modifications, the file
cache updates Azure Storage to a zero-length object. This treats truncation as
state on the open cached handle, not as an immediate standalone upload.
[BlobFuse 2.4.0 release notes](https://github.com/Azure/azure-storage-fuse/releases/tag/blobfuse2-2.4.0)

### Mountpoint for S3: `O_TRUNC` selects one replacement upload

Mountpoint permits overwriting an existing object only when it is opened with
`O_TRUNC`. The upload begins with the first write, and the replacement becomes
visible only when the upload completes, normally on close or `fsync`. Closing
an empty overwrite still completes a zero-byte object. This is the object-store
equivalent of keeping truncate and subsequent writes in one replacement
session, and it avoids exposing an intermediate empty object.
[Mountpoint S3 filesystem semantics](https://github.com/awslabs/mountpoint-s3/blob/main/doc/SEMANTICS.md#reading-and-writing-files)

SSHFS is different because SFTP has a native remote-open truncate flag:
SSHFS maps `O_TRUNC` to `SSH_FXF_TRUNC` on the remote `OPEN`, then sends writes
against that remote handle. It does not need a staged object replacement, but
it follows the same protocol principle: truncate belongs to `open`, rather
than a preliminary path-based truncate request.
[SSHFS open mapping](https://github.com/libfuse/sshfs/blob/master/sshfs.c#L2760-L2797),
[remote open](https://github.com/libfuse/sshfs/blob/master/sshfs.c#L2828-L2845)

## Commit-boundary caveat

Libfuse warns that `flush` is called for every file-descriptor close and may be
called more than once per `open` (for example after `dup` or `fork`), while
`release` is called exactly once per open handle but its return value is
ignored. `fsync` is the explicit durability operation. Consequently:

- keep one handle-level dirty generation for the atomic truncate and writes;
- make repeated `flush` calls idempotent so an unchanged generation is not
  uploaded again;
- surface backend upload failures from `flush` where Linux can return them from
  `close`, while also implementing `fsync` as a durable commit;
- use `release` for final cleanup and as a last-chance commit only if the
  daemon's established lifecycle requires it, because release errors cannot be
  reported to the caller.

[Libfuse `flush`, `release`, and `fsync` contract](https://github.com/libfuse/libfuse/blob/master/include/fuse.h#L3088-L3178)

## Recommended acceptance cases

On Linux, verify both the FUSE request stream and backend revisions:

1. Existing file, `echo "hello" > file`: `OPEN(O_TRUNC)`, writes, one durable
   replacement revision; no preliminary `SETATTR(size=0)` revision.
2. Existing file, `: > file`: one zero-length durable revision.
3. Explicit `truncate(file, 0)` or `ftruncate(fd, 0)`: still handled through
   `SETATTR`/truncate and committed according to its own semantics.
4. Repeated `flush` for a single handle without new writes: no duplicate
   revision.
5. `fsync` followed by close without new writes: the close does not create a
   second revision.
