use super::{
    freshness::Freshness,
    mount_cache::{BufferCounters, DirectorySnapshot, Limits, MountCache},
    mount_files::FileHandle,
};
use crate::{client::Client, model::*};
use fuser::{
    FileAttr, FileType, Filesystem, KernelConfig, ReplyAttr, ReplyCreate, ReplyData,
    ReplyDirectory, ReplyDirectoryPlus, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyWrite, Request,
    TimeOrNow,
};
use std::{
    collections::HashMap,
    ffi::OsStr,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
pub struct Counters {
    pub buffered: Arc<BufferCounters>,
    pub lookup: AtomicU64,
    pub getattr: AtomicU64,
    pub readdir: AtomicU64,
    pub readdirplus: AtomicU64,
    pub cached_read: AtomicU64,
    pub negative: AtomicU64,
    pub expired_directory: AtomicU64,
    pub read: AtomicU64,
    pub write: AtomicU64,
    pub open: AtomicU64,
    pub release: AtomicU64,
    pub flush: AtomicU64,
}

impl Counters {
    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({
            "buffered": self.buffered.snapshot(),
            "lookup": self.lookup.load(Ordering::Relaxed),
            "getattr": self.getattr.load(Ordering::Relaxed),
            "readdir": self.readdir.load(Ordering::Relaxed),
            "readdirplus": self.readdirplus.load(Ordering::Relaxed),
            "cached_read": self.cached_read.load(Ordering::Relaxed),
            "negative": self.negative.load(Ordering::Relaxed),
            "expired_directory": self.expired_directory.load(Ordering::Relaxed),
            "read": self.read.load(Ordering::Relaxed),
            "write": self.write.load(Ordering::Relaxed),
            "open": self.open.load(Ordering::Relaxed),
            "release": self.release.load(Ordering::Relaxed),
            "flush": self.flush.load(Ordering::Relaxed),
        })
    }
}

struct Record {
    id: Id,
    lookups: u64,
    references: u64,
    node: Option<Node>,
    verbs: Option<u16>,
}

struct Inodes {
    by_id: HashMap<Id, u64>,
    records: HashMap<u64, Record>,
    next: u64,
    capacity: usize,
}

impl Inodes {
    fn new(capacity: usize) -> Self {
        Self {
            by_id: HashMap::new(),
            records: HashMap::new(),
            next: 2,
            capacity,
        }
    }

    fn retain(&mut self, id: &str, lookup: bool) -> Result<u64> {
        let ino = if let Some(ino) = self.by_id.get(id) {
            *ino
        } else {
            if self.records.len() >= self.capacity {
                return Err(err(libc::ENFILE, "mount inode capacity"));
            }
            let ino = self.next;
            self.next = ino
                .checked_add(1)
                .ok_or_else(|| err(libc::EOVERFLOW, "mount inode identity"))?;
            self.by_id.insert(id.to_owned(), ino);
            self.records.insert(
                ino,
                Record {
                    id: id.to_owned(),
                    lookups: 0,
                    references: 0,
                    node: None,
                    verbs: None,
                },
            );
            ino
        };
        let record = self.records.get_mut(&ino).unwrap();
        let count = if lookup {
            &mut record.lookups
        } else {
            &mut record.references
        };
        *count = count
            .checked_add(1)
            .ok_or_else(|| err(libc::EOVERFLOW, "inode reference count"))?;
        Ok(ino)
    }

    fn release(&mut self, ino: u64, count: u64, lookup: bool) {
        let Some(record) = self.records.get_mut(&ino) else {
            return;
        };
        if lookup {
            record.lookups = record.lookups.saturating_sub(count);
        } else {
            record.references = record.references.saturating_sub(count);
        }
        if record.lookups == 0 && record.references == 0 {
            let record = self.records.remove(&ino).unwrap();
            if self.by_id.get(&record.id) == Some(&ino) {
                self.by_id.remove(&record.id);
            }
        }
    }

    fn id(&self, ino: u64) -> Result<Option<Id>> {
        if ino == 1 {
            return Ok(None);
        }
        self.records
            .get(&ino)
            .map(|record| Some(record.id.clone()))
            .ok_or_else(|| err(libc::ESTALE, "mount inode absent"))
    }

    fn retain_node(&mut self, node: &Node, verbs: Option<u16>, lookup: bool) -> Result<u64> {
        let ino = self.retain(&node.id, lookup)?;
        if node.kind == Kind::File {
            let record = self.records.get_mut(&ino).unwrap();
            record.node = Some(node.clone());
            record.verbs = verbs;
        }
        Ok(ino)
    }

    fn pin(&mut self, ino: u64) -> Result<()> {
        let record = self
            .records
            .get_mut(&ino)
            .ok_or_else(|| err(libc::ESTALE, "inode absent"))?;
        record.references = record
            .references
            .checked_add(1)
            .ok_or_else(|| err(libc::EOVERFLOW, "inode reference count"))?;
        Ok(())
    }
}

