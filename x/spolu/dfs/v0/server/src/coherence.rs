//! Ephemeral workspace revisions for client cache freshness checks.
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use dfs_protocol::wire::{CacheCheckRequest, CacheCheckResponse};
use tokio::sync::Notify;

use crate::{api::ApiError, model::WorkspaceId};

const FRESH_MS: u64 = 1000;
type Registry = Mutex<HashMap<WorkspaceId, Weak<Scope>>>;

#[derive(Default)]
pub(crate) struct Scopes(Arc<Registry>);

impl Scopes {
    pub fn get(&self, workspace: &WorkspaceId) -> Result<Arc<Scope>, ApiError> {
        let mut registry = self.0.lock().map_err(|_| ApiError::Unavailable)?;
        if let Some(scope) = registry.get(workspace).and_then(Weak::upgrade) {
            return Ok(scope);
        }
        let scope = Arc::new(Scope {
            workspace: workspace.clone(),
            registry: Arc::downgrade(&self.0),
            revision: AtomicU64::new(1),
            changed: Notify::new(),
        });
        registry.insert(workspace.clone(), Arc::downgrade(&scope));
        Ok(scope)
    }

    pub fn changed(&self, workspace: &WorkspaceId) -> Result<(), ApiError> {
        let scope = self
            .0
            .lock()
            .map_err(|_| ApiError::Unavailable)?
            .get(workspace)
            .and_then(Weak::upgrade);
        if let Some(scope) = scope {
            scope
                .revision
                .fetch_update(Ordering::AcqRel, Ordering::Acquire, |revision| {
                    revision.checked_add(1)
                })
                .map_err(|_| ApiError::CapacityExhausted)?;
            scope.wake();
        }
        Ok(())
    }
}

/// @cc [owner:spolu,label:security;concurrency] bounded-cache-freshness
/// Publication MUST advance the workspace revision without waiting for clients. Freshness checks
/// MUST authenticate the session and limit cached authorization to one second or session expiry,
/// whichever comes first. Revisions and notifications MUST remain scoped to their workspace.
pub(crate) struct Scope {
    workspace: WorkspaceId,
    registry: Weak<Registry>,
    revision: AtomicU64,
    changed: Notify,
}

impl Drop for Scope {
    fn drop(&mut self) {
        if let Some(registry) = self.registry.upgrade()
            && let Ok(mut scopes) = registry.lock()
            && scopes
                .get(&self.workspace)
                .is_some_and(|scope| scope.strong_count() == 0)
        {
            scopes.remove(&self.workspace);
        }
    }
}

impl Scope {
    pub fn revision(&self) -> Result<u64, ApiError> {
        Ok(self.revision.load(Ordering::Acquire))
    }

    pub fn wake(&self) {
        self.changed.notify_waiters();
    }

    pub async fn poll(
        &self,
        session: &crate::api::Session,
        request: CacheCheckRequest,
    ) -> Result<CacheCheckResponse, ApiError> {
        session.check_active()?;
        let notified = self.changed.notified();
        let revision = self.revision()?;
        if request.revision.is_some_and(|observed| observed > revision) {
            return Err(ApiError::InvalidInput);
        }
        if request.revision == Some(revision) {
            tokio::select! {
                _ = notified => {}
                _ = tokio::time::sleep(Duration::from_millis(250)) => {}
            }
        }
        session.check_active()?;
        Ok(CacheCheckResponse {
            revision: self.revision()?,
            fresh_for_ms: u64::try_from(session.cache_lifetime().as_millis())
                .unwrap_or(FRESH_MS)
                .min(FRESH_MS),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use futures::FutureExt;

    #[tokio::test(start_paused = true)]
    async fn publication_wakes_checks_without_waiting_for_clients() -> Result<()> {
        let scopes = Scopes::default();
        let workspace = WorkspaceId::new("w")?;
        let scope = scopes.get(&workspace)?;
        let other = scopes.get(&WorkspaceId::new("other")?)?;
        let access = crate::api::Access::new(None)?;
        let (session, _) = access
            .create_session(workspace.clone(), Default::default(), scope.clone())
            .await?;
        let response = scope.poll(&session, CacheCheckRequest::default()).await?;
        assert_eq!(response.fresh_for_ms, FRESH_MS);
        let mut check = Box::pin(scope.poll(
            &session,
            CacheCheckRequest {
                revision: Some(response.revision),
            },
        ));
        assert!(check.as_mut().now_or_never().is_none());
        scopes.changed(&workspace)?;
        assert_eq!(check.await?.revision, response.revision + 1);
        assert_eq!(other.revision()?, 1);
        scopes.changed(&workspace)?;
        scopes.changed(&workspace)?;
        assert_eq!(scope.revision()?, response.revision + 3);
        tokio::time::advance(Duration::from_secs(3600)).await;
        assert!(matches!(
            scope.poll(&session, CacheCheckRequest::default()).await,
            Err(ApiError::Unauthenticated)
        ));
        Ok(())
    }
}
