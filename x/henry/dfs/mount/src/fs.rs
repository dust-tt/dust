//! FUSE adapter: lease-validated metadata caches, buffered writes, durable close.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::ffi::OsStr;
use std::ops::Bound;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dfs_proto::client::{Client, Reply};
use dfs_proto::{Attr, BLOCK_BYTES, Entry, Id, Invalidation, Kind, MAX_FLUSH_BLOCKS, MAX_IO_BYTES, Request, Response};
use fuser::{
    BsdFileFlags, Errno, FileAttr, FileHandle, FileType, Filesystem, FopenFlags, Generation, INodeNo, InitFlags, KernelConfig,
    LockOwner, Notifier, OpenFlags, RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyDirectoryPlus, ReplyEmpty,
    ReplyEntry, ReplyOpen, ReplyStatfs, ReplyWrite, ReplyXattr, Request as FuseRequest, TimeOrNow, WriteFlags,
};
use parking_lot::{Condvar, Mutex};

/// Buffered bytes per file before a write forces a (durable) flush.
const DIRTY_BYTES: usize = 4 << 20;
const DIRTY_BLOCKS: usize = MAX_FLUSH_BLOCKS - 8;
const PAGE: u32 = 4096;
/// Below this remaining lease, nothing is cached or handed to the kernel with a TTL.
const MIN_TTL: Duration = Duration::from_secs(1);
/// Matched profile: close commits running in the background at once (bounds memory with
/// `DIRTY_BYTES`).
const MAX_BACKGROUND: usize = 64;
/// Root name the mount looks up at start to learn whether the kernel can drop negative dentries.
const PROBE: &str = ".dfs-negative-probe";
/// Largest file a read miss fetches whole (with siblings); larger files are read by range.
const WHOLE_FILE: u64 = 1 << 20;
/// Largest sibling a read miss prefetches.
const SIBLING_FILE: u64 = 256 << 10;
/// Siblings the first read miss in a directory prefetches; later misses there prefetch up to
/// `MAX_WINDOW` (within the reply budget).
const MIN_WINDOW: usize = 16;
const MAX_WINDOW: usize = 256;
const CONTENT_BYTES: usize = 256 << 20;
const CONTENT_FILES: usize = 1 << 16;

#[derive(Default)]
struct Dirty {
    writes: Vec<(u64, Vec<u8>)>,
    bytes: usize,
    blocks: BTreeSet<u64>,
    end: u64,
    /// Explicit mtime set through `utimensat` while the file is open (deviation 1).
    mtime: Option<i64>,
    written_ns: i64,
}

impl Dirty {
    /// `self` followed by the later `newer` batch.
    fn then(mut self, newer: Dirty) -> Dirty {
        self.writes.extend(newer.writes);
        self.bytes += newer.bytes;
        self.blocks.extend(newer.blocks);
        self.end = self.end.max(newer.end);
        self.mtime = newer.mtime.or(self.mtime);
        self.written_ns = self.written_ns.max(newer.written_ns);
        self
    }
}

/// What close guarantees.
#[derive(Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum Profile {
    /// The agreed contract: close returns after its commit.
    Strict,
    /// Spolu-equivalent: close returns at once and commits in the background; fsync and fsyncdir
    /// wait for it and report its failure.
    Matched,
}

#[derive(Default)]
struct DirCache {
    complete: bool,
    /// `None` is a negative entry.
    names: BTreeMap<String, Option<Id>>,
}

#[derive(Default)]
struct Node {
    attr: Option<Attr>,
    dir: Option<DirCache>,
    link: Option<String>,
    dirty: Option<Dirty>,
    /// Size and times of the batch being committed (its writes are in the request).
    inflight: Option<Dirty>,
    /// A background commit of this node failed; reported by its next close or fsync.
    failed: Option<Errno>,
    open: u32,
    /// Content revision the kernel page cache may hold.
    kernel_rev: Option<u64>,
    /// The kernel may hold this directory's listing (`FOPEN_CACHE_DIR`).
    kernel_listing: bool,
    /// Generation of the last invalidation or own mutation that changed this node or its names.
    touched: u64,
    /// Directory and name this node was last listed, looked up, or created under.
    place: Option<(Id, String)>,
    /// Siblings the next read miss in this directory prefetches.
    window: usize,
}

impl Node {
    fn drop_cache(&mut self) {
        self.attr = None;
        self.dir = None;
        self.link = None;
        self.kernel_rev = None;
        self.kernel_listing = false;
    }
}

struct State {
    /// @cc [owner:fontanierh,label:concurrency] cache-generation
    /// Increases (under the state lock) with every applied invalidation, own mutation reply, and
    /// lease loss, which record it in `touched` of every node they change (`All` and lease loss: in
    /// `floor`). A reply MUST update caches only if no node whose state it installs, nor any node its
    /// invalidations name, was touched after the generation read when its request was sent, that
    /// generation is at least `floor`, the server marked it cacheable, and the lease is valid;
    /// otherwise it reaches the kernel with TTL 0.
    generation: u64,
    floor: u64,
    lease_until: Option<Instant>,
    nodes: HashMap<Id, Node>,
    /// @cc [owner:fontanierh,label:security;concurrency] content-by-rev
    /// A kernel READ MUST be served from `content` only when the cached, lease-valid attribute of
    /// the file has the same `rev` as the content. Every `All` invalidation and lease loss MUST
    /// empty it, and a `ReadFiles` reply MUST be installed only if no such drop happened after its
    /// request was sent: a revoked principal must never be served bytes it read before revocation.
    content: Content,
}

/// Whole file contents by content revision, evicted oldest first beyond `CONTENT_BYTES`.
#[derive(Default)]
struct Content {
    files: HashMap<Id, (u64, Arc<[u8]>)>,
    order: VecDeque<(Id, u64)>,
    bytes: usize,
    /// Files a `ReadFiles` call in flight will install.
    fetching: HashSet<Id>,
}

impl Content {
    fn get(&self, id: Id, rev: u64) -> Option<Arc<[u8]>> {
        self.files.get(&id).filter(|(r, _)| *r == rev).map(|(_, bytes)| bytes.clone())
    }

    fn insert(&mut self, id: Id, rev: u64, bytes: Arc<[u8]>) {
        self.bytes += bytes.len();
        if let Some((_, old)) = self.files.insert(id, (rev, bytes)) {
            self.bytes -= old.len();
        }
        self.order.push_back((id, rev));
        while self.bytes > CONTENT_BYTES || self.files.len() > CONTENT_FILES {
            let Some((id, rev)) = self.order.pop_front() else { break };
            if self.files.get(&id).is_some_and(|(r, _)| *r == rev) {
                self.remove(id);
            }
        }
    }

    fn remove(&mut self, id: Id) {
        if let Some((_, bytes)) = self.files.remove(&id) {
            self.bytes -= bytes.len();
        }
    }

    fn clear(&mut self) {
        self.files.clear();
        self.order.clear();
        self.bytes = 0;
    }
}

/// Nodes whose cached state `invalidations` changes.
fn changed(invalidations: &[Invalidation]) -> impl Iterator<Item = Id> + '_ {
    invalidations.iter().filter_map(|item| match item {
        Invalidation::Node(id) | Invalidation::Name { parent: id, .. } => Some(*id),
        Invalidation::All => None,
    })
}

