//! FUSE adapter. The kernel caches nothing (TTL 0, direct I/O); this daemon serves from a cache
//! whose entries expire `budget.ttl` after their request was sent, overlaid with its own
//! acknowledged mutations, which the committer (`commit.rs`) applies within `budget.window`.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::ops::Bound;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dfs_proto::client::{Client, Reply};
use dfs_proto::{Attr, BLOCK_BYTES, Id, Kind, MAX_IO_BYTES, MAX_NAME_BYTES, Op, Request, Response};
use fuser::{
    AccessFlags, BsdFileFlags, Errno, FileAttr, FileHandle, FileType, Filesystem, FopenFlags, Generation, INodeNo, InitFlags,
    KernelConfig, LockOwner, OpenFlags, RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry,
    ReplyOpen, ReplyStatfs, ReplyWrite, ReplyXattr, Request as FuseRequest, TimeOrNow, WriteFlags,
};
use parking_lot::{Condvar, Mutex, MutexGuard};

use crate::state::{Budget, Listing, Local, Name, State};

/// Largest file a read miss fetches whole (with siblings); larger files are read by range.
const WHOLE_FILE: u64 = 1 << 20;
/// Largest sibling a read miss prefetches.
const SIBLING_FILE: u64 = 256 << 10;
/// Siblings the first read miss in a directory prefetches; later misses there prefetch up to
/// `MAX_WINDOW` (within the reply budget).
const MIN_WINDOW: usize = 16;
const MAX_WINDOW: usize = 256;
const PAGE: u32 = 16_384;
/// Directories up to this many entries are listed whole on a lookup miss.
const LIST_ON_MISS: usize = 4096;
/// Fetches a reply rejected by `own-commit-floor` is retried before it is served uncached.
const TRIES: usize = 3;
const NO_TTL: Duration = Duration::ZERO;

/// A file's id, content revision, and whole content.
type Fetched = (Id, u64, Arc<[u8]>);
/// A directory's entries and attribute, with the request send time and read version.
type FetchedListing = (Vec<dfs_proto::Entry>, Attr, Instant, u64);
/// A listing in this mount's view, with the send time of the request it came from.
type Snapshot = (Listing, Instant);

#[derive(Default)]
pub struct Stats {
    rpcs: Mutex<HashMap<&'static str, (u64, u128)>>,
    local: Mutex<HashMap<&'static str, u64>>,
}

impl Stats {
    pub fn rpc(&self, kind: &'static str, elapsed: Duration) {
        let mut rpcs = self.rpcs.lock();
        let entry = rpcs.entry(kind).or_default();
        entry.0 += 1;
        entry.1 += elapsed.as_micros();
    }

    fn local(&self, kind: &'static str) {
        *self.local.lock().entry(kind).or_default() += 1;
    }

    fn json(&self) -> (serde_json::Value, serde_json::Value) {
        let rpcs: serde_json::Map<String, serde_json::Value> = self
            .rpcs
            .lock()
            .iter()
            .map(|(k, (n, us))| (k.to_string(), serde_json::json!({ "calls": n, "total_ms": *us as f64 / 1000.0 })))
            .collect();
        let local: serde_json::Map<String, serde_json::Value> =
            self.local.lock().iter().map(|(k, n)| (k.to_string(), (*n).into())).collect();
        (rpcs.into(), local.into())
    }
}

/// What one open directory handle lists: entries after offset `base`, from data requested at
/// `stamp`.
struct DirHandle {
    entries: Vec<(String, Id, Kind)>,
    base: u64,
    stamp: Instant,
}

pub struct Fs {
    pub rt: tokio::runtime::Handle,
    pub client: Arc<Client>,
    pub stats: Stats,
    pub state: Mutex<State>,
    /// Signalled when a batch finishes.
    pub progress: Condvar,
    /// Wakes the committer.
    pub wake: tokio::sync::Notify,
    /// Signalled when a `ReadFiles` call ends.
    fetched: Condvar,
    root: Id,
    uid: u32,
    gid: u32,
    dirs: Mutex<HashMap<u64, DirHandle>>,
    next_fh: AtomicU64,
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
    let name = name.to_str().ok_or(Errno::EINVAL)?;
    if name.len() > MAX_NAME_BYTES {
        return Err(Errno::ENAMETOOLONG);
    }
    Ok(name)
}

fn mask(read: bool, write: bool, exec: bool) -> i32 {
    (if read { libc::R_OK } else { 0 }) | (if write { libc::W_OK } else { 0 }) | (if exec { libc::X_OK } else { 0 })
}

impl Fs {
    pub fn new(rt: tokio::runtime::Handle, client: Arc<Client>, root: Attr, owner: (u32, u32), budget: Budget) -> Self {
        let mut state = State::new(budget);
        let id = root.id;
        state.install_attr(root, Instant::now(), 0);
        Self {
            rt,
            client,
            stats: Stats::default(),
            state: Mutex::new(state),
            progress: Condvar::new(),
            wake: tokio::sync::Notify::new(),
            fetched: Condvar::new(),
            root: id,
            uid: owner.0,
            gid: owner.1,
            dirs: Mutex::default(),
            next_fh: AtomicU64::new(1),
        }
    }