struct Directory {
    ino: u64,
    parent: u64,
    snapshot: Option<DirectorySnapshot>,
    children: Vec<u64>,
    bytes: usize,
}

struct OpenFile {
    ino: u64,
    file: FileHandle,
}

pub struct Mount {
    runtime: tokio::runtime::Handle,
    cache: Arc<MountCache>,
    reads: Arc<ReadTasks>,
    inodes: Inodes,
    directories: HashMap<u64, Directory>,
    files: HashMap<u64, OpenFile>,
    next_handle: u64,
    directory_bytes: usize,
    directory_capacity: usize,
    uid: u32,
    gid: u32,
    pub counters: Arc<Counters>,
}

#[derive(Default)]
struct ReadTasks {
    active: std::sync::Mutex<usize>,
    finished: std::sync::Condvar,
    capacity: usize,
}

struct ReadTask(Arc<ReadTasks>);

impl Drop for ReadTask {
    fn drop(&mut self) {
        let mut active = self.0.active.lock().unwrap();
        *active -= 1;
        self.0.finished.notify_all();
    }
}

pub struct Mounted(
    Option<fuser::BackgroundSession>,
    Arc<ReadTasks>,
    Option<std::sync::mpsc::Sender<()>>,
    Option<std::thread::JoinHandle<std::io::Result<()>>>,
);

impl Mounted {
    fn finish(&mut self) -> std::io::Result<()> {
        let guard = {
            let Some(session) = self.0.take() else {
                return Ok(());
            };
            session.guard
        };
        let result = guard
            .join()
            .unwrap_or_else(|_| Err(std::io::Error::other("FUSE request thread panicked")));
        let mut active = self.1.active.lock().unwrap();
        while *active != 0 {
            active = self.1.finished.wait(active).unwrap();
        }
        drop(active);
        self.2.take();
        let drained = self
            .3
            .take()
            .map(|worker| {
                worker
                    .join()
                    .unwrap_or_else(|_| Err(std::io::Error::other("write publisher panicked")))
            })
            .unwrap_or(Ok(()));
        result.and(drained)
    }

    pub fn shutdown(mut self) -> std::io::Result<()> {
        self.finish()
    }
}

impl Drop for Mounted {
    fn drop(&mut self) {
        if let Err(error) = self.finish() {
            tracing::error!(%error, "FUSE shutdown failed");
        }
    }
}