impl State {
    fn ttl(&self) -> Option<Duration> {
        let left = self.lease_until?.saturating_duration_since(Instant::now());
        (left >= MIN_TTL).then_some(left)
    }

    /// Nothing changed `ids` since generation `sent`.
    fn fresh(&self, sent: u64, ids: impl IntoIterator<Item = Id>) -> bool {
        sent >= self.floor && ids.into_iter().all(|id| self.nodes.get(&id).is_none_or(|n| n.touched <= sent))
    }

    fn usable(&self, sent: u64, reply: &Reply, ids: impl IntoIterator<Item = Id>) -> bool {
        reply.cacheable && self.ttl().is_some() && self.fresh(sent, ids.into_iter().chain(changed(&reply.invalidations)))
    }

    fn touch(&mut self, ids: impl IntoIterator<Item = Id>) {
        self.generation += 1;
        let generation = self.generation;
        for id in ids {
            self.node(id).touched = generation;
        }
    }

    fn node(&mut self, id: Id) -> &mut Node {
        self.nodes.entry(id).or_default()
    }

    fn attr(&self, id: Id) -> Option<&Attr> {
        self.ttl()?;
        self.nodes.get(&id)?.attr.as_ref()
    }

    /// Drops what `items` names; returns the kernel notifications to send.
    fn invalidate(&mut self, items: &[Invalidation]) -> Vec<Kernel> {
        self.touch(changed(items).collect::<Vec<_>>());
        let mut kernel = Vec::new();
        for item in items {
            match item {
                Invalidation::Node(id) => {
                    if let Some(node) = self.nodes.get_mut(id) {
                        node.attr = None;
                        node.link = None;
                        node.kernel_rev = None;
                    }
                    self.content.remove(*id);
                    kernel.push(Kernel::Inode(*id, 0, 0));
                }
                Invalidation::Name { parent, name } => {
                    if let Some(node) = self.nodes.get_mut(parent) {
                        node.attr = None;
                        node.kernel_listing = false;
                        if let Some(dir) = node.dir.as_mut() {
                            dir.names.remove(name);
                            dir.complete = false;
                        }
                    }
                    kernel.push(Kernel::Entry(*parent, name.clone()));
                    kernel.push(Kernel::Inode(*parent, 0, 0));
                }
                Invalidation::All => kernel.extend(self.drop_all()),
            }
        }
        kernel
    }

    fn drop_all(&mut self) -> Vec<Kernel> {
        self.generation += 1;
        self.floor = self.generation;
        self.content.clear();
        let mut kernel = Vec::new();
        for (id, node) in &mut self.nodes {
            if let Some(dir) = &node.dir {
                kernel.extend(dir.names.keys().map(|name| Kernel::Entry(*id, name.clone())));
            }
            kernel.push(Kernel::Inode(*id, 0, 0));
            node.drop_cache();
        }
        kernel
    }
}

impl State {
    /// `id` followed by the siblings whose content a read miss of `id` should prefetch: trusted
    /// small files not cached or being fetched, in its directory's cached listing order from `id`
    /// on, wrapping around (parallel walkers do not read in listing order).
    fn prefetch(&mut self, id: Id, size: u64) -> Vec<Id> {
        let mut ids = vec![id];
        let Some((parent, name)) = self.nodes.get(&id).and_then(|n| n.place.clone()) else { return ids };
        let Some(dir) = self.nodes.get_mut(&parent) else { return ids };
        let window = if dir.window == 0 { MIN_WINDOW } else { MAX_WINDOW };
        dir.window = window;
        let Some(listing) = self.nodes.get(&parent).and_then(|n| n.dir.as_ref()) else { return ids };
        let mut left = u64::from(MAX_IO_BYTES).saturating_sub(size);
        let after = listing.names.range::<str, _>((Bound::Excluded(name.as_str()), Bound::Unbounded));
        let before = listing.names.range::<str, _>((Bound::Unbounded, Bound::Excluded(name.as_str())));
        for sibling in after.chain(before).filter_map(|(_, id)| *id) {
            if ids.len() > window {
                break;
            }
            let Some(attr) = self.attr(sibling).filter(|a| a.kind == Kind::File && a.size <= SIBLING_FILE.min(left)) else { continue };
            if self.content.get(sibling, attr.rev).is_none() && !self.content.fetching.contains(&sibling) {
                left -= attr.size;
                ids.push(sibling);
            }
        }
        ids
    }
}

pub enum Kernel {
    Entry(Id, String),
    Inode(Id, i64, i64),
}

pub enum Job {
    /// A server-pushed invalidation to apply, notify, then acknowledge.
    Remote(u64, Vec<Invalidation>),
    /// Kernel notifications for an own mutation that invalidated everything.
    Notify(Vec<Kernel>),
    LeaseLost,
}

struct Listed {
    name: String,
    id: Id,
    attr: Attr,
}

/// What one open directory handle lists.
struct Snapshot {
    listed: Vec<Listed>,
    dir: Attr,
    /// Generation the entries were cached at; `None` when they must reach the kernel with TTL 0.
    generation: Option<u64>,
}

#[derive(Default)]
pub struct Stats {
    rpcs: Mutex<HashMap<&'static str, (u64, u128)>>,
    local: Mutex<HashMap<&'static str, u64>>,
}

impl Stats {
    fn rpc(&self, kind: &'static str, elapsed: Duration) {
        let mut rpcs = self.rpcs.lock();
        let entry = rpcs.entry(kind).or_default();
        entry.0 += 1;
        entry.1 += elapsed.as_micros();
    }

    fn local(&self, kind: &'static str) {
        *self.local.lock().entry(kind).or_default() += 1;
    }

    pub fn json(&self) -> serde_json::Value {
        let rpcs: serde_json::Map<String, serde_json::Value> = self
            .rpcs
            .lock()
            .iter()
            .map(|(k, (n, us))| (k.to_string(), serde_json::json!({ "calls": n, "total_ms": *us as f64 / 1000.0 })))
            .collect();
        let local: serde_json::Map<String, serde_json::Value> =
            self.local.lock().iter().map(|(k, n)| (k.to_string(), (*n).into())).collect();
        serde_json::json!({ "message": "mount totals", "rpcs": rpcs, "local": local })
    }
}

pub struct Fs {
    pub rt: tokio::runtime::Handle,
    pub client: Arc<Client>,
    pub stats: Stats,
    root: Id,
    uid: u32,
    gid: u32,
    state: Mutex<State>,
    flushing: Mutex<HashMap<Id, Arc<Mutex<()>>>>,
    /// Open directory handles; `None` until the kernel reads a listing it was told to keep cached.
    dirs: Mutex<HashMap<u64, Option<Arc<Snapshot>>>>,
    next_fh: AtomicU64,
    jobs: std::sync::mpsc::Sender<Job>,
    /// @cc [owner:fontanierh,label:concurrency] negative-ttl
    /// A negative lookup MUST reach the kernel with a TTL only after `probe_negative` saw
    /// `FUSE_NOTIFY_INVAL_ENTRY` drop a negative dentry; otherwise it is answered ENOENT, which the
    /// kernel never caches. (Linux 7.0 cannot invalidate negative dentries.)
    negative_ttl: AtomicBool,
    probing: AtomicBool,
    probe_lookups: AtomicU64,
    profile: Profile,
    background: Mutex<Background>,
    background_done: Condvar,
    /// Signalled (with `state`) when a `ReadFiles` call ends.
    fetched: Condvar,
}

