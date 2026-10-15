//! Serves `dfs_mount::Fs` to the kernel through `fuser`.

use dfs_mount::Fs;
use fuser::{
    AccessFlags, BsdFileFlags, Config, FileHandle, Filesystem, INodeNo, IoctlFlags, KernelConfig,
    LockOwner, OpenFlags, RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory,
    ReplyEmpty, ReplyEntry, ReplyIoctl, ReplyOpen, ReplyWrite, Request, TimeOrNow, WriteFlags,
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
 * The mount MUST be read-write without `default_permissions`: `access` and each change check the
 * mode bits the library caches, instead of the kernel fetching attributes before each check.
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
    pub(crate) fn new(_fs: Fs, _runtime: Handle) -> Self {
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
 * handles it itself (locks, `lseek`, `copy_file_range`) or fails it with `EOPNOTSUPP` (extended
 * attributes, `fallocate`).
 */
impl Filesystem for Adapter {
    /// Asks for parallel directory operations, atomic `O_TRUNC` and 1 MiB writes.
    fn init(&mut self, _req: &Request, _config: &mut KernelConfig) -> io::Result<()> {
        todo!()
    }

    /// Fails with `ENOENT` for a name that is not UTF-8: no dfs object has one.
    fn lookup(&self, _req: &Request, _parent: INodeNo, _name: &OsStr, _reply: ReplyEntry) {
        todo!()
    }

    fn forget(&self, _req: &Request, _ino: INodeNo, _nlookup: u64) {
        todo!()
    }

    fn getattr(&self, _req: &Request, _ino: INodeNo, _fh: Option<FileHandle>, _reply: ReplyAttr) {
        todo!()
    }

    /// Changes the mode, size or times.
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

    /// Creates regular files only. Fails with `EPERM` for other node types.
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

    fn unlink(&self, _req: &Request, _parent: INodeNo, _name: &OsStr, _reply: ReplyEmpty) {
        todo!()
    }

    fn rmdir(&self, _req: &Request, _parent: INodeNo, _name: &OsStr, _reply: ReplyEmpty) {
        todo!()
    }

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

    /// Opens with direct I/O, and truncates for `O_TRUNC`.
    fn open(&self, _req: &Request, _ino: INodeNo, _flags: OpenFlags, _reply: ReplyOpen) {
        todo!()
    }

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

    /// Succeeds without waiting for the server: `fsync` is the durability barrier.
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

    /// Waits until every change acknowledged before it is committed, and fails with the first
    /// failure since the previous `fsync` or `fsyncdir`.
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

    /// Same as `fsync`.
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

    /// Checks the mode bits for the owner.
    fn access(&self, _req: &Request, _ino: INodeNo, _mask: AccessFlags, _reply: ReplyEmpty) {
        todo!()
    }

    /// Creates a regular file and opens it as `open` does.
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

    /// Fails with `ENOTTY`, the answer of a file that takes no ioctl.
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
