//! Handles the file operations sent by the Linux FUSE kernel driver.
//!
//! Each method validates the Linux request, calls `DustFuse` or `FileStore`,
//! and sends exactly one reply back to Linux. Calls that may wait on Front or
//! GCS are handed to the bounded worker pools instead of blocking a FUSE
//! request thread.

use std::os::unix::fs::FileExt;
use std::time::SystemTime;

use super::*;

impl Filesystem for DustFuse {
    fn init(&mut self, _request: &Request, config: &mut KernelConfig) -> io::Result<()> {
        // With this capability Linux carries O_TRUNC on OPEN instead of
        // issuing a separate SETATTR that could become its own revision.
        config
            .add_capabilities(InitFlags::FUSE_ATOMIC_O_TRUNC)
            .map_err(|_| errno(libc::ENOTSUP))
    }

    fn access(&self, _request: &Request, inode: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
        let filesystem = self.clone();
        self.spawn_remote("access", RemoteWork::Metadata, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            let result = filesystem.node(inode).and_then(|node| {
                // The scoped token controls reads and writes. The only Unix
                // mode rule Dust stores is whether a file may be executed.
                if node.kind == NodeKind::File
                    && mask.contains(AccessFlags::X_OK)
                    && node.mode & 0o111 == 0
                {
                    Err(errno(libc::EACCES))
                } else {
                    Ok(())
                }
            });
            reply_ok_or_error(result, reply);
        });
    }

    fn lookup(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let filesystem = self.clone();
        self.spawn_remote("lookup", RemoteWork::Metadata, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            match filesystem.lookup_node(parent, &name) {
                Ok(node) => reply.entry(
                    &KERNEL_ENTRY_TTL,
                    &filesystem.attributes(&node),
                    Generation(0),
                ),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn getattr(
        &self,
        _request: &Request,
        inode: INodeNo,
        handle: Option<FileHandle>,
        reply: ReplyAttr,
    ) {
        if let Some(handle) = handle {
            match self.node_for_free_handle(handle.0, inode) {
                Ok(Some(node)) => {
                    reply.attr(&KERNEL_ENTRY_TTL, &self.attributes(&node));
                    return;
                }
                // A commit is uploading through this handle. The shared file
                // details below carry the same staged size, so `stat` on an
                // open file answers instead of waiting for that upload.
                Ok(None) => {}
                Err(error) => {
                    reply.error(to_errno(error));
                    return;
                }
            }
        }
        let filesystem = self.clone();
        self.spawn_remote("getattr", RemoteWork::Metadata, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            match filesystem.node(inode) {
                Ok(node) => reply.attr(&KERNEL_ENTRY_TTL, &filesystem.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
        });
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
        // Dust records when a file's contents last changed and stores no time
        // chosen by the caller. These two are accepted and dropped: `tar -x`,
        // `cp -p` and `touch` set a time on every file they write, and would
        // otherwise report an error on each one.
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        handle: Option<FileHandle>,
        _creation_time: Option<SystemTime>,
        _change_time: Option<SystemTime>,
        _backup_time: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        if uid.is_some() || gid.is_some() {
            reply.error(Errno::EPERM);
            return;
        }
        if handle.is_some() && mode.is_none() {
            match self.set_attributes(inode, mode, size, handle) {
                Ok(node) => reply.attr(&KERNEL_ENTRY_TTL, &self.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
            return;
        }
        let filesystem = self.clone();
        let work = if size.is_some() {
            RemoteWork::Content
        } else {
            RemoteWork::Metadata
        };
        self.spawn_remote("setattr", work, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            match filesystem.set_attributes(inode, mode, size, handle) {
                Ok(node) => reply.attr(&KERNEL_ENTRY_TTL, &filesystem.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn readlink(&self, _request: &Request, inode: INodeNo, reply: ReplyData) {
        // `/files/conversation` and `/files/pod` are links to the roots that
        // carry a Dust identifier in their name. The daemon builds them when it
        // starts, so answering here needs no call to Front.
        match self.store.read_link(inode) {
            Ok(target) => reply.data(target.as_bytes()),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn mkdir(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        reply: ReplyEntry,
    ) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let permissions = match permissions(mode, umask) {
            Ok(permissions) => permissions,
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let filesystem = self.clone();
        self.spawn_remote("mkdir", RemoteWork::Mutation, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            let result = filesystem.create_directory_node(parent, &name, permissions);
            match result {
                Ok(node) => reply.entry(
                    &KERNEL_ENTRY_TTL,
                    &filesystem.attributes(&node),
                    Generation(0),
                ),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn unlink(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let filesystem = self.clone();
        self.spawn_remote("unlink", RemoteWork::Mutation, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            reply_ok_or_error(filesystem.unlink_node(parent, &name), reply);
        });
    }

    fn rmdir(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let filesystem = self.clone();
        self.spawn_remote("rmdir", RemoteWork::Mutation, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            reply_ok_or_error(filesystem.remove_directory_node(parent, &name), reply);
        });
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
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let new_name = match utf8_name(new_name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let filesystem = self.clone();
        self.spawn_remote("rename", RemoteWork::Mutation, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            reply_ok_or_error(
                filesystem.rename_node(parent, &name, new_parent, &new_name),
                reply,
            );
        });
    }

    fn open(&self, _request: &Request, inode: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        let filesystem = self.clone();
        self.spawn_remote("open", RemoteWork::Content, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            let result = filesystem.open_node(inode, flags.0);
            match result {
                Ok(handle) => reply.opened(FileHandle(handle), FopenFlags::empty()),
                Err(error) => reply.error(to_errno(error)),
            }
        });
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
        let result = (|| {
            let local_file = self.handles.local_file(handle.0)?;
            let mut bytes = vec![0; usize::try_from(size).map_err(|_| errno(libc::EOVERFLOW))?];
            let read = local_file.read_at(&mut bytes, offset)?;
            bytes.truncate(read);
            Ok(bytes)
        })();
        match result {
            Ok(bytes) => reply.data(&bytes),
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
        let result = (|| {
            let shared = self.handles.file(handle.0)?;
            let mut open = lock_open_file(&shared)?;
            let inode = open.inode();
            let (written, size) = open.record_write(offset, data)?;
            self.stage_attributes(inode, size)?;
            u32::try_from(written).map_err(|_| errno(libc::EOVERFLOW))
        })();
        match result {
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
        let filesystem = self.clone();
        self.spawn_remote("flush", RemoteWork::Content, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            debug!(handle = handle.0, "flushing filesystem handle");
            reply_ok_or_error(filesystem.commit_handle(handle.0, false), reply);
        });
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
        let filesystem = self.clone();
        self.spawn_remote("release", RemoteWork::Release, move |rejected| {
            if rejected {
                reply.error(Errno::EIO);
                return;
            }
            reply_ok_or_error(filesystem.release_handle(handle.0), reply);
        });
    }

    fn fsync(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        data_only: bool,
        reply: ReplyEmpty,
    ) {
        let filesystem = self.clone();
        self.spawn_remote("fsync", RemoteWork::Content, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            reply_ok_or_error(filesystem.sync_handle(handle.0, data_only), reply);
        });
    }

    fn opendir(&self, _request: &Request, inode: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        let filesystem = self.clone();
        self.spawn_remote("opendir", RemoteWork::Metadata, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            match filesystem.open_directory(inode) {
                Ok(handle) => reply.opened(FileHandle(handle), FopenFlags::empty()),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn readdir(
        &self,
        _request: &Request,
        inode: INodeNo,
        handle: FileHandle,
        offset: u64,
        reply: ReplyDirectory,
    ) {
        let _ = inode;
        self.read_directory(handle.0, offset, reply);
    }

    fn releasedir(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        _flags: OpenFlags,
        reply: ReplyEmpty,
    ) {
        reply_ok_or_error(self.handles.remove_directory(handle.0), reply);
    }

    fn statfs(&self, _request: &Request, _inode: INodeNo, reply: ReplyStatfs) {
        let result = local_statfs(self.store.staging_dir());
        match result {
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
        if let Err(error) = validate_open_request(flags) {
            reply.error(to_errno(error));
            return;
        }
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let permissions = match permissions(mode, umask) {
            Ok(permissions) => permissions,
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let filesystem = self.clone();
        self.spawn_remote("create", RemoteWork::Mutation, move |rejected| {
            if rejected {
                reply.error(Errno::EAGAIN);
                return;
            }
            let result = filesystem.create_and_open_node(parent, &name, permissions, flags);
            match result {
                Ok((node, handle)) => reply.created(
                    &KERNEL_ENTRY_TTL,
                    &filesystem.attributes(&node),
                    Generation(0),
                    FileHandle(handle),
                    FopenFlags::empty(),
                ),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }
}
