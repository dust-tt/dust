//! Mount state: a TTL-bounded cache of server replies, the overlay of this mount's acknowledged but
//! uncommitted mutations, and the log that carries those mutations to the server in order.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

use dfs_proto::{Attr, BLOCK_BYTES, Change, Entry, Errno, Id, Kind, MAX_VALIDATE, Op, Token};

pub type Listing = BTreeMap<String, (Id, Kind)>;
pub type Name = Option<(Id, Kind)>;

/// Most ops one `Apply` batch carries; batch latency grows with op count (~42 µs/op on FDB).
pub const BATCH_OPS: usize = 512;
/// Most expanded block bytes one batch writes (estimated, see `Pending::cost`).
pub const BATCH_BYTES: usize = 2 << 20;
/// A file's unsealed changes are sealed into a `Write` op beyond these.
pub const SEAL_BYTES: usize = 1 << 20;
pub const SEAL_BLOCKS: usize = dfs_proto::MAX_FLUSH_BLOCKS - 8;
const OP_COST: usize = 256;
/// `Apply` latencies admission projects from (the most recent ones), and the least it assumes.
const RECENT_APPLIES: usize = 8;
const MIN_APPLY: Duration = Duration::from_millis(5);
const CONTENT_FILES: usize = 1 << 16;
/// Most listings kept for revalidation.
const STORED_LISTINGS: usize = 1 << 16;

/// How the visibility budget (`MAX_EVENTUAL_CONSISTENCY_DELAY`) is spent.
#[derive(Clone, Copy, Debug)]
pub struct Budget {
    /// Longest an acknowledged mutation may wait for its commit.
    pub window: Duration,
    /// Longest a server reply is served after its request was sent.
    pub ttl: Duration,
}

impl Budget {
    pub fn new(max_delay: Duration) -> Self {
        let window = (max_delay / 4).min(Duration::from_secs(1));
        Self { window, ttl: max_delay.saturating_sub(window) }
    }
}

/// A server reply, stamped with the instant its request was sent and the version it was read at.
pub struct Cached<T> {
    pub value: T,
    pub stamp: Instant,
    pub version: u64,
}

/// What `Content` holds for a file: its whole content (`None`) or one `BLOCK_BYTES` block.
type Slot = (Id, Option<u64>);

/// @cc [owner:fontanierh,label:product] content-under-live-rev
/// File bytes are cached by `(id, rev)`, whole for small files and by `BLOCK_BYTES` block for
/// large ones, and are installed only from a reply at or above `floor(id)`. They MUST be served
/// only under a live (`ttl-at-serve`) server attribute of `id` with that same rev.
pub struct Content {
    /// Most file bytes held (`--cache-mib`).
    limit: usize,
    slots: HashMap<Slot, (u64, Arc<[u8]>)>,
    order: VecDeque<(Slot, u64)>,
    bytes: usize,
    /// Files a `ReadFiles` call in flight will install.
    pub fetching: HashSet<Id>,
}

impl Content {
    pub fn new(limit: usize) -> Self {
        Self { limit, slots: HashMap::new(), order: VecDeque::new(), bytes: 0, fetching: HashSet::new() }
    }

    pub fn get(&self, id: Id, rev: u64) -> Option<Arc<[u8]>> {
        self.slot((id, None), rev)
    }

    pub fn block(&self, id: Id, rev: u64, index: u64) -> Option<Arc<[u8]>> {
        self.slot((id, Some(index)), rev)
    }

    fn slot(&self, slot: Slot, rev: u64) -> Option<Arc<[u8]>> {
        self.slots.get(&slot).filter(|(r, _)| *r == rev).map(|(_, bytes)| bytes.clone())
    }

    pub fn insert(&mut self, id: Id, rev: u64, bytes: Arc<[u8]>) {
        self.put((id, None), rev, bytes);
    }

    pub fn insert_block(&mut self, id: Id, rev: u64, index: u64, bytes: Arc<[u8]>) {
        self.put((id, Some(index)), rev, bytes);
    }

    fn put(&mut self, slot: Slot, rev: u64, bytes: Arc<[u8]>) {
        self.bytes += bytes.len();
        if let Some((_, old)) = self.slots.insert(slot, (rev, bytes)) {
            self.bytes -= old.len();
        }
        self.order.push_back((slot, rev));
        while self.bytes > self.limit || self.slots.len() > CONTENT_FILES {
            let Some((slot, rev)) = self.order.pop_front() else { break };
            if self.slots.get(&slot).is_some_and(|(r, _)| *r == rev)
                && let Some((_, bytes)) = self.slots.remove(&slot)
            {
                self.bytes -= bytes.len();
            }
        }
    }
}

