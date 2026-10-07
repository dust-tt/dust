use parking_lot::Mutex;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    sync::Arc,
    time::{Duration, Instant},
};

pub(crate) type Values = BTreeMap<String, Vec<u8>>;
const MAX_ENTRIES: usize = 16_384;

struct Entry {
    values: Arc<Values>,
    inserted: Instant,
    bytes: usize,
}

#[derive(Default)]
struct Entries {
    values: HashMap<String, Entry>,
    oldest: BTreeSet<(Instant, String)>,
    bytes: usize,
}

/// @cc [owner:spolu,label:performance;concurrency] bounded-xattr-cache
/// Cache complete user xattr maps, including empty maps, within byte and entry bounds per mount.
/// Positive values, absent names, and listings MUST share the inode attribute timeout. Failed loads
/// MUST NOT be cached. Callers MUST serialize fills and invalidation with the object's mutation lock.
pub(crate) struct Cache {
    entries: Mutex<Entries>,
    budget_bytes: usize,
    ttl: Duration,
}

impl Cache {
    pub fn new(budget_bytes: usize, ttl: Duration) -> Self {
        Self {
            entries: Mutex::new(Entries::default()),
            budget_bytes,
            ttl,
        }
    }

    pub fn get_or_load<E>(
        &self,
        id: &str,
        load: impl FnOnce() -> Result<Values, E>,
    ) -> Result<Arc<Values>, E> {
        if let Some(values) = self.entries.lock().get(id, Instant::now(), self.ttl) {
            return Ok(values);
        }
        // Unrelated objects may load concurrently; no global cache lock spans a network request.
        let mut values = load()?;
        values.retain(|name, _| name.starts_with("user."));
        let values = Arc::new(values);
        self.entries
            .lock()
            .insert(id, values.clone(), Instant::now(), self.budget_bytes);
        Ok(values)
    }

    pub fn invalidate(&self, id: &str) {
        self.entries.lock().remove(id);
    }
}

impl Entries {
    fn get(&mut self, id: &str, now: Instant, ttl: Duration) -> Option<Arc<Values>> {
        let entry = self.values.get(id)?;
        if now.saturating_duration_since(entry.inserted) < ttl {
            return Some(entry.values.clone());
        }
        self.remove(id);
        None
    }

    fn remove(&mut self, id: &str) {
        if let Some(entry) = self.values.remove(id) {
            self.bytes -= entry.bytes;
            self.oldest.remove(&(entry.inserted, id.to_owned()));
        }
    }

    fn insert(&mut self, id: &str, values: Arc<Values>, now: Instant, budget_bytes: usize) {
        self.remove(id);
        // Account for owned capacities and conservative per-entry/map-node overhead as well as data.
        let bytes = id.len() * 2
            + 256
            + values
                .iter()
                .map(|(name, value)| name.capacity() + value.capacity() + 128)
                .sum::<usize>();
        if bytes > budget_bytes {
            return;
        }
        while self.bytes + bytes > budget_bytes || self.values.len() >= MAX_ENTRIES {
            let Some((_, oldest)) = self.oldest.first().cloned() else {
                break;
            };
            self.remove(&oldest);
        }
        self.oldest.insert((now, id.to_owned()));
        self.values.insert(
            id.to_owned(),
            Entry {
                values,
                inserted: now,
                bytes,
            },
        );
        self.bytes += bytes;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn values_absence_and_listing_share_one_load_until_invalidation() -> Result<(), &'static str> {
        let cache = Cache::new(4096, Duration::from_secs(30));
        let calls = Cell::new(0);
        let load = || {
            calls.set(calls.get() + 1);
            Ok::<_, &'static str>(BTreeMap::from([
                ("user.binary".into(), vec![0, 255]),
                ("security.hidden".into(), vec![1]),
            ]))
        };
        let values = cache.get_or_load("file", load)?;
        assert_eq!(values.get("user.binary"), Some(&vec![0, 255]));
        assert!(!cache.get_or_load("file", load)?.contains_key("user.absent"));
        assert_eq!(cache.get_or_load("file", load)?.len(), 1);
        assert_eq!(calls.get(), 1);
        cache.invalidate("file");
        assert!(
            cache
                .get_or_load("file", || Ok::<_, &'static str>(Values::new()))?
                .is_empty()
        );
        assert!(
            cache
                .get_or_load("file", || Err("must use cached absence"))?
                .is_empty()
        );
        cache.invalidate("file");
        assert_eq!(
            cache.get_or_load("file", || Err("unavailable")),
            Err("unavailable")
        );
        cache.get_or_load("file", load)?;
        assert_eq!(calls.get(), 2);
        Ok(())
    }

    #[test]
    fn expiry_budget_and_disabled_cache_fall_back_to_loading() -> Result<(), &'static str> {
        let now = Instant::now();
        let ttl = Duration::from_secs(30);
        let mut entries = Entries::default();
        let values = Arc::new(Values::new());
        entries.insert("a", values.clone(), now, 512);
        assert!(
            entries
                .get("a", now + ttl - Duration::from_nanos(1), ttl)
                .is_some()
        );
        assert!(entries.get("a", now + ttl, ttl).is_none());
        assert_eq!(entries.bytes, 0);
        entries.insert("a", values.clone(), now, 512);
        entries.insert("b", values, now, 512);
        assert!(entries.get("a", now, ttl).is_none());
        assert!(entries.get("b", now, ttl).is_some());
        assert!(entries.bytes <= 512);
        let cache = Cache::new(0, ttl);
        cache.get_or_load("file", || Ok::<_, &'static str>(Values::new()))?;
        assert_eq!(
            cache.get_or_load("file", || Err("not cached")),
            Err("not cached")
        );
        Ok(())
    }
}