#[derive(Default)]
struct Background {
    running: usize,
    /// First background commit failure since the last barrier.
    failed: Option<Errno>,
}

fn errno(e: dfs_proto::Errno) -> Errno {
    Errno::from_i32(e.0)
}

fn now_ns() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos() as i64)
}

fn time(ns: i64) -> SystemTime {
    UNIX_EPOCH + Duration::from_nanos(ns.max(0) as u64)
}

fn ns(time: TimeOrNow) -> i64 {
    match time {
        TimeOrNow::SpecificTime(t) => t.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos() as i64),
        TimeOrNow::Now => now_ns(),
    }
}

fn kind(kind: Kind) -> FileType {
    match kind {
        Kind::File => FileType::RegularFile,
        Kind::Dir => FileType::Directory,
        Kind::Symlink => FileType::Symlink,
    }
}

fn name_of(name: &OsStr) -> Result<&str, Errno> {
    name.to_str().ok_or(Errno::EINVAL)
}

impl Fs {
    pub fn new(
        rt: tokio::runtime::Handle,
        client: Arc<Client>,
        root: Id,
        owner: (u32, u32),
        lease_until: Instant,
        jobs: std::sync::mpsc::Sender<Job>,
        profile: Profile,
    ) -> Self {
        Self {
            rt,
            client,
            stats: Stats::default(),
            root,
            uid: owner.0,
            gid: owner.1,
            state: Mutex::new(State {
                generation: 0,
                floor: 0,
                lease_until: Some(lease_until),
                nodes: HashMap::new(),
                content: Content::default(),
            }),
            flushing: Mutex::default(),
            dirs: Mutex::default(),
            next_fh: AtomicU64::new(1),
            jobs,
            negative_ttl: AtomicBool::new(false),
            probing: AtomicBool::new(false),
            probe_lookups: AtomicU64::new(0),
            profile,
            background: Mutex::default(),
            background_done: Condvar::new(),
            fetched: Condvar::new(),
        }
    }

    /// The kernel's root inode is 1; the mount root and object 1 swap numbers.
    fn ino(&self, id: Id) -> INodeNo {
        INodeNo(if id == self.root { 1 } else if id == 1 { self.root } else { id })
    }

    fn id(&self, ino: INodeNo) -> Id {
        if ino.0 == 1 { self.root } else if ino.0 == self.root { 1 } else { ino.0 }
    }

    fn call(&self, kind: &'static str, request: Request) -> (Reply, u64) {
        let sent = self.state.lock().generation;
        let started = Instant::now();
        let reply = self.rt.block_on(self.client.call(request));
        self.stats.rpc(kind, started.elapsed());
        (reply, sent)
    }

    /// The whole content of small file `id` at its trusted revision, from the content cache or one
    /// `ReadFiles` call (which also prefetches siblings when the read starts at `offset` 0, as
    /// sequential readers do); `None` when it must be read by range (no trusted attribute, too
    /// large, or left out by the server, which then reports why).
    fn read_whole(&self, id: Id, offset: u64) -> Result<Option<Arc<[u8]>>, Errno> {
        let mut state = self.state.lock();
        let size = loop {
            let Some(attr) = state.attr(id).filter(|a| a.size <= WHOLE_FILE) else { return Ok(None) };
            if let Some(bytes) = state.content.get(id, attr.rev) {
                drop(state);
                self.stats.local("read");
                return Ok(Some(bytes));
            }
            if !state.content.fetching.contains(&id) {
                break attr.size;
            }
            self.fetched.wait(&mut state);
        };
        let ids = if offset == 0 { state.prefetch(id, size) } else { vec![id] };
        state.content.fetching.extend(ids.iter().copied());
        let sent = state.generation;
        drop(state);
        let started = Instant::now();
        let reply = self.rt.block_on(self.client.call(Request::ReadFiles { ids: ids.clone(), budget: MAX_IO_BYTES }));
        self.stats.rpc("read_files", started.elapsed());
        let files: Result<Vec<(Id, u64, Arc<[u8]>)>, Errno> = match reply.result {
            Ok(Response::Files(files)) => Ok(files.into_iter().map(|f| (f.id, f.rev, f.bytes.into())).collect()),
            Ok(_) => Err(Errno::EIO),
            Err(e) => Err(errno(e)),
        };
        let mut state = self.state.lock();
        for id in &ids {
            state.content.fetching.remove(id);
        }
        self.fetched.notify_all();
        let files = files?;
        let demanded = files.iter().find(|(file, ..)| *file == id).map(|(.., bytes)| bytes.clone());
        // Deliberately not `usable()`: contents are keyed by revision and need no hold, only the
        // absence of an `All` drop since the request was sent (content-by-rev).
        if sent >= state.floor {
            for (id, rev, bytes) in files {
                state.content.insert(id, rev, bytes);
            }
        }
        Ok(demanded)
    }

    /// What a new handle on `dir` lists: the cached listing when complete and every entry's
    /// attributes are cached, else a fresh fetch; and whether it is complete.
    fn snapshot(&self, dir: Id) -> Result<(Snapshot, bool), Errno> {
        let cached = {
            let state = self.state.lock();
            let node = state.nodes.get(&dir);
            match (state.ttl(), node.and_then(|n| n.dir.as_ref()).filter(|d| d.complete), node.and_then(|n| n.attr.clone())) {
                (Some(_), Some(listing), Some(dir_attr)) => listing
                    .names
                    .iter()
                    .filter_map(|(name, id)| id.map(|id| (name, id)))
                    .map(|(name, id)| state.attr(id).map(|attr| Listed { name: name.clone(), id, attr: attr.clone() }))
                    .collect::<Option<Vec<_>>>()
                    .map(|listed| Snapshot { listed, dir: dir_attr, generation: Some(state.generation) }),
                _ => None,
            }
        };
        if let Some(snapshot) = cached {
            self.stats.local("opendir");
            return Ok((snapshot, true));
        }
        let (entries, complete, dir_attr, generation) = self.fetch_dir(dir, usize::MAX)?;
        let listed = entries.into_iter().map(|e| Listed { name: e.name, id: e.attr.id, attr: e.attr }).collect();
        Ok((Snapshot { listed, dir: dir_attr, generation }, complete))
    }

    /// The listing of handle `fh` on `dir`, built on first use when opened as kept.
    fn listing(&self, dir: Id, fh: FileHandle) -> Result<Arc<Snapshot>, Errno> {
        match self.dirs.lock().get(&fh.0) {
            None => return Err(Errno::EBADF),
            Some(Some(snapshot)) => return Ok(snapshot.clone()),
            Some(None) => {}
        }
        let (snapshot, complete) = self.snapshot(dir)?;
        let mut state = self.state.lock();
        // The kernel caches what this handle lists: unless that is a complete listing nothing changed
        // since, the next open must not keep it.
        if !(complete && snapshot.generation.is_some_and(|g| state.fresh(g, [dir]))) {
            state.node(dir).kernel_listing = false;
        }
        drop(state);
        let snapshot = Arc::new(snapshot);
        if let Some(slot) = self.dirs.lock().get_mut(&fh.0) {
            *slot = Some(snapshot.clone());
        }
        Ok(snapshot)
    }