    /// The kernel's root inode is 1; the mount root and object 1 swap numbers.
    fn ino(&self, id: Id) -> INodeNo {
        INodeNo(if id == self.root { 1 } else if id == 1 { self.root } else { id })
    }

    fn id(&self, ino: INodeNo) -> Id {
        if ino.0 == 1 { self.root } else if ino.0 == self.root { 1 } else { ino.0 }
    }

    fn call(&self, kind: &'static str, request: Request) -> (Reply, Instant) {
        let sent = Instant::now();
        let reply = self.rt.block_on(self.client.call(request));
        self.stats.rpc(kind, sent.elapsed());
        (reply, sent)
    }

    fn file_attr(&self, attr: &Attr) -> FileAttr {
        let mut perm = (attr.mode & 0o7777) as u16;
        if !attr.writable {
            perm &= !0o222;
        }
        FileAttr {
            ino: self.ino(attr.id),
            size: attr.size,
            blocks: attr.size.div_ceil(512),
            atime: time(attr.mtime_ns),
            mtime: time(attr.mtime_ns),
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

    /// @cc [owner:fontanierh,label:security] local-permissions
    /// The mount runs without `default_permissions`, so the kernel checks nothing: opening for
    /// writing and every namespace mutation MUST be refused here (EACCES) unless the object is
    /// `writable` for the session principal, and mode bits are honoured for non-root callers. The
    /// server re-checks grants at commit.
    fn allowed(&self, req: &FuseRequest, attr: &Attr, want: i32) -> bool {
        if want & libc::W_OK != 0 && !attr.writable {
            return false;
        }
        let mode = attr.mode as i32;
        if req.uid() == 0 {
            return want & libc::X_OK == 0 || attr.kind == Kind::Dir || mode & 0o111 != 0;
        }
        let bits = if req.uid() == self.uid {
            mode >> 6
        } else if req.gid() == self.gid {
            mode >> 3
        } else {
            mode
        } & 7;
        want & !bits & 7 == 0
    }

    /// Serves `view` from the state, else fetches, installs, and serves; a fetch that predates
    /// an own commit is retried and, after `TRIES`, served without being cached.
    fn resolve<T>(&self, view: impl Fn(&State) -> Option<T>, fetch: impl Fn() -> Result<(T, bool), Errno>) -> Result<T, Errno> {
        for attempt in 1..=TRIES {
            if let Some(value) = view(&self.state.lock()) {
                return Ok(value);
            }
            let (value, installed) = fetch()?;
            if installed || attempt == TRIES {
                return Ok(value);
            }
        }
        Err(Errno::EIO)
    }

    fn attr(&self, id: Id) -> Result<Attr, Errno> {
        self.resolve(
            |state| state.attr(id),
            || {
                let (reply, sent) = self.call("getattr", Request::GetAttr { id });
                let Response::Attr(attr) = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
                let installed = self.state.lock().install_attr(attr.clone(), sent, reply.version);
                Ok((attr, installed))
            },
        )
    }

    /// What `name` in `parent` names. A miss fetches the whole listing of `parent` (one RPC
    /// answers every later lookup there for the TTL) unless it is known to be large.
    fn name(&self, parent: Id, name: &str) -> Result<Name, Errno> {
        self.resolve(
            |state| state.name(parent, name),
            || {
                if self.state.lock().sizes.get(&parent).is_none_or(|n| *n <= LIST_ON_MISS)
                    && let Some(((listing, _), installed)) = self.fetch_listing_installed(parent, Some(LIST_ON_MISS))?
                {
                    return Ok((listing.get(name).copied(), installed));
                }
                let (reply, sent) = self.call("lookup", Request::Lookup { parent, name: name.to_string() });
                let Response::Entry(attr) = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
                let value = attr.as_ref().map(|a| (a.id, a.kind));
                let mut state = self.state.lock();
                let installed = state.install_name(parent, name, value, sent, reply.version);
                if let Some(attr) = attr {
                    state.install_attr(attr, sent, reply.version);
                }
                Ok((value, installed))
            },
        )
    }

    /// `dir`'s entries in this mount's view and the instant their server part was requested.
    fn listing(&self, dir: Id) -> Result<(Listing, Instant), Errno> {
        self.resolve(
            |state| state.listing(dir),
            || self.fetch_listing_installed(dir, None)?.ok_or(Errno::EIO),
        )
    }

    /// Fetches and installs `dir`'s listing; returns it in this mount's view, and whether it was
    /// installed. `None` when `dir` has more than `cap` entries.
    fn fetch_listing_installed(&self, dir: Id, cap: Option<usize>) -> Result<Option<(Snapshot, bool)>, Errno> {
        let Some((entries, dir_attr, sent, version)) = self.fetch_listing(dir, cap)? else {
            self.state.lock().sizes.insert(dir, usize::MAX);
            return Ok(None);
        };
        let mut state = self.state.lock();
        let mut listing = Listing::new();
        for entry in entries {
            listing.insert(entry.name.clone(), (entry.attr.id, entry.attr.kind));
            state.places.insert(entry.attr.id, (dir, entry.name));
            state.install_attr(entry.attr, sent, version);
        }
        state.install_attr(dir_attr, sent, version);
        state.sizes.insert(dir, listing.len());
        let installed = state.install_listing(dir, listing.clone(), sent, version);
        state.overlay_listing(dir, &mut listing);
        Ok(Some(((listing, sent), installed)))
    }

    /// Every page of `dir` at the version of its first page.
    /// `dir`'s entries at one version; `None` when there are more than `cap`.
    fn fetch_listing(&self, dir: Id, cap: Option<usize>) -> Result<Option<FetchedListing>, Errno> {
        'restart: for _ in 0..TRIES {
            let mut entries: Vec<dfs_proto::Entry> = Vec::new();
            let mut first: Option<(Instant, u64)> = None;
            loop {
                let after = entries.last().map(|e| e.name.clone());
                let at = first.map(|(_, version)| version);
                let limit = cap.map_or(PAGE, |cap| u32::try_from(cap).unwrap_or(PAGE).min(PAGE));
                let (reply, sent) = self.call("readdir", Request::ReadDir { dir, after, limit, at });
                let (dir_attr, page, more) = match reply.result {
                    Ok(Response::Listing { dir, entries, more }) => (dir, entries, more),
                    Ok(_) => return Err(Errno::EIO),
                    Err(e) if e == dfs_proto::Errno::EAGAIN && at.is_some() => continue 'restart,
                    Err(e) => return Err(errno(e)),
                };
                let (sent, version) = *first.get_or_insert((sent, reply.version));
                entries.extend(page);
                if !more {
                    return Ok(Some((entries, dir_attr, sent, version)));
                }
                if cap.is_some_and(|cap| entries.len() >= cap) {
                    return Ok(None);
                }
            }
        }
        Err(Errno::EAGAIN)
    }

    fn link(&self, id: Id) -> Result<String, Errno> {
        self.resolve(
            |state| state.link(id),
            || {
                let (reply, sent) = self.call("readlink", Request::ReadLink { id });
                let Response::Link(target) = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
                self.state.lock().install_link(id, target.clone(), sent, reply.version);
                Ok((target, true))
            },
        )
    }

    /// The whole content of small file `id` at its live revision, from the content cache or one
    /// `ReadFiles` call (which also prefetches siblings when the read starts at `offset` 0, as
    /// sequential readers do); `None` when it must be read by range.
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
        let ids = if offset == 0 { prefetch(&mut state, id, size) } else { vec![id] };
        state.content.fetching.extend(ids.iter().copied());
        drop(state);
        let (reply, _) = self.call("read_files", Request::ReadFiles { ids: ids.clone(), budget: MAX_IO_BYTES });
        let files: Result<Vec<Fetched>, Errno> = match reply.result {
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
        // Content is keyed by revision and only served under a live attribute of that revision.
        for (id, rev, bytes) in files {
            state.content.insert(id, rev, bytes);
        }
        Ok(demanded)
    }

    /// The whole content of `id` at one revision, with the attribute it was read under.
    fn materialize(&self, id: Id) -> Result<(Attr, Vec<u8>), Errno> {
        let attr = self.attr(id)?;
        if attr.kind != Kind::File {
            return Err(Errno::EISDIR);
        }
        if let Some(bytes) = self.state.lock().content.get(id, attr.rev) {
            return Ok((attr, bytes.to_vec()));
        }
        'restart: for _ in 0..TRIES {
            let mut bytes = Vec::new();
            let mut rev = None;
            loop {
                let (reply, _) = self.call("read", Request::Read { id, offset: bytes.len() as u64, len: MAX_IO_BYTES });
                let Response::Data { rev: at, size, bytes: chunk } = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
                if *rev.get_or_insert(at) != at {
                    continue 'restart;
                }
                let done = chunk.is_empty() || bytes.len() as u64 + chunk.len() as u64 >= size;
                bytes.extend(chunk);
                if done {
                    let mut attr = attr.clone();
                    attr.size = bytes.len() as u64;
                    attr.rev = at;
                    return Ok((attr, bytes));
                }
            }
        }
        Err(Errno::EAGAIN)
    }

