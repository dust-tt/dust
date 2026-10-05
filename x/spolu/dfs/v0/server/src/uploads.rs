//! Session-bound upload preparation; namespace publication is a separate operation.
use std::{collections::HashMap, sync::Mutex, time::Duration};

use tokio::time::Instant;

use crate::{
    api::ApiError,
    model::{ContentVersionId, EntryName, ObjectId, ObjectKind, WorkspaceId},
    namespace::NamespaceRead,
    storage::{Storage, UploadedBlob},
};

pub(crate) const UPLOAD_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_UPLOADS: usize = 1024;

#[derive(Clone)]
pub(crate) enum UploadTarget {
    Create {
        parent_id: ObjectId,
        name: EntryName,
    },
    Replace {
        object_id: ObjectId,
        expected_content_version: ContentVersionId,
    },
}

impl UploadTarget {
    pub async fn authorize(&self, view: &NamespaceRead<'_>) -> Result<(), ApiError> {
        match self {
            Self::Create { parent_id, name } => {
                match view.lookup(*parent_id, name).await {
                    Ok(_) => Err(ApiError::AlreadyExists),
                    // Lookup authorizes the parent first; distinguish missing entries from denied parents.
                    Err(ApiError::NotFound) => {
                        let parent = view.stat(*parent_id).await?;
                        if parent.kind != ObjectKind::Directory {
                            return Err(ApiError::NotDirectory);
                        }
                        Ok(())
                    }
                    Err(error) => Err(error),
                }
            }
            Self::Replace {
                object_id,
                expected_content_version,
            } => {
                let object = view.stat(*object_id).await?;
                let ObjectKind::File(content) = object.kind else {
                    return Err(ApiError::IsDirectory);
                };
                if content.version != *expected_content_version {
                    return Err(ApiError::Conflict);
                }
                Ok(())
            }
        }
    }
}

#[derive(Clone)]
pub(crate) struct Upload {
    pub target: UploadTarget,
    pub object_id: ObjectId,
    pub version: ContentVersionId,
    pub deadline: Instant,
    pub completed: Option<UploadedBlob>,
    session_id: String,
    workspace: WorkspaceId,
    busy: bool,
}

/**
 * @cc [owner:spolu,label:security] session-upload-receipts
 * Upload reservations and completed descriptors MUST be bounded, expire, and belong to one session
 * and workspace. IDs MUST be server-generated. A receipt MUST NOT confer object access or publish a
 * file. Reauthorize at transfer start and completion; publication MUST independently reauthorize and
 * check the target and expected content version. Dropped or failed transfers MUST release their
 * reservation. Expiry/restart may discard receipts, never delete possibly referenced immutable blobs.
 */
#[derive(Default)]
pub(crate) struct Uploads(Mutex<HashMap<ContentVersionId, Upload>>);

impl Uploads {
    pub fn create(
        &self,
        session_id: &str,
        workspace: &WorkspaceId,
        target: UploadTarget,
    ) -> Result<Upload, ApiError> {
        let object_id = match &target {
            UploadTarget::Create { .. } => ObjectId::generate(),
            UploadTarget::Replace { object_id, .. } => *object_id,
        };
        let upload = Upload {
            target,
            object_id,
            version: ContentVersionId::generate(),
            deadline: Instant::now() + UPLOAD_TTL,
            completed: None,
            session_id: session_id.to_owned(),
            workspace: workspace.clone(),
            busy: false,
        };
        let mut uploads = self.0.lock().map_err(|_| ApiError::Unavailable)?;
        uploads.retain(|_, entry| entry.deadline > Instant::now());
        if uploads.len() >= MAX_UPLOADS {
            return Err(ApiError::CapacityExhausted);
        }
        if uploads.contains_key(&upload.version) {
            return Err(ApiError::Conflict);
        }
        uploads.insert(upload.version, upload.clone());
        Ok(upload)
    }

    pub fn get(
        &self,
        session_id: &str,
        workspace: &WorkspaceId,
        id: ContentVersionId,
    ) -> Result<Upload, ApiError> {
        let mut uploads = self.0.lock().map_err(|_| ApiError::Unavailable)?;
        uploads.retain(|_, entry| entry.deadline > Instant::now());
        let upload = uploads.get(&id).ok_or(ApiError::NotFound)?;
        if upload.session_id != session_id || upload.workspace != *workspace {
            return Err(ApiError::NotFound);
        }
        Ok(upload.clone())
    }

