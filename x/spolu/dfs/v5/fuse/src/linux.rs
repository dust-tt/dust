use crate::inodes::Inodes;
use ::dfs_client::{CacheReservation, CachedClient, inline};
use dfs_protocol::ObjectRef;
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

#[derive(Clone, Copy)]
struct Caller {
    uid: u32,
    gid: u32,
}
impl Caller {
    fn of(request: &Request) -> Self {
        Self {
            uid: request.uid(),
            gid: request.gid(),
        }
    }
}

/// @cc [owner:spolu,label:security] mount-posix-mode-checks
/// Checks MUST use freshly authorized cached attributes and the calling uid/gid. Root MAY bypass
/// read/write checks, but executing a regular file requires an execute bit. Ownership is the mount
/// uid/gid; the mount MUST NOT enable allow_other or rely on kernel DefaultPermissions.
fn permitted(object: &Attr, caller: Caller, owner: Caller, mask: i32) -> Result<()> {
    if mask & !(libc::R_OK | libc::W_OK | libc::X_OK) != 0 {
        return Err(Errno::EINVAL);
    }
    if caller.uid == 0 {
        if mask & libc::X_OK != 0 && !object.directory && object.mode & 0o111 == 0 {
            return Err(Errno::EACCES);
        }
        return Ok(());
    }
    let shift = if caller.uid == owner.uid {
        6
    } else if caller.gid == owner.gid {
        3
    } else {
        0
    };
    if ((object.mode >> shift) & 7) & mask as u32 != mask as u32 {
        return Err(Errno::EACCES);
    }
    Ok(())
}

#[cfg(test)]
mod mode_tests {
    use super::*;
    #[test]
    fn owner_group_other_and_root_execute_rules() {
        let owner = Caller {
            uid: 1000,
            gid: 1000,
        };
        let group = Caller {
            uid: 1001,
            gid: 1000,
        };
        let other = Caller {
            uid: 1002,
            gid: 1002,
        };
        let root = Caller { uid: 0, gid: 0 };
        let mut file = Attr {
            mode: 0o640,
            ..Default::default()
        };
        assert!(permitted(&file, owner, owner, libc::R_OK | libc::W_OK).is_ok());
        assert!(permitted(&file, group, owner, libc::R_OK).is_ok());
        assert_eq!(
            permitted(&file, group, owner, libc::W_OK),
            Err(Errno::EACCES)
        );
        assert_eq!(
            permitted(&file, other, owner, libc::R_OK),
            Err(Errno::EACCES)
        );
        assert!(permitted(&file, root, owner, libc::R_OK | libc::W_OK).is_ok());
        assert_eq!(
            permitted(&file, root, owner, libc::X_OK),
            Err(Errno::EACCES)
        );
        file.mode = 0o011;
        assert_eq!(
            permitted(&file, owner, owner, libc::X_OK),
            Err(Errno::EACCES)
        );
        assert!(permitted(&file, root, owner, libc::X_OK).is_ok());
        file.mode = 0;
        file.directory = true;
        assert!(permitted(&file, root, owner, libc::X_OK).is_ok());
        assert_eq!(
            permitted(&file, owner, owner, libc::X_OK),
            Err(Errno::EACCES)
        );
        assert_eq!(permitted(&file, root, owner, 8), Err(Errno::EINVAL));
    }
}
fn lock_handle<T>(mutex: &Mutex<T>) -> Result<parking_lot::MutexGuard<'_, T>> {
    if inline::active() && !inline::effective() {
        mutex.try_lock().ok_or_else(deferred)
    } else {
        Ok(mutex.lock())
    }
}

