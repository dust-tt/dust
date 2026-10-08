use super::*;
use std::{collections::VecDeque, sync::Weak, time::Instant};

#[cfg(all(test, target_os = "linux"))]
#[path = "kernel_cache_tests.rs"]
mod tests;

type RangeKey = (Id, u64, Id, Id, u64, u32);

struct Submission {
    at: Instant,
    stored: bool,
}

#[derive(Default)]
struct Recent {
    entries: HashMap<RangeKey, Submission>,
    order: VecDeque<RangeKey>,
}

#[derive(Default)]
struct Counters {
    submitted_bytes: AtomicU64,
    store_bytes: AtomicU64,
    store_calls: AtomicU64,
    fallback_bytes: AtomicU64,
    deduplicated_bytes: AtomicU64,
    stale_bytes: AtomicU64,
    refetch_bytes: AtomicU64,
    errors: AtomicU64,
}

struct InsertionWorker {
    _transition: tokio::sync::OwnedMutexGuard<()>,
    invalidating: Arc<AtomicU64>,
    failure: Arc<tokio::sync::Notify>,
}

impl Drop for InsertionWorker {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.invalidating.fetch_add(1, Ordering::SeqCst);
            self.failure.notify_one();
        }
    }
}

trait StoreNotifications {
    fn store(&self, ino: u64, offset: u64, bytes: &[u8]) -> std::io::Result<()>;
    fn invalidate(&self, ino: u64, offset: i64, length: i64) -> std::io::Result<()>;
}

impl StoreNotifications for fuser::Notifier {
    fn store(&self, ino: u64, offset: u64, bytes: &[u8]) -> std::io::Result<()> {
        fuser::Notifier::store(self, ino, offset, bytes)
    }

    fn invalidate(&self, ino: u64, offset: i64, length: i64) -> std::io::Result<()> {
        self.inval_inode(ino, offset, length)
    }
}

pub struct KernelCache {
    state: Weak<Mutex<Mount>>,
    transition: Arc<tokio::sync::Mutex<()>>,
    recent: Mutex<Recent>,
    counters: Counters,
    invalidating: Arc<AtomicU64>,
    failure: Arc<tokio::sync::Notify>,
}

impl KernelCache {
    pub fn new(
        state: Weak<Mutex<Mount>>,
        transition: Arc<tokio::sync::Mutex<()>>,
        invalidating: Arc<AtomicU64>,
        failure: Arc<tokio::sync::Notify>,
    ) -> Arc<Self> {
        Arc::new(Self {
            state,
            transition,
            recent: Mutex::new(Recent::default()),
            counters: Counters::default(),
            invalidating,
            failure,
        })
    }

    fn key(incarnation: &str, generation: u64, range: &ReadRange) -> RangeKey {
        (
            incarnation.into(),
            generation,
            range.node.clone(),
            range.version.clone(),
            range.offset,
            range.size,
        )
    }

    pub fn select(&self, incarnation: &str, generation: u64, ranges: &mut Vec<ReadRange>) {
        let mut recent = self.recent.lock();
        let now = Instant::now();
        while recent.order.front().is_some_and(|key| {
            recent
                .entries
                .get(key)
                .is_none_or(|entry| now.duration_since(entry.at) >= Duration::from_secs(2))
        }) {
            if let Some(key) = recent.order.pop_front() {
                recent.entries.remove(&key);
            }
        }
        ranges.retain(|range| {
            let key = Self::key(incarnation, generation, range);
            if recent.entries.contains_key(&key) {
                self.counters
                    .deduplicated_bytes
                    .fetch_add(u64::from(range.size), Ordering::Relaxed);
                return false;
            }
            if recent.entries.len() == 4096
                && let Some(key) = recent.order.pop_front()
            {
                recent.entries.remove(&key);
            }
            recent.order.push_back(key.clone());
            recent.entries.insert(
                key,
                Submission {
                    at: now,
                    stored: false,
                },
            );
            self.counters
                .submitted_bytes
                .fetch_add(u64::from(range.size), Ordering::Relaxed);
            true
        });
    }

