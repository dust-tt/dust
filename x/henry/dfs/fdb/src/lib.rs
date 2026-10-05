//! FoundationDB adapter. The only crate allowed to link the FoundationDB SDK.

use std::future::Future;
use std::sync::Arc;

use dfs_store::{Key, KeyRange, Limits, Result, Store, StoreError, Txn, TxnOptions, Value};
use foundationdb::options::{ConflictRangeType, MutationType, NetworkOption, TransactionOption};
use foundationdb::{Database, FdbError, RangeOption, Transaction};

/// @cc [owner:fontanierh,label:rust;concurrency] fdb-network-lifetime
/// MUST run at most once per process; every FDB handle MUST be dropped before this returns,
/// which holds because `operation` runs to completion on a runtime dropped before the network.
#[allow(unsafe_code)]
pub fn run_with_network<T>(
    knobs: &[(&str, String)],
    operation: impl Future<Output = anyhow::Result<T>>,
) -> anyhow::Result<T> {
    let mut builder = foundationdb::api::FdbApiBuilder::default().build()?;
    for (knob, value) in knobs {
        builder = builder.set_option(NetworkOption::Knob(format!("{knob}={value}")))?;
    }
    // SAFETY: the network guard outlives the runtime and all of its tasks (dropped first below).
    let network = unsafe { builder.boot()? };
    let result = {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build()?;
        runtime.block_on(operation)
    };
    drop(network);
    result
}

#[derive(Clone)]
pub struct FdbStore {
    db: Arc<Database>,
    prefix: Arc<[u8]>,
}

impl FdbStore {
    /// All keys are stored under `prefix`, so test runs never touch each other's data.
    pub fn open(cluster_file: &str, prefix: &[u8]) -> anyhow::Result<Self> {
        Ok(Self { db: Arc::new(Database::from_path(cluster_file)?), prefix: prefix.into() })
    }

    /// Delete everything under this store's prefix.
    pub async fn wipe(&self) -> anyhow::Result<()> {
        let trx = self.db.create_trx()?;
        let range = KeyRange::prefix(&self.prefix);
        trx.clear_range(&range.start, &range.end);
        trx.commit().await.map_err(|e| anyhow::anyhow!("wipe: {}", FdbError::from(e)))?;
        Ok(())
    }
}

fn map(error: FdbError) -> StoreError {
    match error.code() {
        1020 => StoreError::Conflict,
        1007 => StoreError::TooOld,
        1021 => StoreError::Uncertain,
        2101 | 2103 => StoreError::Limit(error.to_string()),
        _ if error.is_maybe_committed() => StoreError::Uncertain,
        _ if error.is_retryable_not_committed() => StoreError::Conflict,
        _ => StoreError::Unavailable(error.to_string()),
    }
}

pub struct FdbTxn {
    trx: Transaction,
    prefix: Arc<[u8]>,
    read_version: u64,
}

impl FdbTxn {
    fn key(&self, key: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.prefix.len() + key.len());
        out.extend_from_slice(&self.prefix);
        out.extend_from_slice(key);
        out
    }
}

impl Store for FdbStore {
    type Txn = FdbTxn;

    async fn begin(&self, options: TxnOptions) -> Result<FdbTxn> {
        let trx = self.db.create_trx().map_err(map)?;
        trx.set_option(TransactionOption::Timeout(4000)).map_err(map)?;
        trx.set_option(TransactionOption::SizeLimit(9_000_000)).map_err(map)?;
        let read_version = match options.read_version {
            Some(version) => {
                trx.set_read_version(version as i64);
                version
            }
            None => trx.get_read_version().await.map_err(map)? as u64,
        };
        Ok(FdbTxn { trx, prefix: self.prefix.clone(), read_version })
    }

    fn limits(&self) -> Limits {
        Limits { max_value_bytes: 100_000, max_txn_bytes: 9_000_000 }
    }
}

impl Txn for FdbTxn {
    fn read_version(&self) -> u64 {
        self.read_version
    }

    async fn get(&self, key: &[u8]) -> Result<Option<Value>> {
        let value = self.trx.get(&self.key(key), false).await.map_err(map)?;
        Ok(value.map(|v| v.to_vec()))
    }

    async fn scan(&self, range: &KeyRange, limit: usize) -> Result<Vec<(Key, Value)>> {
        let mut option = RangeOption::from((self.key(&range.start), self.key(&range.end)));
        option.limit = Some(limit);
        option.mode = foundationdb::options::StreamingMode::WantAll;
        let mut out = Vec::new();
        let mut iteration = 1;
        loop {
            let values = self.trx.get_range(&option, iteration, false).await.map_err(map)?;
            let more = values.more();
            for kv in values.iter() {
                out.push((kv.key()[self.prefix.len()..].to_vec(), kv.value().to_vec()));
            }
            if !more || out.len() >= limit {
                break;
            }
            let Some(next) = option.clone().next_range(&values) else { break };
            option = next;
            option.limit = Some(limit - out.len());
            iteration += 1;
        }
        out.truncate(limit);
        Ok(out)
    }

    fn add_read_conflict_range(&mut self, range: &KeyRange) {
        let _ = self.trx.add_conflict_range(&self.key(&range.start), &self.key(&range.end), ConflictRangeType::Read);
    }

    fn set(&mut self, key: &[u8], value: &[u8]) {
        let key = self.key(key);
        self.trx.set(&key, value);
    }

    fn clear(&mut self, key: &[u8]) {
        let key = self.key(key);
        self.trx.clear(&key);
    }

    fn clear_range(&mut self, range: &KeyRange) {
        let (start, end) = (self.key(&range.start), self.key(&range.end));
        self.trx.clear_range(&start, &end);
    }

    fn max_u64(&mut self, key: &[u8], value: u64) {
        let key = self.key(key);
        self.trx.atomic_op(&key, &value.to_le_bytes(), MutationType::Max);
    }

    async fn commit(self) -> Result<u64> {
        let read_version = self.read_version;
        match self.trx.commit().await {
            Ok(committed) => Ok(committed.committed_version().map(|v| v as u64).unwrap_or(read_version)),
            Err(error) => Err(map(*error)),
        }
    }
}
