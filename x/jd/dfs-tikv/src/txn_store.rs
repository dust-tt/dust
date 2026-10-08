use crate::cache::Cache;
use crate::objects::{IoStats, hash, hex};
use crate::store::Rows;
use crate::store::{Commit, Config, Error, Result};
use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::ops::Bound;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tikv_client::{
    Backoff, CheckLevel, RetryOptions, Timestamp, TimestampExt, Transaction, TransactionClient,
    TransactionOptions,
};
use tokio::sync::{Mutex, Semaphore};

type KeyRange = (Bound<Vec<u8>>, Bound<Vec<u8>>);

struct Inner {
    config: Config,
    client: TransactionClient,
    cache: Cache,
    admission: Semaphore,
    reads: AtomicU64,
    writes: AtomicU64,
    snapshots: AtomicU64,
    commits: AtomicU64,
    conflicts: AtomicU64,
}

#[derive(Clone)]
pub struct Store(Arc<Inner>);

#[derive(Clone)]
pub struct Snapshot {
    store: Store,
    prefix: Vec<u8>,
    tenant: [u8; 32],
    timestamp: Timestamp,
    started: Instant,
    transaction: Arc<parking_lot::Mutex<Option<Transaction>>>,
}

pub struct PublicationBatch {
    snapshot: Snapshot,
    transaction: Mutex<Option<Transaction>>,
    edits: BTreeMap<Vec<u8>, usize>,
    prefetched: BTreeMap<Vec<u8>, Option<Vec<u8>>>,
    pending_cache: BTreeMap<Vec<u8>, Vec<u8>>,
    reads: parking_lot::Mutex<BTreeSet<Vec<u8>>>,
    bytes: usize,
    mutations: usize,
    failed: bool,
}

fn options() -> TransactionOptions {
    TransactionOptions::new_optimistic()
        .retry_options(RetryOptions {
            lock_backoff: Backoff::no_jitter_backoff(2, 500, 24),
            ..RetryOptions::default_optimistic()
        })
        .drop_check(CheckLevel::None)
}

fn conflict(error: &tikv_client::Error) -> bool {
    match error {
        tikv_client::Error::KeyError(error) => {
            error.conflict.is_some() || error.already_exist.is_some()
        }
        tikv_client::Error::MultipleKeyErrors(errors)
        | tikv_client::Error::ExtractedErrors(errors) => {
            !errors.is_empty() && errors.iter().all(conflict)
        }
        _ => false,
    }
}

fn checked_value(bytes: Vec<u8>, limit: usize) -> Result<Vec<u8>> {
    if bytes.len() < 32 || bytes.len() - 32 > limit {
        return Err(Error::Corrupt("record envelope size"));
    }
    if hash(&bytes[32..]).as_slice() != &bytes[..32] {
        return Err(Error::Corrupt("record checksum"));
    }
    Ok(bytes[32..].to_vec())
}

fn immutable(key: &[u8]) -> bool {
    key.starts_with(b"chunk\0\0") || key.starts_with(b"manifest\0\0")
}

impl Inner {
    async fn request<T>(&self, future: impl Future<Output = tikv_client::Result<T>>) -> Result<T> {
        tokio::time::timeout(self.config.operation_timeout, async {
            let _permit = self.admission.acquire().await.map_err(|_| Error::Closed)?;
            future.await.map_err(Error::from)
        })
        .await
        .map_err(|_| Error::Deadline)?
    }
}

impl Store {
    pub async fn connect(config: Config) -> Result<Self> {
        config.validate()?;
        let client = tokio::time::timeout(
            config.operation_timeout,
            TransactionClient::new(config.pd_endpoints.clone()),
        )
        .await
        .map_err(|_| Error::Deadline)??;
        Ok(Self(Arc::new(Inner {
            client,
            cache: Cache::new(config.cache_bytes),
            admission: Semaphore::new(config.io_concurrency),
            config,
            reads: AtomicU64::new(0),
            writes: AtomicU64::new(0),
            snapshots: AtomicU64::new(0),
            commits: AtomicU64::new(0),
            conflicts: AtomicU64::new(0),
        })))
    }