    fn file_attr(&self, attr: &Attr, node: Option<&Node>) -> FileAttr {
        let mut size = attr.size;
        let mut mtime = attr.mtime_ns;
        for dirty in node.into_iter().flat_map(|n| n.inflight.iter().chain(n.dirty.iter())) {
            size = size.max(dirty.end);
            mtime = dirty.mtime.unwrap_or(if dirty.bytes > 0 { dirty.written_ns } else { mtime });
        }
        let mut perm = (attr.mode & 0o7777) as u16;
        if !attr.writable {
            perm &= !0o222;
        }
        FileAttr {
            ino: self.ino(attr.id),
            size,
            blocks: size.div_ceil(512),
            atime: time(mtime),
            mtime: time(mtime),
            ctime: time(attr.ctime_ns),
            crtime: time(attr.ctime_ns),
            kind: kind(attr.kind),
            perm,
            nlink: if attr.kind == Kind::Dir { 2 } else { 1 },
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: BLOCK_BYTES as u32,
            flags: 0,
        }
    }

    fn visible(&self, state: &State, attr: &Attr) -> FileAttr {
        self.file_attr(attr, state.nodes.get(&attr.id))
    }

    fn negative(&self) -> FileAttr {
        FileAttr {
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
            blksize: BLOCK_BYTES as u32,
            flags: 0,
        }
    }

    /// Applies an own mutation's reply: `apply` updates the caches of `ids` (and of what the reply's
    /// invalidations name) in place when the reply is usable; otherwise those are dropped. Either way
    /// they are touched.
    fn mutated(&self, sent: u64, reply: &Reply, ids: &[Id], apply: impl FnOnce(&mut State)) -> Option<Duration> {
        let mut state = self.state.lock();
        let all = reply.invalidations.contains(&Invalidation::All);
        let applied = !all && state.usable(sent, reply, ids.iter().copied());
        if applied {
            apply(&mut state);
            state.touch(ids.iter().copied().chain(changed(&reply.invalidations)).collect::<Vec<_>>());
        } else {
            let kernel = state.invalidate(&reply.invalidations);
            if all {
                let _ = self.jobs.send(Job::Notify(kernel));
            }
        }
        if applied { state.ttl() } else { None }
    }

    /// Fetches up to `pages` pages of `dir`; caches them when usable. Returns the entries, whether
    /// the listing is complete, the directory's attributes, and the generation they were cached at.
    fn fetch_dir(&self, dir: Id, pages: usize) -> Result<(Vec<Entry>, bool, Attr, Option<u64>), Errno> {
        let sent = self.state.lock().generation;
        let mut entries = Vec::new();
        let mut after = None;
        let mut cacheable = true;
        let mut complete = false;
        let mut dir_attr = None;
        for _ in 0..pages {
            let started = Instant::now();
            let reply = self.rt.block_on(self.client.call(Request::ReadDir { dir, after: after.clone(), limit: PAGE }));
            self.stats.rpc("readdir", started.elapsed());
            cacheable &= reply.cacheable;
            let Response::Listing { dir: attr, entries: page, more } = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
            dir_attr = Some(attr);
            after = page.last().map(|e| e.name.clone());
            entries.extend(page);
            if !more {
                complete = true;
                break;
            }
        }
        let dir_attr = dir_attr.ok_or(Errno::EIO)?;
        let mut state = self.state.lock();
        let fresh = state.fresh(sent, std::iter::once(dir).chain(entries.iter().map(|e| e.attr.id)));
        let ttl = if fresh && cacheable { state.ttl() } else { None };
        if ttl.is_some() {
            state.node(dir).attr = Some(dir_attr.clone());
            let mut names = BTreeMap::new();
            for entry in &entries {
                names.insert(entry.name.clone(), Some(entry.attr.id));
                let node = state.node(entry.attr.id);
                node.attr = Some(entry.attr.clone());
                node.place = Some((dir, entry.name.clone()));
            }
            state.node(dir).dir = Some(DirCache { complete, names });
        }
        let generation = ttl.map(|_| state.generation);
        Ok((entries, complete, dir_attr, generation))
    }

    fn lookup_cached(&self, parent: Id, name: &str) -> Option<(Option<FileAttr>, Duration)> {
        let mut state = self.state.lock();
        let ttl = state.ttl()?;
        let dir = state.nodes.get_mut(&parent)?.dir.as_mut()?;
        match dir.names.get(name) {
            Some(Some(id)) => {
                let id = *id;
                state.attr(id).map(|a| (Some(self.visible(&state, a)), ttl))
            }
            Some(None) => Some((None, ttl)),
            None if dir.complete => {
                // Recorded so that dropping this directory's names reaches the kernel's negative entry.
                dir.names.insert(name.to_string(), None);
                Some((None, ttl))
            }
            None => None,
        }
    }

    fn do_lookup(&self, parent: Id, name: &str) -> Result<(Option<FileAttr>, Duration), Errno> {
        if let Some(hit) = self.lookup_cached(parent, name) {
            self.stats.local("lookup");
            return Ok(hit);
        }
        // First miss in a directory: fetch its first page with attributes (directory prefetch).
        let listed = self.state.lock().nodes.get(&parent).is_some_and(|n| n.dir.is_some());
        if !listed {
            self.fetch_dir(parent, 1)?;
            if let Some(hit) = self.lookup_cached(parent, name) {
                return Ok(hit);
            }
        }
        let (reply, sent) = self.call("lookup", Request::Lookup { parent, name: name.to_string() });
        let Response::Entry(attr) = reply.result.clone().map_err(errno)? else { return Err(Errno::EIO) };
        let mut state = self.state.lock();
        let usable = state.usable(sent, &reply, std::iter::once(parent).chain(attr.as_ref().map(|a| a.id)));
        if usable {
            let dir = state.node(parent).dir.get_or_insert_with(DirCache::default);
            dir.names.insert(name.to_string(), attr.as_ref().map(|a| a.id));
            if let Some(attr) = &attr {
                let node = state.node(attr.id);
                node.attr = Some(attr.clone());
                node.place = Some((parent, name.to_string()));
            }
        }
        let ttl = if usable { state.ttl().unwrap_or_default() } else { Duration::ZERO };
        Ok((attr.map(|a| self.visible(&state, &a)), ttl))
    }

    fn do_getattr(&self, id: Id) -> Result<(FileAttr, Duration), Errno> {
        {
            let state = self.state.lock();
            if let (Some(attr), Some(ttl)) = (state.attr(id), state.ttl()) {
                self.stats.local("getattr");
                return Ok((self.visible(&state, attr), ttl));
            }
        }
        let (reply, sent) = self.call("getattr", Request::GetAttr { id });
        let Response::Attr(attr) = reply.result.clone().map_err(errno)? else { return Err(Errno::EIO) };
        let mut state = self.state.lock();
        let usable = state.usable(sent, &reply, [id]);
        if usable {
            state.node(id).attr = Some(attr.clone());
        }
        let ttl = if usable { state.ttl().unwrap_or_default() } else { Duration::ZERO };
        Ok((self.visible(&state, &attr), ttl))
    }

    /// @cc [owner:fontanierh,label:product;concurrency] durable-flush
    /// Returns `Ok` only after every write and buffered mtime accepted for `id` before the call
    /// started is committed by the server. Concurrent flushes of one inode MUST serialize so a
    /// flush never returns while an earlier flush carrying its data is still in flight.
    fn flush_inode(&self, id: Id) -> Result<(), Errno> {
        let lock = self.flushing.lock().entry(id).or_default().clone();
        let _serial = lock.lock();
        self.flush_locked(id)
    }

