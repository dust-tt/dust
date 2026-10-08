use crate::cache::Cache;
use crate::objects::{IoStats, hash, hex};
use crate::store::{Commit, Config, Error, Result, Rows};
use foundationdb::{
    Database, FdbError, RangeOption, Transaction,
    options::{ConflictRangeType, TransactionOption},
};
use futures::TryStreamExt;
use parking_lot::Mutex;
use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

const CHUNK_BYTES: usize = 64 << 10;
const SNAPSHOT_LIFETIME: Duration = Duration::from_secs(4);
const MAX_READ_BYTES: usize = 1 << 20;

type ReadRanges = BTreeSet<(Vec<u8>, Vec<u8>)>;

struct Inner {
    config: Config,
    database: Database,
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
    version: i64,
    started: Instant,
    transaction: Arc<Transaction>,
    dependencies: Arc<Mutex<(ReadRanges, usize)>>,
}

pub struct PublicationBatch {
    snapshot: Snapshot,
    transaction: std::result::Result<Transaction, FdbError>,
    bytes: usize,
    mutations: usize,
    chunks: BTreeMap<[u8; 32], Vec<u8>>,
    prefetched: BTreeMap<Vec<u8>, Option<Vec<u8>>>,
    failed: bool,
}

impl Inner {
    fn transaction(&self) -> std::result::Result<Transaction, FdbError> {
        let transaction = self.database.create_trx()?;
        transaction.set_option(TransactionOption::Timeout(
            self.config
                .operation_timeout
                .min(SNAPSHOT_LIFETIME)
                .as_millis() as i32,
        ))?;
        Ok(transaction)
    }

    async fn request<T>(&self, future: impl Future<Output = Result<T>>) -> Result<T> {
        tokio::time::timeout(
            self.config.operation_timeout.min(SNAPSHOT_LIFETIME),
            async {
                let _permit = self.admission.acquire().await.map_err(|_| Error::Closed)?;
                future.await
            },
        )
        .await
        .map_err(|_| Error::Deadline)?
    }
}

