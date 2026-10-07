use super::*;
use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use tokio::sync::OwnedMutexGuard;

const WHOLE_FILE: u64 = 1024 * 1024;
const SIBLING_FILE: u64 = 256 * 1024;
const MIN_WINDOW: usize = 16;
const MAX_WINDOW: usize = 256;

#[derive(Default)]
pub(super) struct Counters {
    fetched: AtomicU64,
    consumed: AtomicU64,
    discarded: AtomicU64,
}
impl Counters {
    pub fn json(&self) -> serde_json::Value {
        serde_json::json!({
            "prefetched_bytes": self.fetched.load(Ordering::Relaxed),
            "prefetched_block_bytes_consumed": self.consumed.load(Ordering::Relaxed),
            "prefetched_bytes_discarded_unused": self.discarded.load(Ordering::Relaxed),
        })
    }
}

pub(super) struct Block {
    pub data: Vec<u8>,
    parent: Option<ObjectRef>,
    speculative: bool,
    used: AtomicBool,
    counters: Arc<Counters>,
}
impl Block {
    pub fn new(
        data: Vec<u8>,
        parent: Option<ObjectRef>,
        speculative: bool,
        counters: Arc<Counters>,
    ) -> Self {
        if speculative {
            counters
                .fetched
                .fetch_add(data.len() as u64, Ordering::Relaxed);
        }
        Self {
            data,
            parent,
            speculative,
            used: AtomicBool::new(false),
            counters,
        }
    }
    fn consume(&self) -> Option<ObjectRef> {
        if self.speculative && !self.used.swap(true, Ordering::Relaxed) {
            self.counters
                .consumed
                .fetch_add(self.data.len() as u64, Ordering::Relaxed);
            self.parent
        } else {
            None
        }
    }
}
impl Drop for Block {
    fn drop(&mut self) {
        if self.speculative && !self.used.load(Ordering::Relaxed) {
            self.counters
                .discarded
                .fetch_add(self.data.len() as u64, Ordering::Relaxed);
        }
    }
}

struct Fetch {
    id: ObjectRef,
    gate: Arc<Gate>,
    generation: u64,
    expiry_ceiling: Option<Instant>,
    _guard: Option<OwnedMutexGuard<()>>,
}

impl Inner {
    fn stream_window(&self, object: &Attr, offset: u64) -> (bool, usize) {
        let mut cache = self.cache.lock();
        let previous = cache.get(&Key::Stream(object.id));
        match previous.as_deref().map(|entry| &entry.value) {
            Some(Value::Stream { next, window }) if *next == offset => {
                (true, (*window * 2).min(MAX_IO))
            }
            _ => (offset == 0, BLOCK_SIZE),
        }
    }
    fn finish_stream(&self, object: &Attr, end: u64, window: usize) {
        self.cache.lock().insert(
            Key::Stream(object.id),
            Value::Stream { next: end, window },
            Instant::now(),
            self.expires,
        );
    }
    fn consumed(&self, block: &Block) {
        if let Some(parent) = block.consume() {
            let mut cache = self.cache.lock();
            let old = cache.get(&Key::Window(parent));
            let count = match old.as_deref().map(|entry| &entry.value) {
                Some(Value::Window(count)) => *count,
                _ => MIN_WINDOW,
            };
            cache.insert_spare(
                Key::Window(parent),
                Value::Window((count * 2).min(MAX_WINDOW)),
                Instant::now(),
                self.expires,
            );
        }
    }

