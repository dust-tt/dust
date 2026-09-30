use std::collections::{BTreeSet, HashSet};

use super::{NamespaceRead, checked_child, mutate};
use crate::{
    api::ApiError,
    model::{EntryName, ObjectId, ObjectKind, ObjectMetadata, ParentLink, Timestamp, WorkspaceId},
    storage::{MetadataMutation, ReadView, Storage},
};

pub(crate) struct RenameObject {
    pub object_id: ObjectId,
    pub expected_metadata_revision: u64,
    pub parent_id: ObjectId,
    pub name: EntryName,
    pub replace: bool,
}

pub(crate) struct RemoveObject {
    pub object_id: ObjectId,
    pub expected_metadata_revision: u64,
}

pub(crate) enum RemovalKind {
    File,
    Directory,
}

/**
 * @cc [owner:spolu,label:security;backend] atomic-authorized-rename
 * Authorize the source, its current parent, and destination before revision/collision checks in
 * one snapshot validated at publication. Reject roots and directory cycles.
 * Preserve the source ID, content, and explicit grants; atomically update its parent/name, revision,
 * ctime, both child entries, parent revisions/mtime/ctime, and event. Do not rewrite descendants.
 * Replacement MUST be opt-in, file-for-file or directory-for-empty-directory only, removing the
 * replaced object's metadata and both grant indexes. Same-parent/name is a no-op after revision
 * validation. Retain all blobs; release the guard before awaiting batch durability.
 */
pub(crate) async fn rename(
    storage: &Storage,
    workspace: &WorkspaceId,
    grants: &BTreeSet<String>,
    request: RenameObject,
) -> Result<ObjectMetadata, ApiError> {
    let request = &request;
    mutate(storage, workspace, |view| async move {
        let read = NamespaceRead { view, grants };
        let (object, source_parent, link) = source(&read, request.object_id).await?;
        let destination = read.directory(request.parent_id).await?;
        if object.metadata_revision.get() != request.expected_metadata_revision {
            return Err(ApiError::Conflict);
        }
        if link.parent_id == destination.id && link.name == request.name {
            return Ok((object, Vec::new()));
        }
        if object.kind == ObjectKind::Directory {
            check_move_ancestry(&read.view, object.id, &destination).await?;
        }
        let mut mutations = Vec::new();
        if let Some(id) = read
            .view
            .child(destination.id, &request.name)
            .await
            .map_err(|_| ApiError::Unavailable)?
        {
            if !request.replace {
                return Err(ApiError::AlreadyExists);
            }
            let replaced = read
                .view
                .object(id)
                .await
                .map_err(|_| ApiError::Unavailable)?
                .ok_or(ApiError::Unavailable)?;
            checked_child(destination.id, &request.name, &replaced)?;
            if replaced.id == object.id {
                return Err(ApiError::Unavailable);
            }
            match (&object.kind, &replaced.kind) {
                (ObjectKind::File(_), ObjectKind::Directory) => return Err(ApiError::IsDirectory),
                (ObjectKind::Directory, ObjectKind::File(_)) => return Err(ApiError::NotDirectory),
                (ObjectKind::Directory, ObjectKind::Directory) => {
                    require_empty(&read.view, replaced.id).await?;
                }
                (ObjectKind::File(_), ObjectKind::File(_)) => {}
            }
            mutations.extend(deletion_mutations(&read.view, replaced.id).await?);
        }
        let now = Timestamp::now().map_err(|_| ApiError::Unavailable)?;
        let moved = ObjectMetadata {
            parent: Some(ParentLink {
                parent_id: destination.id,
                name: request.name.clone(),
            }),
            metadata_revision: object
                .metadata_revision
                .next()
                .map_err(|_| ApiError::CapacityExhausted)?,
            posix: crate::model::PosixAttributes {
                ctime: now,
                ..object.posix
            },
            ..object
        };
        mutations.extend([
            MetadataMutation::DeleteChild {
                parent_id: link.parent_id,
                name: link.name,
            },
            MetadataMutation::PutChild(moved.directory_entry().ok_or(ApiError::Internal)?),
            MetadataMutation::PutObject(moved.clone().into()),
            MetadataMutation::PutObject(changed_parent(source_parent, now)?.into()),
        ]);
        if destination.id != link.parent_id {
            mutations.push(MetadataMutation::PutObject(
                changed_parent(destination, now)?.into(),
            ));
        }
        Ok((moved, mutations))
    })
    .await
}

/**
 * @cc [owner:spolu,label:security;backend] atomic-authorized-removal
 * Authorize the object and current parent in one snapshot validated at publication,
 * before revision/type/emptiness checks. Reject roots, directory unlink, file rmdir, and nonempty
 * rmdir. Delete the object, child entry, and all explicit grants in both indexes atomically with
 * the parent revision/mtime/ctime and event. Failure before submission MUST publish nothing.
 * Retain blobs for snapshots/recovery; success MUST await durability outside the publication guard.
 */