    /// Waits until a new mutation may be acknowledged (`State::backlogged`).
    fn admit(&self, state: &mut MutexGuard<'_, State>) -> Result<(), Errno> {
        let mut waited = false;
        while state.backlogged() {
            if !self.client.is_connected() {
                return Err(Errno::EIO);
            }
            waited = true;
            self.wake.notify_one();
            self.progress.wait_for(state, Duration::from_millis(5));
        }
        if waited {
            self.stats.local("admission_waits");
        }
        Ok(())
    }

    fn new_id(&self) -> Result<Id, Errno> {
        if let Some(id) = self.state.lock().take_id() {
            return Ok(id);
        }
        let (reply, _) = self.call("alloc_ids", Request::AllocIds);
        let Response::Ids { first, count } = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
        let mut state = self.state.lock();
        state.ids = (first, first + Id::from(count));
        state.take_id().ok_or(Errno::EIO)
    }

    /// Runs `change` on `id`'s `Local` with its content image present (fetched unless `fresh`,
    /// which starts it empty), then accounts for what it buffered.
    fn with_image(&self, id: Id, fresh: bool, change: impl Fn(&mut Local, Instant, i64)) -> Result<(), Errno> {
        for _ in 0..TRIES {
            let present = {
                let mut state = self.state.lock();
                state.expire(id);
                state.locals.get(&id).is_some_and(|l| l.image.is_some())
            };
            let fetched = match (present, fresh) {
                (true, _) => None,
                (false, true) => Some((self.attr(id)?, Vec::new())),
                (false, false) => Some(self.materialize(id)?),
            };
            let mut state = self.state.lock();
            self.admit(&mut state)?;
            let local = match (state.locals.contains_key(&id), fetched) {
                (true, fetched) => {
                    let local = state.locals.get_mut(&id).ok_or(Errno::EIO)?;
                    if local.image.is_none() {
                        let Some((_, bytes)) = fetched else { continue };
                        local.image = Some(bytes);
                    }
                    local
                }
                (false, Some((attr, bytes))) => {
                    let local = state.local(attr);
                    local.image = Some(bytes);
                    local
                }
                (false, None) => continue,
            };
            if local.attr.kind != Kind::File {
                return Err(Errno::EISDIR);
            }
            let before = local.dirty_bytes;
            let had_dirty = !local.dirty.is_empty();
            change(local, Instant::now(), now_ns());
            let grown = local.dirty_bytes - before;
            let (dirty, over) = (!local.dirty.is_empty(), local.over());
            if dirty {
                state.mark_dirty(id, grown);
            }
            if over {
                state.seal(id);
            }
            if (dirty && !had_dirty) || over {
                self.wake.notify_one();
            }
            return Ok(());
        }
        Err(Errno::EAGAIN)
    }

