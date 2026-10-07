use crate::{
    State,
    storage::Storage,
    tree_feed::{self, Replica},
};
use clap::Args;
use dfs_core::{read::Authority, tree::TenantTree};
use dfs_protocol::{ObjectId, error::code, rpc::ErrorCode};
use parking_lot::{Mutex, RwLock};
use std::{
    collections::HashMap,
    sync::{
        Arc, Weak,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{Notify, Semaphore};

#[derive(Clone, Debug, Args)]
#[group(id = "Permissions")]
pub struct Config {
    #[arg(long, default_value_t = 30_000)]
    pub permission_max_age_ms: u64,
    #[arg(long, default_value_t = 250)]
    pub tree_poll_ms: u64,
    #[arg(long, default_value_t = 60_000)]
    pub tree_idle_ms: u64,
    #[arg(long, default_value_t = 8_589_934_592usize)]
    pub tree_memory_bytes: usize,
    #[arg(long, default_value_t = 1_073_741_824usize)]
    pub tree_tenant_peak_bytes: usize,
    #[arg(long, default_value_t = 16_777_216usize)]
    pub tree_staging_bytes: usize,
    #[arg(long, default_value_t = 1024)]
    pub tree_base_page_nodes: usize,
    #[arg(long, default_value_t = 4)]
    pub tree_io_concurrency: usize,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            permission_max_age_ms: 30_000,
            tree_poll_ms: 250,
            tree_idle_ms: 60_000,
            tree_memory_bytes: 8 * 1024 * 1024 * 1024,
            tree_tenant_peak_bytes: 1024 * 1024 * 1024,
            tree_staging_bytes: 16 * 1024 * 1024,
            tree_base_page_nodes: 1024,
            tree_io_concurrency: 4,
        }
    }
}
impl Config {
    fn feed(&self, cancelled: Arc<AtomicBool>) -> tree_feed::Config {
        tree_feed::Config {
            max_age_ms: self.permission_max_age_ms,
            staging_bytes: self.tree_staging_bytes,
            tenant_peak_bytes: self.tree_tenant_peak_bytes,
            base_page_nodes: self.tree_base_page_nodes,
            cancelled: Some(cancelled),
            #[cfg(test)]
            bootstrap_pause: None,
        }
    }
    fn validate(&self) -> anyhow::Result<()> {
        self.feed(Arc::new(AtomicBool::new(false))).validate()?;
        anyhow::ensure!(
            self.tree_poll_ms > 0
                && self.tree_poll_ms < self.permission_max_age_ms
                && self.permission_max_age_ms <= 3_600_000
                && self.tree_idle_ms <= 3_600_000
                && (1..=32).contains(&self.tree_io_concurrency),
            "invalid permission-tree configuration"
        );
        Ok(())
    }
}
struct Budget {
    limit: usize,
    used: AtomicUsize,
}
struct Reservation {
    budget: Arc<Budget>,
    bytes: AtomicUsize,
}
impl Drop for Reservation {
    fn drop(&mut self) {
        self.budget
            .used
            .fetch_sub(self.bytes.load(Ordering::Acquire), Ordering::AcqRel);
    }
}
impl Reservation {
    /// @cc [owner:spolu,label:performance;concurrency] resident-and-peak-reservations
    /// Only the replica's serialized refresh owner MAY resize its reservation. Growth MUST reserve
    /// the full peak before allocation. Shrinking MUST wait until all temporary allocations are
    /// released and retain the complete resident tree charge through its final authority reader.
    fn resize(&self, bytes: usize) -> bool {
        let previous = self.bytes.load(Ordering::Acquire);
        if bytes > previous {
            if self
                .budget
                .used
                .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                    used.checked_add(bytes - previous)
                        .filter(|next| *next <= self.budget.limit)
                })
                .is_err()
            {
                return false;
            }
        } else {
            self.budget
                .used
                .fetch_sub(previous - bytes, Ordering::AcqRel);
        }
        self.bytes.store(bytes, Ordering::Release);
        true
    }
}
impl Budget {
    fn reserve(self: &Arc<Self>, bytes: usize) -> Option<Arc<Reservation>> {
        self.used
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                used.checked_add(bytes).filter(|next| *next <= self.limit)
            })
            .ok()?;
        Some(Arc::new(Reservation {
            budget: self.clone(),
            bytes: AtomicUsize::new(bytes),
        }))
    }
}
struct Entry {
    tenant: String,
    root: ObjectId,
    ready: RwLock<Option<Arc<TenantTree>>>,
    replica: tokio::sync::Mutex<Option<(Replica, Arc<Reservation>)>>,
    last_active: Mutex<Instant>,
    due: Mutex<Instant>,
    retired: Arc<AtomicBool>,
    running: AtomicBool,
    dirty: AtomicBool,
}
struct Running(Arc<Entry>);
impl Drop for Running {
    fn drop(&mut self) {
        self.0.running.store(false, Ordering::Release);
    }
}

