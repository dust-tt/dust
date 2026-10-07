use super::{Cache, Charge, MAX_READS, Read, Result, Snapshot, Value};
use crate::storage::after;
use bytes::Bytes;
use dfs_protocol::{error::status, rpc::ErrorCode};
use std::{
    collections::{HashMap, VecDeque},
    sync::atomic::Ordering,
};

type Key = (Vec<u8>, [u8; 16]);

/// @cc [owner:spolu,label:performance;concurrency] bounded-clean-block-retention
/// Retained values MUST be immutable facts keyed by tenant/object/block and private revision.
/// FIFO eviction MUST bound entries and share the main byte budget. Eviction MUST NOT discard
/// pending edits or renew freshness; a failed optional insertion MUST NOT fail a coherent read.
#[derive(Default)]
pub(super) struct Blocks {
    values: HashMap<Key, Value<Option<Bytes>>>,
    order: VecDeque<Key>,
}
impl Blocks {
    fn evict(&mut self) -> bool {
        if let Some(key) = self.order.pop_front() {
            self.values.remove(&key);
            true
        } else {
            false
        }
    }
}
impl Cache {
    pub(super) fn reserve(&self, bytes: usize) -> Result<Charge> {
        loop {
            match self.budget.reserve(bytes) {
                Ok(charge) => return Ok(charge),
                Err(error) => {
                    if !self.blocks.lock().evict() {
                        return Err(error);
                    }
                    self.metrics.block_evictions.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
    }
    fn retain_block(&self, key: Key, value: Option<Bytes>) {
        if self.blocks.lock().values.contains_key(&key) {
            return;
        }
        let bytes = 2 * key.0.len() + value.as_ref().map_or(0, Bytes::len) + 256;
        let Ok(charge) = self.reserve(bytes) else {
            return;
        };
        let mut blocks = self.blocks.lock();
        if blocks.values.contains_key(&key) {
            return;
        }
        if blocks.values.len() >= MAX_READS && blocks.evict() {
            self.metrics.block_evictions.fetch_add(1, Ordering::Relaxed);
        }
        blocks.order.push_back(key.clone());
        blocks.values.insert(
            key,
            Value {
                value,
                _charge: charge,
            },
        );
    }
}
impl Snapshot {
    /// @cc [owner:spolu,label:concurrency;security] revision-validated-block-reuse
    /// The caller MUST have read and authorized the matching object revision in this pinned view.
    /// Reuse MUST NOT renew metadata/authority expiry. Only blocks paired with an FDB-backed object
    /// revision may enter this cache; overlaid objects use the journal and preserve all dependencies.
    /// A hit MUST retain a semantic block read for subsequent publication conflict validation.
    pub(crate) async fn block(
        &self,
        object_key: Vec<u8>,
        revision: [u8; 16],
        block_key: Vec<u8>,
    ) -> Result<Option<Bytes>> {
        self.valid()?;
        self.base.check(&block_key, &after(&block_key))?;
        let overlaid = self
            .cache
            .inner
            .read()
            .index
            .point(&object_key, self.cut, self.base.raw.version)
            .0
            .is_some();
        if overlaid {
            return self.get(block_key).await;
        }
        let key = (block_key, revision);
        let cached = self
            .cache
            .blocks
            .lock()
            .values
            .get(&key)
            .map(|v| v.value.clone());
        if let Some(value) = cached {
            self.cache
                .metrics
                .block_hits
                .fetch_add(1, Ordering::Relaxed);
            self.record(Read::Point(key.0, value.clone()))?;
            return Ok(value);
        }
        self.cache
            .metrics
            .block_misses
            .fetch_add(1, Ordering::Relaxed);
        let value = self.get(&key.0).await?;
        if value
            .as_ref()
            .is_some_and(|v| v.len() > dfs_protocol::BLOCK_SIZE)
        {
            return Err(status(ErrorCode::Unavailable));
        }
        self.cache.retain_block(key, value.clone());
        Ok(value)
    }
}