/// This mount's view of an object it changed: attributes, plus the content changes not yet
/// committed. A file's content is the server's, with `layers` then `dirty` applied in order.
pub struct Local {
    pub attr: Attr,
    pub target: Option<String>,
    /// Content changes sealed into queued or in-flight `Write` ops, by op seq, in log order.
    pub layers: Vec<(u64, Vec<Change>)>,
    /// Content changes not yet sealed into an op.
    pub dirty: Vec<Change>,
    pub dirty_blocks: BTreeSet<u64>,
    pub dirty_bytes: usize,
    /// Acknowledgment instant of the oldest unsealed change.
    pub dirty_since: Option<Instant>,
    /// Ops in the log (queued or in flight) that change this object.
    pub pending: u32,
    pub writers: u32,
    /// Since when nothing of it is pending or unsealed (for a `Local` promoted from the cache, when
    /// the data it was promoted from was requested). A quiet `Local` is served for at most
    /// `budget.ttl` more (other mounts' changes must show through an idle open-for-write file).
    pub quiet_since: Option<Instant>,
    /// Its `Create` has not committed: the server knows nothing of it.
    pub unborn: bool,
}

impl Local {
    pub fn new(attr: Attr, fresh: Instant) -> Self {
        Self {
            attr,
            target: None,
            layers: Vec::new(),
            dirty: Vec::new(),
            dirty_blocks: BTreeSet::new(),
            dirty_bytes: 0,
            dirty_since: None,
            pending: 0,
            writers: 0,
            quiet_since: Some(fresh),
            unborn: false,
        }
    }

    fn idle(&self) -> bool {
        self.pending == 0 && self.writers == 0 && self.dirty.is_empty()
    }

    /// Content changes not yet committed, in order.
    pub fn changes(&self) -> impl Iterator<Item = &Change> {
        self.layers.iter().flat_map(|(_, changes)| changes).chain(&self.dirty)
    }

    /// Whether the content view depends on more than the server's content.
    pub fn changing(&self) -> bool {
        self.unborn || !self.layers.is_empty() || !self.dirty.is_empty()
    }

    /// Whether every byte of `start..end` is set by an uncommitted change (written, or past a
    /// truncation), so the server's content is not needed to read it.
    pub fn covers(&self, start: u64, end: u64) -> bool {
        let mut known: Vec<(u64, u64)> = self
            .changes()
            .map(|change| match change {
                Change::Write { offset, bytes } => (*offset, offset + bytes.len() as u64),
                Change::Truncate(size) => (*size, u64::MAX),
            })
            .map(|(from, to)| (from.max(start), to.min(end)))
            .filter(|(from, to)| from < to)
            .collect();
        known.sort_unstable();
        let mut next = start;
        for (from, to) in known {
            if from > next {
                return false;
            }
            next = next.max(to);
        }
        next >= end
    }

    /// Applies the uncommitted changes to `buf`, the content at `start` (zero-padded).
    pub fn apply(&self, start: u64, buf: &mut [u8]) {
        let end = start + buf.len() as u64;
        for change in self.changes() {
            match change {
                Change::Write { offset, bytes } => {
                    let (from, to) = ((*offset).max(start), (offset + bytes.len() as u64).min(end));
                    if from < to {
                        buf[(from - start) as usize..(to - start) as usize]
                            .copy_from_slice(&bytes[(from - offset) as usize..(to - offset) as usize]);
                    }
                }
                Change::Truncate(size) if *size < end => buf[((*size).max(start) - start) as usize..].fill(0),
                Change::Truncate(_) => {}
            }
        }
    }

    /// Writes `data` at `offset`.
    pub fn write(&mut self, offset: u64, data: &[u8], now: Instant, now_ns: i64) {
        let end = offset + data.len() as u64;
        match self.dirty.last_mut() {
            Some(Change::Write { offset: at, bytes }) if *at + bytes.len() as u64 == offset => bytes.extend_from_slice(data),
            _ => self.dirty.push(Change::Write { offset, bytes: data.to_vec() }),
        }
        if !data.is_empty() {
            self.dirty_blocks.extend(offset / BLOCK_BYTES..=(end - 1) / BLOCK_BYTES);
        }
        self.dirty_bytes += data.len();
        self.dirty_since.get_or_insert(now);
        self.quiet_since = None;
        self.attr.size = self.attr.size.max(end);
        self.attr.mtime_ns = now_ns;
        self.attr.ctime_ns = now_ns;
    }

    pub fn truncate(&mut self, size: u64, now: Instant, now_ns: i64) {
        self.dirty.push(Change::Truncate(size));
        self.dirty_since.get_or_insert(now);
        self.quiet_since = None;
        self.attr.size = size;
        self.attr.mtime_ns = now_ns;
        self.attr.ctime_ns = now_ns;
    }