    pub async fn snapshot(&self, tenant: &str) -> Result<Snapshot> {
        if tenant.is_empty() || tenant.len() > 1024 {
            return Err(Error::Invalid("tenant identity"));
        }
        let started = Instant::now();
        let transaction = self
            .0
            .request(self.0.client.begin_with_options(options()))
            .await?;
        let timestamp = transaction.start_timestamp();
        self.0.snapshots.fetch_add(1, Ordering::Relaxed);
        let tenant = hash(tenant.as_bytes());
        Ok(Snapshot {
            store: self.clone(),
            prefix: format!("dfs-txn-v1/{}/{}/", self.0.config.namespace, hex(&tenant))
                .into_bytes(),
            tenant,
            timestamp,
            started,
            transaction: Arc::new(parking_lot::Mutex::new(Some(transaction))),
        })
    }

    pub fn stats(&self) -> IoStats {
        IoStats {
            object_reads: self.0.reads.load(Ordering::Relaxed),
            object_writes: self.0.writes.load(Ordering::Relaxed),
            root_reads: 0,
            root_cas: 0,
            transaction_snapshots: self.0.snapshots.load(Ordering::Relaxed),
            transaction_commits: self.0.commits.load(Ordering::Relaxed),
            transaction_conflicts: self.0.conflicts.load(Ordering::Relaxed),
            cache: self.0.cache.stats(),
        }
    }

    pub fn tenant_cache_bytes(&self, tenant: &str) -> usize {
        self.0.cache.resident_for(&hash(tenant.as_bytes()))
    }
}

impl Snapshot {
    fn check(&self) -> Result<()> {
        if self.started.elapsed() > Duration::from_secs(120) {
            return Err(Error::Deadline);
        }
        Ok(())
    }

    fn key(&self, key: &[u8]) -> Result<Vec<u8>> {
        self.check()?;
        if key.len() > self.store.0.config.max_key_bytes {
            return Err(Error::Capacity("key size"));
        }
        Ok([self.prefix.as_slice(), key].concat())
    }

    fn range(&self, prefix: &[u8], after: Option<&[u8]>, limit: usize) -> Result<KeyRange> {
        if limit == 0 || limit > self.store.0.config.max_scan_items {
            return Err(Error::Capacity("scan count"));
        }
        if after.is_some_and(|key| !key.starts_with(prefix)) {
            return Err(Error::Invalid("scan continuation"));
        }
        let start = match after {
            Some(key) => Bound::Excluded(self.key(key)?),
            None => Bound::Included(self.key(prefix)?),
        };
        let mut end = self.key(prefix)?;
        while end.last() == Some(&255) {
            end.pop();
        }
        *end.last_mut().ok_or(Error::Invalid("scan prefix"))? += 1;
        Ok((start, Bound::Excluded(end)))
    }

    fn rows(&self, rows: impl Iterator<Item = tikv_client::KvPair>) -> Result<Rows> {
        let mut result = Vec::new();
        let mut bytes = 0usize;
        for pair in rows {
            let (key, value): (tikv_client::Key, Vec<u8>) = pair.into();
            let value = checked_value(value, self.store.0.config.max_value_bytes)?;
            let key: Vec<u8> = key.into();
            let key = key
                .strip_prefix(self.prefix.as_slice())
                .ok_or(Error::Corrupt("scan tenant boundary"))?
                .to_vec();
            bytes = bytes.saturating_add(key.len()).saturating_add(value.len());
            if bytes > self.store.0.config.max_scan_bytes
                || value.len() > self.store.0.config.max_value_bytes
            {
                return Err(Error::Capacity("scan bytes"));
            }
            result.push((key, value));
        }
        Ok(result)
    }

    pub fn revision(&self) -> u64 {
        self.timestamp.version()
    }

    pub async fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        let physical = self.key(key)?;
        let mut reader = self
            .store
            .0
            .client
            .snapshot(self.timestamp.clone(), options());
        self.store.0.reads.fetch_add(1, Ordering::Relaxed);
        self.store
            .0
            .request(reader.get(physical))
            .await?
            .map(|bytes| checked_value(bytes, self.store.0.config.max_value_bytes))
            .transpose()
    }

    pub async fn scan(&self, prefix: &[u8], after: Option<&[u8]>, limit: usize) -> Result<Rows> {
        let range = self.range(prefix, after, limit)?;
        let mut reader = self
            .store
            .0
            .client
            .snapshot(self.timestamp.clone(), options());
        self.store.0.reads.fetch_add(1, Ordering::Relaxed);
        self.rows(
            self.store
                .0
                .request(reader.scan(range, limit as u32))
                .await?,
        )
    }

    pub fn batch(self) -> PublicationBatch {
        let transaction = self.transaction.lock().take();
        PublicationBatch {
            snapshot: self,
            transaction: Mutex::new(transaction),
            edits: BTreeMap::new(),
            prefetched: BTreeMap::new(),
            pending_cache: BTreeMap::new(),
            reads: parking_lot::Mutex::new(BTreeSet::new()),
            bytes: 0,
            mutations: 0,
            failed: false,
        }
    }
}

