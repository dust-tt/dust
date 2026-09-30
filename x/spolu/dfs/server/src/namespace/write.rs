use std::collections::{BTreeMap, BTreeSet};

use super::{NamespaceRead, mutate};
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
 * Creation MUST authorize the parent and check its kind and name vacancy in one snapshot validated
 * at publication. Authorization failures MUST publish nothing and MUST NOT reveal name collisions.
 * Publish the fresh object, parent link, child entry, parent times/revision, and event in one durable
 * batch. Children MUST inherit access without copying grants.
 */
pub(crate) async fn mkdir(
    storage: &Storage,
    workspace: &WorkspaceId,
    grants: &BTreeSet<String>,
    request: CreateDirectory,
) -> Result<ObjectMetadata, ApiError> {
    validate_mode(request.mode)?;
    validate_xattrs(&request.xattrs)?;
    let request = &request;
    mutate(storage, workspace, |view| async move {
        let read = NamespaceRead { view, grants };
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
                name: request.name.clone(),
            }),
            kind: ObjectKind::Directory,
            mime_type: request.mime_type.clone(),
            xattrs: request.xattrs.clone(),
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
        let mutations = vec![
            MetadataMutation::PutObject(parent.into()),
            MetadataMutation::PutChild(object.directory_entry().ok_or(ApiError::Internal)?),
            MetadataMutation::PutObject(object.clone().into()),
        ];
        Ok((object, mutations))
    })
    .await
}

/**
 * @cc [owner:spolu,label:security;backend] authorized-metadata-update
 * Updates MUST authorize the current object and compare the required revision in one snapshot
 * validated at publication. Authorization failures MUST publish nothing and MUST NOT reveal revision
 * conflicts. Preserve identity, parent, content, and grants; modify only supplied fields, set server
 * ctime, and advance the revision atomically with the event before acknowledging.
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
    let request = &request;
    mutate(storage, workspace, |view| async move {
        let read = NamespaceRead { view, grants };
        let mut object = read.stat(request.object_id).await?;
        if object.metadata_revision.get() != request.expected_metadata_revision {
            return Err(ApiError::Conflict);
        }
        if let Some(mime_type) = &request.mime_type {
            object.mime_type = mime_type.clone();
        }
        for (key, value) in &request.xattrs {
            match value {
                Some(value) => {
                    object.xattrs.insert(key.clone(), value.clone());
                }
                None => {
                    object.xattrs.remove(key);
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
        let mutations = vec![MetadataMutation::PutObject(object.clone().into())];
        Ok((object, mutations))
    })
    .await
}

pub(super) fn validate_mode(mode: u16) -> Result<(), ApiError> {
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
pub(super) fn validate_xattrs(xattrs: &Xattrs) -> Result<(), ApiError> {
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