    /// @cc [owner:spolu,label:performance;concurrency] demand-first-content-fetch
    /// Demand MUST be first and fit without siblings. Siblings MUST come from a cached listing, be
    /// at most 256 KiB, and acquire their object gates without waiting. Busy or pending objects MUST
    /// be skipped. The batch MUST fit 256 IDs/4 MiB; speculative cache installs MUST NOT evict demand.
    fn whole_plan(&self, object: &Attr) -> Result<(Vec<Fetch>, Option<ObjectRef>)> {
        let gate = self.gate(&object.id)?;
        let mut plan = vec![Fetch {
            id: object.id,
            generation: gate.generation.load(Ordering::Acquire),
            expiry_ceiling: self
                .cache
                .lock()
                .get(&Key::Attr(object.id))
                .map(|entry| entry.expires),
            gate,
            _guard: None,
        }];
        let (parent, candidates) = {
            let mut cache = self.cache.lock();
            if self.memory.available_permits() < dfs_protocol::MAX_REPLY * 2 {
                return Ok((plan, None));
            }
            let source = cache.fresh(&Key::Source(object.id));
            let Some(Value::Source { parent, after }) = source.as_deref().map(|entry| &entry.value)
            else {
                return Ok((plan, None));
            };
            let window = cache.get(&Key::Window(*parent));
            let window = match window.as_deref().map(|entry| &entry.value) {
                Some(Value::Window(count)) => *count,
                _ => MIN_WINDOW,
            };
            let page = cache.fresh(&Key::Page(*parent, after.clone()));
            let Some(Value::Page(page)) = page.as_deref().map(|entry| &entry.value) else {
                return Ok((plan, Some(*parent)));
            };
            let start = page.entries.iter().position(|entry| {
                entry
                    .object
                    .as_ref()
                    .is_some_and(|attr| attr.id == object.id)
            });
            let Some(start) = start else {
                return Ok((plan, Some(*parent)));
            };
            let mut bytes = object.size as usize + 512;
            let mut candidates = Vec::new();
            for entry in page.entries.iter().skip(start + 1) {
                let Some(attr) = &entry.object else {
                    continue;
                };
                if attr.directory || attr.size == 0 || attr.size > SIBLING_FILE {
                    continue;
                }
                if candidates.len() + 1 >= window
                    || bytes + attr.size as usize + 512 > dfs_protocol::MAX_REPLY - MAX_WINDOW * 512
                {
                    break;
                }
                if cache.get(&Key::Block(attr.id, attr.revision, 0)).is_some() {
                    continue;
                }
                candidates.push(attr.id);
                bytes += attr.size as usize + 512;
            }
            (Some(*parent), candidates)
        };
        for id in candidates {
            let gate = self.gate(&id)?;
            let Ok(guard) = gate.mutex.clone().try_lock_owned() else {
                continue;
            };
            if self.pending.lock().contains(&id) {
                continue;
            }
            plan.push(Fetch {
                id,
                generation: gate.generation.load(Ordering::Acquire),
                expiry_ceiling: self
                    .cache
                    .lock()
                    .get(&Key::Attr(id))
                    .map(|entry| entry.expires),
                gate,
                _guard: Some(guard),
            });
        }
        Ok((plan, parent))
    }

    /// @cc [owner:spolu,label:concurrency;security] coherent-whole-file-install
    /// Whole-file bytes MUST be installed only with their returned canonical revision and authority
    /// deadline from request send. Every install MUST recheck the object's pinned generation and
    /// pending writes. Unknown/duplicate/missing results MUST fail. A changed demand revision MUST
    /// restart the whole caller read, never splice bytes from the old and new versions.
    /// Content fills MUST NOT extend an existing metadata deadline, even with canonical attributes.
    async fn whole_file(&self, object: &Attr, offset: u64, end: u64) -> Result<Vec<u8>> {
        // Keep decoded replies bounded through installation, while leaving RPC capacity for demand.
        let _slot = self
            .content_slots
            .acquire()
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?;
        let (plan, parent) = self.whole_plan(object)?;
        let started = Instant::now();
        let response = self
            .rpc
            .read_files(ReadFilesRequest {
                object_ids: plan.iter().map(|fetch| fetch.id).collect(),
            })
            .await?;
        self.active()?;
        let received = Instant::now();
        let planned: HashMap<_, _> = plan.iter().map(|fetch| (fetch.id, fetch)).collect();
        let mut expected: HashSet<_> = plan.iter().map(|fetch| fetch.id).collect();
        for id in response
            .results
            .iter()
            .map(|result| &result.object_id)
            .chain(&response.omitted_ids)
        {
            if !expected.remove(id) {
                return Err(status(ErrorCode::Unavailable));
            }
        }
        if !expected.is_empty() {
            return Err(status(ErrorCode::Unavailable));
        }
        let mut demand = None;
        for result in response.results {
            let Some(fetch) = planned.get(&result.object_id) else {
                return Err(status(ErrorCode::Unavailable));
            };
            if let Some(error) = result.error {
                if result.object_id == object.id {
                    let code = ErrorCode::try_from(error.code).unwrap_or(ErrorCode::Unavailable);
                    return Err(status(if code == ErrorCode::Capacity {
                        ErrorCode::StaleView
                    } else {
                        code
                    }));
                }
                continue;
            }
            let attr = result
                .object
                .ok_or_else(|| status(ErrorCode::Unavailable))?;
            let data = result.data.ok_or_else(|| status(ErrorCode::Unavailable))?;
            if attr.id != fetch.id
                || attr.directory
                || attr.size != data.len() as u64
                || data.len() > MAX_IO
                || attr.revision.is_empty()
            {
                return Err(status(ErrorCode::Unavailable));
            }
            let pending = self.pending.lock();
            if fetch.generation != fetch.gate.generation.load(Ordering::Acquire)
                || pending.contains(&fetch.id)
            {
                if fetch.id == object.id {
                    return Err(status(ErrorCode::StaleView));
                }
                continue;
            }
            let is_demand = fetch.id == object.id;
            self.remember_object_with_capacity(
                &attr,
                started,
                received,
                !is_demand,
                fetch.expiry_ceiling,
            );
            for (index, bytes) in data.chunks(BLOCK_SIZE).enumerate() {
                let block_start = (index * BLOCK_SIZE) as u64;
                let speculative =
                    !is_demand || block_start >= end || block_start + bytes.len() as u64 <= offset;
                self.install_block(&attr, index as u64, bytes, parent, speculative, received);
            }
            if is_demand {
                if attr.revision != object.revision || attr.size != object.size {
                    return Err(status(ErrorCode::StaleView));
                }
                demand = Some(data);
            }
        }
        demand.ok_or_else(|| status(ErrorCode::StaleView))
    }

