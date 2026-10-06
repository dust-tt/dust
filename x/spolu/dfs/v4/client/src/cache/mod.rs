mod directory;
mod memory;
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
    collections::HashMap,
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

#[derive(Clone)]
pub struct CacheReservation {
    _permit: Arc<tokio::sync::OwnedSemaphorePermit>,
}

#[derive(Args, Clone, Debug)]
pub struct CacheConfig {
    #[arg(long, env = "DFS_CLIENT_CACHE_MIB", default_value_t = 512)]
    pub cache_mib: usize,
    #[arg(long, env = "DFS_CLIENT_CACHE_TTL_MS", default_value_t = 1000)]
    pub cache_ttl_ms: u64,
    #[arg(long, env = "DFS_CLIENT_WRITE_DELAY_MS", default_value_t = 25)]
    pub write_delay_ms: u64,
    #[arg(long, env = "DFS_CLIENT_WRITE_CONCURRENCY", default_value_t = 128)]
    pub write_concurrency: usize,
}
impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            cache_mib: 512,
            cache_ttl_ms: 1000,
            write_delay_ms: 25,
            write_concurrency: 128,
        }
    }
}
#[derive(Default)]
struct Gate {
    mutex: Arc<AsyncMutex<()>>,
    generation: AtomicU64,
    primary_generation: AtomicU64,
    refreshes: AtomicUsize,
}
struct Inner {
    rpc: Client,
    cache: Mutex<Cache>,
    gates: Mutex<HashMap<String, Weak<Gate>>>,
    prefetch: Arc<Semaphore>,
    expires: Instant,
    config: CacheConfig,
    pending: Mutex<writeback::Pending>,
    memory: Arc<Semaphore>,
    write_slots: Arc<Semaphore>,
    flight_slots: Arc<Semaphore>,
    group_slots: Arc<Semaphore>,
    changed: tokio::sync::Notify,
}

