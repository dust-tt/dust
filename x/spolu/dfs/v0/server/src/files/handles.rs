use super::Files;
use crate::{
    api::{ApiError, Session},
    model::{HandleId, ObjectId, RequestId},
    namespace::NamespaceRead,
    storage::Storage,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::sync::Mutex as AsyncMutex;

const MAX_HANDLES: usize = 4096;
const MAX_SESSION_HANDLES: usize = 256;

#[derive(Clone, Copy)]
pub(crate) struct HandleMode {
    pub read: bool,
    pub write: bool,
    pub append: bool,
}

pub(crate) struct Handle {
    pub id: HandleId,
    pub session: Arc<Session>,
    pub object_id: ObjectId,
    pub mode: HandleMode,
    pub progress: AsyncMutex<Progress>,
}

#[derive(Default)]
pub(crate) struct Progress {
    pub closed: bool,
    pub sequence: u64,
    pub request_id: Option<RequestId>,
    pub failure: Option<ApiError>,
}

impl Progress {
    pub fn begin(&mut self, sequence: u64, request_id: RequestId) -> Result<(), ApiError> {
        if self.closed {
            return Err(ApiError::NotFound);
        }
        let retry = sequence == self.sequence && self.request_id == Some(request_id);
        let next = self.failure.is_none() && self.sequence.checked_add(1) == Some(sequence);
        if sequence == 0 || !(retry || next) {
            return Err(ApiError::Conflict);
        }
        self.sequence = sequence;
        self.request_id = Some(request_id);
        // Cancellation remains an unresolved failure until this request is safely retried.
        self.failure = Some(ApiError::Unavailable);
        Ok(())
    }
}

#[derive(Default)]
pub(super) struct Handles(Mutex<HashMap<HandleId, Arc<Handle>>>);

impl Files {
    /**
     * @cc [owner:spolu,label:security;performance] bounded-session-handles
     * Handles MUST belong to one session and stable object, with fixed read/write/append flags.
     * Bound handles globally and per session, and reclaim expired/closed-session entries on access.
     * A handle MUST NOT retain grants as authority: content operations reauthorize the current
     * object.
     * Opening MUST NOT lock the object's writer for the handle lifetime or allocate a scratch file.
     */
    pub async fn open(
        &self,
        storage: &Storage,
        session: Arc<Session>,
        object_id: ObjectId,
        mode: HandleMode,
    ) -> Result<Arc<Handle>, ApiError> {
        session.check_active()?;
        if !(mode.read || mode.write) || (mode.append && !mode.write) {
            return Err(ApiError::InvalidInput);
        }
        let object = NamespaceRead::new(storage, &session.workspace, &session.grants)
            .await?
            .stat(object_id)
            .await?;
        if !matches!(object.kind, crate::model::ObjectKind::File(_)) {
            return Err(ApiError::IsDirectory);
        }
        session.check_active()?;
        let mut handles = self.handles.0.lock().map_err(|_| ApiError::Unavailable)?;
        handles.retain(|_, handle| handle.session.check_active().is_ok());
        if handles.len() >= MAX_HANDLES
            || handles
                .values()
                .filter(|h| h.session.id == session.id)
                .count()
                >= MAX_SESSION_HANDLES
        {
            return Err(ApiError::CapacityExhausted);
        }
        let handle = Arc::new(Handle {
            id: HandleId::generate(),
            session,
            object_id,
            mode,
            progress: AsyncMutex::new(Progress::default()),
        });
        if handles.contains_key(&handle.id) {
            return Err(ApiError::Conflict);
        }
        handles.insert(handle.id, handle.clone());
        Ok(handle)
    }

    pub fn handle(&self, session: &Session, id: HandleId) -> Result<Arc<Handle>, ApiError> {
        session.check_active()?;
        let mut handles = self.handles.0.lock().map_err(|_| ApiError::Unavailable)?;
        handles.retain(|_, handle| handle.session.check_active().is_ok());
        let handle = handles.get(&id).ok_or(ApiError::NotFound)?;
        if handle.session.id != session.id {
            return Err(ApiError::NotFound);
        }
        Ok(handle.clone())
    }

    pub async fn close(&self, handle: &Handle) -> Result<(), ApiError> {
        handle.session.check_active()?;
        let mut progress = handle.progress.lock().await;
        progress.closed = true;
        self.handles
            .0
            .lock()
            .map_err(|_| ApiError::Unavailable)?
            .remove(&handle.id);
        Ok(())
    }

    /**
     * @cc [owner:spolu,label:backend] explicit-handle-barrier
     * Fsync MUST wait behind admitted handle mutations and reject unseen sequence numbers or an
     * unresolved failed/cancelled mutation. Reauthorize after waiting. Successful fsync MUST wait
     * for
     * server visibility in cached mode or the visible SlateDB prefix in synchronous mode.
     * Unpublished
     * upload receipts and client buffers alone never satisfy the barrier.
     */
    pub async fn fsync(
        &self,
        storage: &Storage,
        handle: &Handle,
        through_sequence: u64,
    ) -> Result<(), ApiError> {
        let progress = handle.progress.lock().await;
        handle.session.check_active()?;
        if progress.closed {
            return Err(ApiError::NotFound);
        }
        NamespaceRead::new(storage, &handle.session.workspace, &handle.session.grants)
            .await?
            .stat(handle.object_id)
            .await?;
        if through_sequence > progress.sequence {
            return Err(ApiError::Conflict);
        }
        if let Some(error) = progress.failure {
            return Err(error);
        }
        storage
            .workspace(&handle.session.workspace)
            .map_err(|_| ApiError::Unavailable)?
            .acknowledge()
            .await
            .map_err(|_| ApiError::Unavailable)
    }
}
