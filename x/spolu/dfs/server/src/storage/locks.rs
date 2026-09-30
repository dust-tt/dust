use std::{
    collections::HashMap,
    sync::{Arc, Mutex as RegistryMutex, Weak},
};

use anyhow::{Result, anyhow};
use tokio::sync::{Mutex, OwnedMutexGuard};

use super::WorkspaceStorage;
use crate::model::{ObjectId, WorkspaceId};

type LockKey = (WorkspaceId, [u8; 16]);
type Registry = RegistryMutex<HashMap<LockKey, Weak<LockEntry>>>;

#[derive(Default)]
pub(super) struct ObjectLockTable {
    registry: Arc<Registry>,
}

struct LockEntry {
    key: LockKey,
    registry: Weak<Registry>,
    mutex: Arc<Mutex<()>>,
}

impl Drop for LockEntry {
    fn drop(&mut self) {
        if let Some(registry) = self.registry.upgrade()
            && let Ok(mut entries) = registry.lock()
            && entries
                .get(&self.key)
                .is_some_and(|entry| entry.strong_count() == 0)
        {
            // A new live entry may have replaced this one while its destructor waited.
            entries.remove(&self.key);
        }
    }
}

/**
 * @cc [owner:spolu,label:concurrency] scoped-object-locks
 * Acquire each workspace/object lock once, in ascending ID order, outside publication. Hold no
 * registry mutex across an await. Never add locks to an acquired set: release and rediscover it.
 * Cancellation MUST release partially acquired sets. Remove registry entries when their last
 * holder/waiter disappears; cleanup MUST NOT remove a newer live entry for the same key.
 */
pub(crate) struct ObjectLocks {
    // Drop guards before entries so registry cleanup follows release of the mutexes.
    guards: Vec<OwnedMutexGuard<()>>,
    entries: Vec<Arc<LockEntry>>,
}

impl ObjectLockTable {
    async fn acquire(&self, workspace: &WorkspaceId, ids: &[ObjectId]) -> Result<ObjectLocks> {
        let ids: std::collections::BTreeSet<_> = ids.iter().map(|id| *id.as_bytes()).collect();
        let entries = {
            let mut registry = self
                .registry
                .lock()
                .map_err(|_| anyhow!("object lock registry poisoned"))?;
            ids.into_iter()
                .map(|id| {
                    let key = (workspace.clone(), id);
                    if let Some(entry) = registry.get(&key).and_then(Weak::upgrade) {
                        entry
                    } else {
                        let entry = Arc::new(LockEntry {
                            key: key.clone(),
                            registry: Arc::downgrade(&self.registry),
                            mutex: Arc::new(Mutex::new(())),
                        });
                        registry.insert(key, Arc::downgrade(&entry));
                        entry
                    }
                })
                .collect()
        };
        let mut locks = ObjectLocks {
            guards: Vec::new(),
            entries,
        };
        for entry in &locks.entries {
            locks.guards.push(entry.mutex.clone().lock_owned().await);
        }
        Ok(locks)
    }
}

impl WorkspaceStorage<'_> {
    pub(crate) async fn lock_objects(&self, ids: &[ObjectId]) -> Result<ObjectLocks> {
        self.storage
            .object_locks
            .acquire(&self.keys.workspace, ids)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::ensure;

    #[tokio::test]
    async fn locks_are_ordered_scoped_and_reclaimed_after_cancellation() -> Result<()> {
        let table = ObjectLockTable::default();
        let workspace = WorkspaceId::new("w")?;
        let other = WorkspaceId::new("other")?;
        let a = ObjectId::from_bytes([1; 16]);
        let b = ObjectId::from_bytes([2; 16]);
        let held = table.acquire(&workspace, &[b]).await?;
        let ids = [b, a, a];
        let mut waiting = Box::pin(table.acquire(&workspace, &ids));
        ensure!(futures::poll!(waiting.as_mut()).is_pending());
        let a_ids = [a];
        let mut behind_a = Box::pin(table.acquire(&workspace, &a_ids));
        // The reverse-ordered request must already hold A while waiting for B.
        ensure!(futures::poll!(behind_a.as_mut()).is_pending());
        let foreign = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            table.acquire(&other, &[a, b]),
        )
        .await??;
        drop(foreign);
        drop(waiting);
        let a_guard = tokio::time::timeout(std::time::Duration::from_secs(5), behind_a).await??;
        drop(a_guard);
        drop(held);
        ensure!(
            table
                .registry
                .lock()
                .map_err(|_| anyhow!("registry poisoned"))?
                .is_empty()
        );
        // Duplicate IDs must not make a request wait on itself, and release removes every entry.
        let duplicate = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            table.acquire(&workspace, &ids),
        )
        .await??;
        drop(duplicate);
        ensure!(
            table
                .registry
                .lock()
                .map_err(|_| anyhow!("registry poisoned"))?
                .is_empty()
        );
        Ok(())
    }
}
