use crate::inodes::Inodes;
use dfs_client::BlockingClient;
use dfs_protocol::{
    MAX_IO,
    error::code,
    rpc::{
        CreateRequest, ErrorCode, Expected, ListRequest, LookupRequest, Mutation, Object,
        ObjectRequest, Page, ReadRequest, RemoveRequest, RenameRequest, Timestamp, UpdateRequest,
        WriteRequest, XattrChange,
    },
};
use fuser::*;
use parking_lot::{Mutex, RwLock};
use std::{
    collections::{BTreeSet, HashMap},
    ffi::OsStr,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{SyncSender, sync_channel},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

type Result<T> = std::result::Result<T, Errno>;
type SharedObject = Arc<Mutex<CachedObject>>;
// A protocol TTL is required, but this mount makes no timed freshness promise.
const TTL: Duration = Duration::from_secs(u32::MAX as u64);
const MAX_INVALIDATIONS: usize = 1024;
#[cfg(target_os = "linux")]
const NO_XATTR: Errno = Errno::ENODATA;
#[cfg(target_os = "macos")]
const NO_XATTR: Errno = Errno::ENOATTR;
// Linux wire flags, also compiled with fuser's no-mount macOS backend for native checks.
const O_PATH: i32 = 0x20_0000;
const RENAME_NOREPLACE: u32 = 1;
const MODE_TYPE_MASK: u32 = 0o170000;
const MODE_REGULAR: u32 = 0o100000;

pub struct IoConfig {
    pub read_ahead_bytes: u32,
    pub max_background: u16,
}

struct CachedObject {
    object: Object,
    failure: Option<Errno>,
    refresh: bool,
    deleted: bool,
}
impl CachedObject {
    fn new(mut object: Object) -> Self {
        // Kernel attributes do not need arbitrary xattrs or MIME strings in every resident inode.
        object.xattrs.clear();
        object.mime_type.clear();
        Self {
            object,
            failure: None,
            refresh: false,
            deleted: false,
        }
    }
    fn check(&self) -> Result<()> {
        self.failure.map_or(Ok(()), Err)
    }
    fn published(&mut self, object: Object) {
        *self = Self::new(object);
    }
    fn failed(&mut self, error: Errno) {
        if self.object.directory {
            self.refresh = true;
        } else if !matches!(error, Errno::EINVAL | Errno::EEXIST | Errno::EOPNOTSUPP)
            && error != NO_XATTR
        {
            // Dirty kernel pages must never be replayed with a new expected version.
            self.failure.get_or_insert(error);
        }
    }
}

#[derive(Clone)]
enum Invalidation {
    Attributes(u64),
    Directory(u64),
    Entry(u64, String),
}

/// @cc [owner:spolu,label:concurrency] notifications-outside-callbacks
/// Kernel invalidations MUST execute outside FUSE callbacks and without object/inode locks. A full
/// queue or failed notification MUST stop the mount rather than silently retain incoherent aliases.
pub struct Notifications {
    sender: SyncSender<Invalidation>,
    stopped: Arc<AtomicBool>,
}
impl Notifications {
    pub fn start(notifier: Notifier, stopped: Arc<AtomicBool>) -> Arc<Self> {
        let (sender, receiver) = sync_channel(MAX_INVALIDATIONS);
        let worker_stopped = stopped.clone();
        std::thread::spawn(move || {
            for notification in receiver {
                let result = match notification {
                    Invalidation::Attributes(ino) => notifier.inval_inode(INodeNo(ino), -1, 0),
                    Invalidation::Directory(ino) => notifier.inval_inode(INodeNo(ino), 0, -1),
                    Invalidation::Entry(ino, name) => {
                        notifier.inval_entry(INodeNo(ino), OsStr::new(&name))
                    }
                };
                if let Err(error) = result {
                    eprintln!("dfs-fuse: invalidation failed: {error}");
                    worker_stopped.store(true, Ordering::Release);
                    break;
                }
            }
        });
        Arc::new(Self { sender, stopped })
    }
    fn send(&self, notification: Invalidation) {
        if self.sender.try_send(notification).is_err() {
            self.stopped.store(true, Ordering::Release);
        }
    }
}
const CHUNK: u32 = MAX_IO as u32;
const PAGE: u32 = 64;
const MAX_HANDLES: usize = 256;
struct File {
    ino: u64,
    read: bool,
    write: bool,
    closed: bool,
    state: SharedObject,
}
#[derive(Default)]
struct Directory {
    ino: u64,
    offset: u64,
    after: Option<String>,
    skip: usize,
    end: bool,
    page: Option<Page>,
}

/// @cc [owner:spolu,label:concurrency;security] local-version-state
/// All aliases and handles for one object MUST serialize mutations and share its expected version.
/// Cached file pages MUST keep their base version across opens and cache fills. Only this client's
/// successful mutations may advance it. Writeback errors, conflicts, and ambiguous file mutations
/// MUST remain sticky across handles until inode reclamation or remount. Queued writes MUST NOT adopt
/// a new version. Known metadata precondition errors need not poison the file.
pub struct Filesystem {
    client: BlockingClient,
    inodes: Mutex<Inodes<SharedObject>>,
    files: Mutex<HashMap<u64, Arc<Mutex<File>>>>,
    directories: Mutex<HashMap<u64, Arc<Mutex<Directory>>>>,
    notifications: Arc<Mutex<Option<Arc<Notifications>>>>,
    stopped: Arc<AtomicBool>,
    namespace: RwLock<()>,
    io: IoConfig,
    next_handle: AtomicU64,
    uid: u32,
    gid: u32,
    read_only: bool,
}
impl Filesystem {
    pub fn new(
        client: BlockingClient,
        read_only: bool,
        notifications: Arc<Mutex<Option<Arc<Notifications>>>>,
        stopped: Arc<AtomicBool>,
        io: IoConfig,
    ) -> anyhow::Result<Self> {
        let root = client.stat(ObjectRequest {
            object_id: "root".into(),
        })?;
        Ok(Self {
            client,
            inodes: Mutex::new(Inodes::new(Arc::new(Mutex::new(CachedObject::new(root))))),
            files: Default::default(),
            directories: Default::default(),
            notifications,
            stopped,
            namespace: RwLock::new(()),
            io,
            next_handle: AtomicU64::new(1),
            uid: nix::unistd::getuid().as_raw(),
            gid: nix::unistd::getgid().as_raw(),
            read_only,
        })
    }
    fn object(&self, ino: INodeNo) -> Result<String> {
        self.inodes
            .lock()
            .node(ino.0)
            .map(|n| n.object)
            .ok_or(Errno::ESTALE)
    }
    fn writable(&self) -> Result<()> {
        if self.read_only {
            Err(Errno::EROFS)
        } else {
            Ok(())
        }
    }
    fn parent(&self, ino: INodeNo) -> Result<String> {
        self.writable()?;
        let id = self.object(ino)?;
        if matches!(id.as_str(), "root" | "shared") {
            return Err(Errno::EROFS);
        }
        Ok(id)
    }
    fn state(&self, ino: INodeNo) -> Result<SharedObject> {
        self.inodes
            .lock()
            .node(ino.0)
            .map(|n| n.value)
            .ok_or(Errno::ESTALE)
    }
    fn stat(&self, ino: INodeNo) -> Result<Object> {
        Ok(self.state(ino)?.lock().object.clone())
    }
    fn rpc_error(&self, error: tonic::Status) -> Errno {
        if code(&error) == ErrorCode::Unauthenticated {
            self.stopped.store(true, Ordering::Release);
        }
        errno(error)
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
        let (ino, state) = {
            let mut inodes = self.inodes.lock();
            let state = inodes
                .value(&object.id)
                .unwrap_or_else(|| Arc::new(Mutex::new(CachedObject::new(object.clone()))));
            let ino = inodes
                .lookup(parent.0, &object.id, !object.directory, state.clone())
                .ok_or(Errno::ENOSPC)?;
            (ino, state)
        };
        self.attr(INodeNo(ino), &state.lock().object)
    }
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
    fn state_id(&self, id: &str) -> Result<SharedObject> {
        let existing = self.inodes.lock().value(id);
        match existing {
            Some(state) => Ok(state),
            None => Ok(Arc::new(Mutex::new(CachedObject::new(self.stat_id(id)?)))),
        }
    }
    fn mutate(
        &self,
        ids: Vec<String>,
        operation: impl FnOnce(Vec<Expected>) -> Result<Mutation>,
    ) -> Result<Mutation> {
        let ids: BTreeSet<_> = ids.into_iter().collect();
        let states: Vec<_> = ids
            .iter()
            .map(|id| self.state_id(id))
            .collect::<Result<_>>()?;
        // Stable ordering prevents deadlocks between namespace and file mutations.
        let mut guards: Vec<_> = states.iter().map(|state| state.lock()).collect();
        let mut expected = Vec::new();
        for (id, state) in ids.iter().zip(guards.iter_mut()) {
            state.check()?;
            if state.refresh {
                state.published(self.stat_id(id)?);
            }
            expected.push(Expected {
                id: id.clone(),
                version: state.object.version,
            });
        }
        let result = operation(expected);
        for (id, state) in ids.iter().zip(guards.iter_mut()) {
            match &result {
                Ok(response) => {
                    if let Some(object) = response
                        .object
                        .iter()
                        .chain(&response.related)
                        .find(|o| o.id == *id)
                    {
                        state.published(object.clone());
                    } else {
                        state.deleted = true;
                        state.failure = Some(Errno::ENOENT);
                    }
                }
                Err(error) => state.failed(*error),
            }
        }
        result
    }
    fn attributes_changed(&self, object: &str) {
        if let Some(notifications) = self.notifications.lock().clone() {
            for ino in self.inodes.lock().aliases(object) {
                notifications.send(Invalidation::Attributes(ino));
            }
        }
    }
    fn namespace_changed(&self, parent: &str, name: &str, object: &str) {
        // Directory handles retain at most one page. Replay after this mount changes the namespace.
        for directory in self.directories.lock().values() {
            let mut directory = directory.lock();
            *directory = Directory {
                ino: directory.ino,
                ..Default::default()
            };
        }
        let Some(notifications) = self.notifications.lock().clone() else {
            return;
        };
        let inodes = self.inodes.lock();
        for ino in inodes.aliases(parent) {
            notifications.send(Invalidation::Entry(ino, name.into()));
            notifications.send(Invalidation::Directory(ino));
        }
        // Synthetic projections also cache names, including negative lookups.
        let shared_name = shared_name(name, object);
        for (id, name) in [("root", name), ("shared", shared_name.as_str())] {
            for ino in inodes.aliases(id) {
                notifications.send(Invalidation::Entry(ino, name.into()));
                notifications.send(Invalidation::Directory(ino));
            }
        }
    }
    fn file(&self, ino: INodeNo, fh: FileHandle) -> Result<Arc<Mutex<File>>> {
        let file = self.files.lock().get(&fh.0).cloned().ok_or(Errno::EBADF)?;
        if file.lock().ino != ino.0 {
            return Err(Errno::EBADF);
        }
        Ok(file)
    }
    fn handle_number(&self) -> Result<u64> {
        self.next_handle
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
            .map_err(|_| Errno::EMFILE)
    }
    fn open_file(&self, ino: INodeNo, flags: i32) -> Result<FileHandle> {
        let write = flags & libc::O_ACCMODE != libc::O_RDONLY;
        let read = flags & libc::O_ACCMODE != libc::O_WRONLY;
        if flags & libc::O_ACCMODE == libc::O_ACCMODE || flags & O_PATH != 0 {
            return Err(Errno::EOPNOTSUPP);
        }
        if write || flags & libc::O_TRUNC != 0 {
            self.parent(ino)?;
        }
        let object = self.stat(ino)?;
        if object.directory {
            return Err(Errno::EISDIR);
        }
        let state = self.state(ino)?;
        state.lock().check()?;
        let fh = self.handle_number()?;
        {
            let mut files = self.files.lock();
            if files.len() >= MAX_HANDLES {
                return Err(Errno::EMFILE);
            }
            self.inodes.lock().pin(ino.0).ok_or(Errno::ESTALE)?;
            files.insert(
                fh,
                Arc::new(Mutex::new(File {
                    ino: ino.0,
                    read,
                    write,
                    closed: false,
                    state,
                })),
            );
        }
        if flags & libc::O_TRUNC != 0 {
            let result = self.update(
                ino,
                UpdateRequest {
                    size: Some(0),
                    ..Default::default()
                },
            );
            if let Err(error) = result {
                self.files.lock().remove(&fh);
                self.inodes.lock().unpin(ino.0);
                return Err(error);
            }
        }
        Ok(FileHandle(fh))
    }
    fn update(&self, ino: INodeNo, request: UpdateRequest) -> Result<Object> {
        let id = self.parent(ino)?;
        let response = self.mutate(vec![id.clone()], |expected| {
            let version = expected.first().ok_or(Errno::EIO)?.version;
            self.client
                .update(UpdateRequest {
                    object_id: id,
                    expected_version: version,
                    ..request
                })
                .map_err(|e| self.rpc_error(e))
        })?;
        let object = response.object.ok_or(Errno::EIO)?;
        if object.directory {
            self.attributes_changed(&object.id);
        }
        Ok(object)
    }
    fn sync_file(&self, ino: INodeNo, fh: FileHandle, explicit: bool) -> Result<()> {
        let file = self.file(ino, fh)?;
        let file = file.lock();
        if file.closed {
            return Err(Errno::EBADF);
        }
        let state = file.state.lock();
        state.check()?;
        // The kernel drains writeback before FLUSH/FSYNC. RPC acknowledgements already published it.
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
        let _namespace = self.namespace.write();
        let parent_id = self.parent(parent)?;
        let response = self.mutate(vec![parent_id.clone()], |expected| {
            self.client
                .create(CreateRequest {
                    parent_id: parent_id.clone(),
                    name: name_str(name)?.into(),
                    expected_parent_version: expected.first().ok_or(Errno::EIO)?.version,
                    directory,
                    mode: mode_bits(mode),
                    ..Default::default()
                })
                .map_err(|e| self.rpc_error(e))
        })?;
        let object = response.object.ok_or(Errno::EIO)?;
        self.namespace_changed(&parent_id, name_str(name)?, &object.id);
        Ok(object)
    }
    fn remove(&self, parent: INodeNo, name: &OsStr, directory: bool) -> Result<()> {
        let _namespace = self.namespace.write();
        let parent = self.parent(parent)?;
        let object = self.lookup_id(&parent, name_str(name)?)?;
        self.mutate(vec![parent.clone(), object.id.clone()], |expected| {
            self.client
                .remove(RemoveRequest {
                    object_id: object.id.clone(),
                    expected,
                    directory,
                })
                .map_err(|e| self.rpc_error(e))
        })?;
        self.namespace_changed(&parent, name_str(name)?, &object.id);
        Ok(())
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
impl Filesystem {
    fn directory_contents(
        &self,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        mut reply: DirectoryReply,
    ) {
        let _namespace = self.namespace.read();
        let plus = matches!(reply, DirectoryReply::Plus(_));
        let mut emitted = false;
        let result = (|| {
            let directory = self
                .directories
                .lock()
                .get(&fh.0)
                .cloned()
                .ok_or(Errno::EBADF)?;
            let mut directory = directory.lock();
            if directory.ino != ino.0 {
                return Err(Errno::EBADF);
            }
            if directory.offset != offset {
                *directory = Directory {
                    ino: ino.0,
                    ..Default::default()
                };
            }
            let parent = self.inodes.lock().node(ino.0).ok_or(Errno::ESTALE)?.parent;
            for (cookie, id, name) in [(1, ino.0, "."), (2, parent, "..")] {
                if offset < cookie {
                    let attr = self.attr(INodeNo(id), &self.stat(INodeNo(id))?)?;
                    if reply.add(cookie, name, &attr) {
                        return Ok(());
                    }
                    emitted = true;
                }
            }
            let target = offset.max(2);
            directory.offset = directory.offset.max(2);
            while !directory.end {
                if directory.page.is_none() {
                    directory.page = Some(
                        self.client
                            .list(ListRequest {
                                directory_id: self.object(ino)?,
                                after: directory.after.clone(),
                                limit: PAGE,
                            })
                            .map_err(|e| self.rpc_error(e))?,
                    );
                }
                let page = directory.page.as_ref().ok_or(Errno::EIO)?.clone();
                for entry in page.entries.iter().skip(directory.skip) {
                    let object = entry.object.as_ref().ok_or(Errno::EIO)?;
                    if directory.offset >= target {
                        let attr = if plus {
                            self.entry(ino, object.clone())?
                        } else {
                            let id = self
                                .inodes
                                .lock()
                                .existing(ino.0, &object.id, !object.directory)
                                .unwrap_or(0);
                            self.attr(INodeNo(id), object)?
                        };
                        if reply.add(directory.offset + 1, &entry.name, &attr) {
                            if plus {
                                self.inodes.lock().forget(attr.ino.0, 1);
                            }
                            return Ok(());
                        }
                        emitted = true;
                    }
                    directory.offset += 1;
                    directory.skip += 1;
                }
                if page.next_after == directory.after && page.next_after.is_some() {
                    return Err(Errno::EIO);
                }
                directory.after = page.next_after;
                directory.skip = 0;
                directory.page = None;
                directory.end = directory.after.is_none();
            }
            Ok(())
        })();
        // Deliver any entries already acquired; the next request can report a later page error.
        // Discarding a partial readdirplus reply would leak its kernel lookup references.
        reply.finish(if emitted { Ok(()) } else { result });
    }
}
impl fuser::Filesystem for Filesystem {
    fn init(&mut self, _req: &Request, config: &mut KernelConfig) -> std::io::Result<()> {
        self.client.record_fuse_call("fuse.init");
        config
            .set_max_write(CHUNK)
            .map_err(|_| std::io::Error::other("kernel write limit"))?;
        config
            .add_capabilities(
                InitFlags::FUSE_ATOMIC_O_TRUNC
                    | InitFlags::FUSE_WRITEBACK_CACHE
                    | InitFlags::FUSE_DO_READDIRPLUS
                    | InitFlags::FUSE_READDIRPLUS_AUTO
                    | InitFlags::FUSE_PARALLEL_DIROPS
                    | InitFlags::FUSE_POSIX_LOCKS
                    | InitFlags::FUSE_FLOCK_LOCKS,
            )
            .map_err(|_| std::io::Error::other("required kernel capabilities unavailable"))?;
        if let Err(maximum) = config.set_max_readahead(self.io.read_ahead_bytes)
            && maximum > 0
        {
            config
                .set_max_readahead(maximum)
                .map_err(|_| std::io::Error::other("kernel readahead limit"))?;
        }
        config
            .set_max_background(self.io.max_background)
            .map_err(|_| std::io::Error::other("kernel background limit"))?;
        Ok(())
    }
    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        self.client.record_fuse_call("fuse.lookup");
        let _namespace = self.namespace.read();
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
            self.inodes.lock().pin(ino.0).ok_or(Errno::ESTALE)?;
            directories.insert(
                fh,
                Arc::new(Mutex::new(Directory {
                    ino: ino.0,
                    ..Directory::default()
                })),
            );
            Ok(fh)
        })();
        match result {
            Ok(fh) => reply.opened(
                FileHandle(fh),
                FopenFlags::FOPEN_CACHE_DIR | FopenFlags::FOPEN_KEEP_CACHE,
            ),
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
    fn fsyncdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        self.client.record_fuse_call("fuse.fsyncdir");
        // Completed namespace operations already satisfied the server's acknowledgement mode.
        empty_reply(self.stat(ino).map(|_| ()), reply);
    }
    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        self.client.record_fuse_call("fuse.open");
        match self.open_file(ino, flags.0) {
            Ok(fh) => reply.opened(fh, FopenFlags::FOPEN_KEEP_CACHE),
            Err(error) => reply.error(error),
        }
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
            if file.closed || (!file.read && !file.write) {
                return Err(Errno::EBADF);
            }
            let state = file.state.lock();
            state.check()?;
            self.client
                .read(ReadRequest {
                    object_id: self.object(ino)?,
                    offset,
                    length: size,
                    version: Some(state.object.version),
                })
                .map(|response| response.data)
                .map_err(|e| self.rpc_error(e))
        })();
        match result {
            Ok(bytes) => reply.data(&bytes),
            Err(error) => reply.error(error),
        }
    }
    fn write(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        bytes: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        self.client.record_fuse_call("fuse.write");
        let result = (|| {
            if bytes.len() > MAX_IO {
                return Err(Errno::EINVAL);
            }
            let id = self.parent(ino)?;
            let file = self.file(ino, fh)?;
            let file = file.lock();
            if file.closed || !file.write {
                return Err(Errno::EBADF);
            }
            let result = self.mutate(vec![id.clone()], |expected| {
                self.client
                    .write(WriteRequest {
                        object_id: id,
                        expected_version: expected.first().ok_or(Errno::EIO)?.version,
                        offset,
                        data: bytes.to_vec(),
                        append: false,
                    })
                    .map_err(|e| self.rpc_error(e))
            });
            if let Err(error) = result {
                file.state.lock().failure.get_or_insert(error);
                return Err(error);
            }
            Ok(())
        })();
        match result {
            Ok(()) => reply.written(bytes.len() as u32),
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
            let attr = self.entry(parent, object)?;
            match self.open_file(attr.ino, flags & !libc::O_TRUNC) {
                Ok(fh) => Ok((attr, fh)),
                Err(error) => {
                    self.inodes.lock().forget(attr.ino.0, 1);
                    Err(error)
                }
            }
        })();
        match result {
            Ok((attr, fh)) => {
                reply.created(&TTL, &attr, Generation(0), fh, FopenFlags::FOPEN_KEEP_CACHE)
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
            let _namespace = self.namespace.write();
            if flags.bits() & !RENAME_NOREPLACE != 0 {
                return Err(Errno::EOPNOTSUPP);
            }
            let parent_id = self.parent(parent)?;
            let newparent_id = self.parent(newparent)?;
            let object = self.lookup_id(&parent_id, name_str(name)?)?;
            let mut ids = vec![parent_id.clone(), newparent_id.clone(), object.id.clone()];
            let replacement = match self.lookup_id(&newparent_id, name_str(newname)?) {
                Ok(replacement) => {
                    ids.push(replacement.id.clone());
                    Some(replacement.id)
                }
                Err(Errno::ENOENT) => None,
                Err(error) => return Err(error),
            };
            self.mutate(ids, |expected| {
                self.client
                    .rename(RenameRequest {
                        object_id: object.id.clone(),
                        parent_id: newparent_id.clone(),
                        name: name_str(newname)?.into(),
                        replace: flags.is_empty(),
                        expected,
                    })
                    .map_err(|e| self.rpc_error(e))
            })?;
            self.namespace_changed(&parent_id, name_str(name)?, &object.id);
            self.namespace_changed(&newparent_id, name_str(newname)?, &object.id);
            if let Some(replacement) = replacement {
                self.namespace_changed(&newparent_id, name_str(newname)?, &replacement);
            }
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
        ctime: Option<SystemTime>,
        fh: Option<FileHandle>,
        crtime: Option<SystemTime>,
        chgtime: Option<SystemTime>,
        bkuptime: Option<SystemTime>,
        flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        self.client.record_fuse_call("fuse.setattr");
        let result = (|| {
            self.parent(ino)?;
            if uid.is_some_and(|id| id != self.uid)
                || gid.is_some_and(|id| id != self.gid)
                || crtime.is_some()
                || chgtime.is_some()
                || bkuptime.is_some()
                || flags.is_some()
            {
                return Err(Errno::EOPNOTSUPP);
            }
            // Linux flushes timestamps after a successful unlink, even without an open handle.
            // Acknowledge that cleanup locally; deleted content and explicit mutations still fail.
            if fh.is_none()
                && mode.is_none()
                && uid.is_none()
                && gid.is_none()
                && size.is_none()
                && atime.is_none()
                && mtime.is_some()
                && ctime.is_some()
            {
                let state = self.state(ino)?;
                let state = state.lock();
                if state.deleted {
                    let mut attr = self.attr(ino, &state.object)?;
                    attr.nlink = 0;
                    return Ok(attr);
                }
            }
            let file = fh.map(|fh| self.file(ino, fh)).transpose()?;
            let file = file.as_ref().map(|file| file.lock());
            if file
                .as_ref()
                .is_some_and(|file| file.closed || (size.is_some() && !file.write))
            {
                return Err(Errno::EBADF);
            }
            let result = self.update(
                ino,
                UpdateRequest {
                    mode: mode.map(mode_bits),
                    size,
                    atime: atime.map(timestamp).transpose()?,
                    mtime: mtime.map(timestamp).transpose()?,
                    ..Default::default()
                },
            );
            match result {
                Ok(object) => self.attr(ino, &object),
                Err(error) => Err(error),
            }
        })();
        match result {
            Ok(attr) => reply.attr(&TTL, &attr),
            Err(error) => reply.error(error),
        }
    }
    fn getxattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, size: u32, reply: ReplyXattr) {
        self.client.record_fuse_call("fuse.getxattr");
        let result = (|| {
            let object = self.stat_id(&self.object(ino)?)?;
            let name = name_str(name)?;
            if !name.starts_with("user.") {
                return Err(Errno::EOPNOTSUPP);
            }
            object.xattrs.get(name).cloned().ok_or(NO_XATTR)
        })();
        xattr_reply(result, size, reply);
    }
    fn listxattr(&self, _req: &Request, ino: INodeNo, size: u32, reply: ReplyXattr) {
        self.client.record_fuse_call("fuse.listxattr");
        xattr_reply(
            self.object(ino)
                .and_then(|id| self.stat_id(&id))
                .map(|object| {
                    object
                        .xattrs
                        .keys()
                        .filter(|name| name.starts_with("user."))
                        .flat_map(|name| name.bytes().chain([0]))
                        .collect()
                }),
            size,
            reply,
        );
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
impl Filesystem {
    fn xattr(&self, ino: INodeNo, name: &str, value: Option<Vec<u8>>, flags: i32) -> Result<()> {
        let id = self.parent(ino)?;
        if !name.starts_with("user.") {
            return Err(Errno::EOPNOTSUPP);
        }
        self.mutate(vec![id.clone()], |expected| {
            let object = self.stat_id(&id)?;
            if flags == libc::XATTR_CREATE && object.xattrs.contains_key(name) {
                return Err(Errno::EEXIST);
            }
            if flags == libc::XATTR_REPLACE && !object.xattrs.contains_key(name) {
                return Err(NO_XATTR);
            }
            self.client
                .update(UpdateRequest {
                    object_id: id.clone(),
                    expected_version: expected.first().ok_or(Errno::EIO)?.version,
                    xattrs: vec![XattrChange {
                        name: name.into(),
                        value,
                    }],
                    ..Default::default()
                })
                .map_err(|e| self.rpc_error(e))
        })?;
        self.attributes_changed(&id);
        Ok(())
    }
}
// Same bounded basename rendering as the server's /shared projection.
fn shared_name(name: &str, id: &str) -> String {
    let mut end = name.len().min(221);
    while !name.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}--{id}", &name[..end])
}
fn errno(error: tonic::Status) -> Errno {
    match code(&error) {
        ErrorCode::InvalidInput => Errno::EINVAL,
        ErrorCode::NameTooLong => Errno::ENAMETOOLONG,
        ErrorCode::NotDirectory => Errno::ENOTDIR,
        ErrorCode::IsDirectory => Errno::EISDIR,
        ErrorCode::Unauthenticated | ErrorCode::Forbidden => Errno::EACCES,
        ErrorCode::NotFound => Errno::ENOENT,
        ErrorCode::VersionConflict => Errno::EAGAIN,
        ErrorCode::AlreadyExists => Errno::EEXIST,
        ErrorCode::NotEmpty => Errno::ENOTEMPTY,
        ErrorCode::Capacity => Errno::ENOSPC,
        ErrorCode::Unsupported => Errno::EOPNOTSUPP,
        ErrorCode::Unavailable | ErrorCode::Internal => Errno::EIO,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn object(version: u64, directory: bool) -> Object {
        Object {
            id: "00000000000000000000000000000001".into(),
            version,
            directory,
            ..Default::default()
        }
    }

    #[test]
    fn failed_writeback_remains_failed_across_handles_and_preserves_its_base() {
        let state = Arc::new(Mutex::new(CachedObject::new(object(7, false))));
        let other_handle = state.clone();
        state.lock().failed(Errno::EAGAIN);
        state.lock().failed(Errno::EIO);
        drop(state);
        let state = other_handle.lock();
        assert_eq!(state.check(), Err(Errno::EAGAIN));
        assert_eq!(state.object.version, 7);
        assert!(!state.refresh);
    }

    #[test]
    fn successful_local_publication_updates_metadata_without_retaining_large_xattrs() {
        let mut state = CachedObject::new(object(7, false));
        let mut changed = object(8, false);
        changed.size = 4096;
        changed.xattrs.insert("user.large".into(), vec![1; 32768]);
        state.published(changed);
        assert_eq!(state.object.version, 8);
        assert_eq!(state.object.size, 4096);
        assert!(state.object.xattrs.is_empty());
        assert_eq!(state.check(), Ok(()));
        state.failed(Errno::ENOENT);
        assert_eq!(state.check(), Err(Errno::ENOENT));
    }

    #[test]
    fn directory_conflicts_can_refresh_without_replaying_file_pages() {
        let mut directory = CachedObject::new(object(7, true));
        directory.failed(Errno::EAGAIN);
        assert!(directory.refresh);
        assert_eq!(directory.check(), Ok(()));
        directory.published(object(8, true));
        assert!(!directory.refresh);
        assert_eq!(directory.object.version, 8);
    }
}