impl Mount {
    pub fn spawn(
        self,
        mountpoint: &Path,
        options: &[fuser::MountOption],
    ) -> std::io::Result<Mounted> {
        let reads = self.reads.clone();
        let cache = self.cache.clone();
        let runtime = self.runtime.clone();
        let session = fuser::spawn_mount2(self, mountpoint, options)?;
        let (stop, receiver) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            while matches!(
                receiver.recv_timeout(Duration::from_millis(25)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ) {
                if let Err(error) = runtime.block_on(cache.flush_buffer(false)) {
                    tracing::error!(%error, "buffer publication failed");
                }
            }
            runtime
                .block_on(cache.finish_buffer())
                .map_err(std::io::Error::other)
        });
        Ok(Mounted(Some(session), reads, Some(stop), Some(worker)))
    }
    pub fn new(client: Client, runtime: tokio::runtime::Handle, limits: Limits) -> Result<Self> {
        let cache = Arc::new(MountCache::new(client, limits)?);
        let buffered = cache.buffer_counters.clone();
        Ok(Self {
            runtime,
            cache,
            reads: Arc::new(ReadTasks {
                capacity: limits.concurrent_reads,
                ..ReadTasks::default()
            }),
            inodes: Inodes::new(limits.metadata_nodes.saturating_mul(2)),
            directories: HashMap::new(),
            files: HashMap::new(),
            next_handle: 1,
            directory_bytes: 0,
            directory_capacity: limits.directory_bytes,
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            counters: Arc::new(Counters {
                buffered,
                ..Counters::default()
            }),
        })
    }

    pub fn with_owner(mut self, uid: u32, gid: u32) -> Self {
        self.uid = uid;
        self.gid = gid;
        self
    }

    fn writable_parent(&self, ino: u64) -> Result<Id> {
        self.inodes
            .id(ino)?
            .ok_or_else(|| err(libc::EACCES, "synthetic directory"))
    }

    fn name(name: &OsStr) -> Result<String> {
        name.to_str()
            .map(str::to_owned)
            .ok_or_else(|| err(libc::EILSEQ, "UTF-8 filename required"))
    }

    fn open_file(&mut self, ino: u64, flags: i32) -> Result<u64> {
        self.counters.open.fetch_add(1, Ordering::Relaxed);
        if self.files.len() >= 4096 {
            return Err(err(libc::EMFILE, "mount file handle capacity"));
        }
        let node = self
            .inodes
            .id(ino)?
            .ok_or_else(|| err(libc::EISDIR, "synthetic directory"))?;
        let fh = self.next_handle;
        self.next_handle = fh
            .checked_add(1)
            .ok_or_else(|| err(libc::EOVERFLOW, "mount handle identity"))?;
        self.inodes.pin(ino)?;
        let result = self.runtime.block_on(async {
            let mut file = self.cache.open_file(&node, flags).await?;
            if flags & libc::O_TRUNC != 0
                && let Err(error) = self.cache.truncate_file(&mut file, 0).await
            {
                let _ = self.cache.close_file(file).await;
                return Err(error);
            }
            Ok(file)
        });
        match result {
            Ok(file) => {
                let record = self.inodes.records.get_mut(&ino).unwrap();
                record.node = Some(file.node().clone());
                self.files.insert(fh, OpenFile { ino, file });
                Ok(fh)
            }
            Err(error) => {
                self.inodes.release(ino, 1, false);
                Err(error)
            }
        }
    }

    fn create_node(
        &mut self,
        parent: u64,
        name: &OsStr,
        kind: Kind,
        mode: u32,
    ) -> Result<(Node, Freshness)> {
        if self.inodes.records.len() >= self.inodes.capacity {
            return Err(err(libc::ENFILE, "mount inode capacity"));
        }
        let mutation = Mutation::Create {
            parent: self.writable_parent(parent)?,
            name: Self::name(name)?,
            kind,
            mode,
        };
        let started = Instant::now();
        let node = self
            .runtime
            .block_on(self.cache.mutate(mutation))?
            .node
            .ok_or_else(|| err(libc::EIO, "create node absent"))?;
        let freshness = if kind == Kind::File {
            self.runtime
                .block_on(self.cache.object(&node.id))?
                .freshness
        } else {
            Freshness::from_validation_started_at(started)
        };
        Ok((node, freshness))
    }

    fn remove(&mut self, parent: u64, name: &OsStr, directory: bool) -> Result<()> {
        let parent = self.writable_parent(parent)?;
        let name = Self::name(name)?;
        let object = self
            .runtime
            .block_on(self.cache.lookup(Some(&parent), &name))?;
        self.runtime.block_on(self.cache.mutate(Mutation::Unlink {
            parent,
            name,
            expected: object.item.node.entry_token,
            directory,
        }))?;
        Ok(())
    }

    fn file_attr(&mut self, ino: u64, fh: u64) -> Result<(Node, Freshness)> {
        let opened = self
            .files
            .get_mut(&fh)
            .filter(|opened| opened.ino == ino)
            .ok_or_else(|| err(libc::EBADF, "file handle"))?;
        self.runtime
            .block_on(self.cache.file_metadata(&opened.file))
    }

    fn set_attributes(
        &mut self,
        ino: u64,
        fh: Option<u64>,
        size: Option<u64>,
        mode: Option<u32>,
        mtime_ms: Option<u64>,
    ) -> Result<(Node, Freshness)> {
        let fh = fh.or_else(|| {
            self.files
                .iter()
                .find(|(_, opened)| opened.ino == ino && opened.file.writable)
                .map(|(fh, _)| *fh)
        });
        if let Some(fh) = fh {
            let opened = self
                .files
                .get_mut(&fh)
                .filter(|opened| opened.ino == ino)
                .ok_or_else(|| err(libc::EBADF, "file handle"))?;
            if let Some(size) = size {
                self.runtime
                    .block_on(self.cache.truncate_file(&mut opened.file, size))?;
            }
            if mode.is_some() || mtime_ms.is_some() {
                self.runtime
                    .block_on(self.cache.setattr_file(&mut opened.file, mode, mtime_ms))?;
            }
            let result = self.file_attr(ino, fh)?;
            self.inodes.records.get_mut(&ino).unwrap().node = Some(result.0.clone());
            return Ok(result);
        }
        let id = self.writable_parent(ino)?;
        let object = self.runtime.block_on(self.cache.object(&id))?;
        let mut node = object.item.node;
        let mut freshness = object.freshness;
        if let Some(size) = size {
            let started = Instant::now();
            node = self
                .runtime
                .block_on(self.cache.mutate(Mutation::Truncate {
                    node: node.id.clone(),
                    base: node.version,
                    size,
                    handle: None,
                }))?
                .node
                .ok_or_else(|| err(libc::EIO, "truncate node absent"))?;
            freshness = Freshness::from_validation_started_at(started);
        }
        if mode.is_some() || mtime_ms.is_some() {
            let started = Instant::now();
            node = self
                .runtime
                .block_on(self.cache.mutate(Mutation::SetAttr {
                    node: node.id.clone(),
                    base: node.version,
                    mode,
                    mtime_ms,
                    handle: None,
                }))?
                .node
                .ok_or_else(|| err(libc::EIO, "setattr node absent"))?;
            freshness = Freshness::from_validation_started_at(started);
        }
        if node.kind == Kind::File {
            self.inodes.records.get_mut(&ino).unwrap().node = Some(node.clone());
        }
        Ok((node, freshness))
    }

    fn sync_file(&mut self, ino: u64, fh: u64, durable: bool) -> Result<()> {
        let opened = self
            .files
            .get_mut(&fh)
            .filter(|opened| opened.ino == ino)
            .ok_or_else(|| err(libc::EBADF, "file handle"))?;
        self.runtime.block_on(async {
            if durable {
                self.cache.sync_file(&mut opened.file).await
            } else {
                self.cache.flush_file(&mut opened.file).await
            }
        })
    }

    fn attr(&self, ino: u64, node: Option<&Node>) -> FileAttr {
        let kind = node.map_or(Kind::Directory, |node| node.kind);
        let size = node.map_or(0, |node| node.size);
        let mtime = UNIX_EPOCH + Duration::from_millis(node.map_or(0, |node| node.mtime_ms));
        FileAttr {
            ino,
            size,
            blocks: size.div_ceil(512),
            atime: mtime,
            mtime,
            ctime: mtime,
            crtime: mtime,
            kind: file_type(kind),
            perm: node.map_or(0o555, |node| node.mode as u16),
            nlink: if node.is_some_and(|node| node.unlinked) {
                0
            } else if kind == Kind::Directory {
                2
            } else {
                1
            },
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: CHUNK_BYTES as u32,
            flags: 0,
        }
    }

    fn release_directory(&mut self, directory: Directory) {
        self.inodes.release(directory.ino, 1, false);
        self.inodes.release(directory.parent, 1, false);
        for ino in directory.children {
            self.inodes.release(ino, 1, false);
        }
        self.directory_bytes -= directory.bytes;
    }

    fn directory_page(&mut self, ino: u64, fh: u64, offset: i64, attributes: bool) -> Result<()> {
        if offset < 0 {
            return Err(err(libc::EINVAL, "negative directory offset"));
        }
        let directory = self
            .directories
            .get(&fh)
            .filter(|directory| directory.ino == ino)
            .ok_or_else(|| err(libc::EBADF, "directory handle"))?;
        let parent = self.inodes.id(ino)?;
        if offset != 0
            && !attributes
            && directory
                .snapshot
                .as_ref()
                .is_some_and(|snapshot| !snapshot.freshness.requires_refresh_at(Instant::now()))
        {
            return Ok(());
        }
        let snapshot = self
            .runtime
            .block_on(self.cache.directory(parent.as_deref()))?;
        if offset != 0 {
            let previous = directory
                .snapshot
                .as_ref()
                .ok_or_else(|| err(libc::EINVAL, "directory continuation before first page"))?;
            if previous
                .object
                .as_ref()
                .and_then(|object| object.item.visible_parent.as_ref())
                != snapshot
                    .object
                    .as_ref()
                    .and_then(|object| object.item.visible_parent.as_ref())
                || previous.entries.len() != snapshot.entries.len()
                || previous
                    .entries
                    .iter()
                    .zip(&snapshot.entries)
                    .any(|(a, b)| {
                        a.item.node.id != b.item.node.id
                            || a.item.node.entry_token != b.item.node.entry_token
                            || a.item.node.kind != b.item.node.kind
                            || a.item.visible_name != b.item.visible_name
                    })
            {
                self.counters
                    .expired_directory
                    .fetch_add(1, Ordering::Relaxed);
                return Err(err(libc::ESTALE, "directory changed; rewind required"));
            }
        }
        let object_bytes = snapshot
            .object
            .as_ref()
            .map_or(0, |object| object.item.namespace_bytes());
        let bytes = snapshot
            .entries
            .iter()
            .try_fold(object_bytes, |bytes, item| {
                bytes
                    .checked_add(item.item.namespace_bytes() + 256)
                    .ok_or_else(|| err(libc::EOVERFLOW, "directory memory charge"))
            })?;
        if self
            .directory_bytes
            .checked_add(bytes)
            .is_none_or(|total| total > self.directory_capacity)
        {
            return Err(err(libc::ENFILE, "mount directory snapshot capacity"));
        }
        let mut children = Vec::with_capacity(snapshot.entries.len());
        for item in &snapshot.entries {
            match self
                .inodes
                .retain_node(&item.item.node, Some(item.item.verbs), false)
            {
                Ok(ino) => children.push(ino),
                Err(error) => {
                    for ino in children {
                        self.inodes.release(ino, 1, false);
                    }
                    return Err(error);
                }
            }
        }
        let parent = match snapshot
            .object
            .as_ref()
            .and_then(|object| object.item.visible_parent.as_ref())
            .map(|id| self.inodes.retain(id, false))
            .transpose()
        {
            Ok(parent) => parent.unwrap_or(1),
            Err(error) => {
                for ino in children {
                    self.inodes.release(ino, 1, false);
                }
                return Err(error);
            }
        };
        let directory = self.directories.get_mut(&fh).unwrap();
        self.inodes
            .release(std::mem::replace(&mut directory.parent, parent), 1, false);
        self.directory_bytes = self.directory_bytes - directory.bytes + bytes;
        for ino in std::mem::replace(&mut directory.children, children) {
            self.inodes.release(ino, 1, false);
        }
        directory.snapshot = Some(snapshot);
        directory.bytes = bytes;
        Ok(())
    }
}

