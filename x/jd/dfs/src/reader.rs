use crate::{cache::Cache, client::Client, model::*};
use parking_lot::{Mutex, RwLock};
use std::collections::{BTreeMap, HashMap};
use std::hash::{Hash, Hasher};
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use tokio::sync::Semaphore;

#[derive(Default, Debug)]
pub struct ReadCounters {
    hits: AtomicU64,
    misses: AtomicU64,
    inflight_blocks: AtomicU64,
    demand_bytes: AtomicU64,
    prefetch_bytes: AtomicU64,
    prefetch_calls: AtomicU64,
    prefetch_errors: AtomicU64,
    reply_reserved_bytes: AtomicU64,
    peak_reply_reserved_bytes: AtomicU64,
    reply_waits: AtomicU64,
}
impl ReadCounters {
    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({
            "block_hits": self.hits.load(Ordering::Relaxed),
            "block_misses": self.misses.load(Ordering::Relaxed),
            "inflight_blocks": self.inflight_blocks.load(Ordering::Relaxed),
            "demand_bytes": self.demand_bytes.load(Ordering::Relaxed),
            "prefetch_bytes": self.prefetch_bytes.load(Ordering::Relaxed),
            "prefetch_calls": self.prefetch_calls.load(Ordering::Relaxed),
            "prefetch_errors": self.prefetch_errors.load(Ordering::Relaxed),
            "reply_reserved_bytes": self.reply_reserved_bytes.load(Ordering::Relaxed),
            "peak_reply_reserved_bytes": self.peak_reply_reserved_bytes.load(Ordering::Relaxed),
            "reply_waits": self.reply_waits.load(Ordering::Relaxed),
        })
    }
}

#[derive(Debug)]
struct ReplyReservation {
    _permit: tokio::sync::OwnedSemaphorePermit,
    bytes: usize,
    counters: Arc<ReadCounters>,
}
impl ReplyReservation {
    fn new(
        permit: tokio::sync::OwnedSemaphorePermit,
        bytes: usize,
        counters: Arc<ReadCounters>,
    ) -> Self {
        let reserved = counters
            .reply_reserved_bytes
            .fetch_add(bytes as u64, Ordering::Relaxed)
            + bytes as u64;
        counters
            .peak_reply_reserved_bytes
            .fetch_max(reserved, Ordering::Relaxed);
        Self {
            _permit: permit,
            bytes,
            counters,
        }
    }
}
impl Drop for ReplyReservation {
    fn drop(&mut self) {
        self.counters
            .reply_reserved_bytes
            .fetch_sub(self.bytes as u64, Ordering::Relaxed);
    }
}

#[derive(Debug)]
pub struct ReadResponse {
    bytes: Vec<u8>,
    _reservation: ReplyReservation,
}
impl std::ops::Deref for ReadResponse {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        &self.bytes
    }
}
impl AsRef<[u8]> for ReadResponse {
    fn as_ref(&self) -> &[u8] {
        &self.bytes
    }
}

#[derive(Clone)]
pub struct ReadRequest {
    pub node: Node,
    pub remote: Option<Id>,
    pub incarnation: Id,
    pub auth_generation: u64,
    pub view_head: u64,
    pub unlinked: bool,
    pub sequential: bool,
    pub offset: u64,
    pub size: u32,
}

