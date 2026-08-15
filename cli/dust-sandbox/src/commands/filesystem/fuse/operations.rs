use super::*;

impl Filesystem for DustFuse {
    fn init(&mut self, _request: &Request, config: &mut KernelConfig) -> io::Result<()> {
        // With this capability Linux carries O_TRUNC on OPEN instead of
        // issuing a separate SETATTR that could become its own revision.
        config
            .add_capabilities(InitFlags::FUSE_ATOMIC_O_TRUNC)
            .map_err(|_| errno(libc::ENOTSUP))
    }

    fn lookup(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("lookup") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("lookup", permit, move || {
            match filesystem.lookup_node(parent, &name) {
                Ok(node) => reply.entry(
                    &METADATA_CACHE_TTL,
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
            match self.node_for_handle(handle.0, inode) {
                Ok(node) => reply.attr(&METADATA_CACHE_TTL, &self.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
            return;
        }
        let Some(permit) = self.remote_permit("getattr") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("getattr", permit, move || match filesystem.node(inode) {
            Ok(node) => reply.attr(&METADATA_CACHE_TTL, &filesystem.attributes(&node)),
            Err(error) => reply.error(to_errno(error)),
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
                Ok(node) => reply.attr(&METADATA_CACHE_TTL, &self.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
            return;
        }
        let Some(permit) = self.remote_permit("setattr") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("setattr", permit, move || {
            match filesystem.set_attributes(inode, mode, size, handle) {
                Ok(node) => reply.attr(&METADATA_CACHE_TTL, &filesystem.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
        });
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
        let Some(permit) = self.remote_permit("mkdir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("mkdir", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                filesystem
                    .store
                    .create_directory(parent, &name, permissions)
            })();
            match result {
                Ok(node) => reply.entry(
                    &METADATA_CACHE_TTL,
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
        let Some(permit) = self.remote_permit("unlink") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("unlink", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                let node = filesystem.lookup_node(parent, &name)?;
                filesystem.mark_unlinked(node.inode, true)?;
                if let Err(error) = filesystem.store.remove_file(parent, &name) {
                    filesystem.mark_unlinked(node.inode, false)?;
                    return Err(error);
                }
                filesystem.staged_sizes()?.remove(&node.inode);
                Ok(())
            })();
            reply_empty(result, reply);
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
        let Some(permit) = self.remote_permit("rmdir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("rmdir", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                let node = filesystem.lookup_node(parent, &name)?;
                filesystem.store.remove_directory(parent, &name)?;
                filesystem.staged_sizes()?.remove(&node.inode);
                Ok(())
            })();
            reply_empty(result, reply);
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
        let Some(permit) = self.remote_permit("rename") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("rename", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                if parent == new_parent && name == new_name {
                    return Ok(());
                }
                let source = filesystem.lookup_node(parent, &name)?;
                let destination_inode = match filesystem.lookup_node(new_parent, &new_name) {
                    Ok(destination) => Some(destination.inode),
                    Err(error) if error.raw_os_error() == Some(libc::ENOENT) => None,
                    Err(error) => return Err(error),
                };
                if let Some(destination_inode) = destination_inode {
                    filesystem.mark_unlinked(destination_inode, true)?;
                }
                let rename_result: io::Result<()> = (|| {
                    filesystem
                        .store
                        .rename(parent, &name, new_parent, &new_name)?;
                    if let Some(destination_inode) = destination_inode {
                        filesystem.store.forget_content(destination_inode);
                    }
                    Ok(())
                })();
                if rename_result.is_err() {
                    if let Some(destination_inode) = destination_inode {
                        filesystem.mark_unlinked(destination_inode, false)?;
                    }
                }
                rename_result?;
                debug!(inode = source.inode.0, "renamed filesystem inode");
                Ok(())
            })();
            reply_empty(result, reply);
        });
    }

    fn open(&self, _request: &Request, inode: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        let Some(permit) = self.remote_permit("open") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("open", permit, move || {
            let result = (|| {
                // Opens may run together, but a rename or unlink takes the
                // write side so the handle is either fully opened before the
                // name disappears or fails after it disappeared.
                let _namespace = filesystem.namespace_read()?;
                filesystem.open_node(inode, flags.0)
            })();
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
            let shared = self.handle(handle.0)?;
            let open = shared.lock().map_err(|_| errno(libc::EIO))?;
            let mut bytes = vec![0; usize::try_from(size).map_err(|_| errno(libc::EOVERFLOW))?];
            let read = open.file.read_at(&mut bytes, offset)?;
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
            let shared = self.handle(handle.0)?;
            let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
            let inode = open.node.inode;
            let written = open.file.write_at(data, offset)?;
            let size = open.file.metadata()?.len();
            open.node.size = size;
            open.dirty = true;
            open.defer_truncate_commit = false;
            self.staged_sizes()?.insert(inode, size);
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
        let Some(permit) = self.remote_permit("flush") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("flush", permit, move || {
            debug!(handle = handle.0, "flushing filesystem handle");
            reply_empty(filesystem.commit_handle(handle.0, false), reply);
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
        let Some(permit) = self.remote_permit("release") else {
            // RELEASE errors are ignored by Linux. Falling back here is rare,
            // but dropping a dirty handle would silently lose the only record
            // that its staged content still needs upload.
            reply_empty(self.release_handle(handle.0), reply);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("release", permit, move || {
            reply_empty(filesystem.release_handle(handle.0), reply);
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
        let Some(permit) = self.remote_permit("fsync") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("fsync", permit, move || {
            reply_empty(filesystem.sync_handle(handle.0, data_only), reply);
        });
    }

    fn opendir(&self, _request: &Request, inode: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        let Some(permit) = self.remote_permit("opendir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("opendir", permit, move || match filesystem.node(inode) {
            Ok(node) if node.kind == NodeKind::Directory => {
                reply.opened(FileHandle(0), FopenFlags::empty());
            }
            Ok(_) => reply.error(Errno::ENOTDIR),
            Err(error) => reply.error(to_errno(error)),
        });
    }

    fn readdir(
        &self,
        _request: &Request,
        inode: INodeNo,
        _handle: FileHandle,
        offset: u64,
        reply: ReplyDirectory,
    ) {
        let Some(permit) = self.remote_permit("readdir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("readdir", permit, move || {
            filesystem.read_directory(inode, offset, reply);
        });
    }

    fn statfs(&self, _request: &Request, _inode: INodeNo, reply: ReplyStatfs) {
        let result = (|| local_statfs(self.store.staging_dir()))();
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

    fn access(&self, _request: &Request, inode: INodeNo, _mask: AccessFlags, reply: ReplyEmpty) {
        let Some(permit) = self.remote_permit("access") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("access", permit, move || {
            reply_empty(filesystem.node(inode).map(|_| ()), reply);
        });
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
        let Some(permit) = self.remote_permit("create") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("create", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                let node = filesystem.store.create_file(parent, &name, permissions)?;
                let handle = filesystem.open_node(node.inode, flags)?;
                Ok((node, handle))
            })();
            match result {
                Ok((node, handle)) => reply.created(
                    &METADATA_CACHE_TTL,
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
