//! Serves `dfs_mount::Fs` to the kernel through `fuser`.

use dfs_mount::{Attributes, DirEntry, Errno, Fs, Ino, Kind};
use dfs_protocol::{NAME_MAX_BYTES, READ_MAX_BYTES};
use fuser::{
    AccessFlags, BsdFileFlags, Config, FileAttr, FileHandle, FileType, Filesystem, FopenFlags,
    Generation, INodeNo, InitFlags, IoctlFlags, KernelConfig, LockOwner, MountOption, OpenAccMode,
    OpenFlags, RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty,
    ReplyEntry, ReplyIoctl, ReplyOpen, ReplyStatfs, ReplyWrite, Request, SessionACL, TimeOrNow,
    WriteFlags,
};
use std::{
    collections::HashMap,
    ffi::OsStr,
    io,
    path::Path,
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime},
};
use tokio::runtime::Handle;

/// How long the kernel may reuse an entry or attribute reply: not at all (`library-cache-only`).
const TTL: Duration = Duration::ZERO;
/// `st_blocks` counts 512-byte blocks, whatever the filesystem's block size.
const STAT_BLOCK_BYTES: u64 = 512;
/// A directory's links: its entry in its parent and its own `.`.
const DIRECTORY_LINKS: u32 = 2;
/// The largest write the kernel sends in one request.
const MAX_WRITE_BYTES: u32 = 1024 * 1024;
/// How many background requests, such as readahead, the kernel may have pending.
const MAX_BACKGROUND: u16 = 32;
/// The block size `statfs` reports.
const STATFS_BLOCK_BYTES: u32 = 4096;
/// The total and free blocks `statfs` reports: 1 PiB.
const STATFS_BLOCKS: u64 = 1 << 38;
/// The total and free inodes `statfs` reports.
const STATFS_FILES: u64 = 1 << 32;
/// The file type bits of a mode (`S_IFMT`), the same on every POSIX system.
const FILE_TYPE_BITS: u32 = 0o170_000;
/// The file type of a regular file (`S_IFREG`).
const REGULAR_FILE: u32 = 0o100_000;
/// What creating, removing or renaming an entry needs on its directory.
const CHANGE_ENTRIES: AccessFlags = AccessFlags::W_OK.union(AccessFlags::X_OK);

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
    let mut config = Config::default();
    config.mount_options = vec![
        MountOption::FSName("dfs".to_owned()),
        MountOption::RW,
        MountOption::NoDev,
        MountOption::NoSuid,
        // Reads never update dfs timestamps.
        MountOption::NoAtime,
    ];
    config.acl = SessionACL::Owner;
    config.n_threads = Some(1);
    config
}

/// The `fuser` filesystem. Each request runs on the FUSE thread until it would wait for the server,
/// then finishes as a task on `runtime`. Every inode belongs to the user running the adapter.
pub(crate) struct Adapter {
    fs: Arc<Fs>,
    runtime: Handle,
    owner: Owner,
    /// The listings `opendir` took, by file handle.
    dirs: Arc<Mutex<HashMap<u64, OpenDir>>>,
    next_fh: AtomicU64,
}

/// The owner of every inode: the user running the adapter, the only one who can use the mount.
#[derive(Clone, Copy)]
struct Owner {
    uid: u32,
    gid: u32,
}

/// A directory listing taken by `opendir`.
struct OpenDir {
    ino: Ino,
    entries: Vec<DirEntry>,
}

impl Adapter {
    pub(crate) fn new(fs: Arc<Fs>, runtime: Handle) -> Self {
        Self {
            fs,
            runtime,
            owner: Owner {
                uid: nix::unistd::getuid().as_raw(),
                gid: nix::unistd::getgid().as_raw(),
            },
            dirs: Arc::default(),
            next_fh: AtomicU64::new(1),
        }
    }