fn file_type(kind: Kind) -> FileType {
    match kind {
        Kind::Directory => FileType::Directory,
        Kind::File => FileType::RegularFile,
    }
}

fn ttl(freshness: Freshness) -> Duration {
    freshness
        .remaining_at(Instant::now())
        .saturating_sub(Duration::from_millis(10))
}

impl Filesystem for Mount {
    fn init(
        &mut self,
        _req: &Request<'_>,
        config: &mut KernelConfig,
    ) -> std::result::Result<(), i32> {
        config
            .add_capabilities(
                fuser::consts::FUSE_AUTO_INVAL_DATA
                    | fuser::consts::FUSE_ATOMIC_O_TRUNC
                    | fuser::consts::FUSE_DO_READDIRPLUS
                    | fuser::consts::FUSE_READDIRPLUS_AUTO,
            )
            .map_err(|_| libc::EOPNOTSUPP)?;
        config
            .set_max_write(MAX_IO_BYTES as u32)
            .map_err(|_| libc::EINVAL)?;
        Ok(())
    }

    fn lookup(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEntry) {
        self.counters.lookup.fetch_add(1, Ordering::Relaxed);
        let result = (|| {
            let parent = self.inodes.id(parent)?;
            let name = name
                .to_str()
                .ok_or_else(|| err(libc::EILSEQ, "UTF-8 filename required"))?;
            self.runtime
                .block_on(self.cache.lookup_entry(parent.as_deref(), name))
        })();
        match result {
            Ok((Some(object), freshness)) => {
                match self
                    .inodes
                    .retain_node(&object.item.node, Some(object.item.verbs), true)
                {
                    Ok(ino) => {
                        reply.entry(&ttl(freshness), &self.attr(ino, Some(&object.item.node)), 0)
                    }
                    Err(error) => reply.error(error.code),
                }
            }
            Ok((None, freshness)) => {
                self.counters.negative.fetch_add(1, Ordering::Relaxed);
                reply.entry(&ttl(freshness), &self.attr(0, None), 0);
            }
            Err(error) => reply.error(error.code),
        }
    }