    /// `flush_inode` under the node's flush lock.
    fn flush_locked(&self, id: Id) -> Result<(), Errno> {
        let dirty = {
            let mut state = self.state.lock();
            let node = state.node(id);
            match node.dirty.take() {
                Some(dirty) if !dirty.writes.is_empty() || dirty.mtime.is_some() => {
                    node.inflight = Some(Dirty { writes: Vec::new(), blocks: BTreeSet::new(), ..dirty });
                    dirty
                }
                _ => return Ok(()),
            }
        };
        let (reply, sent) = self.call("flush", Request::Flush { id, writes: dirty.writes.clone(), mtime_ns: dirty.mtime });
        let attr = match reply.result.clone() {
            Ok(Response::Attr(attr)) => attr,
            failed => {
                // Keep the batch ahead of newer writes: the next flush retries it, in order.
                let mut state = self.state.lock();
                let node = state.node(id);
                node.inflight = None;
                node.dirty = Some(match node.dirty.take() {
                    Some(newer) => dirty.then(newer),
                    None => dirty,
                });
                return Err(failed.err().map_or(Errno::EIO, errno));
            }
        };
        self.mutated(sent, &reply, &[id], |state| {
            let node = state.node(id);
            node.attr = Some(attr.clone());
            node.kernel_rev = Some(attr.rev);
        });
        self.state.lock().node(id).inflight = None;
        Ok(())
    }

    /// Close-time commit. Strict: `flush_inode`. Matched: returns at once and commits in the
    /// background.
    ///
    /// @cc [owner:fontanierh,label:product;error-handling] matched-close
    /// Under `Profile::Matched`, a background commit failure MUST be reported (once) by the node's
    /// next close or fsync and by the next `fsyncdir` of the mount; its batch stays buffered ahead
    /// of newer writes. `fsync` MUST wait for the node's in-flight commit, and `fsyncdir` for every
    /// background commit started before it.
    fn close_inode(fs: &Arc<Self>, id: Id) -> Result<(), Errno> {
        if fs.profile == Profile::Strict {
            return fs.flush_inode(id);
        }
        {
            let mut state = fs.state.lock();
            let node = state.node(id);
            if let Some(e) = node.failed.take() {
                return Err(e);
            }
            if node.dirty.is_none() {
                return Ok(());
            }
        }
        let mut background = fs.background.lock();
        while background.running >= MAX_BACKGROUND {
            fs.background_done.wait(&mut background);
        }
        background.running += 1;
        drop(background);
        let committing = fs.clone();
        fs.rt.spawn_blocking(move || committing.commit_background(id));
        Ok(())
    }

    fn commit_background(&self, id: Id) {
        let lock = self.flushing.lock().entry(id).or_default().clone();
        let result = {
            let _serial = lock.lock();
            let result = self.flush_locked(id);
            // Recorded before the flush lock is released, so the node's next fsync sees it.
            if let Err(e) = result {
                self.state.lock().node(id).failed = Some(e);
            }
            result
        };
        let mut background = self.background.lock();
        if let Err(e) = result {
            background.failed.get_or_insert(e);
        }
        background.running -= 1;
        self.background_done.notify_all();
    }

    /// Waits for every background commit; returns the first failure since the last barrier.
    fn barrier(&self) -> Result<(), Errno> {
        let mut background = self.background.lock();
        while background.running > 0 {
            self.background_done.wait(&mut background);
        }
        background.failed.take().map_or(Ok(()), Err)
    }

    /// fsync: commits what is buffered (after any background commit of this node) and reports a
    /// background failure of this node.
    fn sync_inode(&self, id: Id) -> Result<(), Errno> {
        self.flush_inode(id)?;
        self.state.lock().node(id).failed.take().map_or(Ok(()), Err)
    }

    fn created(&self, parent: Id, name: &str, attr: &Attr, parent_mtime_ns: i64, existed: bool) -> impl FnOnce(&mut State) {
        let (name, attr) = (name.to_string(), attr.clone());
        move |state: &mut State| {
            let parent_node = state.node(parent);
            if let Some(dir) = parent_node.dir.as_mut() {
                dir.names.insert(name.clone(), Some(attr.id));
            }
            if let Some(parent_attr) = parent_node.attr.as_mut().filter(|_| !existed) {
                parent_attr.mtime_ns = parent_attr.mtime_ns.max(parent_mtime_ns);
                parent_attr.ctime_ns = parent_attr.ctime_ns.max(parent_mtime_ns);
            }
            let node = state.node(attr.id);
            if attr.kind == Kind::Dir && !existed {
                node.dir = Some(DirCache { complete: true, names: BTreeMap::new() });
            }
            node.attr = Some(attr);
            node.place = Some((parent, name));
        }
    }

    fn make(&self, parent: Id, name: &str, kind: Kind, mode: u32, exclusive: bool, target: Option<String>) -> Result<(Attr, Duration, bool), Errno> {
        let request = Request::Create { parent, name: name.to_string(), kind, mode: mode & 0o7777, exclusive, target: target.clone() };
        let (reply, sent) = self.call("create", request);
        let Response::Created { attr, parent_mtime_ns, existed } = reply.result.clone().map_err(errno)? else { return Err(Errno::EIO) };
        let apply = self.created(parent, name, &attr, parent_mtime_ns, existed);
        let ttl = self.mutated(sent, &reply, &[parent, attr.id], |state| {
            apply(state);
            if let Some(target) = target {
                state.node(attr.id).link = Some(target);
            }
        });
        let usable = ttl.is_some() && reply.cacheable;
        Ok((attr, if usable { ttl.unwrap_or_default() } else { Duration::ZERO }, existed))
    }

    fn entry_reply(&self, result: Result<(Attr, Duration, bool), Errno>, reply: ReplyEntry) {
        match result {
            Ok((attr, ttl, _)) => {
                let state = self.state.lock();
                reply.entry(&ttl, &self.visible(&state, &attr), Generation(0));
            }
            Err(e) => reply.error(e),
        }
    }

    fn remove(&self, parent: Id, name: &str, dir: bool) -> Result<(), Errno> {
        let (reply, sent) = self.call("remove", Request::Remove { parent, name: name.to_string(), dir });
        reply.result.clone().map_err(errno)?;
        self.mutated(sent, &reply, &[parent], |state| {
            let parent_node = state.node(parent);
            parent_node.attr = None;
            let child = parent_node.dir.as_mut().and_then(|d| d.names.insert(name.to_string(), None)).flatten();
            if let Some(child) = child {
                state.node(child).drop_cache();
            }
        });
        Ok(())
    }

    /// `attr_rev` is the content revision of a trusted attribute; `None` (untrusted) never keeps
    /// the kernel's pages.
    fn open_handle(&self, id: Id, attr_rev: Option<u64>, read_only: bool) -> (FileHandle, FopenFlags) {
        let mut state = self.state.lock();
        let node = state.node(id);
        let mut flags = FopenFlags::empty();
        if attr_rev.is_some() && node.kernel_rev == attr_rev {
            flags |= FopenFlags::FOPEN_KEEP_CACHE;
        }
        // Closing a read-only descriptor has nothing to publish.
        if read_only {
            flags |= FopenFlags::FOPEN_NOFLUSH;
        }
        node.kernel_rev = attr_rev;
        node.open += 1;
        (FileHandle(self.next_fh.fetch_add(1, Ordering::Relaxed)), flags)
    }

