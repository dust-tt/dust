use crate::{
    State,
    keys::Keys,
    model::WorkspaceRecord,
    storage::{decode, failed},
};
use dfs_protocol::{
    error::status,
    rpc::{ErrorCode, Session},
    validate,
};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap},
    sync::{
        Arc, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use tokio::sync::{Mutex, OwnedMutexGuard, RwLock};
use tonic::{Request, Status};

const WORKSPACE_LOCK_PURGE_THRESHOLD: usize = 1024;

pub(crate) fn hash(value: &str) -> [u8; 32] {
    Sha256::digest(value.as_bytes()).into()
}
pub(crate) fn secret() -> Result<String, Status> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| status(ErrorCode::Internal))?;
    Ok(hex::encode(bytes))
}
pub(crate) fn bearer<T>(request: &Request<T>) -> Result<&str, Status> {
    request
        .metadata()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| v.len() == 64)
        .ok_or_else(|| status(ErrorCode::Unauthenticated))
}

pub(crate) struct SessionState {
    pub info: Session,
    pub grants: BTreeSet<String>,
    pub deadline: Instant,
    pub closed: AtomicBool,
    pub gate: RwLock<()>,
}
impl SessionState {
    pub fn active(&self) -> Result<(), Status> {
        if self.closed.load(Ordering::Acquire) || Instant::now() >= self.deadline {
            return Err(status(ErrorCode::Unauthenticated));
        }
        Ok(())
    }
}
#[derive(Default)]
pub(crate) struct Sessions {
    pub entries: Mutex<HashMap<[u8; 32], Arc<SessionState>>>,
}
impl Sessions {
    pub async fn create(
        &self,
        mut info: Session,
        grants: BTreeSet<String>,
    ) -> Result<Session, Status> {
        let key = secret()?;
        let mut entries = self.entries.lock().await;
        entries.retain(|_, s| s.active().is_ok());
        if entries.len() >= 10_000 {
            return Err(status(ErrorCode::Capacity));
        }
        let state = Arc::new(SessionState {
            info: info.clone(),
            grants,
            deadline: Instant::now() + Duration::from_secs(3600),
            closed: AtomicBool::new(false),
            gate: RwLock::new(()),
        });
        entries.insert(hash(&key), state);
        info.session_key = key;
        Ok(info)
    }
    pub async fn get<T>(&self, request: &Request<T>) -> Result<Arc<SessionState>, Status> {
        let state = self
            .entries
            .lock()
            .await
            .get(&hash(bearer(request)?))
            .cloned()
            .ok_or_else(|| status(ErrorCode::Unauthenticated))?;
        state.active()?;
        Ok(state)
    }
    /// Caller MUST hold the session write gate and finish its accepted publication before closing.
    pub async fn close<T>(&self, request: &Request<T>, state: &SessionState) -> Result<(), Status> {
        state.closed.store(true, Ordering::Release);
        self.entries.lock().await.remove(&hash(bearer(request)?));
        Ok(())
    }
}

/// @cc [owner:spolu,label:concurrency] topology-and-file-gates
/// Local pending edits, their publication, and reads combining them with FDB MUST hold the object's
/// gate from before the FDB snapshot through queue reconciliation. Multiple gates MUST be acquired in
/// sorted ID order. No workspace gate may span I/O; FDB transactions protect namespace and authority.
#[derive(Default)]
pub(crate) struct WorkspaceLocks {
    files: Mutex<HashMap<String, Weak<Mutex<()>>>>,
}
impl WorkspaceLocks {
    pub async fn acquire(&self, ids: &BTreeSet<String>) -> Vec<OwnedMutexGuard<()>> {
        let mut guards = Vec::with_capacity(ids.len());
        for id in ids {
            guards.push(self.file(id).await.lock_owned().await);
        }
        guards
    }
    pub async fn file(&self, id: &str) -> Arc<Mutex<()>> {
        let mut files = self.files.lock().await;
        if files.len() >= 1024 {
            files.retain(|_, v| v.strong_count() > 0);
        }
        if let Some(lock) = files.get(id).and_then(Weak::upgrade) {
            return lock;
        }
        let lock = Arc::new(Mutex::new(()));
        files.insert(id.into(), Arc::downgrade(&lock));
        lock
    }
}
impl State {
    pub(crate) fn server_authority<T>(&self, request: &Request<T>) -> Result<(), Status> {
        if bool::from(self.server_hash.ct_eq(&hash(bearer(request)?))) {
            Ok(())
        } else {
            Err(status(ErrorCode::Unauthenticated))
        }
    }
    pub(crate) async fn workspace_authority<T>(
        &self,
        request: &Request<T>,
        workspace: &str,
    ) -> Result<WorkspaceRecord, Status> {
        validate::workspace(workspace)?;
        let key = hash(bearer(request)?);
        let bytes = self
            .storage
            .get(Keys::new(workspace)?.workspace())
            .await
            .map_err(failed)?
            .ok_or_else(|| status(ErrorCode::Unauthenticated))?;
        let value: WorkspaceRecord = decode(&bytes)?;
        if !bool::from(key.ct_eq(&value.key_hash)) {
            return Err(status(ErrorCode::Unauthenticated));
        }
        Ok(value)
    }
    /// @cc [owner:spolu,label:concurrency;performance] workspace-gate-retention
    /// At 1024 registry entries, lookups MUST prune entries held only by the registry. Callers MUST
    /// retain the returned Arc while waiting for or holding object gates. Pruning MUST NOT
    /// replace a lock set still held by a caller.
    pub(crate) async fn locks(&self, workspace: &str) -> Arc<WorkspaceLocks> {
        let mut locks = self.locks.lock().await;
        if locks.len() >= WORKSPACE_LOCK_PURGE_THRESHOLD {
            locks.retain(|_, entry| Arc::strong_count(entry) > 1);
        }
        locks.entry(workspace.into()).or_default().clone()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::storage::{Storage, StorageConfig, WriteBatch};

    pub(crate) async fn workspace_lock_pruning_preserves_active_gates_and_bounds_idle_entries()
    -> anyhow::Result<()> {
        let storage = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-locks-{}", uuid::Uuid::new_v4().simple()),
        })
        .await?;
        let state = State::new_durable(storage, &"ab".repeat(32))?;
        let active = state.locks("active").await;
        let file_lock = active.file("file").await;
        let guard = file_lock.lock().await;
        let idle = Arc::downgrade(&state.locks("idle").await);
        assert!(idle.upgrade().is_some());

        let waiting = state.locks("active").await;
        let waiting_file = waiting.file("file").await;
        let mut waiter = std::pin::pin!(waiting_file.lock());
        assert!(futures::poll!(&mut waiter).is_pending());

        for index in 0..2 * WORKSPACE_LOCK_PURGE_THRESHOLD {
            drop(state.locks(&format!("workspace-{index}")).await);
            assert!(state.locks.lock().await.len() <= WORKSPACE_LOCK_PURGE_THRESHOLD);
        }

        assert!(idle.upgrade().is_none());
        let retained = state.locks("active").await;
        assert!(Arc::ptr_eq(&active, &retained));
        assert!(retained.file("file").await.try_lock().is_err());
        assert!(Arc::ptr_eq(&file_lock, &retained.file("file").await));
        drop(guard);
        drop(waiter.await);
        state
            .storage
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }
}
