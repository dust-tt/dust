use dfs_protocol::ObjectRef;
use dfs_protocol::Revision;
use dfs_protocol::rpc::{Attr, ListRequest, Metadata, Page};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
    time::Instant,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub(super) enum Key {
    Attr(ObjectRef),
    Metadata(ObjectRef, Revision),
    Name(ObjectRef, String),
    Page(ObjectRef, Option<String>),
    Coverage(ObjectRef),
    Block(ObjectRef, Revision, u64),
    Source(ObjectRef),
    Stream(ObjectRef),
    Window(ObjectRef),
}
pub(super) enum Value {
    Attr(Attr),
    Metadata(Metadata),
    Absent,
    Name(Name),
    Page(Page),
    Coverage(Coverage),
    Block(super::content::Block),
    Source {
        parent: ObjectRef,
        after: Option<String>,
    },
    Stream {
        next: u64,
        window: usize,
    },
    Window(usize),
}
#[derive(Clone)]
pub(super) struct PageSource {
    pub after: Option<String>,
    pub revision: Vec<u8>,
}
#[derive(Clone)]
pub(super) struct Name {
    pub object_id: Option<ObjectRef>,
    pub page: Option<PageSource>,
}
impl From<Option<ObjectRef>> for Name {
    fn from(object_id: Option<ObjectRef>) -> Self {
        Self {
            object_id,
            page: None,
        }
    }
}
pub(super) struct Coverage {
    after: Option<String>,
    end: Option<String>,
    excluded: BTreeSet<String>,
    revision: Vec<u8>,
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
            Self::Attr(v) => object_weight(v),
            Self::Metadata(v) => {
                object_weight(&v.object)
                    + v.mime_type.capacity()
                    + v.xattrs
                        .iter()
                        .map(|(k, v)| k.capacity() + v.capacity() + 128)
                        .sum::<usize>()
            }
            Self::Absent => 0,
            Self::Name(v) => {
                v.object_id.as_ref().map_or(0, ObjectRef::len)
                    + v.page.as_ref().map_or(0, |p| {
                        p.after.as_ref().map_or(0, String::capacity) + p.revision.capacity()
                    })
            }
            Self::Page(v) => {
                v.entries.capacity() * std::mem::size_of::<dfs_protocol::rpc::Entry>()
                    + v.entries.iter().map(|e| e.name.capacity()).sum::<usize>()
                    + v.next_after.as_ref().map_or(0, String::capacity)
                    + v.listing_token.capacity()
            }
            Self::Coverage(v) => {
                v.revision.capacity()
                    + v.after.as_ref().map_or(0, String::capacity)
                    + v.end.as_ref().map_or(0, String::capacity)
                    + v.excluded
                        .iter()
                        .map(|name| name.capacity() + 128)
                        .sum::<usize>()
            }
            Self::Block(v) => v.data.capacity() + 128,
            Self::Source { after, .. } => after.as_ref().map_or(0, String::capacity) + 64,
            Self::Stream { .. } | Self::Window(_) => 32,
        }) + 256
    }
}
pub(super) fn object_weight(v: &Attr) -> usize {
    std::mem::size_of_val(v) + 128
}

