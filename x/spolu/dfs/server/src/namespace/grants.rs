use std::collections::BTreeMap;

use super::mutate;

use crate::{
    api::ApiError,
    model::{MetadataRevision, ObjectId, Timestamp, WorkspaceId},
    storage::{MetadataMutation, Storage},
};

pub(crate) struct GrantPage {
    pub grants: Vec<String>,
    pub metadata_revision: MetadataRevision,
    pub next_after: Option<String>,
}

/**
 * @cc [owner:spolu,label:security] grant-administration-reads
 * Callers MUST authenticate the workspace key before listing grants in that workspace. Return only
 * explicit attachments, the object's revision, and continuation from one snapshot. Page limits MUST
 * be 1..=1000; grants sort by exact UTF-8 bytes, with empty strings valid exclusive cursors.
 */
pub(crate) async fn list_grants(
    storage: &Storage,
    workspace: &WorkspaceId,
    object_id: ObjectId,
    after: Option<&str>,
    limit: usize,
) -> Result<GrantPage, ApiError> {
    if !(1..=1000).contains(&limit) {
        return Err(ApiError::InvalidInput);
    }
    let view = storage
        .workspace(workspace)
        .map_err(|_| ApiError::Unavailable)?
        .read_view()
        .await
        .map_err(|_| ApiError::Unavailable)?;
    let object = view
        .object(object_id)
        .await
        .map_err(|_| ApiError::Unavailable)?
        .ok_or(ApiError::NotFound)?;
    let grants = view
        .grants(object_id, after, limit)
        .await
        .map_err(|_| ApiError::Unavailable)?;
    let mut next_after = None;
    if grants.len() == limit
        && let Some(last) = grants.last()
        && !view
            .grants(object_id, Some(last), 1)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .is_empty()
    {
        next_after = Some(last.clone());
    }
    Ok(GrantPage {
        grants,
        metadata_revision: object.metadata_revision,
        next_after,
    })
}

/**
 * @cc [owner:spolu,label:security;backend] atomic-grant-administration
 * Callers MUST authenticate the workspace key. In one snapshot validated at publication, require
 * an existing object and an exact expected revision. Apply 1..=512 explicit attachment
 * changes, both index directions, the object's next revision/server ctime, and an event as one
 * durable batch. Unspecified explicit attachments and ancestors' attachments MUST remain unchanged.
 * Do not materialize inherited grants or scan all attachments. Session grants MUST NOT confer this
 * authority. A patch MUST NOT cap total attachments per object.
 */
pub(crate) async fn update_grants(
    storage: &Storage,
    workspace: &WorkspaceId,
    object_id: ObjectId,
    expected_metadata_revision: u64,
    grants: BTreeMap<String, bool>,
) -> Result<MetadataRevision, ApiError> {
    if !(1..=512).contains(&grants.len()) {
        return Err(ApiError::InvalidInput);
    }
    let grants = &grants;
    mutate(storage, workspace, |view| async move {
        let mut object = view
            .object(object_id)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::NotFound)?;
        if object.metadata_revision.get() != expected_metadata_revision {
            return Err(ApiError::Conflict);
        }
        object.metadata_revision = object
            .metadata_revision
            .next()
            .map_err(|_| ApiError::CapacityExhausted)?;
        object.posix.ctime = Timestamp::now().map_err(|_| ApiError::Unavailable)?;
        let revision = object.metadata_revision;
        let mut mutations: Vec<_> = grants
            .iter()
            .map(|(grant, attached)| MetadataMutation::SetGrant {
                object_id,
                grant: grant.clone(),
                attached: *attached,
            })
            .collect();
        mutations.push(MetadataMutation::PutObject(object.into()));
        Ok((revision, mutations))
    })
    .await
}
