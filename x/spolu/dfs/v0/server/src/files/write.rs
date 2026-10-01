use std::time::Duration;

use anyhow::Result;
use futures::{StreamExt, TryStreamExt, stream::BoxStream};
use serde::Serialize;
use sha2::{Digest, Sha256};
use slatedb::bytes::Bytes;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio_util::io::ReaderStream;

use super::{Files, Handle, io_error};
use crate::{
    api::{ApiError, Session},
    model::{ContentVersionId, FileContent, ObjectId, ObjectKind, RequestId},
    namespace::{self, NamespaceRead},
    storage::{MAX_FILE_BYTES, OperationRecord, Storage, UploadError},
    uploads::UploadTarget,
};

#[derive(Clone, Copy, Serialize)]
pub(crate) enum WriteKind {
    Write { offset: u64, length: u64 },
    Truncate { size: u64 },
}

pub(crate) struct WriteRequest {
    pub request_id: RequestId,
    pub sequence: u64,
    pub kind: WriteKind,
}

pub(crate) fn fingerprint(value: impl Serialize) -> Result<[u8; 32], ApiError> {
    Ok(Sha256::digest(postcard::to_stdvec(&value).map_err(|_| ApiError::Internal)?).into())
}

pub(crate) async fn replay(
    storage: &Storage,
    session: &Session,
    request_id: RequestId,
    hash: [u8; 32],
) -> Result<Option<OperationRecord>, ApiError> {
    session.check_active()?;
    let scoped = storage
        .workspace(&session.workspace)
        .map_err(|_| ApiError::Unavailable)?;
    let record = scoped
        .read_view()
        .await
        .map_err(|_| ApiError::Unavailable)?
        .operation(request_id)
        .await
        .map_err(|_| ApiError::Unavailable)?;
    if let Some(record) = &record {
        NamespaceRead::new(storage, &session.workspace, &session.grants)
            .await?
            .stat(ObjectId::from_bytes(record.object_id))
            .await?;
        if record.fingerprint != hash {
            return Err(ApiError::Conflict);
        }
        scoped
            .acknowledge()
            .await
            .map_err(|_| ApiError::Unavailable)?;
    }
    Ok(record)
}

impl Files {
    /**
     * @cc [owner:spolu,label:backend;concurrency] serialized-file-edit
     * Serialize each handle's mutation sequence and each object's content mutation through the
     * configured acknowledgement, without holding namespace publication locks across I/O. Append
     * MUST select EOF after acquiring the content gate. Use bounded immutable pages in cached mode
     * or streamed scratch assembly and upload in synchronous mode. Never modify a published version.
     * Recheck grants and the base version at publication; never overwrite unrelated metadata edits.
     * Record failures before awaits so cancellation cannot make fsync hide an unresolved mutation.
     */
    pub async fn edit(
        &self,
        storage: &Storage,
        handle: &Handle,
        request: WriteRequest,
        input: BoxStream<'static, Result<Bytes>>,
    ) -> Result<OperationRecord, ApiError> {
        if !handle.mode.write {
            return Err(ApiError::Forbidden);
        }
        let mut progress = handle.progress.lock().await;
        handle.session.check_active()?;
        progress.begin(request.sequence, request.request_id)?;
        let result = self.edit_inner(storage, handle, &request, input).await;
        progress.failure = result.as_ref().err().copied();
        result
    }

