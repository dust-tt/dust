use crate::inodes::Inodes;
use dfs_client::BlockingClient;
use dfs_protocol::{
    MAX_IO,
    error::code,
    rpc::{
        CreateRequest, ErrorCode, Expected, ListRequest, LookupRequest, Mutation, Object,
        ObjectRequest, ReadRequest, RemoveRequest, RenameRequest, Timestamp, UpdateRequest,
        WriteRequest, XattrChange,
    },
};
use fuser::*;
use parking_lot::Mutex;
use std::{
    collections::{BTreeSet, HashMap},
    ffi::OsStr,
    path::Path,
    sync::{
        Arc, Weak,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

type Result<T> = std::result::Result<T, Errno>;
type Version = Arc<Mutex<Option<u64>>>;
const TTL: Duration = Duration::ZERO;
const CHUNK: u32 = MAX_IO as u32;
const PAGE: u32 = 64;
const MAX_HANDLES: usize = 256;
struct File {
    ino: u64,
    read: bool,
    write: bool,
    append: bool,
    closed: bool,
    failed: Option<Errno>,
    _version: Version,
}
#[derive(Default)]
struct Directory {
    ino: u64,
    offset: u64,
    after: Option<String>,
    skip: usize,
    end: bool,
}

/// @cc [owner:spolu,label:concurrency;security] local-version-state
/// All aliases and handles for one object MUST serialize mutations and share its expected version.
/// Reads MUST fetch current server state without silently advancing an open writer's expected version.
/// Failed mutations MUST clear local versions for later refresh, never retry the failed mutation.
pub struct Filesystem {
    client: BlockingClient,
    inodes: Mutex<Inodes>,
    files: Mutex<HashMap<u64, Arc<Mutex<File>>>>,
    directories: Mutex<HashMap<u64, Arc<Mutex<Directory>>>>,
    versions: Mutex<HashMap<String, Weak<Mutex<Option<u64>>>>>,
    namespace: Mutex<()>,
    next_handle: AtomicU64,
    uid: u32,
    gid: u32,
    read_only: bool,
}
impl Filesystem {
    pub fn new(client: BlockingClient, read_only: bool) -> anyhow::Result<Self> {
        client.stat(ObjectRequest {
            object_id: "root".into(),
        })?;
        Ok(Self {
            client,
            inodes: Mutex::new(Inodes::default()),
            files: Default::default(),
            directories: Default::default(),
            versions: Default::default(),
            namespace: Mutex::new(()),
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
    fn stat(&self, ino: INodeNo) -> Result<Object> {
        self.stat_id(&self.object(ino)?)
    }
    fn stat_id(&self, id: &str) -> Result<Object> {
        self.client
            .stat(ObjectRequest {
                object_id: id.into(),
            })
            .map_err(errno)
    }
    fn lookup_id(&self, parent: &str, name: &str) -> Result<Object> {
        self.client
            .lookup(LookupRequest {
                parent_id: parent.into(),
                name: name.into(),
            })
            .map_err(errno)
    }
    fn entry(&self, parent: INodeNo, object: Object) -> Result<FileAttr> {
        let mut attr = self.attr(INodeNo(0), &object)?;
        let ino = self
            .inodes
            .lock()
            .lookup(parent.0, &object.id)
            .ok_or(Errno::ENOSPC)?;
        attr.ino = INodeNo(ino);
        Ok(attr)
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
    fn version(&self, id: &str) -> Version {
        let mut versions = self.versions.lock();
        if versions.len() >= 1024 {
            versions.retain(|_, state| state.strong_count() > 0);
        }
        if let Some(state) = versions.get(id).and_then(Weak::upgrade) {
            return state;
        }
        let state = Arc::new(Mutex::new(None));
        versions.insert(id.into(), Arc::downgrade(&state));
        state
    }
    fn mutate(
        &self,
        ids: Vec<String>,
        operation: impl FnOnce(Vec<Expected>) -> Result<Mutation>,
    ) -> Result<Mutation> {
        let ids: BTreeSet<_> = ids.into_iter().collect();
        let states: Vec<_> = ids.iter().map(|id| self.version(id)).collect();
        // Stable ordering prevents deadlocks between rename and file/attribute mutations.
        let mut guards: Vec<_> = states.iter().map(|state| state.lock()).collect();
        let mut expected = Vec::new();
        for (id, version) in ids.iter().zip(guards.iter_mut()) {
            let current = match **version {
                Some(value) => value,
                None => self.stat_id(id)?.version,
            };
            **version = Some(current);
            expected.push(Expected {
                id: id.clone(),
                version: current,
            });
        }
        let result = operation(expected);
        for (id, version) in ids.iter().zip(guards.iter_mut()) {
            **version = match &result {
                Ok(response) => response
                    .object
                    .iter()
                    .chain(&response.related)
                    .find(|o| o.id == *id)
                    .map(|o| o.version),
                Err(_) => None,
            };
        }
        result
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
        if flags & libc::O_ACCMODE == libc::O_ACCMODE || flags & libc::O_PATH != 0 {
            return Err(Errno::EOPNOTSUPP);
        }
        if write || flags & libc::O_TRUNC != 0 {
            self.parent(ino)?;
        }
        let object = self.stat(ino)?;
        if object.directory {
            return Err(Errno::EISDIR);
        }
        let version = self.version(&object.id);
        version.lock().get_or_insert(object.version);
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
                    append: flags & libc::O_APPEND != 0,
                    closed: false,
                    failed: None,
                    _version: version,
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
                .map_err(errno)
        })?;
        response.object.ok_or(Errno::EIO)
    }
    fn sync_file(&self, ino: INodeNo, fh: FileHandle) -> Result<()> {
        let file = self.file(ino, fh)?;
        let mut file = file.lock();
        if file.closed {
            return Err(Errno::EBADF);
        }
        let version = file._version.clone();
        let _version = version.lock();
        self.client
            .fsync(ObjectRequest {
                object_id: self.object(ino)?,
            })
            .map_err(errno)?;
        if let Some(error) = file.failed.take() {
            return Err(error);
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
        let _namespace = self.namespace.lock();
        let parent_id = self.parent(parent)?;
        let response = self.mutate(vec![parent_id.clone()], |expected| {
            self.client
                .create(CreateRequest {
                    parent_id,
                    name: name_str(name)?.into(),
                    expected_parent_version: expected.first().ok_or(Errno::EIO)?.version,
                    directory,
                    mode: mode_bits(mode),
                    ..Default::default()
                })
                .map_err(errno)
        })?;
        response.object.ok_or(Errno::EIO)
    }
    fn remove(&self, parent: INodeNo, name: &OsStr, directory: bool) -> Result<()> {
        let _namespace = self.namespace.lock();
        let parent = self.parent(parent)?;
        let object = self.lookup_id(&parent, name_str(name)?)?;
        self.mutate(vec![parent, object.id.clone()], |expected| {
            self.client
                .remove(RemoveRequest {
                    object_id: object.id,
                    expected,
                    directory,
                })
                .map_err(errno)
        })?;
        Ok(())
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
                    | InitFlags::FUSE_POSIX_LOCKS
                    | InitFlags::FUSE_FLOCK_LOCKS,
            )
            .map_err(|_| std::io::Error::other("required kernel capabilities unavailable"))?;
        Ok(())
    }
    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
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
            Err(e) => reply.error(e),
        }
    }
    fn forget(&self, _req: &Request, ino: INodeNo, nlookup: u64) {
        self.inodes.lock().forget(ino.0, nlookup);
    }
    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        match self.stat(ino).and_then(|object| self.attr(ino, &object)) {
            Ok(attr) => reply.attr(&TTL, &attr),
            Err(e) => reply.error(e),
        }
    }
    fn opendir(&self, _req: &Request, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
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
        mut reply: ReplyDirectory,
    ) {
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
            self.stat(ino)?;
            if directory.offset != offset {
                *directory = Directory {
                    ino: ino.0,
                    ..Directory::default()
                };
            }
            let parent = self.inodes.lock().node(ino.0).ok_or(Errno::ESTALE)?.parent;
            for (cookie, id, name) in [(1, ino.0, "."), (2, parent, "..")] {
                if offset < cookie && reply.add(INodeNo(id), cookie, FileType::Directory, name) {
                    return Ok(());
                }
            }
            let target = offset.max(2);
            directory.offset = directory.offset.max(2);
            while !directory.end {
                // Re-fetch partially consumed pages on every callback: no stale grant decisions.
                // Seek/rewind replays from the start, keeping memory bounded independently of size.
                let page = self
                    .client
                    .list(ListRequest {
                        directory_id: self.object(ino)?,
                        after: directory.after.clone(),
                        limit: PAGE,
                    })
                    .map_err(errno)?;
                for entry in page.entries.iter().skip(directory.skip) {
                    let object = entry.object.as_ref().ok_or(Errno::EIO)?;
                    if directory.offset >= target {
                        let id = self.inodes.lock().existing(ino.0, &object.id).unwrap_or(0);
                        if reply.add(INodeNo(id), directory.offset + 1, kind(object), &entry.name) {
                            return Ok(());
                        }
                    }
                    directory.offset += 1;
                    directory.skip += 1;
                }
                if page.next_after == directory.after && page.next_after.is_some() {
                    return Err(Errno::EIO);
                }
                directory.after = page.next_after;
                directory.skip = 0;
                directory.end = directory.after.is_none();
            }
            Ok(())
        })();
        match result {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }
    fn releasedir(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        reply: ReplyEmpty,
    ) {
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
        // Completed namespace operations already satisfied the server's acknowledgement mode.
        empty_reply(self.stat(ino).map(|_| ()), reply);
    }
    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        match self.open_file(ino, flags.0) {
            Ok(fh) => reply.opened(fh, FopenFlags::FOPEN_DIRECT_IO),
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
                    object_id: self.object(ino)?,
                    offset,
                    length: size,
                    version: None,
                })
                .map(|response| response.data)
                .map_err(errno)
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
        let result = (|| {
            if bytes.len() > MAX_IO {
                return Err(Errno::EINVAL);
            }
            let id = self.parent(ino)?;
            let file = self.file(ino, fh)?;
            let mut file = file.lock();
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
                        append: file.append,
                    })
                    .map_err(errno)
            });
            if let Err(error) = result {
                file.failed = Some(error);
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
        empty_reply(self.sync_file(ino, fh), reply);
    }
    fn fsync(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        empty_reply(self.sync_file(ino, fh), reply);
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
        if mode & libc::S_IFMT != libc::S_IFREG {
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
        let result = self
            .create_file(parent, name, mode & !umask, true)
            .and_then(|object| self.entry(parent, object));
        match result {
            Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
            Err(error) => reply.error(error),
        }
    }
    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        empty_reply(self.remove(parent, name, false), reply);
    }
    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
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
        let result = (|| {
            let _namespace = self.namespace.lock();
            if flags.bits() & !libc::RENAME_NOREPLACE != 0 {
                return Err(Errno::EOPNOTSUPP);
            }
            let parent_id = self.parent(parent)?;
            let newparent_id = self.parent(newparent)?;
            let object = self.lookup_id(&parent_id, name_str(name)?)?;
            let mut ids = vec![parent_id, newparent_id.clone(), object.id.clone()];
            match self.lookup_id(&newparent_id, name_str(newname)?) {
                Ok(replacement) => ids.push(replacement.id),
                Err(Errno::ENOENT) => {}
                Err(error) => return Err(error),
            }
            self.mutate(ids, |expected| {
                self.client
                    .rename(RenameRequest {
                        object_id: object.id.clone(),
                        parent_id: newparent_id,
                        name: name_str(newname)?.into(),
                        replace: flags.is_empty(),
                        expected,
                    })
                    .map_err(errno)
            })?;
            let mut inodes = self.inodes.lock();
            if let Some(ino) = inodes.existing(parent.0, &object.id) {
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
            let file = fh.map(|fh| self.file(ino, fh)).transpose()?;
            let mut file = file.as_ref().map(|file| file.lock());
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
                Err(error) => {
                    if let Some(file) = &mut file {
                        file.failed = Some(error);
                    }
                    Err(error)
                }
            }
        })();
        match result {
            Ok(attr) => reply.attr(&TTL, &attr),
            Err(error) => reply.error(error),
        }
    }
    fn getxattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, size: u32, reply: ReplyXattr) {
        let result = (|| {
            let object = self.stat(ino)?;
            let name = name_str(name)?;
            if !name.starts_with("user.") {
                return Err(Errno::EOPNOTSUPP);
            }
            object.xattrs.get(name).cloned().ok_or(Errno::ENODATA)
        })();
        xattr_reply(result, size, reply);
    }
    fn listxattr(&self, _req: &Request, ino: INodeNo, size: u32, reply: ReplyXattr) {
        xattr_reply(
            self.stat(ino).map(|object| {
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
        empty_reply(
            name_str(name).and_then(|name| self.xattr(ino, name, None, libc::XATTR_REPLACE)),
            reply,
        );
    }
    fn access(&self, _req: &Request, ino: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
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
        reply.error(Errno::EOPNOTSUPP);
    }
    fn readlink(&self, _req: &Request, _ino: INodeNo, reply: ReplyData) {
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
                return Err(Errno::ENODATA);
            }
            self.client
                .update(UpdateRequest {
                    object_id: id,
                    expected_version: expected.first().ok_or(Errno::EIO)?.version,
                    xattrs: vec![XattrChange {
                        name: name.into(),
                        value,
                    }],
                    ..Default::default()
                })
                .map_err(errno)
        })?;
        Ok(())
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
