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
    collections::BTreeMap,
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tonic::Status;

type Rows = BTreeMap<Vec<u8>, Bytes>;

#[derive(Args, Clone, Debug)]
pub struct StorageConfig {
    #[arg(long, env = "DFS_FDB_CLUSTER_FILE")]
    pub fdb_cluster_file: String,
    #[arg(long, env = "DFS_FDB_PREFIX", default_value = "dfs-v3-local")]
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
        let mut prefix = vec![3];
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
                    Some(v) if v.as_ref() == b"dfs-v3-fdb-1" => (),
                    Some(_) => return Err(status(ErrorCode::Unavailable)),
                    None => {
                        if !view.range(&[], &[255], 1).await?.0.is_empty() {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        batch.put(b"\0format", b"dfs-v3-fdb-1");
                    }
                }
                Ok((batch, ()))
            })
            .await?;
        Ok(storage)
    }
    pub async fn snapshot(&self) -> Result<Arc<Snapshot>, Status> {
        self.at(None, Duration::from_secs(4)).await
    }
    pub(crate) async fn at(
        &self,
        version: Option<i64>,
        timeout: Duration,
    ) -> Result<Arc<Snapshot>, Status> {
        let started = Instant::now();
        let transaction = self.db.create_trx().map_err(failed)?;
        transaction
            .set_option(TransactionOption::Timeout(
                timeout.as_millis().clamp(1, 4000) as i32,
            ))
            .map_err(failed)?;
        transaction
            .set_option(TransactionOption::SizeLimit(9_000_000))
            .map_err(failed)?;
        let version = match version {
            Some(v) => {
                transaction.set_read_version(v);
                v
            }
            None => {
                let _profile = Guard::new(Phase::FdbVersion);
                transaction.get_read_version().await.map_err(failed)?
            }
        };
        Ok(Arc::new(Snapshot {
            transaction,
            prefix: self.prefix.clone(),
            version,
            started,
            expired: AtomicBool::new(false),
        }))
    }
    /// The closure has no side effects. Only definitely uncommitted attempts may be repeated.
    pub async fn transact<T, F, Fut>(&self, mut operation: F) -> Result<T, Status>
    where
        F: FnMut(Arc<Snapshot>) -> Fut,
        Fut: Future<Output = Result<(WriteBatch, T), Status>>,
    {
        for attempt in 0..8 {
            let snapshot = self.snapshot().await?;
            let (batch, result) = operation(snapshot.clone()).await?;
            batch.apply(&snapshot)?;
            match commit(snapshot).await {
                Ok(_) => return Ok(result),
                Err(e) if e.is_retryable_not_committed() && attempt < 7 => (),
                Err(e) => return Err(failed(e)),
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
    pub(crate) version: i64,
    pub(crate) started: Instant,
    expired: AtomicBool,
}
impl Snapshot {
    pub(crate) fn expired(&self) -> bool {
        self.expired.load(Ordering::Acquire)
    }
    /// @cc [owner:spolu,label:concurrency] expired-reads-refresh
    /// FDB rejecting a read snapshot as too old or timed out MUST invalidate the cached snapshot
    /// and request a fresh pre-acceptance view. This MUST NOT classify uncertain commits as safe
    /// to replay; commit failures use their separate outcome handling.
    fn failed(&self, error: FdbError) -> Status {
        if matches!(error.code(), 1007 | 1031) {
            self.expired.store(true, Ordering::Release);
            tracing::debug!(code = error.code(), "FDB read snapshot expired");
            Status::aborted("FDB read snapshot expired.")
        } else {
            failed(error)
        }
    }
    #[cfg(test)]
    pub(crate) fn expire_for_test(&self) -> Result<(), Status> {
        self.transaction
            .set_option(TransactionOption::Timeout(1))
            .map_err(failed)
    }

    fn key(&self, suffix: &[u8]) -> Vec<u8> {
        [self.prefix.as_ref(), suffix].concat()
    }
    pub async fn get(&self, key: impl AsRef<[u8]>) -> Result<Option<Bytes>, Status> {
        let _profile = Guard::new(Phase::FdbGet);
        self.transaction
            .get(&self.key(key.as_ref()), false)
            .await
            .map(|v| v.map(|v| Bytes::copy_from_slice(&v)))
            .map_err(|e| self.failed(e))
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
    pub(crate) fn value(&self, key: &[u8]) -> Option<Option<Bytes>> {
        self.0.iter().rev().find_map(|m| match m {
            Mutation::Put(k, v) if k == key => Some(Some(v.clone())),
            Mutation::Delete(k) if k == key => Some(None),
            Mutation::Clear(a, b) if a.as_slice() <= key && key < b.as_slice() => Some(None),
            _ => None,
        })
    }
    pub(crate) fn intersects(&self, start: &[u8], end: &[u8]) -> bool {
        self.0.iter().any(|m| match m {
            Mutation::Put(k, _) | Mutation::Delete(k) => {
                start <= k.as_slice() && k.as_slice() < end
            }
            Mutation::Clear(a, b) => a.as_slice() < end && start < b.as_slice(),
        })
    }
    pub(crate) fn overlay(&self, rows: &mut Rows, start: &[u8], end: &[u8]) {
        for m in &self.0 {
            match m {
                Mutation::Put(k, v) if start <= k.as_slice() && k.as_slice() < end => {
                    rows.insert(k.clone(), v.clone());
                }
                Mutation::Delete(k) => {
                    rows.remove(k);
                }
                Mutation::Clear(a, b) => {
                    rows.retain(|k, _| k < a || k >= b);
                }
                _ => (),
            }
        }
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
