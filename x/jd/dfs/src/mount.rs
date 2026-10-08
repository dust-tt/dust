#[path = "kernel_cache.rs"]
mod kernel_cache;
pub use kernel_cache::KernelCache;
#[path = "driver.rs"]
mod driver;
pub use driver::Driver;
#[path = "inodes.rs"]
pub mod inodes;
#[path = "writeback.rs"]
mod writeback;
use crate::{
    cache::Cache,
    client::Client,
    model::*,
    reader::{ReadLimits, ReadRequest, Reader},
};
use fuser::{
    FileAttr, FileType, KernelConfig, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory,
    ReplyDirectoryPlus, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyStatfs, ReplyWrite, TimeOrNow,
};
use inodes::{InodePin, Inodes, ReferenceKind};
use parking_lot::{Mutex, MutexGuard, RwLock};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::OsStr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const TTL: Duration = Duration::from_secs(3600);
const FOPEN_NOFLUSH: u32 = 1 << 5;
const WRITEBACK_REQUESTS: usize = 4;

#[derive(Default)]
pub struct MountCounters {
    lookup: AtomicU64,
    pending_mutations: AtomicU64,
    getattr: AtomicU64,
    readdir: AtomicU64,
    readdirplus: AtomicU64,
    open: AtomicU64,
    read: AtomicU64,
    write: AtomicU64,
    write_bytes: AtomicU64,
    retained_write_bytes: AtomicU64,
    peak_retained_write_bytes: AtomicU64,
    writeback_inodes: AtomicU64,
    writeback_failed_inodes: AtomicU64,
    writeback_read_retries: AtomicU64,
    writeback_batches: AtomicU64,
    writeback_published_batches: AtomicU64,
    directory_snapshot_bytes: AtomicU64,
}
impl MountCounters {
    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({
            "lookup": self.lookup.load(Ordering::Relaxed),
            "pending_mutations": self.pending_mutations.load(Ordering::Relaxed),
            "getattr": self.getattr.load(Ordering::Relaxed),
            "readdir": self.readdir.load(Ordering::Relaxed),
            "readdirplus": self.readdirplus.load(Ordering::Relaxed),
            "open": self.open.load(Ordering::Relaxed),
            "read": self.read.load(Ordering::Relaxed),
            "write": self.write.load(Ordering::Relaxed),
            "write_bytes": self.write_bytes.load(Ordering::Relaxed),
            "retained_write_bytes": self.retained_write_bytes.load(Ordering::Relaxed),
            "peak_retained_write_bytes": self.peak_retained_write_bytes.load(Ordering::Relaxed),
            "writeback_inodes": self.writeback_inodes.load(Ordering::Relaxed),
            "writeback_failed_inodes": self.writeback_failed_inodes.load(Ordering::Relaxed),
            "writeback_read_retries": self.writeback_read_retries.load(Ordering::Relaxed),
            "writeback_batches": self.writeback_batches.load(Ordering::Relaxed),
            "writeback_published_batches": self.writeback_published_batches.load(Ordering::Relaxed),
            "directory_snapshot_bytes": self.directory_snapshot_bytes.load(Ordering::Relaxed),
        })
    }
}

pub fn retire_writeback_versions(inodes: &Inodes, changed: &[ViewNode]) -> Vec<InodePin> {
    let mut previous = HashMap::<&str, &Node>::new();
    let mut retired = Vec::new();
    for item in changed {
        let node = &item.node;
        if let Some(old) = previous.insert(&node.id, node)
            && node.kind == Kind::File
            && (old.version != node.version
                || old.size != node.size
                || old.mtime_ms != node.mtime_ms)
            && let Some(pin) = inodes.retire(&node.id)
        {
            retired.push(pin);
        }
    }
    retired
}

pub fn invalidate_cached_nodes(
    notifier: &fuser::Notifier,
    inodes: &Inodes,
    changed: Vec<ViewNode>,
    removed: Vec<Id>,
    reset: bool,
    retired: Vec<InodePin>,
) -> std::io::Result<()> {
    let retired_ids: HashSet<_> = retired
        .iter()
        .filter_map(|pin| inodes.id(pin.ino()))
        .collect();
    let mut nodes = HashSet::new();
    let mut entries = HashSet::new();
    let mut projections = HashSet::new();
    let mut retained_entries = HashSet::new();
    if !reset {
        for item in &changed {
            let projection = (
                item.node.id.clone(),
                item.visible_parent.clone(),
                item.visible_name.clone(),
            );
            if !projections.insert(projection.clone()) && !retired_ids.contains(&item.node.id) {
                retained_entries.insert(projection);
            }
        }
    }
    let mut pins = retired;
    if reset {
        pins.extend(inodes.pin_all(ReferenceKind::Notification));
    }
    pins.extend(
        removed
            .iter()
            .filter_map(|id| inodes.pin_active(id, ReferenceKind::Notification)),
    );
    for item in changed {
        if let Some(pin) = inodes.pin_active(&item.node.id, ReferenceKind::Notification) {
            pins.push(pin);
        }
        let parent = match &item.visible_parent {
            Some(id) => inodes.pin_active(id, ReferenceKind::Notification),
            None => inodes.pin(2, ReferenceKind::Notification).ok(),
        };
        if let Some(parent) = parent {
            if !retained_entries.contains(&(
                item.node.id,
                item.visible_parent,
                item.visible_name.clone(),
            )) {
                entries.insert((parent.ino(), item.visible_name));
            }
            pins.push(parent);
        }
    }
    nodes.extend(pins.iter().map(InodePin::ino));
    for (parent, name) in entries {
        notifier.inval_entry(parent, OsStr::new(&name))?;
    }
    for ino in nodes {
        notifier.inval_inode(ino, 0, 0)?;
    }
    Ok(())
}
#[derive(Clone)]
struct OpenFile {
    _pin: InodePin,
    node: Node,
    remote: Option<Id>,
    base: Id,
    incarnation: Id,
    writable: bool,
    fenced: bool,
    buffered: bool,
    append: bool,
    error: Option<i32>,
    read_end: Option<u64>,
}
pub struct MountConfig {
    pub uid: u32,
    pub gid: u32,
    pub read_ahead_bytes: usize,
    pub direct_io: bool,
    pub kernel_prefetch: bool,
    pub experimental_kernel_writeback: bool,
    pub writeback_capacity: usize,
    pub read_limits: ReadLimits,
    pub directory_snapshot_bytes: usize,
    pub publication_only_sync: bool,
    pub publication_capacity: usize,
    pub inode_capacity: usize,
}

struct Directory {
    _pin: InodePin,
    entries: Vec<(InodePin, FileType, String)>,
}