#[derive(Clone, Copy, Debug)]
pub struct ReadLimits {
    pub rpc_bytes: usize,
    pub demand_concurrency: usize,
    pub demand_inflight_bytes: usize,
    pub reply_bytes: usize,
    pub speculative_bytes: usize,
    pub pending_requests: usize,
}
impl Default for ReadLimits {
    fn default() -> Self {
        Self {
            rpc_bytes: MAX_IO_BYTES,
            demand_concurrency: 4,
            demand_inflight_bytes: 8 * MAX_IO_BYTES,
            reply_bytes: 8 * MAX_IO_BYTES,
            speculative_bytes: MAX_IO_BYTES,
            pending_requests: 128,
        }
    }
}
impl ReadLimits {
    fn validate(self) -> Result<Self> {
        if self.rpc_bytes < CHUNK_BYTES
            || self.rpc_bytes > MAX_IO_BYTES
            || !self.rpc_bytes.is_multiple_of(CHUNK_BYTES)
            || self.demand_concurrency == 0
            || self.demand_inflight_bytes < 2 * self.rpc_bytes
            || self.demand_inflight_bytes > u32::MAX as usize
            || self.reply_bytes < MAX_IO_BYTES
            || self.reply_bytes > u32::MAX as usize
            || self.speculative_bytes > MAX_IO_BYTES
            || self.pending_requests == 0
        {
            return Err(err(libc::EINVAL, "invalid read limits"));
        }
        Ok(self)
    }
}

#[derive(Default)]
struct AccessHistory {
    incarnation: Id,
    generation: u64,
    stamp: u64,
    directories: HashMap<Option<Id>, (Id, u64)>,
    order: BTreeMap<u64, Option<Id>>,
}
impl AccessHistory {
    fn completed(&mut self, cache: &Cache, request: &ReadRequest) -> bool {
        if Reader::check_cache(cache, request, request.auth_generation).is_err() {
            return false;
        }
        if self.incarnation != request.incarnation || self.generation != request.auth_generation {
            *self = Self {
                incarnation: request.incarnation.clone(),
                generation: request.auth_generation,
                ..Self::default()
            };
        }
        let Some(item) = cache.namespace.nodes.get(&request.node.id) else {
            return false;
        };
        let parent = item.visible_parent.clone();
        self.stamp += 1;
        let previous = self
            .directories
            .insert(parent.clone(), (request.node.id.clone(), self.stamp));
        if let Some((_, stamp)) = &previous {
            self.order.remove(stamp);
        }
        self.order.insert(self.stamp, parent);
        while self.directories.len() > 256 {
            if let Some((_, parent)) = self.order.pop_first() {
                self.directories.remove(&parent);
            }
        }
        previous.is_some_and(|(previous, _)| cache.next_file(&previous, &request.node.id))
    }
}

pub struct Reader {
    runtime: tokio::runtime::Handle,
    #[cfg(target_os = "linux")]
    kernel: RwLock<Option<Arc<crate::mount::KernelCache>>>,
    cache: Arc<Mutex<Cache>>,
    client: Arc<RwLock<Client>>,
    network: Semaphore,
    demand_bytes: Semaphore,
    reply_bytes: Arc<Semaphore>,
    limits: ReadLimits,
    speculation: Arc<Semaphore>,
    pub pending: Arc<Semaphore>,
    pub counters: Arc<ReadCounters>,
    read_ahead_bytes: usize,
    blocks: [tokio::sync::Mutex<()>; 256],
    access_history: Mutex<AccessHistory>,
}
impl Reader {
    pub fn new(
        cache: Arc<Mutex<Cache>>,
        client: Arc<RwLock<Client>>,
        read_ahead_bytes: usize,
    ) -> Arc<Self> {
        Self::with_limits(cache, client, read_ahead_bytes, ReadLimits::default()).unwrap()
    }
    pub fn with_limits(
        cache: Arc<Mutex<Cache>>,
        client: Arc<RwLock<Client>>,
        read_ahead_bytes: usize,
        limits: ReadLimits,
    ) -> Result<Arc<Self>> {
        let limits = limits.validate()?;
        if read_ahead_bytes > 0 {
            let mut cache = cache.lock();
            let budget = cache.content.budget / 4;
            cache.content.set_speculative_budget(budget);
        }
        Ok(Arc::new(Self {
            runtime: tokio::runtime::Handle::try_current()
                .map_err(|_| err(libc::EINVAL, "reader requires a runtime"))?,
            #[cfg(target_os = "linux")]
            kernel: RwLock::new(None),
            cache,
            client,
            network: Semaphore::new(limits.demand_concurrency),
            demand_bytes: Semaphore::new(limits.demand_inflight_bytes),
            reply_bytes: Arc::new(Semaphore::new(limits.reply_bytes)),
            limits,
            blocks: std::array::from_fn(|_| tokio::sync::Mutex::new(())),
            access_history: Mutex::new(AccessHistory::default()),
            speculation: Arc::new(Semaphore::new(1)),
            pending: Arc::new(Semaphore::new(limits.pending_requests)),
            counters: Arc::new(ReadCounters::default()),
            read_ahead_bytes: read_ahead_bytes.min(limits.speculative_bytes),
        }))
    }
    #[cfg(target_os = "linux")]
    pub fn set_kernel(&self, kernel: Arc<crate::mount::KernelCache>) {
        *self.kernel.write() = Some(kernel);
    }

