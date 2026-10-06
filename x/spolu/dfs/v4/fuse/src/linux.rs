use crate::inodes::Inodes;
use ::dfs_client::{CacheReservation, CachedClient};
use dfs_protocol::{MAX_IO, error::code, rpc::*};
use fuser::*;
use parking_lot::Mutex;
use std::{
    collections::{BTreeMap, HashMap},
    ffi::OsStr,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
type Result<T> = std::result::Result<T, Errno>;
const TTL: Duration = Duration::ZERO;
const CHUNK: u32 = MAX_IO as u32;
const PAGE: u32 = 64;
const MAX_HANDLES: usize = 256;
const O_PATH: i32 = 0x20_0000;
const RENAME_NOREPLACE: u32 = 1;
const MODE_TYPE_MASK: u32 = 0o170000;
const MODE_REGULAR: u32 = 0o100000;
#[cfg(target_os = "linux")]
const NO_XATTR: Errno = Errno::ENODATA;
#[cfg(target_os = "macos")]
const NO_XATTR: Errno = Errno::ENOATTR;
struct File {
    _memory: CacheReservation,
    ino: u64,
    read: bool,
    write: bool,
    append: bool,
    closed: bool,
    failure: Option<Errno>,
}
struct Directory {
    _memory: CacheReservation,
    ino: u64,
    cookies: BTreeMap<u64, String>,
}

/// @cc [owner:spolu,label:architecture;concurrency] userspace-cached-mount
/// File handles MUST use direct I/O and all reply TTLs MUST be zero. The client cache owns metadata,
/// block validation, writeback, and object fsync. Mutations MUST NOT be replayed after RPC failure.
pub struct Filesystem {
    client: CachedClient,
    inodes: Mutex<Inodes<CacheReservation>>,
    files: Mutex<HashMap<u64, Arc<Mutex<File>>>>,
    directories: Mutex<HashMap<u64, Arc<Mutex<Directory>>>>,
    next_handle: AtomicU64,
    stopped: Arc<AtomicBool>,
    uid: u32,
    gid: u32,
    read_only: bool,
}
impl Filesystem {
    pub fn new(
        client: CachedClient,
        read_only: bool,
        stopped: Arc<AtomicBool>,
    ) -> anyhow::Result<Self> {
        client.stat(ObjectRequest {
            object_id: "root".into(),
        })?;
        let root_memory = client.reserve_bookkeeping(1024)?;
        Ok(Self {
            client,
            inodes: Mutex::new(Inodes::new(root_memory)),
            files: Default::default(),
            directories: Default::default(),
            next_handle: AtomicU64::new(1),
            stopped,
            uid: nix::unistd::getuid().as_raw(),
            gid: nix::unistd::getgid().as_raw(),
            read_only,
        })
    }
    fn rpc_error(&self, error: tonic::Status) -> Errno {
        if code(&error) == ErrorCode::Unauthenticated {
            self.stopped.store(true, Ordering::Release);
        }
        errno(error)
    }
    fn object(&self, ino: INodeNo) -> Result<String> {
        self.inodes
            .lock()
            .node(ino.0)
            .map(|n| n.object)
            .ok_or(Errno::ESTALE)
    }
    fn parent(&self, ino: INodeNo) -> Result<String> {
        if self.read_only {
            return Err(Errno::EROFS);
        }
        let id = self.object(ino)?;
        if matches!(id.as_str(), "root" | "shared") {
            return Err(Errno::EROFS);
        }
        Ok(id)
    }
    fn stat(&self, ino: INodeNo) -> Result<Object> {
        self.stat_id(&self.object(ino)?)
    }
    fn stat_id(&self, id: &str) -> Result<Object> {
        self.client
            .stat(ObjectRequest {
                object_id: id.into(),
            })
            .map_err(|e| self.rpc_error(e))
    }
    fn lookup_id(&self, parent: &str, name: &str) -> Result<Object> {
        self.client
            .lookup(LookupRequest {
                parent_id: parent.into(),
                name: name.into(),
            })
            .map_err(|e| self.rpc_error(e))
    }
    fn entry(&self, parent: INodeNo, object: Object) -> Result<FileAttr> {
        let mut inodes = self.inodes.lock();
        let memory = match inodes
            .existing(parent.0, &object.id, !object.directory)
            .and_then(|ino| inodes.node(ino))
        {
            Some(node) => node.value,
            None => self
                .client
                .reserve_bookkeeping(1024)
                .map_err(|e| self.rpc_error(e))?,
        };
        let ino = inodes
            .lookup(parent.0, &object.id, !object.directory, memory)
            .ok_or(Errno::ENOSPC)?;
        drop(inodes);
        self.attr(INodeNo(ino), &object)
    }
    fn handle_number(&self) -> Result<u64> {
        self.next_handle
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
            .map_err(|_| Errno::EMFILE)
    }
    fn file(&self, ino: INodeNo, fh: FileHandle) -> Result<Arc<Mutex<File>>> {
        let file = self.files.lock().get(&fh.0).cloned().ok_or(Errno::EBADF)?;
        if file.lock().ino != ino.0 {
            return Err(Errno::EBADF);
        }
        Ok(file)
    }
    /// @cc [owner:spolu,label:concurrency;security] create-response-handle
    /// Supplied metadata MUST be the successful create response from this callback for this inode.
    /// Ordinary opens MUST resolve metadata through the client's bounded authorization cache.
    fn open_file(&self, ino: INodeNo, flags: i32, created: Option<&Object>) -> Result<FileHandle> {
        let write = flags & libc::O_ACCMODE != libc::O_RDONLY;
        let read = flags & libc::O_ACCMODE != libc::O_WRONLY;
        if flags & libc::O_ACCMODE == libc::O_ACCMODE || flags & O_PATH != 0 {
            return Err(Errno::EOPNOTSUPP);
        }
        if write || flags & libc::O_TRUNC != 0 {
            self.parent(ino)?;
        }
        let directory = match created {
            Some(object) => {
                if object.id != self.object(ino)? {
                    return Err(Errno::ESTALE);
                }
                object.directory
            }
            None => self.stat(ino)?.directory,
        };
        if directory {
            return Err(Errno::EISDIR);
        }
        let fh = self.handle_number()?;
        {
            let mut files = self.files.lock();
            if files.len() >= MAX_HANDLES {
                return Err(Errno::EMFILE);
            }
            let memory = self
                .client
                .reserve_bookkeeping(1024)
                .map_err(|e| self.rpc_error(e))?;
            self.inodes.lock().pin(ino.0).ok_or(Errno::ESTALE)?;
            files.insert(
                fh,
                Arc::new(Mutex::new(File {
                    _memory: memory,
                    ino: ino.0,
                    read,
                    write,
                    append: flags & libc::O_APPEND != 0,
                    closed: false,
                    failure: None,
                })),
            );
        }
        if flags & libc::O_TRUNC != 0
            && let Err(e) = self.update(
                ino,
                UpdateRequest {
                    size: Some(0),
                    ..Default::default()
                },
            )
        {
            self.files.lock().remove(&fh);
            self.inodes.lock().unpin(ino.0);
            return Err(e);
        }
        Ok(FileHandle(fh))
    }
    fn update(&self, ino: INodeNo, request: UpdateRequest) -> Result<Object> {
        self.client
            .update(UpdateRequest {
                object_id: self.parent(ino)?,
                ..request
            })
            .map_err(|e| self.rpc_error(e))?
            .object
            .ok_or(Errno::EIO)
    }
    fn sync_file(&self, ino: INodeNo, fh: FileHandle, explicit: bool) -> Result<()> {
        let file = self.file(ino, fh)?;
        let file = file.lock();
        if file.closed {
            return Err(Errno::EBADF);
        }
        if let Some(e) = file.failure {
            return Err(e);
        }
        self.client
            .check_error(&self.object(ino)?)
            .map_err(|e| self.rpc_error(e))?;
        if explicit {
            self.client
                .fsync(ObjectRequest {
                    object_id: self.object(ino)?,
                })
                .map_err(|e| self.rpc_error(e))?;
        }
        Ok(())
    }
    fn create_file(
        &self,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        directory: bool,
    ) -> Result<Object> {
        self.client
            .create(CreateRequest {
                parent_id: self.parent(parent)?,
                name: name_str(name)?.into(),
                directory,
                mode: mode_bits(mode),
                ..Default::default()
            })
            .map_err(|e| self.rpc_error(e))?
            .object
            .ok_or(Errno::EIO)
    }
    fn remove(&self, parent: INodeNo, name: &OsStr, directory: bool) -> Result<()> {
        let object = self.lookup_id(&self.parent(parent)?, name_str(name)?)?;
        self.client
            .remove_at(
                self.parent(parent)?,
                name_str(name)?.into(),
                RemoveRequest {
                    object_id: object.id,
                    directory,
                },
            )
            .map_err(|e| self.rpc_error(e))?;
        Ok(())
    }
    fn xattr(&self, ino: INodeNo, name: &str, value: Option<Vec<u8>>, flags: i32) -> Result<()> {
        if !name.starts_with("user.") {
            return Err(Errno::EOPNOTSUPP);
        }
        let object = self.stat(ino)?;
        let exists = object.xattrs.contains_key(name);
        if flags == libc::XATTR_CREATE && exists {
            return Err(Errno::EEXIST);
        }
        if flags == libc::XATTR_REPLACE && !exists {
            return Err(NO_XATTR);
        }
        self.update(
            ino,
            UpdateRequest {
                xattrs: vec![XattrChange {
                    name: name.into(),
                    value,
                }],
                ..Default::default()
            },
        )?;
        Ok(())
    }
}
impl Filesystem {
    fn attr(&self, ino: INodeNo, object: &Object) -> Result<FileAttr> {
        Ok(FileAttr {
            ino,
            size: object.size,
            blocks: object.size.div_ceil(512),
            atime: system_time(object.atime.ok_or(Errno::EIO)?)?,
            mtime: system_time(object.mtime.ok_or(Errno::EIO)?)?,
            ctime: system_time(object.ctime.ok_or(Errno::EIO)?)?,
            crtime: UNIX_EPOCH,
            kind: kind(object),
            perm: object.mode as u16,
            nlink: if object.directory { 2 } else { 1 },
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: 65536,
            flags: 0,
        })
    }
}
enum DirectoryReply {
    Plain(ReplyDirectory),
    Plus(ReplyDirectoryPlus),
}
impl DirectoryReply {
    fn add(&mut self, offset: u64, name: &str, attr: &FileAttr) -> bool {
        match self {
            Self::Plain(reply) => reply.add(attr.ino, offset, attr.kind, name),
            Self::Plus(reply) => reply.add(attr.ino, offset, name, &TTL, attr, Generation(0)),
        }
    }
    fn finish(self, result: Result<()>) {
        match (self, result) {
            (Self::Plain(reply), Ok(())) => reply.ok(),
            (Self::Plain(reply), Err(error)) => reply.error(error),
            (Self::Plus(reply), Ok(())) => reply.ok(),
            (Self::Plus(reply), Err(error)) => reply.error(error),
        }
    }
}
impl fuser::Filesystem for Filesystem {
    fn init(&mut self, _req: &Request, config: &mut KernelConfig) -> std::io::Result<()> {
        config
            .set_max_write(CHUNK)
            .map_err(|_| std::io::Error::other("kernel write limit"))?;
        config
            .add_capabilities(
                InitFlags::FUSE_ATOMIC_O_TRUNC
                    | InitFlags::FUSE_DO_READDIRPLUS
                    | InitFlags::FUSE_READDIRPLUS_AUTO
                    | InitFlags::FUSE_PARALLEL_DIROPS
                    | InitFlags::FUSE_POSIX_LOCKS
                    | InitFlags::FUSE_FLOCK_LOCKS,
            )
            .map_err(|_| std::io::Error::other("kernel capabilities unavailable"))?;
        Ok(())
    }
    fn read(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        self.client.record_fuse_call("fuse.read");
        let result = (|| {
            if size > CHUNK {
                return Err(Errno::EINVAL);
            }
            let file = self.file(ino, fh)?;
            let file = file.lock();
            if file.closed || !file.read {
                return Err(Errno::EBADF);
            }
            self.client
                .read(ReadRequest {
                    revision: Vec::new(),
                    object_id: self.object(ino)?,
                    offset,
                    length: size,
                })
                .map(|r| r.data)
                .map_err(|e| self.rpc_error(e))
        })();
        match result {
            Ok(data) => reply.data(&data),
            Err(e) => reply.error(e),
        }
    }
    fn write(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        self.client.record_fuse_call("fuse.write");
        let result = (|| {
            if data.len() > MAX_IO {
                return Err(Errno::EINVAL);
            }
            let id = self.parent(ino)?;
            let file = self.file(ino, fh)?;
            let mut file = file.lock();
            if file.closed || !file.write {
                return Err(Errno::EBADF);
            }
            if let Some(e) = file.failure {
                return Err(e);
            }
            if let Err(e) = self
                .client
                .write(WriteRequest {
                    object_id: id,
                    offset,
                    data: data.to_vec(),
                    append: file.append,
                })
                .map_err(|e| self.rpc_error(e))
            {
                file.failure = Some(e);
                return Err(e);
            }
            Ok(())
        })();
        match result {
            Ok(()) => reply.written(data.len() as u32),
            Err(e) => reply.error(e),
        }
    }
    fn rename(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        newparent: INodeNo,
        newname: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.rename");
        let result = (|| {
            if flags.bits() & !RENAME_NOREPLACE != 0 {
                return Err(Errno::EOPNOTSUPP);
            }
            let object = self.lookup_id(&self.parent(parent)?, name_str(name)?)?;
            self.client
                .rename_from(
                    self.parent(parent)?,
                    name_str(name)?.into(),
                    RenameRequest {
                        object_id: object.id.clone(),
                        parent_id: self.parent(newparent)?,
                        name: name_str(newname)?.into(),
                        replace: flags.is_empty(),
                    },
                )
                .map_err(|e| self.rpc_error(e))?;
            let mut inodes = self.inodes.lock();
            if let Some(ino) = inodes.existing(parent.0, &object.id, !object.directory) {
                inodes.reparent(ino, newparent.0).ok_or(Errno::ESTALE)?;
            }
            Ok(())
        })();
        empty_reply(result, reply);
    }
    fn setattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<FileHandle>,
        crtime: Option<SystemTime>,
        chgtime: Option<SystemTime>,
        bkuptime: Option<SystemTime>,
        flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        self.client.record_fuse_call("fuse.setattr");
        let result = (|| {
            if uid.is_some_and(|v| v != self.uid)
                || gid.is_some_and(|v| v != self.gid)
                || crtime.is_some()
                || chgtime.is_some()
                || bkuptime.is_some()
                || flags.is_some()
            {
                return Err(Errno::EOPNOTSUPP);
            }
            let file = fh.map(|h| self.file(ino, h)).transpose()?;
            let guard = file.as_ref().map(|f| f.lock());
            if guard
                .as_ref()
                .is_some_and(|f| f.closed || (size.is_some() && !f.write))
            {
                return Err(Errno::EBADF);
            }
            let object = self.update(
                ino,
                UpdateRequest {
                    mode: mode.map(mode_bits),
                    size,
                    atime: atime.map(timestamp).transpose()?,
                    mtime: mtime.map(timestamp).transpose()?,
                    ..Default::default()
                },
            )?;
            self.attr(ino, &object)
        })();
        match result {
            Ok(attr) => reply.attr(&TTL, &attr),
            Err(e) => reply.error(e),
        }
    }
    fn getxattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, size: u32, reply: ReplyXattr) {
        self.client.record_fuse_call("fuse.getxattr");
        let result = (|| {
            let name = name_str(name)?;
            if !name.starts_with("user.") {
                return Err(Errno::EOPNOTSUPP);
            }
            self.stat(ino)?.xattrs.remove(name).ok_or(NO_XATTR)
        })();
        xattr_reply(result, size, reply);
    }
    fn listxattr(&self, _req: &Request, ino: INodeNo, size: u32, reply: ReplyXattr) {
        self.client.record_fuse_call("fuse.listxattr");
        let result = self.stat(ino).map(|o| {
            o.xattrs
                .keys()
                .filter(|k| k.starts_with("user."))
                .flat_map(|k| k.bytes().chain([0]))
                .collect()
        });
        xattr_reply(result, size, reply);
    }
    fn fsyncdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.fsyncdir");
        let result = (|| {
            let id = self.object(ino)?;
            if matches!(id.as_str(), "root" | "shared") {
                self.stat(ino)?;
            } else {
                self.client
                    .fsync(ObjectRequest { object_id: id })
                    .map_err(|e| self.rpc_error(e))?;
            }
            Ok(())
        })();
        empty_reply(result, reply);
    }

    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        self.client.record_fuse_call("fuse.lookup");
        let result = (|| {
            let name = name_str(name)?;
            if name == "." || name == ".." {
                self.stat(parent)?;
                let ino = if name == "." {
                    parent.0
                } else {
                    self.inodes
                        .lock()
                        .node(parent.0)
                        .ok_or(Errno::ESTALE)?
                        .parent
                };
                let object = self.stat(INodeNo(ino))?;
                let node = self.inodes.lock().node(ino).ok_or(Errno::ESTALE)?;
                return self.entry(INodeNo(node.parent), object);
            }
            let object = self.lookup_id(&self.object(parent)?, name)?;
            self.entry(parent, object)
        })();
        match result {
            Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
            Err(Errno::ENOENT) => {
                let attr = FileAttr {
                    ino: INodeNo(0),
                    size: 0,
                    blocks: 0,
                    atime: UNIX_EPOCH,
                    mtime: UNIX_EPOCH,
                    ctime: UNIX_EPOCH,
                    crtime: UNIX_EPOCH,
                    kind: FileType::RegularFile,
                    perm: 0,
                    nlink: 0,
                    uid: self.uid,
                    gid: self.gid,
                    rdev: 0,
                    blksize: 65536,
                    flags: 0,
                };
                reply.entry(&TTL, &attr, Generation(0));
            }
            Err(e) => reply.error(e),
        }
    }
    fn forget(&self, _req: &Request, ino: INodeNo, nlookup: u64) {
        self.client.record_fuse_call("fuse.forget");
        self.inodes.lock().forget(ino.0, nlookup);
    }
    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        self.client.record_fuse_call("fuse.getattr");
        match self.stat(ino).and_then(|object| self.attr(ino, &object)) {
            Ok(attr) => reply.attr(&TTL, &attr),
            Err(e) => reply.error(e),
        }
    }
    fn opendir(&self, _req: &Request, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        self.client.record_fuse_call("fuse.opendir");
        let result = (|| {
            if !self.stat(ino)?.directory {
                return Err(Errno::ENOTDIR);
            }
            let fh = self.handle_number()?;
            let mut directories = self.directories.lock();
            if directories.len() >= MAX_HANDLES {
                return Err(Errno::EMFILE);
            }
            // Up to 1024 bounded-name cookies plus container overhead for this open directory.
            let memory = self
                .client
                .reserve_bookkeeping(1024 * 1024)
                .map_err(|e| self.rpc_error(e))?;
            self.inodes.lock().pin(ino.0).ok_or(Errno::ESTALE)?;
            directories.insert(
                fh,
                Arc::new(Mutex::new(Directory {
                    ino: ino.0,
                    cookies: Default::default(),
                    _memory: memory,
                })),
            );
            Ok(fh)
        })();
        match result {
            Ok(fh) => reply.opened(FileHandle(fh), FopenFlags::empty()),
            Err(e) => reply.error(e),
        }
    }
    fn readdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        reply: ReplyDirectory,
    ) {
        self.client.record_fuse_call("fuse.readdir");
        self.directory_contents(ino, fh, offset, DirectoryReply::Plain(reply));
    }
    fn readdirplus(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        reply: ReplyDirectoryPlus,
    ) {
        self.client.record_fuse_call("fuse.readdirplus");
        self.directory_contents(ino, fh, offset, DirectoryReply::Plus(reply));
    }
    fn releasedir(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.releasedir");
        let removed = self.directories.lock().remove(&fh.0);
        if let Some(directory) = removed {
            let stored = directory.lock().ino;
            self.inodes.lock().unpin(stored);
            if stored != ino.0 {
                reply.error(Errno::EBADF);
            } else {
                reply.ok();
            }
        } else {
            reply.error(Errno::EBADF);
        }
    }
    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        self.client.record_fuse_call("fuse.open");
        match self.open_file(ino, flags.0, None) {
            Ok(fh) => reply.opened(fh, FopenFlags::FOPEN_DIRECT_IO),
            Err(error) => reply.error(error),
        }
    }
    fn flush(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _owner: LockOwner,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.flush");
        empty_reply(self.sync_file(ino, fh, false), reply);
    }
    fn fsync(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.fsync");
        empty_reply(self.sync_file(ino, fh, true), reply);
    }
    fn release(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        _owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.release");
        let result = (|| {
            let file = self.files.lock().remove(&fh.0).ok_or(Errno::EBADF)?;
            let mut file = file.lock();
            file.closed = true;
            self.inodes.lock().unpin(file.ino);
            if file.ino != ino.0 {
                return Err(Errno::EBADF);
            }
            Ok(())
        })();
        empty_reply(result, reply);
    }
    fn create(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        self.client.record_fuse_call("fuse.create");
        let result = (|| {
            let object = self.create_file(parent, name, mode & !umask, false)?;
            let attr = self.entry(parent, object.clone())?;
            match self.open_file(attr.ino, flags & !libc::O_TRUNC, Some(&object)) {
                Ok(fh) => Ok((attr, fh)),
                Err(error) => {
                    self.inodes.lock().forget(attr.ino.0, 1);
                    Err(error)
                }
            }
        })();
        match result {
            Ok((attr, fh)) => {
                reply.created(&TTL, &attr, Generation(0), fh, FopenFlags::FOPEN_DIRECT_IO)
            }
            Err(error) => reply.error(error),
        }
    }
    fn mknod(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        _rdev: u32,
        reply: ReplyEntry,
    ) {
        self.client.record_fuse_call("fuse.mknod");
        if mode & MODE_TYPE_MASK != MODE_REGULAR {
            reply.error(Errno::EOPNOTSUPP);
            return;
        }
        let result = self
            .create_file(parent, name, mode & !umask, false)
            .and_then(|object| self.entry(parent, object));
        match result {
            Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
            Err(error) => reply.error(error),
        }
    }
    fn mkdir(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        reply: ReplyEntry,
    ) {
        self.client.record_fuse_call("fuse.mkdir");
        let result = self
            .create_file(parent, name, mode & !umask, true)
            .and_then(|object| self.entry(parent, object));
        match result {
            Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
            Err(error) => reply.error(error),
        }
    }
    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.client.record_fuse_call("fuse.unlink");
        empty_reply(self.remove(parent, name, false), reply);
    }
    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.client.record_fuse_call("fuse.rmdir");
        empty_reply(self.remove(parent, name, true), reply);
    }
    fn setxattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        name: &OsStr,
        value: &[u8],
        flags: i32,
        position: u32,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.setxattr");
        let result = (|| {
            if position != 0 || ![0, libc::XATTR_CREATE, libc::XATTR_REPLACE].contains(&flags) {
                return Err(Errno::EINVAL);
            }
            if value.len() > 32 * 1024 {
                return Err(Errno::E2BIG);
            }
            self.xattr(ino, name_str(name)?, Some(value.to_vec()), flags)
        })();
        empty_reply(result, reply);
    }
    fn removexattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.client.record_fuse_call("fuse.removexattr");
        empty_reply(
            name_str(name).and_then(|name| self.xattr(ino, name, None, libc::XATTR_REPLACE)),
            reply,
        );
    }
    fn access(&self, _req: &Request, ino: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
        self.client.record_fuse_call("fuse.access");
        let result = (|| {
            self.stat(ino)?;
            if mask.bits() & libc::W_OK != 0 {
                self.parent(ino)?;
            }
            Ok(())
        })();
        empty_reply(result, reply);
    }
    fn statfs(&self, _req: &Request, ino: INodeNo, reply: ReplyStatfs) {
        self.client.record_fuse_call("fuse.statfs");
        match self.stat(ino) {
            Ok(_) => reply.statfs(0, 0, 0, 0, 0, 4096, 255, 4096),
            Err(e) => reply.error(e),
        }
    }
    fn symlink(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _name: &OsStr,
        _target: &Path,
        reply: ReplyEntry,
    ) {
        self.client.record_fuse_call("fuse.symlink");
        reply.error(Errno::EOPNOTSUPP);
    }
    fn link(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _parent: INodeNo,
        _name: &OsStr,
        reply: ReplyEntry,
    ) {
        self.client.record_fuse_call("fuse.link");
        reply.error(Errno::EOPNOTSUPP);
    }
    fn readlink(&self, _req: &Request, _ino: INodeNo, reply: ReplyData) {
        self.client.record_fuse_call("fuse.readlink");
        reply.error(Errno::EOPNOTSUPP);
    }
    fn getlk(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _owner: LockOwner,
        _start: u64,
        _end: u64,
        _typ: i32,
        _pid: u32,
        reply: ReplyLock,
    ) {
        self.client.record_fuse_call("fuse.getlk");
        reply.error(Errno::EOPNOTSUPP);
    }
    fn setlk(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _owner: LockOwner,
        _start: u64,
        _end: u64,
        _typ: i32,
        _pid: u32,
        _sleep: bool,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.setlk");
        reply.error(Errno::EOPNOTSUPP);
    }
    fn fallocate(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _offset: u64,
        _length: u64,
        _mode: i32,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.fallocate");
        reply.error(Errno::EOPNOTSUPP);
    }
}
fn errno(error: tonic::Status) -> Errno {
    match code(&error) {
        ErrorCode::InvalidInput => Errno::EINVAL,
        ErrorCode::NameTooLong => Errno::ENAMETOOLONG,
        ErrorCode::NotDirectory => Errno::ENOTDIR,
        ErrorCode::IsDirectory => Errno::EISDIR,
        ErrorCode::Unauthenticated | ErrorCode::Forbidden => Errno::EACCES,
        ErrorCode::NotFound => Errno::ENOENT,
        ErrorCode::AlreadyExists => Errno::EEXIST,
        ErrorCode::NotEmpty => Errno::ENOTEMPTY,
        ErrorCode::Capacity => Errno::ENOSPC,
        ErrorCode::Unsupported => Errno::EOPNOTSUPP,
        ErrorCode::Unavailable | ErrorCode::Internal => Errno::EIO,
        ErrorCode::StaleView => Errno::EAGAIN,
    }
}
fn name_str(name: &OsStr) -> Result<&str> {
    name.to_str().ok_or(Errno::EILSEQ)
}
fn mode_bits(mode: u32) -> u32 {
    mode & 0o7777
}
fn kind(object: &Object) -> FileType {
    if object.directory {
        FileType::Directory
    } else {
        FileType::RegularFile
    }
}
fn empty_reply(result: Result<()>, reply: ReplyEmpty) {
    match result {
        Ok(()) => reply.ok(),
        Err(e) => reply.error(e),
    }
}
fn xattr_reply(result: Result<Vec<u8>>, size: u32, reply: ReplyXattr) {
    match result {
        Ok(bytes) if size == 0 => reply.size(bytes.len() as u32),
        Ok(bytes) if bytes.len() <= size as usize => reply.data(&bytes),
        Ok(_) => reply.error(Errno::ERANGE),
        Err(e) => reply.error(e),
    }
}
fn system_time(time: Timestamp) -> Result<SystemTime> {
    let seconds = Duration::from_secs(time.seconds.unsigned_abs());
    let base = if time.seconds < 0 {
        UNIX_EPOCH.checked_sub(seconds)
    } else {
        UNIX_EPOCH.checked_add(seconds)
    };
    base.and_then(|t| t.checked_add(Duration::from_nanos(u64::from(time.nanos))))
        .ok_or(Errno::EOVERFLOW)
}
fn timestamp(time: TimeOrNow) -> Result<Timestamp> {
    let time = match time {
        TimeOrNow::Now => SystemTime::now(),
        TimeOrNow::SpecificTime(t) => t,
    };
    match time.duration_since(UNIX_EPOCH) {
        Ok(d) => Ok(Timestamp {
            seconds: i64::try_from(d.as_secs()).map_err(|_| Errno::EOVERFLOW)?,
            nanos: d.subsec_nanos(),
        }),
        Err(e) => {
            let d = e.duration();
            let seconds = i64::try_from(d.as_secs()).map_err(|_| Errno::EOVERFLOW)?;
            Ok(if d.subsec_nanos() == 0 {
                Timestamp {
                    seconds: -seconds,
                    nanos: 0,
                }
            } else {
                Timestamp {
                    seconds: seconds
                        .checked_neg()
                        .and_then(|s| s.checked_sub(1))
                        .ok_or(Errno::EOVERFLOW)?,
                    nanos: 1_000_000_000 - d.subsec_nanos(),
                }
            })
        }
    }
}
impl Filesystem {
    /// @cc [owner:spolu,label:concurrency] directory-cookies-not-pages
    /// Each callback MUST refetch membership, including calls following EOF. Bookmarks may retain
    /// only positions. Partial pages MUST be dropped; readdirplus lookup references MUST be balanced.
    fn directory_contents(
        &self,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        mut reply: DirectoryReply,
    ) {
        let plus = matches!(reply, DirectoryReply::Plus(_));
        let mut emitted = false;
        let result = (|| {
            let handle = self
                .directories
                .lock()
                .get(&fh.0)
                .cloned()
                .ok_or(Errno::EBADF)?;
            let mut directory = handle.lock();
            if directory.ino != ino.0 {
                return Err(Errno::EBADF);
            }
            let parent = self.inodes.lock().node(ino.0).ok_or(Errno::ESTALE)?.parent;
            for (cookie, id, name) in [(1, ino.0, "."), (2, parent, "..")] {
                if offset < cookie {
                    let object = self.stat(INodeNo(id))?;
                    let attr = self.attr(INodeNo(id), &object)?;
                    if reply.add(cookie, name, &attr) {
                        return Ok(());
                    }
                    emitted = true;
                }
            }
            let (mut position, mut after) = directory
                .cookies
                .range(..=offset)
                .next_back()
                .map(|(o, s)| (*o, Some(s.clone())))
                .unwrap_or((2, None));
            let id = self.object(ino)?;
            loop {
                let page = self
                    .client
                    .list(ListRequest {
                        directory_id: id.clone(),
                        after: after.clone(),
                        limit: PAGE,
                    })
                    .map_err(|e| self.rpc_error(e))?;
                for entry in &page.entries {
                    let object = entry.object.as_ref().ok_or(Errno::EIO)?;
                    let cursor = if id == "shared" {
                        object.id.clone()
                    } else {
                        entry.name.clone()
                    };
                    position = position.checked_add(1).ok_or(Errno::EOVERFLOW)?;
                    if position > offset {
                        let attr = if plus {
                            self.entry(ino, object.clone())?
                        } else {
                            let number = self
                                .inodes
                                .lock()
                                .existing(ino.0, &object.id, !object.directory)
                                .unwrap_or(0);
                            self.attr(INodeNo(number), object)?
                        };
                        if reply.add(position, &entry.name, &attr) {
                            if plus {
                                self.inodes.lock().forget(attr.ino.0, 1);
                            }
                            return Ok(());
                        }
                        emitted = true;
                    }
                    directory.cookies.insert(position, cursor);
                    if directory.cookies.len() > 1024 {
                        directory.cookies.pop_first();
                    }
                }
                match page.next_after {
                    Some(next) if after.as_ref() != Some(&next) => after = Some(next),
                    Some(_) => return Err(Errno::EIO),
                    None => return Ok(()),
                }
            }
        })();
        reply.finish(if emitted { Ok(()) } else { result });
    }
}