/// @cc [owner:spolu,label:performance;concurrency] charged-cache-lifetimes
/// Cache payload reservations MUST live until their last reader drops them, including after eviction.
/// Admission MUST evict clean entries or decline caching rather than exceed the shared memory budget.
/// Index storage MUST be bounded by live entries, without uncharged retained table capacity.
pub(super) struct Cache {
    values: BTreeMap<Key, (u64, Arc<Entry>)>,
    order: BTreeMap<u64, Key>,
    pages: BTreeMap<ObjectRef, BTreeSet<Option<String>>>,
    names: BTreeMap<ObjectRef, BTreeSet<String>>,
    sequence: u64,
    pub budget: Arc<Semaphore>,
    limit: usize,
    peak: usize,
}
impl Cache {
    pub fn new(budget: Arc<Semaphore>) -> Self {
        Self {
            limit: budget.available_permits(),
            peak: 0,
            values: BTreeMap::new(),
            order: BTreeMap::new(),
            pages: BTreeMap::new(),
            names: BTreeMap::new(),
            sequence: 0,
            budget,
        }
    }
    pub fn usage(&mut self) -> (usize, usize) {
        let used = self.limit - self.budget.available_permits();
        self.peak = self.peak.max(used);
        (used, self.peak)
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
    /// @cc [owner:spolu,label:performance;concurrency] cached-page-subranges
    /// Reuse MUST cover the requested cursor through the retained page's end, with its original
    /// token and expiry. A non-EOF boundary MUST NOT prove anything beyond that boundary. Shared
    /// ID cursors MUST use exact pages. Lookup MUST use ordered starts rather than scan all pages.
    pub fn page_start(&mut self, request: &ListRequest) -> Option<Option<String>> {
        let start = self
            .pages
            .get(&request.directory_id)?
            .range(..=request.after.clone())
            .next_back()?
            .clone();
        if start == request.after {
            return Some(start);
        }
        if request.directory_id == ObjectRef::Shared {
            return None;
        }
        let entry = self.get(&Key::Page(request.directory_id, start.clone()))?;
        let Value::Page(page) = &entry.value else {
            return None;
        };
        if page
            .next_after
            .as_ref()
            .is_none_or(|end| request.after.as_ref().is_some_and(|after| after < end))
        {
            Some(start)
        } else {
            None
        }
    }
    pub fn binding(&mut self, parent: &ObjectRef, name: &str) -> Option<Name> {
        let entry = self.get(&Key::Name(parent.into(), name.into()))?;
        let Value::Name(binding) = &entry.value else {
            return None;
        };
        if Instant::now() < entry.expires {
            return Some(binding.clone());
        }
        None
    }
    /// @cc [owner:spolu,label:concurrency;security] directory-absence-proof
    /// Absence MUST use a fresh or revision-validated name range, excluding listed/local names.
    /// Hits and local edits MUST NOT extend its original expiry. Shared ID cursors MUST NOT be used
    /// as name bounds. Replacing or evicting a proof MUST only cause a fallback to the server.
    pub fn absent(&mut self, parent: &ObjectRef, name: &str) -> bool {
        self.get(&Key::Coverage(parent.into())).is_some_and(|entry| {
            matches!(&entry.value, Value::Coverage(v) if v.covers(name) && !v.excluded.contains(name)
                && Instant::now() < entry.expires)
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
        if request.directory_id == ObjectRef::Shared {
            return;
        }
        let coverage = Coverage {
            revision: page.listing_token.clone(),
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
            Key::Coverage(request.directory_id),
            Value::Coverage(coverage),
            received,
            expires,
        );
    }
    pub fn exclude_name(&mut self, parent: &ObjectRef, name: &str) {
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
        match key {
            Key::Page(parent, after) => {
                if let Some(starts) = self.pages.get_mut(parent) {
                    starts.remove(after);
                    if starts.is_empty() {
                        self.pages.remove(parent);
                    }
                }
            }
            Key::Name(parent, name) => {
                if let Some(keys) = self.names.get_mut(parent) {
                    keys.remove(name);
                    if keys.is_empty() {
                        self.names.remove(parent);
                    }
                }
            }
            _ => (),
        }
    }
    pub fn invalidate_directory(&mut self, parent: &ObjectRef, names: bool) {
        if let Some(keys) = self.pages.remove(parent) {
            for after in keys {
                self.remove(&Key::Page(*parent, after));
            }
        }
        if names && let Some(keys) = self.names.remove(parent) {
            for name in keys {
                self.remove(&Key::Name(*parent, name));
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
                self.usage();
                return Some(permit);
            }
            if !self.evict() {
                return None;
            }
        }
    }
    pub fn insert(&mut self, key: Key, value: Value, received: Instant, expires: Instant) {
        self.insert_inner(key, value, received, expires, false);
    }
    pub fn insert_spare(&mut self, key: Key, value: Value, received: Instant, expires: Instant) {
        self.insert_inner(key, value, received, expires, true);
    }
    fn insert_inner(
        &mut self,
        key: Key,
        value: Value,
        received: Instant,
        expires: Instant,
        spare: bool,
    ) {
        if !spare {
            self.remove(&key);
        }
        let key_weight = match &key {
            Key::Attr(id)
            | Key::Coverage(id)
            | Key::Source(id)
            | Key::Stream(id)
            | Key::Window(id) => id.len(),
            Key::Name(id, name) => id.len() + name.capacity(),
            Key::Page(id, after) => id.len() + after.as_ref().map_or(0, String::capacity),
            Key::Metadata(id, revision) => id.len() + revision.len(),
            Key::Block(id, revision, _) => id.len() + revision.len() + 8,
        };
        // Include sparse B-tree nodes in all indexes, including one-name directory sets.
        let bytes = value.weight() + 3 * key_weight + 1024;
        let memory = if spare {
            // Speculation must leave at least one maximum demand response free and cannot evict.
            if self.budget.available_permits() < bytes + dfs_protocol::MAX_REPLY {
                return;
            }
            u32::try_from(bytes)
                .ok()
                .and_then(|bytes| self.budget.clone().try_acquire_many_owned(bytes).ok())
        } else {
            self.reserve(bytes)
        };
        let Some(memory) = memory else {
            return;
        };
        self.usage();
        if spare {
            self.remove(&key);
        }
        self.sequence += 1;
        match &key {
            Key::Page(parent, after) => {
                self.pages.entry(*parent).or_default().insert(after.clone());
            }
            Key::Name(parent, name) => {
                self.names.entry(*parent).or_default().insert(name.clone());
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
    fn spare_payload_capacity_and_evicted_readers_remain_charged() -> anyhow::Result<()> {
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(32768));
        let mut cache = Cache::new(budget.clone());
        let now = Instant::now();
        let directory = ObjectRef::new_v4();
        let page_key = Key::Page(directory, None);
        let page = Page {
            entries: Vec::with_capacity(1024),
            ..Default::default()
        };
        cache.insert(page_key.clone(), Value::Page(page), now, now);
        assert!(
            cache.get(&page_key).is_none(),
            "empty spare capacity exceeds budget"
        );
        let key = Key::Attr(directory);
        cache.insert(key.clone(), Value::Attr(Attr::default()), now, now);
        let reader = cache.get(&key).context("held reader")?;
        let available = budget.available_permits();
        cache.remove(&key);
        assert_eq!(budget.available_permits(), available);
        assert!(
            cache.reserve(32768).is_none(),
            "eviction cannot uncharge a live reader"
        );
        drop(reader);
        assert_eq!(budget.available_permits(), 32768);
        Ok(())
    }

    #[test]
    fn speculation_cannot_displace_demand_or_consume_its_reserve() -> anyhow::Result<()> {
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(dfs_protocol::MAX_REPLY + 4096));
        let mut cache = Cache::new(budget.clone());
        let now = Instant::now();
        let key = Key::Attr(ObjectRef::new_v4());
        cache.insert(key.clone(), Value::Attr(Attr::default()), now, now);
        let held = cache.reserve(4096).context("demand reservation")?;
        let available = budget.available_permits();
        cache.insert_spare(key.clone(), Value::Absent, now, now);
        assert!(matches!(
            &cache.get(&key).context("retained demand")?.value,
            Value::Attr(_)
        ));
        assert_eq!(budget.available_permits(), available);
        drop(held);
        cache.insert_spare(
            Key::Window(ObjectRef::new_v4()),
            Value::Window(16),
            now,
            now,
        );
        assert!(budget.available_permits() >= dfs_protocol::MAX_REPLY);
        Ok(())
    }

    #[test]
    fn parent_stat_never_renews_a_retained_listing_or_child_attributes() -> anyhow::Result<()> {
        let id_dir = ObjectRef::new_v4();
        let id_file = ObjectRef::new_v4();
        use anyhow::Context;
        let mut cache = Cache::new(Arc::new(Semaphore::new(65536)));
        let now = Instant::now();
        let expired = now - Duration::from_secs(1);
        let revision = vec![1; 16];
        let parent = Attr {
            id: id_dir,
            directory: true,
            revision: [1; 16].into(),
            ..Default::default()
        };
        cache.insert(
            Key::Attr(id_dir),
            Value::Attr(parent.clone()),
            now,
            now + Duration::from_secs(1),
        );
        let key = Key::Name(id_dir, "file".into());
        cache.insert(
            key.clone(),
            Value::Name(Name {
                object_id: Some(id_file),
                page: Some(PageSource {
                    after: None,
                    revision: revision.clone(),
                }),
            }),
            expired,
            expired,
        );
        cache.insert(
            Key::Attr(id_file),
            Value::Attr(Attr::default()),
            expired,
            expired,
        );
        let request = ListRequest {
            directory_id: id_dir,
            limit: 64,
            after: None,
        };
        cache.remember_coverage(
            &request,
            &Page {
                listing_token: revision.clone(),
                ..Default::default()
            },
            ["file"].into_iter(),
            expired,
            expired,
        );
        assert!(cache.binding(&id_dir, "file").is_none());
        assert!(!cache.absent(&id_dir, "missing"));
        assert!(cache.fresh(&Key::Attr(id_file)).is_none());
        assert_eq!(cache.get(&key).context("retained name")?.expires, expired);
        cache.insert(
            Key::Attr(id_dir),
            Value::Attr(Attr {
                revision: [2; 16].into(),
                ..parent
            }),
            now,
            now + Duration::from_secs(1),
        );
        assert!(cache.binding(&id_dir, "file").is_none());
        assert!(!cache.absent(&id_dir, "missing"));
        Ok(())
    }

    #[test]
    fn listing_absence_respects_range_boundaries_and_shared_cursors() {
        let id_dir = ObjectRef::new_v4();
        let mut cache = Cache::new(Arc::new(Semaphore::new(65536)));
        let now = Instant::now();
        let request = ListRequest {
            directory_id: id_dir,
            after: Some("b".into()),
            limit: 64,
        };
        let page = Page {
            listing_token: Vec::new(),
            entries: ["d", "h"]
                .map(|name| dfs_protocol::rpc::Entry {
                    name: name.into(),
                    object: None,
                })
                .to_vec(),
            next_after: Some("h".into()),
            view: Default::default(),
        };
        cache.remember_coverage(
            &request,
            &page,
            ["e"].into_iter(),
            now,
            now + Duration::from_secs(1),
        );
        for name in ["c", "f", "g"] {
            assert!(cache.absent(&id_dir, name));
        }
        for name in ["a", "b", "d", "e", "h", "i"] {
            assert!(!cache.absent(&id_dir, name));
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
        assert!(cache.absent(&id_dir, "z"));
        assert!(!cache.absent(&id_dir, "h"));
        assert!(!cache.absent(&id_dir, "a"));
        let shared = ListRequest {
            directory_id: ObjectRef::Shared,
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
        assert!(!cache.absent(&ObjectRef::Shared, "anything"));
    }

    #[test]
    fn local_edits_keep_absence_expiry_and_survive_name_eviction() -> anyhow::Result<()> {
        let id_dir = ObjectRef::new_v4();
        let id_id = ObjectRef::new_v4();
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(65536));
        let mut cache = Cache::new(budget.clone());
        let now = Instant::now();
        let expires = now + Duration::from_secs(1);
        let request = ListRequest {
            directory_id: id_dir,
            after: None,
            limit: 64,
        };
        cache.remember_coverage(&request, &Page::default(), std::iter::empty(), now, expires);
        assert!(cache.absent(&id_dir, "new"));
        let before = budget.available_permits();
        cache.exclude_name(&id_dir, "new");
        assert!(budget.available_permits() < before);
        cache.insert(
            Key::Name(id_dir, "new".into()),
            Value::Name(Some(id_id).into()),
            now,
            expires,
        );
        cache.invalidate_directory(&id_dir, true);
        assert!(!cache.absent(&id_dir, "new"));
        assert!(cache.absent(&id_dir, "other"));
        let key = Key::Coverage(id_dir);
        assert_eq!(cache.get(&key).context("coverage")?.expires, expires);
        cache.remove(&key);
        assert!(!cache.absent(&id_dir, "other"));
        assert_eq!(budget.available_permits(), 65536);
        cache.remember_coverage(&request, &Page::default(), std::iter::empty(), now, now);
        assert!(!cache.absent(&id_dir, "other"));
        Ok(())
    }

    #[test]
    fn exclusion_under_memory_pressure_discards_the_proof() -> anyhow::Result<()> {
        let id_dir = ObjectRef::new_v4();
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(4096));
        let mut cache = Cache::new(budget.clone());
        let now = Instant::now();
        let request = ListRequest {
            directory_id: id_dir,
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
        let reader = cache.get(&Key::Coverage(id_dir)).context("coverage")?;
        let reservation = cache
            .reserve(budget.available_permits())
            .context("reserve rest")?;
        cache.exclude_name(&id_dir, "new");
        assert!(!cache.absent(&id_dir, "new"));
        assert!(!cache.absent(&id_dir, "other"));
        drop(reader);
        drop(reservation);
        assert_eq!(budget.available_permits(), 4096);
        Ok(())
    }

    #[test]
    fn eviction_keeps_reader_memory_charged_and_hits_do_not_renew_expiry() -> anyhow::Result<()> {
        let id_id = ObjectRef::new_v4();
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(4096));
        let mut cache = Cache::new(budget.clone());
        let key = Key::Attr(id_id);
        let before = Instant::now();
        cache.insert(
            key.clone(),
            Value::Attr(Attr::default()),
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
        cache.insert(key.clone(), Value::Name(None.into()), before, before);
        assert!(cache.fresh(&key).is_none());
        Ok(())
    }

    #[tokio::test]
    async fn writes_displace_clean_blocks_then_wait_for_shared_capacity() -> anyhow::Result<()> {
        let id_file = ObjectRef::new_v4();
        use anyhow::Context;
        let budget = Arc::new(Semaphore::new(8192));
        let mut cache = Cache::new(budget.clone());
        let key = Key::Block(id_file, [1; 16].into(), 0);
        let now = Instant::now();
        cache.insert(
            key.clone(),
            Value::Block(super::super::content::Block::new(
                vec![0; 2048],
                None,
                false,
                Default::default(),
            )),
            now,
            now,
        );
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