    pub fn demand(&self, request: &ReadRequest) {
        let mut recent = self.recent.lock();
        let end = request
            .offset
            .saturating_add(u64::from(request.size))
            .min(request.node.size);
        for block in request.offset / CHUNK_BYTES as u64..end.div_ceil(CHUNK_BYTES as u64) {
            let offset = block * CHUNK_BYTES as u64;
            let size = request
                .node
                .size
                .saturating_sub(offset)
                .min(CHUNK_BYTES as u64) as u32;
            let key = (
                request.incarnation.clone(),
                request.auth_generation,
                request.node.id.clone(),
                request.node.version.clone(),
                offset,
                size,
            );
            if let Some(entry) = recent.entries.get_mut(&key)
                && entry.stored
            {
                let overlap = end
                    .min(offset + u64::from(size))
                    .saturating_sub(request.offset.max(offset));
                self.counters
                    .refetch_bytes
                    .fetch_add(overlap, Ordering::Relaxed);
                entry.stored = false;
            }
        }
    }

    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({"submitted_bytes": self.counters.submitted_bytes.load(Ordering::Relaxed), "store_notification_bytes": self.counters.store_bytes.load(Ordering::Relaxed), "store_calls": self.counters.store_calls.load(Ordering::Relaxed), "fallback_bytes": self.counters.fallback_bytes.load(Ordering::Relaxed), "deduplicated_bytes": self.counters.deduplicated_bytes.load(Ordering::Relaxed), "stale_bytes": self.counters.stale_bytes.load(Ordering::Relaxed), "refetch_bytes": self.counters.refetch_bytes.load(Ordering::Relaxed), "errors": self.counters.errors.load(Ordering::Relaxed), "recent_ranges": self.recent.lock().entries.len(), "recent_range_limit": 4096})
    }

    pub async fn insert(
        self: &Arc<Self>,
        incarnation: Id,
        generation: u64,
        parts: Vec<(ReadRange, Vec<u8>)>,
    ) -> Result<()> {
        let transition = self.transition.clone().lock_owned().await;
        let kernel = self.clone();
        tokio::task::spawn_blocking(move || {
            let worker = InsertionWorker {
                _transition: transition,
                invalidating: kernel.invalidating.clone(),
                failure: kernel.failure.clone(),
            };
            let state = kernel
                .state
                .upgrade()
                .ok_or_else(|| err(libc::EIO, "mount closed"))?;
            let (stores, notifier) = {
                let mount = state.lock();
                let _gate = mount.gate.lock();
                let mut cache = mount.cache.lock();
                let notifier = mount.notifier.read().clone();
                let mut stores = Vec::new();
                for (range, bytes) in parts {
                    let current = cache
                        .namespace
                        .nodes
                        .get(&range.node)
                        .filter(|item| item.verbs & READ != 0 && item.node.version == range.version)
                        .map(|item| item.node.clone());
                    let current = current.filter(|_| {
                        cache.namespace.incarnation == incarnation
                            && cache.namespace.auth_generation == generation
                    });
                    let Some(current) = current else {
                        kernel
                            .counters
                            .stale_bytes
                            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        continue;
                    };
                    let valid_size = current
                        .size
                        .saturating_sub(range.offset)
                        .min(u64::from(range.size));
                    if bytes.len() as u64 != valid_size || bytes.is_empty() {
                        kernel
                            .counters
                            .stale_bytes
                            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        continue;
                    }
                    let pin = mount.inodes.pin_kernel(&range.node).filter(|pin| {
                        mount.invalidating.load(Ordering::SeqCst) == 0
                            && !mount.unresolved.contains_key(&range.node)
                            && !mount.has_writer(&range.node)
                            && !mount.handles.values().any(|handle| {
                                handle._pin.ino() == pin.ino()
                                    && (handle.writable || handle.error.is_some())
                            })
                    });
                    if let Some(pin) = pin
                        && notifier.is_some()
                    {
                        stores.push((pin, range, bytes));
                    } else {
                        kernel
                            .counters
                            .fallback_bytes
                            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        cache.content.insert_speculative(
                            &current,
                            range.offset / CHUNK_BYTES as u64,
                            bytes,
                        );
                    }
                }
                (stores, notifier)
            };
            if let Some(notifier) = notifier {
                kernel.store_ranges(&notifier, stores, &incarnation, generation, worker)?;
            }
            Ok(())
        })
        .await
        .map_err(|error| {
            tracing::error!(%error, "kernel prefetch worker failed");
            self.invalidating.fetch_add(1, Ordering::SeqCst);
            self.failure.notify_one();
            err(libc::EIO, "kernel prefetch worker failed")
        })?
    }

    fn store_ranges(
        &self,
        notifier: &dyn StoreNotifications,
        stores: Vec<(InodePin, ReadRange, Vec<u8>)>,
        incarnation: &str,
        generation: u64,
        worker: InsertionWorker,
    ) -> Result<()> {
        for (pin, range, bytes) in stores {
            self.counters.store_calls.fetch_add(1, Ordering::Relaxed);
            match notifier.store(pin.ino(), range.offset, &bytes) {
                Ok(()) => {
                    self.counters
                        .store_bytes
                        .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                    let key = Self::key(incarnation, generation, &range);
                    if let Some(entry) = self.recent.lock().entries.get_mut(&key) {
                        entry.stored = true;
                    }
                }
                Err(error) => {
                    self.counters.errors.fetch_add(1, Ordering::Relaxed);
                    let barrier = InvalidationBarrier::new(self.invalidating.clone());
                    drop(worker);
                    if let Err(invalidation) =
                        notifier.invalidate(pin.ino(), range.offset as i64, bytes.len() as i64)
                    {
                        tracing::error!(%error, %invalidation, "prefetch insertion and recovery invalidation failed");
                        self.failure.notify_one();
                        return Err(err(libc::EIO, "prefetch recovery invalidation failed"));
                    }
                    barrier.complete();
                    return Ok(());
                }
            }
        }
        Ok(())
    }
}
