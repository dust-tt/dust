//! Deterministic in-memory reference adapter: multi-version storage with optimistic
//! serializable conflict detection, plus fault injection for lost-reply tests.
//! Excluded from performance comparisons.

use std::collections::{BTreeMap, VecDeque};
use std::sync::Arc;

use parking_lot::Mutex;

use crate::{Key, KeyRange, Limits, Result, Store, StoreError, Txn, TxnOptions, Value};

/// Injected commit faults, consumed by the next commit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    /// Apply the commit, then report `Uncertain` (lost reply).
    CommitThenUncertain,
    /// Do not apply the commit and report `Uncertain`.
    DropThenUncertain,
}

#[derive(Default)]
struct Inner {
    version: u64,
    data: BTreeMap<Key, Vec<(u64, Option<Value>)>>,
    log: VecDeque<(u64, Vec<KeyRange>)>,
    faults: VecDeque<Fault>,
    commits: u64,
}

impl Inner {
    fn read_at(&self, key: &[u8], version: u64) -> Option<Value> {
        let history = self.data.get(key)?;
        history.iter().rev().find(|(v, _)| *v <= version).and_then(|(_, value)| value.clone())
    }
}

#[derive(Clone, Default)]
pub struct MemoryStore {
    inner: Arc<Mutex<Inner>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn inject(&self, fault: Fault) {
        self.inner.lock().faults.push_back(fault);
    }

    pub fn commits(&self) -> u64 {
        self.inner.lock().commits
    }
}

#[derive(Clone, Debug)]
enum Write {
    Set(Key, Value),
    Clear(Key),
    ClearRange(KeyRange),
    Max(Key, u64),
    Add(Key, u64),
}

fn le_u64(value: Option<&Value>) -> u64 {
    value.and_then(|v| v.get(..8)).map_or(0, |b| u64::from_le_bytes(b.try_into().unwrap_or([0; 8])))
}

pub struct MemoryTxn {
    store: MemoryStore,
    read_version: u64,
    reads: Mutex<Vec<KeyRange>>,
    writes: Vec<Write>,
}

impl MemoryTxn {
    /// Value as seen by this transaction: its own writes layered over the snapshot.
    fn local(&self, key: &[u8]) -> Option<Option<Value>> {
        let mut result = None;
        for write in &self.writes {
            match write {
                Write::Set(k, v) if k.as_slice() == key => result = Some(Some(v.clone())),
                Write::Clear(k) if k.as_slice() == key => result = Some(None),
                Write::ClearRange(range) if range.contains(key) => result = Some(None),
                Write::Max(k, v) if k.as_slice() == key => {
                    let base = match &result {
                        Some(local) => le_u64(local.as_ref()),
                        None => le_u64(self.store.inner.lock().read_at(key, self.read_version).as_ref()),
                    };
                    result = Some(Some(base.max(*v).to_le_bytes().to_vec()));
                }
                Write::Add(k, v) if k.as_slice() == key => {
                    let base = match &result {
                        Some(local) => le_u64(local.as_ref()),
                        None => le_u64(self.store.inner.lock().read_at(key, self.read_version).as_ref()),
                    };
                    result = Some(Some(base.wrapping_add(*v).to_le_bytes().to_vec()));
                }
                _ => {}
            }
        }
        result
    }
}

impl Store for MemoryStore {
    type Txn = MemoryTxn;

    async fn begin(&self, options: TxnOptions) -> Result<MemoryTxn> {
        let current = self.inner.lock().version;
        let read_version = match options.read_version {
            Some(version) if version <= current => version,
            Some(_) => return Err(StoreError::TooOld),
            None => current,
        };
        Ok(MemoryTxn { store: self.clone(), read_version, reads: Mutex::new(Vec::new()), writes: Vec::new() })
    }

    fn limits(&self) -> Limits {
        Limits { max_value_bytes: 100_000, max_txn_bytes: 9_000_000 }
    }
}

impl Txn for MemoryTxn {
    fn read_version(&self) -> u64 {
        self.read_version
    }

    async fn get(&self, key: &[u8]) -> Result<Option<Value>> {
        self.reads.lock().push(KeyRange::single(key));
        if let Some(local) = self.local(key) {
            return Ok(local);
        }
        Ok(self.store.inner.lock().read_at(key, self.read_version))
    }

    async fn scan(&self, range: &KeyRange, limit: usize) -> Result<Vec<(Key, Value)>> {
        let mut keys: Vec<Key> = {
            let inner = self.store.inner.lock();
            inner.data.range(range.start.clone()..range.end.clone()).map(|(k, _)| k.clone()).collect()
        };
        for write in &self.writes {
            if let Write::Set(k, _) = write
                && range.contains(k)
            {
                keys.push(k.clone());
            }
        }
        keys.sort();
        keys.dedup();
        let mut out = Vec::new();
        for key in keys {
            if out.len() == limit {
                break;
            }
            let value = match self.local(&key) {
                Some(local) => local,
                None => self.store.inner.lock().read_at(&key, self.read_version),
            };
            if let Some(value) = value {
                out.push((key, value));
            }
        }
        let tracked = match (out.len() == limit, out.last()) {
            (true, Some((last, _))) => KeyRange::new(range.start.clone(), KeyRange::single(last).end),
            _ => range.clone(),
        };
        self.reads.lock().push(tracked);
        Ok(out)
    }