    pub fn over(&self) -> bool {
        self.dirty_bytes >= SEAL_BYTES || self.dirty_blocks.len() >= SEAL_BLOCKS
    }
}

/// One acknowledged mutation waiting for (or in) its `Apply` batch.
pub struct Pending {
    pub seq: u64,
    pub op: Op,
    /// Acknowledgment instant of the oldest mutation folded into this op.
    pub acked: Instant,
    /// Estimated bytes the op writes in FDB (expanded blocks for `Write`).
    pub cost: usize,
    pub blocks: usize,
    /// Name bindings the op makes, as this mount predicted them when acknowledging it.
    pub names: Vec<(Id, String, Name)>,
    /// Objects whose cached state the op changes.
    pub touched: Vec<Id>,
    /// The `Local` whose `pending` count this op holds.
    pub local: Option<Id>,
}

#[derive(Default, Clone, Copy)]
pub struct CommitStats {
    pub batches: u64,
    pub ops: u64,
    pub dropped: u64,
    pub missed: u64,
    /// Ack to commit returned: includes the apply RPC (network and FDB commit).
    pub max_lag: Duration,
    /// Ack to batch sent: the delay the client alone adds.
    pub max_send_delay: Duration,
    pub apply: Duration,
    pub max_apply: Duration,
}

pub struct Log {
    pub next: u64,
    /// Every op with a smaller seq has finished (committed or dropped).
    pub done: u64,
    pub queue: VecDeque<Pending>,
    pub cost: usize,
    /// Latest op that changes each object's attributes or content.
    last: HashMap<Id, u64>,
    /// Objects with unsealed changes.
    pub dirty: HashSet<Id>,
    pub dirty_bytes: usize,
    pub in_flight: bool,
    /// Acknowledgment instant of the oldest op of the batch in flight.
    pub in_flight_since: Option<Instant>,
    /// When the batch in flight was taken.
    pub sent_at: Option<Instant>,
    /// Latencies of the last `RECENT_APPLIES` batches.
    pub recent: VecDeque<Duration>,
    /// First op failure since the last drain barrier.
    pub failed: Option<Errno>,
    pub stats: CommitStats,
}

/// A whole listing as read under `token`, kept past its TTL so one `Validate` call can reinstall
/// it instead of fetching it again.
pub struct Stored {
    pub token: Token,
    pub dir: Attr,
    pub entries: Vec<Entry>,
}

/// Result of one `Apply`: version, per-op failures, committed attributes.
pub type Outcome = Result<(u64, Vec<Option<Errno>>, Vec<Attr>), Errno>;

pub struct State {
    pub budget: Budget,
    pub attrs: HashMap<Id, Cached<Attr>>,
    pub names: HashMap<(Id, String), Cached<Name>>,
    pub listings: HashMap<Id, Cached<Listing>>,
    pub links: HashMap<Id, Cached<String>>,
    /// @cc [owner:fontanierh,label:concurrency] own-commit-floor
    /// Once an op of this mount commits at version `c`, no server reply read below `c` may be
    /// installed for an object the op touched: such a reply predates the op, whose overlay is gone.
    pub floor: HashMap<Id, u64>,
    /// Directory and name an object was last looked up under (prefetch hint).
    pub places: HashMap<Id, (Id, String)>,
    /// Entry count of each directory's last fetched listing.
    pub sizes: HashMap<Id, usize>,
    /// Siblings the next read miss in a directory prefetches.
    pub windows: HashMap<Id, usize>,
    pub content: Content,
    /// Listings kept for revalidation; always empty unless `revalidate`.
    pub stored: HashMap<Id, Stored>,
    pub revalidate: bool,
    /// A `Validate` call is in flight.
    pub validating: bool,
    pub locals: HashMap<Id, Local>,
    pub pnames: HashMap<(Id, String), (u64, Name)>,
    pub pdirs: HashMap<Id, BTreeSet<String>>,
    pub log: Log,
    pub ids: (Id, Id),
}

impl State {
    pub fn new(budget: Budget, revalidate: bool, content_bytes: usize) -> Self {
        Self {
            budget,
            stored: HashMap::new(),
            revalidate,
            validating: false,
            attrs: HashMap::new(),
            names: HashMap::new(),
            listings: HashMap::new(),
            links: HashMap::new(),
            floor: HashMap::new(),
            places: HashMap::new(),
            sizes: HashMap::new(),
            windows: HashMap::new(),
            content: Content::new(content_bytes),
            locals: HashMap::new(),
            pnames: HashMap::new(),
            pdirs: HashMap::new(),
            log: Log {
                next: 1,
                done: 1,
                queue: VecDeque::new(),
                cost: 0,
                last: HashMap::new(),
                dirty: HashSet::new(),
                dirty_bytes: 0,
                in_flight: false,
                in_flight_since: None,
                sent_at: None,
                recent: VecDeque::new(),
                failed: None,
                stats: CommitStats::default(),
            },
            ids: (0, 0),
        }
    }

