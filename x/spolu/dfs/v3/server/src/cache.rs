use crate::{
    auth::SessionState,
    model::{Parent, Record},
    profile::{self, Guard, Phase},
    storage::{self, Storage, WriteBatch, after},
};
use anyhow::ensure;
use bytes::Bytes;
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use futures::{StreamExt, TryStreamExt, stream};
use parking_lot::{Mutex, RwLock};

mod blocks;
mod index;
use blocks::Blocks;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, VecDeque},
    ops::{Bound, RangeBounds},
    sync::{
        Arc, Weak,
        atomic::{AtomicBool, AtomicI64, AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{Notify, OnceCell};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
type Rows = BTreeMap<Vec<u8>, Bytes>;
const FAILED: i64 = -1;
const PENDING: i64 = 0;
const MAX_ENTRIES: usize = 16_384;
const MAX_READS: usize = 65_536;

#[derive(Args, Clone, Debug)]
pub struct CacheConfig {
    #[arg(
        long,
        env = "MAX_EVENTUAL_CONSISTENCY_DELAY_MS",
        default_value_t = 1000
    )]
    pub max_eventual_consistency_delay_ms: u64,
    #[arg(long, env = "DFS_CACHE_MIB", default_value_t = 1024)]
    pub cache_mib: usize,
    #[arg(long, env = "DFS_DIRTY_MIB", default_value_t = 256)]
    pub dirty_mib: usize,
    #[arg(long, env = "DFS_PERSIST_CONCURRENCY", default_value_t = 16)]
    pub persist_concurrency: usize,
}
impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_eventual_consistency_delay_ms: 1000,
            cache_mib: 1024,
            dirty_mib: 256,
            persist_concurrency: 16,
        }
    }
}
impl CacheConfig {
    fn freshness(&self) -> Duration {
        Duration::from_millis(self.max_eventual_consistency_delay_ms / 2)
    }
    fn publication(&self) -> Duration {
        self.freshness()
    }
}
#[derive(Default)]
struct Metrics {
    hits: AtomicU64,
    misses: AtomicU64,
    accepted: AtomicU64,
    commits: AtomicU64,
    failures: AtomicU64,
    block_hits: AtomicU64,
    block_misses: AtomicU64,
    block_evictions: AtomicU64,
}
struct Budget {
    used: AtomicUsize,
    limit: usize,
}
struct Charge {
    budget: Arc<Budget>,
    bytes: usize,
}
impl Budget {
    fn reserve(self: &Arc<Self>, bytes: usize) -> Result<Charge> {
        self.used
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |v| {
                v.checked_add(bytes).filter(|n| *n <= self.limit)
            })
            .map_err(|_| status(ErrorCode::Capacity))?;
        Ok(Charge {
            budget: self.clone(),
            bytes,
        })
    }
}
impl Drop for Charge {
    fn drop(&mut self) {
        self.budget.used.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}
struct Value<T> {
    value: T,
    _charge: Charge,
}
type PointCell = Arc<OnceCell<Arc<Value<Option<Bytes>>>>>;
type CachedRange = Arc<Value<(Rows, bool)>>;
type RangeKey = (Vec<u8>, Vec<u8>);
struct Base {
    raw: Arc<storage::Snapshot>,
    expires: Instant,
    invalid: AtomicBool,
    invalidated: Mutex<Vec<RangeKey>>,
    points: RwLock<HashMap<Vec<u8>, PointCell>>,
    ranges: Mutex<BTreeMap<RangeKey, CachedRange>>,
}
impl Base {
    fn valid(&self) -> bool {
        Instant::now() < self.expires
            && !self.invalid.load(Ordering::Acquire)
            && !self.raw.expired()
    }
    fn invalidate(&self, batch: &WriteBatch) {
        let mut ranges = self.invalidated.lock();
        for mutation in &batch.0 {
            let range = match mutation {
                storage::Mutation::Put(k, _) | storage::Mutation::Delete(k) => {
                    (k.clone(), after(k))
                }
                storage::Mutation::Clear(a, b) => (a.clone(), b.clone()),
            };
            if ranges.len() < MAX_READS {
                ranges.push(range);
            } else {
                self.invalid.store(true, Ordering::Release);
                break;
            }
        }
    }
    fn check(&self, start: &[u8], end: &[u8]) -> Result<()> {
        if self
            .invalidated
            .lock()
            .iter()
            .any(|(a, b)| a.as_slice() < end && start < b.as_slice())
        {
            return Err(retry());
        }
        Ok(())
    }
}
#[derive(Clone)]
enum Read {
    Point(Vec<u8>, Option<Bytes>),
    Ancestry(Vec<u8>, Option<(String, bool, Option<Parent>)>),
    Range(Vec<u8>, Vec<u8>, Rows),
}
impl Read {
    fn bounds(&self) -> (Vec<u8>, Vec<u8>) {
        match self {
            Self::Point(k, _) | Self::Ancestry(k, _) => (k.clone(), after(k)),
            Self::Range(a, b, _) => (a.clone(), b.clone()),
        }
    }
    fn bytes(&self) -> usize {
        match self {
            Self::Ancestry(k, _) => k.len() + 1024,
            Self::Point(k, v) => k.len() + v.as_ref().map_or(0, Bytes::len) + 128,
            Self::Range(a, b, r) => {
                a.len()
                    + b.len()
                    + r.iter()
                        .map(|(k, v)| k.len() + v.len() + 128)
                        .sum::<usize>()
                    + 128
            }
        }
    }
}
#[derive(Clone)]
struct Dependency {
    seq: u64,
    outcome: Arc<AtomicI64>,
}
struct Entry {
    seq: u64,
    base: Arc<Base>,
    batch: WriteBatch,
    reads: Vec<Read>,
    deps: Vec<Dependency>,
    overlay_reads: bool,
    scope: BTreeSet<Vec<u8>>,
    coalesce: bool,
    created: Option<Vec<u8>>,
    accepted: Instant,
    deadline: Instant,
    outcome: Arc<AtomicI64>,
    inflight: AtomicBool,
    session: Weak<SessionState>,
    _charge: Charge,
    dirty: Mutex<Option<Charge>>,
}
struct Receipt {
    session: Weak<SessionState>,
    error: Status,
}
#[derive(Default)]
struct Inner {
    journal: BTreeMap<u64, Arc<Entry>>,
    pending: BTreeMap<u64, Arc<Entry>>,
    participants: BTreeMap<Vec<u8>, BTreeSet<u64>>,
    index: index::Index,
    seq: u64,
    receipts: BTreeMap<(String, Vec<u8>), Receipt>,
}

/// @cc [owner:spolu,label:concurrency] atomic-overlay-cuts
/// The journal lock MUST cover only RAM work. Each request pins one FDB snapshot and one complete
/// overlay cut. Acceptance MUST validate its local read dependencies before atomically adding edits.
/// Publication MUST NOT hold this lock or any object gate during FDB I/O.
pub struct Cache {
    storage: Storage,
    config: CacheConfig,
    budget: Arc<Budget>,
    dirty: Arc<Budget>,
    blocks: Mutex<Blocks>,
    base: tokio::sync::Mutex<Option<Arc<Base>>>,
    inner: RwLock<Inner>,
    wake: Notify,
    stop: AtomicBool,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    metrics: Metrics,
    #[cfg(test)]
    pub(crate) paused: AtomicBool,
    #[cfg(test)]
    pub(crate) lose_commit_reply: AtomicBool,
}
impl Cache {
    pub fn new(storage: Storage, config: CacheConfig) -> anyhow::Result<Arc<Self>> {
        ensure!(
            matches!(config.max_eventual_consistency_delay_ms, 1000 | 8000),
            "D must be 1000 or 8000 ms"
        );
        ensure!(
            (16..=16_384).contains(&config.cache_mib)
                && config.dirty_mib > 0
                && config.dirty_mib < config.cache_mib,
            "invalid cache budgets"
        );
        ensure!(
            (1..=64).contains(&config.persist_concurrency),
            "invalid publication concurrency"
        );
        Ok(Arc::new(Self {
            storage,
            budget: Arc::new(Budget {
                used: AtomicUsize::new(0),
                limit: config.cache_mib * 1024 * 1024,
            }),
            dirty: Arc::new(Budget {
                used: AtomicUsize::new(0),
                limit: config.dirty_mib * 1024 * 1024,
            }),
            config,
            blocks: Default::default(),
            base: Default::default(),
            inner: Default::default(),
            wake: Notify::new(),
            stop: AtomicBool::new(false),
            task: Default::default(),
            metrics: Default::default(),
            #[cfg(test)]
            paused: AtomicBool::new(false),
            #[cfg(test)]
            lose_commit_reply: AtomicBool::new(false),
        }))
    }
    pub(crate) fn start(self: &Arc<Self>) {
        let weak = Arc::downgrade(self);
        *self.task.lock() = Some(tokio::spawn(async move {
            let mut jobs = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_millis(2)) => (),
                    _ = jobs.join_next(), if !jobs.is_empty() => (),
                }
                let Some(cache) = weak.upgrade() else {
                    break;
                };
                if cache.stop.load(Ordering::Acquire) {
                    break;
                }
                let available = cache.config.persist_concurrency.saturating_sub(jobs.len());
                for group in cache.select(available) {
                    let cache = cache.clone();
                    jobs.spawn(async move {
                        cache.publish(group).await;
                    });
                }
            }
        }));
    }

    pub(crate) async fn invalidate_base(&self) {
        if let Some(base) = self.base.lock().await.take() {
            base.invalid.store(true, Ordering::Release);
        }
    }
    pub(crate) async fn snapshot(self: &Arc<Self>) -> Result<Arc<Snapshot>> {
        let _profile = Guard::new(Phase::Snapshot);
        let mut slot = self.base.lock().await;
        let base = match slot.as_ref().filter(|b| b.valid()) {
            Some(base) if base.invalidated.lock().is_empty() => base.clone(),
            _ => {
                let raw = self.storage.snapshot().await?;
                let expires = raw.started + self.config.freshness();
                if Instant::now() >= expires {
                    return Err(status(ErrorCode::Unavailable));
                }
                let base = Arc::new(Base {
                    raw,
                    expires,
                    invalid: AtomicBool::new(false),
                    invalidated: Default::default(),
                    points: Default::default(),
                    ranges: Default::default(),
                });
                *slot = Some(base.clone());
                base
            }
        };
        drop(slot);
        let _profile = Guard::new(Phase::SnapshotRam);
        let cut = self.inner.read().seq;
        Ok(Arc::new(Snapshot {
            cache: self.clone(),
            base,
            cut,
            reads: Default::default(),
            used: Default::default(),
        }))
    }
    /// @cc [owner:spolu,label:concurrency] bounded-history-retirement
    /// An edit accepted at A MUST remain indexed until A + P + C, unless still pending (retain it).
    /// A successful publication finishes by A + P; any base that predates it expires by A + P + C.
    /// Thus removing the terminal oldest prefix MUST NOT remove data needed by a valid pinned view.
    fn reap(&self, inner: &mut Inner) {
        let mut profile = Guard::new(Phase::Reap);
        let mut retired = 0;
        let now = Instant::now();
        while inner.journal.first_key_value().is_some_and(|(_, e)| {
            e.outcome.load(Ordering::Acquire) != PENDING
                && now >= e.deadline + self.config.freshness()
        }) {
            if let Some((_, entry)) = inner.journal.pop_first() {
                inner.index.remove(&entry);
                retired += 1;
            }
        }
        profile.items(retired);
        inner
            .receipts
            .retain(|_, r| r.session.upgrade().is_some_and(|s| s.active().is_ok()));
    }
    pub(crate) fn error(&self, session: &SessionState, key: &[u8]) -> Result<()> {
        match self
            .inner
            .read()
            .receipts
            .get(&(session.info.id.clone(), key.to_vec()))
        {
            Some(r) => Err(r.error.clone()),
            None => Ok(()),
        }
    }
    /// @cc [owner:spolu,label:backend] acknowledge-only-complete-edits
    /// Capacity or local-conflict rejection MUST occur before acceptance. Once accepted, all keys
    /// become visible atomically and keep their original deadline, including through fsync.
    /// The caller MUST supply all object participants; edits touching the same physical key MUST
    /// share a participant so publication preserves their local sequence order.
    pub(crate) fn accept(
        &self,
        snapshot: &Snapshot,
        batch: WriteBatch,
        scope: BTreeSet<Vec<u8>>,
        coalesce: bool,
        created: Option<Vec<u8>>,
        session: &Arc<SessionState>,
    ) -> Result<()> {
        let _profile = Guard::new(Phase::Accept);
        snapshot.valid()?;
        if batch.0.is_empty() {
            return Ok(());
        }
        let reads = snapshot.reads.lock().clone();
        let mut inner = self.inner.write();
        snapshot.valid()?;
        self.reap(&mut inner);
        for key in &scope {
            if let Some(r) = inner.receipts.get(&(session.info.id.clone(), key.clone())) {
                return Err(r.error.clone());
            }
        }
        if inner.journal.len() >= MAX_ENTRIES
            || inner.receipts.len() + inner.journal.len() >= 32_768
            || reads.len() > MAX_READS
        {
            return Err(status(ErrorCode::Capacity));
        }
        for read in &reads {
            let (start, end) = read.bounds();
            if inner.index.changed_after(&start, &end, snapshot.cut) {
                return Err(retry());
            }
        }
        let overlay_reads = !snapshot.used.lock().is_empty();
        let mut deps: BTreeMap<_, _> = snapshot
            .used
            .lock()
            .iter()
            .filter(|(_, e)| e.outcome.load(Ordering::Acquire) == PENDING)
            .map(|(s, e)| {
                (
                    *s,
                    Dependency {
                        seq: *s,
                        outcome: e.outcome.clone(),
                    },
                )
            })
            .collect();
        for key in &scope {
            if let Some(sequences) = inner.participants.get(key) {
                for seq in sequences {
                    if let Some(e) = inner.pending.get(seq) {
                        deps.insert(
                            *seq,
                            Dependency {
                                seq: *seq,
                                outcome: e.outcome.clone(),
                            },
                        );
                    }
                }
            }
        }
        if deps
            .values()
            .any(|e| e.outcome.load(Ordering::Acquire) == FAILED)
        {
            return Err(retry());
        }
        let bytes = batch.bytes()
            + index::Index::charge(&batch)?
            + reads.iter().map(Read::bytes).sum::<usize>()
            + deps.len() * 64
            + scope.iter().map(|k| 2 * k.len() + 256).sum::<usize>()
            + 512;
        let charge = self.reserve(bytes)?;
        let dirty = self.dirty.reserve(bytes)?;
        session.active()?;
        inner.seq += 1;
        let accepted = Instant::now();
        let entry = Arc::new(Entry {
            seq: inner.seq,
            base: snapshot.base.clone(),
            batch,
            reads,
            deps: deps.into_values().collect(),
            overlay_reads,
            scope,
            coalesce,
            created,
            accepted,
            deadline: accepted + self.config.publication(),
            outcome: Arc::new(AtomicI64::new(PENDING)),
            inflight: AtomicBool::new(false),
            session: Arc::downgrade(session),
            _charge: charge,
            dirty: Mutex::new(Some(dirty)),
        });
        inner.index.insert(&entry);
        for key in &entry.scope {
            inner
                .participants
                .entry(key.clone())
                .or_default()
                .insert(entry.seq);
        }
        inner.pending.insert(entry.seq, entry.clone());
        inner.journal.insert(entry.seq, entry);
        self.metrics.accepted.fetch_add(1, Ordering::Relaxed);
        self.wake.notify_waiters();
        Ok(())
    }
    fn retire_pending(inner: &mut Inner, entry: &Entry) {
        inner.pending.remove(&entry.seq);
        for key in &entry.scope {
            if let Some(sequences) = inner.participants.get_mut(key) {
                sequences.remove(&entry.seq);
                if sequences.is_empty() {
                    inner.participants.remove(key);
                }
            }
        }
    }
    fn reject_locked(&self, inner: &mut Inner, entry: &Arc<Entry>, error: Status) {
        if entry
            .outcome
            .compare_exchange(PENDING, FAILED, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }
        tracing::debug!(
            sequence = entry.seq,
            age_ms = entry.accepted.elapsed().as_millis() as u64,
            participants = entry.scope.len(),
            created = entry.created.is_some(),
            "RAM edit rejected"
        );
        Self::retire_pending(inner, entry);
        entry.dirty.lock().take();
        entry.base.invalidate(&entry.batch);
        if let Some(s) = entry.session.upgrade() {
            for key in &entry.scope {
                inner
                    .receipts
                    .entry((s.info.id.clone(), key.clone()))
                    .or_insert_with(|| Receipt {
                        session: entry.session.clone(),
                        error: error.clone(),
                    });
            }
        }
        self.metrics.failures.fetch_add(1, Ordering::Relaxed);
    }
    /// @cc [owner:spolu,label:concurrency] frozen-publication-scope
    /// Coalescing MUST retain one file's scope, or a create's original parent-and-child scope.
    /// Initial child writes MAY join an unfrozen create. Other namespace edits MUST remain distinct.
    /// A frozen prefix MUST precede later overlapping publications without blocking RAM acceptance.
    fn select(&self, limit: usize) -> Vec<Vec<Arc<Entry>>> {
        let _profile = Guard::new(Phase::Select);
        {
            let mut inner = self.inner.write();
            self.reap(&mut inner);
            let entries: Vec<_> = inner.pending.values().cloned().collect();
            for e in &entries {
                if Instant::now() >= e.deadline
                    || e.deps
                        .iter()
                        .any(|d| d.outcome.load(Ordering::Acquire) == FAILED)
                {
                    self.reject_locked(&mut inner, e, status(ErrorCode::Unavailable));
                }
            }
            #[cfg(test)]
            if self.paused.load(Ordering::Acquire) {
                return Vec::new();
            }
            if limit == 0 {
                return Vec::new();
            }
            let mut groups = Vec::<Vec<Arc<Entry>>>::new();
            let mut selected = BTreeSet::new();
            for e in entries.iter().filter(|e| {
                e.outcome.load(Ordering::Acquire) == PENDING && !e.inflight.load(Ordering::Acquire)
            }) {
                if selected.contains(&e.seq) || e.accepted.elapsed() < Duration::from_millis(25) {
                    continue;
                }
                if e.deps
                    .iter()
                    .any(|d| d.outcome.load(Ordering::Acquire) == PENDING)
                {
                    continue;
                }
                let mut group = vec![e.clone()];
                let mut bytes = e.batch.bytes();
                selected.insert(e.seq);
                if (e.coalesce && e.scope.len() == 1) || e.created.is_some() {
                    let child_scope = e.created.as_ref().map(|k| BTreeSet::from([k.clone()]));
                    let merge_scope = child_scope.as_ref().unwrap_or(&e.scope);
                    for later in entries.iter().filter(|n| {
                        n.seq > e.seq
                            && !n.scope.is_disjoint(merge_scope)
                            && n.outcome.load(Ordering::Acquire) == PENDING
                    }) {
                        if later.scope != *merge_scope {
                            break;
                        }
                        if !later.coalesce
                            || later.inflight.load(Ordering::Acquire)
                            || bytes + later.batch.bytes() > 4 * 1024 * 1024
                            || group.len() >= 64
                            || later.reads.iter().any(|r| matches!(r, Read::Range(..)))
                        {
                            break;
                        }
                        if later.deps.iter().any(|d| {
                            d.outcome.load(Ordering::Acquire) == PENDING
                                && !group.iter().any(|p| p.seq == d.seq)
                        }) {
                            break;
                        }
                        bytes += later.batch.bytes();
                        selected.insert(later.seq);
                        group.push(later.clone());
                    }
                }
                for item in &group {
                    item.inflight.store(true, Ordering::Release);
                }
                groups.push(group);
                if groups.len() >= limit {
                    break;
                }
            }
            groups
        }
    }

    /// @cc [owner:spolu,label:concurrency;security] validate-publication-dependencies
    /// Reuse an old read version only with all original conflict ranges. At a new read version,
    /// compare every cached precondition before writing. Unknown/timeout outcomes MUST NOT replay.
    /// Definitely uncommitted conflicts MAY retry, only within the original deadline.
    async fn publish(&self, group: Vec<Arc<Entry>>) {
        let _profile = Guard::new(Phase::Publish);
        let mut batch = WriteBatch::new();
        let mut reads = BTreeMap::new();
        let mut dependencies = false;
        for e in &group {
            dependencies |=
                e.overlay_reads || e.deps.iter().any(|d| !group.iter().any(|p| p.seq == d.seq));
            for read in &e.reads {
                let (a, b) = read.bounds();
                if !batch.intersects(&a, &b) {
                    let previous = reads.entry((a, b)).or_insert_with(|| read.clone());
                    if matches!(previous, Read::Ancestry(..)) && matches!(read, Read::Point(..)) {
                        *previous = read.clone();
                    }
                }
            }
            batch.0.extend(e.batch.0.clone());
        }
        let first = &group[0];
        let mut result = Err(status(ErrorCode::Unavailable));
        let mut attempt = 0u32;
        loop {
            let remaining = first.deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero()
                || group
                    .iter()
                    .any(|e| e.outcome.load(Ordering::Acquire) != PENDING)
            {
                break;
            }
            let reuse = attempt == 0
                && !dependencies
                && first.base.raw.started.elapsed() < Duration::from_millis(3000);
            let prepared = async {
                let raw = self
                    .storage
                    .at(reuse.then_some(first.base.raw.version), remaining)
                    .await?;
                if !reuse {
                    let checks = stream::iter(reads.values().cloned().collect::<Vec<_>>())
                        .map(|r| {
                            let raw = raw.clone();
                            async move {
                                match r {
                                    Read::Point(k, v) => Ok::<_, Status>(raw.get(k).await? == v),
                                    Read::Ancestry(k, expected) => {
                                        Ok(ancestry_value(raw.get(k).await?)? == expected)
                                    }
                                    Read::Range(a, b, rows) => {
                                        let (found, more) =
                                            raw.range(&a, &b, rows.len() + 1).await?;
                                        Ok(!more && found == rows)
                                    }
                                }
                            }
                        })
                        .buffer_unordered(16)
                        .try_collect::<Vec<_>>()
                        .await?;
                    if checks.iter().any(|v| !*v) {
                        tracing::debug!(
                            first_sequence = first.seq,
                            checks = checks.len(),
                            "publication precondition changed"
                        );
                        return Err(status(ErrorCode::Unavailable));
                    }
                }
                let conflict_bytes: usize = reads.keys().map(|(a, b)| a.len() + b.len() + 64).sum();
                if batch.bytes() + conflict_bytes > 8 * 1024 * 1024 {
                    return Err(status(ErrorCode::Capacity));
                }
                for (a, b) in reads.keys() {
                    raw.conflict(a, b)?;
                }
                batch.apply(&raw)?;
                Ok(raw)
            }
            .await;
            let raw = match prepared {
                Ok(raw) => raw,
                Err(e) => {
                    result = Err(e);
                    break;
                }
            };
            let committed = storage::commit(raw).await;
            #[cfg(test)]
            let committed =
                if committed.is_ok() && self.lose_commit_reply.swap(false, Ordering::AcqRel) {
                    Err(foundationdb::FdbError::from_code(1021))
                } else {
                    committed
                };
            match committed {
                Ok(version) => {
                    result = Ok(version);
                    break;
                }
                Err(error) if error.is_retryable_not_committed() => {
                    result = Err(storage::failed(error));
                    attempt = attempt.saturating_add(1);
                }
                Err(error) => {
                    result = Err(storage::failed(error));
                    break;
                }
            }
        }
        let mut inner = self.inner.write();
        match result {
            Ok(version) => {
                self.metrics.commits.fetch_add(1, Ordering::Relaxed);
                for e in &group {
                    if Instant::now() >= e.deadline {
                        self.reject_locked(&mut inner, e, status(ErrorCode::Unavailable));
                    }
                    Self::retire_pending(&mut inner, e);
                    e.dirty.lock().take();
                    if e.outcome
                        .compare_exchange(PENDING, version, Ordering::AcqRel, Ordering::Acquire)
                        .is_err()
                    {
                        e.base.invalidate(&e.batch);
                    }
                }
            }
            Err(error) => {
                for e in &group {
                    self.reject_locked(&mut inner, e, error.clone());
                }
            }
        }
        let entries: Vec<_> = inner.pending.values().cloned().collect();
        for e in entries {
            if e.deps
                .iter()
                .any(|d| d.outcome.load(Ordering::Acquire) == FAILED)
            {
                self.reject_locked(&mut inner, &e, status(ErrorCode::Unavailable));
            }
        }
    }
    #[cfg(test)]
    pub(crate) async fn expire_read_transaction(&self) -> Result<Arc<storage::Snapshot>> {
        let raw = self
            .base
            .lock()
            .await
            .as_ref()
            .ok_or_else(|| status(ErrorCode::Internal))?
            .raw
            .clone();
        raw.expire_for_test()?;
        tokio::time::sleep(Duration::from_millis(5)).await;
        Ok(raw)
    }
    #[cfg(test)]
    pub(crate) fn commits(&self) -> u64 {
        self.metrics.commits.load(Ordering::Relaxed)
    }
    #[cfg(test)]
    pub(crate) fn block_metrics(&self) -> (u64, u64, u64) {
        (
            self.metrics.block_hits.load(Ordering::Relaxed),
            self.metrics.block_misses.load(Ordering::Relaxed),
            self.metrics.block_evictions.load(Ordering::Relaxed),
        )
    }
    pub async fn drain(&self) -> Result<()> {
        let started = Instant::now();
        while !self.inner.read().pending.is_empty() {
            if started.elapsed() > Duration::from_secs(10) {
                return Err(status(ErrorCode::Unavailable));
            }
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        profile::report();
        tracing::info!(
            drain_ms = started.elapsed().as_millis() as u64,
            accepted = self.metrics.accepted.load(Ordering::Relaxed),
            commits = self.metrics.commits.load(Ordering::Relaxed),
            failures = self.metrics.failures.load(Ordering::Relaxed),
            cache_hits = self.metrics.hits.load(Ordering::Relaxed),
            cache_misses = self.metrics.misses.load(Ordering::Relaxed),
            block_hits = self.metrics.block_hits.load(Ordering::Relaxed),
            block_misses = self.metrics.block_misses.load(Ordering::Relaxed),
            block_evictions = self.metrics.block_evictions.load(Ordering::Relaxed),
            "cache drained"
        );
        if !self.inner.read().receipts.is_empty() {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(())
    }
}
impl Drop for Cache {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(task) = self.task.get_mut().take() {
            task.abort();
        }
    }
}