pub struct InvalidationBarrier {
    pending: Arc<AtomicU64>,
}
impl InvalidationBarrier {
    pub fn new(pending: Arc<AtomicU64>) -> Self {
        pending.fetch_add(1, Ordering::SeqCst);
        Self { pending }
    }
    pub fn complete(self) {
        self.pending.fetch_sub(1, Ordering::SeqCst);
    }
}

pub struct Mount {
    pub gate: Arc<Mutex<()>>,
    pub transition: Arc<tokio::sync::Mutex<()>>,
    pub invalidating: Arc<AtomicU64>,
    pub notifier: Arc<RwLock<Option<fuser::Notifier>>>,
    pub notification_failure: Arc<tokio::sync::Notify>,
    pub cache: Arc<Mutex<Cache>>,
    pub client: Arc<RwLock<Client>>,
    pub runtime: tokio::runtime::Handle,
    pub inodes: Inodes,
    pub operations: Arc<MountCounters>,
    pub reader: Arc<Reader>,
    handles: HashMap<u64, OpenFile>,
    directories: HashMap<u64, Directory>,
    next_handle: u64,
    directory_bytes: usize,
    directory_budget: usize,
    uid: u32,
    gid: u32,
    direct_io: bool,
    kernel_prefetch: bool,
    experimental_kernel_writeback: bool,
    writeback_capacity: usize,
    writers: writeback::Writers,
    self_weak: std::sync::Weak<Mutex<Mount>>,
    publication_only_sync: bool,
    publication_capacity: usize,
    receipts: HashMap<Id, PublicationReceipt>,
    unresolved: HashMap<Id, PublicationId>,
    recovered_nodes: HashSet<Id>,
    recovery_notifications: HashMap<u64, tokio::sync::watch::Receiver<Option<i32>>>,
}
impl Mount {
    pub fn new(
        cache: Arc<Mutex<Cache>>,
        client: Arc<RwLock<Client>>,
        runtime: tokio::runtime::Handle,
        config: MountConfig,
    ) -> Result<Self> {
        if config.publication_capacity == 0 {
            return Err(err(libc::EINVAL, "positive publication capacity required"));
        }
        if config.experimental_kernel_writeback
            && (config.direct_io || config.writeback_capacity == 0)
        {
            return Err(err(
                libc::EINVAL,
                "writeback requires cached I/O and positive inode capacity",
            ));
        }
        let reader = Reader::with_limits(
            cache.clone(),
            client.clone(),
            config.read_ahead_bytes,
            config.read_limits,
        )?;
        let root = cache
            .lock()
            .namespace
            .nodes
            .values()
            .find(|n| n.visible_parent.is_none() && n.visible_name == "files")
            .map(|n| n.node.id.clone());
        let mount = Self {
            reader,
            gate: Arc::new(Mutex::new(())),
            transition: Arc::new(tokio::sync::Mutex::new(())),
            invalidating: Arc::new(AtomicU64::new(0)),
            notifier: Arc::new(RwLock::new(None)),
            notification_failure: Arc::new(tokio::sync::Notify::new()),
            cache,
            client,
            runtime,
            inodes: Inodes::new(config.inode_capacity, root)?,
            operations: Arc::new(MountCounters::default()),
            handles: HashMap::new(),
            directories: HashMap::new(),
            next_handle: 1,
            uid: config.uid,
            gid: config.gid,
            direct_io: config.direct_io,
            kernel_prefetch: config.kernel_prefetch,
            experimental_kernel_writeback: config.experimental_kernel_writeback,
            writeback_capacity: config.writeback_capacity,
            writers: writeback::Writers::default(),
            self_weak: std::sync::Weak::new(),
            directory_bytes: 0,
            directory_budget: config.directory_snapshot_bytes,
            publication_only_sync: config.publication_only_sync,
            publication_capacity: config.publication_capacity,
            receipts: HashMap::new(),
            unresolved: HashMap::new(),
            recovered_nodes: HashSet::new(),
            recovery_notifications: HashMap::new(),
        };
        Ok(mount)
    }
    fn inode(&self, id: &str) -> Result<InodePin> {
        self.inodes.allocate(id, ReferenceKind::Work)
    }
    fn node(&self, ino: u64) -> Result<Node> {
        let id = self
            .inodes
            .id(ino)
            .ok_or_else(|| err(libc::ENOENT, "inode absent"))?;
        if !self.inodes.is_active(ino, &id) {
            return Err(err(libc::ESTALE, "retired inode"));
        }
        self.cache
            .lock()
            .namespace
            .nodes
            .get(&id)
            .map(|n| n.node.clone())
            .ok_or_else(|| err(libc::ENOENT, "node absent from view"))
    }
    fn client(&self) -> Client {
        self.client.read().clone()
    }
    fn call(&self, call: Call) -> Result<Reply> {
        self.runtime.block_on(self.client().call(call))
    }
    fn mutation_targets(mutation: &Mutation) -> Vec<Id> {
        match mutation {
            Mutation::Create { parent, .. } | Mutation::Unlink { parent, .. } => {
                vec![parent.clone()]
            }
            Mutation::Write { node, .. }
            | Mutation::Truncate { node, .. }
            | Mutation::SetAttr { node, .. }
            | Mutation::Grant { node, .. } => vec![node.clone()],
            Mutation::Rename {
                parent, new_parent, ..
            } => vec![parent.clone(), new_parent.clone()],
            Mutation::PutFiles { files } => files
                .iter()
                .flat_map(|file| {
                    std::iter::once(file.node.id.clone()).chain(file.node.parent.clone())
                })
                .collect(),
            Mutation::Member { .. } => Vec::new(),
        }
    }
    fn record_publication(&mut self, mut targets: Vec<Id>, publication: Publication) -> Outcome {
        if self.publication_only_sync {
            return publication.outcome;
        }
        if let Some(node) = &publication.outcome.node {
            targets.push(node.id.clone());
        }
        for target in targets {
            self.receipts.insert(target, publication.receipt.clone());
        }
        publication.outcome
    }
    fn mutate(&mut self, mutation: Mutation) -> Result<Outcome> {
        let targets = Self::mutation_targets(&mutation);
        if targets
            .iter()
            .any(|target| self.unresolved.contains_key(target))
        {
            return Err(err(
                libc::ETIMEDOUT,
                "prior publication requires synchronization",
            ));
        }
        let new_targets = targets
            .iter()
            .filter(|target| !self.receipts.contains_key(*target))
            .count();
        if self.receipts.len() + self.unresolved.len() + new_targets + 1 > self.publication_capacity
            || self.unresolved.len() + targets.len() > 128
        {
            return Err(err(
                libc::EAGAIN,
                "publication tracking capacity; synchronize first",
            ));
        }
        let content = match &mutation {
            Mutation::Write { node, .. }
            | Mutation::Truncate { node, .. }
            | Mutation::SetAttr { node, .. } => Some(node.clone()),
            _ => None,
        };
        let client = self.client();
        let publication = client.prepare_publication(&mutation)?;
        if let Some(node) = &content {
            self.begin_writeback(node)?;
        }
        match self
            .runtime
            .block_on(client.publish(publication.clone(), mutation))
        {
            Ok(published) => {
                if content.is_some()
                    && let Some(node) = &published.outcome.node
                {
                    self.published_writeback(node);
                }
                Ok(self.record_publication(targets, published))
            }
            Err(error) => {
                if let Some(node) = &content {
                    self.fail_writeback(node, error.code);
                }
                if matches!(error.code, libc::ETIMEDOUT | libc::EIO) {
                    for target in targets {
                        self.unresolved.insert(target, publication.clone());
                    }
                }
                Err(error)
            }
        }
    }
    fn resolve_pending(&mut self, node: &str) -> Result<()> {
        let Some(pending) = self.unresolved.get(node).cloned() else {
            return Ok(());
        };
        let publication = self
            .runtime
            .block_on(self.client().resolve_publication(pending.clone()))?
            .ok_or_else(|| {
                err(
                    libc::ESTALE,
                    "publication outcome remains unknown; dependent writes stopped",
                )
            })?;
        if let Some(node) = &publication.outcome.node
            && self.unresolved.get(&node.id) == Some(&pending)
        {
            let remote = self
                .handles
                .values()
                .find(|handle| handle.node.id == node.id)
                .and_then(|handle| handle.remote.clone());
            let Reply::Node(current) = self.call(Call::Stat {
                node: node.id.clone(),
                handle: remote,
            })?
            else {
                return Err(err(libc::EIO, "invalid resolved node reply"));
            };
            self.cache.lock().namespace.update(current)?;
        }
        let targets: Vec<_> = self
            .unresolved
            .iter()
            .filter(|(_, candidate)| **candidate == pending)
            .map(|(id, _)| id.clone())
            .collect();
        for target in &targets {
            self.unresolved.remove(target);
            self.recovered_nodes.insert(target.clone());
        }
        if let Some(node) = &publication.outcome.node {
            for handle in self.handles.values_mut().filter(|handle| {
                handle.node.id == node.id
                    && matches!(handle.error, Some(libc::ETIMEDOUT | libc::EIO))
            }) {
                handle.error = None;
                handle.base = node.version.clone();
                handle.node = node.clone();
            }
        }
        self.record_publication(targets, publication);
        Ok(())
    }
    fn persist_node(&mut self, node: &str) -> Result<()> {
        self.resolve_pending(node)?;
        let Some(receipt) = self.receipts.get(node).cloned() else {
            return match self.call(Call::CheckSession)? {
                Reply::Unit => Ok(()),
                _ => Err(err(libc::EIO, "invalid session check reply")),
            };
        };
        self.runtime
            .block_on(self.client().persist_through(receipt.clone()))?;
        self.receipts.retain(|_, candidate| {
            candidate.publication.tenant != receipt.publication.tenant
                || candidate.publication.request.incarnation
                    != receipt.publication.request.incarnation
                || candidate.tenant_head > receipt.tenant_head
        });
        Ok(())
    }
    fn finish_sync(&mut self, ino: u64, result: Result<()>, reply: ReplyEmpty) {
        self.recovery_notifications
            .retain(|ino, _| self.inodes.id(*ino).is_some());
        let recovered = self
            .inodes
            .id(ino)
            .is_some_and(|id| self.recovered_nodes.remove(&id));
        if recovered {
            let invalidation = InvalidationBarrier::new(self.invalidating.clone());
            let pin = self.inodes.pin(ino, ReferenceKind::Notification);
            let previous = self.recovery_notifications.get(&ino).cloned();
            let (completed, receiver) = tokio::sync::watch::channel(None);
            self.recovery_notifications.insert(ino, receiver);
            let notifier = self.notifier.read().clone();
            let failure = self.notification_failure.clone();
            self.runtime.spawn(async move {
                if let Some(mut previous) = previous {
                    let _ = previous.wait_for(|code| code.is_some()).await;
                }
                let code = match tokio::task::spawn_blocking(move || {
                    let _pin =
                        pin.map_err(|error| std::io::Error::from_raw_os_error(error.code))?;
                    notifier
                        .ok_or_else(|| std::io::Error::other("kernel notifier unavailable"))
                        .and_then(|notifier| notifier.inval_inode(ino, 0, 0))
                })
                .await
                {
                    Ok(Ok(())) => {
                        invalidation.complete();
                        0
                    }
                    error => {
                        tracing::error!(?error, ino, "publication recovery invalidation failed");
                        failure.notify_one();
                        libc::EIO
                    }
                };
                let _ = completed.send(Some(code));
            });
        }
        if let Some(mut notification) = self.recovery_notifications.get(&ino).cloned() {
            let pin = self.inodes.pin(ino, ReferenceKind::Work);
            self.runtime.spawn(async move {
                let _pin = match pin {
                    Ok(pin) => pin,
                    Err(error) => {
                        reply.error(error.code);
                        return;
                    }
                };
                let code = notification
                    .wait_for(|code| code.is_some())
                    .await
                    .ok()
                    .and_then(|code| *code)
                    .unwrap_or(libc::EIO);
                if code != 0 {
                    reply.error(code);
                } else {
                    match result {
                        Ok(()) => reply.ok(),
                        Err(error) => reply.error(error.code),
                    }
                }
            });
        } else {
            match result {
                Ok(()) => reply.ok(),
                Err(error) => reply.error(error.code),
            }
        }
    }
    fn attr(&self, ino: u64, node: Option<&Node>) -> FileAttr {
        let kind = node.map(|n| n.kind).unwrap_or(Kind::Directory);
        let size = node.map(|n| n.size).unwrap_or(0);
        let mtime = UNIX_EPOCH + Duration::from_millis(node.map(|n| n.mtime_ms).unwrap_or(0));
        FileAttr {
            ino,
            size,
            blocks: size.div_ceil(512),
            atime: mtime,
            mtime,
            ctime: mtime,
            crtime: mtime,
            kind: if kind == Kind::Directory {
                FileType::Directory
            } else {
                FileType::RegularFile
            },
            perm: node.map(|n| n.mode as u16).unwrap_or(0o555),
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
    fn name(name: &OsStr) -> Result<String> {
        name.to_str()
            .map(str::to_owned)
            .ok_or_else(|| err(libc::EILSEQ, "UTF-8 filenames required by PoC"))
    }
    fn lookup_node(&self, parent: u64, name: &str) -> Result<Node> {
        let cache = self.cache.lock();
        let id = if parent == 2 {
            cache.namespace.entries.get(&(None, name.to_owned()))
        } else {
            let parent = self
                .inodes
                .id(parent)
                .ok_or_else(|| err(libc::ENOENT, "parent absent"))?;
            cache
                .namespace
                .entries
                .get(&(Some(parent.clone()), name.to_owned()))
        }
        .ok_or_else(|| err(libc::ENOENT, "entry absent"))?;
        cache
            .namespace
            .nodes
            .get(id)
            .map(|n| n.node.clone())
            .ok_or_else(|| err(libc::ENOENT, "node absent"))
    }
    fn writable_parent(&self, parent: u64) -> Result<Node> {
        if parent <= 2 {
            return Err(err(libc::EACCES, "synthetic parent"));
        }
        self.node(parent)
    }
    fn allocate_handle(
        &mut self,
        pin: InodePin,
        node: Node,
        remote: Option<Id>,
        flags: i32,
    ) -> u64 {
        let fh = self.next_handle;
        self.next_handle += 1;
        self.handles.insert(
            fh,
            OpenFile {
                _pin: pin,
                base: node.version.clone(),
                node,
                remote,
                incarnation: self.client.read().session.incarnation.clone(),
                writable: flags & libc::O_ACCMODE != libc::O_RDONLY,
                fenced: false,
                buffered: false,
                append: flags & libc::O_APPEND != 0,
                error: None,
                read_end: None,
            },
        );
        fh
    }
    fn open_file(&mut self, ino: u64, flags: i32, _guard: &MutexGuard<'_, ()>) -> Result<u64> {
        if self.handles.len() >= 100_000 {
            return Err(err(libc::EMFILE, "mount handle capacity"));
        }
        let node = self.node(ino)?;
        self.writer_error(&node.id)?;
        let pin = self.inodes.pin(ino, ReferenceKind::Open)?;
        if node.kind == Kind::Directory {
            return Err(err(libc::EISDIR, "directory open"));
        }
        let write = flags & libc::O_ACCMODE != libc::O_RDONLY;
        let required = if write { WRITE } else { READ };
        if self
            .cache
            .lock()
            .namespace
            .nodes
            .get(&node.id)
            .is_none_or(|n| n.verbs & required == 0)
        {
            return Err(err(libc::EACCES, "cached permission denied"));
        }
        if write {
            let fenced = self.experimental_kernel_writeback
                && self
                    .cache
                    .lock()
                    .namespace
                    .nodes
                    .get(&node.id)
                    .is_some_and(|item| item.verbs & (READ | WRITE) == READ | WRITE);
            let (remote, mut node) = if fenced {
                let opened = self.open_writer(ino, &node)?;
                (opened.handle, opened.node)
            } else {
                let Reply::Handle(remote, node) = self.call(Call::Open {
                    node: node.id.clone(),
                    write: true,
                })?
                else {
                    return Err(err(libc::EIO, "open reply"));
                };
                (remote, node)
            };
            if flags & libc::O_TRUNC != 0 {
                let result = self.mutate(Mutation::Truncate {
                    node: node.id.clone(),
                    base: node.version.clone(),
                    size: 0,
                    handle: Some(remote.clone()),
                });
                match result {
                    Ok(outcome) => {
                        node = outcome
                            .node
                            .ok_or_else(|| err(libc::EIO, "truncate reply"))?
                    }
                    Err(error) => {
                        let _ = self.call(Call::Close { handle: remote });
                        self.release_writer(&node.id);
                        return Err(error);
                    }
                }
            }
            if let Err(error) = self.cache.lock().namespace.update(node.clone()) {
                let _ = self.call(Call::Close { handle: remote });
                return Err(error);
            }
            let fh = self.allocate_handle(pin, node, Some(remote), flags);
            let handle = self.handles.get_mut(&fh).unwrap();
            handle.fenced = fenced;
            handle.buffered = fenced && flags & libc::O_DIRECT == 0;
            Ok(fh)
        } else {
            Ok(self.allocate_handle(pin, node, None, flags))
        }
    }
    fn handle(&self, fh: u64) -> Result<OpenFile> {
        let handle = self
            .handles
            .get(&fh)
            .ok_or_else(|| err(libc::ESTALE, "handle absent"))?;
        if handle.incarnation != self.client.read().session.incarnation {
            return Err(err(libc::ESTALE, "old incarnation handle"));
        }
        let mut handle = handle.clone();
        self.shared_writer(&mut handle);
        if self.experimental_kernel_writeback
            && !self.inodes.is_active(handle._pin.ino(), &handle.node.id)
        {
            return Err(err(
                libc::ESTALE,
                "retired writeback inode; reopen required",
            ));
        }
        Ok(handle)
    }
    fn open_options(&self, fh: u64, flags: i32) -> u32 {
        let handle = &self.handles[&fh];
        let options = if handle.buffered
            || (!handle.writable && !self.direct_io && flags & libc::O_DIRECT == 0)
        {
            fuser::consts::FOPEN_KEEP_CACHE
        } else {
            fuser::consts::FOPEN_DIRECT_IO
        };
        options | if handle.writable { 0 } else { FOPEN_NOFLUSH }
    }
    fn create_node(
        &mut self,
        parent: u64,
        name: &OsStr,
        kind: Kind,
        mode: u32,
        _guard: &MutexGuard<'_, ()>,
    ) -> Result<Node> {
        let parent = self.writable_parent(parent)?;
        let name = Self::name(name)?;
        self.inodes.check_capacity()?;
        self.cache.lock().namespace.reserve(1, 4096)?;
        let outcome = self.mutate(Mutation::Create {
            parent: parent.id.clone(),
            name: name.clone(),
            kind,
            mode,
        })?;
        let node = outcome.node.ok_or_else(|| err(libc::EIO, "create reply"))?;
        let mut cache = self.cache.lock();
        let verbs = cache
            .namespace
            .nodes
            .get(&parent.id)
            .map(|p| p.verbs)
            .unwrap_or(0);
        cache.namespace.insert(ViewNode {
            node: node.clone(),
            visible_parent: Some(parent.id),
            visible_name: name,
            verbs,
        })?;
        Ok(node)
    }
    fn remove(&mut self, parent: u64, name: &OsStr, directory: bool) -> Result<()> {
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let parent_node = self.writable_parent(parent)?;
        let name = Self::name(name)?;
        let node = self.lookup_node(parent, &name)?;
        self.mutate(Mutation::Unlink {
            parent: parent_node.id.clone(),
            name: name.clone(),
            expected: node.entry_token,
            directory,
        })?;
        let mut cache = self.cache.lock();
        cache.namespace.remove(&node.id);
        Ok(())
    }
    fn directory_size(entries: &Vec<(InodePin, FileType, String)>) -> usize {
        entries.capacity() * std::mem::size_of::<(InodePin, FileType, String)>()
            + entries
                .iter()
                .map(|(_, _, name)| name.capacity())
                .sum::<usize>()
    }
    fn directory_entries(
        &mut self,
        ino: u64,
        budget: usize,
    ) -> Result<Vec<(InodePin, FileType, String)>> {
        self.listable_directory(ino)?;
        let mut entries: Vec<(InodePin, FileType, String)> = vec![
            (
                self.inodes.pin(ino, ReferenceKind::Directory)?,
                FileType::Directory,
                ".".into(),
            ),
            (
                self.inodes.pin(1, ReferenceKind::Directory)?,
                FileType::Directory,
                "..".into(),
            ),
        ];
        if ino == 1 {
            entries.extend([
                (
                    self.inodes.pin(3, ReferenceKind::Directory)?,
                    FileType::Directory,
                    "files".into(),
                ),
                (
                    self.inodes.pin(2, ReferenceKind::Directory)?,
                    FileType::Directory,
                    "shared".into(),
                ),
            ]);
        } else {
            let parent = self.inodes.id(ino);
            let mut children: BTreeMap<String, Node> = BTreeMap::new();
            {
                let cache = self.cache.lock();
                if let Some(parent) = &parent
                    && let Some(node) = cache.namespace.nodes.get(parent)
                    && node.verbs & LIST == 0
                {
                    return Err(err(libc::EACCES, "list denied"));
                }
                if ino == 2 || parent.is_some() {
                    let prefix = if ino == 2 { None } else { parent };
                    for ((entry_parent, name), id) in cache
                        .namespace
                        .entries
                        .range((prefix.clone(), String::new())..)
                    {
                        if entry_parent != &prefix {
                            break;
                        }
                        if ino == 2 && name == "files" {
                            continue;
                        }
                        if let Some(node) = cache.namespace.nodes.get(id) {
                            children.insert(name.clone(), node.node.clone());
                        }
                    }
                }
            }
            let mut name_bytes = entries
                .iter()
                .map(|(_, _, name)| name.capacity())
                .sum::<usize>();
            for (name, node) in children {
                name_bytes += name.capacity();
                if name_bytes
                    + (entries.len() + 1) * std::mem::size_of::<(InodePin, FileType, String)>()
                    > budget
                {
                    return Err(err(libc::ENOMEM, "directory snapshot byte capacity"));
                }
                let ino = self.inodes.allocate(&node.id, ReferenceKind::Directory)?;
                entries.push((
                    ino,
                    if node.kind == Kind::Directory {
                        FileType::Directory
                    } else {
                        FileType::RegularFile
                    },
                    name,
                ));
            }
        }
        entries.shrink_to_fit();
        if Self::directory_size(&entries) > budget {
            return Err(err(libc::ENOMEM, "directory snapshot byte capacity"));
        }
        Ok(entries)
    }
    fn listable_directory(&self, ino: u64) -> Result<()> {
        if ino <= 3 {
            return Ok(());
        }
        let id = self
            .inodes
            .id(ino)
            .ok_or_else(|| err(libc::ENOENT, "directory absent"))?;
        let cache = self.cache.lock();
        let node = cache
            .namespace
            .nodes
            .get(&id)
            .ok_or_else(|| err(libc::ENOENT, "directory absent from view"))?;
        if node.node.kind != Kind::Directory {
            return Err(err(libc::ENOTDIR, "not a directory"));
        }
        if node.verbs & LIST == 0 {
            return Err(err(libc::EACCES, "list denied"));
        }
        Ok(())
    }
    fn prepare_directory(&mut self, ino: u64, fh: u64, offset: i64) -> Result<()> {
        if offset < 0 {
            return Err(err(libc::EINVAL, "negative directory offset"));
        }
        let entries = self
            .directories
            .get(&fh)
            .ok_or_else(|| err(libc::ESTALE, "directory handle absent"))?;
        if offset == 0 || entries.entries.is_empty() {
            let previous_bytes = Self::directory_size(&entries.entries);
            let available = self
                .directory_budget
                .saturating_sub(self.directory_bytes - previous_bytes);
            let entries = self.directory_entries(ino, available)?;
            self.directory_bytes =
                self.directory_bytes - previous_bytes + Self::directory_size(&entries);
            self.operations
                .directory_snapshot_bytes
                .store(self.directory_bytes as u64, Ordering::Relaxed);
            self.directories.get_mut(&fh).unwrap().entries = entries;
        }
        Ok(())
    }
    fn sync(&mut self, fh: u64, durable: bool) -> Result<()> {
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let handle = self.handle(fh)?;
        self.resolve_pending(&handle.node.id)?;
        self.validate_writer(&handle.node.id)?;
        if let Some(error) = self.handle(fh)?.error {
            return Err(err(error, "prior handle publication failed"));
        }
        if durable
            && !self.publication_only_sync
            && let Err(error) = self.persist_node(&handle.node.id)
        {
            if error.code == libc::EIO {
                self.handles.get_mut(&fh).unwrap().error = Some(error.code);
                self.fail_writeback_handle(fh, error.code);
            }
            return Err(error);
        }
        Ok(())
    }
}
#[allow(clippy::too_many_arguments)]
impl Mount {
    fn ioctl(
        &mut self,
        _ino: u64,
        _fh: u64,
        _flags: u32,
        _cmd: u32,
        _in_data: &[u8],
        _out_size: u32,
        reply: fuser::ReplyIoctl,
    ) {
        reply.error(libc::ENOTTY);
    }

    fn init(&mut self, config: &mut KernelConfig) -> std::result::Result<(), i32> {
        let _ = config.add_capabilities(fuser::consts::FUSE_ATOMIC_O_TRUNC);
        let _ = config.add_capabilities(
            fuser::consts::FUSE_DO_READDIRPLUS | fuser::consts::FUSE_READDIRPLUS_AUTO,
        );
        let _ = config
            .add_capabilities(fuser::consts::FUSE_FLOCK_LOCKS | fuser::consts::FUSE_POSIX_LOCKS);
        if self.experimental_kernel_writeback {
            config
                .add_capabilities(fuser::consts::FUSE_WRITEBACK_CACHE)
                .map_err(|_| libc::EOPNOTSUPP)?;
            config
                .set_max_background(WRITEBACK_REQUESTS as u16)
                .map_err(|_| libc::EINVAL)?;
            config
                .set_congestion_threshold((WRITEBACK_REQUESTS - 1) as u16)
                .map_err(|_| libc::EINVAL)?;
        }
        let _ = config.set_max_write(MAX_IO_BYTES as u32);
        Ok(())
    }
    fn lookup(&mut self, parent: u64, name: &OsStr, reply: ReplyEntry) {
        self.operations.lookup.fetch_add(1, Ordering::Relaxed);
        let gate = self.gate.clone();
        let _guard = gate.lock();
        if parent == 1 {
            let ino = match name.to_str() {
                Some("files") => 3,
                Some("shared") => 2,
                _ => {
                    reply.error(libc::ENOENT);
                    return;
                }
            };
            let node = self.node(ino).ok();
            reply.entry(&TTL, &self.attr(ino, node.as_ref()), 0);
            return;
        }
        match Self::name(name)
            .and_then(|name| self.lookup_node(parent, &name))
            .and_then(|node| {
                let pin = self.inode(&node.id)?;
                self.inodes.add_lookup(pin.ino())?;
                Ok((pin, node))
            }) {
            Ok((pin, node)) => {
                reply.entry(&TTL, &self.attr(pin.ino(), Some(&node)), 0);
            }
            Err(error) => reply.error(error.code),
        }
    }
    fn forget(&mut self, ino: u64, nlookup: u64) {
        self.inodes.forget(ino, nlookup);
        if self.inodes.id(ino).is_none() {
            self.recovery_notifications.remove(&ino);
        }
    }
    fn getattr(&mut self, ino: u64, fh: Option<u64>, reply: ReplyAttr) {
        self.operations.getattr.fetch_add(1, Ordering::Relaxed);
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let result = self.node(ino).or_else(|error| {
            let id = self.inodes.id(ino).ok_or(error)?;
            if !self.inodes.is_active(ino, &id) {
                return Err(err(libc::ESTALE, "retired inode"));
            }
            let remote = fh
                .map(|fh| self.handle(fh))
                .transpose()?
                .and_then(|handle| handle.remote)
                .or_else(|| {
                    let incarnation = &self.client.read().session.incarnation;
                    self.handles
                        .values()
                        .find(|handle| {
                            handle._pin.ino() == ino
                                && &handle.incarnation == incarnation
                                && handle.remote.is_some()
                        })
                        .and_then(|handle| handle.remote.clone())
                });
            match self.call(Call::Stat {
                node: id.clone(),
                handle: Some(remote.unwrap_or_else(|| format!("view:{id}"))),
            })? {
                Reply::Node(node) => Ok(node),
                _ => Err(err(libc::EIO, "handle stat reply")),
            }
        });
        match result {
            Ok(node) => reply.attr(&TTL, &self.attr(ino, Some(&node))),
            Err(_) if ino <= 3 => reply.attr(&TTL, &self.attr(ino, None)),
            Err(_) => reply.error(libc::ESTALE),
        }
    }
    fn open(&mut self, ino: u64, flags: i32, reply: ReplyOpen) {
        self.operations.open.fetch_add(1, Ordering::Relaxed);
        let gate = self.gate.clone();
        let guard = gate.lock();
        match self.open_file(ino, flags, &guard) {
            Ok(fh) => {
                let options = self.open_options(fh, flags);
                reply.opened(fh, options);
            }
            Err(error) => reply.error(error.code),
        }
    }
    fn read(
        &mut self,
        ino: u64,
        fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _owner: Option<u64>,
        reply: ReplyData,
    ) {
        self.operations.read.fetch_add(1, Ordering::Relaxed);
        if offset < 0 || size as usize > MAX_IO_BYTES {
            reply.error(libc::EINVAL);
            return;
        }
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let handle = match self.handle(fh) {
            Ok(handle) => handle,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        if handle.fenced
            && let Err(error) = self.writer_error(&handle.node.id)
        {
            reply.error(error.code);
            return;
        }
        let node = self.node(ino).ok();
        let (auth_generation, view_head) = {
            let cache = self.cache.lock();
            (cache.namespace.auth_generation, cache.namespace.head)
        };
        let request = ReadRequest {
            unlinked: node.is_none(),
            sequential: handle.read_end == Some(offset as u64),
            node: node.unwrap_or(handle.node),
            remote: handle.remote,
            incarnation: handle.incarnation,
            auth_generation,
            view_head,
            offset: offset as u64,
            size,
        };
        self.reader.kernel_demand(&request);
        if let Some(handle) = self.handles.get_mut(&fh) {
            handle.read_end = Some(offset as u64 + u64::from(size));
        }
        match self.reader.cached_read(&request) {
            Ok(Some(bytes)) => {
                reply.data(&bytes);
                return;
            }
            Err(error) => {
                reply.error(error.code);
                return;
            }
            Ok(None) => {}
        }
        let Ok(permit) = self.reader.pending.clone().try_acquire_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pin = match self.inodes.pin(ino, ReferenceKind::Work) {
            Ok(pin) => pin,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let reader = self.reader.clone();
        if handle.fenced {
            self.runtime.spawn(writeback::read_fill(
                self.self_weak.clone(),
                reader,
                request,
                fh,
                reply,
                permit,
                pin,
            ));
            return;
        }
        let reply_gate = self.gate.clone();
        self.runtime.spawn(async move {
            let _permit = permit;
            let _pin = pin;
            match reader.read(request.clone()).await {
                Ok(bytes) => {
                    if let Some(_guard) = reply_gate.try_lock() {
                        match reader.validate(&request) {
                            Ok(()) => reply.data(&bytes),
                            Err(error) => {
                                tracing::debug!(?error, ino, fh, "FUSE read completion failed");
                                reply.error(error.code);
                            }
                        }
                    } else {
                        let gate = reply_gate.clone();
                        tokio::task::spawn_blocking(move || {
                            let _permit = _permit;
                            let _pin = _pin;
                            let _guard = gate.lock();
                            match reader.validate(&request) {
                                Ok(()) => reply.data(&bytes),
                                Err(error) => {
                                    tracing::debug!(?error, ino, fh, "FUSE read completion failed");
                                    reply.error(error.code);
                                }
                            }
                        });
                    }
                }
                Err(error) => {
                    tracing::debug!(?error, ino, fh, "FUSE read completion failed");
                    reply.error(error.code);
                }
            }
        });
    }

    fn write(
        &mut self,
        _ino: u64,
        fh: u64,
        offset: i64,
        data: &[u8],
        _write_flags: u32,
        _flags: i32,
        _owner: Option<u64>,
        reply: ReplyWrite,
    ) {
        let result = (|| {
            let gate = self.gate.clone();
            let _guard = gate.lock();
            if offset < 0 {
                return Err(err(libc::EINVAL, "negative offset"));
            }
            let handle = self.handle(fh)?;
            if !handle.writable {
                return Err(err(libc::EBADF, "read-only handle"));
            }
            if let Some(error) = handle.error {
                return Err(err(error, "prior handle publication failed"));
            }
            let outcome = self.mutate(Mutation::Write {
                node: handle.node.id,
                base: handle.base,
                offset: offset as u64,
                data: data.to_vec(),
                append: handle.append && !handle.buffered,
                handle: handle.remote,
            })?;
            let node = outcome.node.ok_or_else(|| err(libc::EIO, "write reply"))?;
            self.cache.lock().namespace.update(node.clone())?;
            if let Some(handle) = self.handles.get_mut(&fh) {
                handle.base = node.version.clone();
                handle.node = node;
            }
            Ok(outcome.written)
        })();
        match result {
            Ok(written) => reply.written(written),
            Err(error) => {
                self.fail_writeback_handle(fh, error.code);
                if let Some(handle) = self.handles.get_mut(&fh) {
                    handle.error = Some(error.code);
                }
                reply.error(error.code);
            }
        }
    }
    fn create(
        &mut self,
        parent: u64,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        let gate = self.gate.clone();
        let guard = gate.lock();
        let result: Result<(InodePin, Node, u64)> = (|| {
            let node = self.create_node(parent, name, Kind::File, mode & !umask, &guard)?;
            let pin = self.inode(&node.id)?;
            let fh = self.open_file(pin.ino(), flags & !libc::O_TRUNC, &guard)?;
            if let Err(error) = self.inodes.add_lookup(pin.ino()) {
                if let Some(handle) = self.handles.remove(&fh)
                    && let Some(remote) = handle.remote
                {
                    let _ = self.call(Call::Close { handle: remote });
                }
                return Err(error);
            }
            Ok((pin, node, fh))
        })();
        match result {
            Ok((pin, node, fh)) => reply.created(
                &TTL,
                &self.attr(pin.ino(), Some(&node)),
                0,
                fh,
                self.open_options(fh, flags),
            ),
            Err(error) => reply.error(error.code),
        }
    }
    fn mkdir(&mut self, parent: u64, name: &OsStr, mode: u32, umask: u32, reply: ReplyEntry) {
        let gate = self.gate.clone();
        let guard = gate.lock();
        match self
            .create_node(parent, name, Kind::Directory, mode & !umask, &guard)
            .and_then(|node| {
                let pin = self.inode(&node.id)?;
                self.inodes.add_lookup(pin.ino())?;
                Ok((pin, node))
            }) {
            Ok((pin, node)) => {
                reply.entry(&TTL, &self.attr(pin.ino(), Some(&node)), 0);
            }
            Err(error) => reply.error(error.code),
        }
    }
    fn unlink(&mut self, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        match self.remove(parent, name, false) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }
    fn rmdir(&mut self, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        match self.remove(parent, name, true) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }
    fn rename(
        &mut self,
        parent: u64,
        name: &OsStr,
        newparent: u64,
        newname: &OsStr,
        flags: u32,
        reply: ReplyEmpty,
    ) {
        let result = (|| {
            let gate = self.gate.clone();
            let _guard = gate.lock();
            if flags & !libc::RENAME_NOREPLACE != 0 {
                return Err(err(libc::EOPNOTSUPP, "rename flags"));
            }
            let source_parent = self.writable_parent(parent)?;
            let dest_parent = self.writable_parent(newparent)?;
            let name = Self::name(name)?;
            let new_name = Self::name(newname)?;
            let node = self.lookup_node(parent, &name)?;
            let destination = match self.lookup_node(newparent, &new_name) {
                Ok(node) => Some(node),
                Err(error) if error.code == libc::ENOENT => None,
                Err(error) => return Err(error),
            };
            if flags & libc::RENAME_NOREPLACE != 0 && destination.is_some() {
                return Err(err(libc::EEXIST, "destination exists"));
            }
            self.cache.lock().namespace.reserve(0, 4096)?;
            let outcome = self.mutate(Mutation::Rename {
                parent: source_parent.id.clone(),
                name: name.clone(),
                expected: node.entry_token,
                new_parent: dest_parent.id.clone(),
                new_name: new_name.clone(),
                destination: destination.as_ref().map(|n| n.entry_token.clone()),
            })?;
            let mut node = outcome.node.ok_or_else(|| err(libc::EIO, "rename reply"))?;
            let mut cache = self.cache.lock();
            if let Some(destination) = destination
                && destination.id != node.id
            {
                cache.namespace.remove(&destination.id);
            }
            if let Some(mut item) = cache.namespace.nodes.get(&node.id).cloned() {
                if self.experimental_kernel_writeback && item.node.version != node.version {
                    node.version = item.node.version.clone();
                    node.size = item.node.size;
                    node.mtime_ms = item.node.mtime_ms;
                }
                item.node = node;
                item.visible_parent = Some(dest_parent.id);
                item.visible_name = new_name;
                cache.namespace.insert(item)?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }
    fn setattr(
        &mut self,
        ino: u64,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<u64>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        flags: Option<u32>,
        reply: ReplyAttr,
    ) {
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let result = (|| {
            if uid.is_some() || gid.is_some() || flags.is_some() {
                return Err(err(libc::EOPNOTSUPP, "ownership or flags unsupported"));
            }
            let writer_fh = self
                .handles
                .iter()
                .find(|(_, handle)| handle.fenced && handle._pin.ino() == ino)
                .map(|(fh, _)| *fh);
            let handle = writer_fh.or(fh).map(|fh| self.handle(fh)).transpose()?;
            if let Some(error) = handle.as_ref().and_then(|handle| handle.error) {
                return Err(err(error, "prior handle publication failed"));
            }
            let mut node = self.node(ino).or_else(|error| {
                handle
                    .as_ref()
                    .map(|handle| handle.node.clone())
                    .ok_or(error)
            })?;
            let remote = handle.as_ref().and_then(|h| h.remote.clone());
            let base = handle
                .as_ref()
                .map(|h| h.base.clone())
                .unwrap_or(node.version.clone());
            if let Some(size) = size {
                node = self
                    .mutate(Mutation::Truncate {
                        node: node.id.clone(),
                        base: base.clone(),
                        size,
                        handle: remote.clone(),
                    })?
                    .node
                    .ok_or_else(|| err(libc::EIO, "truncate reply"))?;
            }
            if mode.is_some() || mtime.is_some() {
                let mtime_ms = mtime.map(|time| match time {
                    TimeOrNow::Now => now_ms(),
                    TimeOrNow::SpecificTime(time) => time
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                });
                node = self
                    .mutate(Mutation::SetAttr {
                        node: node.id.clone(),
                        base: if size.is_some() {
                            node.version.clone()
                        } else {
                            base
                        },
                        mode,
                        mtime_ms,
                        handle: remote,
                    })?
                    .node
                    .ok_or_else(|| err(libc::EIO, "setattr reply"))?;
            }
            self.cache.lock().namespace.update(node.clone())?;
            if let Some(fh) = fh
                && let Some(handle) = self.handles.get_mut(&fh)
            {
                handle.base = node.version.clone();
                handle.node = node.clone();
            }
            Ok(node)
        })();
        match result {
            Ok(node) => reply.attr(&TTL, &self.attr(ino, Some(&node))),
            Err(error) => reply.error(error.code),
        }
    }
    fn opendir(&mut self, ino: u64, _flags: i32, reply: ReplyOpen) {
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let result = (|| {
            if self.directories.len() >= 4096 {
                return Err(err(libc::EMFILE, "directory handle capacity"));
            }
            self.listable_directory(ino)?;
            let fh = self.next_handle;
            self.next_handle += 1;
            self.directories.insert(
                fh,
                Directory {
                    _pin: self.inodes.pin(ino, ReferenceKind::Open)?,
                    entries: Vec::new(),
                },
            );
            Ok(fh)
        })();
        match result {
            Ok(fh) => reply.opened(
                fh,
                fuser::consts::FOPEN_CACHE_DIR | fuser::consts::FOPEN_KEEP_CACHE,
            ),
            Err(error) => reply.error(error.code),
        }
    }
    fn readdir(&mut self, ino: u64, fh: u64, offset: i64, mut reply: ReplyDirectory) {
        self.operations.readdir.fetch_add(1, Ordering::Relaxed);
        let gate = self.gate.clone();
        let _guard = gate.lock();
        if let Err(error) = self.prepare_directory(ino, fh, offset) {
            reply.error(error.code);
            return;
        }
        let Some(entries) = self.directories.get(&fh) else {
            reply.error(libc::ESTALE);
            return;
        };
        if offset < 0 {
            reply.error(libc::EINVAL);
            return;
        }
        for (index, (child, kind, name)) in entries.entries.iter().enumerate().skip(offset as usize)
        {
            if name != "." && name != ".." && ino != 1 {
                let Ok(current) = self.lookup_node(ino, name) else {
                    continue;
                };
                if !self.inodes.is_active(child.ino(), &current.id) {
                    continue;
                }
            }
            if reply.add(child.ino(), (index + 1) as i64, *kind, name) {
                break;
            }
        }
        reply.ok();
    }
    fn readdirplus(&mut self, ino: u64, fh: u64, offset: i64, mut reply: ReplyDirectoryPlus) {
        self.operations.readdirplus.fetch_add(1, Ordering::Relaxed);
        let gate = self.gate.clone();
        let _guard = gate.lock();
        if let Err(error) = self.prepare_directory(ino, fh, offset) {
            reply.error(error.code);
            return;
        }
        let Some(entries) = self.directories.get(&fh) else {
            reply.error(libc::ESTALE);
            return;
        };
        if offset < 0 {
            reply.error(libc::EINVAL);
            return;
        }
        let mut credited = Vec::new();
        for (index, (child, _, name)) in entries.entries.iter().enumerate().skip(offset as usize) {
            let node = self.node(child.ino()).ok();
            if name != "." && name != ".." && ino != 1 {
                let Ok(current) = self.lookup_node(ino, name) else {
                    continue;
                };
                if node.as_ref().is_none_or(|n| n.id != current.id) {
                    continue;
                }
            }
            if reply.add(
                child.ino(),
                (index + 1) as i64,
                name,
                &TTL,
                &self.attr(child.ino(), node.as_ref()),
                0,
            ) {
                break;
            }
            if name != "."
                && name != ".."
                && let Err(error) = self.inodes.add_lookup(child.ino())
            {
                for ino in credited {
                    self.inodes.forget(ino, 1);
                }
                reply.error(error.code);
                return;
            }
            if name != "." && name != ".." {
                credited.push(child.ino());
            }
        }
        reply.ok();
    }
    fn releasedir(&mut self, _ino: u64, fh: u64, _flags: i32, reply: ReplyEmpty) {
        if let Some(entries) = self.directories.remove(&fh) {
            self.directory_bytes -= Self::directory_size(&entries.entries);
            self.operations
                .directory_snapshot_bytes
                .store(self.directory_bytes as u64, Ordering::Relaxed);
        }
        reply.ok();
    }
    fn fsyncdir(&mut self, ino: u64, fh: u64, _datasync: bool, reply: ReplyEmpty) {
        let gate = self.gate.clone();
        let _guard = gate.lock();
        let result = (|| {
            if !self.directories.contains_key(&fh) {
                return Err(err(libc::ESTALE, "directory handle absent"));
            }
            self.listable_directory(ino)?;
            if let Some(node) = self.inodes.id(ino) {
                self.resolve_pending(&node)?;
                if !self.publication_only_sync {
                    self.persist_node(&node)?;
                }
            }
            Ok(())
        })();
        drop(_guard);
        self.finish_sync(ino, result, reply);
    }
    fn flush(&mut self, ino: u64, fh: u64, _owner: u64, reply: ReplyEmpty) {
        let result = self.sync(fh, false);
        self.finish_sync(ino, result, reply);
    }
    fn fsync(&mut self, ino: u64, fh: u64, _datasync: bool, reply: ReplyEmpty) {
        let result = self.sync(fh, true);
        self.finish_sync(ino, result, reply);
    }
    fn release(
        &mut self,
        _ino: u64,
        fh: u64,
        _flags: i32,
        _owner: Option<u64>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        if let Some(handle) = self.handles.remove(&fh) {
            if let Some(remote) = handle.remote {
                let _ = self.call(Call::Close { handle: remote });
            }
            if handle.fenced {
                if !self.inodes.is_active(handle._pin.ino(), &handle.node.id) {
                    self.fail_writeback(&handle.node.id, libc::ESTALE);
                }
                self.release_writer(&handle.node.id);
            }
        }
        reply.ok();
    }
    fn getlk(
        &mut self,
        _ino: u64,
        _fh: u64,
        _owner: u64,
        _start: u64,
        _end: u64,
        _typ: i32,
        _pid: u32,
        reply: fuser::ReplyLock,
    ) {
        reply.error(libc::EOPNOTSUPP);
    }
    fn setlk(
        &mut self,
        _ino: u64,
        _fh: u64,
        _owner: u64,
        _start: u64,
        _end: u64,
        _typ: i32,
        _pid: u32,
        _sleep: bool,
        reply: ReplyEmpty,
    ) {
        reply.error(libc::EOPNOTSUPP);
    }
    fn statfs(&mut self, _ino: u64, reply: ReplyStatfs) {
        reply.error(libc::EOPNOTSUPP);
    }
    fn access(&mut self, ino: u64, mask: i32, reply: ReplyEmpty) {
        if ino <= 2 {
            if mask & libc::W_OK != 0 {
                reply.error(libc::EACCES);
            } else {
                reply.ok();
            }
            return;
        }
        let result = self.node(ino).and_then(|node| {
            let cache = self.cache.lock();
            let verbs = cache
                .namespace
                .nodes
                .get(&node.id)
                .map(|n| n.verbs)
                .unwrap_or(0);
            if (mask & libc::R_OK != 0 && verbs & READ == 0)
                || (mask & libc::W_OK != 0 && verbs & WRITE == 0)
                || (mask & libc::X_OK != 0 && node.mode & 0o111 == 0)
            {
                return Err(err(libc::EACCES, "access denied"));
            }
            Ok(())
        });
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error.code),
        }
    }
}