    /// @cc [owner:fontanierh,label:product] ttl-at-serve
    /// A cached server reply MUST NOT be served once `budget.ttl` has elapsed since its request
    /// was sent; the check happens when serving, not when installing.
    fn live<T>(&self, cached: &Cached<T>) -> bool {
        cached.stamp.elapsed() < self.budget.ttl
    }

    fn admits(&self, id: Id, version: u64) -> bool {
        version >= self.floor(id)
    }

    /// `id`'s `Local` unless it has been quiet for longer than the TTL.
    pub fn visible(&self, id: Id) -> Option<&Local> {
        self.locals.get(&id).filter(|l| l.quiet_since.is_none_or(|t| t.elapsed() < self.budget.ttl))
    }

    /// Forgets `id`'s `Local` if it is no longer `visible` (its state is fetched again if needed).
    pub fn expire(&mut self, id: Id) {
        if self.locals.contains_key(&id) && self.visible(id).is_none() {
            self.locals.remove(&id);
        }
    }

    pub fn attr(&self, id: Id) -> Option<Attr> {
        self.attr_stamped(id).map(|(attr, _)| attr)
    }

    /// The cached server attribute of `id`, ignoring this mount's `Local`.
    pub fn server_attr(&self, id: Id) -> Option<Attr> {
        self.attrs.get(&id).filter(|c| self.live(c)).map(|c| c.value.clone())
    }

    /// The lowest read version a server reply about `id` must have to include this mount's
    /// committed ops on it.
    pub fn floor(&self, id: Id) -> u64 {
        self.floor.get(&id).copied().unwrap_or(0)
    }

    /// `attr` with the instant its data was requested (now for a `Local` with changes in flight).
    pub fn attr_stamped(&self, id: Id) -> Option<(Attr, Instant)> {
        if let Some(local) = self.visible(id) {
            return Some((local.attr.clone(), local.quiet_since.unwrap_or_else(Instant::now)));
        }
        self.attrs.get(&id).filter(|c| self.live(c)).map(|c| (c.value.clone(), c.stamp))
    }

    /// What `name` in `parent` names in this mount's view; `None` when unknown.
    pub fn name(&self, parent: Id, name: &str) -> Option<Name> {
        let key = (parent, name.to_string());
        if let Some((_, value)) = self.pnames.get(&key) {
            return Some(*value);
        }
        if self.locals.get(&parent).is_some_and(|l| l.unborn) {
            return Some(None);
        }
        let entry = self.names.get(&key).filter(|c| self.live(c));
        let listed = self.listings.get(&parent).filter(|c| self.live(c));
        match (entry, listed) {
            (Some(entry), Some(listed)) if listed.version > entry.version => Some(listed.value.get(name).copied()),
            (Some(entry), _) => Some(entry.value),
            (None, Some(listed)) => Some(listed.value.get(name).copied()),
            (None, None) => None,
        }
    }

    /// This mount's view of `dir`'s entries and the instant its server part was requested.
    pub fn listing(&self, dir: Id) -> Option<(Listing, Instant)> {
        let (mut listing, stamp) = if self.locals.get(&dir).is_some_and(|l| l.unborn) {
            (Listing::new(), Instant::now())
        } else {
            let cached = self.listings.get(&dir).filter(|c| self.live(c))?;
            (cached.value.clone(), cached.stamp)
        };
        self.overlay_listing(dir, &mut listing);
        Some((listing, stamp))
    }

    pub fn overlay_listing(&self, dir: Id, listing: &mut Listing) {
        for name in self.pdirs.get(&dir).into_iter().flatten() {
            match self.pnames.get(&(dir, name.clone())) {
                Some((_, Some(value))) => {
                    listing.insert(name.clone(), *value);
                }
                Some((_, None)) => {
                    listing.remove(name);
                }
                None => {}
            }
        }
    }

    pub fn link(&self, id: Id) -> Option<String> {
        if let Some(target) = self.locals.get(&id).and_then(|l| l.target.clone()) {
            return Some(target);
        }
        self.links.get(&id).filter(|c| self.live(c)).map(|c| c.value.clone())
    }

    /// Installs a fetched attribute; false when it predates an own commit.
    pub fn install_attr(&mut self, attr: Attr, stamp: Instant, version: u64) -> bool {
        if !self.admits(attr.id, version) {
            return false;
        }
        if self.attrs.get(&attr.id).is_none_or(|old| old.version <= version || !self.live(old)) {
            self.attrs.insert(attr.id, Cached { value: attr, stamp, version });
        }
        true
    }