    fn seal(&self, id: Id) {
        let mut state = self.state.lock();
        if state.locals.get(&id).is_some_and(|l| !l.dirty.is_empty()) {
            state.seal(id);
            self.wake.notify_one();
        }
    }

    /// Waits until every mutation acknowledged before the call has finished; reports the first
    /// op failure since the previous barrier.
    pub fn drain(&self) -> Result<(), Errno> {
        let mut state = self.state.lock();
        let dirty: Vec<Id> = state.log.dirty.iter().copied().collect();
        for id in dirty {
            state.seal(id);
        }
        let target = state.log.next;
        while state.log.done < target {
            if !self.client.is_connected() && !state.log.in_flight {
                return Err(Errno::EIO);
            }
            self.wake.notify_one();
            self.progress.wait_for(&mut state, Duration::from_millis(50));
        }
        state.log.failed.take().map_or(Ok(()), |e| Err(errno(e)))
    }

    /// The directory `parent`, checked writable and searchable by `req`.
    fn writable_dir(&self, req: &FuseRequest, parent: Id) -> Result<Attr, Errno> {
        let attr = self.attr(parent)?;
        if attr.kind != Kind::Dir {
            return Err(Errno::ENOTDIR);
        }
        if !self.allowed(req, &attr, mask(false, true, true)) {
            return Err(Errno::EACCES);
        }
        Ok(attr)
    }

    /// Binds the free `name` in `parent` to a new object, acknowledged before its commit.
    #[allow(clippy::too_many_arguments)]
    fn make(&self, req: &FuseRequest, parent: Id, name: &str, kind: Kind, mode: u32, target: Option<String>, writers: u32) -> Result<Attr, Errno> {
        self.writable_dir(req, parent)?;
        if self.name(parent, name)?.is_some() {
            return Err(Errno::EEXIST);
        }
        let id = self.new_id()?;
        let mut state = self.state.lock();
        self.admit(&mut state)?;
        if state.name(parent, name).flatten().is_some() {
            return Err(Errno::EEXIST);
        }
        let now = now_ns();
        let size = target.as_ref().map_or(0, |t| t.len() as u64);
        let attr = Attr { id, kind, mode: mode & 0o7777, size, mtime_ns: now, ctime_ns: now, rev: 1, writable: true };
        let local = state.local(attr.clone());
        local.unborn = true;
        local.writers = writers;
        local.target = target.clone();
        if kind == Kind::File {
            local.image = Some(Vec::new());
        }
        let op = Op::Create { parent, name: name.to_string(), id, kind, mode: mode & 0o7777, mtime_ns: now, target };
        state.push(op, Instant::now(), vec![(parent, name.to_string(), Some((id, kind)))]);
        state.places.insert(id, (parent, name.to_string()));
        drop(state);
        self.wake.notify_one();
        Ok(attr)
    }

