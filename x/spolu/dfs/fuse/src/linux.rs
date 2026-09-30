use std::{
    collections::{BTreeMap, HashMap},
    ffi::OsStr,
    io::Cursor,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::STANDARD};
use dfs_client::{Client, Error};
use dfs_protocol::{
    model::{RequestId, Timestamp},
    wire::*,
};
use fuser::*;
use parking_lot::Mutex;

use crate::inodes::Inodes;

type Result<T> = std::result::Result<T, Errno>;
const TTL: Duration = Duration::ZERO;
const CHUNK: u32 = 1024 * 1024;
const PAGE: usize = 64;
const MAX_HANDLES: usize = 256;

struct File {
    ino: u64,
    remote: String,
    sequence: u64,
    failed: Option<Errno>,
    closed: bool,
}

#[derive(Default)]
struct Directory {
    ino: u64,
    offset: u64,
    after: Option<String>,
    skip: usize,
    end: bool,
}

/// @cc [owner:spolu,label:security] conservative-fuse-caching
/// Return zero entry/attribute TTLs and direct-I/O file handles. Do not enable kernel writeback,
/// directory caching, or client authorization/content caches. Every operation that exposes data
/// MUST reach the server under the mount's original session; in-flight responses may finish.
pub struct Filesystem {
    client: Client,
    inodes: Mutex<Inodes>,
    files: Mutex<HashMap<u64, Arc<Mutex<File>>>>,
    directories: Mutex<HashMap<u64, Arc<Mutex<Directory>>>>,
    next_handle: AtomicU64,
    uid: u32,
    gid: u32,
    read_only: bool,
}