    fn install_block(
        &self,
        object: &Attr,
        index: u64,
        bytes: &[u8],
        parent: Option<ObjectRef>,
        speculative: bool,
        received: Instant,
    ) {
        let key = Key::Block(object.id, object.revision, index);
        let value = Value::Block(Block::new(
            bytes.to_vec(),
            parent,
            speculative,
            self.content.clone(),
        ));
        let mut cache = self.cache.lock();
        if speculative {
            cache.insert_spare(key, value, received, self.expires);
        } else {
            cache.insert(key, value, received, self.expires);
        }
    }

    /// @cc [owner:spolu,label:performance;concurrency] adaptive-content-window
    /// Sequential misses MAY fetch a whole file up to 1 MiB or an aligned window up to 1 MiB.
    /// Random reads MUST reduce speculative range size. Dirty-base reads MUST retain their expected
    /// revision and MUST NOT install newer whole-file attributes over pending writes. Range fills
    /// MUST NOT renew metadata validity. All retained blocks MUST share the configured cache budget.
    pub(super) async fn read_base(
        &self,
        object: &Attr,
        offset: u64,
        length: u32,
    ) -> Result<Vec<u8>> {
        let length = (length as u64).min(object.size.saturating_sub(offset)) as usize;
        let mut result = vec![0; length];
        if length == 0 {
            return Ok(result);
        }
        let end = offset + length as u64;
        let clean = !self.pending.lock().contains(&object.id);
        let (sequential, window) = self.stream_window(object, offset);
        let mut index = offset / BLOCK_SIZE as u64;
        while index < end.div_ceil(BLOCK_SIZE as u64) {
            let cached = self
                .cache
                .lock()
                .get(&Key::Block(object.id, object.revision, index));
            if let Some(entry) = &cached
                && let Value::Block(block) = &entry.value
            {
                self.consumed(block);
                copy_block(&mut result, offset, end, index, &block.data);
                index += 1;
                continue;
            }
            if clean && sequential && object.size <= WHOLE_FILE {
                let data = self.whole_file(object, offset, end).await?;
                result.copy_from_slice(&data[offset as usize..end as usize]);
                self.finish_stream(object, end, window);
                return Ok(result);
            }
            let start = index * BLOCK_SIZE as u64;
            let ahead = if clean && self.memory.available_permits() >= dfs_protocol::MAX_REPLY {
                window
            } else {
                BLOCK_SIZE
            };
            let fetch_end = (end.div_ceil(BLOCK_SIZE as u64) * BLOCK_SIZE as u64)
                .max(start + ahead as u64)
                .min(start + MAX_IO as u64)
                .min(object.size);
            let response = self
                .rpc
                .read(ReadRequest {
                    object_id: object.id,
                    offset: start,
                    length: (fetch_end - start) as u32,
                    revision: object.revision,
                })
                .await?;
            self.active()?;
            if response.object.revision != object.revision
                || response.object.size != object.size
                || response.data.len() != (fetch_end - start) as usize
            {
                return Err(status(ErrorCode::StaleView));
            }
            let received = Instant::now();
            for block in response.data.chunks(BLOCK_SIZE) {
                copy_block(&mut result, offset, end, index, block);
                self.install_block(
                    object,
                    index,
                    block,
                    None,
                    index * BLOCK_SIZE as u64 >= end,
                    received,
                );
                index += 1;
            }
        }
        self.finish_stream(object, end, window);
        Ok(result)
    }
}