impl PublicationBatch {
    pub fn staged_bytes(&self) -> usize {
        self.bytes
    }
    pub fn revision(&self) -> u64 {
        self.snapshot.revision()
    }

    pub async fn prefetch(&mut self, keys: &[Vec<u8>]) -> Result<()> {
        if keys.len() > 256 {
            return Err(Error::Capacity("prefetch keys"));
        }
        self.prefetched.clear();
        let physical = keys
            .iter()
            .map(|key| self.snapshot.key(key))
            .collect::<Result<Vec<_>>>()?;
        let mut guard = self.transaction.lock().await;
        let txn = guard.as_mut().ok_or(Error::FailedBatch)?;
        txn.lock_keys(physical.clone()).await?;
        self.reads.lock().extend(physical.iter().cloned());
        let store = &self.snapshot.store.0;
        store.reads.fetch_add(1, Ordering::Relaxed);
        let rows = store.request(txn.batch_get(physical)).await?;
        let mut bytes = 0usize;
        for key in keys {
            self.prefetched.insert(key.clone(), None);
        }
        for row in rows {
            let (key, value): (tikv_client::Key, Vec<u8>) = row.into();
            let key: Vec<u8> = key.into();
            let value = checked_value(value, store.config.max_value_bytes)?;
            bytes += key.len() + value.len();
            if bytes > 1 << 20 {
                return Err(Error::Capacity("prefetch bytes"));
            }
            self.prefetched
                .insert(key[self.snapshot.prefix.len()..].to_vec(), Some(value));
        }
        Ok(())
    }