impl Filesystem {
    pub fn new(client: Client, read_only: bool) -> dfs_client::Result<Self> {
        client.session()?;
        client.stat("root")?;
        Ok(Self {
            client,
            inodes: Mutex::new(Inodes::default()),
            files: Mutex::new(HashMap::new()),
            directories: Mutex::new(HashMap::new()),
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
        if id == "root" || id == "shared" {
            return Err(Errno::EROFS);
        }
        Ok(id)
    }
    fn stat(&self, ino: INodeNo) -> Result<ObjectAttributes> {
        self.client.stat(&self.object(ino)?).map_err(errno)
    }
    fn entry(&self, parent: INodeNo, attributes: ObjectAttributes) -> Result<FileAttr> {
        let mut attr = self.attr(INodeNo(0), &attributes)?;
        let ino = self
            .inodes
            .lock()
            .lookup(parent.0, &attributes.object_id)
            .ok_or(Errno::ENOSPC)?;
        attr.ino = INodeNo(ino);
        Ok(attr)
    }
    fn attr(&self, ino: INodeNo, object: &ObjectAttributes) -> Result<FileAttr> {
        let size = match object.kind {
            KindAttributes::File { size_bytes, .. } => size_bytes,
            _ => 0,
        };
        Ok(FileAttr {
            ino,
            size,
            blocks: size.div_ceil(512),
            atime: system_time(object.posix.atime)?,
            mtime: system_time(object.posix.mtime)?,
            ctime: system_time(object.posix.ctime)?,
            crtime: UNIX_EPOCH,
            kind: kind(object),
            perm: object.posix.mode,
            nlink: if is_dir(object) { 2 } else { 1 },
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: 4096,
            flags: 0,
        })
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
        let truncate = flags & libc::O_TRUNC != 0;
        if write || truncate {
            self.writable()?;
        }
        if flags & libc::O_ACCMODE == libc::O_ACCMODE || flags & libc::O_PATH != 0 {
            return Err(Errno::EOPNOTSUPP);
        }
        // Reserve a local handle before opening remotely, without holding a registry lock over I/O.
        let number = self.handle_number()?;
        let file = Arc::new(Mutex::new(File {
            ino: ino.0,
            remote: String::new(),
            sequence: 0,
            failed: None,
            closed: false,
        }));
        {
            let mut files = self.files.lock();
            if files.len() >= MAX_HANDLES {
                return Err(Errno::EMFILE);
            }
            self.inodes.lock().pin(ino.0).ok_or(Errno::ESTALE)?;
            files.insert(number, file.clone());
        }
        let opened = self.client.open(&OpenFileRequest {
            object_id: self.object(ino)?,
            read,
            write,
            append: flags & libc::O_APPEND != 0,
            truncate,
            request_id: truncate.then(|| RequestId::generate().to_string()),
        });
        match opened {
            Ok(response) => {
                let mut file = file.lock();
                file.remote = response.handle_id;
                file.sequence = response.sequence;
                Ok(FileHandle(number))
            }
            Err(e) => {
                self.files.lock().remove(&number);
                self.inodes.lock().unpin(ino.0);
                Err(errno(e))
            }
        }
    }
    fn sync_file(&self, ino: INodeNo, fh: FileHandle) -> Result<()> {
        let file = self.file(ino, fh)?;
        let file = file.lock();
        if file.closed {
            return Err(Errno::EBADF);
        }
        if let Some(error) = file.failed {
            return Err(error);
        }
        self.client
            .fsync(&file.remote, file.sequence)
            .map_err(errno)
    }

    /// @cc [owner:spolu,label:backend] fuse-write-acknowledgement
    /// Writes and truncates MUST publish through the server before replying successfully. Serialize
    /// handle sequences; retry ambiguous content requests only with the identical ID, arguments and
    /// bytes. An unresolved failure MUST remain sticky through flush/fsync until the handle closes.
    fn edit(
        &self,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        bytes: Option<&[u8]>,
        size: u64,
    ) -> Result<()> {
        self.writable()?;
        let file = self.file(ino, fh)?;
        let mut file = file.lock();
        if file.closed {
            return Err(Errno::EBADF);
        }
        if let Some(error) = file.failed {
            return Err(error);
        }
        let sequence = file.sequence.checked_add(1).ok_or(Errno::EOVERFLOW)?;
        let id = RequestId::generate().to_string();
        let attempt = || match bytes {
            Some(bytes) => self.client.write(
                &file.remote,
                &id,
                sequence,
                offset,
                bytes.len() as u64,
                Cursor::new(bytes.to_vec()),
            ),
            None => self.client.truncate(&TruncateFileRequest {
                handle_id: file.remote.clone(),
                request_id: id.clone(),
                sequence,
                size_bytes: size,
            }),
        };
        let mut result = attempt();
        if result.as_ref().is_err_and(|e| e.ambiguous()) {
            result = attempt();
        }
        match result {
            Ok(_) => {
                file.sequence = sequence;
                Ok(())
            }
            Err(e) => {
                let e = errno(e);
                file.failed = Some(e);
                Err(e)
            }
        }
    }
    fn create_file(&self, parent: INodeNo, name: &OsStr, mode: u32) -> Result<ObjectAttributes> {
        let parent_id = self.parent(parent)?;
        let upload = self
            .client
            .start_upload(&StartUploadRequest::Create {
                parent_id,
                name: name_str(name)?.into(),
            })
            .map_err(errno)?;
        self.client
            .upload(&upload.upload_id, Cursor::new(Vec::<u8>::new()), Some(0))
            .map_err(errno)?;
        let request = CommitUploadRequest {
            upload_id: upload.upload_id,
            mime_type: None,
            xattrs: BTreeMap::new(),
            mode: Some(mode_bits(mode)?),
        };
        let mut committed = self.client.commit_upload(&request);
        if committed.as_ref().is_err_and(|e| e.ambiguous()) {
            committed = self.client.commit_upload(&request);
        }
        let receipt = committed.map_err(errno)?;
        self.client.stat(&receipt.object_id).map_err(errno)
    }
    fn remove(&self, parent: INodeNo, name: &OsStr, directory: bool) -> Result<()> {
        let parent = self.parent(parent)?;
        let object = self
            .client
            .lookup(&parent, name_str(name)?)
            .map_err(errno)?;
        self.client
            .remove(
                &RemoveRequest {
                    object_id: object.object_id,
                    expected_metadata_revision: object.metadata_revision,
                },
                directory,
            )
            .map_err(errno)
    }
    fn metadata_update(&self, object: &ObjectAttributes) -> UpdateMetadataRequest {
        UpdateMetadataRequest {
            object_id: object.object_id.clone(),
            expected_metadata_revision: object.metadata_revision,
            mime_type: None,
            xattrs: BTreeMap::new(),
            mode: None,
            atime: None,
            mtime: None,
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
                    | InitFlags::FUSE_POSIX_LOCKS
                    | InitFlags::FUSE_FLOCK_LOCKS,
            )
            .map_err(|_| std::io::Error::other("required kernel capabilities unavailable"))?;
        Ok(())
    }
    fn destroy(&mut self) {
        for (_, file) in self.files.get_mut().drain() {
            let file = file.lock();
            if let Err(error) = self.client.close(&file.remote) {
                eprintln!("dfs-fuse: handle cleanup: {error}");
            }
        }
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
            let object = self
                .client
                .lookup(&self.object(parent)?, name)
                .map_err(errno)?;
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
            if !is_dir(&self.stat(ino)?) {
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
                    .list(&self.object(ino)?, directory.after.clone(), PAGE)
                    .map_err(errno)?;
                for entry in page.entries.iter().skip(directory.skip) {
                    if directory.offset >= target {
                        let id = self
                            .inodes
                            .lock()
                            .existing(ino.0, &entry.attributes.object_id)
                            .unwrap_or(0);
                        if reply.add(
                            INodeNo(id),
                            directory.offset + 1,
                            kind(&entry.attributes),
                            &entry.name,
                        ) {
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
        // Every completed namespace operation already waited for durable publication.
        empty_reply(self.stat(ino).map(|_| ()), reply);
    }
    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        match self.open_file(ino, flags.0) {
            Ok(fh) => reply.opened(fh, FopenFlags::FOPEN_DIRECT_IO),
            Err(e) => reply.error(e),
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
            if file.closed {
                return Err(Errno::EBADF);
            }
            let mut bytes = Vec::with_capacity(size as usize);
            self.client
                .read(
                    &ReadFileRequest {
                        handle_id: file.remote.clone(),
                        content_version: None,
                        offset,
                        length: u64::from(size),
                    },
                    &mut bytes,
                )
                .map_err(errno)?;
            Ok(bytes)
        })();
        match result {
            Ok(bytes) => reply.data(&bytes),
            Err(e) => reply.error(e),
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
        if bytes.len() > CHUNK as usize {
            reply.error(Errno::EINVAL);
            return;
        }
        match self.edit(ino, fh, offset, Some(bytes), 0) {
            Ok(()) => reply.written(bytes.len() as u32),
            Err(e) => reply.error(e),
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
        let removed = self.files.lock().remove(&fh.0);
        let result = if let Some(file) = removed {
            let mut file = file.lock();
            file.closed = true;
            let result = self.client.close(&file.remote).map_err(errno);
            self.inodes.lock().unpin(file.ino);
            if file.ino != ino.0 {
                Err(Errno::EBADF)
            } else {
                result
            }
        } else {
            Err(Errno::EBADF)
        };
        if let Err(e) = result {
            eprintln!("dfs-fuse: release failed ({e:?}); close errors are reported by flush");
        }
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
            let object = self.create_file(parent, name, mode & !umask)?;
            let attr = self.entry(parent, object)?;
            match self.open_file(attr.ino, flags & !libc::O_TRUNC) {
                Ok(fh) => Ok((attr, fh)),
                Err(e) => {
                    self.inodes.lock().forget(attr.ino.0, 1);
                    Err(e)
                }
            }
        })();
        match result {
            Ok((attr, fh)) => {
                reply.created(&TTL, &attr, Generation(0), fh, FopenFlags::FOPEN_DIRECT_IO)
            }
            Err(e) => reply.error(e),
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
            .create_file(parent, name, mode & !umask)
            .and_then(|o| self.entry(parent, o));
        match result {
            Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
            Err(e) => reply.error(e),
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
        let result = (|| {
            let object = self
                .client
                .mkdir(&MkdirRequest {
                    parent_id: self.parent(parent)?,
                    name: name_str(name)?.into(),
                    mime_type: None,
                    xattrs: BTreeMap::new(),
                    mode: Some(mode_bits(mode & !umask)?),
                })
                .map_err(errno)?;
            self.entry(parent, object)
        })();
        match result {
            Ok(attr) => reply.entry(&TTL, &attr, Generation(0)),
            Err(e) => reply.error(e),
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
            if flags.bits() & !libc::RENAME_NOREPLACE != 0 {
                return Err(Errno::EOPNOTSUPP);
            }
            let source = self
                .client
                .lookup(&self.parent(parent)?, name_str(name)?)
                .map_err(errno)?;
            self.client
                .rename(&RenameRequest {
                    object_id: source.object_id.clone(),
                    expected_metadata_revision: source.metadata_revision,
                    parent_id: self.parent(newparent)?,
                    name: name_str(newname)?.into(),
                    replace: flags.is_empty(),
                })
                .map_err(errno)?;
            let mut inodes = self.inodes.lock();
            if let Some(ino) = inodes.existing(parent.0, &source.object_id) {
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
            self.writable()?;
            if uid.is_some_and(|v| v != self.uid)
                || gid.is_some_and(|v| v != self.gid)
                || crtime.is_some()
                || chgtime.is_some()
                || bkuptime.is_some()
                || flags.is_some()
            {
                return Err(Errno::EOPNOTSUPP);
            }
            if let Some(mode) = mode {
                mode_bits(mode)?;
            }
            if let Some(size) = size {
                let handle = match fh {
                    Some(fh) => fh,
                    None => self.open_file(ino, libc::O_WRONLY)?,
                };
                let result = self.edit(ino, handle, 0, None, size);
                if fh.is_none() {
                    if let Some(file) = self.files.lock().remove(&handle.0) {
                        let file = file.lock();
                        let close = self.client.close(&file.remote).map_err(errno);
                        self.inodes.lock().unpin(ino.0);
                        result?;
                        close?;
                    }
                } else {
                    result?;
                }
            }
            let mut object = self.stat(ino)?;
            if mode.is_some() || atime.is_some() || mtime.is_some() {
                let mut request = self.metadata_update(&object);
                request.mode = mode.map(mode_bits).transpose()?;
                request.atime = atime.map(timestamp).transpose()?;
                request.mtime = mtime.map(timestamp).transpose()?;
                object = self.client.update(&request).map_err(errno)?;
            }
            self.attr(ino, &object)
        })();
        match result {
            Ok(attr) => reply.attr(&TTL, &attr),
            Err(e) => reply.error(e),
        }
    }
    fn getxattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, size: u32, reply: ReplyXattr) {
        let result = (|| {
            let object = self.stat(ino)?;
            let name = name_str(name)?;
            if !name.starts_with("user.") {
                return Err(Errno::EOPNOTSUPP);
            }
            let value = object.xattrs.get(name).ok_or(Errno::ENODATA)?;
            STANDARD.decode(value).map_err(|_| Errno::EIO)
        })();
        xattr_reply(result, size, reply);
    }
    fn listxattr(&self, _req: &Request, ino: INodeNo, size: u32, reply: ReplyXattr) {
        xattr_reply(
            self.stat(ino).map(|o| {
                o.xattrs
                    .keys()
                    .filter(|k| k.starts_with("user."))
                    .flat_map(|k| k.bytes().chain([0]))
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
            self.writable()?;
            if position != 0 || ![0, libc::XATTR_CREATE, libc::XATTR_REPLACE].contains(&flags) {
                return Err(Errno::EINVAL);
            }
            let name = name_str(name)?;
            if !name.starts_with("user.") {
                return Err(Errno::EOPNOTSUPP);
            }
            if value.len() > 32 * 1024 {
                return Err(Errno::E2BIG);
            }
            let object = self.stat(ino)?;
            if flags == libc::XATTR_CREATE && object.xattrs.contains_key(name) {
                return Err(Errno::EEXIST);
            }
            if flags == libc::XATTR_REPLACE && !object.xattrs.contains_key(name) {
                return Err(Errno::ENODATA);
            }
            let mut request = self.metadata_update(&object);
            request
                .xattrs
                .insert(name.into(), Some(STANDARD.encode(value)));
            self.client.update(&request).map_err(errno)?;
            Ok(())
        })();
        empty_reply(result, reply);
    }
    fn removexattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let result = (|| {
            self.writable()?;
            let name = name_str(name)?;
            if !name.starts_with("user.") {
                return Err(Errno::EOPNOTSUPP);
            }
            let object = self.stat(ino)?;
            if !object.xattrs.contains_key(name) {
                return Err(Errno::ENODATA);
            }
            let mut request = self.metadata_update(&object);
            request.xattrs.insert(name.into(), None);
            self.client.update(&request).map_err(errno)?;
            Ok(())
        })();
        empty_reply(result, reply);
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

fn errno(error: Error) -> Errno {
    match error {
        Error::InvalidInput | Error::Configuration => Errno::EINVAL,
        Error::NameTooLong => Errno::ENAMETOOLONG,
        Error::NotDirectory => Errno::ENOTDIR,
        Error::IsDirectory => Errno::EISDIR,
        Error::Unauthenticated | Error::Forbidden => Errno::EACCES,
        Error::NotFound => Errno::ENOENT,
        Error::Conflict => Errno::EAGAIN,
        Error::AlreadyExists => Errno::EEXIST,
        Error::NotEmpty => Errno::ENOTEMPTY,
        Error::Capacity => Errno::ENOSPC,
        Error::Unsupported => Errno::EOPNOTSUPP,
        Error::Transport | Error::Unavailable => Errno::EHOSTUNREACH,
        Error::Protocol | Error::Internal => Errno::EIO,
    }
}
fn name_str(name: &OsStr) -> Result<&str> {
    name.to_str().ok_or(Errno::EILSEQ)
}
fn mode_bits(mode: u32) -> Result<u16> {
    if mode & 0o7000 != 0 {
        return Err(Errno::EOPNOTSUPP);
    }
    Ok((mode & 0o777) as u16)
}
fn is_dir(object: &ObjectAttributes) -> bool {
    matches!(object.kind, KindAttributes::Directory)
}
fn kind(object: &ObjectAttributes) -> FileType {
    if is_dir(object) {
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
    base.and_then(|t| t.checked_add(Duration::from_nanos(u64::from(time.nanoseconds))))
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
            nanoseconds: d.subsec_nanos(),
        }),
        Err(e) => {
            let d = e.duration();
            let seconds = i64::try_from(d.as_secs()).map_err(|_| Errno::EOVERFLOW)?;
            Ok(if d.subsec_nanos() == 0 {
                Timestamp {
                    seconds: -seconds,
                    nanoseconds: 0,
                }
            } else {
                Timestamp {
                    seconds: seconds
                        .checked_neg()
                        .and_then(|s| s.checked_sub(1))
                        .ok_or(Errno::EOVERFLOW)?,
                    nanoseconds: 1_000_000_000 - d.subsec_nanos(),
                }
            })
        }
    }
}
