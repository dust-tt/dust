use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

pub type Digest = [u8; 32];

#[derive(Clone, Copy, Debug, Serialize)]
pub struct CacheStats {
    pub capacity_bytes: usize,
    pub resident_bytes: usize,
    pub entries: usize,
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
}

struct Entry {
    tenant: Digest,
    bytes: Arc<[u8]>,
    stamp: u64,
    charge: usize,
}

struct State {
    tenant_bytes: HashMap<Digest, usize>,
    entries: HashMap<Digest, Entry>,
    order: BTreeMap<u64, Digest>,
    clock: u64,
    stats: CacheStats,
}

pub struct Cache(Mutex<State>);

impl Cache {
    pub fn new(capacity_bytes: usize) -> Self {
        Self(Mutex::new(State {
            tenant_bytes: HashMap::new(),
            entries: HashMap::new(),
            order: BTreeMap::new(),
            clock: 0,
            stats: CacheStats {
                capacity_bytes,
                resident_bytes: 0,
                entries: 0,
                hits: 0,
                misses: 0,
                evictions: 0,
            },
        }))
    }

    pub fn get(&self, key: &Digest) -> Option<Arc<[u8]>> {
        let mut state = self.0.lock();
        let Some(entry) = state.entries.remove(key) else {
            state.stats.misses += 1;
            return None;
        };
        state.order.remove(&entry.stamp);
        let stamp = state.tick();
        let bytes = entry.bytes.clone();
        state.entries.insert(*key, Entry { stamp, ..entry });
        state.order.insert(stamp, *key);
        state.stats.hits += 1;
        Some(bytes)
    }

    pub fn replace(&self, key: Digest, tenant: Digest, bytes: Arc<[u8]>) {
        {
            let mut state = self.0.lock();
            if let Some(entry) = state.entries.remove(&key) {
                state.order.remove(&entry.stamp);
                state.stats.resident_bytes -= entry.charge;
                if let Some(charge) = state.tenant_bytes.get_mut(&entry.tenant) {
                    *charge -= entry.charge;
                    if *charge == 0 {
                        state.tenant_bytes.remove(&entry.tenant);
                    }
                }
            }
        }
        self.insert(key, tenant, bytes);
    }

    pub fn insert(&self, key: Digest, tenant: Digest, bytes: Arc<[u8]>) {
        let mut state = self.0.lock();
        let charge = bytes.len().saturating_add(320);
        if charge > state.stats.capacity_bytes || state.entries.contains_key(&key) {
            return;
        }
        while charge > state.stats.capacity_bytes - state.stats.resident_bytes {
            let Some((_, oldest)) = state.order.pop_first() else {
                break;
            };
            if let Some(entry) = state.entries.remove(&oldest) {
                state.stats.resident_bytes -= entry.charge;
                if let Some(bytes) = state.tenant_bytes.get_mut(&entry.tenant) {
                    *bytes -= entry.charge;
                    if *bytes == 0 {
                        state.tenant_bytes.remove(&entry.tenant);
                    }
                }
                state.stats.evictions += 1;
            }
        }
        let stamp = state.tick();
        state.entries.insert(
            key,
            Entry {
                tenant,
                bytes,
                stamp,
                charge,
            },
        );
        state.order.insert(stamp, key);
        state.stats.resident_bytes += charge;
        *state.tenant_bytes.entry(tenant).or_default() += charge;
    }

    pub fn stats(&self) -> CacheStats {
        let state = self.0.lock();
        CacheStats {
            entries: state.entries.len(),
            ..state.stats
        }
    }
}

impl State {
    fn tick(&mut self) -> u64 {
        if self.clock == u64::MAX {
            self.clock = 0;
            let order = std::mem::take(&mut self.order);
            for (_, id) in order {
                self.clock += 1;
                if let Some(entry) = self.entries.get_mut(&id) {
                    entry.stamp = self.clock;
                    self.order.insert(self.clock, id);
                }
            }
        }
        self.clock += 1;
        self.clock
    }
}