/// @cc [owner:spolu,label:architecture;concurrency] userspace-cached-mount
/// File handles MUST use direct I/O and all reply TTLs MUST be zero. The client cache owns metadata,
/// block validation, writeback, and object fsync. Mutations MUST NOT be replayed after RPC failure.
pub struct State {
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
pub struct Filesystem {
    state: Arc<State>,
    workers: crate::workers::Workers,
}
impl std::ops::Deref for Filesystem {
    type Target = State;
    fn deref(&self) -> &State {
        &self.state
    }
}
impl Filesystem {
    pub fn new(
        client: CachedClient,
        read_only: bool,
        stopped: Arc<AtomicBool>,
        workers: usize,
    ) -> anyhow::Result<Self> {
        client.stat_one(ObjectRequest {
            object_id: ObjectRef::Root,
        })?;
        let root_memory = client.reserve_bookkeeping(1024)?;
        Ok(Self {
            workers: crate::workers::Workers::new(workers)?,
            state: Arc::new(State {
                client,
                inodes: Mutex::new(Inodes::new(root_memory)),
                files: Default::default(),
                directories: Default::default(),
                next_handle: AtomicU64::new(1),
                stopped,
                uid: nix::unistd::getuid().as_raw(),
                gid: nix::unistd::getgid().as_raw(),
                read_only,
            }),
        })
    }
    /// @cc [owner:spolu,label:performance;concurrency] inline-or-bounded-deferral
    /// A callback MAY run again only after an inline probe deferred before filesystem effects.
    /// Deferred captures MUST reserve shared memory and a bounded worker slot before queueing.
    /// Replies MUST complete exactly once, and a deferral sentinel MUST never reach the kernel.
    fn serve<R: Fail + Send + 'static>(
        &self,
        name: &'static str,
        reply: R,
        captured_bytes: usize,
        operation: impl Fn(&State, R) -> Option<R> + Send + 'static,
    ) {
        let scratch = if matches!(name, "fuse.readdir" | "fuse.readdirplus") {
            4 * 1024 * 1024
        } else {
            1024 * 1024
        };
        let operation = move |state: &State, reply: R| {
            let _memory = match state.client.reserve_temporary(scratch) {
                Ok(memory) => memory,
                Err(error) if inline::is_deferred(&error) => return Some(reply),
                Err(error) => {
                    reply.fail(state.rpc_error(error));
                    return None;
                }
            };
            operation(state, reply)
        };
        let timer = self.client.measure_fuse_call(name);
        let deferred = inline::probe(|| operation(&self.state, reply));
        if let Some(reply) = deferred {
            let Some(slot) = self.workers.reserve() else {
                reply.fail(Errno::EAGAIN);
                return;
            };
            let memory = match self.client.reserve_bookkeeping(captured_bytes + 4096) {
                Ok(memory) => memory,
                Err(error) => {
                    reply.fail(self.rpc_error(error));
                    return;
                }
            };
            let state = self.state.clone();
            let deferred_timer = self.client.measure_fuse_call("fuse.deferred");
            self.workers.submit(slot, move || {
                let (_memory, _timer, _deferred_timer) = (memory, timer, deferred_timer);
                if let Some(reply) = operation(&state, reply) {
                    reply.fail(Errno::EIO);
                }
            });
        } else {
            let _metric = self.client.measure_fuse_call("fuse.inline");
        }
    }
}
impl State {
    fn permission(&self, ino: INodeNo, caller: Caller, mask: i32) -> Result<Attr> {
        let object = self.stat(ino)?;
        if mask & libc::W_OK != 0 {
            self.parent(ino)?;
        }
        permitted(
            &object,
            caller,
            Caller {
                uid: self.uid,
                gid: self.gid,
            },
            mask,
        )?;
        Ok(object)
    }
    fn owner(&self, caller: Caller) -> Result<()> {
        if caller.uid != 0 && caller.uid != self.uid {
            return Err(Errno::EPERM);
        }
        Ok(())
    }
    fn rpc_error(&self, error: tonic::Status) -> Errno {
        if inline::is_deferred(&error) {
            return deferred();
        }
        if code(&error) == ErrorCode::Unauthenticated {
            self.stopped.store(true, Ordering::Release);
        }
        errno(error)
    }
    fn object(&self, ino: INodeNo) -> Result<ObjectRef> {
        self.inodes
            .lock()
            .node(ino.0)
            .map(|n| n.object)
            .ok_or(Errno::ESTALE)
    }
    fn parent(&self, ino: INodeNo) -> Result<ObjectRef> {
        if self.read_only {
            return Err(Errno::EROFS);
        }
        let id = self.object(ino)?;
        if id.is_virtual() {
            return Err(Errno::EROFS);
        }
        Ok(id)
    }
    fn stat(&self, ino: INodeNo) -> Result<Attr> {
        self.stat_id(&self.object(ino)?)
    }
    fn stat_id(&self, id: &ObjectRef) -> Result<Attr> {
        self.client
            .stat_one(ObjectRequest {
                object_id: id.into(),
            })
            .map_err(|e| self.rpc_error(e))
    }
    fn lookup_id(&self, parent: &ObjectRef, name: &str) -> Result<Attr> {
        self.client
            .lookup(LookupRequest {
                parent_id: parent.into(),
                name: name.into(),
            })
            .map_err(|e| self.rpc_error(e))
    }
    fn entry(&self, parent: INodeNo, object: Attr) -> Result<FileAttr> {
        let mut attr = self.attr(INodeNo(0), &object)?;
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
        attr.ino = INodeNo(ino);
        Ok(attr)
    }
    fn handle_number(&self) -> Result<u64> {
        self.next_handle
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
            .map_err(|_| Errno::EMFILE)
    }
    fn file(&self, ino: INodeNo, fh: FileHandle) -> Result<Arc<Mutex<File>>> {
        let file = self.files.lock().get(&fh.0).cloned().ok_or(Errno::EBADF)?;
        if lock_handle(&file)?.ino != ino.0 {
            return Err(Errno::EBADF);
        }
        Ok(file)
    }
    /// @cc [owner:spolu,label:concurrency;security] create-response-handle
    /// Supplied metadata MUST be the successful create response from this callback for this inode.
    /// Ordinary opens MUST resolve metadata through the client's bounded authorization cache.
    fn open_file(
        &self,
        ino: INodeNo,
        flags: i32,
        created: Option<&Attr>,
        caller: Caller,
    ) -> Result<FileHandle> {
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
            None => {
                self.permission(
                    ino,
                    caller,
                    if read { libc::R_OK } else { 0 }
                        | if write || flags & libc::O_TRUNC != 0 {
                            libc::W_OK
                        } else {
                            0
                        },
                )?
                .directory
            }
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
    fn update(&self, ino: INodeNo, request: UpdateRequest) -> Result<Attr> {
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
        let file = lock_handle(&file)?;
        if file.closed {
            return Err(Errno::EBADF);
        }
        if let Some(e) = file.failure {
            return Err(e);
        }
        drop(file);
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
        caller: Caller,
    ) -> Result<Attr> {
        self.permission(parent, caller, libc::W_OK | libc::X_OK)?;
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
    fn remove(&self, parent: INodeNo, name: &OsStr, directory: bool, caller: Caller) -> Result<()> {
        self.permission(parent, caller, libc::W_OK | libc::X_OK)?;
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
    fn metadata(&self, ino: INodeNo) -> Result<Metadata> {
        self.client
            .get_metadata(ObjectRequest {
                object_id: self.object(ino)?,
            })
            .map_err(|e| self.rpc_error(e))
    }
    fn xattr(&self, ino: INodeNo, name: &str, value: Option<Vec<u8>>, flags: i32) -> Result<()> {
        if !name.starts_with("user.") {
            return Err(Errno::EOPNOTSUPP);
        }
        self.stat(ino)?;
        let exists = self.metadata(ino)?.xattrs.contains_key(name);
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
impl State {
    fn attr(&self, ino: INodeNo, object: &Attr) -> Result<FileAttr> {
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
impl Fail for DirectoryReply {
    fn fail(self, error: Errno) {
        self.finish(Err(if error == deferred() {
            Errno::EIO
        } else {
            error
        }));
    }
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
        let captured_bytes = 1024;
        self.serve("fuse.read", reply, captured_bytes, move |fs, reply| {
            let result = (|| {
                if size > CHUNK {
                    return Err(Errno::EINVAL);
                }
                let file = fs.file(ino, fh)?;
                let file = lock_handle(&file)?;
                if file.closed || !file.read {
                    return Err(Errno::EBADF);
                }
                drop(file);
                fs.client
                    .read(ReadRequest {
                        revision: dfs_protocol::Revision::default(),
                        object_id: fs.object(ino)?,
                        offset,
                        length: size,
                    })
                    .map(|r| r.data)
                    .map_err(|e| fs.rpc_error(e))
            })();
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(data) => reply.data(&data),
                Err(e) => reply.error(e),
            }

            None
        });
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
        let data = data.to_vec();
        let captured_bytes = 1024 + data.len();
        self.serve("fuse.write", reply, captured_bytes, move |fs, reply| {
            let result = (|| {
                if data.len() > MAX_IO {
                    return Err(Errno::EINVAL);
                }
                let id = fs.parent(ino)?;
                let file = fs.file(ino, fh)?;
                let guard = lock_handle(&file)?;
                if guard.closed || !guard.write {
                    return Err(Errno::EBADF);
                }
                if let Some(e) = guard.failure {
                    return Err(e);
                }
                let append = guard.append;
                drop(guard);
                if let Err(e) = fs
                    .client
                    .write(WriteRequest {
                        object_id: id,
                        offset,
                        data: data.to_vec(),
                        append,
                    })
                    .map_err(|e| fs.rpc_error(e))
                {
                    if e != deferred() {
                        file.lock().failure = Some(e);
                    }
                    return Err(e);
                }
                Ok(())
            })();
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(()) => reply.written(data.len() as u32),
                Err(e) => reply.error(e),
            }

            None
        });
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
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let newname = newname.to_os_string();
        let captured_bytes = 1024 + name.len() + newname.len();
        self.serve("fuse.rename", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            let newname = newname.as_os_str();
            let result = (|| {
                if flags.bits() & !RENAME_NOREPLACE != 0 {
                    return Err(Errno::EOPNOTSUPP);
                }
                fs.permission(parent, caller, libc::W_OK | libc::X_OK)?;
                fs.permission(newparent, caller, libc::W_OK | libc::X_OK)?;
                let object = fs.lookup_id(&fs.parent(parent)?, name_str(name)?)?;
                fs.client
                    .rename_from(
                        fs.parent(parent)?,
                        name_str(name)?.into(),
                        RenameRequest {
                            object_id: object.id,
                            parent_id: fs.parent(newparent)?,
                            name: name_str(newname)?.into(),
                            replace: flags.is_empty(),
                        },
                    )
                    .map_err(|e| fs.rpc_error(e))?;
                let mut inodes = fs.inodes.lock();
                if let Some(ino) = inodes.existing(parent.0, &object.id, !object.directory) {
                    inodes.reparent(ino, newparent.0).ok_or(Errno::ESTALE)?;
                }
                Ok(())
            })();
            answer_empty(result, reply)
        });
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
        let caller = Caller::of(_req);
        let captured_bytes = 1024;
        self.serve("fuse.setattr", reply, captured_bytes, move |fs, reply| {
            let result = (|| {
                if uid.is_some_and(|v| v != fs.uid)
                    || gid.is_some_and(|v| v != fs.gid)
                    || crtime.is_some()
                    || chgtime.is_some()
                    || bkuptime.is_some()
                    || flags.is_some()
                {
                    return Err(Errno::EOPNOTSUPP);
                }
                let file = fh.map(|h| fs.file(ino, h)).transpose()?;
                let guard = file.as_deref().map(lock_handle).transpose()?;
                if guard
                    .as_ref()
                    .is_some_and(|f| f.closed || (size.is_some() && !f.write))
                {
                    return Err(Errno::EBADF);
                }
                drop(guard);
                if mode.is_some()
                    || uid.is_some()
                    || gid.is_some()
                    || atime.is_some()
                    || mtime.is_some()
                {
                    fs.owner(caller)?;
                }
                if size.is_some() && fh.is_none() {
                    fs.permission(ino, caller, libc::W_OK)?;
                }
                let object = fs.update(
                    ino,
                    UpdateRequest {
                        mode: mode.map(mode_bits),
                        size,
                        atime: atime.map(timestamp).transpose()?,
                        mtime: mtime.map(timestamp).transpose()?,
                        ..Default::default()
                    },
                )?;
                fs.attr(ino, &object)
            })();
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(attr) => reply.attr(&TTL, &attr),
                Err(e) => reply.error(e),
            }

            None
        });
    }
    fn getxattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, size: u32, reply: ReplyXattr) {
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.getxattr", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            let result = (|| {
                let name = name_str(name)?;
                if !name.starts_with("user.") {
                    return Err(Errno::EOPNOTSUPP);
                }
                fs.permission(ino, caller, libc::R_OK)?;
                fs.metadata(ino)?.xattrs.remove(name).ok_or(NO_XATTR)
            })();
            answer_xattr(result, size, reply)
        });
    }
    fn listxattr(&self, _req: &Request, ino: INodeNo, size: u32, reply: ReplyXattr) {
        let caller = Caller::of(_req);
        let captured_bytes = 1024;
        self.serve("fuse.listxattr", reply, captured_bytes, move |fs, reply| {
            let result = fs
                .permission(ino, caller, libc::R_OK)
                .and_then(|_| fs.metadata(ino))
                .map(|o| {
                    o.xattrs
                        .keys()
                        .filter(|k| k.starts_with("user."))
                        .flat_map(|k| k.bytes().chain([0]))
                        .collect()
                });
            answer_xattr(result, size, reply)
        });
    }
    fn fsyncdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        let captured_bytes = 1024;
        self.serve("fuse.fsyncdir", reply, captured_bytes, move |fs, reply| {
            let result = (|| {
                let id = fs.object(ino)?;
                if id.is_virtual() {
                    fs.stat(ino)?;
                } else {
                    fs.client
                        .fsync(ObjectRequest { object_id: id })
                        .map_err(|e| fs.rpc_error(e))?;
                }
                Ok(())
            })();
            answer_empty(result, reply)
        });
    }

    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.lookup", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            let result = (|| {
                let name = name_str(name)?;
                fs.permission(parent, caller, libc::X_OK)?;
                if name == "." || name == ".." {
                    fs.stat(parent)?;
                    let ino = if name == "." {
                        parent.0
                    } else {
                        fs.inodes.lock().node(parent.0).ok_or(Errno::ESTALE)?.parent
                    };
                    let object = fs.stat(INodeNo(ino))?;
                    let node = fs.inodes.lock().node(ino).ok_or(Errno::ESTALE)?;
                    return fs.entry(INodeNo(node.parent), object);
                }
                let object = fs.lookup_id(&fs.object(parent)?, name)?;
                fs.entry(parent, object)
            })();
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
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
                        uid: fs.uid,
                        gid: fs.gid,
                        rdev: 0,
                        blksize: 65536,
                        flags: 0,
                    };
                    reply.entry(&TTL, &attr, Generation(0));
                }
                Err(e) => reply.error(e),
            }

            None
        });
    }
    fn forget(&self, _req: &Request, ino: INodeNo, nlookup: u64) {
        let _call = self.client.measure_fuse_call("fuse.forget");
        self.inodes.lock().forget(ino.0, nlookup);
    }
    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        let captured_bytes = 1024;
        self.serve("fuse.getattr", reply, captured_bytes, move |fs, reply| {
            let result = fs.stat(ino).and_then(|object| fs.attr(ino, &object));
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(attr) => reply.attr(&TTL, &attr),
                Err(e) => reply.error(e),
            }

            None
        });
    }
    fn opendir(&self, _req: &Request, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        let caller = Caller::of(_req);
        let captured_bytes = 1024;
        self.serve("fuse.opendir", reply, captured_bytes, move |fs, reply| {
            let result = (|| {
                if !fs.permission(ino, caller, libc::R_OK)?.directory {
                    return Err(Errno::ENOTDIR);
                }
                let fh = fs.handle_number()?;
                let mut directories = fs.directories.lock();
                if directories.len() >= MAX_HANDLES {
                    return Err(Errno::EMFILE);
                }
                // Up to 1024 bounded-name cookies plus container overhead for this open directory.
                let memory = fs
                    .client
                    .reserve_bookkeeping(1024 * 1024)
                    .map_err(|e| fs.rpc_error(e))?;
                fs.inodes.lock().pin(ino.0).ok_or(Errno::ESTALE)?;
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
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(fh) => reply.opened(FileHandle(fh), FopenFlags::empty()),
                Err(e) => reply.error(e),
            }

            None
        });
    }
    fn readdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        reply: ReplyDirectory,
    ) {
        self.serve(
            "fuse.readdir",
            DirectoryReply::Plain(reply),
            1024,
            move |fs, reply| fs.directory_contents(ino, fh, offset, reply),
        );
    }
    fn readdirplus(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        reply: ReplyDirectoryPlus,
    ) {
        self.serve(
            "fuse.readdirplus",
            DirectoryReply::Plus(reply),
            1024,
            move |fs, reply| fs.directory_contents(ino, fh, offset, reply),
        );
    }
    fn releasedir(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        reply: ReplyEmpty,
    ) {
        let _call = self.client.measure_fuse_call("fuse.releasedir");
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
        let caller = Caller::of(_req);
        let captured_bytes = 1024;
        self.serve("fuse.open", reply, captured_bytes, move |fs, reply| {
            let result = fs.open_file(ino, flags.0, None, caller);
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(fh) => reply.opened(fh, FopenFlags::FOPEN_DIRECT_IO),
                Err(error) => reply.error(error),
            }

            None
        });
    }
    fn flush(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _owner: LockOwner,
        reply: ReplyEmpty,
    ) {
        let _call = self.client.measure_fuse_call("fuse.flush");
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
        let captured_bytes = 1024;
        self.serve("fuse.fsync", reply, captured_bytes, move |fs, reply| {
            answer_empty(fs.sync_file(ino, fh, true), reply)
        });
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
        let _call = self.client.measure_fuse_call("fuse.release");
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
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.create", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            let result = (|| {
                let object = fs.create_file(parent, name, mode & !umask, false, caller)?;
                let attr = fs.entry(parent, object.clone())?;
                match fs.open_file(attr.ino, flags & !libc::O_TRUNC, Some(&object), caller) {
                    Ok(fh) => Ok((attr, fh)),
                    Err(error) => {
                        fs.inodes.lock().forget(attr.ino.0, 1);
                        Err(error)
                    }
                }
            })();
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok((attr, fh)) => {
                    reply.created(&TTL, &attr, Generation(0), fh, FopenFlags::FOPEN_DIRECT_IO)
                }
                Err(error) => reply.error(error),
            }

            None
        });
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
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.mknod", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            if mode & MODE_TYPE_MASK != MODE_REGULAR {
                reply.error(Errno::EOPNOTSUPP);
                return None;
            }
            let result = fs
                .create_file(parent, name, mode & !umask, false, caller)
                .and_then(|object| fs.entry(parent, object));
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
                Err(error) => reply.error(error),
            }

            None
        });
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
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.mkdir", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            let result = fs
                .create_file(parent, name, mode & !umask, true, caller)
                .and_then(|object| fs.entry(parent, object));
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
                Err(error) => reply.error(error),
            }

            None
        });
    }
    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.unlink", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            answer_empty(fs.remove(parent, name, false, caller), reply)
        });
    }
    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve("fuse.rmdir", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            answer_empty(fs.remove(parent, name, true, caller), reply)
        });
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
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let value = value.to_vec();
        let captured_bytes = 1024 + name.len() + value.len();
        self.serve("fuse.setxattr", reply, captured_bytes, move |fs, reply| {
            let name = name.as_os_str();
            let result = (|| {
                if position != 0 || ![0, libc::XATTR_CREATE, libc::XATTR_REPLACE].contains(&flags) {
                    return Err(Errno::EINVAL);
                }
                if value.len() > 32 * 1024 {
                    return Err(Errno::E2BIG);
                }
                fs.permission(ino, caller, libc::W_OK)?;
                fs.xattr(ino, name_str(name)?, Some(value.to_vec()), flags)
            })();
            answer_empty(result, reply)
        });
    }
    fn removexattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let caller = Caller::of(_req);
        let name = name.to_os_string();
        let captured_bytes = 1024 + name.len();
        self.serve(
            "fuse.removexattr",
            reply,
            captured_bytes,
            move |fs, reply| {
                let name = name.as_os_str();
                answer_empty(
                    fs.permission(ino, caller, libc::W_OK)
                        .and_then(|_| name_str(name))
                        .and_then(|name| fs.xattr(ino, name, None, libc::XATTR_REPLACE)),
                    reply,
                )
            },
        );
    }
    fn access(&self, _req: &Request, ino: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
        let caller = Caller::of(_req);
        let captured_bytes = 1024;
        self.serve("fuse.access", reply, captured_bytes, move |fs, reply| {
            let result = (|| {
                fs.permission(ino, caller, mask.bits())?;
                if mask.bits() & libc::W_OK != 0 {
                    fs.parent(ino)?;
                }
                Ok(())
            })();
            answer_empty(result, reply)
        });
    }
    fn statfs(&self, _req: &Request, ino: INodeNo, reply: ReplyStatfs) {
        let captured_bytes = 1024;
        self.serve("fuse.statfs", reply, captured_bytes, move |fs, reply| {
            let result = fs.stat(ino);
            if result.as_ref().is_err_and(|error| *error == deferred()) {
                return Some(reply);
            }
            match result {
                Ok(_) => reply.statfs(0, 0, 0, 0, 0, 4096, 255, 4096),
                Err(e) => reply.error(e),
            }

            None
        });
    }
    fn symlink(
        &self,
        _req: &Request,
        _parent: INodeNo,
        _name: &OsStr,
        _target: &Path,
        reply: ReplyEntry,
    ) {
        let _call = self.client.measure_fuse_call("fuse.symlink");
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
        let _call = self.client.measure_fuse_call("fuse.link");
        reply.error(Errno::EOPNOTSUPP);
    }
    fn readlink(&self, _req: &Request, _ino: INodeNo, reply: ReplyData) {
        let _call = self.client.measure_fuse_call("fuse.readlink");
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
        let _call = self.client.measure_fuse_call("fuse.getlk");
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
        let _call = self.client.measure_fuse_call("fuse.setlk");
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
        let _call = self.client.measure_fuse_call("fuse.fallocate");
        reply.error(Errno::EOPNOTSUPP);
    }
}
fn deferred() -> Errno {
    Errno::from_i32(libc::EINPROGRESS)
}
trait Fail {
    fn fail(self, error: Errno);
}
macro_rules! replies {
    ($($reply:ty),*) => { $(impl Fail for $reply {
        fn fail(self, error: Errno) { self.error(if error == deferred() { Errno::EIO } else { error }); }
    })* };
}
replies!(
    ReplyData,
    ReplyWrite,
    ReplyEmpty,
    ReplyAttr,
    ReplyEntry,
    ReplyOpen,
    ReplyCreate,
    ReplyXattr,
    ReplyStatfs,
    ReplyDirectory,
    ReplyDirectoryPlus
);
fn answer_empty(result: Result<()>, reply: ReplyEmpty) -> Option<ReplyEmpty> {
    match result {
        Err(error) if error == deferred() => Some(reply),
        result => {
            empty_reply(result, reply);
            None
        }
    }
}
fn answer_xattr(result: Result<Vec<u8>>, size: u32, reply: ReplyXattr) -> Option<ReplyXattr> {
    match result {
        Err(error) if error == deferred() => Some(reply),
        result => {
            xattr_reply(result, size, reply);
            None
        }
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
fn kind(object: &Attr) -> FileType {
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
struct DirectoryItem {
    cookie: u64,
    name: String,
    object: Attr,
    ino: Option<INodeNo>,
    cursor: bool,
}
impl State {
    /// @cc [owner:spolu,label:concurrency] directory-cookies-not-pages
    /// Handles MUST retain only positions. Every callback, including after EOF, MUST consult the
    /// current client listing view. All possible deferrals MUST precede reply bytes, inode lookup
    /// references and cookie changes. Partial replies MUST balance unreturned lookup references.
    fn directory_contents(
        &self,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        mut reply: DirectoryReply,
    ) -> Option<DirectoryReply> {
        let plus = matches!(reply, DirectoryReply::Plus(_));
        let prepared = (|| {
            let handle = self
                .directories
                .lock()
                .get(&fh.0)
                .cloned()
                .ok_or(Errno::EBADF)?;
            let (mut position, mut after) = {
                let directory = lock_handle(&handle)?;
                if directory.ino != ino.0 {
                    return Err(Errno::EBADF);
                }
                directory
                    .cookies
                    .range(..=offset)
                    .next_back()
                    .map(|(o, s)| (*o, Some(s.clone())))
                    .unwrap_or((2, None))
            };
            let parent = self.inodes.lock().node(ino.0).ok_or(Errno::ESTALE)?.parent;
            let mut items = Vec::with_capacity(self.client.directory_page_entries() as usize + 2);
            for (cookie, id, name) in [(1, ino.0, "."), (2, parent, "..")] {
                if offset < cookie {
                    items.push(DirectoryItem {
                        cookie,
                        name: name.into(),
                        object: self.stat(INodeNo(id))?,
                        ino: Some(INodeNo(id)),
                        cursor: false,
                    });
                }
            }
            let id = self.object(ino)?;
            loop {
                let page = self
                    .client
                    .list(ListRequest {
                        directory_id: id,
                        after: after.clone(),
                        limit: self.client.directory_page_entries(),
                    })
                    .map_err(|error| self.rpc_error(error))?;
                let mut found = false;
                for entry in page.entries {
                    position = position.checked_add(1).ok_or(Errno::EOVERFLOW)?;
                    if position <= offset {
                        continue;
                    }
                    let object = entry.object.ok_or(Errno::EIO)?;
                    items.push(DirectoryItem {
                        cookie: position,
                        name: entry.name,
                        object,
                        ino: None,
                        cursor: true,
                    });
                    found = true;
                }
                if found || page.next_after.is_none() {
                    break;
                }
                match page.next_after {
                    Some(next) if after.as_ref() != Some(&next) => after = Some(next),
                    _ => return Err(Errno::EIO),
                }
            }
            Ok((handle, id, items))
        })();
        let (handle, id, items) = match prepared {
            Ok(prepared) => prepared,
            Err(error) if error == deferred() => return Some(reply),
            Err(error) => {
                reply.finish(Err(error));
                return None;
            }
        };
        let mut directory = match lock_handle(&handle) {
            Ok(directory) => directory,
            Err(error) if error == deferred() => return Some(reply),
            Err(error) => {
                reply.finish(Err(error));
                return None;
            }
        };
        let mut emitted = false;
        let result = (|| {
            for item in items {
                let attr = match item.ino {
                    Some(ino) => self.attr(ino, &item.object)?,
                    None if plus => self.entry(ino, item.object.clone())?,
                    None => {
                        let number = self
                            .inodes
                            .lock()
                            .existing(ino.0, &item.object.id, !item.object.directory)
                            .unwrap_or(0);
                        self.attr(INodeNo(number), &item.object)?
                    }
                };
                if reply.add(item.cookie, &item.name, &attr) {
                    if plus && item.ino.is_none() {
                        self.inodes.lock().forget(attr.ino.0, 1);
                    }
                    break;
                }
                emitted = true;
                if item.cursor {
                    let cursor = if id == ObjectRef::Shared {
                        item.object.id.to_string()
                    } else {
                        item.name
                    };
                    directory.cookies.insert(item.cookie, cursor);
                    if directory.cookies.len() > 1024 {
                        directory.cookies.pop_first();
                    }
                }
            }
            Ok(())
        })();
        reply.finish(if emitted { Ok(()) } else { result });
        None
    }
}
