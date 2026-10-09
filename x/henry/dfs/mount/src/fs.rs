//! FUSE adapter. The kernel caches nothing (TTL 0, direct I/O); this daemon serves from a cache
//! whose entries expire `budget.ttl` after their request was sent, overlaid with its own
//! acknowledged mutations, which the committer (`commit.rs`) applies within `budget.window`.

use std::cell::Cell;
use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::ops::Bound;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dfs_proto::client::{Client, Reply};
use dfs_proto::{Attr, BLOCK_BYTES, Id, Kind, MAX_IO_BYTES, MAX_NAME_BYTES, Op, Request, Response, Token};
use fuser::{
    AccessFlags, BsdFileFlags, Errno, FileAttr, FileHandle, FileType, Filesystem, FopenFlags, Generation, INodeNo, InitFlags,
    KernelConfig, LockOwner, OpenFlags, RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry,
    ReplyOpen, ReplyStatfs, ReplyWrite, ReplyXattr, Request as FuseRequest, TimeOrNow, WriteFlags,
};
use parking_lot::{Condvar, Mutex, MutexGuard};

use crate::state::{Budget, Listing, Local, Name, State};

/// Largest file a read miss fetches whole (with siblings); larger files are read by range.
const WHOLE_FILE: u64 = 1 << 20;
/// Blocks a range-read miss of a large file fetches, starting at the first block it needs.
const RANGE_BLOCKS: u64 = 16;
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

thread_local! {
    /// Set while a request runs on the FUSE thread and may still be deferred (`Mount::serve`).
    static INLINE: Cell<bool> = const { Cell::new(false) };
}

/// The error a blocking point returns on the FUSE thread before any side effect; `Mount::serve`
/// then reruns the request on the worker pool. Never sent to the kernel.
fn deferred() -> Errno {
    Errno::from_i32(libc::ERESTART)
}

/// Fails with `deferred()` when the request runs inline and may still be deferred.
fn may_block() -> Result<(), Errno> {
    if INLINE.get() { Err(deferred()) } else { Ok(()) }
}

/// The current request has taken effect: its later blocking points wait in place.
fn effective() {
    INLINE.set(false);
}

/// The identity a request runs as.
#[derive(Clone, Copy)]
struct Caller {
    uid: u32,
    gid: u32,
}

impl Caller {
    fn of(req: &FuseRequest) -> Self {
        Self { uid: req.uid(), gid: req.gid() }
    }
}