    fn remove(&self, req: &FuseRequest, parent: Id, name: &str, dir: bool) -> Result<(), Errno> {
        self.writable_dir(req, parent)?;
        let (id, found) = self.name(parent, name)?.ok_or(Errno::ENOENT)?;
        match (dir, found) {
            (true, Kind::Dir) => {
                if !self.listing(id)?.0.is_empty() {
                    return Err(Errno::ENOTEMPTY);
                }
            }
            (true, _) => return Err(Errno::ENOTDIR),
            (false, Kind::Dir) => return Err(Errno::EISDIR),
            (false, _) => {}
        }
        let mut state = self.state.lock();
        self.admit(&mut state)?;
        if state.name(parent, name).is_some_and(|n| n.map(|(i, _)| i) != Some(id)) {
            return Err(Errno::ENOENT);
        }
        state.push(Op::Remove { parent, name: name.to_string(), id }, Instant::now(), vec![(parent, name.to_string(), None)]);
        drop(state);
        self.wake.notify_one();
        Ok(())
    }

    fn rename(&self, req: &FuseRequest, parent: Id, name: &str, new_parent: Id, new_name: &str, no_replace: bool) -> Result<(), Errno> {
        self.writable_dir(req, parent)?;
        self.writable_dir(req, new_parent)?;
        let (id, moved) = self.name(parent, name)?.ok_or(Errno::ENOENT)?;
        if let Some((replaced, kind)) = self.name(new_parent, new_name)? {
            if replaced == id {
                return Ok(());
            }
            if no_replace {
                return Err(Errno::EEXIST);
            }
            match (moved, kind) {
                (Kind::Dir, Kind::Dir) => {
                    if !self.listing(replaced)?.0.is_empty() {
                        return Err(Errno::ENOTEMPTY);
                    }
                }
                (Kind::Dir, _) => return Err(Errno::ENOTDIR),
                (_, Kind::Dir) => return Err(Errno::EISDIR),
                _ => {}
            }
        }
        let mut state = self.state.lock();
        self.admit(&mut state)?;
        if state.name(parent, name).is_some_and(|n| n.map(|(i, _)| i) != Some(id)) {
            return Err(Errno::ENOENT);
        }
        let op = Op::Rename { parent, name: name.to_string(), id, new_parent, new_name: new_name.to_string(), no_replace };
        let names = vec![(parent, name.to_string(), None), (new_parent, new_name.to_string(), Some((id, moved)))];
        state.push(op, Instant::now(), names);
        state.places.insert(id, (new_parent, new_name.to_string()));
        drop(state);
        self.wake.notify_one();
        Ok(())
    }

    fn set_attr(&self, id: Id, mode: Option<u32>, mtime_ns: Option<i64>) -> Result<(), Errno> {
        let attr = self.attr(id)?;
        let mut state = self.state.lock();
        self.admit(&mut state)?;
        let local = state.local(attr);
        if let Some(mode) = mode {
            local.attr.mode = mode;
        }
        if let Some(mtime) = mtime_ns {
            local.attr.mtime_ns = mtime;
        }
        local.attr.ctime_ns = now_ns();
        state.set_attr(id, mode, mtime_ns, Instant::now());
        drop(state);
        self.wake.notify_one();
        Ok(())
    }

    /// Opens `id` for writing: counts the writer and loads (or, truncating, empties) its image.
    fn open_writer(&self, id: Id, truncate: bool) -> Result<(), Errno> {
        self.with_image(id, truncate, |local, now, now_ns| {
            local.writers += 1;
            if truncate && (local.attr.size > 0 || !local.dirty.is_empty()) {
                local.truncate(0, now, now_ns);
            }
        })
    }

    fn release_writer(&self, id: Id) {
        let mut state = self.state.lock();
        if let Some(local) = state.locals.get_mut(&id) {
            local.writers = local.writers.saturating_sub(1);
        }
        state.seal(id);
        state.release_local(id);
        drop(state);
        self.wake.notify_one();
    }

    pub fn stats_json(&self) -> serde_json::Value {
        let (rpcs, local) = self.stats.json();
        let state = self.state.lock();
        let commit = state.log.stats;
        let ms = |d: Duration| d.as_secs_f64() * 1000.0;
        serde_json::json!({
            "message": "mount totals",
            "rpcs": rpcs,
            "local": local,
            "budget": { "window_ms": ms(state.budget.window), "ttl_ms": ms(state.budget.ttl) },
            "commit": {
                "batches": commit.batches,
                "ops": commit.ops,
                "dropped_ops": commit.dropped,
                "missed_windows": commit.missed,
                "max_lag_ms": ms(commit.max_lag),
                "apply_ms": ms(commit.apply),
                "max_apply_ms": ms(commit.max_apply),
            },
        })
    }
}

