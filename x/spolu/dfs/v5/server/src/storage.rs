use crate::profile::{Guard, Phase};
use anyhow::{Result, ensure};
use bytes::Bytes;
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use foundationdb::{
    Database, FdbError, RangeOption, Transaction,
    options::{ConflictRangeType, TransactionOption},
};
use std::{future::Future, sync::Arc};
use tonic::Status;

use dfs_core::storage::{self as kv, CommitError, Mutation, Rows};
pub use dfs_core::storage::{Snapshot, WriteBatch, commit, decode, encode, failed};
use futures::future::BoxFuture;

#[derive(Args, Clone, Debug)]
pub struct StorageConfig {
    #[arg(long, env = "DFS_FDB_CLUSTER_FILE")]
    pub fdb_cluster_file: String,
    #[arg(long, env = "DFS_FDB_PREFIX", default_value = "dfs-v5-local")]
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
        let mut prefix = vec![5];
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
                    Some(v) if v.as_ref() == b"dfs-v5-fdb-6" => (),
                    Some(_) => return Err(status(ErrorCode::Unavailable)),
                    None => {
                        if !view.range(&[], &[255], 1).await?.0.is_empty() {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        batch.put(b"\0format", b"dfs-v5-fdb-6");
                    }
                }
                Ok((batch, ()))
            })
            .await?;
        Ok(storage)
    }
    pub async fn snapshot(&self) -> Result<Arc<Snapshot>, Status> {
        self.snapshot_at(None).await
    }
    pub async fn snapshot_at(&self, version: Option<i64>) -> Result<Arc<Snapshot>, Status> {
        let transaction = self.db.create_trx().map_err(failed)?;
        transaction
            .set_option(TransactionOption::Timeout(4000))
            .map_err(failed)?;
        transaction
            .set_option(TransactionOption::SizeLimit(9_000_000))
            .map_err(failed)?;
        let read_version = if let Some(version) = version {
            if version < 0 {
                return Err(status(ErrorCode::InvalidInput));
            }
            transaction.set_read_version(version);
            version
        } else {
            let _profile = Guard::new(Phase::FdbVersion);
            transaction.get_read_version().await.map_err(failed)?
        };
        Ok(Snapshot::new(Arc::new(FdbTransaction {
            transaction,
            read_version,
            prefix: self.prefix.clone(),
        })))
    }
    /// The closure has no side effects. Only definitely uncommitted attempts may be repeated.
    pub async fn transact<T, F, Fut>(&self, operation: F) -> Result<T, Status>
    where
        F: FnMut(Arc<Snapshot>) -> Fut,
        Fut: Future<Output = Result<(WriteBatch, T), Status>>,
    {
        self.transact_versioned(operation)
            .await
            .map(|(result, _)| result)
    }
    pub async fn transact_versioned<T, F, Fut>(&self, mut operation: F) -> Result<(T, i64), Status>
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
                Ok(version) => return Ok((result, version)),
                Err(e)
                    if e.is_retryable_not_committed()
                        && attempt < 1023
                        && std::time::Instant::now() < deadline =>
                {
                    // Jitter avoids retrying genuinely conflicting writers in lockstep.
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

struct FdbTransaction {
    transaction: Transaction,
    prefix: Arc<[u8]>,
    read_version: i64,
}
impl FdbTransaction {
    fn key(&self, suffix: &[u8]) -> Vec<u8> {
        [self.prefix.as_ref(), suffix].concat()
    }
}
impl kv::Transaction for FdbTransaction {
    fn read_version(&self) -> i64 {
        self.read_version
    }
    fn get<'a>(&'a self, key: &'a [u8]) -> BoxFuture<'a, Result<Option<Bytes>, Status>> {
        Box::pin(async move {
            let _profile = Guard::new(Phase::FdbGet);
            self.transaction
                .get(&self.key(key), true)
                .await
                .map(|v| v.map(|v| Bytes::copy_from_slice(&v)))
                .map_err(failed)
        })
    }
    fn range<'a>(
        &'a self,
        start: &'a [u8],
        end: &'a [u8],
        limit: usize,
    ) -> BoxFuture<'a, Result<(Rows, bool), Status>> {
        Box::pin(async move {
            let _profile = Guard::new(Phase::FdbRange);
            let (start, end) = (self.key(start), self.key(end));
            let mut options = RangeOption::from((start.as_slice(), end.as_slice()));
            options.limit = Some(limit);
            let rows = self
                .transaction
                .get_range(&options, 1, false)
                .await
                .map_err(failed)?;
            Ok((
                rows.iter()
                    .map(|r| {
                        (
                            r.key()[self.prefix.len()..].to_vec(),
                            Bytes::copy_from_slice(r.value()),
                        )
                    })
                    .collect(),
                rows.more(),
            ))
        })
    }
    fn conflict(&self, start: &[u8], end: &[u8]) -> Result<(), Status> {
        self.transaction
            .add_conflict_range(&self.key(start), &self.key(end), ConflictRangeType::Read)
            .map_err(failed)
    }
    fn mutate(&self, mutation: &Mutation) -> Result<(), Status> {
        mutation.validate(self.prefix.len())?;
        match mutation {
            Mutation::Put(key, value) => {
                let key = self.key(key);
                if key.len() > 10_000 || value.len() > 100_000 {
                    return Err(status(ErrorCode::Capacity));
                }
                self.transaction.set(&key, value);
            }
            Mutation::Delete(key) => self.transaction.clear(&self.key(key)),
            Mutation::Clear(start, end) => self
                .transaction
                .clear_range(&self.key(start), &self.key(end)),
            Mutation::Increment(key) => self.transaction.atomic_op(
                &self.key(key),
                &1i64.to_le_bytes(),
                foundationdb::options::MutationType::Add,
            ),
            Mutation::Add(key, value) => self.transaction.atomic_op(
                &self.key(key),
                &value.to_le_bytes(),
                foundationdb::options::MutationType::Add,
            ),
            Mutation::ByteMax(key, value) => self.transaction.atomic_op(
                &self.key(key),
                value,
                foundationdb::options::MutationType::ByteMax,
            ),
            Mutation::StampedKey(key, value, offset) => {
                let mut key = self.key(key);
                let offset = u32::try_from(self.prefix.len() + offset).map_err(failed)?;
                key.extend_from_slice(&offset.to_le_bytes());
                self.transaction.atomic_op(
                    &key,
                    value,
                    foundationdb::options::MutationType::SetVersionstampedKey,
                );
            }
            Mutation::StampedValue(key, value, offset) => {
                let mut value = value.to_vec();
                value.extend_from_slice(&u32::try_from(*offset).map_err(failed)?.to_le_bytes());
                self.transaction.atomic_op(
                    &self.key(key),
                    &value,
                    foundationdb::options::MutationType::SetVersionstampedValue,
                );
            }
        }
        Ok(())
    }
    fn commit(self: Arc<Self>) -> BoxFuture<'static, Result<i64, CommitError>> {
        Box::pin(async move {
            let adapter = Arc::try_unwrap(self).map_err(|_| CommitError {
                code: 2000,
                definitely_uncommitted: false,
            })?;
            let _profile = Guard::new(Phase::FdbCommit);
            let committed = adapter
                .transaction
                .commit()
                .await
                .map_err(|error| commit_error(*error))?;
            committed.committed_version().map_err(commit_error)
        })
    }
}
fn commit_error(error: FdbError) -> CommitError {
    CommitError {
        code: error.code(),
        definitely_uncommitted: error.is_retryable_not_committed(),
    }
}
