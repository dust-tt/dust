use dfs_protocol::ObjectRef;
mod content;
mod directory;
mod fences;
mod memory;
mod metadata;
mod writeback;

use crate::{BlockingClient, Client};
use anyhow::{Result as AnyResult, ensure};
use clap::Args;
use dfs_protocol::{
    BLOCK_SIZE, MAX_IO,
    error::{code, status},
    rpc::*,
};
use memory::{Cache, Key, Name, PageSource, Value};
use parking_lot::Mutex;
use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Weak,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
const IO_RESERVE_MIB: usize = 96;
const TEMPORARY_BYTES: usize = 52 * 1024 * 1024;
const OPERATION_BYTES: usize = 6 * 1024 * 1024;

#[derive(Clone)]
pub struct CacheReservation {
    _permit: Arc<tokio::sync::OwnedSemaphorePermit>,
}

#[derive(Args, Clone, Debug)]
pub struct CacheConfig {
    #[arg(long, env = "DFS_CLIENT_CACHE_MIB", default_value_t = 512)]
    pub cache_mib: usize,
    #[arg(
        long,
        env = "DFS_CLIENT_DIRECTORY_PAGE_ENTRIES",
        default_value_t = 4096
    )]
    pub directory_page_entries: u32,
    #[arg(long, env = "DFS_CLIENT_CACHE_TTL_MS", default_value_t = 800)]
    pub cache_ttl_ms: u64,
    #[arg(long, env = "DFS_CLIENT_WRITE_DELAY_MS", default_value_t = 25)]
    pub write_delay_ms: u64,
    #[arg(long, env = "DFS_CLIENT_MAX_WRITE_DELAY_MS", default_value_t = 200)]
    pub max_write_delay_ms: u64,
    #[arg(long, env = "DFS_CLIENT_WRITE_CONCURRENCY", default_value_t = 128)]
    pub write_concurrency: usize,
}
impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            cache_mib: 512,
            directory_page_entries: 4096,
            cache_ttl_ms: 800,
            write_delay_ms: 25,
            max_write_delay_ms: 200,
            write_concurrency: 128,
        }
    }
}
impl CacheConfig {
    /// @cc [owner:spolu,label:performance;security] combined-client-delay-budget
    /// Configuration MUST reject accounted memory above 512 MiB and W+C above 1000 ms, including
    /// integer overflow. Coalescing MUST leave room before the absolute write-dispatch deadline.
    pub fn validate(&self) -> AnyResult<()> {
        ensure!(
            (1..=dfs_protocol::MAX_LIST).contains(&self.directory_page_entries),
            "directory page limit must be 1..4096"
        );
        ensure!(
            (128..=512).contains(&self.cache_mib),
            "client memory must be 128..512 MiB"
        );
        ensure!(
            self.cache_ttl_ms > 0
                && self.max_write_delay_ms > 0
                && self
                    .max_write_delay_ms
                    .checked_add(self.cache_ttl_ms)
                    .is_some_and(|sum| sum <= 1000),
            "client write buffering plus cache TTL must be at most 1000ms"
        );
        ensure!(
            self.write_delay_ms > 0 && self.write_delay_ms < self.max_write_delay_ms,
            "coalescing must be shorter than the write-buffer budget"
        );
        ensure!(
            (1..=128).contains(&self.write_concurrency),
            "write concurrency must be 1..128"
        );
        Ok(())
    }
}
struct Gate {
    _memory: Arc<tokio::sync::OwnedSemaphorePermit>,
    mutex: Arc<AsyncMutex<()>>,
    generation: AtomicU64,
    primary_generation: AtomicU64,
    refreshes: AtomicUsize,
}
struct GateSlot {
    gate: Weak<Gate>,
    _memory: Arc<tokio::sync::OwnedSemaphorePermit>,
}
impl GateSlot {
    fn upgrade(&self) -> Option<Arc<Gate>> {
        self.gate.upgrade()
    }
    fn strong_count(&self) -> usize {
        self.gate.strong_count()
    }
}
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum GateKey {
    Attr(ObjectRef),
    Name(ObjectRef, String),
}
struct Inner {
    rpc: Client,
    runtime: tokio::runtime::Handle,
    cache: Mutex<Cache>,
    gates: Mutex<BTreeMap<GateKey, GateSlot>>,
    prefetch: Arc<Semaphore>,
    content: Arc<content::Counters>,
    content_slots: Arc<Semaphore>,
    expires: Instant,
    root: ObjectRef,
    fences: Mutex<fences::Fences>,
    config: CacheConfig,
    pending: Mutex<writeback::Pending>,
    memory: Arc<Semaphore>,
    temporary: Arc<Semaphore>,
    temporary_peak: AtomicUsize,
    write_slots: Arc<Semaphore>,
    flight_slots: Arc<Semaphore>,
    group_slots: Arc<Semaphore>,
    changed: tokio::sync::Notify,
}