    fn setattr_remote(&self, id: Id, mode: Option<u32>, size: Option<u64>, mtime_ns: Option<i64>) -> Result<(FileAttr, Duration), Errno> {
        // Buffered or in-flight writes and times commit first, so they never land after this.
        self.flush_inode(id)?;
        let (reply, sent) = self.call("setattr", Request::SetAttr { id, mode: mode.map(|m| m & 0o7777), size, mtime_ns });
        let Response::Attr(attr) = reply.result.clone().map_err(errno)? else { return Err(Errno::EIO) };
        let ttl = self.mutated(sent, &reply, &[id], |state| {
            let node = state.node(id);
            if size.is_some() {
                node.kernel_rev = Some(attr.rev);
            }
            node.attr = Some(attr.clone());
        });
        let ttl = if reply.cacheable { ttl.unwrap_or_default() } else { Duration::ZERO };
        let state = self.state.lock();
        Ok((self.visible(&state, &attr), ttl))
    }

    /// Applies a pushed invalidation; returns the kernel notifications to send before the ack.
    pub fn apply_remote(&self, items: &[Invalidation]) -> Vec<Kernel> {
        self.stats.local("pushed");
        self.state.lock().invalidate(items)
    }

    pub fn lose_lease(&self) -> Vec<Kernel> {
        let mut state = self.state.lock();
        state.lease_until = None;
        state.drop_all()
    }

    pub fn renewed(&self, until: Instant) {
        let mut state = self.state.lock();
        if state.lease_until.is_some() {
            state.lease_until = Some(until);
        }
    }

    /// Returns false when the kernel may still hold something it was told to drop.
    pub fn notify(&self, notifier: &Notifier, kernel: &[Kernel]) -> bool {
        let mut purged = true;
        for item in kernel {
            let result = match item {
                Kernel::Entry(parent, name) => notifier.inval_entry(self.ino(*parent), OsStr::new(name)),
                Kernel::Inode(id, offset, len) => notifier.inval_inode(self.ino(*id), *offset, *len),
            };
            match &result {
                Ok(()) => self.stats.local("notified"),
                // ENOENT: the kernel holds nothing for that inode or name.
                Err(e) if e.raw_os_error() == Some(libc::ENOENT) => self.stats.local("notified.absent"),
                Err(e) => {
                    eprintln!("kernel notification failed: {e}");
                    purged = false;
                }
            }
        }
        purged
    }

    /// Looks up `PROBE` at the root twice around an invalidation of it (served locally, with a TTL):
    /// a second lookup reaching us proves the kernel dropped the negative dentry.
    pub fn probe_negative(&self, notifier: &Notifier, mountpoint: &Path) {
        let path = mountpoint.join(PROBE);
        self.probing.store(true, Ordering::SeqCst);
        let _ = std::fs::symlink_metadata(&path);
        let _ = notifier.inval_entry(INodeNo(1), OsStr::new(PROBE));
        let _ = std::fs::symlink_metadata(&path);
        self.probing.store(false, Ordering::SeqCst);
        let _ = notifier.inval_entry(INodeNo(1), OsStr::new(PROBE));
        self.negative_ttl.store(self.probe_lookups.load(Ordering::SeqCst) == 2, Ordering::SeqCst);
    }

    pub fn negative_ttl(&self) -> bool {
        self.negative_ttl.load(Ordering::SeqCst)
    }

    /// Commits every buffered write (used before unmount).
    pub fn flush_all(&self) {
        if let Err(e) = self.barrier() {
            eprintln!("background commit failed: {e:?}");
        }
        let dirty: Vec<Id> = self.state.lock().nodes.iter().filter(|(_, n)| n.dirty.is_some()).map(|(id, _)| *id).collect();
        for id in dirty {
            let _ = self.flush_inode(id);
        }
    }
}

/// Shared handle given to the FUSE session.
pub struct Mount(pub Arc<Fs>);

impl Filesystem for Mount {
    fn init(&mut self, _req: &FuseRequest, config: &mut KernelConfig) -> std::io::Result<()> {
        config
            .add_capabilities(
                InitFlags::FUSE_DO_READDIRPLUS
                    | InitFlags::FUSE_READDIRPLUS_AUTO
                    | InitFlags::FUSE_PARALLEL_DIROPS
                    | InitFlags::FUSE_ATOMIC_O_TRUNC,
            )
            .map_err(|_| std::io::Error::other("required kernel capabilities unavailable"))?;
        let _ = config.add_capabilities(InitFlags::FUSE_EXPLICIT_INVAL_DATA | InitFlags::FUSE_CACHE_SYMLINKS);
        if let Err(max) = config.set_max_write(1 << 20) {
            let _ = config.set_max_write(max);
        }
        if let Err(max) = config.set_max_readahead(1 << 20) {
            let _ = config.set_max_readahead(max);
        }
        let _ = config.set_max_background(32);
        Ok(())
    }

    fn lookup(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        self.0.stats.local("op.lookup");
        let fs = &self.0;
        if parent.0 == 1 && name == PROBE && fs.probing.load(Ordering::SeqCst) {
            fs.probe_lookups.fetch_add(1, Ordering::SeqCst);
            return reply.entry(&Duration::from_secs(5), &fs.negative(), Generation(0));
        }
        let result = name_of(name).and_then(|name| fs.do_lookup(fs.id(parent), name));
        match result {
            Ok((Some(attr), ttl)) => reply.entry(&ttl, &attr, Generation(0)),
            Ok((None, ttl)) if ttl > Duration::ZERO && fs.negative_ttl.load(Ordering::SeqCst) => {
                reply.entry(&ttl, &fs.negative(), Generation(0))
            }
            Ok((None, _)) => reply.error(Errno::ENOENT),
            Err(e) => reply.error(e),
        }
    }

    fn getattr(&self, _req: &FuseRequest, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        self.0.stats.local("op.getattr");
        match self.0.do_getattr(self.0.id(ino)) {
            Ok((attr, ttl)) => reply.attr(&ttl, &attr),
            Err(e) => reply.error(e),
        }
    }

    fn setattr(
        &self,
        _req: &FuseRequest,
        ino: INodeNo,
        mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        _fh: Option<FileHandle>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        let fs = &self.0;
        let id = fs.id(ino);
        let mtime_ns = mtime.map(ns);
        // Deviation 1: an mtime-only change on an open regular file is buffered with its writes.
        if let (None, None, Some(mtime_ns)) = (mode, size, mtime_ns) {
            let mut state = fs.state.lock();
            let node = state.node(id);
            if node.open > 0 {
                node.dirty.get_or_insert_with(Dirty::default).mtime = Some(mtime_ns);
                fs.stats.local("setattr.mtime");
                if let (Some(attr), Some(ttl)) = (state.attr(id), state.ttl()) {
                    reply.attr(&ttl, &fs.visible(&state, attr));
                    return;
                }
                drop(state);
                match fs.do_getattr(id) {
                    Ok((attr, ttl)) => reply.attr(&ttl, &attr),
                    Err(e) => reply.error(e),
                }
                return;
            }
        }
        let result = if mode.is_none() && size.is_none() && mtime_ns.is_none() {
            fs.do_getattr(id)
        } else {
            fs.setattr_remote(id, mode, size, mtime_ns)
        };
        match result {
            Ok((attr, ttl)) => reply.attr(&ttl, &attr),
            Err(e) => reply.error(e),
        }
    }