impl Store {
    pub async fn connect(config: Config) -> Result<Self> {
        config.validate()?;
        Ok(Self(Arc::new(Inner {
            database: Database::new(Some(&config.cluster_file))?,
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
        let transaction = self.0.transaction()?;
        let version = self
            .0
            .request(async { Ok(transaction.get_read_version().await?) })
            .await?;
        self.0.snapshots.fetch_add(1, Ordering::Relaxed);
        let tenant = hash(tenant.as_bytes());
        Ok(Snapshot {
            store: self.clone(),
            prefix: format!(
                "dfs-fdb-v2/{}/tenant/{}/",
                self.0.config.namespace,
                hex(&tenant)
            )
            .into_bytes(),
            tenant,
            version,
            started,
            transaction: Arc::new(transaction),
            dependencies: Arc::new(Mutex::new((BTreeSet::new(), 0))),
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

fn successor(mut key: Vec<u8>) -> Vec<u8> {
    while key.last() == Some(&255) {
        key.pop();
    }
    if let Some(last) = key.last_mut() {
        *last += 1;
    }
    key
}

fn key_end(key: &[u8]) -> Vec<u8> {
    let mut end = key.to_vec();
    end.push(0);
    end
}

impl Snapshot {
    pub fn revision(&self) -> u64 {
        self.version as u64
    }

    fn check(&self) -> Result<()> {
        if self.started.elapsed() >= SNAPSHOT_LIFETIME {
            return Err(Error::Deadline);
        }
        Ok(())
    }

    fn record_key(&self, key: &[u8]) -> Result<Vec<u8>> {
        if key.len() > self.store.0.config.max_key_bytes {
            return Err(Error::Capacity("key size"));
        }
        let mut physical = self.prefix.clone();
        physical.push(0);
        physical.extend_from_slice(key);
        Ok(physical)
    }

    fn chunk_key(&self, digest: &[u8], index: usize) -> Vec<u8> {
        let mut key = self.prefix.clone();
        key.push(1);
        key.extend_from_slice(digest);
        key.extend_from_slice(&(index as u32).to_be_bytes());
        key
    }

    fn cache_key(&self, digest: &[u8]) -> [u8; 32] {
        let mut key = self.tenant.to_vec();
        key.extend_from_slice(digest);
        hash(&key)
    }

    fn remember(&self, begin: Vec<u8>, end: Vec<u8>) -> Result<()> {
        let mut state = self.dependencies.lock();
        let charge = begin.len() + end.len() + 128;
        if state.0.contains(&(begin.clone(), end.clone())) {
            return Ok(());
        }
        if state.1 + charge > MAX_READ_BYTES {
            return Err(Error::Capacity("snapshot read dependencies"));
        }
        state.1 += charge;
        state.0.insert((begin, end));
        Ok(())
    }

    async fn decode_record(&self, transaction: &Transaction, envelope: &[u8]) -> Result<Vec<u8>> {
        let Some((&tag, tail)) = envelope.split_first() else {
            return Err(Error::Corrupt("record envelope"));
        };
        if tail.len() < 32 {
            return Err(Error::Corrupt("record digest"));
        }
        let (digest, payload) = tail.split_at(32);
        let value = match tag {
            0 if payload.len() <= CHUNK_BYTES
                && payload.len() <= self.store.0.config.max_value_bytes =>
            {
                payload.to_vec()
            }
            1 if payload.len() == 4 => {
                let size = u32::from_be_bytes(payload.try_into().unwrap()) as usize;
                if size <= CHUNK_BYTES || size > self.store.0.config.max_value_bytes {
                    return Err(Error::Corrupt("chunked record size"));
                }
                let cache_key = self.cache_key(digest);
                if let Some(bytes) = self.store.0.cache.get(&cache_key) {
                    if bytes.len() != size {
                        return Err(Error::Corrupt("cached record size"));
                    }
                    return Ok(bytes.to_vec());
                }
                let count = size.div_ceil(CHUNK_BYTES);
                let chunks = futures::future::try_join_all((0..count).map(|index| async move {
                    let key = self.chunk_key(digest, index);
                    let chunk = transaction
                        .get(&key, false)
                        .await?
                        .ok_or(Error::Corrupt("referenced chunk missing"))?;
                    if chunk.len() != (size - index * CHUNK_BYTES).min(CHUNK_BYTES) {
                        return Err(Error::Corrupt("chunk size"));
                    }
                    Ok::<_, Error>(chunk.to_vec())
                }))
                .await?;
                let value: Vec<u8> = chunks.into_iter().flatten().collect();
                if hash(&value).as_slice() != digest {
                    return Err(Error::Corrupt("chunked record checksum"));
                }
                self.store
                    .0
                    .cache
                    .insert(cache_key, self.tenant, value.clone().into());
                value
            }
            _ => return Err(Error::Corrupt("record envelope layout")),
        };
        if hash(&value).as_slice() != digest {
            return Err(Error::Corrupt("record checksum"));
        }
        Ok(value)
    }

    async fn read(&self, transaction: &Transaction, key: &[u8]) -> Result<Option<Vec<u8>>> {
        self.check()?;
        let key = self.record_key(key)?;
        self.store.0.reads.fetch_add(1, Ordering::Relaxed);
        self.store
            .0
            .request(async {
                let value = transaction.get(&key, false).await?;
                match value {
                    Some(value) => Ok(Some(self.decode_record(transaction, &value).await?)),
                    None => Ok(None),
                }
            })
            .await
    }

    fn range(
        &self,
        prefix: &[u8],
        after: Option<&[u8]>,
        limit: usize,
    ) -> Result<(Vec<u8>, Vec<u8>)> {
        if limit == 0 || limit > self.store.0.config.max_scan_items {
            return Err(Error::Capacity("scan items"));
        }
        if after.is_some_and(|key| !key.starts_with(prefix)) {
            return Err(Error::Invalid("scan continuation"));
        }
        let begin = self.record_key(prefix)?;
        let end = successor(begin.clone());
        let begin = match after {
            Some(key) => key_end(&self.record_key(key)?),
            None => begin,
        };
        Ok((begin, end))
    }

    async fn scan_transaction(
        &self,
        transaction: &Transaction,
        prefix: &[u8],
        after: Option<&[u8]>,
        limit: usize,
    ) -> Result<Rows> {
        self.check()?;
        let (begin, end) = self.range(prefix, after, limit)?;
        let mut range = RangeOption::from((begin, end));
        range.limit = Some(limit);
        range.target_bytes = CHUNK_BYTES;
        self.store
            .0
            .request(async {
                let stream = transaction.get_ranges_keyvalues(range, false);
                futures::pin_mut!(stream);
                let mut rows = Vec::new();
                let mut bytes = 0;
                while let Some(row) = stream.try_next().await? {
                    let key = row
                        .key()
                        .get(self.prefix.len() + 1..)
                        .ok_or(Error::Corrupt("scan key"))?;
                    if !key.starts_with(prefix) || key.len() > self.store.0.config.max_key_bytes {
                        return Err(Error::Corrupt("scan key prefix or size"));
                    }
                    let value = self.decode_record(transaction, row.value()).await?;
                    bytes += key.len() + value.len();
                    if bytes > self.store.0.config.max_scan_bytes {
                        return Err(Error::Capacity("scan bytes"));
                    }
                    rows.push((key.to_vec(), value));
                }
                Ok(rows)
            })
            .await
    }

    pub async fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        let physical = self.record_key(key)?;
        self.remember(physical.clone(), key_end(&physical))?;
        self.read(&self.transaction, key).await
    }

    pub async fn scan(&self, prefix: &[u8], after: Option<&[u8]>, limit: usize) -> Result<Rows> {
        let (begin, end) = self.range(prefix, after, limit)?;
        self.remember(begin, end)?;
        self.scan_transaction(&self.transaction, prefix, after, limit)
            .await
    }

    pub fn batch(self) -> PublicationBatch {
        let transaction = self.store.0.transaction().and_then(|transaction| {
            transaction.set_read_version(self.version);
            for (begin, end) in &self.dependencies.lock().0 {
                transaction.add_conflict_range(begin, end, ConflictRangeType::Read)?;
            }
            Ok(transaction)
        });
        let bytes = self.dependencies.lock().1;
        PublicationBatch {
            snapshot: self,
            transaction,
            bytes,
            mutations: 0,
            chunks: BTreeMap::new(),
            prefetched: BTreeMap::new(),
            failed: false,
        }
    }
}

impl PublicationBatch {
    fn transaction(&self) -> Result<&Transaction> {
        if self.failed {
            return Err(Error::FailedBatch);
        }
        self.snapshot.check()?;
        self.transaction
            .as_ref()
            .map_err(|error| Error::from(*error))
    }

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
        let values = futures::future::try_join_all(keys.iter().map(|key| self.get(key))).await?;
        let bytes = keys
            .iter()
            .zip(&values)
            .map(|(key, value)| key.len() + value.as_ref().map_or(0, Vec::len))
            .sum::<usize>();
        if bytes > 1 << 20 {
            return Err(Error::Capacity("prefetch bytes"));
        }
        self.prefetched.extend(keys.iter().cloned().zip(values));
        Ok(())
    }

    pub async fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        self.transaction()?;
        if let Some(value) = self.prefetched.get(key) {
            return Ok(value.clone());
        }
        let physical = self.snapshot.record_key(key)?;
        self.snapshot
            .remember(physical.clone(), key_end(&physical))?;
        self.snapshot.read(self.transaction()?, key).await
    }

    pub async fn scan(&self, prefix: &[u8], after: Option<&[u8]>, limit: usize) -> Result<Rows> {
        let (begin, end) = self.snapshot.range(prefix, after, limit)?;
        self.snapshot.remember(begin, end)?;
        self.snapshot
            .scan_transaction(self.transaction()?, prefix, after, limit)
            .await
    }

    pub async fn put(&mut self, key: &[u8], value: &[u8]) -> Result<()> {
        self.edit(key, Some(value))
    }

    pub async fn delete(&mut self, key: &[u8]) -> Result<()> {
        self.edit(key, None)
    }

    fn edit(&mut self, key: &[u8], value: Option<&[u8]>) -> Result<()> {
        let result = self.stage(key, value);
        if result.is_err() {
            self.failed = true;
        }
        result
    }

    fn stage(&mut self, key: &[u8], value: Option<&[u8]>) -> Result<()> {
        self.prefetched.remove(key);
        let physical = self.snapshot.record_key(key)?;
        let config = &self.snapshot.store.0.config;
        if self.mutations >= config.max_mutations
            || value.is_some_and(|v| v.len() > config.max_value_bytes)
        {
            return Err(Error::Capacity("mutation count or value size"));
        }
        let size = value.map_or(0, |v| v.len());
        let charge = physical.len() * 3
            + size
            + 128
            + size.div_ceil(CHUNK_BYTES) * (self.snapshot.prefix.len() * 3 + 256);
        if self.bytes + charge > config.max_batch_bytes {
            return Err(Error::Capacity("transaction bytes"));
        }
        self.transaction()?;
        if let Some(value) = value.filter(|value| value.len() > CHUNK_BYTES) {
            let digest = hash(value);
            if self
                .chunks
                .get(&digest)
                .is_some_and(|existing| existing != value)
            {
                return Err(Error::Corrupt("staged chunk digest collision"));
            }
            self.chunks.entry(digest).or_insert_with(|| value.to_vec());
        }
        let transaction = self.transaction()?;
        transaction.add_conflict_range(&physical, &key_end(&physical), ConflictRangeType::Read)?;
        match value {
            Some(value) => {
                let digest = hash(value);
                let mut envelope = Vec::with_capacity(37 + value.len().min(CHUNK_BYTES));
                envelope.push(u8::from(value.len() > CHUNK_BYTES));
                envelope.extend_from_slice(&digest);
                if value.len() <= CHUNK_BYTES {
                    envelope.extend_from_slice(value);
                } else {
                    envelope.extend_from_slice(&(value.len() as u32).to_be_bytes());
                    for (index, chunk) in value.chunks(CHUNK_BYTES).enumerate() {
                        transaction.set(&self.snapshot.chunk_key(&digest, index), chunk);
                    }
                }
                transaction.set(&physical, &envelope);
            }
            None => transaction.clear(&physical),
        }
        self.bytes += charge;
        self.mutations += 1;
        Ok(())
    }

    pub async fn commit(self) -> Result<Commit> {
        self.transaction()?;
        if self.mutations == 0 {
            return Ok(Commit::Published {
                revision: self.revision(),
            });
        }
        let inner = &self.snapshot.store.0;
        inner.commits.fetch_add(1, Ordering::Relaxed);
        let transaction = self.transaction?;
        let result = inner
            .request(async {
                match transaction.commit().await {
                    Ok(committed) => Ok(Commit::Published {
                        revision: committed.committed_version()? as u64,
                    }),
                    Err(error)
                        if error.is_maybe_committed()
                            || matches!(error.code(), 1025 | 1031 | 1101) =>
                    {
                        Err(Error::Ambiguous(error.to_string()))
                    }
                    Err(error) if error.is_retryable_not_committed() => {
                        inner.conflicts.fetch_add(1, Ordering::Relaxed);
                        Ok(Commit::Conflict)
                    }
                    Err(error) => Err(Error::Backend(*error)),
                }
            })
            .await;
        match result {
            Err(Error::Deadline) => Err(Error::Ambiguous("transaction commit deadline".into())),
            Ok(Commit::Published { revision }) => {
                inner
                    .writes
                    .fetch_add(self.mutations as u64, Ordering::Relaxed);
                Ok(Commit::Published { revision })
            }
            other => other,
        }
    }
}