/// `id` followed by the siblings whose content a read miss of `id` should prefetch: small files
/// with live attributes, not cached or being fetched, in its directory's cached listing order from
/// `id` on, wrapping around (parallel walkers do not read in listing order).
fn prefetch(state: &mut State, id: Id, size: u64) -> Vec<Id> {
    let mut ids = vec![id];
    let Some((parent, name)) = state.places.get(&id).cloned() else { return ids };
    let window = if state.windows.contains_key(&parent) { MAX_WINDOW } else { MIN_WINDOW };
    state.windows.insert(parent, window);
    let Some((listing, _)) = state.listing(parent) else { return ids };
    let mut left = u64::from(MAX_IO_BYTES).saturating_sub(size);
    let after = listing.range::<str, _>((Bound::Excluded(name.as_str()), Bound::Unbounded));
    let before = listing.range::<str, _>((Bound::Unbounded, Bound::Excluded(name.as_str())));
    for (_, (sibling, _)) in after.chain(before) {
        if ids.len() > window {
            break;
        }
        if state.locals.contains_key(sibling) {
            continue;
        }
        let Some(attr) = state.attr(*sibling).filter(|a| a.kind == Kind::File && a.size <= SIBLING_FILE.min(left)) else { continue };
        if state.content.get(*sibling, attr.rev).is_none() && !state.content.fetching.contains(sibling) {
            left -= attr.size;
            ids.push(*sibling);
        }
    }
    ids
}

pub struct Mount(pub Arc<Fs>);

impl Filesystem for Mount {
    fn init(&mut self, _req: &FuseRequest, config: &mut KernelConfig) -> std::io::Result<()> {
        config
            .add_capabilities(InitFlags::FUSE_PARALLEL_DIROPS | InitFlags::FUSE_ATOMIC_O_TRUNC)
            .map_err(|_| std::io::Error::other("required kernel capabilities unavailable"))?;
        if let Err(max) = config.set_max_write(1 << 20) {
            let _ = config.set_max_write(max);
        }
        let _ = config.set_max_background(32);
        Ok(())
    }