    fn readlink(&self, _req: &FuseRequest, ino: INodeNo, reply: ReplyData) {
        let fs = &self.0;
        let id = fs.id(ino);
        {
            let state = fs.state.lock();
            if let (Some(link), Some(_)) = (state.nodes.get(&id).and_then(|n| n.link.clone()), state.ttl()) {
                reply.data(link.as_bytes());
                return;
            }
        }
        let (result, sent) = fs.call("readlink", Request::ReadLink { id });
        match result.result.clone() {
            Ok(Response::Link(link)) => {
                let mut state = fs.state.lock();
                if state.usable(sent, &result, [id]) {
                    state.node(id).link = Some(link.clone());
                }
                reply.data(link.as_bytes());
            }
            Ok(_) => reply.error(Errno::EIO),
            Err(e) => reply.error(errno(e)),
        }
    }

    fn mknod(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, _rdev: u32, reply: ReplyEntry) {
        if mode & libc::S_IFMT != libc::S_IFREG {
            reply.error(Errno::from_i32(libc::EOPNOTSUPP));
            return;
        }
        let fs = &self.0;
        let result = name_of(name).and_then(|name| fs.make(fs.id(parent), name, Kind::File, mode, true, None));
        fs.entry_reply(result, reply);
    }

    fn mkdir(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, reply: ReplyEntry) {
        let fs = &self.0;
        let result = name_of(name).and_then(|name| fs.make(fs.id(parent), name, Kind::Dir, mode, true, None));
        fs.entry_reply(result, reply);
    }

