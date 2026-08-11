use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs::File;
use std::io;
use std::os::unix::fs::FileExt;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use fuser::{
    AccessFlags, BsdFileFlags, Config, Errno, FileAttr, FileHandle, FileType, Filesystem,
    FopenFlags, Generation, INodeNo, LockOwner, MountOption, OpenFlags, RenameFlags, ReplyAttr,
    ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyStatfs,
    ReplyWrite, Request, SessionACL, TimeOrNow, WriteFlags,
};
use tracing::info;

use super::store::{FileStore, Node, NodeKind, ROOT_ID};

const METADATA_CACHE_TTL: Duration = Duration::from_secs(1);
const BLOCK_SIZE: u32 = 4096;

pub fn mount(mountpoint: &Path, state_dir: &Path) -> anyhow::Result<()> {
    let store = FileStore::open(state_dir).context("failed to open filesystem state")?;
    let filesystem = DustFuse::new(store);
    let mut config = Config::default();
    config.mount_options = vec![
        MountOption::FSName("dust-files".to_owned()),
        MountOption::RW,
        MountOption::NoDev,
        MountOption::NoSuid,
        MountOption::NoAtime,
    ];
    config.acl = SessionACL::All;
    config.n_threads = Some(4);
    config.clone_fd = true;

    info!(
        mountpoint = %mountpoint.display(),
        state_dir = %state_dir.display(),
        "mounting sandbox filesystem"
    );
    fuser::mount(filesystem, mountpoint, &config)
        .with_context(|| format!("failed to mount {}", mountpoint.display()))
}

struct OpenHandle {
    node_id: u64,
    file: File,
}

struct Inner {
    store: FileStore,
    handles: HashMap<u64, OpenHandle>,
    next_handle: u64,
}

struct DustFuse {
    inner: Mutex<Inner>,
    uid: u32,
    gid: u32,
}

impl DustFuse {
    fn new(store: FileStore) -> Self {
        Self {
            inner: Mutex::new(Inner {
                store,
                handles: HashMap::new(),
                next_handle: 1,
            }),
            // The daemon creates every node. Reporting its uid/gid makes normal
            // command-line tools behave as expected inside the sandbox.
            uid: unsafe { libc::geteuid() },
            gid: unsafe { libc::getegid() },
        }
    }

    fn lock(&self) -> io::Result<MutexGuard<'_, Inner>> {
        self.inner.lock().map_err(|_| errno(libc::EIO))
    }

    fn attributes(&self, node: &Node) -> FileAttr {
        FileAttr {
            ino: INodeNo(node.id),
            size: node.size,
            blocks: node.size.div_ceil(u64::from(BLOCK_SIZE)),
            atime: time_from_ms(node.modified_at_ms),
            mtime: time_from_ms(node.modified_at_ms),
            ctime: time_from_ms(node.modified_at_ms),
            crtime: time_from_ms(node.created_at_ms),
            kind: file_type(node.kind),
            perm: node.mode,
            nlink: if node.kind == NodeKind::Directory {
                2
            } else {
                1
            },
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: BLOCK_SIZE,
            flags: 0,
        }
    }

    fn open_node(&self, inner: &mut Inner, node_id: u64, flags: i32) -> io::Result<u64> {
        if flags & libc::O_TRUNC != 0 {
            inner.store.set_size(node_id, 0)?;
        }
        let file = inner.store.open_content(node_id, flags)?;
        let handle = inner.next_handle;
        inner.next_handle = inner.next_handle.saturating_add(1);
        inner.handles.insert(handle, OpenHandle { node_id, file });
        Ok(handle)
    }
}

