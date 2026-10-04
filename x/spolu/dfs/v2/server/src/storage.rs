use anyhow::{Result, ensure};
use bytes::Bytes;
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use foundationdb::{Database, FdbError, RangeOption, Transaction, options::TransactionOption};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::VecDeque,
    future::Future,
    ops::{Bound, Range, RangeBounds},
    sync::{
        Arc,
        atomic::{AtomicI32, Ordering},
    },
    time::Duration,
};
use tokio::sync::Mutex;
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
    versions: Arc<Mutex<Range<u64>>>,
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
            versions: Arc::new(Mutex::new(0..0)),
        };
        storage
            .transact(|view| async move {
                let mut batch = WriteBatch::new();
                match view.get(b"\0format").await? {
                    Some(value) if value.as_ref() == b"dfs-v2-fdb-2" => {}
                    Some(_) => return Err(status(ErrorCode::Unavailable)),
                    None => {
                        if view.scan(..).await?.next().await?.is_some() {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        batch.put(b"\0format", b"dfs-v2-fdb-2");
                    }
                }
                Ok((batch, ()))
            })
            .await?;
        Ok(storage)
    }

    /// @cc [owner:spolu,label:backend;concurrency] distinct-state-tokens
    /// Issued tokens MUST never repeat within this application subspace, including across server
    /// restarts and independent processes. Reserve ranges durably before using them; ambiguous
    /// reservations MUST issue no tokens. Tokens are equality identifiers, not commit ordering or
    /// workspace coherence versions. Unused tokens MAY be abandoned on crashes or failed attempts.
    pub(crate) async fn version(&self) -> Result<u64, Status> {
        let mut available = self.versions.lock().await;
        if let Some(version) = available.next() {
            return Ok(version);
        }
        let range = self
            .transact(|snapshot| async move {
                let start = match snapshot.get(b"\0versions").await? {
                    Some(bytes) => decode::<u64>(&bytes)?,
                    None => 2,
                };
                let end = start
                    .checked_add(1_048_576)
                    .ok_or_else(|| status(ErrorCode::Capacity))?;
                let mut batch = WriteBatch::new();
                batch.put(b"\0versions", encode(&end)?);
                Ok((batch, start..end))
            })
            .await?;
        *available = range;
        available.next().ok_or_else(|| status(ErrorCode::Internal))
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
            started: std::time::Instant::now(),
            storage: self.clone(),
        }))
    }

    /// @cc [owner:spolu,label:concurrency;error-handling] fdb-transaction-replay
    /// The closure MUST read all preconditions through the supplied view and MUST NOT have external
    /// side effects except reserving never-reused version tokens. Advisory ancestry hints MAY be
    /// learned because each use is revalidated in its own transaction. Only known-uncommitted
    /// attempts may repeat. Captured client versions MUST
    /// remain unchanged. A definitive application rejection MUST NOT be retried because an unused
    /// speculative read failed. Read views MUST NOT escape the closure's result.
    /** @cc [owner:spolu,label:concurrency;security] fresh-transaction-versions
    Every attempt MUST obtain its read version normally from FDB. Commit versions MUST NOT be
    reused as read versions. Preconditions MUST retain conflict tracking; ambiguous commits MUST
    NOT repeat. Read-only results and application errors MUST use the same fresh transaction.
    */
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
            let version = if tracing::enabled!(target: "dfs_server_v2::profile", tracing::Level::DEBUG)
            {
                measured("read_version", snapshot.transaction.get_read_version())
                    .await
                    .map_err(|e| snapshot.failed(e))
            } else {
                Ok(0)
            };
            let prepared = async {
                version?;
                let (batch, result) = measured("prepare", operation(snapshot.clone())).await?;
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
                Ok(result)
            }
            .await;
            let (error, status) = match prepared {
                Ok(result) => {
                    let snapshot =
                        Arc::try_unwrap(snapshot).map_err(|_| status(ErrorCode::Internal))?;
                    let started = std::time::Instant::now();
                    match measured("commit", snapshot.transaction.commit()).await {
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
                Err(error) if error.code() != tonic::Code::Unavailable => return Err(error),
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

/// Opt-in timings contain only fixed phase names, never workspace IDs, credentials, or values.
pub(crate) async fn measured<T>(phase: &'static str, operation: impl Future<Output = T>) -> T {
    let started = tracing::enabled!(target: "dfs_server_v2::profile", tracing::Level::DEBUG)
        .then(std::time::Instant::now);
    let result = operation.await;
    if let Some(started) = started {
        tracing::debug!(target: "dfs_server_v2::profile", phase,
            elapsed_us = started.elapsed().as_micros() as u64, "filesystem phase");
    }
    result
}

pub struct Snapshot {
    transaction: Transaction,
    prefix: Arc<[u8]>,
    error: AtomicI32,
    started: std::time::Instant,
    storage: Storage,
}
impl Snapshot {
    pub(crate) async fn version(&self) -> Result<u64, Status> {
        self.storage.version().await
    }
    pub(crate) fn expiring(&self) -> bool {
        self.started.elapsed() >= Duration::from_millis(3500)
            || matches!(self.error.load(Ordering::Relaxed), 1007 | 1031)
    }

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

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use anyhow::Context;
    use dfs_protocol::error::code;
    use std::sync::atomic::AtomicUsize;

    pub async fn version_tokens_survive_independent_writers_and_reopen() -> anyhow::Result<()> {
        let config = StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-versions-{}", uuid::Uuid::new_v4().simple()),
        };
        let first = Storage::open(&config).await?;
        let second = Storage::open(&config).await?;
        let collect = |storage: Storage| async move {
            let mut tokens = Vec::new();
            for _ in 0..128 {
                tokens.push(storage.version().await?);
            }
            Ok::<_, Status>(tokens)
        };
        let (a, b, clone) = tokio::try_join!(
            collect(first.clone()),
            collect(second.clone()),
            collect(first.clone()),
        )?;
        drop(second);
        let reopened = Storage::open(&config).await?;
        let reopened_token = reopened.version().await?;
        let still_running_token = first.version().await?;
        let tokens: std::collections::BTreeSet<_> = a
            .into_iter()
            .chain(b)
            .chain(clone)
            .chain([reopened_token, still_running_token])
            .collect();
        assert_eq!(tokens.len(), 386);
        assert!(tokens.first().is_some_and(|v| *v >= 2));
        // A live older allocator can issue a smaller token than a restarted writer.
        assert!(still_running_token < reopened_token);
        first
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }

    pub async fn speculative_failure_preserves_application_errors() -> anyhow::Result<()> {
        let store = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-tests-{}", uuid::Uuid::new_v4().simple()),
        })
        .await?;
        let expired = FdbError::from_code(1007);
        assert!(expired.is_retryable_not_committed());
        for result in [ErrorCode::NotFound, ErrorCode::Unavailable] {
            let attempts = AtomicUsize::new(0);
            let response = store
                .transact(|view| {
                    let first = attempts.fetch_add(1, Ordering::Relaxed) == 0;
                    async move {
                        if first {
                            // Inject a retryable failure after the logical result is known.
                            let _ = view.failed(expired);
                            return Err(status(result));
                        }
                        Ok((WriteBatch::new(), ()))
                    }
                })
                .await;
            if result == ErrorCode::NotFound {
                assert_eq!(
                    code(
                        &response
                            .err()
                            .context("application rejection was retried")?
                    ),
                    ErrorCode::NotFound
                );
                assert_eq!(attempts.load(Ordering::Relaxed), 1);
            } else {
                response?;
                assert_eq!(attempts.load(Ordering::Relaxed), 2);
            }
        }
        store
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }

    pub async fn fresh_attempts_observe_other_writers() -> anyhow::Result<()> {
        let config = StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-tests-{}", uuid::Uuid::new_v4().simple()),
        };
        let local = Storage::open(&config).await?;
        let other = Storage::open(&config).await?;
        for case in 0..3 {
            local
                .transact(|_| async {
                    let mut batch = WriteBatch::new();
                    batch.put(b"authority", b"old");
                    batch.delete(b"result");
                    Ok((batch, ()))
                })
                .await?;
            other
                .transact(|_| async {
                    let mut batch = WriteBatch::new();
                    batch.put(b"authority", b"new");
                    Ok((batch, ()))
                })
                .await?;
            let attempts = AtomicUsize::new(0);
            let response = local
                .transact(|view| {
                    attempts.fetch_add(1, Ordering::Relaxed);
                    async move {
                        let value = view.get(b"authority").await?;
                        assert_eq!(value.as_deref(), Some(&b"new"[..]));
                        let mut batch = WriteBatch::new();
                        if case == 2 {
                            return Err(status(ErrorCode::Forbidden));
                        }
                        if case == 0 {
                            batch.put(b"result", b"new");
                        }
                        Ok((batch, value))
                    }
                })
                .await;
            assert_eq!(attempts.load(Ordering::Relaxed), 1);
            if case == 2 {
                assert_eq!(
                    code(&response.err().context("revoked authority accepted")?),
                    ErrorCode::Forbidden
                );
            } else {
                assert_eq!(response?.as_deref(), Some(&b"new"[..]));
            }
            assert_eq!(
                local.get(b"result").await?.as_deref(),
                (case == 0).then_some(&b"new"[..])
            );
        }
        local
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }
}
