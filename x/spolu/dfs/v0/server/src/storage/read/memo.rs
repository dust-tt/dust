use std::{
    num::NonZeroUsize,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result};
use lru::LruCache;
use slatedb::bytes::Bytes;

#[derive(Clone, Eq, PartialEq, Hash)]
enum Key {
    Row(u64, Vec<u8>),
    Authorized(u64, Vec<u8>, [u8; 32]),
}

impl Key {
    fn weight(&self) -> usize {
        let bytes = match self {
            Self::Row(_, key) | Self::Authorized(_, key, _) => key.len(),
        };
        // Include fixed bookkeeping and the authorization digest, even for absent rows.
        192 + bytes
    }
}

struct State {
    entries: LruCache<Key, Option<Bytes>>,
    bytes: usize,
}

/// @cc [owner:spolu,label:security;performance] snapshot-scoped-memo
/// Memoized rows and successful authorization MUST be keyed by workspace-qualified key and the
/// exact snapshot's mutation sequence. Authorization keys MUST additionally include a digest of
/// the complete, length-delimited grant set. Never reuse decisions across different sequences or
/// storage instances. Bound retained values and keys by bytes and entry count, including misses.
pub(crate) struct ReadMemo {
    state: Mutex<State>,
    limit_bytes: usize,
    row_hits: AtomicU64,
    row_misses: AtomicU64,
    authorization_hits: AtomicU64,
}

impl ReadMemo {
    pub fn new(limit_bytes: usize) -> Result<Self> {
        Ok(Self {
            state: Mutex::new(State {
                entries: LruCache::new(NonZeroUsize::new(131_072).context("entry limit")?),
                bytes: 0,
            }),
            limit_bytes,
            row_hits: AtomicU64::new(0),
            row_misses: AtomicU64::new(0),
            authorization_hits: AtomicU64::new(0),
        })
    }

    pub fn row(&self, sequence: u64, key: &[u8]) -> Result<Option<Option<Bytes>>> {
        let cached = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("read cache unavailable"))?
            .entries
            .get(&Key::Row(sequence, key.to_vec()))
            .cloned();
        if cached.is_some() {
            &self.row_hits
        } else {
            &self.row_misses
        }
        .fetch_add(1, Ordering::Relaxed);
        Ok(cached)
    }

    pub fn insert_row(&self, sequence: u64, key: Vec<u8>, value: Option<Bytes>) -> Result<()> {
        // A SlateDB slice may retain an entire block. Own exactly the accounted bytes.
        self.insert(
            Key::Row(sequence, key),
            value.map(|bytes| Bytes::copy_from_slice(&bytes)),
        )
    }

    pub fn authorized(&self, sequence: u64, key: Vec<u8>, grants: [u8; 32]) -> Result<bool> {
        let present = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("read cache unavailable"))?
            .entries
            .get(&Key::Authorized(sequence, key, grants))
            .is_some();
        if present {
            self.authorization_hits.fetch_add(1, Ordering::Relaxed);
        }
        Ok(present)
    }

    pub fn authorize(&self, sequence: u64, key: Vec<u8>, grants: [u8; 32]) -> Result<()> {
        self.insert(Key::Authorized(sequence, key, grants), None)
    }

    fn insert(&self, key: Key, value: Option<Bytes>) -> Result<()> {
        let weight = key.weight() + value.as_ref().map_or(0, Bytes::len);
        if weight > self.limit_bytes {
            return Ok(());
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("read cache unavailable"))?;
        if let Some((key, value)) = state.entries.push(key, value) {
            state.bytes -= key.weight() + value.as_ref().map_or(0, Bytes::len);
        }
        state.bytes += weight;
        while state.bytes > self.limit_bytes {
            if let Some((key, value)) = state.entries.pop_lru() {
                state.bytes -= key.weight() + value.as_ref().map_or(0, Bytes::len);
            } else {
                anyhow::bail!("invalid read cache accounting");
            }
        }
        Ok(())
    }

    pub fn log_metrics(&self) {
        tracing::info!(
            metadata_cache_hits = self.row_hits.load(Ordering::Relaxed),
            metadata_cache_misses = self.row_misses.load(Ordering::Relaxed),
            authorization_cache_hits = self.authorization_hits.load(Ordering::Relaxed),
            "dfs namespace cache metrics"
        );
    }
}