#[derive(Clone)]
/// @cc [owner:spolu,label:security;performance] mount-cache-validity
/// Every cache instance MUST belong to one session. Attr metadata and authority MUST expire from
/// the send time of their validating request; tentative objects get C from local creation. Membership
/// MAY outlive its original TTL only with fresh matching directory authority. Hits/edits MUST NOT
/// renew validity, and neither retained blocks nor membership MAY authorize stale child attributes.
pub struct CachedClient {
    raw: BlockingClient,
    inner: Arc<Inner>,
}
impl CachedClient {
    fn run<T>(&self, future: impl std::future::Future<Output = Result<T>>) -> Result<T> {
        self.execute(async {
            let _memory = self.inner.temporary_memory(OPERATION_BYTES).await?;
            future.await
        })
    }
    fn execute<T>(&self, future: impl std::future::Future<Output = Result<T>>) -> Result<T> {
        if !crate::inline::active() {
            return self.raw.runtime.block_on(future);
        }
        let mut future = std::pin::pin!(future);
        let mut context = std::task::Context::from_waker(std::task::Waker::noop());
        match future.as_mut().poll(&mut context) {
            std::task::Poll::Ready(value) => value,
            std::task::Poll::Pending => {
                // Never replay an operation if a future regression adds a wait after acceptance.
                if crate::inline::effective() {
                    self.inner
                        .rpc
                        .record("inline.wait_after_effect", Duration::ZERO, true);
                    Err(dfs_protocol::error::status(ErrorCode::Internal))
                } else {
                    Err(crate::inline::deferred())
                }
            }
        }
    }
    /// @cc [owner:spolu,label:performance] charged-adapter-bookkeeping
    /// Adapter reservations MUST share the cache budget, remain charged through the last clone,
    /// and evict clean entries or fail before allocating resident inode/handle/cursor state.
    pub fn reserve_bookkeeping(&self, bytes: usize) -> Result<CacheReservation> {
        let permit = self
            .inner
            .cache
            .lock()
            .reserve(bytes)
            .ok_or_else(|| status(ErrorCode::Capacity))?;
        Ok(CacheReservation {
            _permit: Arc::new(permit),
        })
    }
    /// @cc [owner:spolu,label:performance;concurrency] bounded-adapter-scratch
    /// Temporary reservations MUST come from the 96 MiB reserve inside the total configured cap.
    /// An adapter MUST retain this reservation through reply delivery and reserve before effects.
    /// Inline shortage MUST defer; workers MAY wait without consuming clean/dirty capacity.
    pub fn reserve_temporary(&self, bytes: usize) -> Result<CacheReservation> {
        self.execute(async {
            Ok(CacheReservation {
                _permit: Arc::new(self.inner.temporary_memory(bytes).await?),
            })
        })
    }
    pub fn connect(endpoint: &str, key: &str, config: CacheConfig) -> AnyResult<Self> {
        config.validate()?;
        let raw = BlockingClient::connect(endpoint, key)?;
        let session = raw.current_session(Empty {})?;
        let seconds = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        ensure!(session.expires_at > seconds, "session expired");
        // Reserve space outside cache entries for bounded FUSE/RPC buffers and scheduler bookkeeping.
        let memory = Arc::new(Semaphore::new(
            (config.cache_mib - IO_RESERVE_MIB) * 1024 * 1024,
        ));
        let mut cache = Cache::new(memory.clone());
        let fence_memory = cache
            .reserve(fences::MEMORY_BYTES)
            .ok_or_else(|| anyhow::anyhow!("commit-fence memory reservation"))?;
        let inner = Arc::new(Inner {
            rpc: raw.client.clone(),
            runtime: raw.runtime.handle().clone(),
            cache: Mutex::new(cache),
            memory,
            temporary: Arc::new(Semaphore::new(TEMPORARY_BYTES)),
            temporary_peak: AtomicUsize::new(0),
            gates: Default::default(),
            prefetch: Arc::new(Semaphore::new(2)),
            content: Default::default(),
            content_slots: Arc::new(Semaphore::new(2)),
            pending: Default::default(),
            write_slots: Arc::new(Semaphore::new(16)),
            flight_slots: Arc::new(Semaphore::new(config.write_concurrency)),
            group_slots: Arc::new(Semaphore::new(writeback::MAX_GROUPS)),
            changed: Default::default(),
            expires: Instant::now() + Duration::from_secs(session.expires_at - seconds),
            root: session.root_id,
            fences: Mutex::new(fences::Fences::new(fence_memory)),
            config,
        });
        let _entered = raw.runtime.enter();
        Inner::start(&inner);
        Ok(Self { raw, inner })
    }
    pub fn measure_fuse_call(&self, name: &'static str) -> crate::MetricTimer {
        self.raw.measure_fuse_call(name)
    }
    pub fn metrics(&self) -> serde_json::Value {
        let mut metrics = self.raw.metrics();
        metrics["dfs_content_metrics"] = self.inner.content.json();
        let (retained, retained_peak) = self.inner.cache.lock().usage();
        metrics["dfs_memory_metrics"] = serde_json::json!({
            "limit_bytes": self.inner.config.cache_mib * 1024 * 1024,
            "reserved_transient_bytes": IO_RESERVE_MIB * 1024 * 1024,
            "retained_bytes": retained,
            "retained_peak_bytes": retained_peak,
            "accounted_peak_bytes": retained_peak + IO_RESERVE_MIB * 1024 * 1024,
            "temporary_limit_bytes": TEMPORARY_BYTES,
            "temporary_bytes": TEMPORARY_BYTES - self.inner.temporary.available_permits(),
            "temporary_peak_bytes": self.inner.temporary_peak.load(Ordering::Relaxed),
        });
        metrics
    }
    pub fn stat_one(&self, r: ObjectRequest) -> Result<Attr> {
        self.run(self.inner.stat(&r.object_id))
    }
    pub fn lookup(&self, r: LookupRequest) -> Result<Attr> {
        self.run(self.inner.lookup(r))
    }
    pub fn list(&self, r: ListRequest) -> Result<Page> {
        self.run(self.inner.list(r))
    }
    pub fn directory_page_entries(&self) -> u32 {
        self.inner.config.directory_page_entries
    }
    pub fn read(&self, r: ReadRequest) -> Result<ReadResponse> {
        self.run(self.inner.read(r))
    }
}

