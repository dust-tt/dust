use std::{sync::Arc, time::Duration};

use anyhow::{Context, Result, ensure};
use clap::Args;
use futures::{Stream, StreamExt};
use slatedb::{
    bytes::{Bytes, BytesMut},
    object_store::{
        CopyMode, CopyOptions, MultipartUpload, ObjectStore, ObjectStoreExt, PutMode, path::Path,
    },
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use super::WorkspaceStorage;
use crate::model::{ContentVersionId, FileContent, ObjectId, WorkspaceId};

pub const UPLOAD_PART_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_INPUT_CHUNK_BYTES: usize = 1024 * 1024;
pub const MAX_FILE_BYTES: u64 = 10_000 * UPLOAD_PART_BYTES as u64;
// One part, one incoming frame, and headroom for bounded multipart bookkeeping.
const TRANSFER_MEMORY_MIB: usize = 12;
const MAX_WAITING_TRANSFERS: usize = 16;
const INPUT_IDLE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Args, Clone, Debug)]
pub struct UploadConfig {
    /// Shared upload/read/write-body buffer budget (MiB); excludes HTTP/TLS buffers and SlateDB.
    #[arg(long, env = "DFS_UPLOAD_MEMORY_MIB", default_value_t = 64)]
    pub upload_memory_mib: usize,

    /// Maximum simultaneous blob transfers, further limited by the memory budget.
    #[arg(long, env = "DFS_UPLOAD_CONCURRENCY", default_value_t = 4)]
    pub upload_concurrency: usize,
}

impl Default for UploadConfig {
    fn default() -> Self {
        Self {
            upload_memory_mib: 64,
            upload_concurrency: 4,
        }
    }
}

impl UploadConfig {
    pub(super) fn budget(&self) -> Result<TransferBudget> {
        let slots = self
            .upload_concurrency
            .min(self.upload_memory_mib / TRANSFER_MEMORY_MIB);
        ensure!(
            slots > 0 && slots <= Semaphore::MAX_PERMITS - MAX_WAITING_TRANSFERS,
            "upload budget must allow at least one 12 MiB transfer"
        );
        Ok(TransferBudget {
            active: Arc::new(Semaphore::new(slots)),
            admitted: Arc::new(Semaphore::new(slots + MAX_WAITING_TRANSFERS)),
        })
    }
}

pub(super) struct TransferBudget {
    active: Arc<Semaphore>,
    admitted: Arc<Semaphore>,
}

pub(crate) struct TransferLease {
    _admitted: OwnedSemaphorePermit,
    _active: OwnedSemaphorePermit,
}

