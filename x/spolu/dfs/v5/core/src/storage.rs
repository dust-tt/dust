use crate::profile::{Guard, Phase};
use bytes::Bytes;
use dfs_protocol::{error::status, rpc::ErrorCode};
use futures::future::BoxFuture;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    future::Future,
    ops::Bound,
    sync::Arc,
};
use tonic::Status;
pub mod memory;
pub type Rows = BTreeMap<Vec<u8>, Bytes>;
type Cell = Arc<tokio::sync::OnceCell<Option<Bytes>>>;

/// @cc [owner:spolu,label:backend;concurrency] transactional-kv-adapter
/// Every transaction MUST read one fixed version plus its own ordered mutations. Point reads MUST
/// honor explicit conflict ranges; range reads MUST track absence and phantoms. Successful commits
/// MUST publish all mutations atomically. Failed commits MUST distinguish definitely uncommitted
/// conflicts from unknown outcomes. Increment MUST add little-endian i64 values without lost updates.
/// Versionstamped writes MUST substitute the same commit-assigned 10 bytes in every stamped operand;
/// reads of their unresolved keys/values MUST fail until commit. ByteMax MUST merge lexicographically.
pub trait Transaction: Send + Sync {
    fn read_version(&self) -> i64;
    fn get<'a>(&'a self, key: &'a [u8]) -> BoxFuture<'a, Result<Option<Bytes>, Status>>;
    fn range<'a>(
        &'a self,
        start: &'a [u8],
        end: &'a [u8],
        limit: usize,
    ) -> BoxFuture<'a, Result<(Rows, bool), Status>>;
    fn conflict(&self, start: &[u8], end: &[u8]) -> Result<(), Status>;
    fn mutate(&self, mutation: &Mutation) -> Result<(), Status>;
    fn commit(self: Arc<Self>) -> BoxFuture<'static, Result<i64, CommitError>>;
}
#[derive(Debug)]
pub struct CommitError {
    pub code: i32,
    pub definitely_uncommitted: bool,
}
impl CommitError {
    pub fn code(&self) -> i32 {
        self.code
    }
    pub fn is_retryable_not_committed(&self) -> bool {
        self.definitely_uncommitted
    }
}
impl std::fmt::Display for CommitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "KV commit failed ({})", self.code)
    }
}
impl std::error::Error for CommitError {}
pub async fn commit(snapshot: Arc<Snapshot>) -> Result<i64, CommitError> {
    let snapshot = Arc::try_unwrap(snapshot).map_err(|_| CommitError {
        code: 2000,
        definitely_uncommitted: false,
    })?;
    snapshot.backend.commit().await
}
pub struct Snapshot {
    pub read_version: i64,
    increments: parking_lot::Mutex<std::collections::HashSet<Vec<u8>>>,
    backend: Arc<dyn Transaction>,
    cells: parking_lot::Mutex<HashMap<Vec<u8>, Cell>>,
}
impl Snapshot {
    pub fn new(backend: Arc<dyn Transaction>) -> Arc<Self> {
        Arc::new(Self {
            read_version: backend.read_version(),
            backend,
            increments: Default::default(),
            cells: Default::default(),
        })
    }
    pub async fn get(&self, key: impl AsRef<[u8]>) -> Result<Option<Bytes>, Status> {
        let key = key.as_ref();
        self.conflict(key, &after(key))?;
        self.peek(key).await
    }
    /// @cc [owner:spolu,label:concurrency;security] transaction-only-hints
    /// Prefetched values MUST stay within this FDB transaction. Semantic consumers MUST use get,
    /// which registers the read conflict even when prefetch supplied the value.
    pub async fn peek(&self, key: impl AsRef<[u8]>) -> Result<Option<Bytes>, Status> {
        let key = key.as_ref();
        let cell = self.cells.lock().entry(key.to_vec()).or_default().clone();
        cell.get_or_try_init(|| self.fetch(key)).await.cloned()
    }
    async fn fetch(&self, key: &[u8]) -> Result<Option<Bytes>, Status> {
        self.backend.get(key).await
    }
    pub(crate) async fn ancestry(
        &self,
        key: Vec<u8>,
    ) -> Result<Option<crate::model::Record>, Status> {
        self.get(key).await?.map(|value| decode(&value)).transpose()
    }
    pub async fn scan(
        self: &Arc<Self>,
        bounds: (Bound<Vec<u8>>, Bound<Vec<u8>>),
    ) -> Result<Scan, Status> {
        let start = match bounds.0 {
            Bound::Included(k) => k,
            Bound::Excluded(k) => after(&k),
            Bound::Unbounded => Vec::new(),
        };
        let end = match bounds.1 {
            Bound::Excluded(k) => k,
            Bound::Included(k) => after(&k),
            Bound::Unbounded => vec![255],
        };
        Ok(Scan {
            snapshot: self.clone(),
            start,
            end,
            rows: VecDeque::new(),
            more: true,
        })
    }
    pub async fn range(
        &self,
        start: &[u8],
        end: &[u8],
        limit: usize,
    ) -> Result<(Rows, bool), Status> {
        self.backend.range(start, end, limit).await
    }
    pub fn conflict(&self, start: &[u8], end: &[u8]) -> Result<(), Status> {
        self.backend.conflict(start, end)
    }
}
pub struct Row {
    pub key: Bytes,
    pub value: Bytes,
}
pub struct Scan {
    snapshot: Arc<Snapshot>,
    start: Vec<u8>,
    end: Vec<u8>,
    rows: VecDeque<Row>,
    more: bool,
}
impl Scan {
    pub async fn next(&mut self) -> Result<Option<Row>, Status> {
        if self.rows.is_empty() && self.more {
            let (rows, more) = self.snapshot.range(&self.start, &self.end, 64).await?;
            self.more = more;
            if let Some((last, _)) = rows.last_key_value() {
                self.start = after(last);
            }
            self.rows = rows
                .into_iter()
                .map(|(k, v)| Row {
                    key: k.into(),
                    value: v,
                })
                .collect();
        }
        Ok(self.rows.pop_front())
    }
}
#[derive(Default, Clone)]
pub struct WriteBatch(pub Vec<Mutation>);
#[derive(Clone)]
pub enum Mutation {
    Put(Vec<u8>, Bytes),
    Increment(Vec<u8>),
    Add(Vec<u8>, i64),
    ByteMax(Vec<u8>, Bytes),
    StampedKey(Vec<u8>, Bytes, usize),
    StampedValue(Vec<u8>, Bytes, usize),
    Delete(Vec<u8>),
    Clear(Vec<u8>, Vec<u8>),
}
impl Mutation {
    pub fn validate(&self, prefix_len: usize) -> Result<(), Status> {
        let (key, value_len, extra) = match self {
            Self::Put(k, v) | Self::ByteMax(k, v) => (k, v.len(), 0),
            Self::StampedKey(k, v, offset) => {
                check_stamp(k, *offset)?;
                (k, v.len(), 4)
            }
            Self::StampedValue(k, v, offset) => {
                check_stamp(v, *offset)?;
                (k, v.len() + 4, 0)
            }
            Self::Increment(k) | Self::Add(k, _) | Self::Delete(k) => (k, 8, 0),
            Self::Clear(start, end) => {
                if start >= end || end.len() + prefix_len > 10_000 {
                    return Err(status(ErrorCode::InvalidInput));
                }
                (start, 0, 0)
            }
        };
        if key.len() + prefix_len + extra > 10_000 || value_len > 100_000 {
            return Err(status(ErrorCode::Capacity));
        }
        Ok(())
    }
}
fn check_stamp(value: &[u8], offset: usize) -> Result<(), Status> {
    if offset.checked_add(10).is_none_or(|end| end > value.len())
        || value[offset..offset + 10] != [255; 10]
    {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(())
}
impl WriteBatch {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn put(&mut self, key: impl AsRef<[u8]>, value: impl AsRef<[u8]>) {
        self.0.push(Mutation::Put(
            key.as_ref().to_vec(),
            Bytes::copy_from_slice(value.as_ref()),
        ));
    }
    pub fn increment(&mut self, key: impl AsRef<[u8]>) {
        self.0.push(Mutation::Increment(key.as_ref().to_vec()));
    }
    pub fn add(&mut self, key: impl AsRef<[u8]>, value: i64) {
        self.0.push(Mutation::Add(key.as_ref().to_vec(), value));
    }
    pub fn byte_max(&mut self, key: impl AsRef<[u8]>, value: impl AsRef<[u8]>) {
        self.0.push(Mutation::ByteMax(
            key.as_ref().to_vec(),
            Bytes::copy_from_slice(value.as_ref()),
        ));
    }
    pub fn stamped_key(&mut self, key: Vec<u8>, value: impl AsRef<[u8]>, offset: usize) {
        self.0.push(Mutation::StampedKey(
            key,
            Bytes::copy_from_slice(value.as_ref()),
            offset,
        ));
    }
    pub fn stamped_value(&mut self, key: Vec<u8>, value: impl AsRef<[u8]>, offset: usize) {
        self.0.push(Mutation::StampedValue(
            key,
            Bytes::copy_from_slice(value.as_ref()),
            offset,
        ));
    }
    pub fn delete(&mut self, key: impl AsRef<[u8]>) {
        self.0.push(Mutation::Delete(key.as_ref().to_vec()));
    }
    pub fn clear(&mut self, start: Vec<u8>, end: Vec<u8>) {
        self.0.push(Mutation::Clear(start, end));
    }
    pub fn bytes(&self) -> usize {
        self.0
            .iter()
            .map(|m| match m {
                Mutation::Put(k, v)
                | Mutation::ByteMax(k, v)
                | Mutation::StampedKey(k, v, _)
                | Mutation::StampedValue(k, v, _) => k.len() + v.len() + 132,
                Mutation::Delete(k) | Mutation::Increment(k) | Mutation::Add(k, _) => k.len() + 128,
                Mutation::Clear(a, b) => a.len() + b.len() + 128,
            })
            .sum()
    }
    pub fn apply(&self, view: &Snapshot) -> Result<(), Status> {
        if self.bytes() > 8 * 1024 * 1024 {
            return Err(status(ErrorCode::Capacity));
        }
        for mutation in &self.0 {
            mutation.validate(0)?;
        }
        for mutation in &self.0 {
            if let Mutation::Increment(key) = mutation
                && !view.increments.lock().insert(key.clone())
            {
                continue;
            }
            view.backend.mutate(mutation)?;
        }
        // Retain unchanged transaction-local reads, but never reuse a value changed by this group.
        let mut cells = view.cells.lock();
        for mutation in &self.0 {
            match mutation {
                Mutation::Put(key, _)
                | Mutation::Delete(key)
                | Mutation::Increment(key)
                | Mutation::Add(key, _)
                | Mutation::ByteMax(key, _)
                | Mutation::StampedValue(key, _, _) => {
                    cells.remove(key);
                }
                Mutation::StampedKey(key, _, offset) => {
                    cells.retain(|k, _| !k.starts_with(&key[..*offset]));
                }
                Mutation::Clear(start, end) => cells.retain(|key, _| key < start || key >= end),
            }
        }
        Ok(())
    }
}
pub fn after(key: &[u8]) -> Vec<u8> {
    let mut next = key.to_vec();
    next.push(0);
    next
}
pub fn failed(error: impl std::fmt::Display) -> Status {
    tracing::debug!(error = %error, "storage operation failed");
    status(ErrorCode::Unavailable)
}
pub fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, Status> {
    postcard::to_stdvec(value).map_err(failed)
}
pub fn decode<T: DeserializeOwned>(value: &[u8]) -> Result<T, Status> {
    let (value, rest) = postcard::take_from_bytes(value).map_err(failed)?;
    if !rest.is_empty() {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(value)
}
pub async fn measured<T>(phase: &'static str, operation: impl Future<Output = T>) -> T {
    let phase = match phase {
        "object" => Phase::Attr,
        "authorize" => Phase::Authorize,
        "child" => Phase::Child,
        "collision" => Phase::Collision,
        "block_read" => Phase::Block,
        _ => return operation.await,
    };
    let _profile = Guard::new(phase);
    operation.await
}