    fn forget(&mut self, _req: &Request<'_>, ino: u64, nlookup: u64) {
        self.inodes.release(ino, nlookup, true);
    }

    fn getattr(&mut self, _req: &Request<'_>, ino: u64, fh: Option<u64>, reply: ReplyAttr) {
        self.counters.getattr.fetch_add(1, Ordering::Relaxed);
        let file_handle = fh
            .filter(|fh| !self.directories.contains_key(fh))
            .or_else(|| {
                self.files
                    .iter()
                    .find(|(_, opened)| opened.ino == ino)
                    .map(|(fh, _)| *fh)
            });
        if let Some(fh) = file_handle {
            match self.file_attr(ino, fh) {
                Ok((node, freshness)) => reply.attr(&ttl(freshness), &self.attr(ino, Some(&node))),
                Err(error) => reply.error(error.code),
            }
            return;
        }
        let result = (|| match self.inodes.id(ino)? {
            Some(id) => match self.runtime.block_on(self.cache.object(&id)) {
                Ok(object) => Ok((self.attr(ino, Some(&object.item.node)), object.freshness)),
                Err(error) if error.code == libc::ENOENT => {
                    let fh = self
                        .files
                        .iter()
                        .find(|(_, opened)| opened.ino == ino)
                        .map(|(fh, _)| *fh)
                        .ok_or(error)?;
                    let (node, freshness) = self.file_attr(ino, fh)?;
                    Ok((self.attr(ino, Some(&node)), freshness))
                }
                Err(error) => Err(error),
            },
            None => Ok((
                self.attr(ino, None),
                self.runtime.block_on(self.cache.validation())?,
            )),
        })();
        match result {
            Ok((attr, freshness)) => reply.attr(&ttl(freshness), &attr),
            Err(Error { code, .. }) => reply.error(code),
        }
    }

    fn opendir(&mut self, _req: &Request<'_>, ino: u64, _flags: i32, reply: ReplyOpen) {
        let result = (|| {
            if self.directories.len() >= 4096 {
                return Err(err(libc::EMFILE, "mount directory handle capacity"));
            }
            let parent = self.inodes.id(ino)?;
            let visible_parent = if let Some(id) = &parent {
                let object = self.runtime.block_on(self.cache.object(id))?;
                if object.item.node.kind != Kind::Directory {
                    return Err(err(libc::ENOTDIR, "not a directory"));
                }
                if object.item.verbs & (LIST | TRAVERSE) != LIST | TRAVERSE {
                    return Err(err(libc::EACCES, "directory permission"));
                }
                object.item.visible_parent
            } else {
                self.runtime.block_on(self.cache.validation())?;
                None
            };
            let fh = self.next_handle;
            self.next_handle = fh
                .checked_add(1)
                .ok_or_else(|| err(libc::EOVERFLOW, "mount handle identity"))?;
            if let Some(id) = parent {
                self.inodes.retain(&id, false)?;
            }
            let parent = match visible_parent
                .map(|id| self.inodes.retain(&id, false))
                .transpose()
            {
                Ok(parent) => parent.unwrap_or(1),
                Err(error) => {
                    self.inodes.release(ino, 1, false);
                    return Err(error);
                }
            };
            self.directories.insert(
                fh,
                Directory {
                    ino,
                    parent,
                    snapshot: None,
                    children: Vec::new(),
                    bytes: 0,
                },
            );
            Ok(fh)
        })();
        match result {
            Ok(fh) => reply.opened(fh, 0),
            Err(error) => reply.error(error.code),
        }
    }