    async fn edit_inner(
        &self,
        storage: &Storage,
        handle: &Handle,
        request: &WriteRequest,
        input: BoxStream<'static, Result<Bytes>>,
    ) -> Result<OperationRecord, ApiError> {
        let session = &handle.session;
        let scoped = storage
            .workspace(&session.workspace)
            .map_err(|_| ApiError::Unavailable)?;
        let _request = scoped
            .lock_request(request.request_id)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let _writer = scoped
            .lock_content(handle.object_id)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        session.check_active()?;
        let read = NamespaceRead::new(storage, &session.workspace, &session.grants).await?;
        let object = read.stat(handle.object_id).await?;
        let ObjectKind::File(base) = object.kind else {
            return Err(ApiError::IsDirectory);
        };
        let previous = scoped
            .read_view()
            .await
            .map_err(|_| ApiError::Unavailable)?
            .operation(request.request_id)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let append = handle.mode.append && matches!(request.kind, WriteKind::Write { .. });
        let canonical_kind = match request.kind {
            WriteKind::Write { offset, length } => WriteKind::Write {
                offset: if append { 0 } else { offset },
                length,
            },
            other => other,
        };
        let length = match request.kind {
            WriteKind::Write { length, .. } => length,
            WriteKind::Truncate { .. } => 0,
        };
        if previous.is_some() {
            let hash = tokio::time::timeout(
                Duration::from_secs(15 * 60),
                read_input(storage, input, None, length),
            )
            .await
            .map_err(|_| ApiError::Unavailable)??;
            let hash = fingerprint((
                "edit",
                handle.object_id.as_bytes(),
                canonical_kind,
                append,
                hash,
            ))?;
            return replay(storage, session, request.request_id, hash)
                .await?
                .ok_or(ApiError::Unavailable);
        }
        let (offset, size) = match request.kind {
            WriteKind::Write { length: 0, .. } => (0, base.size_bytes),
            WriteKind::Write { offset, length } => {
                let offset = if append { base.size_bytes } else { offset };
                (
                    offset,
                    base.size_bytes.max(
                        offset
                            .checked_add(length)
                            .ok_or(ApiError::CapacityExhausted)?,
                    ),
                )
            }
            WriteKind::Truncate { size } => (0, size),
        };
        if size > MAX_FILE_BYTES {
            return Err(ApiError::CapacityExhausted);
        }
        let prepare = async {
            if storage.cached() {
                if size > self.scratch.limit() {
                    return Err(ApiError::CapacityExhausted);
                }
                let (blob, hash) = scoped
                    .edit_staged(handle.object_id, &base, offset, length, size, input)
                    .await
                    .map_err(upload_error)?;
                let hash = fingerprint((
                    "edit",
                    handle.object_id.as_bytes(),
                    canonical_kind,
                    append,
                    hash,
                ))?;
                return Ok((blob, hash));
            }
            let mut scratch = self.scratch.create(size).await?;
            self.copy_base(&scoped, handle.object_id, &base, size, &mut scratch.file)
                .await?;
            scratch
                .file
                .seek(std::io::SeekFrom::Start(offset))
                .await
                .map_err(io_error)?;
            let hash = read_input(storage, input, Some(&mut scratch.file), length).await?;
            scratch.file.flush().await.map_err(io_error)?;
            scratch.file.rewind().await.map_err(io_error)?;
            let hash = fingerprint((
                "edit",
                handle.object_id.as_bytes(),
                canonical_kind,
                append,
                hash,
            ))?;
            let bytes = ReaderStream::with_capacity(&mut scratch.file, 64 * 1024)
                .map_err(anyhow::Error::from);
            let blob = scoped
                .upload_blob(handle.object_id, ContentVersionId::generate(), bytes)
                .await
                .map_err(upload_error)?;
            Ok::<_, ApiError>((blob, hash))
        };
        let (blob, hash) = tokio::time::timeout(Duration::from_secs(15 * 60), prepare)
            .await
            .map_err(|_| ApiError::Unavailable)??;
        drop(read);
        namespace::publish_content(
            storage,
            session,
            &UploadTarget::Replace {
                object_id: handle.object_id,
                expected_content_version: base.version,
            },
            &blob,
            request.request_id,
            hash,
            None,
        )
        .await
    }

    async fn copy_base(
        &self,
        scoped: &crate::storage::WorkspaceStorage<'_>,
        object_id: ObjectId,
        base: &FileContent,
        size: u64,
        file: &mut tokio::fs::File,
    ) -> Result<(), ApiError> {
        let mut read = scoped
            .read_blob_stream(object_id, base, 0, size)
            .await
            .map_err(upload_error)?;
        while let Some(bytes) = read.stream.next().await {
            file.write_all(&bytes.map_err(|_| ApiError::Unavailable)?)
                .await
                .map_err(io_error)?;
        }
        Ok(())
    }
}

async fn read_input(
    storage: &Storage,
    mut input: BoxStream<'static, Result<Bytes>>,
    mut file: Option<&mut tokio::fs::File>,
    length: u64,
) -> Result<[u8; 32], ApiError> {
    let _budget = storage.reserve_transfer().await.map_err(upload_error)?;
    let mut hash = Sha256::new();
    let mut written = 0_u64;
    loop {
        let next = tokio::time::timeout(Duration::from_secs(30), input.next())
            .await
            .map_err(|_| ApiError::InvalidInput)?;
        let Some(bytes) = next else { break };
        let bytes = bytes.map_err(|_| ApiError::InvalidInput)?;
        if bytes.len() > 1024 * 1024 || bytes.len() as u64 > length.saturating_sub(written) {
            return Err(ApiError::InvalidInput);
        }
        hash.update(&bytes);
        if let Some(file) = &mut file {
            file.write_all(&bytes).await.map_err(io_error)?;
        }
        written += bytes.len() as u64;
    }
    if written != length {
        return Err(ApiError::InvalidInput);
    }
    Ok(hash.finalize().into())
}

pub(crate) fn upload_error(error: UploadError) -> ApiError {
    match error {
        UploadError::Capacity => ApiError::CapacityExhausted,
        UploadError::Input => ApiError::InvalidInput,
        UploadError::Backend(_) => ApiError::Unavailable,
    }
}