impl TransferBudget {
    pub(super) async fn acquire(&self) -> Result<TransferLease, UploadError> {
        let admitted = self
            .admitted
            .clone()
            .try_acquire_owned()
            .map_err(|_| UploadError::Capacity)?;
        let active = self
            .active
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| UploadError::Capacity)?;
        Ok(TransferLease {
            _admitted: admitted,
            _active: active,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum UploadError {
    #[error("upload capacity exhausted")]
    Capacity,
    #[error("invalid or interrupted upload body")]
    Input,
    #[error("upload backend unavailable")]
    Backend(#[from] anyhow::Error),
}

/// Proof of a completed immutable upload, constructed only by this storage instance.
#[derive(Clone, Debug)]
pub struct UploadedBlob {
    workspace: WorkspaceId,
    object_id: ObjectId,
    content: FileContent,
    origin: Arc<dyn ObjectStore>,
    pub(super) local: Option<Arc<super::cache::LocalVersion>>,
    persisted: Arc<std::sync::atomic::AtomicBool>,
}

impl UploadedBlob {
    pub(super) fn object_key(&self) -> Result<Vec<u8>> {
        Ok(super::keys::Keyspace::new(self.workspace.clone())?.object(self.object_id))
    }

    pub(super) fn is_referenced_by(&self, value: &[u8]) -> Result<bool> {
        let object = super::codec::decode_object(value, &self.workspace, self.object_id)?;
        Ok(object.kind == crate::model::ObjectKind::File(self.content.clone()))
    }

    pub fn workspace(&self) -> &WorkspaceId {
        &self.workspace
    }
    pub fn object_id(&self) -> ObjectId {
        self.object_id
    }
    pub fn content(&self) -> &FileContent {
        &self.content
    }

    pub(super) fn matches(&self, scoped: &WorkspaceStorage<'_>, content: &FileContent) -> bool {
        self.workspace == scoped.keys.workspace
            && self.content == *content
            && Arc::ptr_eq(&self.origin, &scoped.storage.blobs)
    }
}

impl WorkspaceStorage<'_> {
    /**
     * @cc [owner:spolu,label:backend] immutable-streamed-upload
     * Uploads MUST NOT publish metadata. Return an internal descriptor only after the complete
     * measured body exists in local staging or at its workspace/object/version key. Remote writes
     * MUST be create-only;
     * multipart uploads MUST use a fresh temporary key and a conditional copy. Never overwrite or
     * delete an immutable version on failure, including ambiguous completion outcomes.
     */
    /**
     * @cc [owner:spolu,label:performance] shared-transfer-budget
     * Foreground transfers MUST acquire the shared budget before polling input or allocating a
     * part.
     * At most one 8 MiB part and one 1 MiB input frame may be retained per active transfer. Await
     * each
     * part before reading more input; never queue file bytes between tasks. Bound admitted waiters,
     * multipart count, and input idle time. Oversized producer frames MUST fail before copying.
     * Background persistence MUST have separate
     * bounded concurrency so remote uploads cannot occupy foreground transfer slots.
     */
    pub async fn upload_blob<S>(
        &self,
        object_id: ObjectId,
        version: ContentVersionId,
        input: S,
    ) -> Result<UploadedBlob, UploadError>
    where
        S: Stream<Item = Result<Bytes>> + Send,
    {
        let _lease = self.storage.transfers.acquire().await?;
        if let Some(cache) = &self.storage.cache {
            let local = cache.staging.stage(input).await?;
            return self
                .staged_descriptor(object_id, version, local)
                .map_err(UploadError::Backend);
        }
        let final_path = self.blob_path(object_id, version);
        let temporary = Path::from(format!(
            "staging/{}/{}",
            hex::encode(self.keys.workspace.as_str().as_bytes()),
            ContentVersionId::generate()
        ));
        let mut multipart: Option<Box<dyn MultipartUpload>> = None;
        let result = transfer(
            &self.storage.blobs,
            input,
            &final_path,
            &temporary,
            &mut multipart,
        )
        .await;
        if let Some(mut upload) = multipart {
            if result.is_err() {
                // Cleanup is best effort; a lost completion response may have created the object.
                let _ = tokio::time::timeout(Duration::from_secs(10), upload.abort()).await;
            }
            let _ = tokio::time::timeout(
                Duration::from_secs(10),
                self.storage.blobs.delete(&temporary),
            )
            .await;
        }
        let size_bytes = result?;
        Ok(UploadedBlob {
            workspace: self.keys.workspace.clone(),
            object_id,
            content: FileContent {
                version,
                size_bytes,
            },
            origin: self.storage.blobs.clone(),
            local: None,
            persisted: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        })
    }
}

async fn transfer<S>(
    blobs: &Arc<dyn ObjectStore>,
    input: S,
    final_path: &Path,
    temporary: &Path,
    multipart: &mut Option<Box<dyn MultipartUpload>>,
) -> Result<u64, UploadError>
where
    S: Stream<Item = Result<Bytes>> + Send,
{
    futures::pin_mut!(input);
    let mut part = BytesMut::with_capacity(UPLOAD_PART_BYTES);
    let mut size = 0_u64;
    loop {
        let next = tokio::time::timeout(INPUT_IDLE_TIMEOUT, input.next())
            .await
            .map_err(|_| UploadError::Input)?;
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|_| UploadError::Input)?;
        if chunk.len() > MAX_INPUT_CHUNK_BYTES {
            return Err(UploadError::Input);
        }
        size = size
            .checked_add(chunk.len() as u64)
            .ok_or(UploadError::Capacity)?;
        if size > MAX_FILE_BYTES {
            return Err(UploadError::Capacity);
        }
        let mut remaining = chunk.as_ref();
        while !remaining.is_empty() {
            let take = remaining.len().min(UPLOAD_PART_BYTES - part.len());
            part.extend_from_slice(&remaining[..take]);
            remaining = &remaining[take..];
            if part.len() == UPLOAD_PART_BYTES {
                if multipart.is_none() {
                    *multipart = Some(
                        blobs
                            .put_multipart(temporary)
                            .await
                            .context("start temporary multipart upload")?,
                    );
                }
                if let Some(upload) = multipart {
                    upload
                        .put_part(part.freeze().into())
                        .await
                        .context("upload part")?;
                }
                part = BytesMut::with_capacity(UPLOAD_PART_BYTES);
            }
        }
    }
    if let Some(upload) = multipart {
        if !part.is_empty() {
            upload
                .put_part(part.freeze().into())
                .await
                .context("upload last part")?;
        }
        upload
            .complete()
            .await
            .context("complete temporary multipart upload")?;
        blobs
            .copy_opts(
                temporary,
                final_path,
                CopyOptions::new().with_mode(CopyMode::Create),
            )
            .await
            .context("create immutable content from completed upload")?;
    } else {
        // Small and empty files need only one create-only request.
        blobs
            .put_opts(final_path, part.freeze().into(), PutMode::Create.into())
            .await
            .context("create immutable content")?;
    }
    Ok(size)
}

#[cfg(test)]
pub(super) mod tests;

impl WorkspaceStorage<'_> {
    pub(crate) fn staged_descriptor(
        &self,
        object_id: ObjectId,
        version: ContentVersionId,
        local: Arc<super::cache::LocalVersion>,
    ) -> Result<UploadedBlob> {
        let cache = self.storage.cache.as_ref().context("cache disabled")?;
        let local = cache
            .staging
            .register(self.blob_path(object_id, version), local)?;
        Ok(UploadedBlob {
            workspace: self.keys.workspace.clone(),
            object_id,
            content: FileContent {
                version,
                size_bytes: local.size,
            },
            origin: self.storage.blobs.clone(),
            local: Some(local),
            persisted: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
    }
}

impl UploadedBlob {
    pub(super) async fn persist(&self, blobs: &Arc<dyn ObjectStore>) -> Result<()> {
        use std::sync::atomic::Ordering;
        if self.persisted.load(Ordering::Acquire) {
            return Ok(());
        }
        let local = self.local.as_ref().context("missing staged bytes")?;
        let final_path = Path::from(format!(
            "v1/{}/{}/{}",
            hex::encode(self.workspace.as_str().as_bytes()),
            self.object_id,
            self.content.version
        ));
        let temporary = Path::from(format!(
            "staging/{}/{}",
            hex::encode(self.workspace.as_str().as_bytes()),
            ContentVersionId::generate()
        ));
        let mut multipart = None;
        let result = transfer(
            blobs,
            local.stream(0, local.size),
            &final_path,
            &temporary,
            &mut multipart,
        )
        .await;
        if let Some(mut upload) = multipart {
            if result.is_err() {
                let _ = tokio::time::timeout(Duration::from_secs(10), upload.abort()).await;
            }
            let _ = tokio::time::timeout(Duration::from_secs(10), blobs.delete(&temporary)).await;
        }
        if let Err(error) = result {
            // An earlier create may have completed despite a lost response. UUID keys never repeat.
            match blobs.head(&final_path).await {
                Ok(meta) if meta.size == self.content.size_bytes => {}
                _ => return Err(error.into()),
            }
        }
        self.persisted.store(true, Ordering::Release);
        Ok(())
    }
}