    pub fn claim(
        &self,
        session_id: &str,
        workspace: &WorkspaceId,
        id: ContentVersionId,
    ) -> Result<UploadLease<'_>, ApiError> {
        let upload = self.get(session_id, workspace, id)?;
        let mut uploads = self.0.lock().map_err(|_| ApiError::Unavailable)?;
        let entry = uploads.get_mut(&id).ok_or(ApiError::NotFound)?;
        if entry.busy || entry.completed.is_some() {
            return Err(ApiError::Conflict);
        }
        entry.busy = true;
        Ok(UploadLease {
            registry: self,
            upload,
            finished: false,
        })
    }

    /**
     * @cc [owner:spolu,label:backend;performance] release-published-upload
     * Call only after confirming durable publication or its authorized replay for this workspace/ID.
     * Release the reservation immediately without deleting the blob or persistent retry receipt.
     * Missing reservations are a no-op; never remove a reservation from another workspace.
     */
    pub fn release_published(
        &self,
        workspace: &WorkspaceId,
        id: ContentVersionId,
    ) -> Result<(), ApiError> {
        let mut uploads = self.0.lock().map_err(|_| ApiError::Unavailable)?;
        if uploads
            .get(&id)
            .is_some_and(|upload| upload.workspace == *workspace)
        {
            uploads.remove(&id);
        }
        Ok(())
    }
}

pub(crate) struct UploadLease<'a> {
    registry: &'a Uploads,
    pub upload: Upload,
    finished: bool,
}

impl UploadLease<'_> {
    pub fn finish(mut self, blob: UploadedBlob) -> Result<Upload, ApiError> {
        if blob.workspace() != &self.upload.workspace
            || blob.object_id() != self.upload.object_id
            || blob.content().version != self.upload.version
        {
            return Err(ApiError::Internal);
        }
        let mut uploads = self.registry.0.lock().map_err(|_| ApiError::Unavailable)?;
        let entry = uploads
            .get_mut(&self.upload.version)
            .ok_or(ApiError::NotFound)?;
        if entry.deadline <= Instant::now() {
            return Err(ApiError::NotFound);
        }
        entry.completed = Some(blob);
        entry.busy = false;
        self.finished = true;
        Ok(entry.clone())
    }
}

impl Drop for UploadLease<'_> {
    fn drop(&mut self) {
        if !self.finished
            && let Ok(mut uploads) = self.registry.0.lock()
        {
            uploads.remove(&self.upload.version);
        }
    }
}

pub(crate) async fn authorize(
    storage: &Storage,
    workspace: &WorkspaceId,
    grants: &std::collections::BTreeSet<String>,
    target: &UploadTarget,
) -> Result<(), ApiError> {
    target
        .authorize(&NamespaceRead::new(storage, workspace, grants).await?)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn reservations_are_bounded_scoped_one_shot_and_reclaimed_on_drop_or_expiry()
    -> anyhow::Result<()> {
        let registry = Uploads::default();
        let workspace = WorkspaceId::new("w")?;
        let target = UploadTarget::Create {
            parent_id: ObjectId::generate(),
            name: "file".parse()?,
        };
        let first = registry.create("session", &workspace, target.clone())?;
        assert!(matches!(
            registry.get("other", &workspace, first.version),
            Err(ApiError::NotFound)
        ));
        assert!(matches!(
            registry.get("session", &WorkspaceId::new("other")?, first.version),
            Err(ApiError::NotFound)
        ));
        let lease = registry.claim("session", &workspace, first.version)?;
        assert!(matches!(
            registry.claim("session", &workspace, first.version),
            Err(ApiError::Conflict)
        ));
        drop(lease);
        assert!(matches!(
            registry.get("session", &workspace, first.version),
            Err(ApiError::NotFound)
        ));
        for _ in 0..MAX_UPLOADS {
            registry.create("session", &workspace, target.clone())?;
        }
        assert!(matches!(
            registry.create("session", &workspace, target.clone()),
            Err(ApiError::CapacityExhausted)
        ));
        tokio::time::advance(UPLOAD_TTL).await;
        registry.create("session", &workspace, target)?;
        assert_eq!(
            registry
                .0
                .lock()
                .map_err(|_| anyhow::anyhow!("poisoned"))?
                .len(),
            1
        );
        Ok(())
    }
}
