use crate::profile::{Guard, Phase};
use anyhow::{Result, ensure};
use bytes::Bytes;
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use foundationdb::{
    Database, FdbError, RangeOption, Transaction,
    options::{ConflictRangeType, TransactionOption},
};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    future::Future,
    ops::Bound,
    sync::Arc,
};
use tonic::Status;

type Rows = BTreeMap<Vec<u8>, Bytes>;
type Cell = Arc<tokio::sync::OnceCell<Option<Bytes>>>;

#[derive(Args, Clone, Debug)]
pub struct StorageConfig {
    #[arg(long, env = "DFS_FDB_CLUSTER_FILE")]
    pub fdb_cluster_file: String,
    #[arg(long, env = "DFS_FDB_PREFIX", default_value = "dfs-v4-local")]
    pub fdb_prefix: String,
}

#[derive(Clone)]
pub struct Storage {
    db: Arc<Database>,
    prefix: Arc<[u8]>,
}
impl Storage {
    /// @cc [owner:spolu,label:backend;security] scoped-fdb-format
    /// Opening MUST NOT erase data or access another configured subspace. Foreign formats MUST fail.
    pub async fn open(config: &StorageConfig) -> Result<Self> {
        ensure!(
            !config.fdb_prefix.is_empty() && config.fdb_prefix.len() <= 256,
            "invalid FDB prefix"
        );
        let mut prefix = vec![4];
        prefix.extend_from_slice(&(config.fdb_prefix.len() as u16).to_be_bytes());
        prefix.extend_from_slice(config.fdb_prefix.as_bytes());
        let storage = Self {
            db: Arc::new(Database::from_path(&config.fdb_cluster_file)?),
            prefix: prefix.into(),
        };
        storage
            .transact(|view| async move {
                let mut batch = WriteBatch::new();
                match view.get(b"\0format").await? {
                    Some(v) if v.as_ref() == b"dfs-v4-fdb-1" => (),
                    Some(_) => return Err(status(ErrorCode::Unavailable)),
                    None => {
                        if !view.range(&[], &[255], 1).await?.0.is_empty() {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        batch.put(b"\0format", b"dfs-v4-fdb-1");
                    }
                }
                Ok((batch, ()))
            })
            .await?;
        Ok(storage)
    }
    pub async fn snapshot(&self) -> Result<Arc<Snapshot>, Status> {
        let transaction = self.db.create_trx().map_err(failed)?;
        transaction
            .set_option(TransactionOption::Timeout(4000))
            .map_err(failed)?;
        transaction
            .set_option(TransactionOption::SizeLimit(9_000_000))
            .map_err(failed)?;
        {
            let _profile = Guard::new(Phase::FdbVersion);
            transaction.get_read_version().await.map_err(failed)?;
        }
        Ok(Arc::new(Snapshot {
            transaction,
            prefix: self.prefix.clone(),
            cells: Default::default(),
        }))
    }
    /// The closure has no side effects. Only definitely uncommitted attempts may be repeated.
    pub async fn transact<T, F, Fut>(&self, mut operation: F) -> Result<T, Status>
    where
        F: FnMut(Arc<Snapshot>) -> Fut,
        Fut: Future<Output = Result<(WriteBatch, T), Status>>,
    {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        for attempt in 0..1024 {
            let transaction_time = Guard::new(Phase::FdbTransaction);
            let snapshot = self.snapshot().await?;
            let (batch, result) = operation(snapshot.clone()).await?;
            batch.apply(&snapshot)?;
            let outcome = commit(snapshot).await;
            drop(transaction_time);
            match outcome {
                Ok(_) => return Ok(result),
                Err(e)
                    if e.is_retryable_not_committed()
                        && attempt < 1023
                        && std::time::Instant::now() < deadline =>
                {
                    // Concurrent creates share a parent. Jitter avoids retrying their conflicts in lockstep.
                    let jitter = 1 + (uuid::Uuid::new_v4().as_u128() % 8) as u64;
                    let _backoff = Guard::new(Phase::FdbRetry);
                    tokio::time::sleep(std::time::Duration::from_millis(jitter)).await;
                }
                Err(e) => {
                    tracing::warn!(fdb_code = e.code(), attempt, "FDB commit failed");
                    return Err(failed(e));
                }
            }
        }
        Err(status(ErrorCode::Unavailable))
    }
    pub async fn get(&self, key: impl AsRef<[u8]>) -> Result<Option<Bytes>, Status> {
        self.snapshot().await?.get(key).await
    }
}

pub struct Snapshot {
    transaction: Transaction,
    prefix: Arc<[u8]>,
    cells: parking_lot::Mutex<HashMap<Vec<u8>, Cell>>,
}
impl Snapshot {
    fn failed(&self, error: FdbError) -> Status {
        failed(error)
    }