/// @cc [owner:spolu,label:security;performance] active-tenant-tree-lifecycle
/// Only tenants with active local sessions or within the idle grace period MAY consume their feed.
/// Idle eviction MUST remove the entire tree. Bootstrap/update peaks MUST be reserved from the
/// aggregate budget before allocation; reservations MUST outlive every RPC reference and cancelled
/// blocking build. Budget failure MUST leave requests on complete FDB authorization.
pub struct Manager {
    config: Config,
    entries: Mutex<HashMap<String, Arc<Entry>>>,
    budget: Arc<Budget>,
    workers: Arc<Semaphore>,
    max_entries: usize,
    stopped: AtomicBool,
    pub(crate) nudge: Notify,
    #[cfg(test)]
    paused: AtomicBool,
    #[cfg(test)]
    tick_gate: tokio::sync::Mutex<()>,
}
impl Manager {
    pub fn new(config: Config) -> anyhow::Result<Arc<Self>> {
        config.validate()?;
        // Bound names, entry tables, worker bookkeeping and spare capacity independently of trees.
        let overhead = (config.tree_memory_bytes / 16).min(10_000 * 2048);
        Ok(Arc::new(Self {
            workers: Arc::new(Semaphore::new(config.tree_io_concurrency)),
            max_entries: overhead / 2048,
            budget: Arc::new(Budget {
                limit: config.tree_memory_bytes - overhead,
                used: AtomicUsize::new(0),
            }),
            config,
            entries: Default::default(),
            stopped: AtomicBool::new(false),
            nudge: Notify::new(),
            #[cfg(test)]
            paused: AtomicBool::new(false),
            #[cfg(test)]
            tick_gate: Default::default(),
        }))
    }
    pub fn pin(&self, tenant: &str) -> Option<Arc<Authority>> {
        let entry = self.entries.lock().get(tenant).cloned()?;
        if entry.retired.load(Ordering::Acquire) {
            return None;
        }
        let tree = entry.ready.read().clone()?;
        Authority::pin(tenant, tree).ok()
    }
    #[cfg(test)]
    pub(crate) async fn pause(&self, paused: bool) {
        self.paused.store(paused, Ordering::Release);
        let _tick = self.tick_gate.lock().await;
        if paused {
            if let Ok(permit) = self
                .workers
                .acquire_many(self.config.tree_io_concurrency as u32)
                .await
            {
                drop(permit);
            }
        } else {
            self.nudge.notify_one();
        }
    }
    #[cfg(test)]
    pub(crate) fn tree(&self, tenant: &str) -> Option<Arc<TenantTree>> {
        self.entries.lock().get(tenant)?.ready.read().clone()
    }
    #[cfg(test)]
    pub(crate) fn reserved_bytes(&self) -> usize {
        self.budget.used.load(Ordering::Acquire)
    }
    pub fn wake(&self, tenant: &str) {
        if let Some(entry) = self.entries.lock().get(tenant) {
            entry.dirty.store(true, Ordering::Release);
        }
        self.nudge.notify_one();
    }
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
        let mut entries = self.entries.lock();
        for entry in entries.values() {
            entry.retired.store(true, Ordering::Release);
            *entry.ready.write() = None;
        }
        entries.clear();
        self.nudge.notify_waiters();
    }
    pub(crate) async fn run(self: Arc<Self>, state: Weak<State>) {
        let mut timer =
            tokio::time::interval(Duration::from_millis(self.config.tree_poll_ms.min(50)));
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! { _ = timer.tick() => {}, _ = self.nudge.notified() => {} }
            #[cfg(test)]
            let _tick = self.tick_gate.lock().await;
            if self.stopped.load(Ordering::Acquire) {
                break;
            }
            let Some(state) = state.upgrade() else {
                break;
            };
            #[cfg(test)]
            if self.paused.load(Ordering::Acquire) {
                continue;
            }
            let active = state.sessions.active_tenants().await;
            self.maintain(active, state.storage.clone(), state.admission.clone());
        }
        self.stop();
    }
    fn maintain(
        self: &Arc<Self>,
        active: HashMap<String, ObjectId>,
        storage: Storage,
        admission: Arc<Semaphore>,
    ) {
        if self.max_entries == 0 {
            return;
        }
        let now = Instant::now();
        let mut entries = self.entries.lock();
        entries.retain(|tenant, entry| {
            if active.contains_key(tenant) {
                *entry.last_active.lock() = now;
                true
            } else if now.duration_since(*entry.last_active.lock())
                >= Duration::from_millis(self.config.tree_idle_ms)
            {
                entry.retired.store(true, Ordering::Release);
                *entry.ready.write() = None;
                false
            } else {
                true
            }
        });
        for (tenant, root) in active {
            if entries.len() >= self.max_entries {
                break;
            }
            entries.entry(tenant.clone()).or_insert_with(|| {
                Arc::new(Entry {
                    tenant,
                    root,
                    ready: Default::default(),
                    replica: Default::default(),
                    last_active: Mutex::new(now),
                    due: Mutex::new(now),
                    retired: Arc::new(AtomicBool::new(false)),
                    running: AtomicBool::new(false),
                    dirty: AtomicBool::new(false),
                })
            });
        }
        let mut due: Vec<_> = entries
            .values()
            .filter_map(|entry| {
                let due = *entry.due.lock();
                (!entry.running.load(Ordering::Acquire)
                    && (due <= now || entry.dirty.load(Ordering::Acquire)))
                .then(|| (due, entry.clone()))
            })
            .collect();
        drop(entries);
        due.sort_unstable_by_key(|(due, _)| *due);
        for (_, entry) in due {
            let Ok(worker) = self.workers.clone().try_acquire_owned() else {
                break;
            };
            let Ok(admitted) = admission.clone().try_acquire_owned() else {
                break;
            };
            if entry.running.swap(true, Ordering::AcqRel) {
                continue;
            }
            let manager = self.clone();
            let storage = storage.clone();
            tokio::spawn(async move {
                let (_worker, _admitted, _running) = (worker, admitted, Running(entry.clone()));
                entry.dirty.store(false, Ordering::Release);
                manager.refresh(&entry, storage).await;
                let jitter_ms = u64::from(ObjectId::new_v4().as_bytes()[0])
                    % (manager.config.tree_poll_ms / 8 + 1);
                *entry.due.lock() =
                    Instant::now() + Duration::from_millis(manager.config.tree_poll_ms + jitter_ms);
                if entry.dirty.load(Ordering::Acquire) {
                    manager.nudge.notify_one();
                }
            });
        }
    }
    async fn refresh(&self, entry: &Arc<Entry>, storage: Storage) {
        let mut current = entry.replica.lock().await;
        if entry.retired.load(Ordering::Acquire) {
            *current = None;
            return;
        }
        if let Some((replica, reservation)) = &mut *current {
            if !reservation.resize(replica.poll_peak_bytes()) {
                return;
            }
            let result = replica.poll().await;
            reservation.resize(replica.tree.memory_bytes());
            if let Err(error) = result {
                let expired = replica
                    .tree
                    .check_proof(replica.tree.proof(), Instant::now())
                    .is_err();
                if expired || matches!(code(&error), ErrorCode::StaleView | ErrorCode::Capacity) {
                    *entry.ready.write() = None;
                    *current = None;
                }
                tracing::debug!(code = ?error.code(), "permission-tree poll failed");
            }
        } else if let Some(reservation) = self.budget.reserve(self.config.tree_tenant_peak_bytes) {
            let config = self.config.feed(entry.retired.clone());
            let started = Instant::now();
            match Replica::bootstrap_reserved(
                storage,
                &entry.tenant,
                entry.root,
                config,
                reservation.clone(),
            )
            .await
            {
                Ok(replica) if !entry.retired.load(Ordering::Acquire) => {
                    reservation.resize(replica.tree.memory_bytes());
                    tracing::info!(
                        nodes = replica.tree.len(),
                        accounted_bytes = replica.tree.memory_bytes(),
                        bootstrap_ms = started.elapsed().as_millis() as u64,
                        "permission tree ready"
                    );
                    *entry.ready.write() = Some(replica.tree.clone());
                    *current = Some((replica, reservation));
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::debug!(code = ?error.code(), "permission-tree bootstrap failed")
                }
            }
        }
        if entry.retired.load(Ordering::Acquire) {
            *entry.ready.write() = None;
            *current = None;
        }
    }
}
