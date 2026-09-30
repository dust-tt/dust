use std::collections::{BTreeMap, BTreeSet};

use super::NamespaceRead;
use crate::{
    api::ApiError,
    model::{
        EntryName, MetadataRevision, MimeType, ObjectId, ObjectKind, ObjectMetadata, ParentLink,
        PosixAttributes, Timestamp, WorkspaceId, Xattrs,
    },
    storage::{MetadataMutation, Storage},
};

pub(crate) struct CreateDirectory {
    pub parent_id: ObjectId,
    pub name: EntryName,
    pub mime_type: MimeType,
    pub xattrs: Xattrs,
    pub mode: u16,
}

pub(crate) struct MetadataUpdate {
    pub object_id: ObjectId,
    pub expected_metadata_revision: u64,
    pub mime_type: Option<MimeType>,
    pub xattrs: BTreeMap<String, Option<Vec<u8>>>,
    pub mode: Option<u16>,
    pub atime: Option<Timestamp>,
    pub mtime: Option<Timestamp>,
}

/**
 * @cc [owner:spolu,label:security;backend] authorized-directory-creation
 * Creation MUST authorize the parent and check its kind and name vacancy under the publication
 * guard. Publish the fresh object's parent link, child entry, parent revision/times, and event in
 * one durable batch. New children MUST inherit access without attaching session grants.
 */
pub(crate) async fn mkdir(
    storage: &Storage,
    workspace: &WorkspaceId,
    grants: &BTreeSet<String>,
    request: CreateDirectory,
) -> Result<ObjectMetadata, ApiError> {
    validate_mode(request.mode)?;
    validate_xattrs(&request.xattrs)?;
    let scoped = storage
        .workspace(workspace)
        .map_err(|_| ApiError::Unavailable)?;
    let writer = scoped.begin_metadata_write().await;
    let read = NamespaceRead {
        view: writer
            .read_view()
            .await
            .map_err(|_| ApiError::Unavailable)?,
        grants,
    };
    let parent = read.directory(request.parent_id).await?;
    if read
        .view
        .child(parent.id, &request.name)
        .await
        .map_err(|_| ApiError::Unavailable)?
        .is_some()
    {
        return Err(ApiError::AlreadyExists);
    }
    let id = ObjectId::generate();
    if read
        .view
        .object(id)
        .await
        .map_err(|_| ApiError::Unavailable)?
        .is_some()
    {
        return Err(ApiError::Conflict);
    }
    let now = Timestamp::now().map_err(|_| ApiError::Unavailable)?;
    let object = ObjectMetadata {
        workspace_id: workspace.clone(),
        id,
        parent: Some(ParentLink {
            parent_id: parent.id,
            name: request.name,
        }),
        kind: ObjectKind::Directory,
        mime_type: request.mime_type,
        xattrs: request.xattrs,
        metadata_revision: MetadataRevision::INITIAL,
        posix: PosixAttributes {
            mode: request.mode,
            ..PosixAttributes::new(true, now)
        },
    };
    let parent = ObjectMetadata {
        metadata_revision: parent
            .metadata_revision
            .next()
            .map_err(|_| ApiError::CapacityExhausted)?,
        posix: PosixAttributes {
            mtime: now,
            ctime: now,
            ..parent.posix
        },
        ..parent
    };
    writer
        .commit(vec![
            MetadataMutation::PutObject(parent.into()),
            MetadataMutation::PutChild(object.directory_entry().ok_or(ApiError::Internal)?),
            MetadataMutation::PutObject(object.clone().into()),
        ])
        .await
        .map_err(|_| ApiError::Unavailable)?;
    Ok(object)
}

/**
 * @cc [owner:spolu,label:security;backend] authorized-metadata-update
 * Updates MUST authorize the current object and compare the required revision under the same
 * publication guard. Preserve identity, parent, content, and grants; modify only supplied fields,
 * set server ctime, and advance the revision atomically with the event before acknowledging.
 * Xattr patches MUST preserve omitted keys, remove null entries, and preserve empty byte values.
 */
pub(crate) async fn update(
    storage: &Storage,
    workspace: &WorkspaceId,
    grants: &BTreeSet<String>,
    request: MetadataUpdate,
) -> Result<ObjectMetadata, ApiError> {
    if request.mime_type.is_none()
        && request.xattrs.is_empty()
        && request.mode.is_none()
        && request.atime.is_none()
        && request.mtime.is_none()
    {
        return Err(ApiError::InvalidInput);
    }
    if let Some(mode) = request.mode {
        validate_mode(mode)?;
    }
    for time in [request.atime, request.mtime].into_iter().flatten() {
        time.validate().map_err(|_| ApiError::InvalidInput)?;
    }
    if request
        .xattrs
        .keys()
        .any(|key| key.is_empty() || key.contains('\0'))
    {
        return Err(ApiError::InvalidInput);
    }
    let scoped = storage
        .workspace(workspace)
        .map_err(|_| ApiError::Unavailable)?;
    let writer = scoped.begin_metadata_write().await;
    let read = NamespaceRead {
        view: writer
            .read_view()
            .await
            .map_err(|_| ApiError::Unavailable)?,
        grants,
    };
    let mut object = read.stat(request.object_id).await?;
    if object.metadata_revision.get() != request.expected_metadata_revision {
        return Err(ApiError::Conflict);
    }
    if let Some(mime_type) = request.mime_type {
        object.mime_type = mime_type;
    }
    for (key, value) in request.xattrs {
        match value {
            Some(value) => {
                object.xattrs.insert(key, value);
            }
            None => {
                object.xattrs.remove(&key);
            }
        }
    }
    validate_xattrs(&object.xattrs)?;
    if let Some(mode) = request.mode {
        object.posix.mode = mode;
    }
    if let Some(atime) = request.atime {
        object.posix.atime = atime;
    }
    if let Some(mtime) = request.mtime {
        object.posix.mtime = mtime;
    }
    object.posix.ctime = Timestamp::now().map_err(|_| ApiError::Unavailable)?;
    object.metadata_revision = object
        .metadata_revision
        .next()
        .map_err(|_| ApiError::CapacityExhausted)?;
    writer
        .commit(vec![MetadataMutation::PutObject(object.clone().into())])
        .await
        .map_err(|_| ApiError::Unavailable)?;
    Ok(object)
}

fn validate_mode(mode: u16) -> Result<(), ApiError> {
    if mode > 0o777 {
        return Err(ApiError::Unsupported);
    }
    Ok(())
}

/**
 * @cc [owner:spolu,label:performance] bounded-object-xattrs
 * Metadata APIs MUST bound the resulting object's total UTF-8 key bytes plus decoded value bytes
 * to 32 KiB, including unchanged keys. Reject invalid keys or excess size before publication.
 */
fn validate_xattrs(xattrs: &Xattrs) -> Result<(), ApiError> {
    if xattrs
        .keys()
        .any(|key| key.is_empty() || key.contains('\0'))
    {
        return Err(ApiError::InvalidInput);
    }
    let size = xattrs
        .iter()
        .try_fold(0_usize, |size, (key, value)| {
            size.checked_add(key.len())?.checked_add(value.len())
        })
        .ok_or(ApiError::CapacityExhausted)?;
    if size > 32 * 1024 {
        return Err(ApiError::CapacityExhausted);
    }
    Ok(())
}