    /// Must not be held across an `.await`.
    fn dirs(&self) -> MutexGuard<'_, HashMap<u64, OpenDir>> {
        self.dirs.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Answers an operation the library does not support yet: `EOPNOTSUPP` once the caller may do
    /// `mask` on each of `inos`, the reason it may not otherwise.
    fn unsupported(
        &self,
        inos: Vec<Ino>,
        mask: AccessFlags,
        reply: impl FnOnce(fuser::Errno) + Send + 'static,
    ) {
        let fs = self.fs.clone();
        self.runtime.spawn(async move {
            for ino in inos {
                if let Err(e) = check(&fs, ino, mask).await {
                    return reply(errno(e));
                }
            }
            reply(fuser::Errno::EOPNOTSUPP);
        });
    }
}

impl Owner {
    fn file_attr(self, attributes: &Attributes) -> FileAttr {
        let nlink = match attributes.kind {
            Kind::Directory => DIRECTORY_LINKS,
            Kind::File => 1,
        };
        FileAttr {
            ino: INodeNo(attributes.ino),
            size: attributes.size,
            blocks: attributes.size.div_ceil(STAT_BLOCK_BYTES),
            atime: attributes.atime,
            mtime: attributes.mtime,
            ctime: attributes.ctime,
            crtime: attributes.ctime,
            kind: file_type(attributes.kind),
            perm: attributes.permissions,
            nlink,
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            // Tools size their I/O buffers from it: one `Read` request's worth.
            blksize: READ_MAX_BYTES,
            flags: 0,
        }
    }
}

fn file_type(kind: Kind) -> FileType {
    match kind {
        Kind::Directory => FileType::Directory,
        Kind::File => FileType::RegularFile,
    }
}

fn errno(errno: Errno) -> fuser::Errno {
    fuser::Errno::from_i32(errno.0)
}

/**
 * @cc [owner:fontanierh,label:security] owner-bits
 * `allows` MUST be true only when the owner bits of `permissions` include every bit `mask` asks
 * for. `F_OK` asks for none.
 */
fn allows(permissions: u16, mask: AccessFlags) -> bool {
    let owner = i32::from(permissions >> 6) & 0o7;
    let wanted = mask.bits() & 0o7;
    owner & wanted == wanted
}

/// The attributes of `ino`. Fails with `EACCES` unless its owner bits allow `mask`.
async fn check(fs: &Fs, ino: Ino, mask: AccessFlags) -> Result<Attributes, Errno> {
    let attributes = fs.getattr(ino).await?;
    if allows(attributes.permissions, mask) {
        Ok(attributes)
    } else {
        Err(Errno::EACCES)
    }
}