    fn readdir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        mut reply: ReplyDirectory,
    ) {
        self.counters.readdir.fetch_add(1, Ordering::Relaxed);
        if let Err(error) = self.directory_page(ino, fh, offset, false) {
            reply.error(error.code);
            return;
        }
        let directory = &self.directories[&fh];
        let entries = &directory.snapshot.as_ref().unwrap().entries;
        for index in offset as usize..entries.len() + 2 {
            let full = match index {
                0 => reply.add(ino, 1, FileType::Directory, "."),
                1 => reply.add(directory.parent, 2, FileType::Directory, ".."),
                _ => {
                    let item = &entries[index - 2].item;
                    reply.add(
                        directory.children[index - 2],
                        (index + 1) as i64,
                        file_type(item.node.kind),
                        &item.visible_name,
                    )
                }
            };
            if full {
                break;
            }
        }
        reply.ok();
    }

    fn readdirplus(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        mut reply: ReplyDirectoryPlus,
    ) {
        self.counters.readdirplus.fetch_add(1, Ordering::Relaxed);
        if let Err(error) = self.directory_page(ino, fh, offset, true) {
            reply.error(error.code);
            return;
        }
        let parent = self.directories[&fh].parent;
        let parent_object = if offset <= 1 && parent != 1 {
            let result = self
                .inodes
                .id(parent)
                .and_then(|id| self.runtime.block_on(self.cache.object(&id.unwrap())));
            match result {
                Ok(object) => Some(object),
                Err(error) => {
                    reply.error(error.code);
                    return;
                }
            }
        } else {
            None
        };
        let directory = &self.directories[&fh];
        let snapshot = directory.snapshot.as_ref().unwrap();
        let mut credited = Vec::new();
        let mut encoded_lifetime = Duration::ZERO;
        for index in offset as usize..snapshot.entries.len() + 2 {
            let (child, name, node) = match index {
                0 => (
                    ino,
                    ".",
                    snapshot.object.as_ref().map(|object| &object.item.node),
                ),
                1 => (
                    directory.parent,
                    "..",
                    parent_object.as_ref().map(|object| &object.item.node),
                ),
                _ => {
                    let item = &snapshot.entries[index - 2].item;
                    (
                        directory.children[index - 2],
                        item.visible_name.as_str(),
                        Some(&item.node),
                    )
                }
            };
            let lifetime = if index < 2 {
                Duration::ZERO
            } else {
                ttl(snapshot.freshness)
            };
            if reply.add(
                child,
                (index + 1) as i64,
                name,
                &lifetime,
                &self.attr(child, node),
                0,
            ) {
                break;
            }
            encoded_lifetime = encoded_lifetime.max(lifetime);
            if index >= 2 {
                let record = self.inodes.records.get_mut(&child).unwrap();
                let Some(lookups) = record.lookups.checked_add(1) else {
                    for credited in credited {
                        self.inodes.release(credited, 1, true);
                    }
                    reply.error(libc::EOVERFLOW);
                    return;
                };
                record.lookups = lookups;
                credited.push(child);
            }
        }
        let refreshed = (|| -> Result<Option<DirectorySnapshot>> {
            let refresh = if snapshot.freshness.remaining_at(Instant::now()) <= encoded_lifetime {
                let id = self.inodes.id(ino)?;
                Some(self.runtime.block_on(self.cache.revalidate_directory(
                    id.as_deref(),
                    snapshot,
                    encoded_lifetime,
                ))?)
            } else {
                None
            };
            if let Some(object) = &parent_object
                && object.freshness.requires_refresh_at(Instant::now())
            {
                let current = self
                    .runtime
                    .block_on(self.cache.object(&object.item.node.id))?;
                if current.item.node != object.item.node || current.item.verbs != object.item.verbs
                {
                    return Err(err(libc::ESTALE, "directory parent changed during reply"));
                }
            }
            Ok(refresh)
        })();
        match refreshed {
            Ok(Some(refreshed)) => {
                self.directories.get_mut(&fh).unwrap().snapshot = Some(refreshed)
            }
            Ok(None) => {}
            Err(error) => {
                for credited in credited {
                    self.inodes.release(credited, 1, true);
                }
                reply.error(error.code);
                return;
            }
        }
        reply.ok();
    }

    fn open(&mut self, _req: &Request<'_>, ino: u64, flags: i32, reply: ReplyOpen) {
        match self.open_file(ino, flags) {
            Ok(fh) => reply.opened(fh, fuser::consts::FOPEN_DIRECT_IO),
            Err(error) => reply.error(error.code),
        }
    }

    fn read(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _owner: Option<u64>,
        reply: ReplyData,
    ) {
        self.counters.read.fetch_add(1, Ordering::Relaxed);
        if offset < 0 {
            reply.error(libc::EINVAL);
            return;
        }
        let Some(opened) = self.files.get_mut(&fh).filter(|opened| opened.ino == ino) else {
            reply.error(libc::EBADF);
            return;
        };
        match self
            .cache
            .try_read_file(&mut opened.file, offset as u64, size)
        {
            Ok(Some(bytes)) => {
                self.counters.cached_read.fetch_add(1, Ordering::Relaxed);
                reply.data(&bytes);
                return;
            }
            Err(error) => {
                reply.error(error.code);
                return;
            }
            Ok(None) => {}
        }
        let mut active = self.reads.active.lock().unwrap();
        while *active >= self.reads.capacity {
            active = self.reads.finished.wait(active).unwrap();
        }
        *active += 1;
        drop(active);
        let task = ReadTask(self.reads.clone());
        let mut file = opened.file.clone();
        let cache = self.cache.clone();
        self.runtime.spawn(async move {
            let _task = task;
            for attempt in 0..3 {
                match cache.read_file(&mut file, offset as u64, size).await {
                    Err(error) if error.code == libc::ESTALE && attempt < 2 => continue,
                    Ok(read) => {
                        reply.data(&read.bytes);
                        return;
                    }
                    Err(error) => {
                        reply.error(error.code);
                        return;
                    }
                }
            }
            reply.error(libc::EAGAIN);
        });
    }

    fn write(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        data: &[u8],
        _write_flags: u32,
        _flags: i32,
        _owner: Option<u64>,
        reply: ReplyWrite,
    ) {
        self.counters.write.fetch_add(1, Ordering::Relaxed);
        if offset < 0 || data.len() > MAX_IO_BYTES {
            reply.error(libc::EINVAL);
            return;
        }
        let Some(opened) = self.files.get_mut(&fh).filter(|opened| opened.ino == ino) else {
            reply.error(libc::EBADF);
            return;
        };
        match self.runtime.block_on(self.cache.write_file(
            &mut opened.file,
            offset as u64,
            data.to_vec(),
        )) {
            Ok(outcome) if outcome.written as usize == data.len() => {
                self.inodes.records.get_mut(&ino).unwrap().node = Some(opened.file.node().clone());
                reply.written(outcome.written);
            }
            Ok(_) => reply.error(libc::EIO),
            Err(error) => reply.error(error.code),
        }
    }

    fn create(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        let result = (|| {
            if self.files.len() >= 4096 {
                return Err(err(libc::EMFILE, "mount file handle capacity"));
            }
            let (node, _) = self.create_node(parent, name, Kind::File, mode & !umask)?;
            let ino = self.inodes.retain_node(&node, None, true)?;
            match self.open_file(ino, flags) {
                Ok(fh) => match self.file_attr(ino, fh) {
                    Ok((node, freshness)) => Ok((ino, fh, node, freshness)),
                    Err(error) => {
                        let opened = self.files.remove(&fh).unwrap();
                        let _ = self.runtime.block_on(self.cache.close_file(opened.file));
                        self.inodes.release(ino, 1, false);
                        self.inodes.release(ino, 1, true);
                        Err(error)
                    }
                },
                Err(error) => {
                    self.inodes.release(ino, 1, true);
                    Err(error)
                }
            }
        })();
        match result {
            Ok((ino, fh, node, freshness)) => reply.created(
                &ttl(freshness),
                &self.attr(ino, Some(&node)),
                0,
                fh,
                fuser::consts::FOPEN_DIRECT_IO,
            ),
            Err(error) => reply.error(error.code),
        }
    }

    fn mkdir(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        mode: u32,
        umask: u32,
        reply: ReplyEntry,
    ) {
        let result = self
            .create_node(parent, name, Kind::Directory, mode & !umask)
            .and_then(|(node, freshness)| {
                Ok((self.inodes.retain_node(&node, None, true)?, node, freshness))
            });
        match result {
            Ok((ino, node, freshness)) => {
                reply.entry(&ttl(freshness), &self.attr(ino, Some(&node)), 0)
            }
            Err(error) => reply.error(error.code),
        }
    }

    fn unlink(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        match self.remove(parent, name, false) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn rmdir(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        match self.remove(parent, name, true) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn rename(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        newparent: u64,
        newname: &OsStr,
        flags: u32,
        reply: ReplyEmpty,
    ) {
        let result = (|| {
            if flags & !libc::RENAME_NOREPLACE != 0 {
                return Err(err(libc::EOPNOTSUPP, "rename flags"));
            }
            let parent = self.writable_parent(parent)?;
            let new_parent = self.writable_parent(newparent)?;
            let name = Self::name(name)?;
            let new_name = Self::name(newname)?;
            let source = self
                .runtime
                .block_on(self.cache.lookup(Some(&parent), &name))?;
            let destination = self
                .runtime
                .block_on(self.cache.lookup_entry(Some(&new_parent), &new_name))?
                .0;
            if flags & libc::RENAME_NOREPLACE != 0 && destination.is_some() {
                return Err(err(libc::EEXIST, "destination exists"));
            }
            self.runtime.block_on(self.cache.mutate(Mutation::Rename {
                parent,
                name,
                expected: source.item.node.entry_token,
                new_parent,
                new_name,
                destination: destination.map(|object| object.item.node.entry_token),
            }))?;
            Ok(())
        })();
        match result {
            Ok(()) => reply.ok(),
            Err(Error { code, .. }) => reply.error(code),
        }
    }

    fn setattr(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<u64>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        flags: Option<u32>,
        reply: ReplyAttr,
    ) {
        if uid.is_some_and(|uid| uid != self.uid)
            || gid.is_some_and(|gid| gid != self.gid)
            || flags.is_some()
            || (atime.is_some() && mtime.is_none())
        {
            reply.error(libc::EOPNOTSUPP);
            return;
        }
        let mtime_ms = mtime.map(|time| match time {
            TimeOrNow::Now => now_ms(),
            TimeOrNow::SpecificTime(time) => time
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .min(u64::MAX as u128) as u64,
        });
        match self.set_attributes(ino, fh, size, mode, mtime_ms) {
            Ok((node, freshness)) => reply.attr(&ttl(freshness), &self.attr(ino, Some(&node))),
            Err(error) => reply.error(error.code),
        }
    }

    fn flush(&mut self, _req: &Request<'_>, ino: u64, fh: u64, _owner: u64, reply: ReplyEmpty) {
        self.counters.flush.fetch_add(1, Ordering::Relaxed);
        match self.sync_file(ino, fh, false) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn fsync(&mut self, _req: &Request<'_>, ino: u64, fh: u64, _datasync: bool, reply: ReplyEmpty) {
        match self.sync_file(ino, fh, true) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn release(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        _flags: i32,
        _owner: Option<u64>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        self.counters.release.fetch_add(1, Ordering::Relaxed);
        if self.files.get(&fh).is_none_or(|opened| opened.ino != ino) {
            reply.error(libc::EBADF);
            return;
        }
        let opened = self.files.remove(&fh).unwrap();
        let result = self.runtime.block_on(self.cache.close_file(opened.file));
        self.inodes.release(ino, 1, false);
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn releasedir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        _flags: i32,
        reply: ReplyEmpty,
    ) {
        if self
            .directories
            .get(&fh)
            .is_none_or(|directory| directory.ino != ino)
        {
            reply.error(libc::EBADF);
            return;
        }
        let directory = self.directories.remove(&fh).unwrap();
        self.release_directory(directory);
        reply.ok();
    }

    fn fsyncdir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        let result = (|| {
            if self
                .directories
                .get(&fh)
                .is_none_or(|directory| directory.ino != ino)
            {
                return Err(err(libc::EBADF, "directory handle"));
            }
            let parent = self.inodes.id(ino)?;
            self.runtime
                .block_on(self.cache.directory(parent.as_deref()))?;
            self.runtime
                .block_on(self.cache.sync_namespace(parent.as_deref()))
        })();
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn access(&mut self, _req: &Request<'_>, ino: u64, mask: i32, reply: ReplyEmpty) {
        let result = (|| {
            if mask & !(libc::R_OK | libc::W_OK | libc::X_OK) != 0 {
                return Err(err(libc::EINVAL, "access mask"));
            }
            let Some(id) = self.inodes.id(ino)? else {
                self.runtime.block_on(self.cache.validation())?;
                return if mask & libc::W_OK == 0 {
                    Ok(())
                } else {
                    Err(err(libc::EACCES, "synthetic directory"))
                };
            };
            let item = self.runtime.block_on(self.cache.object(&id))?.item;
            let directory = item.node.kind == Kind::Directory;
            let readable = item.verbs & if directory { LIST } else { READ } != 0;
            let writable = item.verbs
                & if directory {
                    WRITE | CREATE | DELETE | RENAME
                } else {
                    WRITE
                }
                != 0;
            let executable = if directory {
                item.verbs & TRAVERSE != 0
            } else {
                item.verbs & READ != 0 && item.node.mode & 0o111 != 0
            };
            if (mask & libc::R_OK != 0 && !readable)
                || (mask & libc::W_OK != 0 && !writable)
                || (mask & libc::X_OK != 0 && !executable)
            {
                return Err(err(libc::EACCES, "access denied"));
            }
            Ok(())
        })();
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }

    fn statfs(&mut self, _req: &Request<'_>, _ino: u64, reply: fuser::ReplyStatfs) {
        reply.error(libc::EOPNOTSUPP);
    }
}
