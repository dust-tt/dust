//! Serves `dfs_mount::Fs` to the kernel through `fuser`.

use dfs_mount::Fs;
use fuser::{
    Config, FileHandle, Filesystem, INodeNo, IoctlFlags, ReplyAttr, ReplyDirectory, ReplyEmpty,
    ReplyEntry, ReplyIoctl, ReplyXattr, Request,
};
use std::{ffi::OsStr, sync::Arc};
use tokio::runtime::Handle;

/**
 * @cc [owner:fontanierh,label:security] owner-only
 * Only the user running the adapter MUST be able to use the mount (no `allow_other`): every user that
 * reaches it acts as the session.
 */
/**
 * @cc [owner:fontanierh,label:security] read-only-mount
 * The mount MUST be read-only, with `default_permissions`: the kernel refuses writes, and checks the
 * server's mode bits against the owner before asking the mount.
 */
pub(crate) fn config() -> Config {
    todo!()
}

/// The `fuser` filesystem. Each request that may call the server runs as a task on `runtime`, so the
/// FUSE thread takes the next request without waiting for the reply. Every inode belongs to the
/// user running the adapter.
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
 * @cc [owner:fontanierh,label:security] kernel-asks-again
 * Entry and attribute replies MUST have a zero TTL, so the kernel asks the mount again instead of
 * reusing what the server may have refused the session since.
 */
/**
 * @cc [owner:fontanierh,label:error-handling] no-enosys
 * The adapter MUST NOT reply `ENOSYS`, `fuser`'s default for every operation it does not override:
 * it overrides each operation the kernel sends to a read-only mount of directories, with
 * `default_permissions` and without readdirplus.
 */
impl Filesystem for Adapter {
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

    /// Succeeds: there is nothing to write on a read-only mount.
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

    /// Fails with `EOPNOTSUPP` until the library supports extended attributes.
    fn getxattr(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _name: &OsStr,
        _size: u32,
        _reply: ReplyXattr,
    ) {
        todo!()
    }

    /// Fails with `EOPNOTSUPP` until the library supports extended attributes.
    fn listxattr(&self, _req: &Request, _ino: INodeNo, _size: u32, _reply: ReplyXattr) {
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
