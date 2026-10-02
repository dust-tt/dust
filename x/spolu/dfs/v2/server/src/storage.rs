use anyhow::{Result, ensure};
use bytes::Bytes;
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use foundationdb::{Database, FdbError, RangeOption, Transaction, options::TransactionOption};
use std::{
    collections::VecDeque,
    future::Future,
    ops::{Bound, RangeBounds},
    sync::{
        Arc,
        atomic::{AtomicI32, Ordering},
    },
    time::Duration,
};
use tonic::Status;

#[derive(Args, Clone, Debug)]
pub struct StorageConfig {
    #[arg(long, env = "DFS_FDB_CLUSTER_FILE")]
    pub fdb_cluster_file: String,
    #[arg(long, env = "DFS_FDB_PREFIX", default_value = "dfs-v2-local")]
    pub fdb_prefix: String,
}

#[derive(Clone)]
pub struct Storage {
    db: Arc<Database>,
    prefix: Arc<[u8]>,
}

impl Storage {
    /// @cc [owner:spolu,label:backend;security] scoped-fdb-format
    /// Open MUST access only the configured application subspace. Foreign formats and nonempty
    /// unmarked subspaces MUST fail startup. Opening MUST NOT erase authoritative data.
    pub async fn open(config: &StorageConfig) -> Result<Self> {
        ensure!(
            !config.fdb_prefix.is_empty() && config.fdb_prefix.len() <= 256,
            "FDB prefix must contain 1..256 bytes"
        );
        let mut prefix = vec![2];
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
                    Some(value) if value.as_ref() == b"dfs-v2-fdb-1" => {}
                    Some(_) => return Err(status(ErrorCode::Unavailable)),
                    None => {
                        if view.scan(..).await?.next().await?.is_some() {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        batch.put(b"\0format", b"dfs-v2-fdb-1");
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
        Ok(Arc::new(Snapshot {
            transaction,
            prefix: self.prefix.clone(),
            error: AtomicI32::new(0),
        }))
    }

    /// @cc [owner:spolu,label:concurrency;error-handling] fdb-transaction-replay
    /// The closure MUST perform all precondition reads through the supplied view and MUST NOT have
    /// external side effects. Only known-uncommitted attempts may repeat. Captured client versions
    /// MUST remain unchanged. Read views MUST NOT escape the closure's result.
    pub async fn transact<T, F, Fut>(&self, mut operation: F) -> Result<T, Status>
    where
        F: FnMut(Arc<Snapshot>) -> Fut,
        Fut: Future<Output = Result<(WriteBatch, T), Status>>,
    {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        for attempt in 0..8 {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return Err(status(ErrorCode::Unavailable));
            }
            let snapshot = self.snapshot().await?;
            snapshot
                .transaction
                .set_option(TransactionOption::Timeout(
                    remaining.as_millis().clamp(1, 4000) as i32,
                ))
                .map_err(failed)?;
            let prepared = operation(snapshot.clone()).await;
            let (error, status) = match prepared {
                Ok((batch, result)) => {
                    batch.apply(&snapshot)?;
                    if snapshot
                        .transaction
                        .get_approximate_size()
                        .await
                        .map_err(|e| snapshot.failed(e))?
                        > 9_000_000
                    {
                        return Err(status(ErrorCode::Capacity));
                    }
                    let snapshot =
                        Arc::try_unwrap(snapshot).map_err(|_| status(ErrorCode::Internal))?;
                    let started = std::time::Instant::now();
                    match snapshot.transaction.commit().await {
                        Ok(_) => {
                            tracing::debug!(
                                commit_us = started.elapsed().as_micros() as u64,
                                retries = attempt,
                                "FDB transaction committed"
                            );
                            return Ok(result);
                        }
                        Err(error) => (*error, failed(*error)),
                    }
                }
                Err(status) => (
                    FdbError::from_code(snapshot.error.load(Ordering::Relaxed)),
                    status,
                ),
            };
            if !error.is_retryable_not_committed()
                || attempt == 7
                || tokio::time::Instant::now() >= deadline
            {
                return Err(status);
            }
            tracing::debug!(
                code = error.code(),
                attempt,
                "retrying aborted FDB transaction"
            );
            tokio::time::sleep(Duration::from_millis(1 << attempt)).await;
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
    error: AtomicI32,
}
impl Snapshot {
    fn key(&self, suffix: &[u8]) -> Vec<u8> {
        let mut key = self.prefix.to_vec();
        key.extend_from_slice(suffix);
        key
    }
    fn failed(&self, error: FdbError) -> Status {
        self.error.store(error.code(), Ordering::Relaxed);
        failed(error)
    }
    pub async fn get(&self, key: impl AsRef<[u8]>) -> Result<Option<Bytes>, Status> {
        self.transaction
            .get(&self.key(key.as_ref()), false)
            .await
            .map(|v| v.map(|v| Bytes::copy_from_slice(&v)))
            .map_err(|e| self.failed(e))
    }
    pub async fn scan(self: &Arc<Self>, range: impl RangeBounds<Vec<u8>>) -> Result<Scan, Status> {
        let (start, exclusive) = match range.start_bound() {
            Bound::Included(key) => (self.key(key), false),
            Bound::Excluded(key) => (self.key(key), true),
            Bound::Unbounded => (self.prefix.to_vec(), false),
        };
        let end = match range.end_bound() {
            Bound::Excluded(key) => self.key(key),
            Bound::Included(key) => {
                let mut key = self.key(key);
                key.push(0);
                key
            }
            Bound::Unbounded => prefix_end(&self.prefix),
        };
        Ok(Scan {
            snapshot: self.clone(),
            start,
            exclusive,
            end,
            rows: VecDeque::new(),
            done: false,
        })
    }
}

pub struct Row {
    pub key: Bytes,
    pub value: Bytes,
}

pub struct Scan {
    snapshot: Arc<Snapshot>,
    start: Vec<u8>,
    exclusive: bool,
    end: Vec<u8>,
    rows: VecDeque<Row>,
    done: bool,
}
impl Scan {
    pub async fn next(&mut self) -> Result<Option<Row>, Status> {
        if let Some(row) = self.rows.pop_front() {
            return Ok(Some(row));
        }
        if self.done {
            return Ok(None);
        }
        let mut options = RangeOption::from((self.start.as_slice(), self.end.as_slice()));
        if self.exclusive {
            options.begin = foundationdb::KeySelector::first_greater_than(self.start.as_slice());
        }
        options.limit = Some(64);
        options.target_bytes = 4096;
        let rows = self
            .snapshot
            .transaction
            .get_range(&options, 1, false)
            .await
            .map_err(|e| self.snapshot.failed(e))?;
        self.done = !rows.more() || rows.is_empty();
        for row in &rows {
            self.rows.push_back(Row {
                key: Bytes::copy_from_slice(&row.key()[self.snapshot.prefix.len()..]),
                value: Bytes::copy_from_slice(row.value()),
            });
        }
        if let Some(last) = rows.last() {
            self.start = last.key().to_vec();
            self.exclusive = true;
        }
        Ok(self.rows.pop_front())
    }
}

#[derive(Default)]
pub struct WriteBatch(Vec<Mutation>);
enum Mutation {
    Put(Vec<u8>, Vec<u8>),
    Delete(Vec<u8>),
    Clear(Vec<u8>, Vec<u8>),
}
impl WriteBatch {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    pub fn put(&mut self, key: impl AsRef<[u8]>, value: impl AsRef<[u8]>) {
        self.0.push(Mutation::Put(
            key.as_ref().to_vec(),
            value.as_ref().to_vec(),
        ));
    }
    pub fn delete(&mut self, key: impl AsRef<[u8]>) {
        self.0.push(Mutation::Delete(key.as_ref().to_vec()));
    }
    pub fn clear(&mut self, start: Vec<u8>, end: Vec<u8>) {
        self.0.push(Mutation::Clear(start, end));
    }
    fn apply(self, view: &Snapshot) -> Result<(), Status> {
        for mutation in self.0 {
            match mutation {
                Mutation::Put(key, value) => {
                    let key = view.key(&key);
                    if key.len() > 10_000 || value.len() > 100_000 {
                        return Err(status(ErrorCode::Capacity));
                    }
                    view.transaction.set(&key, &value);
                }
                Mutation::Delete(key) => view.transaction.clear(&view.key(&key)),
                Mutation::Clear(start, end) => view
                    .transaction
                    .clear_range(&view.key(&start), &view.key(&end)),
            }
        }
        Ok(())
    }
}

pub(crate) fn prefix_end(prefix: &[u8]) -> Vec<u8> {
    let mut end = prefix.to_vec();
    while let Some(last) = end.pop() {
        if last != u8::MAX {
            end.push(last + 1);
            break;
        }
    }
    end
}
pub(crate) fn failed(error: impl std::fmt::Display) -> Status {
    tracing::error!(error = %error, "storage operation failed");
    status(ErrorCode::Unavailable)
}
