use super::{
    NamespaceRead,
    mutation::mutate_content,
    write::{validate_mode, validate_xattrs},
};
use crate::{
    api::{ApiError, Session},
    model::{
        MetadataRevision, MimeType, ObjectId, ObjectKind, ObjectMetadata, ParentLink,
        PosixAttributes, RequestId, Timestamp, Xattrs,
    },
    storage::{MetadataMutation, OperationRecord, Storage, UploadedBlob},
    uploads::UploadTarget,
};

#[derive(Clone)]
pub(crate) struct NewFileAttributes {
    pub mime_type: MimeType,
    pub xattrs: Xattrs,
    pub mode: u16,
}

/**
 * @cc [owner:spolu,label:security;backend] authorized-content-publication
 * After upload, reauthorize the session and current namespace, then check the expected content
 * version or name vacancy in a snapshot validated at publication. Preserve unrelated metadata
 * edits.
 * Persist content metadata, directory changes, event, and the request fingerprint/result in one
 * batch.
 * A replay MUST authorize its current object and match the fingerprint; never publish a second
 * mutation. Acknowledgement, including replay, MUST follow the configured visibility/durability
 * mode. No blob I/O belongs
 * inside snapshot preparation or publication. Callers MUST hold the request and content gates.
 */
pub(crate) async fn publish_content(
    storage: &Storage,
    session: &Session,
    target: &UploadTarget,
    blob: &UploadedBlob,
    request_id: RequestId,
    fingerprint: [u8; 32],
    attributes: Option<&NewFileAttributes>,
) -> Result<OperationRecord, ApiError> {
    if let Some(attributes) = attributes {
        validate_mode(attributes.mode)?;
        validate_xattrs(&attributes.xattrs)?;
    }
    let (record, replay) = mutate_content(
        storage,
        &session.workspace,
        std::slice::from_ref(blob),
        || session.check_active(),
        |view| async move {
            let read = NamespaceRead {
                view,
                grants: &session.grants,
            };
            if let Some(record) = read
                .view
                .operation(request_id)
                .await
                .map_err(|_| ApiError::Unavailable)?
            {
                read.stat(ObjectId::from_bytes(record.object_id)).await?;
                if record.fingerprint != fingerprint {
                    return Err(ApiError::Conflict);
                }
                return Ok(((record, true), Vec::new()));
            }
            target.authorize(&read).await?;
            let now = Timestamp::now().map_err(|_| ApiError::Unavailable)?;
            let mut mutations = Vec::new();
            let object = match target {
                UploadTarget::Create { parent_id, name } => {
                    let attributes = attributes.ok_or(ApiError::InvalidInput)?;
                    if read
                        .view
                        .object(blob.object_id())
                        .await
                        .map_err(|_| ApiError::Unavailable)?
                        .is_some()
                    {
                        return Err(ApiError::Conflict);
                    }
                    let mut parent = read.directory(*parent_id).await?;
                    parent.metadata_revision = parent
                        .metadata_revision
                        .next()
                        .map_err(|_| ApiError::CapacityExhausted)?;
                    parent.posix.mtime = now;
                    parent.posix.ctime = now;
                    let object = ObjectMetadata {
                        workspace_id: session.workspace.clone(),
                        id: blob.object_id(),
                        parent: Some(ParentLink {
                            parent_id: *parent_id,
                            name: name.clone(),
                        }),
                        kind: ObjectKind::File(blob.content().clone()),
                        mime_type: attributes.mime_type.clone(),
                        xattrs: attributes.xattrs.clone(),
                        metadata_revision: MetadataRevision::INITIAL,
                        posix: PosixAttributes {
                            mode: attributes.mode,
                            ..PosixAttributes::new(false, now)
                        },
                    };
                    mutations.push(MetadataMutation::PutObject(parent.into()));
                    mutations.push(MetadataMutation::PutChild(
                        object.directory_entry().ok_or(ApiError::Internal)?,
                    ));
                    object
                }
                UploadTarget::Replace { object_id, .. } => {
                    if attributes.is_some() || *object_id != blob.object_id() {
                        return Err(ApiError::InvalidInput);
                    }
                    let mut object = read.stat(*object_id).await?;
                    object.kind = ObjectKind::File(blob.content().clone());
                    object.metadata_revision = object
                        .metadata_revision
                        .next()
                        .map_err(|_| ApiError::CapacityExhausted)?;
                    object.posix.mtime = now;
                    object.posix.ctime = now;
                    object
                }
            };
            let record = OperationRecord {
                object_id: *object.id.as_bytes(),
                fingerprint,
                content_version: *blob.content().version.as_bytes(),
                size_bytes: blob.content().size_bytes,
                metadata_revision: object.metadata_revision.get(),
            };
            mutations.push(MetadataMutation::PutObject(object.into()));
            mutations.push(MetadataMutation::RecordOperation {
                request_id,
                record: record.clone(),
            });
            Ok(((record, false), mutations))
        },
    )
    .await?;
    if replay {
        storage
            .workspace(&session.workspace)
            .map_err(|_| ApiError::Unavailable)?
            .acknowledge()
            .await
            .map_err(|_| ApiError::Unavailable)?;
    }
    Ok(record)
}

pub(crate) async fn operation_status(
    storage: &Storage,
    session: &Session,
    object_id: ObjectId,
    request_id: RequestId,
) -> Result<Option<OperationRecord>, ApiError> {
    session.check_active()?;
    let read = NamespaceRead::new(storage, &session.workspace, &session.grants).await?;
    read.stat(object_id).await?;
    let record = read
        .view
        .operation(request_id)
        .await
        .map_err(|_| ApiError::Unavailable)?;
    if let Some(record) = &record {
        if record.object_id != *object_id.as_bytes() {
            return Err(ApiError::NotFound);
        }
        storage
            .workspace(&session.workspace)
            .map_err(|_| ApiError::Unavailable)?
            .acknowledge()
            .await
            .map_err(|_| ApiError::Unavailable)?;
    }
    Ok(record)
}
