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
use tokio::sync::{Mutex, RwLock};
use tonic::{Request, Status};

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
    pub async fn close<T>(&self, request: &Request<T>) -> Result<(), Status> {
        let state = self.get(request).await?;
        let _guard = state.gate.write().await;
        state.closed.store(true, Ordering::Release);
        self.entries.lock().await.remove(&hash(bearer(request)?));
        Ok(())
    }
}

/// @cc [owner:spolu,label:concurrency] topology-and-file-gates
/// Namespace and grant mutations MUST hold the topology write gate through publication. File edits
/// MUST hold its read gate and their object's exclusive gate. Independent file edits may overlap.
#[derive(Default)]
pub(crate) struct WorkspaceLocks {
    pub topology: RwLock<()>,
    files: Mutex<HashMap<String, Weak<Mutex<()>>>>,
}
impl WorkspaceLocks {
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
            .db
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
    pub(crate) async fn locks(&self, workspace: &str) -> Arc<WorkspaceLocks> {
        self.locks
            .lock()
            .await
            .entry(workspace.into())
            .or_default()
            .clone()
    }
}
