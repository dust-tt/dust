use dfs_protocol::rpc::{ListRequest, Object, Page};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::Arc,
    time::Instant,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub(super) enum Key {
    Object(String),
    Name(String, String),
    Page(String, Option<String>),
    Coverage(String),
    Block(String, Vec<u8>, u64),
}
pub(super) enum Value {
    Object(Object),
    Absent,
    Name(Option<String>),
    Page(Page),
    Coverage(Coverage),
    Block(Vec<u8>),
}
pub(super) struct Coverage {
    after: Option<String>,
    end: Option<String>,
    excluded: BTreeSet<String>,
    _edits: Vec<OwnedSemaphorePermit>,
}
impl Coverage {
    fn covers(&self, name: &str) -> bool {
        self.after.as_deref().is_none_or(|after| name > after)
            && self.end.as_deref().is_none_or(|end| name <= end)
    }
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
            Self::Coverage(v) => {
                v.after.as_ref().map_or(0, String::len)
                    + v.end.as_ref().map_or(0, String::len)
                    + v.excluded
                        .iter()
                        .map(|name| name.len() + 128)
                        .sum::<usize>()
            }
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
    /// @cc [owner:spolu,label:concurrency;security] directory-absence-proof
    /// Absence MUST use an unexpired name-ordered range, excluding listed and locally changed names.
    /// Hits and local edits MUST NOT extend its original expiry. Shared ID cursors MUST NOT be used
    /// as name bounds. Replacing or evicting a proof MUST only cause a fallback to the server.
    pub fn absent(&mut self, parent: &str, name: &str) -> bool {
        self.fresh(&Key::Coverage(parent.into())).is_some_and(|entry| {
            matches!(&entry.value, Value::Coverage(v) if v.covers(name) && !v.excluded.contains(name))
        })
    }
    pub fn remember_coverage<'a>(
        &mut self,
        request: &ListRequest,
        page: &Page,
        local_names: impl Iterator<Item = &'a str>,
        received: Instant,
        expires: Instant,
    ) {
        // Shared pagination uses object IDs, whereas ordinary directories use name boundaries.
        if request.directory_id == "shared" {
            return;
        }
        let coverage = Coverage {
            after: request.after.clone(),
            end: page.next_after.clone(),
            excluded: page
                .entries
                .iter()
                .map(|e| e.name.clone())
                .chain(local_names.map(str::to_owned))
                .collect(),
            _edits: vec![],
        };
        // Keep one range per directory. Its positive entries remain in the separate name cache.
        self.insert(
            Key::Coverage(request.directory_id.clone()),
            Value::Coverage(coverage),
            received,
            expires,
        );
    }
    pub fn exclude_name(&mut self, parent: &str, name: &str) {
        if !self.absent(parent, name) {
            return;
        }
        let key = Key::Coverage(parent.into());
        let Some(memory) = self.reserve(name.len() + 192) else {
            self.remove(&key);
            return;
        };
        let Some((_, entry)) = self.values.get_mut(&key) else {
            return;
        };
        // Coverage readers normally drop their Arc under the cache lock. If retained, discard the
        // proof instead of copying an unbounded set or changing a reader's immutable snapshot.
        let Some(entry) = Arc::get_mut(entry) else {
            self.remove(&key);
            return;
        };
        if let Value::Coverage(coverage) = &mut entry.value {
            coverage.excluded.insert(name.into());
            coverage._edits.push(memory);
        }
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
            Key::Object(id) | Key::Coverage(id) => id.len(),
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
    fn listing_absence_respects_range_boundaries_and_shared_cursors() {
        let mut cache = Cache::new(Arc::new(Semaphore::new(65536)));
        let now = Instant::now();
        let request = ListRequest {
            directory_id: "dir".into(),
            after: Some("b".into()),
            limit: 64,
        };
        let page = Page {
            entries: ["d", "h"]
                .map(|name| dfs_protocol::rpc::Entry {
                    name: name.into(),
                    object: None,
                })
                .to_vec(),
            next_after: Some("h".into()),
        };
        cache.remember_coverage(
            &request,
            &page,
            ["e"].into_iter(),
            now,
            now + Duration::from_secs(1),
        );
        for name in ["c", "f", "g"] {
            assert!(cache.absent("dir", name));
        }
        for name in ["a", "b", "d", "e", "h", "i"] {
            assert!(!cache.absent("dir", name));
        }
        let tail = ListRequest {
            after: Some("h".into()),
            ..request.clone()
        };
        cache.remember_coverage(
            &tail,
            &Page::default(),
            std::iter::empty(),
            now,
            now + Duration::from_secs(1),
        );
        assert!(cache.absent("dir", "z"));
        assert!(!cache.absent("dir", "h"));
        assert!(!cache.absent("dir", "a"));
        let shared = ListRequest {
            directory_id: "shared".into(),
            after: None,
            ..request
        };
        cache.remember_coverage(
            &shared,
            &Page::default(),
            std::iter::empty(),
            now,
            now + Duration::from_secs(1),
        );
        assert!(!cache.absent("shared", "anything"));
    }

    #[test]
    fn local_edits_keep_absence_expiry_and_survive_name_eviction() -> anyhow::Result<()> {
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(65536));
        let mut cache = Cache::new(budget.clone());
        let now = Instant::now();
        let expires = now + Duration::from_secs(1);
        let request = ListRequest {
            directory_id: "dir".into(),
            after: None,
            limit: 64,
        };
        cache.remember_coverage(&request, &Page::default(), std::iter::empty(), now, expires);
        assert!(cache.absent("dir", "new"));
        let before = budget.available_permits();
        cache.exclude_name("dir", "new");
        assert!(budget.available_permits() < before);
        cache.insert(
            Key::Name("dir".into(), "new".into()),
            Value::Name(Some("id".into())),
            now,
            expires,
        );
        cache.invalidate_directory("dir", true);
        assert!(!cache.absent("dir", "new"));
        assert!(cache.absent("dir", "other"));
        let key = Key::Coverage("dir".into());
        assert_eq!(cache.get(&key).context("coverage")?.expires, expires);
        cache.remove(&key);
        assert!(!cache.absent("dir", "other"));
        assert_eq!(budget.available_permits(), 65536);
        cache.remember_coverage(&request, &Page::default(), std::iter::empty(), now, now);
        assert!(!cache.absent("dir", "other"));
        Ok(())
    }

    #[test]
    fn exclusion_under_memory_pressure_discards_the_proof() -> anyhow::Result<()> {
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(4096));
        let mut cache = Cache::new(budget.clone());
        let now = Instant::now();
        let request = ListRequest {
            directory_id: "dir".into(),
            after: None,
            limit: 64,
        };
        cache.remember_coverage(
            &request,
            &Page::default(),
            std::iter::empty(),
            now,
            now + Duration::from_secs(1),
        );
        let reader = cache
            .get(&Key::Coverage("dir".into()))
            .context("coverage")?;
        let reservation = cache
            .reserve(budget.available_permits())
            .context("reserve rest")?;
        cache.exclude_name("dir", "new");
        assert!(!cache.absent("dir", "new"));
        assert!(!cache.absent("dir", "other"));
        drop(reader);
        drop(reservation);
        assert_eq!(budget.available_permits(), 4096);
        Ok(())
    }

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

    #[tokio::test]
    async fn writes_displace_clean_blocks_then_wait_for_shared_capacity() -> anyhow::Result<()> {
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(8192));
        let mut cache = Cache::new(budget.clone());
        let key = Key::Block("file".into(), vec![1], 0);
        let now = Instant::now();
        cache.insert(key.clone(), Value::Block(vec![0; 3072]), now, now);
        let first = cache.reserve(4096).context("first write")?;
        assert!(cache.get(&key).is_some());
        let second = cache.reserve(2048).context("evict clean data for write")?;
        assert!(cache.get(&key).is_none());
        assert!(cache.reserve(4096).is_none());
        let waiting = budget.clone().acquire_many_owned(4096);
        tokio::pin!(waiting);
        assert!(
            tokio::time::timeout(Duration::from_millis(10), &mut waiting)
                .await
                .is_err()
        );
        drop(second);
        let admitted = tokio::time::timeout(Duration::from_secs(1), waiting).await??;
        assert_eq!(budget.available_permits(), 0);
        drop(first);
        drop(admitted);
        assert_eq!(budget.available_permits(), 8192);
        Ok(())
    }
}
