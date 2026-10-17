use std::{
    collections::{HashMap, HashSet},
    num::NonZeroUsize,
    sync::{Arc, OnceLock},
};

use dfs_protocol::{
    ObjectId,
    rpc::{Grant, ObjectKind},
};
use foundationdb::{FdbBindingError, Transaction};
use futures::{StreamExt, TryStreamExt, stream};
use lru::LruCache;
use tokio::sync::Mutex;

use super::{Error, ObjectResource};
use crate::storage::{
    self,
    resources::{CONCURRENT_READS, tenant::TenantResource},
};

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

    /**
     * @cc [owner:spolu,label:backend;security] tree-hints-fetch-ancestry
     * The result MUST contain each existing requested object and its actual ancestors through the
     * tenant root, keyed by ID and without metadata. Missing requested objects MUST be omitted.
     * Every returned object MUST be read in the caller's transaction with conflict tracking;
     * hints MUST only schedule reads. Changed parents MUST be followed, and obsolete hinted
     * records MUST NOT be decoded or returned. Missing, non-directory, or cyclic ancestry MUST
     * fail with InvalidAncestry. Invalid requested IDs MUST fail with InvalidId.
     */
    /**
     * @cc [owner:spolu,label:backend;performance] tree-hints-ancestry-cache
     * Ancestry reads MUST NOT read grants or add, replace, or remove cache entries. Reading hints
     * MUST still refresh LRU recency. Cache entries MUST retain complete grants and their version;
     * only modes_for_session populates them after evaluating permissions.
     */
    pub async fn fetch_ancestry(
        &self,
        tx: &Transaction,
        tenant: &TenantResource,
        object_ids: &[ObjectId],
    ) -> Result<HashMap<ObjectId, ObjectResource>, storage::Error<Error>> {
        for id in object_ids {
            id.validate().map_err(|_| Error::InvalidId)?;
        }
        let mut pending = object_ids.to_vec();
        let mut prefetched = HashMap::new();
        let mut objects = HashMap::new();
        let mut missing = HashSet::new();

        while !pending.is_empty() {
            let predicted = self.predict(&tenant.tenant_id, &pending).await;
            let reads = stream::iter(predicted.into_iter().filter(|id| {
                !prefetched.contains_key(id) && !objects.contains_key(id) && !missing.contains(id)
            }))
            .map(|id| async move {
                let value = tx
                    .get(&ObjectResource::object_key(&tenant.tenant_id, &id), false)
                    .await
                    .map_err(FdbBindingError::from)?;
                Ok::<_, storage::Error<Error>>((id, value))
            })
            .buffer_unordered(CONCURRENT_READS)
            .try_collect::<Vec<_>>()
            .await?;
            prefetched.extend(reads);

            let mut next = HashSet::new();
            while let Some(id) = pending.pop() {
                if objects.contains_key(&id) || missing.contains(&id) {
                    continue;
                }
                let Some(value) = prefetched.remove(&id) else {
                    next.insert(id);
                    continue;
                };
                let Some(value) = value else {
                    missing.insert(id);
                    continue;
                };
                // Decode only actual ancestors; obsolete hints may point to unrelated records.
                let object = ObjectResource::from_value(tenant, &id, &value)?;
                if let Some(parent_id) = object.parent_id {
                    pending.push(parent_id);
                }
                objects.insert(id, object);
            }
            pending.extend(next);
        }

        // Validate every path once, sharing the validated suffixes of overlapping paths.
        let mut validated = HashSet::new();
        for id in object_ids {
            if !objects.contains_key(id) {
                continue;
            }
            let mut path = HashSet::new();
            let mut current = *id;
            while !validated.contains(&current) {
                if !path.insert(current) {
                    return Err(Error::InvalidAncestry.into());
                }
                let object = objects.get(&current).ok_or(Error::InvalidAncestry)?;
                if current == tenant.root_id {
                    if object.parent_id.is_some() || object.kind != ObjectKind::Directory {
                        return Err(Error::InvalidAncestry.into());
                    }
                    break;
                }
                let parent_id = object.parent_id.ok_or(Error::InvalidAncestry)?;
                let parent = objects.get(&parent_id).ok_or(Error::InvalidAncestry)?;
                if parent.kind != ObjectKind::Directory {
                    return Err(Error::InvalidAncestry.into());
                }
                current = parent_id;
            }
            validated.extend(path);
        }
        Ok(objects)
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