    #[cfg(target_os = "linux")]
    pub fn kernel_cache(&self) -> Option<Arc<crate::mount::KernelCache>> {
        self.kernel.read().clone()
    }

    #[cfg(target_os = "linux")]
    pub fn kernel_snapshot(&self) -> serde_json::Value {
        self.kernel
            .read()
            .as_ref()
            .map(|kernel| kernel.snapshot())
            .unwrap_or(serde_json::Value::Null)
    }

    #[cfg(target_os = "linux")]
    pub fn kernel_demand(&self, request: &ReadRequest) {
        if let Some(kernel) = self.kernel.read().as_ref() {
            kernel.demand(request);
        }
    }

    fn check_cache(cache: &Cache, request: &ReadRequest, generation: u64) -> Result<()> {
        if cache.namespace.incarnation != request.incarnation {
            return Err(err(libc::ESTALE, "read incarnation changed"));
        }
        if cache.namespace.auth_generation != generation {
            return Err(err(libc::EACCES, "read authority changed"));
        }
        if request.unlinked && cache.namespace.head != request.view_head {
            return Err(err(libc::ESTALE, "unlinked read view changed"));
        }
        if let Some(item) = cache.namespace.nodes.get(&request.node.id)
            && item.verbs & READ == 0
        {
            return Err(err(libc::EACCES, "read permission denied"));
        }
        if !request.unlinked
            && cache
                .namespace
                .nodes
                .get(&request.node.id)
                .is_none_or(|item| item.node.version != request.node.version)
        {
            return Err(err(libc::ESTALE, "read version changed"));
        }
        Ok(())
    }
    pub fn validate(&self, request: &ReadRequest) -> Result<()> {
        Self::check_cache(&self.cache.lock(), request, request.auth_generation)
    }
    fn completed(&self, request: &ReadRequest, position: u64) -> bool {
        if position != request.node.size || (request.offset != 0 && !request.sequential) {
            return false;
        }
        let cache = self.cache.lock();
        self.access_history.lock().completed(&cache, request)
    }
    pub fn cached_read(self: &Arc<Self>, request: &ReadRequest) -> Result<Option<ReadResponse>> {
        if request.unlinked {
            return Ok(None);
        }
        if request.size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "read request size"));
        }
        let end = request
            .offset
            .saturating_add(u64::from(request.size))
            .min(request.node.size);
        let first = request.offset / CHUNK_BYTES as u64;
        let last = end.div_ceil(CHUNK_BYTES as u64);
        let mut cache = self.cache.lock();
        Self::check_cache(&cache, request, request.auth_generation)?;
        let charge = end.saturating_sub(request.offset).max(1) as usize;
        let Ok(permit) = self
            .reply_bytes
            .clone()
            .try_acquire_many_owned(charge as u32)
        else {
            return Ok(None);
        };
        let reservation = ReplyReservation::new(permit, charge, self.counters.clone());
        if request.offset >= request.node.size {
            return Ok(Some(ReadResponse {
                bytes: Vec::new(),
                _reservation: reservation,
            }));
        }
        let Some(parts) = (first..last)
            .map(|index| cache.content.peek_shared_chunk(&request.node, index))
            .collect::<Option<Vec<_>>>()
        else {
            return Ok(None);
        };
        let mut output = Vec::with_capacity(end.saturating_sub(request.offset) as usize);
        let mut position = request.offset;
        while position < end {
            let index = position / CHUNK_BYTES as u64;
            let bytes = &parts[(index - first) as usize];
            cache.content.shared_chunk(&request.node, index);
            let start = (position % CHUNK_BYTES as u64) as usize;
            let count = (end - position).min((CHUNK_BYTES - start) as u64) as usize;
            if start + count > bytes.len() {
                return Err(err(libc::EIO, "short cached block"));
            }
            output.extend_from_slice(&bytes[start..start + count]);
            self.counters.hits.fetch_add(1, Ordering::Relaxed);
            position += count as u64;
        }
        drop(cache);
        self.predict(request, position);
        Ok(Some(ReadResponse {
            bytes: output,
            _reservation: reservation,
        }))
    }
    pub async fn read(self: &Arc<Self>, mut request: ReadRequest) -> Result<ReadResponse> {
        if request.size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "read request size"));
        }
        let charge = request.size.max(1);
        let permit = match self.reply_bytes.clone().try_acquire_many_owned(charge) {
            Ok(permit) => permit,
            Err(_) => {
                self.counters.reply_waits.fetch_add(1, Ordering::Relaxed);
                self.reply_bytes
                    .clone()
                    .acquire_many_owned(charge)
                    .await
                    .unwrap()
            }
        };
        let reservation = ReplyReservation::new(permit, charge as usize, self.counters.clone());
        let client = self.client.read().clone();
        let generation = request.auth_generation;
        Self::check_cache(&self.cache.lock(), &request, generation)?;
        let handle = request
            .remote
            .clone()
            .unwrap_or_else(|| format!("view:{}", request.node.id));
        if request.unlinked {
            let _permit = self.network.acquire().await.unwrap();
            let Reply::Node(node) = client
                .call(Call::Stat {
                    node: request.node.id.clone(),
                    handle: Some(handle.clone()),
                })
                .await?
            else {
                return Err(err(libc::EIO, "unlinked stat reply"));
            };
            request.node = node;
        }
        let end = request
            .offset
            .saturating_add(u64::from(request.size))
            .min(request.node.size);
        let mut output = Vec::with_capacity(end.saturating_sub(request.offset) as usize);
        let mut position = request.offset;
        let mut fetched = std::collections::VecDeque::new();
        let mut fetched_start = 0;
        let mut fetched_permit = None;
        while position < end {
            let index = position / CHUNK_BYTES as u64;
            let from_inflight = index == fetched_start && !fetched.is_empty();
            let cached = if from_inflight {
                fetched_start += 1;
                fetched.pop_front()
            } else {
                self.cache.lock().content.shared_chunk(&request.node, index)
            };
            let bytes = match cached {
                Some(bytes) => {
                    if from_inflight {
                        self.counters
                            .inflight_blocks
                            .fetch_add(1, Ordering::Relaxed);
                    } else {
                        self.counters.hits.fetch_add(1, Ordering::Relaxed);
                    }
                    bytes
                }
                None => {
                    let mut hash = std::collections::hash_map::DefaultHasher::new();
                    (&request.node.id, &request.node.version, index).hash(&mut hash);
                    let _block = self.blocks[hash.finish() as usize % self.blocks.len()]
                        .lock()
                        .await;
                    fetched.clear();
                    drop(fetched_permit.take());
                    let byte_permit = self
                        .demand_bytes
                        .acquire_many((2 * self.limits.rpc_bytes) as u32)
                        .await
                        .unwrap();
                    let _permit = self.network.acquire().await.unwrap();
                    Self::check_cache(&self.cache.lock(), &request, generation)?;
                    let cached = self.cache.lock().content.shared_chunk(&request.node, index);
                    if let Some(bytes) = cached {
                        bytes
                    } else {
                        let count = {
                            let cache = self.cache.lock();
                            let capacity = (self.limits.rpc_bytes / CHUNK_BYTES) as u64;
                            let last = end.div_ceil(CHUNK_BYTES as u64).min(index + capacity);
                            let mut count = 1;
                            while index + count < last
                                && cache.content.chunk(&request.node, index + count).is_none()
                            {
                                count += 1;
                            }
                            count
                        };
                        let Reply::Data(bytes) = client
                            .call(Call::Read {
                                node: request.node.id.clone(),
                                version: Some(request.node.version.clone()),
                                offset: index * CHUNK_BYTES as u64,
                                size: (count * CHUNK_BYTES as u64) as u32,
                                handle: Some(handle.clone()),
                            })
                            .await?
                        else {
                            return Err(err(libc::EIO, "read reply"));
                        };
                        Self::check_cache(&self.cache.lock(), &request, generation)?;
                        self.counters
                            .demand_bytes
                            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        let parts: Vec<Arc<[u8]>> = if bytes.len() <= CHUNK_BYTES {
                            vec![bytes.into()]
                        } else {
                            bytes.chunks(CHUNK_BYTES).map(Arc::from).collect()
                        };
                        self.counters
                            .misses
                            .fetch_add(parts.len() as u64, Ordering::Relaxed);
                        {
                            let mut cache = self.cache.lock();
                            Self::check_cache(&cache, &request, generation)?;
                            for (part, bytes) in parts.iter().enumerate() {
                                cache.content.insert_shared(
                                    &request.node,
                                    index + part as u64,
                                    bytes.clone(),
                                );
                            }
                        }
                        fetched_start = index + 1;
                        fetched = parts.iter().skip(1).cloned().collect();
                        fetched_permit = Some(byte_permit);
                        parts[0].clone()
                    }
                }
            };
            let start = (position % CHUNK_BYTES as u64) as usize;
            let count = (end - position).min((CHUNK_BYTES - start) as u64) as usize;
            if start + count > bytes.len() {
                return Err(err(libc::EIO, "short chunk"));
            }
            output.extend_from_slice(&bytes[start..start + count]);
            position += count as u64;
        }
        Self::check_cache(&self.cache.lock(), &request, generation)?;
        self.predict(&request, position);
        Ok(ReadResponse {
            bytes: output,
            _reservation: reservation,
        })
    }
    fn predict(self: &Arc<Self>, request: &ReadRequest, position: u64) {
        let adjacent = self.completed(request, position);
        let sequential = request.sequential
            && position < request.node.size
            && request.size as usize >= CHUNK_BYTES;
        if !request.unlinked && (adjacent || sequential) {
            self.prefetch(
                request.node.clone(),
                position.div_ceil(CHUNK_BYTES as u64),
                request.auth_generation,
                adjacent,
            );
        }
    }
    fn prefetch(self: &Arc<Self>, node: Node, index: u64, generation: u64, siblings: bool) {
        if self.read_ahead_bytes == 0 {
            return;
        }
        let Ok(permit) = self.speculation.clone().try_acquire_owned() else {
            return;
        };
        let reader = self.clone();
        self.runtime.spawn(async move {
            let _permit = permit;
            let client = reader.client.read().clone();
            let mut ranges = {
                let cache = reader.cache.lock();
                if cache.namespace.auth_generation != generation {
                    return;
                }
                cache.adjacent_ranges(&node, index, reader.read_ahead_bytes, siblings)
            };
            #[cfg(target_os = "linux")]
            let kernel = reader.kernel.read().clone();
            #[cfg(target_os = "linux")]
            if let Some(kernel) = &kernel {
                kernel.select(&client.session.incarnation, generation, &mut ranges);
            }
            if ranges.is_empty() {
                return;
            }
            reader
                .counters
                .prefetch_calls
                .fetch_add(1, Ordering::Relaxed);
            match client
                .call(Call::ReadPack {
                    ranges: ranges.clone(),
                })
                .await
            {
                Ok(Reply::Pack(parts)) if parts.len() == ranges.len() => {
                    #[cfg(target_os = "linux")]
                    if let Some(kernel) = kernel {
                        reader.counters.prefetch_bytes.fetch_add(
                            parts.iter().map(|bytes| bytes.len() as u64).sum::<u64>(),
                            Ordering::Relaxed,
                        );
                        if kernel
                            .insert(
                                client.session.incarnation.clone(),
                                generation,
                                ranges.into_iter().zip(parts).collect(),
                            )
                            .await
                            .is_err()
                        {
                            reader
                                .counters
                                .prefetch_errors
                                .fetch_add(1, Ordering::Relaxed);
                        }
                        return;
                    }
                    let mut cache = reader.cache.lock();
                    if cache.namespace.auth_generation != generation
                        || cache.namespace.incarnation != client.session.incarnation
                    {
                        return;
                    }
                    for (range, bytes) in ranges.into_iter().zip(parts) {
                        reader
                            .counters
                            .prefetch_bytes
                            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        if let Some(current) = cache
                            .namespace
                            .nodes
                            .get(&range.node)
                            .map(|n| n.node.clone())
                            && current.version == range.version
                        {
                            cache.content.insert_speculative(
                                &current,
                                range.offset / CHUNK_BYTES as u64,
                                bytes,
                            );
                        }
                    }
                }
                _ => {
                    reader
                        .counters
                        .prefetch_errors
                        .fetch_add(1, Ordering::Relaxed);
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_prediction_expires_old_directories_and_authority() {
        let nodes: Vec<_> = (0..257)
            .flat_map(|directory| {
                ["a", "b"].map(|name| ViewNode {
                    node: Node {
                        id: format!("{directory}/{name}"),
                        parent: Some(directory.to_string()),
                        name: name.into(),
                        kind: Kind::File,
                        version: "version".into(),
                        entry_token: "entry".into(),
                        size: 1,
                        mode: 0o644,
                        mtime_ms: 0,
                        unlinked: false,
                    },
                    visible_parent: Some(directory.to_string()),
                    visible_name: name.into(),
                    verbs: READ,
                })
            })
            .collect();
        let mut cache = Cache::new(
            View {
                incarnation: "incarnation".into(),
                auth_generation: 1,
                head: 1,
                nodes,
            },
            0,
        )
        .unwrap();
        let mut history = AccessHistory::default();
        let request = |cache: &Cache, directory: usize, name: &str| ReadRequest {
            node: cache.namespace.nodes[&format!("{directory}/{name}")]
                .node
                .clone(),
            remote: None,
            incarnation: cache.namespace.incarnation.clone(),
            auth_generation: cache.namespace.auth_generation,
            view_head: cache.namespace.head,
            unlinked: false,
            sequential: false,
            offset: 0,
            size: 1,
        };
        for directory in 0..257 {
            assert!(!history.completed(&cache, &request(&cache, directory, "a")));
        }
        assert!(!history.completed(&cache, &request(&cache, 0, "b")));
        assert!(history.completed(&cache, &request(&cache, 256, "b")));
        cache.namespace.auth_generation += 1;
        assert!(!history.completed(&cache, &request(&cache, 255, "b")));
        assert!(!history.completed(&cache, &request(&cache, 1, "a")));
        cache.namespace.incarnation = "replacement".into();
        assert!(!history.completed(&cache, &request(&cache, 1, "b")));
    }
}