/// Values in one base share an FDB read version and absolute expiry. The cut pins a complete prefix
/// of accepted RAM edits; indexed reads MUST exclude later edits, without copying their history.
pub(crate) struct Snapshot {
    cache: Arc<Cache>,
    base: Arc<Base>,
    cut: u64,
    reads: Mutex<Vec<Read>>,
    used: Mutex<BTreeMap<u64, Arc<Entry>>>,
}
impl Snapshot {
    pub(crate) fn valid(&self) -> Result<()> {
        if !self.base.valid() {
            return Err(retry());
        }
        if !self.base.invalidated.lock().is_empty() {
            for read in self.reads.lock().iter() {
                let (a, b) = read.bounds();
                self.base.check(&a, &b)?;
            }
        }
        if self.used.lock().values().any(|e| {
            e.outcome.load(Ordering::Acquire) == FAILED
                || (e.outcome.load(Ordering::Acquire) == PENDING && Instant::now() >= e.deadline)
        }) {
            return Err(retry());
        }
        Ok(())
    }
    fn use_entry(&self, e: &Arc<Entry>) -> Result<()> {
        let outcome = e.outcome.load(Ordering::Acquire);
        if outcome == FAILED
            || (outcome == PENDING
                && (Instant::now() >= e.deadline || e.base.raw.version != self.base.raw.version))
        {
            return Err(retry());
        }
        self.used.lock().insert(e.seq, e.clone());
        Ok(())
    }
    fn record(&self, read: Read) -> Result<()> {
        let mut reads = self.reads.lock();
        if reads.len() >= MAX_READS {
            return Err(status(ErrorCode::Capacity));
        }
        reads.push(read);
        Ok(())
    }
    pub(crate) async fn get(&self, key: impl AsRef<[u8]>) -> Result<Option<Bytes>> {
        let key = key.as_ref();
        let value = self.load(key, true).await?;
        self.record(Read::Point(key.to_vec(), value.clone()))?;
        Ok(value)
    }
    pub(crate) async fn ancestry(&self, key: Vec<u8>) -> Result<Option<Record>> {
        let value = self.load(&key, true).await?;
        let record: Option<Record> = value.as_deref().map(storage::decode).transpose()?;
        let ancestry = record
            .as_ref()
            .map(|r| (r.object.id.clone(), r.object.directory, r.parent.clone()));
        self.record(Read::Ancestry(key, ancestry))?;
        Ok(record)
    }
    /// @cc [owner:spolu,label:security;performance] hot-prefetch-is-advisory
    /// A hot key MAY skip speculative warming, even if its value has changed or become invalid.
    /// Semantic reads MUST still resolve the index and validate the view before using any value.
    pub(crate) fn hot(&self, key: &[u8]) -> bool {
        if self
            .base
            .points
            .read()
            .get(key)
            .is_some_and(|cell| cell.get().is_some())
        {
            return true;
        }
        self.cache
            .inner
            .read()
            .index
            .point(key, self.cut, self.base.raw.version)
            .0
            .is_some()
    }
    pub(crate) async fn peek(&self, key: Vec<u8>) -> Result<()> {
        if !self.hot(&key) {
            self.load(&key, false).await?;
        }
        Ok(())
    }
    async fn load(&self, key: &[u8], consume: bool) -> Result<Option<Bytes>> {
        self.valid()?;
        self.base.check(key, &after(key))?;
        let mut profile = Guard::new(Phase::Overlay);
        let (change, examined) =
            self.cache
                .inner
                .read()
                .index
                .point(key, self.cut, self.base.raw.version);
        profile.items(examined);
        if let Some(change) = change {
            if consume {
                self.use_entry(&change.entry)?;
            }
            return Ok(match change.mutation() {
                storage::Mutation::Put(_, value) => Some(value.clone()),
                storage::Mutation::Delete(_) | storage::Mutation::Clear(..) => None,
            });
        }
        drop(profile);
        let cached = self.base.points.read().get(key).cloned();
        let cell = match cached {
            Some(cell) => cell,
            None => {
                let mut points = self.base.points.write();
                if points.len() >= MAX_READS {
                    points.clear();
                }
                points.entry(key.to_vec()).or_default().clone()
            }
        };
        if cell.get().is_some() {
            self.cache.metrics.hits.fetch_add(1, Ordering::Relaxed);
        } else {
            self.cache.metrics.misses.fetch_add(1, Ordering::Relaxed);
        }
        let loaded = cell
            .get_or_try_init(|| async {
                let value = self.base.raw.get(key).await?;
                let charge = self
                    .cache
                    .reserve(key.len() + value.as_ref().map_or(0, Bytes::len) + 256)?;
                Ok::<_, Status>(Arc::new(Value {
                    value,
                    _charge: charge,
                }))
            })
            .await?;
        Ok(loaded.value.clone())
    }
    async fn page(&self, start: &[u8], end: &[u8]) -> Result<(Rows, Vec<u8>)> {
        self.valid()?;
        self.base.check(start, end)?;
        let key = (start.to_vec(), end.to_vec());
        let cached = self.base.ranges.lock().get(&key).cloned();
        let loaded = match cached {
            Some(v) => v,
            None => {
                let value = self.base.raw.range(start, end, 64).await?;
                let size = start.len()
                    + end.len()
                    + value
                        .0
                        .iter()
                        .map(|(k, v)| k.len() + v.len() + 128)
                        .sum::<usize>()
                    + 256;
                let loaded = Arc::new(Value {
                    value,
                    _charge: self.cache.reserve(size)?,
                });
                let mut ranges = self.base.ranges.lock();
                if ranges.len() >= MAX_ENTRIES {
                    ranges.clear();
                }
                ranges.insert(key, loaded.clone());
                loaded
            }
        };
        let (mut rows, more) = loaded.value.clone();
        let stop = if more {
            rows.last_key_value()
                .map(|(k, _)| after(k))
                .ok_or_else(|| status(ErrorCode::Unavailable))?
        } else {
            end.to_vec()
        };
        let changes =
            self.cache
                .inner
                .read()
                .index
                .range(start, &stop, self.cut, self.base.raw.version);
        for change in changes {
            self.use_entry(&change.entry)?;
            match change.mutation() {
                storage::Mutation::Put(key, value) => {
                    rows.insert(key.clone(), value.clone());
                }
                storage::Mutation::Delete(key) => {
                    rows.remove(key);
                }
                storage::Mutation::Clear(a, b) => {
                    rows.retain(|key, _| key < a || key >= b);
                }
            }
        }
        self.record(Read::Range(start.to_vec(), stop.clone(), rows.clone()))?;
        Ok((rows, stop))
    }
    pub(crate) async fn scan(self: &Arc<Self>, range: impl RangeBounds<Vec<u8>>) -> Result<Scan> {
        let start = match range.start_bound() {
            Bound::Included(k) => k.clone(),
            Bound::Excluded(k) => after(k),
            Bound::Unbounded => vec![],
        };
        let end = match range.end_bound() {
            Bound::Excluded(k) => k.clone(),
            Bound::Included(k) => after(k),
            Bound::Unbounded => vec![255],
        };
        Ok(Scan {
            snapshot: self.clone(),
            start,
            end,
            rows: VecDeque::new(),
        })
    }
}
pub(crate) struct Row {
    pub key: Bytes,
    pub value: Bytes,
}
pub(crate) struct Scan {
    snapshot: Arc<Snapshot>,
    start: Vec<u8>,
    end: Vec<u8>,
    rows: VecDeque<Row>,
}
impl Scan {
    pub(crate) async fn next(&mut self) -> Result<Option<Row>> {
        loop {
            if let Some(row) = self.rows.pop_front() {
                return Ok(Some(row));
            }
            if self.start >= self.end {
                return Ok(None);
            }
            let (rows, next) = self.snapshot.page(&self.start, &self.end).await?;
            self.start = next;
            self.rows = rows
                .into_iter()
                .map(|(key, value)| Row {
                    key: key.into(),
                    value,
                })
                .collect();
        }
    }
}
pub(crate) fn retry() -> Status {
    Status::aborted("Refresh local view.")
}
pub(crate) fn is_retry(error: &Status) -> bool {
    error.code() == tonic::Code::Aborted
}

fn ancestry_value(value: Option<Bytes>) -> Result<Option<(String, bool, Option<Parent>)>> {
    value
        .map(|v| {
            let record: Record = storage::decode(&v)?;
            Ok((record.object.id, record.object.directory, record.parent))
        })
        .transpose()
}
