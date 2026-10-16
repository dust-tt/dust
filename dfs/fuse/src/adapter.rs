//! Serves `dfs_mount::Fs` to the kernel through `fuser`.

use dfs_mount::Fs;
use fuser::{
    AccessFlags, BsdFileFlags, Config, FileHandle, Filesystem, INodeNo, IoctlFlags, KernelConfig,
    LockOwner, OpenFlags, RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory,
    ReplyEmpty, ReplyEntry, ReplyIoctl, ReplyOpen, ReplyStatfs, ReplyWrite, Request, TimeOrNow,
    WriteFlags,
};
use std::{ffi::OsStr, io, sync::Arc, time::SystemTime};
use tokio::runtime::Handle;

/**
 * @cc [owner:fontanierh,label:security] owner-only
 * Only the user running the adapter MUST be able to use the mount (no `allow_other`): every user that
 * reaches it acts as the session.
 */
/**
 * @cc [owner:fontanierh,label:performance] no-default-permissions
 * The mount MUST be read-write without `default_permissions`. `access`, `open`, `opendir`, `create`
 * and each change MUST check the caller against the mode bits the library caches instead.
 */
/**
 * @cc [owner:fontanierh,label:performance] one-fuse-thread
 * The session MUST read kernel requests on one FUSE thread. A request that would wait for the server
 * MUST finish on the Tokio runtime instead of holding that thread.
 */
pub(crate) fn config() -> Config {
    todo!()
}

/// The `fuser` filesystem. Each request runs on the FUSE thread until it would wait for the server,
/// then finishes as a task on `runtime`. Every inode belongs to the user running the adapter.
#[expect(dead_code, reason = "read once the operations are implemented")]
pub(crate) struct Adapter {
    fs: Arc<Fs>,
    runtime: Handle,
}

impl Adapter {
    pub(crate) fn new(_fs: Arc<Fs>, _runtime: Handle) -> Self {
        todo!()
    }
}

/**
 * @cc [owner:fontanierh,label:product] library-cache-only
 * Entry and attribute replies MUST have a zero TTL, files MUST be opened with direct I/O, and `init`
 * MUST NOT enable readdirplus or the writeback cache: the library's cache, under the delay budget, is
 * the only one.
 */
/**
 * @cc [owner:fontanierh,label:error-handling] no-enosys
 * The adapter MUST NOT leave `fuser`'s `ENOSYS` default on an operation unless the kernel then
 * handles it itself (`lseek`, `copy_file_range`) or fails it with `EOPNOTSUPP` (extended
 * attributes, `fallocate`).
 */
impl Filesystem for Adapter {
    /// Runs once when the mount starts, to agree with the kernel on the features and limits of the
    /// session. Asks for parallel directory operations, atomic `O_TRUNC` and 1 MiB writes.
    fn init(&mut self, _req: &Request, _config: &mut KernelConfig) -> io::Result<()> {
        todo!()
    }

    /// Finds a name in a directory and returns its inode number and attributes: the kernel resolves
    /// a path one name at a time this way. Each success counts one lookup of the inode, which the
    /// kernel gives back later through `forget`. Fails with `ENOENT` for a name that is not UTF-8:
    /// no dfs object has one.
    fn lookup(&self, _req: &Request, _parent: INodeNo, _name: &OsStr, _reply: ReplyEntry) {
        todo!()
    }

    /// Tells the mount that the kernel dropped `nlookup` of its lookups of an inode. Once all of
    /// them are dropped, the kernel no longer uses that inode number and the mount can forget the
    /// object. It has no reply.
    fn forget(&self, _req: &Request, _ino: INodeNo, _nlookup: u64) {
        todo!()
    }

    /// Returns an inode's attributes (type, size, permissions, times), for `stat`.
    fn getattr(&self, _req: &Request, _ino: INodeNo, _fh: Option<FileHandle>, _reply: ReplyAttr) {
        todo!()
    }

    /// Changes an inode's attributes, for `truncate`, `utimensat`, `chmod` and `chown`. Changes the
    /// size or times. Fails with `EPERM` for a mode or owner change: dfs does not store them.
    fn setattr(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        _size: Option<u64>,
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        _fh: Option<FileHandle>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        _reply: ReplyAttr,
    ) {
        todo!()
    }

    /// Creates a file in a directory, for `mknod` (the kernel uses `create` for `open` with
    /// `O_CREAT`). Creates regular files only. Fails with `EPERM` for other node types (devices,
    /// FIFOs, sockets).
    fn mknod(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _name: &OsStr,
        _mode: u32,
        _umask: u32,
        _rdev: u32,
        _reply: ReplyEntry,
    ) {
        todo!()
    }

    /// Creates a directory, for `mkdir`.
    fn mkdir(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _name: &OsStr,
        _mode: u32,
        _umask: u32,
        _reply: ReplyEntry,
    ) {
        todo!()
    }