#[derive(Clone)]
/// @cc [owner:spolu,label:security;performance] mount-cache-validity
/// Every cache instance MUST belong to one session. Object metadata and authority MUST expire from
/// their validating response, except tentative objects get C from local creation. Listed membership
/// MAY outlive its original TTL only with fresh matching directory authority. Hits/edits MUST NOT
/// renew validity, and neither retained blocks nor membership MAY authorize stale child attributes.
pub struct CachedClient {
    raw: BlockingClient,
    inner: Arc<Inner>,
}
impl CachedClient {
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
    pub fn connect(endpoint: &str, key: &str, config: CacheConfig) -> AnyResult<Self> {
        ensure!(
            (128..=2048).contains(&config.cache_mib),
            "client cache must be 128..2048 MiB"
        );
        ensure!(
            (1..=1000).contains(&config.cache_ttl_ms)
                && (1..=1000).contains(&config.write_delay_ms),
            "client cache/write delays must be at most 1000ms each"
        );
        ensure!(
            (1..=128).contains(&config.write_concurrency),
            "write concurrency must be 1..128"
        );
        let raw = BlockingClient::connect(endpoint, key)?;
        let session = raw.current_session(Empty {})?;
        let seconds = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        ensure!(session.expires_at > seconds, "session expired");
        // Reserve space outside cache entries for bounded FUSE/RPC buffers and scheduler bookkeeping.
        let memory = Arc::new(Semaphore::new(
            (config.cache_mib - IO_RESERVE_MIB) * 1024 * 1024,
        ));
        let inner = Arc::new(Inner {
            rpc: raw.client.clone(),
            cache: Mutex::new(Cache::new(memory.clone())),
            memory,
            gates: Default::default(),
            prefetch: Arc::new(Semaphore::new(2)),
            pending: Default::default(),
            write_slots: Arc::new(Semaphore::new(16)),
            flight_slots: Arc::new(Semaphore::new(config.write_concurrency)),
            group_slots: Arc::new(Semaphore::new(writeback::MAX_GROUPS)),
            changed: Default::default(),
            expires: Instant::now() + Duration::from_secs(session.expires_at - seconds),
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
        self.raw.metrics()
    }
    pub fn stat(&self, r: ObjectRequest) -> Result<Object> {
        self.raw.runtime.block_on(self.inner.stat(&r.object_id))
    }
    pub fn lookup(&self, r: LookupRequest) -> Result<Object> {
        self.raw.runtime.block_on(self.inner.lookup(r))
    }
    pub fn list(&self, r: ListRequest) -> Result<Page> {
        self.raw.runtime.block_on(self.inner.list(r))
    }
    pub fn read(&self, r: ReadRequest) -> Result<ReadResponse> {
        self.raw.runtime.block_on(self.inner.read(r))
    }
}

impl Inner {
    fn active(&self) -> Result<()> {
        if Instant::now() >= self.expires {
            Err(status(ErrorCode::Unauthenticated))
        } else {
            Ok(())
        }
    }
    fn deadline(&self, received: Instant) -> Instant {
        (received + Duration::from_millis(self.config.cache_ttl_ms)).min(self.expires)
    }
    fn gate(&self, id: &str) -> Result<Arc<Gate>> {
        let mut gates = self.gates.lock();
        if let Some(gate) = gates.get(id).and_then(Weak::upgrade) {
            return Ok(gate);
        }
        if gates.len() >= 4096 {
            gates.retain(|_, gate| gate.strong_count() != 0);
        }
        if gates.len() >= 65536 {
            return Err(status(ErrorCode::Capacity));
        }
        let gate = Arc::new(Gate::default());
        gates.insert(id.to_owned(), Arc::downgrade(&gate));
        Ok(gate)
    }
    fn bump(&self, id: &str) {
        if let Some(gate) = self.gates.lock().get(id).and_then(Weak::upgrade) {
            gate.generation.fetch_add(1, Ordering::AcqRel);
        }
    }
    fn bump_primary(&self, id: &str) {
        if let Some(gate) = self.gates.lock().get(id).and_then(Weak::upgrade) {
            gate.primary_generation.fetch_add(1, Ordering::AcqRel);
        }
    }
    fn cached_object(&self, id: &str) -> Option<Result<Object>> {
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
            .fresh(&Key::Object(id.into()))
            .and_then(|entry| match &entry.value {
                Value::Object(v) => Some(Ok(v.clone())),
                Value::Absent => Some(Err(status(ErrorCode::NotFound))),
                _ => None,
            })
    }
    fn remember_object(&self, object: &Object, started: Instant, received: Instant) {
        let mut cache = self.cache.lock();
        let key = Key::Object(object.id.clone());
        if cache
            .get(&key)
            .is_some_and(|entry| entry.received > started)
        {
            return;
        }
        cache.insert(
            key,
            Value::Object(object.clone()),
            received,
            self.deadline(received),
        );
    }
    async fn stat(&self, id: &str) -> Result<Object> {
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
    async fn stat_locked(&self, id: &str, gate: &Gate) -> Result<Object> {
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
            let result = self
                .rpc
                .stat(ObjectRequest {
                    object_id: id.into(),
                })
                .await;
            let received = Instant::now();
            self.active()?;
            if gate.generation.load(Ordering::Acquire) != generation {
                continue;
            }
            match &result {
                Ok(object) => self.remember_object(object, started, received),
                Err(e) if code(e) == ErrorCode::NotFound => self.cache.lock().insert(
                    Key::Object(id.into()),
                    Value::Absent,
                    received,
                    self.deadline(received),
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
                self.cache.lock().remove(&Key::Object(r.object_id.clone()));
                self.pending.lock().expire(&r.object_id);
                continue;
            }
            return result.map(|data| ReadResponse {
                data,
                size: object.size,
                revision: object.revision,
            });
        }
        Err(status(ErrorCode::Unavailable))
    }
    async fn read_base(&self, object: &Object, offset: u64, length: u32) -> Result<Vec<u8>> {
        let length = (length as u64).min(object.size.saturating_sub(offset)) as usize;
        let mut result = vec![0; length];
        if length == 0 {
            return Ok(result);
        }
        let end = offset + length as u64;
        let mut index = offset / BLOCK_SIZE as u64;
        while index < end.div_ceil(BLOCK_SIZE as u64) {
            let key = Key::Block(object.id.clone(), object.revision.clone(), index);
            let cached = self.cache.lock().get(&key);
            let bytes = if let Some(entry) = &cached
                && let Value::Block(data) = &entry.value
            {
                Some(data.as_slice())
            } else {
                None
            };
            if let Some(bytes) = bytes {
                copy_block(&mut result, offset, end, index, bytes);
                index += 1;
                continue;
            }
            let start = index * BLOCK_SIZE as u64;
            let fetch_end = (end.div_ceil(BLOCK_SIZE as u64) * BLOCK_SIZE as u64)
                .min(start + MAX_IO as u64)
                .min(object.size);
            let response = self
                .rpc
                .read(ReadRequest {
                    object_id: object.id.clone(),
                    offset: start,
                    length: (fetch_end - start) as u32,
                    revision: object.revision.clone(),
                })
                .await?;
            self.active()?;
            if response.revision != object.revision
                || response.size != object.size
                || response.data.len() != (fetch_end - start) as usize
            {
                return Err(status(ErrorCode::StaleView));
            }
            let received = Instant::now();
            for block in response.data.chunks(BLOCK_SIZE) {
                copy_block(&mut result, offset, end, index, block);
                self.cache.lock().insert(
                    Key::Block(object.id.clone(), object.revision.clone(), index),
                    Value::Block(block.to_vec()),
                    received,
                    self.expires,
                );
                index += 1;
            }
        }
        Ok(result)
    }
}
fn name_generation(parent: &str, name: &str) -> String {
    format!("{parent}/{name}")
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
