use std::ffi::OsStr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use fuser::{
    AccessFlags, BsdFileFlags, Config, Errno, FileAttr, FileHandle, FileType, Filesystem,
    FopenFlags, Generation, INodeNo, LockOwner, MountOption, OpenFlags, RenameFlags, ReplyAttr,
    ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyStatfs,
    ReplyWrite, ReplyXattr, Request, SessionACL, TimeOrNow, WriteFlags,
};
use tracing::{error, info};

use super::core::{Attributes, DustFilesystem, EntryKind, FsError, SetAttributes, SetTime};
use super::model::MountTable;
use super::mutation::HttpMutationAdapter;
use super::RuntimeArgs;

const CACHE_TTL: Duration = Duration::ZERO;

pub fn mount(args: RuntimeArgs) -> anyhow::Result<()> {
    info!(
        mountpoint = %args.mountpoint.display(),
        mount_count = args.mount_specs.len(),
        "mounting Dust filesystem"
    );
    let mounts = MountTable::from_specs(args.mount_specs)?;
    let mutations = Arc::new(HttpMutationAdapter::new(args.api_url, args.token_file)?);
    let filesystem = FuseAdapter::new(DustFilesystem::new(mounts, mutations));
    let mut config = Config::default();
    config.mount_options = vec![
        MountOption::FSName("dust-fs-overlay".to_owned()),
        MountOption::RW,
        MountOption::NoDev,
        MountOption::NoSuid,
        MountOption::NoAtime,
    ];
    config.acl = SessionACL::All;
    config.n_threads = Some(4);
    config.clone_fd = true;

    fuser::mount(filesystem, &args.mountpoint, &config)
        .with_context(|| format!("failed to mount {}", args.mountpoint.display()))
}

struct FuseAdapter {
    filesystem: DustFilesystem,
}

impl FuseAdapter {
    fn new(filesystem: DustFilesystem) -> Self {
        Self { filesystem }
    }
}