/// The entries of the directory `ino` from `offset`, each with the offset of the next one.
fn listing(
    ino: Ino,
    entries: &[DirEntry],
    offset: u64,
) -> impl Iterator<Item = (u64, Ino, Kind, &str)> {
    // The kernel resolves `..` itself; its inode number in a listing is informational.
    let dots = [".", ".."].map(|name| (ino, Kind::Directory, name));
    let entries = entries
        .iter()
        .map(|entry| (entry.ino, entry.kind, entry.name.as_str()));
    (1..)
        .zip(dots.into_iter().chain(entries))
        .skip_while(move |(next, _)| *next <= offset)
        .map(|(next, (ino, kind, name))| (next, ino, kind, name))
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
 * handles it itself (`lseek`, `copy_file_range`, `poll`) or fails it with `EOPNOTSUPP` (extended
 * attributes, `fallocate`). Operations the kernel never sends to this mount (`readlink` without
 * symbolic links, `readdirplus`, locks, `bmap`) keep the default.
 */
impl Filesystem for Adapter {
    /// Runs once when the mount starts, to agree with the kernel on the features and limits of the
    /// session. Asks for parallel directory operations, atomic `O_TRUNC` and 1 MiB writes.
    fn init(&mut self, _req: &Request, config: &mut KernelConfig) -> io::Result<()> {
        // A kernel without one of these serves the mount without it.
        let _ = config.add_capabilities(InitFlags::FUSE_PARALLEL_DIROPS);
        let _ = config.add_capabilities(InitFlags::FUSE_ATOMIC_O_TRUNC);
        let _ = config.set_max_write(MAX_WRITE_BYTES);
        let _ = config.set_max_background(MAX_BACKGROUND);
        Ok(())
    }

    /// Finds a name in a directory and returns its inode number and attributes: the kernel resolves
    /// a path one name at a time this way. Each success counts one lookup of the inode, which the
    /// kernel gives back later through `forget`. Fails with `ENOENT` for a name that is not UTF-8:
    /// no dfs object has one.
    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let Some(name) = name.to_str().map(str::to_owned) else {
            return reply.error(fuser::Errno::ENOENT);
        };
        let fs = self.fs.clone();
        let owner = self.owner;
        self.runtime.spawn(async move {
            match fs.lookup(parent.0, &name).await {
                // Inode numbers are never reused, so their generation never changes.
                Ok(attributes) => reply.entry(&TTL, &owner.file_attr(&attributes), Generation(0)),
                Err(e) => reply.error(errno(e)),
            }
        });
    }

    /// Tells the mount that the kernel dropped `nlookup` of its lookups of an inode. Once all of
    /// them are dropped, the kernel no longer uses that inode number and the mount can forget the
    /// object. It has no reply.
    fn forget(&self, _req: &Request, ino: INodeNo, nlookup: u64) {
        self.fs.forget(ino.0, nlookup);
    }

    /// Returns an inode's attributes (type, size, permissions, times), for `stat`.
    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        let fs = self.fs.clone();
        let owner = self.owner;
        self.runtime.spawn(async move {
            match fs.getattr(ino.0).await {
                Ok(attributes) => reply.attr(&TTL, &owner.file_attr(&attributes)),
                Err(e) => reply.error(errno(e)),
            }
        });
    }

    /// Changes an inode's attributes, for `truncate`, `utimensat`, `chmod` and `chown`. Changes the
    /// size or times. Fails with `EPERM` for a mode or owner change: dfs does not store them.
    fn setattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        _size: Option<u64>,
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        _fh: Option<FileHandle>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        if mode.is_some() || uid.is_some() || gid.is_some() {
            return reply.error(fuser::Errno::EPERM);
        }
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![ino.0], AccessFlags::W_OK, move |e| reply.error(e));
    }

    /// Creates a file in a directory, for `mknod` (the kernel uses `create` for `open` with
    /// `O_CREAT`). Creates regular files only. Fails with `EPERM` for other node types (devices,
    /// FIFOs, sockets).
    fn mknod(
        &self,
        _req: &Request,
        parent: INodeNo,
        _name: &OsStr,
        mode: u32,
        _umask: u32,
        _rdev: u32,
        reply: ReplyEntry,
    ) {
        if mode & FILE_TYPE_BITS != REGULAR_FILE {
            return reply.error(fuser::Errno::EPERM);
        }
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![parent.0], CHANGE_ENTRIES, move |e| reply.error(e));
    }

    /// Creates a directory, for `mkdir`.
    fn mkdir(
        &self,
        _req: &Request,
        parent: INodeNo,
        _name: &OsStr,
        _mode: u32,
        _umask: u32,
        reply: ReplyEntry,
    ) {
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![parent.0], CHANGE_ENTRIES, move |e| reply.error(e));
    }

    /// Removes a name that is not a directory, for `unlink`.
    fn unlink(&self, _req: &Request, parent: INodeNo, _name: &OsStr, reply: ReplyEmpty) {
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![parent.0], CHANGE_ENTRIES, move |e| reply.error(e));
    }

    /// Removes an empty directory, for `rmdir`.
    fn rmdir(&self, _req: &Request, parent: INodeNo, _name: &OsStr, reply: ReplyEmpty) {
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![parent.0], CHANGE_ENTRIES, move |e| reply.error(e));
    }

    /// Fails with `EPERM`, as POSIX asks of a filesystem without symbolic links.
    fn symlink(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _link_name: &OsStr,
        _target: &Path,
        reply: ReplyEntry,
    ) {
        reply.error(fuser::Errno::EPERM);
    }

    /// Moves an entry to a new name, possibly in another directory, for `rename` and `renameat2`.
    /// `flags` can ask not to replace an existing target.
    fn rename(
        &self,
        _req: &Request,
        parent: INodeNo,
        _name: &OsStr,
        newparent: INodeNo,
        _newname: &OsStr,
        _flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![parent.0, newparent.0], CHANGE_ENTRIES, move |e| {
            reply.error(e)
        });
    }

    /// Fails with `EPERM`, as POSIX asks of a filesystem without hard links.
    fn link(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _newparent: INodeNo,
        _newname: &OsStr,
        reply: ReplyEntry,
    ) {
        reply.error(fuser::Errno::EPERM);
    }

    /// Opens a file and returns a handle, which the `read`, `write`, `flush` and `release` calls on
    /// that open file carry. Opens with direct I/O, and truncates for `O_TRUNC`.
    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        let mut mask = match flags.acc_mode() {
            OpenAccMode::O_RDONLY => AccessFlags::R_OK,
            OpenAccMode::O_WRONLY => AccessFlags::W_OK,
            OpenAccMode::O_RDWR => AccessFlags::R_OK | AccessFlags::W_OK,
        };
        if flags.0 & libc::O_TRUNC != 0 {
            mask |= AccessFlags::W_OK;
        }
        // Needs the library's file reads, not supported yet.
        self.unsupported(vec![ino.0], mask, move |e| reply.error(e));
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
        reply: ReplyData,
    ) {
        // `open` fails until the library reads files, so no file handle exists.
        reply.error(fuser::Errno::EBADF);
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
        reply: ReplyWrite,
    ) {
        // `open` fails until the library reads files, so no file handle exists.
        reply.error(fuser::Errno::EBADF);
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
        reply: ReplyEmpty,
    ) {
        reply.ok();
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
        reply: ReplyEmpty,
    ) {
        // The library buffers no writes yet.
        reply.ok();
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
        reply: ReplyEmpty,
    ) {
        // The library acknowledges no changes yet.
        reply.ok();
    }

    /// Opens a directory and returns a handle, which the `readdir` and `releasedir` calls on that
    /// open directory carry. Takes the directory listing once, for `readdir` to page through.
    fn opendir(&self, _req: &Request, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        let fh = self.next_fh.fetch_add(1, Ordering::Relaxed);
        let fs = self.fs.clone();
        let dirs = self.dirs.clone();
        self.runtime.spawn(async move {
            let listed = async {
                check(&fs, ino.0, AccessFlags::R_OK).await?;
                fs.readdir(ino.0).await
            };
            match listed.await {
                Ok(entries) => {
                    dirs.lock().unwrap_or_else(PoisonError::into_inner).insert(
                        fh,
                        OpenDir {
                            ino: ino.0,
                            entries,
                        },
                    );
                    reply.opened(FileHandle(fh), FopenFlags::empty());
                }
                Err(e) => reply.error(errno(e)),
            }
        });
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
        fh: FileHandle,
        offset: u64,
        mut reply: ReplyDirectory,
    ) {
        let dirs = self.dirs();
        let Some(dir) = dirs.get(&fh.0) else {
            return reply.error(fuser::Errno::EBADF);
        };
        for (next, ino, kind, name) in listing(dir.ino, &dir.entries, offset) {
            if reply.add(INodeNo(ino), next, file_type(kind), name) {
                break;
            }
        }
        reply.ok();
    }

    /// Ends an open directory once its last descriptor is closed. Drops the listing `opendir` took.
    fn releasedir(
        &self,
        _req: &Request,
        _ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        reply: ReplyEmpty,
    ) {
        self.dirs().remove(&fh.0);
        reply.ok();
    }

    /// Makes changes durable, for `fsync` on a directory. Same as `fsync`.
    fn fsyncdir(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        // The library acknowledges no changes yet.
        reply.ok();
    }

    /// Returns the filesystem's size and free space, for `statfs` and `df`. Reports plenty of free
    /// space, so tools that check it before writing go ahead: dfs has no fixed capacity.
    fn statfs(&self, _req: &Request, _ino: INodeNo, reply: ReplyStatfs) {
        reply.statfs(
            STATFS_BLOCKS,
            STATFS_BLOCKS,
            STATFS_BLOCKS,
            STATFS_FILES,
            STATFS_FILES,
            STATFS_BLOCK_BYTES,
            NAME_MAX_BYTES as u32,
            STATFS_BLOCK_BYTES,
        );
    }

    /// Says whether the caller may read, write or execute an inode, for `access`. Checks the mode
    /// bits for the owner.
    fn access(&self, _req: &Request, ino: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
        let fs = self.fs.clone();
        self.runtime.spawn(async move {
            match check(&fs, ino.0, mask).await {
                Ok(_) => reply.ok(),
                Err(e) => reply.error(errno(e)),
            }
        });
    }

    /// Creates a regular file and opens it as `open` does, in one call, for `open` with `O_CREAT`.
    fn create(
        &self,
        _req: &Request,
        parent: INodeNo,
        _name: &OsStr,
        _mode: u32,
        _umask: u32,
        _flags: i32,
        reply: ReplyCreate,
    ) {
        // Needs the library's writes, not supported yet.
        self.unsupported(vec![parent.0], CHANGE_ENTRIES, move |e| reply.error(e));
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
        reply: ReplyIoctl,
    ) {
        reply.error(fuser::Errno::ENOTTY);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dfs_mount::ROOT_INO;
    use std::time::UNIX_EPOCH;

    const UID: u32 = 1000;
    const GID: u32 = 100;
    const SIZE: u64 = 1025;

    fn entry(ino: Ino, name: &str) -> DirEntry {
        DirEntry {
            ino,
            kind: Kind::Directory,
            name: name.to_owned(),
        }
    }

    #[test]
    fn the_mount_is_read_write_owner_only_and_single_threaded() {
        let config = config();
        assert!(config.mount_options.contains(&MountOption::RW));
        assert!(!config.mount_options.contains(&MountOption::RO));
        assert!(
            !config
                .mount_options
                .contains(&MountOption::DefaultPermissions)
        );
        assert_eq!(config.acl, SessionACL::Owner);
        assert_eq!(config.n_threads, Some(1));
    }

    #[test]
    fn file_attributes_belong_to_the_owner() {
        let owner = Owner { uid: UID, gid: GID };
        let ctime = UNIX_EPOCH + Duration::from_secs(2);
        let attr = owner.file_attr(&Attributes {
            ino: 7,
            kind: Kind::File,
            size: SIZE,
            permissions: 0o400,
            atime: UNIX_EPOCH,
            mtime: UNIX_EPOCH,
            ctime,
        });
        assert_eq!(attr.ino, INodeNo(7));
        assert_eq!(attr.kind, FileType::RegularFile);
        assert_eq!((attr.size, attr.blocks), (SIZE, 3));
        assert_eq!((attr.perm, attr.nlink), (0o400, 1));
        assert_eq!((attr.uid, attr.gid), (UID, GID));
        assert_eq!(attr.crtime, ctime);
    }

    #[test]
    fn only_owner_bits_grant_access() {
        assert!(allows(0o000, AccessFlags::F_OK));
        assert!(allows(0o500, AccessFlags::R_OK | AccessFlags::X_OK));
        assert!(!allows(0o500, AccessFlags::W_OK));
        assert!(!allows(0o500, CHANGE_ENTRIES));
        assert!(allows(0o700, CHANGE_ENTRIES));
        // Group and other bits grant nothing.
        assert!(!allows(0o077, AccessFlags::R_OK));
    }

    #[test]
    fn listings_resume_after_the_offset() {
        let entries = [entry(2, "a"), entry(3, "b")];
        let names = |offset| {
            listing(ROOT_INO, &entries, offset)
                .map(|(next, _, _, name)| (next, name))
                .collect::<Vec<_>>()
        };
        assert_eq!(names(0), [(1, "."), (2, ".."), (3, "a"), (4, "b")]);
        assert_eq!(names(3), [(4, "b")]);
        assert!(names(4).is_empty());
        assert!(
            listing(5, &entries, 0)
                .take(2)
                .all(|(_, ino, kind, _)| ino == 5 && kind == Kind::Directory)
        );
    }
}