pub(crate) async fn remove(
    storage: &Storage,
    workspace: &WorkspaceId,
    grants: &BTreeSet<String>,
    request: RemoveObject,
    kind: RemovalKind,
) -> Result<(), ApiError> {
    let request = &request;
    let kind = &kind;
    mutate(storage, workspace, |view| async move {
        let read = NamespaceRead { view, grants };
        let (object, parent, link) = source(&read, request.object_id).await?;
        if object.metadata_revision.get() != request.expected_metadata_revision {
            return Err(ApiError::Conflict);
        }
        match (kind, &object.kind) {
            (RemovalKind::File, ObjectKind::Directory) => return Err(ApiError::IsDirectory),
            (RemovalKind::Directory, ObjectKind::File(_)) => return Err(ApiError::NotDirectory),
            (RemovalKind::Directory, ObjectKind::Directory) => {
                require_empty(&read.view, object.id).await?
            }
            (RemovalKind::File, ObjectKind::File(_)) => {}
        }
        let mut mutations = deletion_mutations(&read.view, object.id).await?;
        let now = Timestamp::now().map_err(|_| ApiError::Unavailable)?;
        mutations.extend([
            MetadataMutation::DeleteChild {
                parent_id: link.parent_id,
                name: link.name,
            },
            MetadataMutation::PutObject(changed_parent(parent, now)?.into()),
        ]);
        Ok(((), mutations))
    })
    .await
}

// A direct object grant does not authorize mutations of its private parent's entries.
async fn source(
    read: &NamespaceRead<'_>,
    id: ObjectId,
) -> Result<(ObjectMetadata, ObjectMetadata, ParentLink), ApiError> {
    let object = read.stat(id).await?;
    let link = object.parent.clone().ok_or(ApiError::Forbidden)?;
    let parent = read.directory(link.parent_id).await?;
    if read
        .view
        .child(link.parent_id, &link.name)
        .await
        .map_err(|_| ApiError::Unavailable)?
        != Some(id)
    {
        return Err(ApiError::Unavailable);
    }
    Ok((object, parent, link))
}

/**
 * @cc [owner:spolu,label:backend] acyclic-directory-move
 * Walk the entire destination ancestry in the mutation snapshot, even beyond a matching grant.
 * Reject a destination inside the source subtree as InvalidInput. Encountered cycles, missing
 * records, non-directory ancestors, or inconsistent links MUST fail closed as Unavailable.
 */
async fn check_move_ancestry(
    view: &ReadView,
    source: ObjectId,
    destination: &ObjectMetadata,
) -> Result<(), ApiError> {
    let mut current = destination.clone();
    let mut visited = HashSet::new();
    loop {
        if current.id == source {
            return Err(ApiError::InvalidInput);
        }
        if !visited.insert(current.id) || current.kind != ObjectKind::Directory {
            return Err(ApiError::Unavailable);
        }
        let Some(link) = current.parent else {
            return Ok(());
        };
        if view
            .child(link.parent_id, &link.name)
            .await
            .map_err(|_| ApiError::Unavailable)?
            != Some(current.id)
        {
            return Err(ApiError::Unavailable);
        }
        current = view
            .object(link.parent_id)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::Unavailable)?;
    }
}

async fn require_empty(view: &ReadView, id: ObjectId) -> Result<(), ApiError> {
    if !view
        .children(id, None, 1)
        .await
        .map_err(|_| ApiError::Unavailable)?
        .is_empty()
    {
        return Err(ApiError::NotEmpty);
    }
    Ok(())
}

// Page through all attachments; the 512 session-grant cap is not a per-object grant limit.
async fn deletion_mutations(
    view: &ReadView,
    id: ObjectId,
) -> Result<Vec<MetadataMutation>, ApiError> {
    let mut mutations = vec![MetadataMutation::DeleteObject(id)];
    let mut after = None;
    loop {
        let grants = view
            .grants(id, after.as_deref(), 1000)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let complete = grants.len() < 1000;
        after = grants.last().cloned();
        mutations.extend(grants.into_iter().map(|grant| MetadataMutation::SetGrant {
            object_id: id,
            grant,
            attached: false,
        }));
        if complete {
            return Ok(mutations);
        }
    }
}

fn changed_parent(parent: ObjectMetadata, now: Timestamp) -> Result<ObjectMetadata, ApiError> {
    Ok(ObjectMetadata {
        metadata_revision: parent
            .metadata_revision
            .next()
            .map_err(|_| ApiError::CapacityExhausted)?,
        posix: crate::model::PosixAttributes {
            mtime: now,
            ctime: now,
            ..parent.posix
        },
        ..parent
    })
}