    pub fn install_name(&mut self, parent: Id, name: &str, value: Name, stamp: Instant, version: u64) -> bool {
        if !self.admits(parent, version) {
            return false;
        }
        let key = (parent, name.to_string());
        if self.names.get(&key).is_none_or(|old| old.version <= version || !self.live(old)) {
            self.names.insert(key, Cached { value, stamp, version });
        }
        true
    }

    pub fn install_listing(&mut self, dir: Id, listing: Listing, stamp: Instant, version: u64) -> bool {
        if !self.admits(dir, version) {
            return false;
        }
        if self.listings.get(&dir).is_none_or(|old| old.version <= version || !self.live(old)) {
            self.listings.insert(dir, Cached { value: listing, stamp, version });
        }
        true
    }

    /// Installs a whole listing of `dir` read at `version` and the attributes it carries; returns
    /// it in this mount's view, and whether it was installed.
    pub fn install_entries(&mut self, dir: Attr, entries: Vec<Entry>, stamp: Instant, version: u64) -> (Listing, bool) {
        let id = dir.id;
        let mut listing = Listing::new();
        for entry in entries {
            listing.insert(entry.name.clone(), (entry.attr.id, entry.attr.kind));
            self.places.insert(entry.attr.id, (id, entry.name));
            self.install_attr(entry.attr, stamp, version);
        }
        self.install_attr(dir, stamp, version);
        self.sizes.insert(id, listing.len());
        let installed = self.install_listing(id, listing.clone(), stamp, version);
        self.overlay_listing(id, &mut listing);
        (listing, installed)
    }

    /// Keeps a whole listing read under `token` for revalidation (when on and below the cap).
    pub fn store_listing(&mut self, dir: Attr, entries: Vec<Entry>, token: Token) {
        if self.revalidate && (self.stored.len() < STORED_LISTINGS || self.stored.contains_key(&dir.id)) {
            self.stored.insert(dir.id, Stored { token, dir, entries });
        }
    }

    /// The stored listings one `Validate` call should check when `dir`'s listing is needed: none
    /// when `dir`'s is live or not stored, else `dir`'s, then the expired ones of its stored subtree,
    /// then any other expired ones, at most `MAX_VALIDATE`.
    pub fn revalidation(&self, dir: Id) -> Vec<(Id, Token)> {
        let expired = |id: &Id| self.listings.get(id).is_none_or(|c| !self.live(c));
        if !expired(&dir) || !self.stored.contains_key(&dir) {
            return Vec::new();
        }
        let mut dirs = Vec::new();
        let mut seen = HashSet::new();
        let mut queue = VecDeque::from([dir]);
        while let Some(id) = queue.pop_front() {
            let Some(stored) = self.stored.get(&id) else { continue };
            if !seen.insert(id) {
                continue;
            }
            if expired(&id) {
                dirs.push((id, stored.token));
                if dirs.len() == MAX_VALIDATE {
                    return dirs;
                }
            }
            queue.extend(stored.entries.iter().filter(|e| e.attr.kind == Kind::Dir).map(|e| e.attr.id));
        }
        let others = self.stored.iter().filter(|(id, _)| !seen.contains(*id) && expired(id));
        dirs.extend(others.map(|(id, stored)| (*id, stored.token)).take(MAX_VALIDATE - dirs.len()));
        dirs
    }

    /// @cc [owner:fontanierh,label:product] revalidated-listing
    /// A stored listing MUST be reinstalled only after a `Validate` read at `version` found its
    /// token current, and only as read at `version` and requested at `stamp` (that call's send
    /// instant), through the same floor and newer-version checks as a fetched listing.
    pub fn revalidated(&mut self, dir: Id, token: Token, valid: bool, stamp: Instant, version: u64) {
        if self.stored.get(&dir).is_none_or(|s| s.token != token) {
            return;
        }
        if !valid {
            self.stored.remove(&dir);
            return;
        }
        if let Some(stored) = self.stored.get(&dir) {
            let (attr, entries) = (stored.dir.clone(), stored.entries.clone());
            self.install_entries(attr, entries, stamp, version);
        }
    }

    pub fn install_link(&mut self, id: Id, target: String, stamp: Instant, version: u64) {
        if self.admits(id, version) {
            self.links.insert(id, Cached { value: target, stamp, version });
        }
    }

    /// Drops expired cache entries.
    pub fn sweep(&mut self) {
        let ttl = self.budget.ttl;
        self.attrs.retain(|_, c| c.stamp.elapsed() < ttl);
        self.names.retain(|_, c| c.stamp.elapsed() < ttl);
        self.listings.retain(|_, c| c.stamp.elapsed() < ttl);
        self.links.retain(|_, c| c.stamp.elapsed() < ttl);
    }