    fn add_read_conflict_range(&mut self, range: &KeyRange) {
        self.reads.lock().push(range.clone());
    }

    fn set(&mut self, key: &[u8], value: &[u8]) {
        self.writes.push(Write::Set(key.to_vec(), value.to_vec()));
    }

    fn clear(&mut self, key: &[u8]) {
        self.writes.push(Write::Clear(key.to_vec()));
    }

    fn clear_range(&mut self, range: &KeyRange) {
        self.writes.push(Write::ClearRange(range.clone()));
    }

    fn max_u64(&mut self, key: &[u8], value: u64) {
        self.writes.push(Write::Max(key.to_vec(), value));
    }

    fn add_u64(&mut self, key: &[u8], value: u64) {
        self.writes.push(Write::Add(key.to_vec(), value));
    }

    async fn commit(self) -> Result<u64> {
        let mut inner = self.store.inner.lock();
        let reads = self.reads.lock();
        if inner.log.front().is_some_and(|(oldest, _)| *oldest > self.read_version + 1) {
            return Err(StoreError::TooOld);
        }
        for (version, written) in &inner.log {
            if *version > self.read_version
                && written.iter().any(|w| reads.iter().any(|r| r.intersects(w)))
            {
                return Err(StoreError::Conflict);
            }
        }
        let fault = inner.faults.pop_front();
        if fault == Some(Fault::DropThenUncertain) {
            return Err(StoreError::Uncertain);
        }
        if self.writes.is_empty() {
            return Ok(self.read_version);
        }
        inner.version += 1;
        inner.commits += 1;
        let version = inner.version;
        let mut written = Vec::new();
        for write in &self.writes {
            match write {
                Write::Set(k, v) => {
                    inner.data.entry(k.clone()).or_default().push((version, Some(v.clone())));
                    written.push(KeyRange::single(k));
                }
                Write::Clear(k) => {
                    if let Some(history) = inner.data.get_mut(k) {
                        history.push((version, None));
                    }
                    written.push(KeyRange::single(k));
                }
                Write::ClearRange(range) => {
                    let keys: Vec<Key> =
                        inner.data.range(range.start.clone()..range.end.clone()).map(|(k, _)| k.clone()).collect();
                    for k in keys {
                        if let Some(history) = inner.data.get_mut(&k) {
                            history.push((version, None));
                        }
                    }
                    written.push(range.clone());
                }
                Write::Max(k, v) => {
                    let current = le_u64(inner.read_at(k, version).as_ref());
                    inner.data.entry(k.clone()).or_default().push((version, Some(current.max(*v).to_le_bytes().to_vec())));
                    written.push(KeyRange::single(k));
                }
                Write::Add(k, v) => {
                    let current = le_u64(inner.read_at(k, version).as_ref());
                    inner.data.entry(k.clone()).or_default().push((version, Some(current.wrapping_add(*v).to_le_bytes().to_vec())));
                    written.push(KeyRange::single(k));
                }
            }
        }
        inner.log.push_back((version, written));
        while inner.log.len() > 100_000 {
            inner.log.pop_front();
        }
        if fault == Some(Fault::CommitThenUncertain) {
            return Err(StoreError::Uncertain);
        }
        Ok(version)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn read_write_conflict_detected() -> Result<()> {
        let store = MemoryStore::new();
        let mut a = store.begin(TxnOptions::default()).await?;
        let mut b = store.begin(TxnOptions::default()).await?;
        assert_eq!(a.get(b"k").await?, None);
        assert_eq!(b.get(b"k").await?, None);
        a.set(b"k", b"a");
        b.set(b"k", b"b");
        a.commit().await?;
        assert_eq!(b.commit().await, Err(StoreError::Conflict));
        Ok(())
    }

    #[tokio::test]
    async fn stale_read_version_still_serializable() -> Result<()> {
        let store = MemoryStore::new();
        let old = store.begin(TxnOptions::default()).await?.read_version();
        let mut w = store.begin(TxnOptions::default()).await?;
        w.set(b"k", b"1");
        w.commit().await?;
        let mut stale = store.begin(TxnOptions { read_version: Some(old) }).await?;
        assert_eq!(stale.get(b"k").await?, None);
        stale.set(b"k", b"2");
        assert_eq!(stale.commit().await, Err(StoreError::Conflict));
        Ok(())
    }

    #[tokio::test]
    async fn scan_phantom_detected() -> Result<()> {
        let store = MemoryStore::new();
        let mut a = store.begin(TxnOptions::default()).await?;
        assert!(a.scan(&KeyRange::prefix(b"d/"), 10).await?.is_empty());
        let mut b = store.begin(TxnOptions::default()).await?;
        b.set(b"d/x", b"1");
        b.commit().await?;
        a.set(b"other", b"1");
        assert_eq!(a.commit().await, Err(StoreError::Conflict));
        Ok(())
    }
}