impl Inner {
    async fn temporary_memory(&self, bytes: usize) -> Result<tokio::sync::OwnedSemaphorePermit> {
        if bytes > TEMPORARY_BYTES {
            return Err(status(ErrorCode::Capacity));
        }
        let memory = self
            .temporary
            .clone()
            .acquire_many_owned(bytes as u32)
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?;
        self.temporary_peak.fetch_max(
            TEMPORARY_BYTES - self.temporary.available_permits(),
            Ordering::Relaxed,
        );
        Ok(memory)
    }
    fn active(&self) -> Result<()> {
        if Instant::now() >= self.expires {
            Err(status(ErrorCode::Unauthenticated))
        } else {
            Ok(())
        }
    }
    fn deadline(&self, sent: Instant) -> Instant {
        (sent + Duration::from_millis(self.config.cache_ttl_ms)).min(self.expires)
    }
    fn gate(&self, id: &ObjectRef) -> Result<Arc<Gate>> {
        self.gate_key(GateKey::Attr(*id))
    }
    /// @cc [owner:spolu,label:performance;concurrency] charged-gate-lifetimes
    /// Gates, their keys and retained weak slots MUST share the cache budget. Reservations MUST
    /// survive until both the weak slot and all live users disappear. Pruning MUST preserve live gates.
    fn gate_key(&self, id: GateKey) -> Result<Arc<Gate>> {
        let mut gates = self.gates.lock();
        if let Some(gate) = gates.get(&id).and_then(GateSlot::upgrade) {
            return Ok(gate);
        }
        if gates.len() >= 4096 {
            gates.retain(|_, gate| gate.strong_count() != 0);
        }
        if gates.len() >= 65536 {
            return Err(status(ErrorCode::Capacity));
        }
        let bytes = 1024
            + match &id {
                GateKey::Attr(_) => 0,
                GateKey::Name(_, name) => name.capacity(),
            };
        let memory = Arc::new(
            self.cache
                .lock()
                .reserve(bytes)
                .ok_or_else(|| status(ErrorCode::Capacity))?,
        );
        let gate = Arc::new(Gate {
            _memory: memory.clone(),
            mutex: Default::default(),
            generation: Default::default(),
            primary_generation: Default::default(),
            refreshes: Default::default(),
        });
        gates.insert(
            id,
            GateSlot {
                gate: Arc::downgrade(&gate),
                _memory: memory,
            },
        );
        Ok(gate)
    }
    fn bump(&self, id: &ObjectRef) {
        self.bump_key(GateKey::Attr(*id));
    }
    fn bump_key(&self, id: GateKey) {
        if let Some(gate) = self.gates.lock().get(&id).and_then(GateSlot::upgrade) {
            gate.generation.fetch_add(1, Ordering::AcqRel);
        }
    }
    fn bump_primary(&self, id: &ObjectRef) {
        if let Some(gate) = self
            .gates
            .lock()
            .get(&GateKey::Attr(*id))
            .and_then(GateSlot::upgrade)
        {
            gate.primary_generation.fetch_add(1, Ordering::AcqRel);
        }
    }
    fn cached_object(&self, id: &ObjectRef) -> Option<Result<Attr>> {
        {
            let pending = self.pending.lock();
            if let Some(object) = pending.object(id) {
                return Some(object);
            }
            if pending.contains(id) {
                return None;
            }
        }
        self.cache
            .lock()
            .fresh(&Key::Attr(id.into()))
            .and_then(|entry| match &entry.value {
                Value::Attr(v) => Some(Ok(v.clone())),
                Value::Absent => Some(Err(status(ErrorCode::NotFound))),
                _ => None,
            })
    }
    fn remember_object(&self, object: &Attr, started: Instant, received: Instant) {
        self.remember_object_with_capacity(object, started, received, false, None);
    }
    fn remember_object_with_capacity(
        &self,
        object: &Attr,
        started: Instant,
        received: Instant,
        spare: bool,
        expiry_ceiling: Option<Instant>,
    ) {
        let mut cache = self.cache.lock();
        let key = Key::Attr(object.id);
        if cache.get(&key).is_some_and(|entry| {
            entry.received > started
                || matches!(&entry.value, Value::Attr(old)
                if old.read_version > object.read_version)
        }) {
            return;
        }
        let value = Value::Attr(object.clone());
        let expires = self
            .deadline(started)
            .min(expiry_ceiling.unwrap_or(self.expires));
        if spare {
            cache.insert_spare(key, value, received, expires);
        } else {
            cache.insert(key, value, received, expires);
        }
    }
    async fn stat(&self, id: &ObjectRef) -> Result<Attr> {
        self.active()?;
        if let Some(result) = self.cached_object(id) {
            return result;
        }
        let gate = self.gate(id)?;
        let gate_wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(gate_wait);
        self.stat_locked(id, &gate).await
    }
    async fn stat_locked(&self, id: &ObjectRef, gate: &Gate) -> Result<Attr> {
        for _ in 0..4 {
            self.active()?;
            if let Some(result) = self.cached_object(id) {
                return result;
            }
            if self.refresh_pending(id).await? {
                if let Some(result) = self.cached_object(id) {
                    return result;
                }
                continue;
            }
            let generation = gate.generation.load(Ordering::Acquire);
            let started = Instant::now();
            let retained =
                self.cache
                    .lock()
                    .get(&Key::Attr(*id))
                    .and_then(|entry| match &entry.value {
                        Value::Attr(object) if !object.directory && !object.revision.is_empty() => {
                            Some(object.clone())
                        }
                        _ => None,
                    });
            let mut validated = None;
            if let Some(mut object) = retained {
                let response = self
                    .rpc
                    .validate(ValidateRequest {
                        checks: vec![ValidationCheck {
                            check: Some(validation_check::Check::File(FileCheck {
                                object_id: *id,
                                revision: object.revision,
                            })),
                        }],
                    })
                    .await?;
                if response.results.len() != 1 {
                    return Err(status(ErrorCode::Unavailable));
                }
                match ValidationOutcome::try_from(response.results[0].outcome) {
                    Ok(ValidationOutcome::Unchanged)
                        if response.view.read_version >= object.read_version =>
                    {
                        object.read_version = response.view.read_version;
                        validated = Some(Ok(object));
                    }
                    Ok(ValidationOutcome::Denied | ValidationOutcome::Missing) => {
                        validated = Some(Err(status(ErrorCode::NotFound)));
                    }
                    Ok(ValidationOutcome::Error) => {
                        let code = response.results[0]
                            .error
                            .as_ref()
                            .and_then(|e| ErrorCode::try_from(e.code).ok())
                            .unwrap_or(ErrorCode::Unavailable);
                        validated = Some(Err(status(code)));
                    }
                    _ => (),
                }
            }
            let result = match validated {
                Some(result) => result,
                None => self.rpc.stat_one(ObjectRequest { object_id: *id }).await,
            };
            let received = Instant::now();
            self.active()?;
            if gate.generation.load(Ordering::Acquire) != generation {
                continue;
            }
            match &result {
                Ok(object) => self.remember_object(object, started, received),
                Err(e) if code(e) == ErrorCode::NotFound => self.cache.lock().insert(
                    Key::Attr(id.into()),
                    Value::Absent,
                    received,
                    self.deadline(started),
                ),
                _ => (),
            }
            return result;
        }
        Err(status(ErrorCode::Unavailable))
    }
    /// @cc [owner:spolu,label:concurrency;security] revision-validated-cached-read
    /// A response MUST use a single authorized metadata revision and matching blocks. A stale-view
    /// response MUST restart the whole read; previously cached bytes MUST NOT be spliced across it.
    async fn read(&self, r: ReadRequest) -> Result<ReadResponse> {
        self.active()?;
        if r.length as usize > MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        let gate = self.gate(&r.object_id)?;
        let gate_wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(gate_wait);
        for _ in 0..4 {
            let object = self.stat_locked(&r.object_id, &gate).await?;
            let generation = gate.generation.load(Ordering::Acquire);
            if object.directory {
                return Err(status(ErrorCode::IsDirectory));
            }
            let result = self.read_overlay(&object, r.offset, r.length).await;
            if result
                .as_ref()
                .is_err_and(|e| code(e) == ErrorCode::StaleView)
                || generation != gate.generation.load(Ordering::Acquire)
            {
                self.cache.lock().remove(&Key::Attr(r.object_id));
                self.pending.lock().expire(&r.object_id);
                continue;
            }
            return result.map(|data| ReadResponse {
                data,
                view: ReadView {
                    read_version: object.read_version,
                    ..Default::default()
                },
                object,
            });
        }
        Err(status(ErrorCode::Unavailable))
    }
}
fn name_generation(parent: &ObjectRef, name: &str) -> GateKey {
    GateKey::Name(*parent, name.to_owned())
}
fn copy_block(target: &mut [u8], offset: u64, end: u64, index: u64, block: &[u8]) {
    let start = index * BLOCK_SIZE as u64;
    let from = start.max(offset);
    let to = (start + block.len() as u64).min(end);
    if from < to {
        target[(from - offset) as usize..(to - offset) as usize]
            .copy_from_slice(&block[(from - start) as usize..(to - start) as usize]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_enforces_the_total_delay_and_shared_memory_cap() {
        assert!(CacheConfig::default().validate().is_ok());
        for config in [
            CacheConfig {
                cache_mib: 513,
                ..Default::default()
            },
            CacheConfig {
                cache_ttl_ms: 801,
                ..Default::default()
            },
            CacheConfig {
                max_write_delay_ms: u64::MAX,
                ..Default::default()
            },
            CacheConfig {
                cache_ttl_ms: 0,
                ..Default::default()
            },
            CacheConfig {
                write_delay_ms: 200,
                ..Default::default()
            },
        ] {
            assert!(config.validate().is_err(), "accepted {config:?}");
        }
        assert!(
            CacheConfig {
                cache_mib: 128,
                cache_ttl_ms: 300,
                max_write_delay_ms: 700,
                ..Default::default()
            }
            .validate()
            .is_ok()
        );
    }
}