    pub fn take_id(&mut self) -> Option<Id> {
        let (next, end) = self.ids;
        (next < end).then(|| {
            self.ids.0 += 1;
            next
        })
    }

    /// @cc [owner:fontanierh,label:product] local-keeps-freshness
    /// A `Local` created from cached data MUST be stamped with that data's request instant
    /// (`fresh`), never with the promotion instant: promoting MUST NOT extend how long stale
    /// data is served.
    pub fn local(&mut self, attr: Attr, fresh: Instant) -> &mut Local {
        self.locals.entry(attr.id).or_insert_with(|| Local::new(attr, fresh))
    }

    /// A read saw `id` at `rev`: a cached attribute of an older revision is dropped, so `stat`
    /// stops reporting a size the content no longer has.
    pub fn observe_rev(&mut self, id: Id, rev: u64) {
        if self.attrs.get(&id).is_some_and(|c| c.value.rev < rev) {
            self.attrs.remove(&id);
        }
    }

    pub fn bind(&mut self, parent: Id, name: &str, seq: u64, value: Name) {
        self.pnames.insert((parent, name.to_string()), (seq, value));
        self.pdirs.entry(parent).or_default().insert(name.to_string());
    }

    fn unbind(&mut self, parent: Id, name: &str, seq: u64) {
        let key = (parent, name.to_string());
        if self.pnames.get(&key).is_some_and(|(s, _)| *s == seq) {
            self.pnames.remove(&key);
            if let Some(names) = self.pdirs.get_mut(&parent) {
                names.remove(name);
                if names.is_empty() {
                    self.pdirs.remove(&parent);
                }
            }
        }
    }

    /// Queues an acknowledged op; returns its seq.
    pub fn push(&mut self, op: Op, acked: Instant, names: Vec<(Id, String, Name)>) -> u64 {
        let seq = self.log.next;
        self.log.next += 1;
        let (touched, local) = match &op {
            Op::Create { parent, id, .. } => (vec![*parent, *id], Some(*id)),
            Op::Remove { parent, id, .. } => (vec![*parent, *id], None),
            Op::Rename { parent, id, new_parent, .. } => (vec![*parent, *new_parent, *id], None),
            Op::Write { id, .. } | Op::SetAttr { id, .. } => (vec![*id], Some(*id)),
        };
        if let Some(id) = local {
            self.log.last.insert(id, seq);
            if let Some(local) = self.locals.get_mut(&id) {
                local.pending += 1;
                local.quiet_since = None;
            }
        }
        for (parent, name, value) in &names {
            self.bind(*parent, name, seq, *value);
        }
        self.log.cost += OP_COST;
        self.log.queue.push_back(Pending { seq, op, acked, cost: OP_COST, blocks: 0, names, touched, local });
        seq
    }

    /// The latest queued (not in flight) op that changes `id`.
    fn queued_last(&mut self, id: Id) -> Option<&mut Pending> {
        let seq = *self.log.last.get(&id)?;
        let front = self.log.queue.front()?.seq;
        if seq < front {
            return None;
        }
        self.log.queue.get_mut((seq - front) as usize)
    }

    /// Seals `id`'s unsealed changes into a `Write` op, merged into its latest queued `Write`
    /// when one exists (moving later content changes earlier is invisible: only `Write` reads
    /// content, and the log applies in order).
    pub fn seal(&mut self, id: Id) {
        let Some(local) = self.locals.get_mut(&id) else { return };
        if local.dirty.is_empty() {
            return;
        }
        let changes = std::mem::take(&mut local.dirty);
        let layer = changes.clone();
        let blocks = std::mem::take(&mut local.dirty_blocks);
        let len = local.attr.size;
        let acked = local.dirty_since.take().unwrap_or_else(Instant::now);
        let mtime = Some(local.attr.mtime_ns);
        self.log.dirty_bytes -= std::mem::take(&mut local.dirty_bytes);
        self.log.dirty.remove(&id);
        let cost = OP_COST + blocks.iter().map(|b| BLOCK_BYTES.min(len.saturating_sub(b * BLOCK_BYTES)) as usize).sum::<usize>();
        if let Some(pending) = self.queued_last(id)
            && let Op::Write { changes: queued, mtime_ns, .. } = &mut pending.op
            && pending.blocks + blocks.len() <= SEAL_BLOCKS
        {
            queued.extend(changes);
            *mtime_ns = mtime;
            pending.cost += cost;
            pending.blocks += blocks.len();
            pending.acked = pending.acked.min(acked);
            let seq = pending.seq;
            self.log.cost += cost;
            self.layer(id, seq, layer);
            return;
        }
        let seq = self.push(Op::Write { id, changes, mtime_ns: mtime }, acked, Vec::new());
        if let Some(pending) = self.log.queue.back_mut() {
            pending.cost = cost;
            pending.blocks = blocks.len();
        }
        self.log.cost += cost - OP_COST;
        self.layer(id, seq, layer);
    }