    /// Removes a name that is not a directory, for `unlink`.
    fn unlink(&self, _req: &Request, _parent: INodeNo, _name: &OsStr, _reply: ReplyEmpty) {
        todo!()
    }

    /// Removes an empty directory, for `rmdir`.
    fn rmdir(&self, _req: &Request, _parent: INodeNo, _name: &OsStr, _reply: ReplyEmpty) {
        todo!()
    }

    /// Moves an entry to a new name, possibly in another directory, for `rename` and `renameat2`.
    /// `flags` can ask not to replace an existing target.
    fn rename(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _name: &OsStr,
        _newparent: INodeNo,
        _newname: &OsStr,
        _flags: RenameFlags,
        _reply: ReplyEmpty,
    ) {
        todo!()
    }

    /// Opens a file and returns a handle, which the `read`, `write`, `flush` and `release` calls on
    /// that open file carry. Opens with direct I/O, and truncates for `O_TRUNC`.
    fn open(&self, _req: &Request, _ino: INodeNo, _flags: OpenFlags, _reply: ReplyOpen) {
        todo!()
    }

    /// Returns the bytes of a file from `offset`: `size` of them, or fewer at the end of the file.
    fn read(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _offset: u64,
        _size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _reply: ReplyData,
    ) {
        todo!()
    }

    /// Writes `data` into a file at `offset`, and returns how many bytes it wrote.
    fn write(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _offset: u64,
        _data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _reply: ReplyWrite,
    ) {
        todo!()
    }

    /// Runs on each `close` of a file descriptor. Several descriptors can share an open file (after
    /// `dup` or `fork`), so this does not end it. Succeeds without waiting for the server: `fsync`
    /// is the durability barrier.
    fn flush(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _lock_owner: LockOwner,
        _reply: ReplyEmpty,
    ) {
        todo!()
    }

    /// Ends an open file once its last descriptor is closed, freeing the handle `open` returned.
    /// Hands the file's buffered writes to the write log, without waiting for the server.
    fn release(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        _reply: ReplyEmpty,
    ) {
        todo!()
    }

    /// Makes changes durable, for `fsync` and `fdatasync`. Waits until every change acknowledged
    /// before it is committed, and fails with the first failure since the previous `fsync` or
    /// `fsyncdir`.
    fn fsync(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        _reply: ReplyEmpty,
    ) {
        todo!()
    }

    /// Opens a directory and returns a handle, which the `readdir` and `releasedir` calls on that
    /// open directory carry. Takes the directory listing once, for `readdir` to page through.
    fn opendir(&self, _req: &Request, _ino: INodeNo, _flags: OpenFlags, _reply: ReplyOpen) {
        todo!()
    }

    /// Returns the entries of an open directory from `offset`, as many as fit in the reply. The
    /// kernel calls it again from the last offset until it gets no entry, for `getdents`.
    /**
     * @cc [owner:fontanierh,label:product] readdir-offsets
     * `readdir` MUST list `.` and `..` first, and give each entry the offset of the next one, so a
     * call at an offset resumes right after the last entry the kernel took.
     */
    fn readdir(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _offset: u64,
        _reply: ReplyDirectory,
    ) {
        todo!()
    }

    /// Ends an open directory once its last descriptor is closed. Drops the listing `opendir` took.
    fn releasedir(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _flags: OpenFlags,
        _reply: ReplyEmpty,
    ) {
        todo!()
    }

    /// Makes changes durable, for `fsync` on a directory. Same as `fsync`.
    fn fsyncdir(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        _reply: ReplyEmpty,
    ) {
        todo!()
    }

    /// Returns the filesystem's size and free space, for `statfs` and `df`. Reports plenty of free
    /// space, so tools that check it before writing go ahead: dfs has no fixed capacity.
    fn statfs(&self, _req: &Request, _ino: INodeNo, _reply: ReplyStatfs) {
        todo!()
    }

    /// Says whether the caller may read, write or execute an inode, for `access`. Checks the mode
    /// bits for the owner.
    fn access(&self, _req: &Request, _ino: INodeNo, _mask: AccessFlags, _reply: ReplyEmpty) {
        todo!()
    }

    /// Creates a regular file and opens it as `open` does, in one call, for `open` with `O_CREAT`.
    fn create(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _name: &OsStr,
        _mode: u32,
        _umask: u32,
        _flags: i32,
        _reply: ReplyCreate,
    ) {
        todo!()
    }

    /// Runs a device-specific command on an open file, for `ioctl`. Fails with `ENOTTY`, the answer
    /// of a file that takes no ioctl.
    fn ioctl(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _flags: IoctlFlags,
        _cmd: u32,
        _in_data: &[u8],
        _out_size: u32,
        _reply: ReplyIoctl,
    ) {
        todo!()
    }
}