impl Filesystem for FuseAdapter {
    fn lookup(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        match self.filesystem.lookup(parent.0, name) {
            Ok(entry) => reply.entry(&CACHE_TTL, &to_file_attr(&entry.attributes), Generation(0)),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn getattr(
        &self,
        _request: &Request,
        inode: INodeNo,
        handle: Option<FileHandle>,
        reply: ReplyAttr,
    ) {
        match self
            .filesystem
            .attributes(inode.0, handle.map(|handle| handle.0))
        {
            Ok(attributes) => reply.attr(&CACHE_TTL, &to_file_attr(&attributes)),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn setattr(
        &self,
        _request: &Request,
        inode: INodeNo,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        handle: Option<FileHandle>,
        _creation_time: Option<SystemTime>,
        _change_time: Option<SystemTime>,
        _backup_time: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        let values = SetAttributes {
            mode,
            uid,
            gid,
            size,
            atime: atime.map(to_set_time),
            mtime: mtime.map(to_set_time),
            handle: handle.map(|handle| handle.0),
        };
        match self.filesystem.set_attributes(inode.0, values) {
            Ok(attributes) => reply.attr(&CACHE_TTL, &to_file_attr(&attributes)),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn readlink(&self, _request: &Request, inode: INodeNo, reply: ReplyData) {
        match self.filesystem.readlink(inode.0) {
            Ok(target) => reply.data(&target),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn mkdir(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        reply: ReplyEntry,
    ) {
        match self.filesystem.mkdir(parent.0, name) {
            Ok(entry) => reply.entry(&CACHE_TTL, &to_file_attr(&entry.attributes), Generation(0)),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn unlink(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        reply_empty(self.filesystem.unlink(parent.0, name), reply);
    }

    fn rmdir(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        reply_empty(self.filesystem.rmdir(parent.0, name), reply);
    }

    fn rename(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        new_parent: INodeNo,
        new_name: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        if !flags.is_empty() {
            reply.error(Errno::ENOTSUP);
            return;
        }
        reply_empty(
            self.filesystem
                .rename(parent.0, name, new_parent.0, new_name),
            reply,
        );
    }

    fn open(&self, _request: &Request, inode: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        match self.filesystem.open(inode.0, flags.0) {
            Ok(handle) => reply.opened(FileHandle(handle), FopenFlags::empty()),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn read(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        match self.filesystem.read(handle.0, offset, size) {
            Ok(data) => reply.data(&data),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn write(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        match self.filesystem.write(handle.0, offset, data) {
            Ok(written) => reply.written(written),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn flush(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        _lock_owner: LockOwner,
        reply: ReplyEmpty,
    ) {
        reply_empty(self.filesystem.flush(handle.0), reply);
    }

    fn release(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        reply_empty(self.filesystem.release(handle.0), reply);
    }

    fn fsync(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        data_only: bool,
        reply: ReplyEmpty,
    ) {
        reply_empty(self.filesystem.fsync(handle.0, data_only), reply);
    }

    fn opendir(&self, _request: &Request, inode: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        match self.filesystem.attributes(inode.0, None) {
            Ok(attributes) if attributes.kind == EntryKind::Directory => {
                reply.opened(FileHandle(0), FopenFlags::empty());
            }
            Ok(_) => reply.error(Errno::ENOTDIR),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn readdir(
        &self,
        _request: &Request,
        inode: INodeNo,
        _handle: FileHandle,
        offset: u64,
        mut reply: ReplyDirectory,
    ) {
        let entries = match self.filesystem.read_directory(inode.0) {
            Ok(entries) => entries,
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let offset = match usize::try_from(offset) {
            Ok(offset) => offset,
            Err(_) => {
                reply.error(Errno::EOVERFLOW);
                return;
            }
        };
        for (index, entry) in entries.into_iter().enumerate().skip(offset) {
            let next_offset = match u64::try_from(index.saturating_add(1)) {
                Ok(next_offset) => next_offset,
                Err(_) => {
                    reply.error(Errno::EOVERFLOW);
                    return;
                }
            };
            if reply.add(
                INodeNo(entry.inode),
                next_offset,
                to_file_type(entry.kind),
                entry.name,
            ) {
                break;
            }
        }
        reply.ok();
    }

    fn statfs(&self, _request: &Request, inode: INodeNo, reply: ReplyStatfs) {
        match self.filesystem.stats(inode.0) {
            Ok(stats) => reply.statfs(
                stats.blocks,
                stats.blocks_free,
                stats.blocks_available,
                stats.files,
                stats.files_free,
                stats.block_size,
                stats.name_length,
                stats.fragment_size,
            ),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn access(&self, _request: &Request, inode: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
        reply_empty(
            self.filesystem
                .access(inode.0, mask.contains(AccessFlags::W_OK)),
            reply,
        );
    }

    fn create(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        match self.filesystem.create(parent.0, name, mode, umask, flags) {
            Ok((entry, handle)) => reply.created(
                &CACHE_TTL,
                &to_file_attr(&entry.attributes),
                Generation(0),
                FileHandle(handle),
                FopenFlags::empty(),
            ),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn setxattr(
        &self,
        _request: &Request,
        _inode: INodeNo,
        _name: &OsStr,
        _value: &[u8],
        _flags: i32,
        _position: u32,
        reply: ReplyEmpty,
    ) {
        reply.error(Errno::ENOTSUP);
    }

    fn getxattr(
        &self,
        _request: &Request,
        _inode: INodeNo,
        _name: &OsStr,
        _size: u32,
        reply: ReplyXattr,
    ) {
        reply.error(Errno::ENOTSUP);
    }

    fn listxattr(&self, _request: &Request, _inode: INodeNo, size: u32, reply: ReplyXattr) {
        if size == 0 {
            reply.size(0);
        } else {
            reply.data(&[]);
        }
    }

    fn removexattr(&self, _request: &Request, _inode: INodeNo, _name: &OsStr, reply: ReplyEmpty) {
        reply.error(Errno::ENOTSUP);
    }
}

fn to_file_attr(attributes: &Attributes) -> FileAttr {
    FileAttr {
        ino: INodeNo(attributes.inode),
        size: attributes.size,
        blocks: attributes.blocks,
        atime: attributes.atime,
        mtime: attributes.mtime,
        ctime: attributes.ctime,
        crtime: UNIX_EPOCH,
        kind: to_file_type(attributes.kind),
        perm: attributes.permissions,
        nlink: attributes.links,
        uid: attributes.uid,
        gid: attributes.gid,
        rdev: attributes.rdev,
        blksize: attributes.block_size,
        flags: 0,
    }
}

fn to_file_type(kind: EntryKind) -> FileType {
    match kind {
        EntryKind::File => FileType::RegularFile,
        EntryKind::Directory => FileType::Directory,
        EntryKind::Symlink => FileType::Symlink,
        EntryKind::NamedPipe => FileType::NamedPipe,
        EntryKind::CharDevice => FileType::CharDevice,
        EntryKind::BlockDevice => FileType::BlockDevice,
        EntryKind::Socket => FileType::Socket,
    }
}

fn to_set_time(value: TimeOrNow) -> SetTime {
    match value {
        TimeOrNow::SpecificTime(time) => SetTime::Specific(time),
        TimeOrNow::Now => SetTime::Now,
    }
}

fn to_errno(error: FsError) -> Errno {
    if error.errno == libc::EIO {
        error!(errno = error.errno, error = %error, "Dust filesystem I/O error");
    }
    Errno::from_i32(error.errno)
}

fn reply_empty(result: Result<(), FsError>, reply: ReplyEmpty) {
    match result {
        Ok(()) => reply.ok(),
        Err(error) => reply.error(to_errno(error)),
    }
}