    /// Records `changes`, sealed into op `seq`, as `id`'s latest layer (merged when `seq` already
    /// has one: a seal only merges into the latest queued op of the object).
    fn layer(&mut self, id: Id, seq: u64, changes: Vec<Change>) {
        let Some(local) = self.locals.get_mut(&id) else { return };
        match local.layers.last_mut() {
            Some((last, layer)) if *last == seq => layer.extend(changes),
            _ => local.layers.push((seq, changes)),
        }
    }

    /// Queues a mode/mtime change of `id` (which must have a `Local`), folded into its latest
    /// queued op when that op can carry it.
    pub fn set_attr(&mut self, id: Id, mode: Option<u32>, mtime: Option<i64>, acked: Instant) {
        self.seal(id);
        if let Some(pending) = self.queued_last(id) {
            match &mut pending.op {
                Op::Create { mode: m, mtime_ns: t, .. } => {
                    *m = mode.unwrap_or(*m);
                    *t = mtime.unwrap_or(*t);
                    return;
                }
                Op::Write { mtime_ns: t, .. } if mode.is_none() => {
                    *t = mtime.or(*t);
                    return;
                }
                Op::SetAttr { mode: m, mtime_ns: t, .. } => {
                    *m = mode.or(*m);
                    *t = mtime.or(*t);
                    return;
                }
                _ => {}
            }
        }
        self.push(Op::SetAttr { id, mode, mtime_ns: mtime }, acked, Vec::new());
    }

    pub fn mark_dirty(&mut self, id: Id, bytes: usize) {
        self.log.dirty.insert(id);
        self.log.dirty_bytes += bytes;
    }

    /// @cc [owner:fontanierh,label:product;performance] admission-projects-apply
    /// A new mutation MUST wait while the next batch could not carry everything acknowledged, or
    /// while the oldest uncommitted mutation (in flight included) could not commit within the
    /// window: its age plus one `Apply` (two while a batch is in flight: the rest of that one,
    /// then the next) exceeds `budget.window`. An `Apply` is assumed to take as long as the
    /// slowest of the last `RECENT_APPLIES`, the one in flight so far, and `MIN_APPLY`. With
    /// nothing uncommitted a mutation is always admitted.
    pub fn backlogged(&self) -> bool {
        let log = &self.log;
        if log.queue.len() >= BATCH_OPS || log.cost + log.dirty_bytes >= BATCH_BYTES {
            return true;
        }
        let oldest = log.in_flight_since.or(log.queue.front().map(|p| p.acked));
        let Some(oldest) = log.dirty.iter().filter_map(|id| self.locals.get(id)?.dirty_since).chain(oldest).min() else {
            return false;
        };
        let apply = log.recent.iter().copied().chain(log.sent_at.map(|t| t.elapsed())).max().unwrap_or_default().max(MIN_APPLY);
        let applies = if log.sent_at.is_some() { 2 } else { 1 };
        oldest.elapsed() + apply * applies > self.budget.window
    }

    /// Seals every unsealed change and takes the next batch from the queue.
    pub fn take_batch(&mut self) -> Vec<Pending> {
        let dirty: Vec<Id> = self.log.dirty.iter().copied().collect();
        for id in dirty {
            self.seal(id);
        }
        let mut batch = Vec::new();
        let mut cost = 0;
        while batch.len() < BATCH_OPS && (batch.is_empty() || cost < BATCH_BYTES) {
            let Some(pending) = self.log.queue.pop_front() else { break };
            cost += pending.cost;
            batch.push(pending);
        }
        self.log.cost -= cost;
        if self.log.queue.is_empty() {
            self.log.last.clear();
        }
        self.log.in_flight = !batch.is_empty();
        self.log.in_flight_since = batch.iter().map(|p| p.acked).min();
        self.log.sent_at = (!batch.is_empty()).then(Instant::now);
        batch
    }

