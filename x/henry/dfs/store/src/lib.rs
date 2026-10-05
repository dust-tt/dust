//! Ordered transactional key-value contract shared by every storage adapter.
//!
//! Filesystem code encodes its logical records into ordered byte keys and talks only to this
//! trait; adapters own SDKs, connections, physical prefixes, and native error mapping.

use std::future::Future;

pub mod memory;

pub type Key = Vec<u8>;
pub type Value = Vec<u8>;

/// Half-open key range `[start, end)`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeyRange {
    pub start: Key,
    pub end: Key,
}

impl KeyRange {
    pub fn new(start: Key, end: Key) -> Self {
        Self { start, end }
    }

    /// Range covering exactly one key.
    pub fn single(key: &[u8]) -> Self {
        let mut end = key.to_vec();
        end.push(0);
        Self { start: key.to_vec(), end }
    }

    /// Range covering every key that starts with `prefix`.
    pub fn prefix(prefix: &[u8]) -> Self {
        Self { start: prefix.to_vec(), end: strinc(prefix) }
    }

    pub fn contains(&self, key: &[u8]) -> bool {
        key >= self.start.as_slice() && key < self.end.as_slice()
    }

    pub fn intersects(&self, other: &KeyRange) -> bool {
        self.start < other.end && other.start < self.end
    }
}

/// Smallest key greater than every key prefixed by `prefix`.
pub fn strinc(prefix: &[u8]) -> Key {
    let mut out = prefix.to_vec();
    while let Some(last) = out.pop() {
        if last != 0xff {
            out.push(last + 1);
            return out;
        }
    }
    vec![0xff; prefix.len() + 1]
}

#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// Definitely not committed; the whole logical operation may be retried from scratch.
    #[error("transaction conflict")]
    Conflict,
    /// Read version too old; definitely not committed and retryable with a fresh version.
    #[error("transaction too old")]
    TooOld,
    /// The commit may or may not have been applied. Never retried blindly.
    #[error("commit outcome unknown")]
    Uncertain,
    /// A declared limit (value size, transaction size) would be exceeded; nothing was published.
    #[error("limit exceeded: {0}")]
    Limit(String),
    #[error("storage unavailable: {0}")]
    Unavailable(String),
}

impl StoreError {
    pub fn retryable(&self) -> bool {
        matches!(self, StoreError::Conflict | StoreError::TooOld)
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// Physical limits an adapter declares; shared planners stay below them.
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub max_value_bytes: usize,
    pub max_txn_bytes: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TxnOptions {
    /// Reuse an earlier read version. Only for read-write transactions whose every read is
    /// conflict-checked; read-only results returned to callers must use a fresh version.
    pub read_version: Option<u64>,
}

pub trait Store: Clone + Send + Sync + 'static {
    type Txn: Txn;

    /// @cc [owner:fontanierh,label:backend;concurrency] serializable-transactions
    /// A transaction that commits successfully MUST behave as if all of its reads (point reads,
    /// absent keys, scanned ranges, and explicit read-conflict ranges) and writes happened at its
    /// commit version: commit MUST fail with `Conflict` if any of those reads was overwritten
    /// between the read version and the commit version. Snapshot isolation alone is not compliant.
    fn begin(&self, options: TxnOptions) -> impl Future<Output = Result<Self::Txn>> + Send;

    fn limits(&self) -> Limits;
}

pub trait Txn: Send + Sync + 'static {
    fn read_version(&self) -> u64;

    /// Point read at the transaction's read version, including this transaction's own writes.
    fn get(&self, key: &[u8]) -> impl Future<Output = Result<Option<Value>>> + Send;

    /// Parallel point reads.
    fn get_many(&self, keys: &[Key]) -> impl Future<Output = Result<Vec<Option<Value>>>> + Send {
        let futures: Vec<_> = keys.iter().map(|key| self.get(key)).collect();
        async move { futures::future::try_join_all(futures).await }
    }

    /// Ordered scan of at most `limit` pairs; the scanned range is conflict-tracked up to the
    /// last returned key (or the whole range when fewer than `limit` pairs exist).
    fn scan(&self, range: &KeyRange, limit: usize)
    -> impl Future<Output = Result<Vec<(Key, Value)>>> + Send;

    fn add_read_conflict_range(&mut self, range: &KeyRange);
    fn set(&mut self, key: &[u8], value: &[u8]);
    fn clear(&mut self, key: &[u8]);
    fn clear_range(&mut self, range: &KeyRange);

    /// Blind atomic update: the stored value becomes the maximum of itself (as a little-endian
    /// `u64`, absent = 0) and `value`. Adds no read conflict, so concurrent maxima never conflict.
    fn max_u64(&mut self, key: &[u8], value: u64);

    /// Returns the commit version. `Uncertain` means the outcome is unknown.
    fn commit(self) -> impl Future<Output = Result<u64>> + Send;
}