    fn unlink(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let fs = &self.0;
        match name_of(name).and_then(|name| fs.remove(fs.id(parent), name, false)) {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn rmdir(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let fs = &self.0;
        match name_of(name).and_then(|name| fs.remove(fs.id(parent), name, true)) {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn symlink(&self, _req: &FuseRequest, parent: INodeNo, link_name: &OsStr, target: &Path, reply: ReplyEntry) {
        let fs = &self.0;
        let result = match (name_of(link_name), target.to_str()) {
            (Ok(name), Some(target)) => fs.make(fs.id(parent), name, Kind::Symlink, 0o777, true, Some(target.to_string())),
            _ => Err(Errno::EINVAL),
        };
        fs.entry_reply(result, reply);
    }

    fn rename(
        &self,
        _req: &FuseRequest,
        parent: INodeNo,
        name: &OsStr,
        newparent: INodeNo,
        newname: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        let fs = &self.0;
        if flags.intersects(RenameFlags::RENAME_EXCHANGE | RenameFlags::RENAME_WHITEOUT) {
            reply.error(Errno::EINVAL);
            return;
        }
        let (Ok(name), Ok(newname)) = (name_of(name), name_of(newname)) else {
            reply.error(Errno::EINVAL);
            return;
        };
        let (parent, new_parent) = (fs.id(parent), fs.id(newparent));
        let request = Request::Rename {
            parent,
            name: name.to_string(),
            new_parent,
            new_name: newname.to_string(),
            no_replace: flags.contains(RenameFlags::RENAME_NOREPLACE),
        };
        let (result, sent) = fs.call("rename", request);
        if let Err(e) = result.result.clone() {
            reply.error(errno(e));
            return;
        }
        fs.mutated(sent, &result, &[parent, new_parent], |state| {
            let moved = state.node(parent).dir.as_mut().and_then(|d| d.names.insert(name.to_string(), None)).flatten();
            state.node(parent).attr = None;
            let target = state.node(new_parent);
            target.attr = None;
            let replaced = match (target.dir.as_mut(), moved) {
                (Some(dir), Some(id)) => dir.names.insert(newname.to_string(), Some(id)).flatten(),
                (Some(dir), None) => {
                    dir.complete = false;
                    dir.names.remove(newname).flatten()
                }
                (None, _) => None,
            };
            for id in [moved, replaced].into_iter().flatten() {
                state.node(id).attr = None;
            }
        });
        reply.ok();
    }

    fn open(&self, _req: &FuseRequest, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        self.0.stats.local("op.open");
        let fs = &self.0;
        let id = fs.id(ino);
        let attr = if flags.0 & libc::O_TRUNC != 0 {
            fs.setattr_remote(id, None, Some(0), None).map(|_| ())
        } else {
            Ok(())
        };
        let rev = attr.and_then(|_| {
            if let Some(attr) = fs.state.lock().attr(id) {
                return Ok(Some(attr.rev));
            }
            fs.do_getattr(id)?;
            Ok(fs.state.lock().attr(id).map(|a| a.rev))
        });
        match rev {
            Ok(rev) => {
                let (fh, flags) = fs.open_handle(id, rev, flags.0 & libc::O_ACCMODE == libc::O_RDONLY);
                reply.opened(fh, flags);
            }
            Err(e) => reply.error(e),
        }
    }

    fn read(
        &self,
        _req: &FuseRequest,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        self.0.stats.local("op.read");
        let fs = &self.0;
        let id = fs.id(ino);
        if let Err(e) = fs.flush_inode(id) {
            reply.error(e);
            return;
        }
        match fs.read_whole(id, offset) {
            Ok(Some(bytes)) => {
                let start = (offset as usize).min(bytes.len());
                reply.data(&bytes[start..start.saturating_add(size as usize).min(bytes.len())]);
                return;
            }
            Ok(None) => {}
            Err(e) => {
                reply.error(e);
                return;
            }
        }
        let (result, _) = fs.call("read", Request::Read { id, offset, len: size.min(MAX_IO_BYTES) });
        match result.result {
            Ok(Response::Data { bytes, .. }) => reply.data(&bytes),
            Ok(_) => reply.error(Errno::EIO),
            Err(e) => reply.error(errno(e)),
        }
    }

    fn write(
        &self,
        _req: &FuseRequest,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        let fs = &self.0;
        let id = fs.id(ino);
        let over = {
            let mut state = fs.state.lock();
            let dirty = state.node(id).dirty.get_or_insert_with(Dirty::default);
            let end = offset + data.len() as u64;
            match dirty.writes.last_mut() {
                Some((at, bytes)) if *at + bytes.len() as u64 == offset => bytes.extend_from_slice(data),
                _ => dirty.writes.push((offset, data.to_vec())),
            }
            if !data.is_empty() {
                dirty.blocks.extend(offset / BLOCK_BYTES..=(end - 1) / BLOCK_BYTES);
            }
            dirty.bytes += data.len();
            dirty.end = dirty.end.max(end);
            dirty.written_ns = now_ns();
            dirty.bytes >= DIRTY_BYTES || dirty.blocks.len() >= DIRTY_BLOCKS
        };
        fs.stats.local("write");
        if over && let Err(e) = fs.flush_inode(id) {
            reply.error(e);
            return;
        }
        reply.written(data.len() as u32);
    }

    fn flush(&self, _req: &FuseRequest, ino: INodeNo, _fh: FileHandle, _lock_owner: LockOwner, reply: ReplyEmpty) {
        self.0.stats.local("op.flush");
        match Fs::close_inode(&self.0, self.0.id(ino)) {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn release(
        &self,
        _req: &FuseRequest,
        ino: INodeNo,
        _fh: FileHandle,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        self.0.stats.local("op.release");
        let fs = &self.0;
        let id = fs.id(ino);
        let last = {
            let mut state = fs.state.lock();
            let node = state.node(id);
            node.open = node.open.saturating_sub(1);
            node.open == 0 && node.dirty.is_some()
        };
        // Buffered state left after the last close (e.g. utimensat after flush) is committed now.
        let result = if last { Fs::close_inode(fs, id) } else { Ok(()) };
        match result {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn fsync(&self, _req: &FuseRequest, ino: INodeNo, _fh: FileHandle, _datasync: bool, reply: ReplyEmpty) {
        match self.0.sync_inode(self.0.id(ino)) {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn opendir(&self, _req: &FuseRequest, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        self.0.stats.local("op.opendir");
        let fs = &self.0;
        let dir = fs.id(ino);
        // The kernel keeps a listing it cached under a lease while nothing changed it since; it then
        // never asks for one, so none is built.
        let kept = {
            let state = fs.state.lock();
            let node = state.nodes.get(&dir);
            state.ttl().is_some()
                && node.is_some_and(|n| n.kernel_listing && n.attr.is_some() && n.dir.as_ref().is_some_and(|d| d.complete))
        };
        if kept {
            fs.stats.local("opendir");
            let fh = fs.next_fh.fetch_add(1, Ordering::Relaxed);
            fs.dirs.lock().insert(fh, None);
            reply.opened(FileHandle(fh), FopenFlags::FOPEN_CACHE_DIR | FopenFlags::FOPEN_KEEP_CACHE);
            return;
        }
        match fs.snapshot(dir) {
            Ok((snapshot, complete)) => {
                // The kernel may cache a complete, lease-covered listing; remote changes purge it
                // (`notify_inval_inode` on the directory) and own changes reset it in the kernel.
                let mut flags = FopenFlags::empty();
                if complete && snapshot.generation.is_some() {
                    let mut state = fs.state.lock();
                    if state.fresh(snapshot.generation.unwrap_or_default(), [dir]) {
                        let node = state.node(dir);
                        flags = FopenFlags::FOPEN_CACHE_DIR;
                        if node.kernel_listing {
                            flags |= FopenFlags::FOPEN_KEEP_CACHE;
                        }
                        node.kernel_listing = true;
                    }
                }
                let fh = fs.next_fh.fetch_add(1, Ordering::Relaxed);
                fs.dirs.lock().insert(fh, Some(Arc::new(snapshot)));
                reply.opened(FileHandle(fh), flags);
            }
            Err(e) => reply.error(e),
        }
    }

    fn readdir(&self, _req: &FuseRequest, ino: INodeNo, fh: FileHandle, offset: u64, mut reply: ReplyDirectory) {
        self.0.stats.local("op.readdir");
        let fs = &self.0;
        let snapshot = match fs.listing(fs.id(ino), fh) {
            Ok(snapshot) => snapshot,
            Err(e) => {
                reply.error(e);
                return;
            }
        };
        let dots = [(".", ino, FileType::Directory), ("..", ino, FileType::Directory)];
        let all = dots.into_iter().chain(snapshot.listed.iter().map(|l| (l.name.as_str(), fs.ino(l.id), kind(l.attr.kind))));
        for (index, (name, child, file_type)) in all.enumerate().skip(offset as usize) {
            if reply.add(child, index as u64 + 1, file_type, name) {
                break;
            }
        }
        reply.ok();
    }

    fn readdirplus(&self, _req: &FuseRequest, ino: INodeNo, fh: FileHandle, offset: u64, mut reply: ReplyDirectoryPlus) {
        self.0.stats.local("op.readdirplus");
        let fs = &self.0;
        let snapshot = match fs.listing(fs.id(ino), fh) {
            Ok(snapshot) => snapshot,
            Err(e) => {
                reply.error(e);
                return;
            }
        };
        let state = fs.state.lock();
        // An entry changed since the snapshot is still listed, but never cached.
        let ttl = |id: Id| match snapshot.generation {
            Some(generation) if state.fresh(generation, [snapshot.dir.id, id]) => state.ttl().unwrap_or_default(),
            _ => Duration::ZERO,
        };
        let dir = fs.visible(&state, &snapshot.dir);
        let dots = [(".", dir), ("..", dir)];
        let all = dots.into_iter().chain(snapshot.listed.iter().map(|l| (l.name.as_str(), fs.visible(&state, &l.attr))));
        for (index, (name, attr)) in all.enumerate().skip(offset as usize) {
            let entry_ttl = if index < 2 { Duration::ZERO } else { ttl(fs.id(attr.ino)) };
            if reply.add(if index < 2 { ino } else { attr.ino }, index as u64 + 1, name, &entry_ttl, &attr, Generation(0)) {
                break;
            }
        }
        reply.ok();
    }

    fn releasedir(&self, _req: &FuseRequest, _ino: INodeNo, fh: FileHandle, _flags: OpenFlags, reply: ReplyEmpty) {
        self.0.stats.local("op.releasedir");
        self.0.dirs.lock().remove(&fh.0);
        reply.ok();
    }

    fn fsyncdir(&self, _req: &FuseRequest, _ino: INodeNo, _fh: FileHandle, _datasync: bool, reply: ReplyEmpty) {
        // Every namespace mutation is durable before it returns; this is the matched profile's
        // barrier for background close commits (fuser has no `syncfs`).
        match self.0.barrier() {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn statfs(&self, _req: &FuseRequest, _ino: INodeNo, reply: ReplyStatfs) {
        reply.statfs(1 << 32, 1 << 31, 1 << 31, 1 << 32, 1 << 31, BLOCK_BYTES as u32, 255, BLOCK_BYTES as u32);
    }

    fn getxattr(&self, _req: &FuseRequest, _ino: INodeNo, _name: &OsStr, _size: u32, reply: ReplyXattr) {
        // ENOSYS makes the kernel stop asking for the lifetime of the mount.
        reply.error(Errno::ENOSYS);
    }

    fn listxattr(&self, _req: &FuseRequest, _ino: INodeNo, _size: u32, reply: ReplyXattr) {
        reply.error(Errno::ENOSYS);
    }

    fn create(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, flags: i32, reply: ReplyCreate) {
        let fs = &self.0;
        let parent = fs.id(parent);
        let result = name_of(name).and_then(|name| fs.make(parent, name, Kind::File, mode, flags & libc::O_EXCL != 0, None));
        let result = result.and_then(|(attr, ttl, existed)| {
            if existed && flags & libc::O_TRUNC != 0 {
                let (truncated, ttl) = fs.setattr_remote(attr.id, None, Some(0), None)?;
                return Ok((attr.id, truncated, ttl, fs.state.lock().attr(attr.id).map(|a| a.rev)));
            }
            let state = fs.state.lock();
            let rev = state.attr(attr.id).map(|a| a.rev);
            Ok((attr.id, fs.visible(&state, &attr), ttl, rev))
        });
        match result {
            Ok((id, attr, ttl, rev)) => {
                let (fh, open_flags) = fs.open_handle(id, rev, false);
                reply.created(&ttl, &attr, Generation(0), fh, open_flags);
            }
            Err(e) => reply.error(e),
        }
    }
}