    fn lookup(&self, _req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        self.0.stats.local("op.lookup");
        let fs = &self.0;
        let parent = fs.id(parent);
        let result = name_of(name).and_then(|name| {
            let (id, _) = fs.name(parent, name)?.ok_or(Errno::ENOENT)?;
            let attr = fs.attr(id)?;
            let mut state = fs.state.lock();
            if state.places.get(&id).is_none_or(|(p, n)| *p != parent || n != name) {
                state.places.insert(id, (parent, name.to_string()));
            }
            Ok(attr)
        });
        match result {
            Ok(attr) => reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)),
            Err(e) => reply.error(e),
        }
    }

    fn getattr(&self, _req: &FuseRequest, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        self.0.stats.local("op.getattr");
        match self.0.attr(self.0.id(ino)) {
            Ok(attr) => reply.attr(&NO_TTL, &self.0.file_attr(&attr)),
            Err(e) => reply.error(e),
        }
    }

    fn setattr(
        &self,
        req: &FuseRequest,
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
        self.0.stats.local("op.setattr");
        let fs = &self.0;
        let id = fs.id(ino);
        let result = (|| {
            let attr = fs.attr(id)?;
            if (mode.is_some() || size.is_some() || mtime.is_some()) && !attr.writable {
                return Err(Errno::EACCES);
            }
            if let Some(size) = size {
                if attr.kind == Kind::Dir {
                    return Err(Errno::EISDIR);
                }
                if size > dfs_proto::MAX_FILE_BYTES {
                    return Err(Errno::EFBIG);
                }
                fs.with_image(id, size == 0, |local, now, now_ns| local.truncate(size, now, now_ns))?;
            }
            if mode.is_some() || mtime.is_some() {
                fs.set_attr(id, mode.map(|m| m & 0o7777), mtime.map(ns))?;
            }
            fs.attr(id)
        })();
        let _ = req;
        match result {
            Ok(attr) => reply.attr(&NO_TTL, &fs.file_attr(&attr)),
            Err(e) => reply.error(e),
        }
    }

    fn readlink(&self, _req: &FuseRequest, ino: INodeNo, reply: ReplyData) {
        match self.0.link(self.0.id(ino)) {
            Ok(target) => reply.data(target.as_bytes()),
            Err(e) => reply.error(e),
        }
    }

    fn mknod(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, _rdev: u32, reply: ReplyEntry) {
        if mode & libc::S_IFMT != libc::S_IFREG {
            reply.error(Errno::from_i32(libc::EOPNOTSUPP));
            return;
        }
        let fs = &self.0;
        match name_of(name).and_then(|name| fs.make(req, fs.id(parent), name, Kind::File, mode, None, 0)) {
            Ok(attr) => reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)),
            Err(e) => reply.error(e),
        }
    }

    fn mkdir(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, reply: ReplyEntry) {
        self.0.stats.local("op.mkdir");
        let fs = &self.0;
        match name_of(name).and_then(|name| fs.make(req, fs.id(parent), name, Kind::Dir, mode, None, 0)) {
            Ok(attr) => reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)),
            Err(e) => reply.error(e),
        }
    }

    fn unlink(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.0.stats.local("op.unlink");
        let fs = &self.0;
        match name_of(name).and_then(|name| fs.remove(req, fs.id(parent), name, false)) {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn rmdir(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.0.stats.local("op.rmdir");
        let fs = &self.0;
        match name_of(name).and_then(|name| fs.remove(req, fs.id(parent), name, true)) {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn symlink(&self, req: &FuseRequest, parent: INodeNo, link_name: &OsStr, target: &Path, reply: ReplyEntry) {
        let fs = &self.0;
        let result = match (name_of(link_name), target.to_str()) {
            (Ok(name), Some(target)) => fs.make(req, fs.id(parent), name, Kind::Symlink, 0o777, Some(target.to_string()), 0),
            (Err(e), _) => Err(e),
            _ => Err(Errno::EINVAL),
        };
        match result {
            Ok(attr) => reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)),
            Err(e) => reply.error(e),
        }
    }

    fn rename(
        &self,
        req: &FuseRequest,
        parent: INodeNo,
        name: &OsStr,
        newparent: INodeNo,
        newname: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        self.0.stats.local("op.rename");
        let fs = &self.0;
        if flags.intersects(RenameFlags::RENAME_EXCHANGE | RenameFlags::RENAME_WHITEOUT) {
            reply.error(Errno::EINVAL);
            return;
        }
        let result = name_of(name).and_then(|name| {
            let newname = name_of(newname)?;
            fs.rename(req, fs.id(parent), name, fs.id(newparent), newname, flags.contains(RenameFlags::RENAME_NOREPLACE))
        });
        match result {
            Ok(()) => reply.ok(),
            Err(e) => reply.error(e),
        }
    }

    fn open(&self, req: &FuseRequest, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        self.0.stats.local("op.open");
        let fs = &self.0;
        let id = fs.id(ino);
        let accmode = flags.0 & libc::O_ACCMODE;
        let write = accmode != libc::O_RDONLY;
        let result = (|| {
            let attr = fs.attr(id)?;
            if !fs.allowed(req, &attr, mask(accmode != libc::O_WRONLY, write, false)) {
                return Err(Errno::EACCES);
            }
            if write {
                fs.open_writer(id, flags.0 & libc::O_TRUNC != 0)?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                let mut open = FopenFlags::FOPEN_DIRECT_IO;
                if !write {
                    open |= FopenFlags::FOPEN_NOFLUSH;
                }
                reply.opened(FileHandle(0), open);
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
        let slice = |bytes: &[u8]| {
            let start = (offset as usize).min(bytes.len());
            bytes[start..start.saturating_add(size as usize).min(bytes.len())].to_vec()
        };
        let local = fs.state.lock().visible(id).and_then(|l| l.image.as_deref().map(slice));
        if let Some(bytes) = local {
            reply.data(&bytes);
            return;
        }
        match fs.read_whole(id, offset) {
            Ok(Some(bytes)) => {
                reply.data(&slice(&bytes));
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
        self.0.stats.local("op.write");
        let fs = &self.0;
        if offset.saturating_add(data.len() as u64) > dfs_proto::MAX_FILE_BYTES {
            reply.error(Errno::EFBIG);
            return;
        }
        match fs.with_image(fs.id(ino), false, |local, now, now_ns| local.write(offset, data, now, now_ns)) {
            Ok(()) => reply.written(data.len() as u32),
            Err(e) => reply.error(e),
        }
    }

    fn flush(&self, _req: &FuseRequest, ino: INodeNo, _fh: FileHandle, _lock_owner: LockOwner, reply: ReplyEmpty) {
        self.0.stats.local("op.flush");
        self.0.seal(self.0.id(ino));
        reply.ok();
    }

    fn release(
        &self,
        _req: &FuseRequest,
        ino: INodeNo,
        _fh: FileHandle,
        flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        self.0.stats.local("op.release");
        if flags.0 & libc::O_ACCMODE != libc::O_RDONLY {
            self.0.release_writer(self.0.id(ino));
        }
        reply.ok();
    }

    fn fsync(&self, _req: &FuseRequest, ino: INodeNo, _fh: FileHandle, _datasync: bool, reply: ReplyEmpty) {
        // Buffered: sealed into the next batch, committed within the window, not durable on return.
        self.0.stats.local("op.fsync");
        self.0.seal(self.0.id(ino));
        reply.ok();
    }

    fn opendir(&self, req: &FuseRequest, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        self.0.stats.local("op.opendir");
        let fs = &self.0;
        let dir = fs.id(ino);
        let result = (|| {
            let attr = fs.attr(dir)?;
            if attr.kind != Kind::Dir {
                return Err(Errno::ENOTDIR);
            }
            if !fs.allowed(req, &attr, libc::R_OK) {
                return Err(Errno::EACCES);
            }
            let (listing, stamp) = fs.listing(dir)?;
            let entries = listing.into_iter().map(|(name, (id, kind))| (name, id, kind)).collect();
            Ok(DirHandle { entries, base: 2, stamp })
        })();
        match result {
            Ok(handle) => {
                let fh = fs.next_fh.fetch_add(1, Ordering::Relaxed);
                fs.dirs.lock().insert(fh, handle);
                reply.opened(FileHandle(fh), FopenFlags::empty());
            }
            Err(e) => reply.error(e),
        }
    }

    fn readdir(&self, _req: &FuseRequest, ino: INodeNo, fh: FileHandle, offset: u64, mut reply: ReplyDirectory) {
        self.0.stats.local("op.readdir");
        let fs = &self.0;
        let dir = fs.id(ino);
        let ttl = fs.state.lock().budget.ttl;
        // A handle whose listing outlived the TTL is rebuilt, resuming after the last name listed.
        let stale = fs.dirs.lock().get(&fh.0).map(|h| {
            let resume = offset.checked_sub(h.base + 1).and_then(|i| h.entries.get(i as usize)).map(|e| e.0.clone());
            (h.stamp.elapsed() >= ttl && offset >= h.base, resume)
        });
        let Some((stale, resume)) = stale else {
            reply.error(Errno::EBADF);
            return;
        };
        if stale {
            match fs.listing(dir) {
                Ok((listing, stamp)) => {
                    let after = match &resume {
                        Some(name) => listing.range::<str, _>((Bound::Excluded(name.as_str()), Bound::Unbounded)),
                        None => listing.range::<str, _>(..),
                    };
                    let entries = after.map(|(name, (id, kind))| (name.clone(), *id, *kind)).collect();
                    fs.dirs.lock().insert(fh.0, DirHandle { entries, base: offset.max(2), stamp });
                }
                Err(e) => {
                    reply.error(e);
                    return;
                }
            }
        }
        let dirs = fs.dirs.lock();
        let Some(handle) = dirs.get(&fh.0) else {
            reply.error(Errno::EBADF);
            return;
        };
        let dots = [(1, ".", ino, FileType::Directory), (2, "..", ino, FileType::Directory)];
        let listed = handle
            .entries
            .iter()
            .enumerate()
            .map(|(i, (name, id, k))| (handle.base + i as u64 + 1, name.as_str(), fs.ino(*id), kind(*k)));
        for (next, name, child, file_type) in dots.into_iter().chain(listed) {
            if next <= offset {
                continue;
            }
            if reply.add(child, next, file_type, name) {
                break;
            }
        }
        reply.ok();
    }

    fn releasedir(&self, _req: &FuseRequest, _ino: INodeNo, fh: FileHandle, _flags: OpenFlags, reply: ReplyEmpty) {
        self.0.dirs.lock().remove(&fh.0);
        reply.ok();
    }

    fn fsyncdir(&self, _req: &FuseRequest, _ino: INodeNo, _fh: FileHandle, _datasync: bool, reply: ReplyEmpty) {
        // The drain barrier (fuser has no `syncfs`): every mutation acknowledged before it has
        // committed when it returns.
        self.0.stats.local("op.fsyncdir");
        match self.0.drain() {
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

    fn access(&self, req: &FuseRequest, ino: INodeNo, mask: AccessFlags, reply: ReplyEmpty) {
        self.0.stats.local("op.access");
        match self.0.attr(self.0.id(ino)) {
            Ok(attr) if self.0.allowed(req, &attr, mask.bits()) => reply.ok(),
            Ok(_) => reply.error(Errno::EACCES),
            Err(e) => reply.error(e),
        }
    }

    fn create(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, flags: i32, reply: ReplyCreate) {
        self.0.stats.local("op.create");
        let fs = &self.0;
        let parent = fs.id(parent);
        let write = flags & libc::O_ACCMODE != libc::O_RDONLY;
        let result = name_of(name).and_then(|name| match fs.make(req, parent, name, Kind::File, mode, None, u32::from(write)) {
            Err(e) if e == Errno::EEXIST && flags & libc::O_EXCL == 0 => {
                // Lost a race with another creator of `name`: open what is there.
                let (id, _) = fs.name(parent, name)?.ok_or(Errno::ENOENT)?;
                let attr = fs.attr(id)?;
                if attr.kind == Kind::Dir {
                    return Err(Errno::EISDIR);
                }
                if !fs.allowed(req, &attr, mask(!write || flags & libc::O_ACCMODE == libc::O_RDWR, write, false)) {
                    return Err(Errno::EACCES);
                }
                if write {
                    fs.open_writer(id, flags & libc::O_TRUNC != 0)?;
                }
                fs.attr(id)
            }
            result => result,
        });
        match result {
            Ok(attr) => reply.created(&NO_TTL, &fs.file_attr(&attr), Generation(0), FileHandle(0), FopenFlags::FOPEN_DIRECT_IO),
            Err(e) => reply.error(e),
        }
    }
}