    fn key(&self, suffix: &[u8]) -> Vec<u8> {
        [self.prefix.as_ref(), suffix].concat()
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
    pub fn hot(&self, key: &[u8]) -> bool {
        self.cells
            .lock()
            .get(key)
            .is_some_and(|v| v.get().is_some())
    }
    async fn fetch(&self, key: &[u8]) -> Result<Option<Bytes>, Status> {
        let _profile = Guard::new(Phase::FdbGet);
        self.transaction
            .get(&self.key(key), true)
            .await
            .map(|v| v.map(|v| Bytes::copy_from_slice(&v)))
            .map_err(|e| self.failed(e))
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
    pub(crate) async fn range(
        &self,
        start: &[u8],
        end: &[u8],
        limit: usize,
    ) -> Result<(Rows, bool), Status> {
        let _profile = Guard::new(Phase::FdbRange);
        let (start, end) = (self.key(start), self.key(end));
        let mut options = RangeOption::from((start.as_slice(), end.as_slice()));
        options.limit = Some(limit);
        let rows = self
            .transaction
            .get_range(&options, 1, false)
            .await
            .map_err(|e| self.failed(e))?;
        let more = rows.more();
        Ok((
            rows.iter()
                .map(|r| {
                    (
                        r.key()[self.prefix.len()..].to_vec(),
                        Bytes::copy_from_slice(r.value()),
                    )
                })
                .collect(),
            more,
        ))
    }
    pub(crate) fn conflict(&self, start: &[u8], end: &[u8]) -> Result<(), Status> {
        self.transaction
            .add_conflict_range(&self.key(start), &self.key(end), ConflictRangeType::Read)
            .map_err(failed)
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
/// All read dependencies MUST be registered before applying mutations to this transaction.
pub(crate) async fn commit(snapshot: Arc<Snapshot>) -> Result<i64, FdbError> {
    let snapshot = Arc::try_unwrap(snapshot).map_err(|_| FdbError::from_code(2000))?;
    let _profile = Guard::new(Phase::FdbCommit);
    let committed = snapshot.transaction.commit().await.map_err(|e| *e)?;
    committed.committed_version()
}

#[derive(Default, Clone)]
pub struct WriteBatch(pub(crate) Vec<Mutation>);
#[derive(Clone)]
pub(crate) enum Mutation {
    Put(Vec<u8>, Bytes),
    Delete(Vec<u8>),
    Clear(Vec<u8>, Vec<u8>),
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
    pub fn delete(&mut self, key: impl AsRef<[u8]>) {
        self.0.push(Mutation::Delete(key.as_ref().to_vec()));
    }
    pub fn clear(&mut self, start: Vec<u8>, end: Vec<u8>) {
        self.0.push(Mutation::Clear(start, end));
    }
    pub(crate) fn bytes(&self) -> usize {
        self.0
            .iter()
            .map(|m| match m {
                Mutation::Put(k, v) => k.len() + v.len() + 128,
                Mutation::Delete(k) => k.len() + 128,
                Mutation::Clear(a, b) => a.len() + b.len() + 128,
            })
            .sum()
    }
    pub(crate) fn apply(&self, view: &Snapshot) -> Result<(), Status> {
        if self.bytes() > 8 * 1024 * 1024 {
            return Err(status(ErrorCode::Capacity));
        }
        for mutation in &self.0 {
            match mutation {
                Mutation::Put(key, value) => {
                    let key = view.key(key);
                    if key.len() > 10_000 || value.len() > 100_000 {
                        return Err(status(ErrorCode::Capacity));
                    }
                    view.transaction.set(&key, value);
                }
                Mutation::Delete(key) => view.transaction.clear(&view.key(key)),
                Mutation::Clear(a, b) => view.transaction.clear_range(&view.key(a), &view.key(b)),
            }
        }
        // Retain unchanged transaction-local reads, but never reuse a value changed by this group.
        let mut cells = view.cells.lock();
        for mutation in &self.0 {
            match mutation {
                Mutation::Put(key, _) | Mutation::Delete(key) => {
                    cells.remove(key);
                }
                Mutation::Clear(start, end) => cells.retain(|key, _| key < start || key >= end),
            }
        }
        Ok(())
    }
}
pub(crate) fn after(key: &[u8]) -> Vec<u8> {
    let mut next = key.to_vec();
    next.push(0);
    next
}
pub(crate) fn failed(error: impl std::fmt::Display) -> Status {
    tracing::debug!(error = %error, "storage operation failed");
    status(ErrorCode::Unavailable)
}
pub(crate) fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, Status> {
    postcard::to_stdvec(value).map_err(failed)
}
pub(crate) fn decode<T: DeserializeOwned>(value: &[u8]) -> Result<T, Status> {
    let (value, rest) = postcard::take_from_bytes(value).map_err(failed)?;
    if !rest.is_empty() {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(value)
}
pub(crate) async fn measured<T>(phase: &'static str, operation: impl Future<Output = T>) -> T {
    let phase = match phase {
        "object" => Phase::Object,
        "authorize" => Phase::Authorize,
        "child" => Phase::Child,
        "collision" => Phase::Collision,
        "block_read" => Phase::Block,
        _ => return operation.await,
    };
    let _profile = Guard::new(phase);
    operation.await
}
