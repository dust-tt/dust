use std::{
    collections::{HashMap, HashSet},
    num::NonZeroUsize,
    sync::{Arc, OnceLock},
};

use dfs_protocol::{ObjectId, rpc::Grant};
use lru::LruCache;
use tokio::sync::Mutex;

const TREE_HINTS_MAX_ENTRIES: usize = 100_000;
static TREE_HINTS: OnceLock<Arc<TreeHints>> = OnceLock::new();

#[cfg(test)]
#[path = "../../../../tests/resources/object/hints.rs"]
mod tests;

type Key = (String, ObjectId);

pub(super) struct Hint {
    pub parent_id: Option<ObjectId>,
    pub grants_version: u64,
    pub grants: Arc<[Grant]>,
}

/**
 * @cc [owner:spolu,label:security] tree-hints-are-advisory
 * Parent hints MUST be tenant-scoped and only schedule reads; every object and actual ancestor
 * MUST still be read in the caller's transaction. Cached grants MUST contain the complete grant
 * set, independent of session subjects, and may be reused only when the freshly read grants_version
 * matches. Staged nonempty grants MUST NOT enter the cache; new objects MAY cache their empty
 * grant set. No hint guard may be held during an FDB read.
 */
/**
 * @cc [owner:spolu,label:performance] tree-hints-capacity
 * Hints MUST retain at most the configured number of entries, evicting the least recently used
 * entry when full. Reads and updates MUST refresh recency. Entries MUST NOT expire with time.
 * A zero capacity MUST retain no entries.
 */
pub struct TreeHints {
    entries: Mutex<Option<LruCache<Key, Hint>>>,
}

impl TreeHints {
    pub(crate) fn shared() -> Arc<Self> {
        Arc::clone(TREE_HINTS.get_or_init(|| Arc::new(Self::new(TREE_HINTS_MAX_ENTRIES))))
    }

    /// A zero capacity disables hints.
    pub fn new(capacity_entries: usize) -> Self {
        Self {
            entries: Mutex::new(NonZeroUsize::new(capacity_entries).map(LruCache::sparse)),
        }
    }

    pub(super) async fn predict(
        &self,
        tenant_id: &str,
        object_ids: &[ObjectId],
    ) -> HashSet<ObjectId> {
        let mut cache = self.entries.lock().await;
        let Some(cache) = cache.as_mut() else {
            return object_ids.iter().copied().collect();
        };
        let mut predicted = HashSet::new();
        for &object_id in object_ids {
            let mut next = Some(object_id);
            while let Some(id) = next {
                // Hints from different transactions can contain cycles or share ancestors.
                if !predicted.insert(id) {
                    break;
                }
                next = cache
                    .get(&(tenant_id.to_owned(), id))
                    .and_then(|hint| hint.parent_id);
            }
        }
        predicted
    }

    pub(super) async fn cached_grants(
        &self,
        tenant_id: &str,
        versions: impl IntoIterator<Item = (ObjectId, u64)>,
    ) -> HashMap<ObjectId, Arc<[Grant]>> {
        let mut cache = self.entries.lock().await;
        let Some(cache) = cache.as_mut() else {
            return HashMap::new();
        };
        versions
            .into_iter()
            .filter_map(|(id, version)| {
                let hint = cache.get(&(tenant_id.to_owned(), id))?;
                (hint.grants_version == version).then(|| (id, Arc::clone(&hint.grants)))
            })
            .collect()
    }

    pub(super) async fn remember(
        &self,
        tenant_id: &str,
        hints: impl IntoIterator<Item = (ObjectId, Hint)>,
        missing: impl IntoIterator<Item = ObjectId>,
    ) {
        let mut cache = self.entries.lock().await;
        let Some(cache) = cache.as_mut() else {
            return;
        };
        for id in missing {
            cache.pop(&(tenant_id.to_owned(), id));
        }
        for (id, hint) in hints {
            cache.put((tenant_id.to_owned(), id), hint);
        }
    }
}
