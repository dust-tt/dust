use dfs_protocol::rpc::{Object, Page};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::Arc,
    time::Instant,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub(super) enum Key {
    Object(String),
    Name(String, String),
    Page(String, Option<String>),
    Block(String, Vec<u8>, u64),
}
pub(super) enum Value {
    Object(Object),
    Absent,
    Name(Option<String>),
    Page(Page),
    Block(Vec<u8>),
}
pub(super) struct Entry {
    pub value: Value,
    pub expires: Instant,
    pub received: Instant,
    _memory: OwnedSemaphorePermit,
}
impl Value {
    pub fn weight(&self) -> usize {
        (match self {
            Self::Object(v) => object_weight(v),
            Self::Absent => 0,
            Self::Name(v) => v.as_ref().map_or(0, String::len),
            Self::Page(v) => v
                .entries
                .iter()
                .map(|e| e.name.len() + e.object.as_ref().map_or(0, object_weight) + 128)
                .sum(),
            Self::Block(v) => v.capacity(),
        }) + 256
    }
}
pub(super) fn object_weight(v: &Object) -> usize {
    v.id.len()
        + v.revision.len()
        + v.mime_type.len()
        + 512
        + v.xattrs
            .iter()
            .map(|(k, v)| k.len() + v.len() + 128)
            .sum::<usize>()
}

/// @cc [owner:spolu,label:performance;concurrency] charged-cache-lifetimes
/// Cache payload reservations MUST live until their last reader drops them, including after eviction.
/// Admission MUST evict clean entries or decline caching rather than exceed the shared memory budget.
pub(super) struct Cache {
    values: HashMap<Key, (u64, Arc<Entry>)>,
    order: BTreeMap<u64, Key>,
    pages: HashMap<String, HashSet<Key>>,
    names: HashMap<String, HashSet<Key>>,
    sequence: u64,
    pub budget: Arc<Semaphore>,
}
impl Cache {
    pub fn new(budget: Arc<Semaphore>) -> Self {
        Self {
            values: HashMap::new(),
            order: BTreeMap::new(),
            pages: HashMap::new(),
            names: HashMap::new(),
            sequence: 0,
            budget,
        }
    }
    pub fn get(&mut self, key: &Key) -> Option<Arc<Entry>> {
        let (previous, entry) = self.values.get_mut(key)?;
        self.order.remove(previous);
        self.sequence += 1;
        *previous = self.sequence;
        self.order.insert(self.sequence, key.clone());
        Some(entry.clone())
    }
    pub fn fresh(&mut self, key: &Key) -> Option<Arc<Entry>> {
        self.get(key).filter(|entry| Instant::now() < entry.expires)
    }
    pub fn remove(&mut self, key: &Key) {
        if let Some((sequence, _)) = self.values.remove(key) {
            self.order.remove(&sequence);
        }
        let index = match key {
            Key::Page(parent, _) => Some((&mut self.pages, parent)),
            Key::Name(parent, _) => Some((&mut self.names, parent)),
            _ => None,
        };
        if let Some((index, parent)) = index
            && let Some(keys) = index.get_mut(parent)
        {
            keys.remove(key);
            if keys.is_empty() {
                index.remove(parent);
            }
        }
    }
    pub fn invalidate_directory(&mut self, parent: &str, names: bool) {
        if let Some(keys) = self.pages.remove(parent) {
            for key in keys {
                self.remove(&key);
            }
        }
        if names && let Some(keys) = self.names.remove(parent) {
            for key in keys {
                self.remove(&key);
            }
        }
    }
    pub fn evict(&mut self) -> bool {
        if let Some((_, key)) = self.order.first_key_value() {
            let key = key.clone();
            self.remove(&key);
            true
        } else {
            false
        }
    }
    pub fn reserve(&mut self, bytes: usize) -> Option<OwnedSemaphorePermit> {
        let bytes = u32::try_from(bytes).ok()?;
        loop {
            if let Ok(permit) = self.budget.clone().try_acquire_many_owned(bytes) {
                return Some(permit);
            }
            if !self.evict() {
                return None;
            }
        }
    }
    pub fn insert(&mut self, key: Key, value: Value, received: Instant, expires: Instant) {
        self.remove(&key);
        let key_weight = match &key {
            Key::Object(id) => id.len(),
            Key::Name(id, name) => id.len() + name.len(),
            Key::Page(id, after) => id.len() + after.as_ref().map_or(0, String::len),
            Key::Block(id, revision, _) => id.len() + revision.len() + 8,
        };
        let Some(memory) = self.reserve(value.weight() + 3 * key_weight + 512) else {
            return;
        };
        self.sequence += 1;
        match &key {
            Key::Page(parent, _) => {
                self.pages
                    .entry(parent.clone())
                    .or_default()
                    .insert(key.clone());
            }
            Key::Name(parent, _) => {
                self.names
                    .entry(parent.clone())
                    .or_default()
                    .insert(key.clone());
            }
            _ => (),
        }
        self.order.insert(self.sequence, key.clone());
        self.values.insert(
            key,
            (
                self.sequence,
                Arc::new(Entry {
                    value,
                    expires,
                    received,
                    _memory: memory,
                }),
            ),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn eviction_keeps_reader_memory_charged_and_hits_do_not_renew_expiry() -> anyhow::Result<()> {
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(4096));
        let mut cache = Cache::new(budget.clone());
        let key = Key::Object("id".into());
        let before = Instant::now();
        cache.insert(
            key.clone(),
            Value::Object(Object::default()),
            before,
            before + Duration::from_secs(1),
        );
        let entry = cache.fresh(&key).context("entry")?;
        assert_eq!(entry.expires, before + Duration::from_secs(1));
        let available = budget.available_permits();
        cache.remove(&key);
        assert_eq!(budget.available_permits(), available);
        drop(entry);
        assert_eq!(budget.available_permits(), 4096);
        cache.insert(key.clone(), Value::Name(None), before, before);
        assert!(cache.fresh(&key).is_none());
        Ok(())
    }
}