    pub async fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        if self.failed {
            return Err(Error::FailedBatch);
        }
        self.snapshot.check()?;
        if let Some(value) = self.prefetched.get(key) {
            return Ok(value.clone());
        }
        let physical = self.snapshot.key(key)?;
        let mut guard = self.transaction.lock().await;
        let txn = guard.as_mut().ok_or(Error::FailedBatch)?;
        self.reads.lock().insert(physical.clone());
        txn.lock_keys([physical.clone()]).await?;
        let store = &self.snapshot.store.0;
        let cached = if immutable(key) && !self.edits.contains_key(key) {
            store.cache.get(&hash(&physical))
        } else {
            None
        };
        if let Some(cached) = cached
            && cached.len() >= 8
        {
            let observed = u64::from_be_bytes(
                cached[..8]
                    .try_into()
                    .map_err(|_| Error::Corrupt("cache timestamp"))?,
            );
            if observed <= self.revision() {
                return Ok(Some(cached[8..].to_vec()));
            }
        }
        store.reads.fetch_add(1, Ordering::Relaxed);
        let value = store
            .request(txn.get(physical.clone()))
            .await?
            .map(|bytes| checked_value(bytes, store.config.max_value_bytes))
            .transpose()?;
        if let Some(value) = &value {
            if value.len() > store.config.max_value_bytes {
                return Err(Error::Capacity("value size"));
            }
            if immutable(key) && !self.edits.contains_key(key) {
                let mut cached = self.revision().to_be_bytes().to_vec();
                cached.extend_from_slice(value);
                store
                    .cache
                    .insert(hash(&physical), self.snapshot.tenant, cached.into());
            }
        }
        Ok(value)
    }

    pub async fn scan(&self, prefix: &[u8], after: Option<&[u8]>, limit: usize) -> Result<Rows> {
        let range = self.snapshot.range(prefix, after, limit)?;
        let mut guard = self.transaction.lock().await;
        let txn = guard.as_mut().ok_or(Error::FailedBatch)?;
        let store = &self.snapshot.store.0;
        store.reads.fetch_add(1, Ordering::Relaxed);
        let rows = self
            .snapshot
            .rows(store.request(txn.scan(range, limit as u32)).await?)?;
        let keys = rows
            .iter()
            .map(|(key, _)| self.snapshot.key(key))
            .collect::<Result<Vec<_>>>()?;
        self.reads.lock().extend(keys.iter().cloned());
        txn.lock_keys(keys).await?;
        Ok(rows)
    }

    pub async fn guard(&mut self, key: &[u8]) -> Result<()> {
        self.put(key, uuid::Uuid::new_v4().as_bytes()).await
    }

    pub async fn put(&mut self, key: &[u8], value: &[u8]) -> Result<()> {
        self.edit(key, Some(value)).await
    }
    pub async fn delete(&mut self, key: &[u8]) -> Result<()> {
        self.edit(key, None).await
    }

    async fn edit(&mut self, key: &[u8], value: Option<&[u8]>) -> Result<()> {
        if self.failed {
            return Err(Error::FailedBatch);
        }
        let result = self.edit_inner(key, value).await;
        self.failed |= result.is_err();
        result
    }

    async fn edit_inner(&mut self, key: &[u8], value: Option<&[u8]>) -> Result<()> {
        let physical = self.snapshot.key(key)?;
        let config = &self.snapshot.store.0.config;
        if self.mutations >= config.max_mutations
            || value.is_some_and(|v| v.len() > config.max_value_bytes)
        {
            return Err(Error::Capacity("transaction mutations"));
        }
        let charge = key.len() + value.map_or(0, <[u8]>::len);
        let bytes = self.bytes - self.edits.get(key).copied().unwrap_or(0) + charge;
        if bytes > config.max_batch_bytes {
            return Err(Error::Capacity("transaction bytes"));
        }
        if immutable(key) {
            if value.is_none() {
                return Err(Error::Invalid("immutable record deletion"));
            }
            if let Some(existing) = self.get(key).await? {
                if Some(existing.as_slice()) != value {
                    return Err(Error::Corrupt("immutable record replacement"));
                }
                return Ok(());
            }
        }
        self.prefetched.remove(key);
        let mut guard = self.transaction.lock().await;
        let txn = guard.as_mut().ok_or(Error::FailedBatch)?;
        match value {
            Some(value) => {
                let mut envelope = hash(value).to_vec();
                envelope.extend_from_slice(value);
                txn.put(physical, envelope).await?;
            }
            None => txn.delete(physical).await?,
        }
        if immutable(key)
            && let Some(value) = value
        {
            self.pending_cache.insert(key.to_vec(), value.to_vec());
        }
        self.edits.insert(key.to_vec(), charge);
        self.bytes = bytes;
        self.mutations += 1;
        Ok(())
    }

    pub async fn commit(self) -> Result<Commit> {
        self.snapshot.check()?;
        if self.failed {
            return Err(Error::FailedBatch);
        }
        if self.reads.lock().len() + self.edits.len() > self.snapshot.store.0.config.max_mutations {
            return Err(Error::Capacity("transaction read/write set"));
        }
        let mut txn = self.transaction.into_inner().ok_or(Error::FailedBatch)?;
        if self.mutations == 0 {
            return Ok(Commit::Published {
                revision: self.snapshot.revision(),
            });
        }
        let store = &self.snapshot.store.0;
        store.commits.fetch_add(1, Ordering::Relaxed);
        let result = store.request(txn.commit()).await;
        match result {
            Ok(timestamp) => {
                let revision = timestamp.map_or(self.snapshot.revision(), |t| t.version());
                for (key, value) in self.pending_cache {
                    let physical = [self.snapshot.prefix.as_slice(), key.as_slice()].concat();
                    let mut cached = revision.to_be_bytes().to_vec();
                    cached.extend_from_slice(&value);
                    store
                        .cache
                        .insert(hash(&physical), self.snapshot.tenant, cached.into());
                }
                store
                    .writes
                    .fetch_add(self.edits.len() as u64, Ordering::Relaxed);
                Ok(Commit::Published { revision })
            }
            Err(Error::Backend(error)) if conflict(&error) => {
                let _ = store.request(txn.rollback()).await;
                store.conflicts.fetch_add(1, Ordering::Relaxed);
                Ok(Commit::Conflict)
            }
            Err(error) => Err(Error::Ambiguous(error.to_string())),
        }
    }
}