    /// Applies the outcome of a batch sent at `sent` to the overlay and the cache.
    pub fn finish(&mut self, batch: Vec<Pending>, outcome: Outcome, sent: Instant) -> Vec<String> {
        let now = Instant::now();
        let mut failures = Vec::new();
        let (version, results, attrs) = match outcome {
            Ok(outcome) => outcome,
            Err(errno) => (0, vec![Some(errno); batch.len()], Vec::new()),
        };
        let stats = &mut self.log.stats;
        stats.batches += 1;
        stats.ops += batch.len() as u64;
        stats.apply += now - sent;
        stats.max_apply = stats.max_apply.max(now - sent);
        self.log.sent_at = None;
        if self.log.recent.len() == RECENT_APPLIES {
            self.log.recent.pop_front();
        }
        self.log.recent.push_back(now - sent);
        let mut locals = Vec::new();
        for (pending, result) in batch.iter().zip(results) {
            let lag = now - pending.acked;
            self.log.stats.max_lag = self.log.stats.max_lag.max(lag);
            let send_delay = sent.saturating_duration_since(pending.acked);
            self.log.stats.max_send_delay = self.log.stats.max_send_delay.max(send_delay);
            if lag > self.budget.window {
                self.log.stats.missed += 1;
            }
            for (parent, name, _) in &pending.names {
                self.unbind(*parent, name, pending.seq);
            }
            match result {
                None => {
                    // A directory this mount created was empty at its commit, but for what later
                    // ops of the batch (patched in below) put in it.
                    if let Op::Create { id, kind: Kind::Dir, .. } = &pending.op {
                        self.listings.insert(*id, Cached { value: Listing::new(), stamp: sent, version });
                    }
                    for (parent, name, value) in &pending.names {
                        self.names.insert((*parent, name.clone()), Cached { value: *value, stamp: sent, version });
                        if let Some(listing) = self.listings.get_mut(parent).filter(|c| c.version <= version) {
                            match value {
                                Some(value) => listing.value.insert(name.clone(), *value),
                                None => listing.value.remove(name),
                            };
                        }
                        if let Some((id, _)) = value {
                            self.places.insert(*id, (*parent, name.clone()));
                        }
                    }
                    for id in &pending.touched {
                        let floor = self.floor.entry(*id).or_default();
                        *floor = (*floor).max(version);
                    }
                    if let Op::Remove { id, .. } = &pending.op {
                        self.attrs.remove(id);
                    }
                    if let Op::Create { id, .. } = &pending.op
                        && let Some(local) = self.locals.get_mut(id)
                    {
                        local.unborn = false;
                    }
                }
                Some(errno) => {
                    for (parent, name, _) in &pending.names {
                        self.names.remove(&(*parent, name.clone()));
                        self.listings.remove(parent);
                    }
                    for id in &pending.touched {
                        self.attrs.remove(id);
                    }
                    self.log.stats.dropped += 1;
                    self.log.failed.get_or_insert(errno);
                    failures.push(format!("{:?} failed: errno {}", Summary(&pending.op), errno.0));
                }
            }
            if let Some(id) = pending.local
                && let Some(local) = self.locals.get_mut(&id)
            {
                // Committed or dropped: the server's content now carries it, or never will.
                local.layers.retain(|(seq, _)| *seq != pending.seq);
                local.pending = local.pending.saturating_sub(1);
                if local.pending == 0 && local.dirty.is_empty() {
                    local.quiet_since = Some(now);
                }
                locals.push(id);
            }
        }
        for attr in attrs {
            self.install_attr(attr, sent, version);
        }
        for id in locals {
            self.release_local(id);
        }
        if let Some(last) = batch.last() {
            self.log.done = last.seq + 1;
        }
        self.log.in_flight = false;
        self.log.in_flight_since = None;
        failures
    }

    /// Forgets `id`'s `Local` once nothing of it remains to commit or serve.
    pub fn release_local(&mut self, id: Id) {
        if self.locals.get(&id).is_some_and(Local::idle) {
            self.locals.remove(&id);
        }
    }
}

/// An op without its payload, for failure logs.
struct Summary<'a>(&'a Op);

impl std::fmt::Debug for Summary<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.0 {
            Op::Create { parent, name, id, kind, .. } => write!(f, "create {kind:?} {parent}/{name} as {id}"),
            Op::Remove { parent, name, id } => write!(f, "remove {parent}/{name} ({id})"),
            Op::Rename { parent, name, id, new_parent, new_name, .. } => {
                write!(f, "rename {parent}/{name} ({id}) to {new_parent}/{new_name}")
            }
            Op::Write { id, .. } => write!(f, "write {id}"),
            Op::SetAttr { id, .. } => write!(f, "setattr {id}"),
        }
    }
}

impl Pending {
    /// The op without its content payload (kept for bookkeeping once the payload is sent).
    pub fn op_summary(&self) -> Op {
        match &self.op {
            Op::Write { id, mtime_ns, .. } => Op::Write { id: *id, changes: Vec::new(), mtime_ns: *mtime_ns },
            op => op.clone(),
        }
    }
}