impl Filesystem for DustFuse {
    fn lookup(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let result = (|| {
            let name = utf8_name(name)?;
            let inner = self.lock()?;
            inner.store.lookup(parent.0, name)
        })();
        match result {
            Ok(node) => reply.entry(&METADATA_CACHE_TTL, &self.attributes(&node), Generation(0)),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn getattr(
        &self,
        _request: &Request,
        inode: INodeNo,
        _handle: Option<FileHandle>,
        reply: ReplyAttr,
    ) {
        let result = self.lock().and_then(|inner| inner.store.node(inode.0));
        match result {
            Ok(node) => reply.attr(&METADATA_CACHE_TTL, &self.attributes(&node)),
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
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        _handle: Option<FileHandle>,
        _creation_time: Option<SystemTime>,
        _change_time: Option<SystemTime>,
        _backup_time: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        let result = (|| {
            if uid.is_some() || gid.is_some() {
                return Err(errno(libc::EPERM));
            }
            let mut inner = self.lock()?;
            if let Some(size) = size {
                inner.store.set_size(inode.0, size)?;
            }
            if let Some(mode) = mode {
                let permissions = u16::try_from(mode & 0o7777).map_err(|_| errno(libc::EINVAL))?;
                inner.store.set_mode(inode.0, permissions)?;
            }
            inner.store.node(inode.0)
        })();
        match result {
            Ok(node) => reply.attr(&METADATA_CACHE_TTL, &self.attributes(&node)),
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
        let result = (|| {
            let name = utf8_name(name)?;
            let permissions = permissions(mode, umask)?;
            let mut inner = self.lock()?;
            inner.store.create_directory(parent.0, name, permissions)
        })();
        match result {
            Ok(node) => reply.entry(&METADATA_CACHE_TTL, &self.attributes(&node), Generation(0)),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn unlink(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let result = (|| {
            let name = utf8_name(name)?;
            let mut inner = self.lock()?;
            inner.store.remove_file(parent.0, name)
        })();
        reply_empty(result, reply);
    }

    fn rmdir(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let result = (|| {
            let name = utf8_name(name)?;
            let mut inner = self.lock()?;
            inner.store.remove_directory(parent.0, name)
        })();
        reply_empty(result, reply);
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
        let result = (|| {
            let name = utf8_name(name)?;
            let new_name = utf8_name(new_name)?;
            let mut inner = self.lock()?;
            inner.store.rename(parent.0, name, new_parent.0, new_name)?;
            Ok(())
        })();
        reply_empty(result, reply);
    }

    fn open(&self, _request: &Request, inode: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        let result = (|| {
            let mut inner = self.lock()?;
            self.open_node(&mut inner, inode.0, flags.0)
        })();
        match result {
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
        let result = (|| {
            let inner = self.lock()?;
            let open = inner
                .handles
                .get(&handle.0)
                .ok_or_else(|| errno(libc::EBADF))?;
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
            let mut inner = self.lock()?;
            let open = inner
                .handles
                .get(&handle.0)
                .ok_or_else(|| errno(libc::EBADF))?;
            let node_id = open.node_id;
            let written = open.file.write_at(data, offset)?;
            let size = open.file.metadata()?.len();
            inner.store.record_size(node_id, size)?;
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
        let result = (|| {
            let inner = self.lock()?;
            let open = inner
                .handles
                .get(&handle.0)
                .ok_or_else(|| errno(libc::EBADF))?;
            open.file.sync_data()
        })();
        reply_empty(result, reply);
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
        let result = self.lock().and_then(|mut inner| {
            inner
                .handles
                .remove(&handle.0)
                .map(|_| ())
                .ok_or_else(|| errno(libc::EBADF))
        });
        reply_empty(result, reply);
    }

    fn fsync(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        data_only: bool,
        reply: ReplyEmpty,
    ) {
        let result = (|| {
            let inner = self.lock()?;
            let open = inner
                .handles
                .get(&handle.0)
                .ok_or_else(|| errno(libc::EBADF))?;
            if data_only {
                open.file.sync_data()
            } else {
                open.file.sync_all()
            }
        })();
        reply_empty(result, reply);
    }

    fn opendir(&self, _request: &Request, inode: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        let result = self.lock().and_then(|inner| inner.store.node(inode.0));
        match result {
            Ok(node) if node.kind == NodeKind::Directory => {
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
        let result = (|| {
            let inner = self.lock()?;
            let directory = inner.store.node(inode.0)?;
            if directory.kind != NodeKind::Directory {
                return Err(errno(libc::ENOTDIR));
            }
            let parent_id = directory.parent_id.unwrap_or(ROOT_ID);
            let mut entries = vec![
                (directory.id, NodeKind::Directory, ".".to_owned()),
                (parent_id, NodeKind::Directory, "..".to_owned()),
            ];
            entries.extend(
                inner
                    .store
                    .children(directory.id)?
                    .into_iter()
                    .map(|node| (node.id, node.kind, node.name)),
            );
            Ok(entries)
        })();
        let entries = match result {
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
        for (index, (node_id, kind, name)) in entries.into_iter().enumerate().skip(offset) {
            let next_offset = match u64::try_from(index.saturating_add(1)) {
                Ok(next_offset) => next_offset,
                Err(_) => {
                    reply.error(Errno::EOVERFLOW);
                    return;
                }
            };
            if reply.add(INodeNo(node_id), next_offset, file_type(kind), name) {
                break;
            }
        }
        reply.ok();
    }

    fn statfs(&self, _request: &Request, _inode: INodeNo, reply: ReplyStatfs) {
        // These values describe a roomy local staging area. Production will
        // report the real cache limit supplied by the sandbox image.
        reply.statfs(
            1_000_000, 900_000, 900_000, 1_000_000, 900_000, BLOCK_SIZE, 255, BLOCK_SIZE,
        );
    }

    fn access(&self, _request: &Request, inode: INodeNo, _mask: AccessFlags, reply: ReplyEmpty) {
        let result = self
            .lock()
            .and_then(|inner| inner.store.node(inode.0).map(|_| ()));
        reply_empty(result, reply);
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
        let result = (|| {
            let name = utf8_name(name)?;
            let permissions = permissions(mode, umask)?;
            let mut inner = self.lock()?;
            let node = inner.store.create_file(parent.0, name, permissions)?;
            let handle = self.open_node(&mut inner, node.id, flags)?;
            Ok((node, handle))
        })();
        match result {
            Ok((node, handle)) => reply.created(
                &METADATA_CACHE_TTL,
                &self.attributes(&node),
                Generation(0),
                FileHandle(handle),
                FopenFlags::empty(),
            ),
            Err(error) => reply.error(to_errno(error)),
        }
    }
}

fn permissions(mode: u32, umask: u32) -> io::Result<u16> {
    u16::try_from((mode & !umask) & 0o7777).map_err(|_| errno(libc::EINVAL))
}

fn utf8_name(name: &OsStr) -> io::Result<&str> {
    name.to_str().ok_or_else(|| errno(libc::EINVAL))
}

fn file_type(kind: NodeKind) -> FileType {
    match kind {
        NodeKind::File => FileType::RegularFile,
        NodeKind::Directory => FileType::Directory,
    }
}

fn time_from_ms(value: i64) -> SystemTime {
    match u64::try_from(value) {
        Ok(value) => UNIX_EPOCH + Duration::from_millis(value),
        Err(_) => UNIX_EPOCH,
    }
}

fn to_errno(error: io::Error) -> Errno {
    Errno::from_i32(error.raw_os_error().unwrap_or(libc::EIO))
}

fn reply_empty(result: io::Result<()>, reply: ReplyEmpty) {
    match result {
        Ok(()) => reply.ok(),
        Err(error) => reply.error(to_errno(error)),
    }
}

fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}
