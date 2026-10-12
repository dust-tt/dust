use std::{
    collections::HashSet,
    num::NonZeroUsize,
    sync::{Arc, OnceLock},
};

use dfs_protocol::ObjectId;
use lru::LruCache;
use tokio::sync::Mutex;

const TREE_HINTS_MAX_ENTRIES: usize = 100_000;
static TREE_HINTS: OnceLock<Arc<TreeHints>> = OnceLock::new();

#[cfg(test)]
#[path = "../../../../tests/resources/object/hints.rs"]
mod tests;

type Key = (String, ObjectId);

// TODO(spolu): Hints only avoid sequential parent discovery; each mode check still reads all grants
// along the ancestry. Explore a dirty index to invalidate cached objects across servers when their
// grants or parents change, without maintaining a full in-memory tree.

/**
 * @cc [owner:spolu,label:security] tree-hints-are-advisory
 * Hints MUST be tenant-scoped parent links used only to schedule reads. They MUST NOT authorize
 * access or replace transaction reads. No hint guard may be held during an FDB read.
 */
/**
 * @cc [owner:spolu,label:performance] tree-hints-capacity
 * Hints MUST retain at most the configured number of entries, evicting the least recently used
 * entry when full. Reads and updates MUST refresh recency. Entries MUST NOT expire with time.
 * A zero capacity MUST retain no entries.
 */
pub struct TreeHints {
    parents: Mutex<Option<LruCache<Key, Option<ObjectId>>>>,
}

impl TreeHints {
    pub(crate) fn shared() -> Arc<Self> {
        Arc::clone(TREE_HINTS.get_or_init(|| Arc::new(Self::new(TREE_HINTS_MAX_ENTRIES))))
    }

    /// A zero capacity disables hints.
    pub fn new(capacity_entries: usize) -> Self {
        Self {
            parents: Mutex::new(NonZeroUsize::new(capacity_entries).map(LruCache::sparse)),
        }
    }

    pub(super) async fn predict(
        &self,
        tenant_id: &str,
        object_ids: &[ObjectId],
    ) -> HashSet<ObjectId> {
        let mut cache = self.parents.lock().await;
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
                next = cache.get(&(tenant_id.to_owned(), id)).copied().flatten();
            }
        }
        predicted
    }

    pub(super) async fn remember(
        &self,
        tenant_id: &str,
        parents: impl IntoIterator<Item = (ObjectId, Option<ObjectId>)>,
        missing: impl IntoIterator<Item = ObjectId>,
    ) {
        let mut cache = self.parents.lock().await;
        let Some(cache) = cache.as_mut() else {
            return;
        };
        for id in missing {
            cache.pop(&(tenant_id.to_owned(), id));
        }
        for (id, parent_id) in parents {
            cache.put((tenant_id.to_owned(), id), parent_id);
        }
    }
}