/// A file's id, content revision, and whole content.
type Fetched = (Id, u64, Arc<[u8]>);
/// A directory's entries and attribute, with the request send time and read version.
type FetchedListing = (Vec<dfs_proto::Entry>, Attr, Instant, u64, Token);
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
    /// Signalled when a `Validate` call ends.
    validated: Condvar,
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
    pub fn new(rt: tokio::runtime::Handle, client: Arc<Client>, root: Attr, owner: (u32, u32), budget: Budget, revalidate: bool, content_bytes: usize) -> Self {
        let mut state = State::new(budget, revalidate, content_bytes);
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
            validated: Condvar::new(),
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

    fn call(&self, kind: &'static str, request: Request) -> Result<(Reply, Instant), Errno> {
        may_block()?;
        let sent = Instant::now();
        let reply = self.rt.block_on(self.client.call(request));
        self.stats.rpc(kind, sent.elapsed());
        Ok((reply, sent))
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
    fn allowed(&self, caller: Caller, attr: &Attr, want: i32) -> bool {
        if want & libc::W_OK != 0 && !attr.writable {
            return false;
        }
        let mode = attr.mode as i32;
        if caller.uid == 0 {
            return want & libc::X_OK == 0 || attr.kind == Kind::Dir || mode & 0o111 != 0;
        }
        let bits = if caller.uid == self.uid {
            mode >> 6
        } else if caller.gid == self.gid {
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
        self.attr_stamped(id).map(|(attr, _)| attr)
    }

    fn attr_stamped(&self, id: Id) -> Result<(Attr, Instant), Errno> {
        self.resolve(
            |state| state.attr_stamped(id),
            || {
                let (reply, sent) = self.call("getattr", Request::GetAttr { id })?;
                let Response::Attr(attr) = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
                let installed = self.state.lock().install_attr(attr.clone(), sent, reply.version);
                Ok(((attr, sent), installed))
            },
        )
    }

    /// What `name` in `parent` names. A miss fetches the whole listing of `parent` (one RPC
    /// answers every later lookup there for the TTL) unless it is known to be large.
    fn name(&self, parent: Id, name: &str) -> Result<Name, Errno> {
        self.resolve(
            |state| state.name(parent, name),
            || {
                self.revalidate(parent)?;
                if let Some(value) = self.state.lock().name(parent, name) {
                    return Ok((value, true));
                }
                if self.state.lock().sizes.get(&parent).is_none_or(|n| *n <= LIST_ON_MISS)
                    && let Some(((listing, _), installed)) = self.fetch_listing_installed(parent, Some(LIST_ON_MISS))?
                {
                    return Ok((listing.get(name).copied(), installed));
                }
                let (reply, sent) = self.call("lookup", Request::Lookup { parent, name: name.to_string() })?;
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
            || {
                self.revalidate(dir)?;
                if let Some(listing) = self.state.lock().listing(dir) {
                    return Ok((listing, true));
                }
                self.fetch_listing_installed(dir, None)?.ok_or(Errno::EIO)
            },
        )
    }

    /// With revalidation on and `dir`'s listing expired but stored, checks it and other expired
    /// stored listings (`State::revalidation`) with one `Validate` call and reinstalls the current
    /// ones; waits instead while another call is in flight.
    fn revalidate(&self, dir: Id) -> Result<(), Errno> {
        let mut state = self.state.lock();
        while state.validating {
            may_block()?;
            self.validated.wait(&mut state);
        }
        let dirs = state.revalidation(dir);
        if dirs.is_empty() {
            return Ok(());
        }
        // Before `validating` is set: a deferral after it would leave it set for good.
        may_block()?;
        state.validating = true;
        drop(state);
        let (reply, sent) = self.call("validate", Request::Validate { dirs: dirs.clone() })?;
        let mut state = self.state.lock();
        state.validating = false;
        self.validated.notify_all();
        let valid = match reply.result.map_err(errno)? {
            Response::Valid(valid) if valid.len() == dirs.len() => valid,
            _ => return Err(Errno::EIO),
        };
        for ((id, token), valid) in dirs.into_iter().zip(valid) {
            state.revalidated(id, token, valid, sent, reply.version);
        }
        Ok(())
    }

    /// Fetches and installs `dir`'s listing; returns it in this mount's view, and whether it was
    /// installed. `None` when `dir` has more than `cap` entries.
    fn fetch_listing_installed(&self, dir: Id, cap: Option<usize>) -> Result<Option<(Snapshot, bool)>, Errno> {
        let Some((entries, dir_attr, sent, version, token)) = self.fetch_listing(dir, cap)? else {
            self.state.lock().sizes.insert(dir, usize::MAX);
            return Ok(None);
        };
        let mut state = self.state.lock();
        let stored = state.revalidate.then(|| (dir_attr.clone(), entries.clone()));
        let (listing, installed) = state.install_entries(dir_attr, entries, sent, version);
        if installed && let Some((dir_attr, entries)) = stored {
            state.store_listing(dir_attr, entries, token);
        }
        Ok(Some(((listing, sent), installed)))
    }

    /// `dir`'s entries at one version; `None` when there are more than `cap`.
    fn fetch_listing(&self, dir: Id, cap: Option<usize>) -> Result<Option<FetchedListing>, Errno> {
        'restart: for _ in 0..TRIES {
            let mut entries: Vec<dfs_proto::Entry> = Vec::new();
            // The token is read with the first page, at the version every page is read at.
            let mut first: Option<(Instant, u64, Token)> = None;
            loop {
                let after = entries.last().map(|e| e.name.clone());
                let at = first.map(|(_, version, _)| version);
                let limit = cap.map_or(PAGE, |cap| u32::try_from(cap).unwrap_or(PAGE).min(PAGE));
                let (reply, sent) = self.call("readdir", Request::ReadDir { dir, after, limit, at })?;
                let (dir_attr, page, more, token) = match reply.result {
                    Ok(Response::Listing { dir, entries, more, token }) => (dir, entries, more, token),
                    Ok(_) => return Err(Errno::EIO),
                    Err(e) if e == dfs_proto::Errno::EAGAIN && at.is_some() => continue 'restart,
                    Err(e) => return Err(errno(e)),
                };
                let (sent, version, token) = *first.get_or_insert((sent, reply.version, token));
                entries.extend(page);
                if !more {
                    return Ok(Some((entries, dir_attr, sent, version, token)));
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
                let (reply, sent) = self.call("readlink", Request::ReadLink { id })?;
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
            let Some(attr) = state.server_attr(id).filter(|a| a.size <= WHOLE_FILE) else { return Ok(None) };
            if let Some(bytes) = state.content.get(id, attr.rev) {
                drop(state);
                self.stats.local("read");
                return Ok(Some(bytes));
            }
            if !state.content.fetching.contains(&id) {
                break attr.size;
            }
            may_block()?;
            self.fetched.wait(&mut state);
        };
        // Before `fetching` is marked: a deferral after it would leave the mark for good.
        may_block()?;
        let ids = if offset == 0 { prefetch(&mut state, id, size) } else { vec![id] };
        state.content.fetching.extend(ids.iter().copied());
        drop(state);
        let (reply, _) = self.call("read_files", Request::ReadFiles { ids: ids.clone(), budget: MAX_IO_BYTES })?;
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
            state.observe_rev(id, rev);
            state.content.insert(id, rev, bytes);
        }
        Ok(demanded)
    }

    /// `len` bytes of large file `id` at `offset`: from cached blocks of its live revision, or one
    /// `Read` of `RANGE_BLOCKS` blocks (at least the range) whose blocks are then cached
    /// (`content-under-live-rev`). An expired attribute is fetched again first.
    fn read_range(&self, id: Id, offset: u64, len: u32) -> Result<Vec<u8>, Errno> {
        let live = self.state.lock().server_attr(id);
        let attr = match live {
            Some(attr) => Some(attr),
            None => {
                self.attr(id)?;
                self.state.lock().server_attr(id)
            }
        };
        let first = offset / BLOCK_BYTES;
        if let Some(attr) = &attr {
            let end = attr.size.min(offset.saturating_add(u64::from(len)));
            if offset >= end {
                return Ok(Vec::new());
            }
            let state = self.state.lock();
            let blocks: Option<Vec<_>> = (first..=(end - 1) / BLOCK_BYTES).map(|i| state.content.block(id, attr.rev, i)).collect();
            if let Some(blocks) = blocks {
                drop(state);
                self.stats.local("read");
                let mut bytes = vec![0; (end - offset) as usize];
                for (i, block) in (first..).zip(blocks) {
                    copy_block(&mut bytes, offset, &block, i * BLOCK_BYTES);
                }
                return Ok(bytes);
            }
        }
        let start = first * BLOCK_BYTES;
        // Whole blocks only: a block shorter than `BLOCK_BYTES` is then always the file's last.
        let want = (offset + u64::from(len) - start).max(RANGE_BLOCKS * BLOCK_BYTES).next_multiple_of(BLOCK_BYTES).min(u64::from(MAX_IO_BYTES));
        let (reply, _) = self.call("read", Request::Read { id, offset: start, len: want as u32 })?;
        let Response::Data { rev, bytes, .. } = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
        let mut state = self.state.lock();
        state.observe_rev(id, rev);
        if reply.version >= state.floor(id) {
            for (i, block) in (first..).zip(bytes.chunks(BLOCK_BYTES as usize)) {
                state.content.insert_block(id, rev, i, block.into());
            }
        }
        drop(state);
        let skip = ((offset - start) as usize).min(bytes.len());
        Ok(bytes[skip..(skip + len as usize).min(bytes.len())].to_vec())
    }

    /// Waits until a new mutation may be acknowledged (`State::backlogged`); the request then
    /// counts as having taken effect.
    fn admit(&self, state: &mut MutexGuard<'_, State>) -> Result<(), Errno> {
        let mut waited = false;
        while state.backlogged() {
            if !self.client.is_connected() {
                return Err(Errno::EIO);
            }
            may_block()?;
            waited = true;
            self.wake.notify_one();
            self.progress.wait_for(state, Duration::from_millis(5));
        }
        if waited {
            self.stats.local("admission_waits");
        }
        // Every mutation is admitted before it changes anything; from here it must not be rerun.
        effective();
        Ok(())
    }

    fn new_id(&self) -> Result<Id, Errno> {
        if let Some(id) = self.state.lock().take_id() {
            return Ok(id);
        }
        let (reply, _) = self.call("alloc_ids", Request::AllocIds)?;
        let Response::Ids { first, count } = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
        let mut state = self.state.lock();
        state.ids = (first, first + Id::from(count));
        state.take_id().ok_or(Errno::EIO)
    }

    /// @cc [owner:fontanierh,label:product] overlay-over-fresh-base
    /// While `id`'s `Local` has uncommitted content changes (or is unborn), a read MUST return the
    /// server's content with those changes applied in order, clipped to the `Local`'s size. The
    /// server bytes MUST come from a reply read at or above `id`'s floor: a base predating one of
    /// this mount's commits would lose that commit's changes, whose layer is already dropped.
    /// `None` when the `Local` does not change the content (read it from the server).
    fn read_local(&self, id: Id, offset: u64, len: u32) -> Result<Option<Vec<u8>>, Errno> {
        for _ in 0..TRIES {
            let (end, base) = {
                let state = self.state.lock();
                let Some(local) = state.visible(id).filter(|l| l.attr.kind == Kind::File && l.changing()) else { return Ok(None) };
                let end = offset.saturating_add(u64::from(len.min(MAX_IO_BYTES))).min(local.attr.size);
                if offset >= end {
                    return Ok(Some(Vec::new()));
                }
                (end, !local.unborn && !local.covers(offset, end))
            };
            let base = if base {
                let (reply, _) = self.call("read", Request::Read { id, offset, len: (end - offset) as u32 })?;
                let Response::Data { bytes, .. } = reply.result.map_err(errno)? else { return Err(Errno::EIO) };
                Some((bytes, reply.version))
            } else {
                None
            };
            let state = self.state.lock();
            if base.as_ref().is_some_and(|(_, version)| *version < state.floor(id)) {
                continue;
            }
            let Some(local) = state.visible(id).filter(|l| l.attr.kind == Kind::File) else { continue };
            // Without a base, the changes that covered the range must all still be uncommitted.
            if base.is_none() && !(local.unborn || local.covers(offset, end)) {
                continue;
            }
            let end = end.min(local.attr.size).max(offset);
            let mut buf = base.map(|(bytes, _)| bytes).unwrap_or_default();
            buf.resize((end - offset) as usize, 0);
            local.apply(offset, &mut buf);
            self.stats.local("read");
            return Ok(Some(buf));
        }
        Err(Errno::EAGAIN)
    }

    /// Runs `change` on `id`'s `Local` (promoted from its live attribute when absent, without
    /// reading any content), then accounts for what it buffered.
    fn with_local(&self, id: Id, change: impl Fn(&mut Local, Instant, i64)) -> Result<(), Errno> {
        for _ in 0..TRIES {
            if self.attr(id)?.kind != Kind::File {
                return Err(Errno::EISDIR);
            }
            let mut state = self.state.lock();
            self.admit(&mut state)?;
            state.expire(id);
            if !state.locals.contains_key(&id) {
                // Promoted under the lock from a still-live attribute, keeping its freshness.
                let Some((attr, fresh)) = state.attr_stamped(id) else { continue };
                state.local(attr, fresh);
            }
            let local = state.locals.get_mut(&id).ok_or(Errno::EIO)?;
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
        if state.log.done < target {
            may_block()?;
        }
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
    fn writable_dir(&self, caller: Caller, parent: Id) -> Result<Attr, Errno> {
        let attr = self.attr(parent)?;
        if attr.kind != Kind::Dir {
            return Err(Errno::ENOTDIR);
        }
        if !self.allowed(caller, &attr, mask(false, true, true)) {
            return Err(Errno::EACCES);
        }
        Ok(attr)
    }

    /// Binds the free `name` in `parent` to a new object, acknowledged before its commit.
    #[allow(clippy::too_many_arguments)]
    fn make(&self, caller: Caller, parent: Id, name: &str, kind: Kind, mode: u32, target: Option<String>, writers: u32) -> Result<Attr, Errno> {
        self.writable_dir(caller, parent)?;
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
        let local = state.local(attr.clone(), Instant::now());
        local.unborn = true;
        local.writers = writers;
        local.target = target.clone();
        let op = Op::Create { parent, name: name.to_string(), id, kind, mode: mode & 0o7777, mtime_ns: now, target };
        state.push(op, Instant::now(), vec![(parent, name.to_string(), Some((id, kind)))]);
        state.places.insert(id, (parent, name.to_string()));
        drop(state);
        self.wake.notify_one();
        Ok(attr)
    }

    fn remove(&self, caller: Caller, parent: Id, name: &str, dir: bool) -> Result<(), Errno> {
        self.writable_dir(caller, parent)?;
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

    fn rename(&self, caller: Caller, parent: Id, name: &str, new_parent: Id, new_name: &str, no_replace: bool) -> Result<(), Errno> {
        self.writable_dir(caller, parent)?;
        self.writable_dir(caller, new_parent)?;
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
        let (attr, fresh) = self.attr_stamped(id)?;
        let mut state = self.state.lock();
        self.admit(&mut state)?;
        let local = state.local(attr, fresh);
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

    /// Opens `id` for writing: counts the writer and, when `truncate`, empties it.
    fn open_writer(&self, id: Id, truncate: bool) -> Result<(), Errno> {
        self.with_local(id, |local, now, now_ns| {
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
                "max_send_delay_ms": ms(commit.max_send_delay),
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

/// Copies the part of `block` (which starts at file offset `at`) that overlaps `buf` (at `offset`).
fn copy_block(buf: &mut [u8], offset: u64, block: &[u8], at: u64) {
    let from = offset.max(at);
    let to = (offset + buf.len() as u64).min(at + block.len() as u64);
    if from < to {
        buf[(from - offset) as usize..(to - offset) as usize].copy_from_slice(&block[(from - at) as usize..(to - at) as usize]);
    }
}

/// A FUSE reply that can carry an error.
trait Fail {
    fn fail(self, e: Errno);
}

macro_rules! fail {
    ($($reply:ty),*) => {$(
        impl Fail for $reply {
            fn fail(self, e: Errno) {
                debug_assert!(e != deferred(), "a deferral reached the kernel");
                self.error(if e == deferred() { Errno::EIO } else { e });
            }
        }
    )*};
}

fail!(ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyWrite);

/// Sends `result` through `reply`, or hands `reply` back when the request was deferred.
fn answer<R: Fail, T>(reply: R, result: Result<T, Errno>, ok: impl FnOnce(R, T)) -> Option<R> {
    match result {
        Err(e) if e == deferred() => Some(reply),
        Err(e) => {
            reply.fail(e);
            None
        }
        Ok(value) => {
            ok(reply, value);
            None
        }
    }
}

pub struct Mount(pub Arc<Fs>);

impl Mount {
    /// @cc [owner:fontanierh,label:performance;concurrency] serve-inline-or-defer
    /// `op` first runs on the FUSE thread; if it reaches a blocking point (an RPC, an admission
    /// or fetch wait, a drain) before taking effect, it returns its reply and is rerun on the
    /// worker pool, so one slow request never stalls the others. `op` MUST NOT change anything
    /// before its first blocking point other than idempotent cache installs, and a mutation
    /// MUST pass `Fs::admit` (after which blocking points wait in place) before its first change.
    /// `flush`, `release` and `releasedir` MUST NOT go through `serve`: they never block and run
    /// in kernel order. `fsync` and `fsyncdir` drain through it (a drain may be rerun).
    fn serve<R: Send + 'static>(&self, reply: R, op: impl Fn(&Fs, R) -> Option<R> + Send + 'static) {
        INLINE.set(true);
        let deferred = op(&self.0, reply);
        INLINE.set(false);
        if let Some(reply) = deferred {
            self.0.stats.local("deferred");
            let fs = self.0.clone();
            self.0.rt.spawn_blocking(move || {
                let _ = op(&fs, reply);
            });
        }
    }
}

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
        let name = name.to_owned();
        self.serve(reply, move |fs, reply| {
            let parent = fs.id(parent);
            let result = name_of(&name).and_then(|name| {
                let (id, _) = fs.name(parent, name)?.ok_or(Errno::ENOENT)?;
                let attr = fs.attr(id)?;
                let mut state = fs.state.lock();
                if state.places.get(&id).is_none_or(|(p, n)| *p != parent || n != name) {
                    state.places.insert(id, (parent, name.to_string()));
                }
                Ok(attr)
            });
            answer(reply, result, |reply, attr| reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)))
        });
    }

    fn getattr(&self, _req: &FuseRequest, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        self.0.stats.local("op.getattr");
        self.serve(reply, move |fs, reply| {
            answer(reply, fs.attr(fs.id(ino)), |reply, attr| reply.attr(&NO_TTL, &fs.file_attr(&attr)))
        });
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
        self.0.stats.local("op.setattr");
        let mtime = mtime.map(ns);
        self.serve(reply, move |fs, reply| {
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
                    fs.with_local(id, |local, now, now_ns| local.truncate(size, now, now_ns))?;
                }
                if mode.is_some() || mtime.is_some() {
                    fs.set_attr(id, mode.map(|m| m & 0o7777), mtime)?;
                }
                fs.attr(id)
            })();
            answer(reply, result, |reply, attr| reply.attr(&NO_TTL, &fs.file_attr(&attr)))
        });
    }

    fn readlink(&self, _req: &FuseRequest, ino: INodeNo, reply: ReplyData) {
        self.serve(reply, move |fs, reply| answer(reply, fs.link(fs.id(ino)), |reply, target| reply.data(target.as_bytes())));
    }

    fn mknod(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, _rdev: u32, reply: ReplyEntry) {
        if mode & libc::S_IFMT != libc::S_IFREG {
            reply.error(Errno::from_i32(libc::EOPNOTSUPP));
            return;
        }
        let (caller, name) = (Caller::of(req), name.to_owned());
        self.serve(reply, move |fs, reply| {
            let result = name_of(&name).and_then(|name| fs.make(caller, fs.id(parent), name, Kind::File, mode, None, 0));
            answer(reply, result, |reply, attr| reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)))
        });
    }

    fn mkdir(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, reply: ReplyEntry) {
        self.0.stats.local("op.mkdir");
        let (caller, name) = (Caller::of(req), name.to_owned());
        self.serve(reply, move |fs, reply| {
            let result = name_of(&name).and_then(|name| fs.make(caller, fs.id(parent), name, Kind::Dir, mode, None, 0));
            answer(reply, result, |reply, attr| reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)))
        });
    }

    fn unlink(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.0.stats.local("op.unlink");
        let (caller, name) = (Caller::of(req), name.to_owned());
        self.serve(reply, move |fs, reply| {
            let result = name_of(&name).and_then(|name| fs.remove(caller, fs.id(parent), name, false));
            answer(reply, result, |reply, ()| reply.ok())
        });
    }

    fn rmdir(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.0.stats.local("op.rmdir");
        let (caller, name) = (Caller::of(req), name.to_owned());
        self.serve(reply, move |fs, reply| {
            let result = name_of(&name).and_then(|name| fs.remove(caller, fs.id(parent), name, true));
            answer(reply, result, |reply, ()| reply.ok())
        });
    }

    fn symlink(&self, req: &FuseRequest, parent: INodeNo, link_name: &OsStr, target: &Path, reply: ReplyEntry) {
        let (caller, link_name, target): (Caller, OsString, PathBuf) = (Caller::of(req), link_name.to_owned(), target.to_owned());
        self.serve(reply, move |fs, reply| {
            let result = match (name_of(&link_name), target.to_str()) {
                (Ok(name), Some(target)) => fs.make(caller, fs.id(parent), name, Kind::Symlink, 0o777, Some(target.to_string()), 0),
                (Err(e), _) => Err(e),
                _ => Err(Errno::EINVAL),
            };
            answer(reply, result, |reply, attr| reply.entry(&NO_TTL, &fs.file_attr(&attr), Generation(0)))
        });
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
        if flags.intersects(RenameFlags::RENAME_EXCHANGE | RenameFlags::RENAME_WHITEOUT) {
            reply.error(Errno::EINVAL);
            return;
        }
        let (caller, name, newname) = (Caller::of(req), name.to_owned(), newname.to_owned());
        let no_replace = flags.contains(RenameFlags::RENAME_NOREPLACE);
        self.serve(reply, move |fs, reply| {
            let result = name_of(&name).and_then(|name| {
                let newname = name_of(&newname)?;
                fs.rename(caller, fs.id(parent), name, fs.id(newparent), newname, no_replace)
            });
            answer(reply, result, |reply, ()| reply.ok())
        });
    }

    fn open(&self, req: &FuseRequest, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        self.0.stats.local("op.open");
        let caller = Caller::of(req);
        let accmode = flags.0 & libc::O_ACCMODE;
        let write = accmode != libc::O_RDONLY;
        self.serve(reply, move |fs, reply| {
            let id = fs.id(ino);
            let result = (|| {
                let attr = fs.attr(id)?;
                if !fs.allowed(caller, &attr, mask(accmode != libc::O_WRONLY, write, false)) {
                    return Err(Errno::EACCES);
                }
                if write {
                    fs.open_writer(id, flags.0 & libc::O_TRUNC != 0)?;
                }
                Ok(())
            })();
            answer(reply, result, |reply, ()| {
                let mut open = FopenFlags::FOPEN_DIRECT_IO;
                if !write {
                    open |= FopenFlags::FOPEN_NOFLUSH;
                }
                reply.opened(FileHandle(0), open);
            })
        });
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
        self.serve(reply, move |fs, reply| {
            let id = fs.id(ino);
            let slice = |bytes: &[u8]| {
                let start = (offset as usize).min(bytes.len());
                bytes[start..start.saturating_add(size as usize).min(bytes.len())].to_vec()
            };
            let result = (|| {
                if let Some(bytes) = fs.read_local(id, offset, size)? {
                    return Ok(bytes);
                }
                if let Some(bytes) = fs.read_whole(id, offset)? {
                    return Ok(slice(&bytes));
                }
                fs.read_range(id, offset, size.min(MAX_IO_BYTES))
            })();
            answer(reply, result, |reply, bytes| reply.data(&bytes))
        });
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
        if offset.saturating_add(data.len() as u64) > dfs_proto::MAX_FILE_BYTES {
            reply.error(Errno::EFBIG);
            return;
        }
        let data = data.to_vec();
        self.serve(reply, move |fs, reply| {
            let result = fs.with_local(fs.id(ino), |local, now, now_ns| local.write(offset, &data, now, now_ns));
            answer(reply, result, |reply, ()| reply.written(data.len() as u32))
        });
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

    fn fsync(&self, _req: &FuseRequest, _ino: INodeNo, _fh: FileHandle, _datasync: bool, reply: ReplyEmpty) {
        // Durable: the log is committed in order, so draining it commits this file's changes (and
        // every mutation acknowledged before them) before returning.
        self.0.stats.local("op.fsync");
        self.serve(reply, move |fs, reply| answer(reply, fs.drain(), |reply, ()| reply.ok()));
    }

    fn opendir(&self, req: &FuseRequest, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        self.0.stats.local("op.opendir");
        let caller = Caller::of(req);
        self.serve(reply, move |fs, reply| {
            let dir = fs.id(ino);
            let result = (|| {
                let attr = fs.attr(dir)?;
                if attr.kind != Kind::Dir {
                    return Err(Errno::ENOTDIR);
                }
                if !fs.allowed(caller, &attr, libc::R_OK) {
                    return Err(Errno::EACCES);
                }
                let (listing, stamp) = fs.listing(dir)?;
                let entries = listing.into_iter().map(|(name, (id, kind))| (name, id, kind)).collect();
                Ok(DirHandle { entries, base: 2, stamp })
            })();
            answer(reply, result, |reply, handle| {
                let fh = fs.next_fh.fetch_add(1, Ordering::Relaxed);
                fs.dirs.lock().insert(fh, handle);
                reply.opened(FileHandle(fh), FopenFlags::empty());
            })
        });
    }

    fn readdir(&self, _req: &FuseRequest, ino: INodeNo, fh: FileHandle, offset: u64, reply: ReplyDirectory) {
        self.0.stats.local("op.readdir");
        self.serve(reply, move |fs, mut reply| {
            let dir = fs.id(ino);
            let ttl = fs.state.lock().budget.ttl;
            // A handle whose listing outlived the TTL is rebuilt, resuming after the last name listed;
            // so is one rewound before the entries it still holds.
            let stale = fs.dirs.lock().get(&fh.0).map(|h| {
                let resume = offset.checked_sub(h.base + 1).and_then(|i| h.entries.get(i as usize)).map(|e| e.0.clone());
                (h.stamp.elapsed() >= ttl || (h.base > 2 && offset < h.base), resume)
            });
            let Some((stale, resume)) = stale else {
                reply.fail(Errno::EBADF);
                return None;
            };
            if stale {
                let (listing, stamp) = match fs.listing(dir) {
                    Ok(listed) => listed,
                    Err(e) => return answer(reply, Err::<(), _>(e), |_, ()| {}),
                };
                let after = match &resume {
                    Some(name) => listing.range::<str, _>((Bound::Excluded(name.as_str()), Bound::Unbounded)),
                    None => listing.range::<str, _>(..),
                };
                let entries = after.map(|(name, (id, kind))| (name.clone(), *id, *kind)).collect();
                fs.dirs.lock().insert(fh.0, DirHandle { entries, base: offset.max(2), stamp });
            }
            let dirs = fs.dirs.lock();
            let Some(handle) = dirs.get(&fh.0) else {
                reply.fail(Errno::EBADF);
                return None;
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
            None
        });
    }

    fn releasedir(&self, _req: &FuseRequest, _ino: INodeNo, fh: FileHandle, _flags: OpenFlags, reply: ReplyEmpty) {
        self.0.dirs.lock().remove(&fh.0);
        reply.ok();
    }

    fn fsyncdir(&self, _req: &FuseRequest, _ino: INodeNo, _fh: FileHandle, _datasync: bool, reply: ReplyEmpty) {
        // The drain barrier (fuser has no `syncfs`): every mutation acknowledged before it has
        // committed when it returns.
        self.0.stats.local("op.fsyncdir");
        self.serve(reply, move |fs, reply| answer(reply, fs.drain(), |reply, ()| reply.ok()));
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
        let caller = Caller::of(req);
        self.serve(reply, move |fs, reply| {
            let result = fs.attr(fs.id(ino)).and_then(|attr| if fs.allowed(caller, &attr, mask.bits()) { Ok(()) } else { Err(Errno::EACCES) });
            answer(reply, result, |reply, ()| reply.ok())
        });
    }

    fn create(&self, req: &FuseRequest, parent: INodeNo, name: &OsStr, mode: u32, _umask: u32, flags: i32, reply: ReplyCreate) {
        self.0.stats.local("op.create");
        let (caller, name) = (Caller::of(req), name.to_owned());
        let write = flags & libc::O_ACCMODE != libc::O_RDONLY;
        self.serve(reply, move |fs, reply| {
            let parent = fs.id(parent);
            let result = name_of(&name).and_then(|name| match fs.make(caller, parent, name, Kind::File, mode, None, u32::from(write)) {
                Err(e) if e == Errno::EEXIST && flags & libc::O_EXCL == 0 => {
                    // Lost a race with another creator of `name`: open what is there.
                    let (id, _) = fs.name(parent, name)?.ok_or(Errno::ENOENT)?;
                    let attr = fs.attr(id)?;
                    if attr.kind == Kind::Dir {
                        return Err(Errno::EISDIR);
                    }
                    if !fs.allowed(caller, &attr, mask(!write || flags & libc::O_ACCMODE == libc::O_RDWR, write, false)) {
                        return Err(Errno::EACCES);
                    }
                    if write {
                        fs.open_writer(id, flags & libc::O_TRUNC != 0)?;
                    }
                    fs.attr(id)
                }
                result => result,
            });
            answer(reply, result, |reply, attr| {
                reply.created(&NO_TTL, &fs.file_attr(&attr), Generation(0), FileHandle(0), FopenFlags::FOPEN_DIRECT_IO)
            })
        });
    }
}
